-- Migration: Align seat limits with subscriptions.seats_total
-- Problem:   rpc_assign_teacher_seat and rpc_teacher_seat_limits used the plan
--            max_teachers while the database enforces seats_total via
--            subscriptions_seats_check. This allowed UI/assignments to exceed
--            seats_total and triggered constraint errors.
-- Fix:       Use an effective limit = LEAST(seats_total, plan.max_teachers),
--            with NULL meaning "unlimited".
-- Scope:     Replace rpc_assign_teacher_seat + rpc_teacher_seat_limits

CREATE OR REPLACE FUNCTION public.rpc_assign_teacher_seat(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_auth_uid uuid := auth.uid();
  v_is_service boolean := public.util_is_service_role();
  v_school uuid := public.util_caller_principal_school();
  v_subscription_id uuid;
  v_limit int;
  v_used int;
  v_target_user_db_id uuid;
  v_assigned_by_db_id uuid;

  v_target_profile_id uuid;
  v_target_auth_user_id uuid;
  v_target_profile_role text;
  v_target_user_role text;
  v_target_profile_school uuid;
  v_target_email text;
  v_target_name text;

  v_caller_profile_id uuid;
  v_caller_auth_resolved uuid;
  v_caller_profile_role text;
  v_caller_profile_school uuid;
  v_caller_email text;
  v_caller_name text;

  v_existing_users_id uuid;
  v_inserted_count int := 0;
  v_needs_teacher_fallback boolean := false;

  v_audit_sub_restore text := COALESCE(v_caller_auth_uid::text, '');
BEGIN
  -- Authorization check
  IF NOT v_is_service AND v_school IS NULL THEN
    RAISE EXCEPTION 'Only principals can assign staff seats';
  END IF;

  -- Service-role path: infer school from target profile
  IF v_is_service AND v_school IS NULL THEN
    SELECT COALESCE(p.preschool_id, p.organization_id)
    INTO v_school
    FROM public.profiles p
    WHERE p.id = target_user_id OR p.auth_user_id = target_user_id
    ORDER BY CASE WHEN p.id = target_user_id THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_school IS NULL THEN
      -- Also try the teachers table for service-role path
      SELECT t.preschool_id
      INTO v_school
      FROM public.teachers t
      WHERE t.id = target_user_id
         OR t.user_id = target_user_id
         OR t.auth_user_id = target_user_id
      LIMIT 1;
    END IF;

    IF v_school IS NULL THEN
      RAISE EXCEPTION 'Cannot infer preschool for target user';
    END IF;
  END IF;

  -- Acquire advisory lock for concurrency control
  IF NOT public.util_acquire_school_lock(v_school) THEN
    RAISE EXCEPTION 'Seat assignment in progress; please retry';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- Resolve target — STEP 1: profiles table lookup
  -- ══════════════════════════════════════════════════════════════════════
  SELECT
    p.id,
    COALESCE(p.auth_user_id, p.id),
    LOWER(COALESCE(p.role, '')),
    COALESCE(p.preschool_id, p.organization_id),
    LOWER(COALESCE(NULLIF(TRIM(p.email), ''), '')),
    COALESCE(
      NULLIF(TRIM(COALESCE(p.full_name, '')), ''),
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      NULLIF(TRIM(COALESCE(p.email, '')), ''),
      'Staff'
    )
  INTO
    v_target_profile_id,
    v_target_auth_user_id,
    v_target_profile_role,
    v_target_profile_school,
    v_target_email,
    v_target_name
  FROM public.profiles p
  WHERE p.id = target_user_id OR p.auth_user_id = target_user_id
  ORDER BY CASE WHEN p.id = target_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  -- ══════════════════════════════════════════════════════════════════════
  -- STEP 2: Decide if we need the teachers-table fallback
  --   Fire when:  (a) no profile found OR
  --               (b) profile found but role is NOT staff OR
  --               (c) profile found but school doesn't match
  -- ══════════════════════════════════════════════════════════════════════
  v_needs_teacher_fallback := (
    v_target_profile_id IS NULL
    OR v_target_profile_role NOT IN ('teacher', 'admin', 'principal_admin')
    OR v_target_profile_school IS DISTINCT FROM v_school
  );

  IF v_needs_teacher_fallback THEN
    -- Preserve any existing profile data; the teachers table can enrich or override.
    DECLARE
      v_fb_profile_id uuid;
      v_fb_auth_user_id uuid;
      v_fb_role text;
      v_fb_school uuid;
      v_fb_email text;
      v_fb_name text;
    BEGIN
      SELECT
        p.id,
        COALESCE(p.auth_user_id, p.id),
        LOWER(COALESCE(p.role, '')),
        COALESCE(p.preschool_id, p.organization_id),
        LOWER(COALESCE(NULLIF(TRIM(p.email), ''), '')),
        COALESCE(
          NULLIF(TRIM(COALESCE(p.full_name, '')), ''),
          NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
          NULLIF(TRIM(COALESCE(p.email, '')), ''),
          'Staff'
        )
      INTO
        v_fb_profile_id,
        v_fb_auth_user_id,
        v_fb_role,
        v_fb_school,
        v_fb_email,
        v_fb_name
      FROM public.teachers t
      JOIN public.profiles p
        ON p.id = t.user_id
        OR p.auth_user_id = t.user_id
        OR p.id = t.auth_user_id
        OR p.auth_user_id = t.auth_user_id
        OR (p.email IS NOT NULL AND t.email IS NOT NULL AND LOWER(p.email) = LOWER(t.email))
      WHERE (t.id = target_user_id OR t.user_id = target_user_id OR t.auth_user_id = target_user_id)
        AND t.preschool_id = v_school
      ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
      LIMIT 1;

      -- If the teachers table confirms this person belongs to the school,
      -- use it and promote their profile to 'teacher' role + correct school.
      IF v_fb_profile_id IS NOT NULL THEN
        v_target_profile_id    := v_fb_profile_id;
        v_target_auth_user_id  := v_fb_auth_user_id;
        v_target_email         := COALESCE(NULLIF(v_fb_email, ''), v_target_email);
        v_target_name          := COALESCE(NULLIF(v_fb_name, ''), v_target_name);
        v_target_profile_school := v_school;

        -- If role is still non-staff, promote to 'teacher'
        IF v_fb_role NOT IN ('teacher', 'admin', 'principal_admin') THEN
          v_target_profile_role := 'teacher';
        ELSE
          v_target_profile_role := v_fb_role;
        END IF;

        -- Auto-correct the profile row so future calls don't hit this path again
        UPDATE public.profiles SET
          role = v_target_profile_role,
          preschool_id = v_school,
          organization_id = v_school,
          updated_at = NOW()
        WHERE id = v_target_profile_id
          AND (
            role NOT IN ('teacher', 'admin', 'principal_admin')
            OR COALESCE(preschool_id, organization_id) IS DISTINCT FROM v_school
          );
      END IF;
    END;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- STEP 3: Final validation
  -- ══════════════════════════════════════════════════════════════════════
  IF v_target_profile_id IS NULL
     OR v_target_profile_role NOT IN ('teacher', 'admin', 'principal_admin')
     OR v_target_profile_school IS DISTINCT FROM v_school THEN
    RAISE EXCEPTION 'Target must be school staff (teacher/admin) in the same preschool';
  END IF;

  IF v_target_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Target staff account is not linked to auth user';
  END IF;

  v_target_user_role := CASE
    WHEN v_target_profile_role IN ('teacher', 'admin', 'principal_admin') THEN v_target_profile_role
    ELSE 'teacher'
  END;

  -- Get active subscription for the school
  SELECT id INTO v_subscription_id
  FROM public.subscriptions
  WHERE school_id = v_school
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'No active subscription found for school';
  END IF;

  -- Map target auth user id -> users.id for subscription_seats.user_id
  -- Prefer canonical auth_user_id row; fallback to profile-id row.
  SELECT id INTO v_target_user_db_id
  FROM public.users
  WHERE auth_user_id = v_target_auth_user_id
     OR id = v_target_profile_id
  ORDER BY CASE
    WHEN auth_user_id = v_target_auth_user_id THEN 0
    WHEN id = v_target_profile_id THEN 1
    ELSE 2
  END,
  updated_at DESC NULLS LAST
  LIMIT 1;

  -- Auto-provision or update users row for target
  IF v_target_user_db_id IS NULL THEN
    IF v_target_email IS NULL OR v_target_email = '' THEN
      v_target_email := format('staff-%s@placeholder.local', replace(v_target_auth_user_id::text, '-', ''));
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.users u
      WHERE LOWER(u.email) = LOWER(v_target_email)
        AND COALESCE(u.auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_target_auth_user_id
        AND u.id <> v_target_profile_id
    ) THEN
      v_target_email := format('staff-%s@placeholder.local', replace(v_target_auth_user_id::text, '-', ''));
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true);

    BEGIN
      INSERT INTO public.users (
        id,
        auth_user_id,
        email,
        name,
        role,
        preschool_id,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        v_target_profile_id,
        v_target_auth_user_id,
        v_target_email,
        COALESCE(v_target_name, 'Staff'),
        v_target_user_role,
        v_school,
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        auth_user_id = EXCLUDED.auth_user_id,
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        preschool_id = EXCLUDED.preschool_id,
        is_active = true,
        updated_at = NOW();
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;

    PERFORM set_config('request.jwt.claim.sub', v_audit_sub_restore, true);

    SELECT id INTO v_target_user_db_id
    FROM public.users
    WHERE auth_user_id = v_target_auth_user_id
       OR id = v_target_profile_id
    ORDER BY CASE
      WHEN auth_user_id = v_target_auth_user_id THEN 0
      WHEN id = v_target_profile_id THEN 1
      ELSE 2
    END,
    updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- If another row already owns this auth_user_id, always use that row.
  SELECT id INTO v_existing_users_id
  FROM public.users
  WHERE auth_user_id = v_target_auth_user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing_users_id IS NOT NULL THEN
    v_target_user_db_id := v_existing_users_id;
  END IF;

  -- Ensure canonical user row has current role + school linkage.
  IF v_target_user_db_id IS NOT NULL THEN
    UPDATE public.users SET
      auth_user_id = v_target_auth_user_id,
      role = v_target_user_role,
      preschool_id = v_school,
      is_active = true,
      updated_at = NOW()
    WHERE id = v_target_user_db_id;
  END IF;

  IF v_target_user_db_id IS NULL THEN
    RAISE EXCEPTION 'Cannot find user record for target user ID';
  END IF;

  -- Map caller auth uid -> users.id for assigned_by
  SELECT u.id INTO v_assigned_by_db_id
  FROM public.users u
  WHERE u.auth_user_id = v_caller_auth_uid OR u.id = v_caller_auth_uid
  LIMIT 1;

  -- Auto-provision missing caller users row to avoid audit FK issues
  IF v_assigned_by_db_id IS NULL AND v_caller_auth_uid IS NOT NULL THEN
    SELECT
      p.id,
      COALESCE(p.auth_user_id, p.id),
      LOWER(COALESCE(p.role, '')),
      COALESCE(p.preschool_id, p.organization_id),
      LOWER(COALESCE(NULLIF(TRIM(p.email), ''), '')),
      COALESCE(
        NULLIF(TRIM(COALESCE(p.full_name, '')), ''),
        NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
        NULLIF(TRIM(COALESCE(p.email, '')), ''),
        'Principal'
      )
    INTO
      v_caller_profile_id,
      v_caller_auth_resolved,
      v_caller_profile_role,
      v_caller_profile_school,
      v_caller_email,
      v_caller_name
    FROM public.profiles p
    WHERE p.id = v_caller_auth_uid OR p.auth_user_id = v_caller_auth_uid
    ORDER BY CASE WHEN p.id = v_caller_auth_uid THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_caller_profile_id IS NOT NULL THEN
      IF v_caller_email IS NULL OR v_caller_email = '' THEN
        v_caller_email := format('staff-%s@placeholder.local', replace(v_caller_auth_resolved::text, '-', ''));
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.users u
        WHERE LOWER(u.email) = LOWER(v_caller_email)
          AND COALESCE(u.auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_caller_auth_resolved
          AND u.id <> COALESCE(v_caller_profile_id, v_caller_auth_resolved)
      ) THEN
        v_caller_email := format('staff-%s@placeholder.local', replace(v_caller_auth_resolved::text, '-', ''));
      END IF;

      PERFORM set_config('request.jwt.claim.sub', '', true);

      INSERT INTO public.users (
        id,
        auth_user_id,
        email,
        name,
        role,
        preschool_id,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        COALESCE(v_caller_profile_id, v_caller_auth_resolved),
        v_caller_auth_resolved,
        v_caller_email,
        COALESCE(v_caller_name, 'Principal'),
        CASE
          WHEN v_caller_profile_role IN ('teacher', 'admin', 'principal', 'principal_admin', 'staff') THEN v_caller_profile_role
          ELSE 'principal'
        END,
        COALESCE(v_caller_profile_school, v_school),
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        auth_user_id = EXCLUDED.auth_user_id,
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        preschool_id = EXCLUDED.preschool_id,
        is_active = true,
        updated_at = NOW();

      PERFORM set_config('request.jwt.claim.sub', v_audit_sub_restore, true);

      SELECT u.id INTO v_assigned_by_db_id
      FROM public.users u
      WHERE u.auth_user_id = v_caller_auth_uid OR u.id = v_caller_auth_uid
      LIMIT 1;
    END IF;
  END IF;

  -- Prevent duplicate active seat for this user and subscription
  PERFORM 1
  FROM public.subscription_seats
  WHERE subscription_id = v_subscription_id
    AND user_id = v_target_user_db_id
    AND revoked_at IS NULL;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_assigned');
  END IF;

  -- Capacity check based on effective limit (seats_total capped by plan max)
  SELECT
    CASE
      WHEN s.seats_total IS NULL AND sp.max_teachers IS NULL THEN NULL
      WHEN s.seats_total IS NULL THEN sp.max_teachers
      WHEN sp.max_teachers IS NULL THEN s.seats_total
      ELSE LEAST(s.seats_total, sp.max_teachers)
    END
  INTO v_limit
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE s.id = v_subscription_id;

  IF v_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used
    FROM public.subscription_seats
    WHERE subscription_id = v_subscription_id
      AND revoked_at IS NULL;

    IF v_used >= v_limit THEN
      RAISE EXCEPTION 'No staff seats available for this plan (used: %, limit: %)', v_used, v_limit;
    END IF;
  END IF;

  -- Avoid audit trigger FK failures when auth.uid is not present in public.users.id
  PERFORM set_config('request.jwt.claim.sub', '', true);

  INSERT INTO public.subscription_seats (
    subscription_id,
    user_id,
    assigned_at,
    assigned_by,
    preschool_id
  ) VALUES (
    v_subscription_id,
    v_target_user_db_id,
    NOW(),
    v_assigned_by_db_id,
    v_school
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- Update seats_used counter
  UPDATE public.subscriptions
  SET seats_used = (
      SELECT COUNT(*)
      FROM public.subscription_seats
      WHERE subscription_id = v_subscription_id
        AND revoked_at IS NULL
    ),
    updated_at = NOW()
  WHERE id = v_subscription_id;

  PERFORM set_config('request.jwt.claim.sub', v_audit_sub_restore, true);

  IF v_inserted_count = 0 THEN
    RETURN jsonb_build_object('status', 'already_assigned');
  END IF;

  RETURN jsonb_build_object('status', 'assigned');
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_assign_teacher_seat(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_teacher_seat_limits()
 RETURNS TABLE("limit" integer, used integer, available integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_school uuid := public.util_caller_principal_school();
  v_subscription_id uuid;
  v_limit int;
  v_used int;
BEGIN
  -- Allow teachers to query for their school too
  IF v_school IS NULL AND NOT public.util_is_service_role() THEN
    SELECT preschool_id INTO v_school
    FROM public.profiles
    WHERE id = auth.uid();
  END IF;

  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Cannot determine preschool for caller';
  END IF;

  -- Get active subscription and effective limit
  SELECT
    s.id,
    CASE
      WHEN s.seats_total IS NULL AND sp.max_teachers IS NULL THEN NULL
      WHEN s.seats_total IS NULL THEN sp.max_teachers
      WHEN sp.max_teachers IS NULL THEN s.seats_total
      ELSE LEAST(s.seats_total, sp.max_teachers)
    END
  INTO v_subscription_id, v_limit
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE s.school_id = v_school
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no subscription, return zeros
  IF v_subscription_id IS NULL THEN
    RETURN QUERY SELECT NULL::int, 0, 0;
    RETURN;
  END IF;

  -- Count active seats
  SELECT COUNT(*) INTO v_used
  FROM public.subscription_seats
  WHERE subscription_id = v_subscription_id
    AND (revoked_at IS NULL);

  RETURN QUERY
  SELECT
    v_limit,
    v_used,
    CASE
      WHEN v_limit IS NULL THEN NULL
      ELSE GREATEST(v_limit - v_used, 0)
    END AS available;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_teacher_seat_limits() TO authenticated;
