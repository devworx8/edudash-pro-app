-- Fix the profile creation triggers to properly sync first_name, last_name,
-- phone, and organization_id from auth user_metadata.
-- Also add a function to process pending children from user_metadata
-- after email verification.

-- ============================================================
-- 1. Fix handle_new_user() to include name/phone/org fields
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_role text;
  v_org_id uuid;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'parent');
  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    split_part(NEW.email, '@', 1)
  );
  v_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  v_phone := NEW.raw_user_meta_data->>'phone';

  -- Parse organization ID from metadata if present
  BEGIN
    v_org_id := (NEW.raw_user_meta_data->>'selected_organization_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_org_id := NULL;
  END;

  INSERT INTO public.profiles (
    id, auth_user_id, email, role,
    first_name, last_name, phone,
    preschool_id, organization_id,
    created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.id, NEW.email, v_role,
    v_first_name, v_last_name, v_phone,
    v_org_id, v_org_id,
    NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    auth_user_id = COALESCE(public.profiles.auth_user_id, EXCLUDED.auth_user_id),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    first_name = COALESCE(NULLIF(public.profiles.first_name, ''), EXCLUDED.first_name),
    last_name = COALESCE(NULLIF(public.profiles.last_name, ''), EXCLUDED.last_name),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    preschool_id = COALESCE(public.profiles.preschool_id, EXCLUDED.preschool_id),
    organization_id = COALESCE(public.profiles.organization_id, EXCLUDED.organization_id),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Fix create_profile_for_new_user() ON CONFLICT to sync names
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  user_role text;
  user_first_name text;
  user_last_name text;
  user_phone text;
  v_org_id uuid;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'parent');
  user_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    split_part(NEW.email, '@', 1)
  );
  user_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  user_phone := NEW.raw_user_meta_data->>'phone';

  BEGIN
    v_org_id := (NEW.raw_user_meta_data->>'selected_organization_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_org_id := NULL;
  END;

  INSERT INTO public.profiles (
    id, auth_user_id, email, role,
    first_name, last_name, phone,
    preschool_id, organization_id,
    created_at, updated_at, last_login_at
  ) VALUES (
    NEW.id, NEW.id, NEW.email, user_role,
    user_first_name, user_last_name, user_phone,
    v_org_id, v_org_id,
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    auth_user_id = COALESCE(public.profiles.auth_user_id, EXCLUDED.auth_user_id),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    first_name = COALESCE(NULLIF(public.profiles.first_name, ''), EXCLUDED.first_name),
    last_name = COALESCE(NULLIF(public.profiles.last_name, ''), EXCLUDED.last_name),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    preschool_id = COALESCE(public.profiles.preschool_id, EXCLUDED.preschool_id),
    organization_id = COALESCE(public.profiles.organization_id, EXCLUDED.organization_id),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile for new user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 3. process_pending_registration(): callable by client or cron
--    Reads pending_children from auth.users.raw_user_meta_data,
--    inserts into child_registration_requests, then clears metadata.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_pending_registration(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_meta jsonb;
  v_children jsonb;
  v_org_id uuid;
  v_child jsonb;
  v_count int := 0;
  v_profile_first_name text;
  v_profile_org_id uuid;
BEGIN
  -- Get user metadata
  SELECT raw_user_meta_data INTO v_meta
  FROM auth.users
  WHERE id = p_user_id;

  IF v_meta IS NULL THEN
    RETURN jsonb_build_object('processed', 0, 'reason', 'user_not_found');
  END IF;

  v_children := v_meta->'pending_children';

  IF v_children IS NULL OR jsonb_array_length(v_children) = 0 THEN
    RETURN jsonb_build_object('processed', 0, 'reason', 'no_pending_children');
  END IF;

  -- Get org from metadata or profile
  BEGIN
    v_org_id := (v_meta->>'selected_organization_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_org_id := NULL;
  END;

  -- Fallback to profile's org
  IF v_org_id IS NULL THEN
    SELECT COALESCE(preschool_id, organization_id) INTO v_org_id
    FROM public.profiles
    WHERE id = p_user_id;
  END IF;

  -- Default to community school
  IF v_org_id IS NULL THEN
    v_org_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  -- Ensure profile has org set (fix null org_id from broken trigger)
  UPDATE public.profiles
  SET
    first_name = COALESCE(NULLIF(first_name, ''), v_meta->>'first_name'),
    last_name = COALESCE(NULLIF(last_name, ''), v_meta->>'last_name'),
    phone = COALESCE(phone, v_meta->>'phone'),
    preschool_id = COALESCE(preschool_id, v_org_id),
    organization_id = COALESCE(organization_id, v_org_id),
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Insert each child as a registration request
  FOR v_child IN SELECT * FROM jsonb_array_elements(v_children)
  LOOP
    INSERT INTO public.child_registration_requests (
      child_first_name,
      child_last_name,
      child_birth_date,
      parent_id,
      preschool_id,
      status,
      registration_fee_amount,
      registration_fee_paid,
      payment_verified
    ) VALUES (
      COALESCE(v_child->>'firstName', ''),
      COALESCE(v_child->>'lastName', ''),
      NULLIF(v_child->>'dateOfBirth', '')::date,
      p_user_id,
      v_org_id,
      'pending',
      0,
      false,
      false
    )
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  -- Clear pending_children from metadata to prevent re-processing
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data - 'pending_children'
  WHERE id = p_user_id;

  RETURN jsonb_build_object('processed', v_count, 'organization_id', v_org_id);
END;
$$;

-- Grant execute to authenticated users (they can only process their own via RLS check in function)
GRANT EXECUTE ON FUNCTION public.process_pending_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pending_registration(uuid) TO service_role;

-- ============================================================
-- 3b. Helper for cron: find users with pending children in metadata
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_users_with_pending_registrations()
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
  SELECT au.id
  FROM auth.users au
  WHERE au.raw_user_meta_data ? 'pending_children'
    AND jsonb_array_length(au.raw_user_meta_data->'pending_children') > 0;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_with_pending_registrations() TO service_role;

-- ============================================================
-- 4. Fix the devworx8@gmail.com profile (known broken registration)
-- ============================================================
DO $$
DECLARE
  v_user_id uuid := '1f2224a1-17e4-4bb3-a6f7-7bc77cdd1a43';
  v_meta jsonb;
BEGIN
  SELECT raw_user_meta_data INTO v_meta
  FROM auth.users
  WHERE id = v_user_id;

  IF v_meta IS NOT NULL THEN
    UPDATE public.profiles
    SET
      first_name = COALESCE(NULLIF(first_name, ''), v_meta->>'first_name', split_part(email, '@', 1)),
      last_name = COALESCE(NULLIF(last_name, ''), v_meta->>'last_name', ''),
      phone = COALESCE(phone, v_meta->>'phone'),
      updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- Process any pending children
  PERFORM public.process_pending_registration(v_user_id);
END
$$;
