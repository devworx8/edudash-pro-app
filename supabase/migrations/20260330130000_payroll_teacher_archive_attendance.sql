-- Payroll + Teacher Management Reliability
-- Archive teachers, add attendance-based payroll primitives, and enforce immutable payroll references.

BEGIN;

-- -----------------------------------------------------------------------------
-- Teacher lifecycle (archive instead of hard delete)
-- -----------------------------------------------------------------------------

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

UPDATE public.teachers
SET employment_status = CASE
  WHEN coalesce(is_active, true) = false THEN 'archived'
  ELSE 'active'
END
WHERE employment_status IS NULL OR btrim(employment_status) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teachers_employment_status_check'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers
      ADD CONSTRAINT teachers_employment_status_check
      CHECK (employment_status = ANY (ARRAY['active', 'archived']));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_teachers_preschool_employment_status
  ON public.teachers (preschool_id, employment_status);

-- -----------------------------------------------------------------------------
-- Payroll recipients role expansion (teachers + principal + staff)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_recipients_role_type_check'
      AND conrelid = 'public.payroll_recipients'::regclass
  ) THEN
    ALTER TABLE public.payroll_recipients
      DROP CONSTRAINT payroll_recipients_role_type_check;
  END IF;

  ALTER TABLE public.payroll_recipients
    ADD CONSTRAINT payroll_recipients_role_type_check
    CHECK (role_type = ANY (ARRAY['teacher', 'principal', 'staff']));
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_recipients_staff_profile
  ON public.payroll_recipients (organization_id, role_type, profile_id)
  WHERE role_type = 'staff' AND profile_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Attendance register + payroll period lock
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_attendance_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.preschools(id) ON DELETE CASCADE,
  payroll_recipient_id uuid NOT NULL REFERENCES public.payroll_recipients(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL DEFAULT 'present',
  leave_paid boolean NOT NULL DEFAULT true,
  check_in_at timestamptz,
  check_out_at timestamptz,
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, payroll_recipient_id, attendance_date)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employee_attendance_register_status_check'
      AND conrelid = 'public.employee_attendance_register'::regclass
  ) THEN
    ALTER TABLE public.employee_attendance_register
      ADD CONSTRAINT employee_attendance_register_status_check
      CHECK (status = ANY (ARRAY['present', 'late', 'absent', 'leave']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employee_attendance_register_check_out_after_check_in'
      AND conrelid = 'public.employee_attendance_register'::regclass
  ) THEN
    ALTER TABLE public.employee_attendance_register
      ADD CONSTRAINT employee_attendance_register_check_out_after_check_in
      CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_employee_attendance_org_date
  ON public.employee_attendance_register (organization_id, attendance_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_attendance_recipient_date
  ON public.employee_attendance_register (payroll_recipient_id, attendance_date DESC);

CREATE TABLE IF NOT EXISTS public.payroll_period_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.preschools(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  locked_at timestamptz,
  locked_by uuid,
  unlocked_at timestamptz,
  unlocked_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_month)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_period_controls_status_check'
      AND conrelid = 'public.payroll_period_controls'::regclass
  ) THEN
    ALTER TABLE public.payroll_period_controls
      ADD CONSTRAINT payroll_period_controls_status_check
      CHECK (status = ANY (ARRAY['open', 'locked']));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_payroll_period_controls_org_month
  ON public.payroll_period_controls (organization_id, period_month DESC);

-- -----------------------------------------------------------------------------
-- Payroll payment reference hardening
-- -----------------------------------------------------------------------------

-- Deduplicate rows before enforcing uniqueness (keep latest by id)
DELETE FROM public.payroll_payments
WHERE id NOT IN (
  SELECT DISTINCT ON (organization_id, payment_month, payment_reference)
    id
  FROM public.payroll_payments
  WHERE payment_reference IS NOT NULL
  ORDER BY organization_id, payment_month, payment_reference, id DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_payments_org_month_reference
  ON public.payroll_payments (organization_id, payment_month, payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_generate_payroll_reference(
  p_org_id uuid,
  p_month date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_org_code text;
  v_prefix text;
  v_next_seq integer;
BEGIN
  SELECT upper(
    regexp_replace(
      coalesce(nullif(tenant_slug, ''), nullif(registration_number, ''), nullif(name, ''), 'ORG'),
      '[^A-Za-z0-9]+',
      '',
      'g'
    )
  )
  INTO v_org_code
  FROM public.preschools
  WHERE id = p_org_id
  LIMIT 1;

  v_org_code := coalesce(nullif(v_org_code, ''), 'ORG');
  IF length(v_org_code) > 8 THEN
    v_org_code := left(v_org_code, 8);
  END IF;

  v_prefix := format('PAY-%s-%s-', v_org_code, to_char(v_month, 'YYYYMM'));

  SELECT coalesce(
    max(
      nullif(
        regexp_replace(
          payment_reference,
          ('^' || regexp_replace(v_prefix, '([\\-])', '\\\1', 'g')),
          ''
        ),
        ''
      )::integer
    ),
    0
  ) + 1
  INTO v_next_seq
  FROM public.payroll_payments
  WHERE organization_id = p_org_id
    AND payment_month = v_month
    AND payment_reference LIKE v_prefix || '%';

  RETURN v_prefix || lpad(v_next_seq::text, 4, '0');
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS for new tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.employee_attendance_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_period_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_attendance_register_select_policy ON public.employee_attendance_register;
CREATE POLICY employee_attendance_register_select_policy
ON public.employee_attendance_register
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT COALESCE(p.organization_id, p.preschool_id)
    FROM public.profiles p
    WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = auth.uid() OR actor.auth_user_id = auth.uid())
      AND lower(actor.role) IN ('admin', 'principal', 'principal_admin', 'super_admin', 'superadmin', 'teacher')
  )
);

DROP POLICY IF EXISTS employee_attendance_register_modify_policy ON public.employee_attendance_register;
CREATE POLICY employee_attendance_register_modify_policy
ON public.employee_attendance_register
FOR ALL
TO authenticated
USING (
  organization_id IN (
    SELECT COALESCE(p.organization_id, p.preschool_id)
    FROM public.profiles p
    WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = auth.uid() OR actor.auth_user_id = auth.uid())
      AND lower(actor.role) IN ('admin', 'principal', 'principal_admin', 'super_admin', 'superadmin')
  )
)
WITH CHECK (
  organization_id IN (
    SELECT COALESCE(p.organization_id, p.preschool_id)
    FROM public.profiles p
    WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = auth.uid() OR actor.auth_user_id = auth.uid())
      AND lower(actor.role) IN ('admin', 'principal', 'principal_admin', 'super_admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS payroll_period_controls_select_policy ON public.payroll_period_controls;
CREATE POLICY payroll_period_controls_select_policy
ON public.payroll_period_controls
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT COALESCE(p.organization_id, p.preschool_id)
    FROM public.profiles p
    WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS payroll_period_controls_modify_policy ON public.payroll_period_controls;
CREATE POLICY payroll_period_controls_modify_policy
ON public.payroll_period_controls
FOR ALL
TO authenticated
USING (
  organization_id IN (
    SELECT COALESCE(p.organization_id, p.preschool_id)
    FROM public.profiles p
    WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = auth.uid() OR actor.auth_user_id = auth.uid())
      AND lower(actor.role) IN ('principal', 'principal_admin', 'super_admin', 'superadmin')
  )
)
WITH CHECK (
  organization_id IN (
    SELECT COALESCE(p.organization_id, p.preschool_id)
    FROM public.profiles p
    WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE (actor.id = auth.uid() OR actor.auth_user_id = auth.uid())
      AND lower(actor.role) IN ('principal', 'principal_admin', 'super_admin', 'superadmin')
  )
);

-- -----------------------------------------------------------------------------
-- Attendance and period lock helper RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_employee_attendance(
  p_payroll_recipient_id uuid,
  p_attendance_date date,
  p_status text,
  p_check_in_at timestamptz DEFAULT NULL,
  p_check_out_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_leave_paid boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_org uuid;
  v_recipient public.payroll_recipients%ROWTYPE;
  v_month date := date_trunc('month', coalesce(p_attendance_date, current_date))::date;
  v_locked boolean := false;
  v_status text := lower(trim(coalesce(p_status, 'present')));
  v_row_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT p.role, COALESCE(p.organization_id, p.preschool_id)
  INTO v_actor_role, v_actor_org
  FROM public.profiles p
  WHERE p.id = v_actor OR p.auth_user_id = v_actor
  ORDER BY CASE WHEN p.id = v_actor THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF lower(v_actor_role) NOT IN ('admin', 'principal', 'principal_admin', 'super_admin', 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT *
  INTO v_recipient
  FROM public.payroll_recipients
  WHERE id = p_payroll_recipient_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payroll recipient not found');
  END IF;

  IF v_actor_org IS DISTINCT FROM v_recipient.organization_id
     AND lower(v_actor_role) NOT IN ('super_admin', 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-organization access denied');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payroll_period_controls ppc
    WHERE ppc.organization_id = v_recipient.organization_id
      AND ppc.period_month = v_month
      AND ppc.status = 'locked'
  ) OR EXISTS (
    SELECT 1
    FROM public.finance_month_closures fmc
    WHERE fmc.organization_id = v_recipient.organization_id
      AND fmc.month = v_month
      AND fmc.is_locked = true
  )
  INTO v_locked;

  IF v_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'This payroll period is locked');
  END IF;

  IF v_status NOT IN ('present', 'late', 'absent', 'leave') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid attendance status');
  END IF;

  IF p_check_in_at IS NOT NULL AND p_check_out_at IS NOT NULL AND p_check_out_at < p_check_in_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Check-out cannot be earlier than check-in');
  END IF;

  INSERT INTO public.employee_attendance_register (
    organization_id,
    payroll_recipient_id,
    attendance_date,
    status,
    leave_paid,
    check_in_at,
    check_out_at,
    notes,
    approved_by,
    approved_at,
    created_by,
    updated_at
  )
  VALUES (
    v_recipient.organization_id,
    v_recipient.id,
    coalesce(p_attendance_date, current_date),
    v_status,
    coalesce(p_leave_paid, true),
    p_check_in_at,
    p_check_out_at,
    nullif(p_notes, ''),
    v_actor,
    now(),
    v_actor,
    now()
  )
  ON CONFLICT (organization_id, payroll_recipient_id, attendance_date)
  DO UPDATE SET
    status = excluded.status,
    leave_paid = excluded.leave_paid,
    check_in_at = excluded.check_in_at,
    check_out_at = excluded.check_out_at,
    notes = excluded.notes,
    approved_by = v_actor,
    approved_at = now(),
    updated_at = now()
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'success', true,
    'attendance_id', v_row_id,
    'organization_id', v_recipient.organization_id,
    'payroll_recipient_id', v_recipient.id,
    'attendance_date', coalesce(p_attendance_date, current_date),
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_payroll_period_lock(
  p_org_id uuid,
  p_month date,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_org uuid;
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_status text := lower(trim(coalesce(p_status, 'locked')));
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT p.role, COALESCE(p.organization_id, p.preschool_id)
  INTO v_actor_role, v_actor_org
  FROM public.profiles p
  WHERE p.id = v_actor OR p.auth_user_id = v_actor
  ORDER BY CASE WHEN p.id = v_actor THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF lower(v_actor_role) NOT IN ('principal', 'principal_admin', 'super_admin', 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only principals can change period locks');
  END IF;

  IF v_actor_org IS DISTINCT FROM p_org_id
     AND lower(v_actor_role) NOT IN ('super_admin', 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-organization access denied');
  END IF;

  IF v_status NOT IN ('open', 'locked') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  INSERT INTO public.payroll_period_controls (
    organization_id,
    period_month,
    status,
    locked_at,
    locked_by,
    unlocked_at,
    unlocked_by,
    notes,
    updated_at
  )
  VALUES (
    p_org_id,
    v_month,
    v_status,
    CASE WHEN v_status = 'locked' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'locked' THEN v_actor ELSE NULL END,
    CASE WHEN v_status = 'open' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'open' THEN v_actor ELSE NULL END,
    nullif(p_notes, ''),
    now()
  )
  ON CONFLICT (organization_id, period_month)
  DO UPDATE SET
    status = excluded.status,
    locked_at = CASE WHEN excluded.status = 'locked' THEN now() ELSE payroll_period_controls.locked_at END,
    locked_by = CASE WHEN excluded.status = 'locked' THEN v_actor ELSE payroll_period_controls.locked_by END,
    unlocked_at = CASE WHEN excluded.status = 'open' THEN now() ELSE payroll_period_controls.unlocked_at END,
    unlocked_by = CASE WHEN excluded.status = 'open' THEN v_actor ELSE payroll_period_controls.unlocked_by END,
    notes = excluded.notes,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_org_id,
    'period_month', v_month,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_attendance_period(
  p_org_id uuid,
  p_month date,
  p_role_type text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_org uuid;
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_items jsonb := '[]'::jsonb;
  v_is_locked boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT p.role, COALESCE(p.organization_id, p.preschool_id)
  INTO v_actor_role, v_actor_org
  FROM public.profiles p
  WHERE p.id = v_actor OR p.auth_user_id = v_actor
  ORDER BY CASE WHEN p.id = v_actor THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF lower(v_actor_role) NOT IN ('admin', 'principal', 'principal_admin', 'super_admin', 'superadmin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  IF v_actor_org IS DISTINCT FROM p_org_id
     AND lower(v_actor_role) NOT IN ('super_admin', 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-organization access denied');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payroll_period_controls ppc
    WHERE ppc.organization_id = p_org_id
      AND ppc.period_month = v_month
      AND ppc.status = 'locked'
  ) OR EXISTS (
    SELECT 1
    FROM public.finance_month_closures fmc
    WHERE fmc.organization_id = p_org_id
      AND fmc.month = v_month
      AND fmc.is_locked = true
  )
  INTO v_is_locked;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attendance_id', ear.id,
        'payroll_recipient_id', pr.id,
        'recipient_name', pr.display_name,
        'role_type', pr.role_type,
        'attendance_date', ear.attendance_date,
        'status', ear.status,
        'leave_paid', ear.leave_paid,
        'check_in_at', ear.check_in_at,
        'check_out_at', ear.check_out_at,
        'notes', ear.notes,
        'approved_at', ear.approved_at
      )
      ORDER BY ear.attendance_date DESC, lower(pr.display_name)
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.employee_attendance_register ear
  JOIN public.payroll_recipients pr
    ON pr.id = ear.payroll_recipient_id
  WHERE ear.organization_id = p_org_id
    AND date_trunc('month', ear.attendance_date::timestamp)::date = v_month
    AND (p_role_type IS NULL OR pr.role_type = lower(trim(p_role_type)))
    AND (p_status IS NULL OR ear.status = lower(trim(p_status)));

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_org_id,
    'month', v_month,
    'period_locked', v_is_locked,
    'items', v_items
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Attendance-aware payroll roster
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payroll_roster(
  p_org_id uuid,
  p_month date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_org uuid;
  v_is_super boolean := false;
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_items jsonb := '[]'::jsonb;
  v_working_days integer := 0;
  v_period_locked boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT p.role, COALESCE(p.organization_id, p.preschool_id)
  INTO v_actor_role, v_actor_org
  FROM public.profiles p
  WHERE p.id = v_actor OR p.auth_user_id = v_actor
  ORDER BY CASE WHEN p.id = v_actor THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  v_is_super := lower(v_actor_role) IN ('super_admin', 'superadmin');
  IF lower(v_actor_role) NOT IN ('admin', 'principal', 'principal_admin', 'super_admin', 'superadmin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  IF NOT v_is_super AND v_actor_org IS DISTINCT FROM p_org_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-organization access denied');
  END IF;

  -- Ensure teacher recipients exist and reflect active/archived state.
  INSERT INTO public.payroll_recipients (organization_id, role_type, teacher_id, profile_id, display_name, active, metadata)
  SELECT
    p_org_id,
    'teacher',
    t.id,
    coalesce(t.user_id, t.auth_user_id),
    coalesce(nullif(trim(coalesce(t.full_name, '')), ''), trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), t.email, 'Teacher'),
    (coalesce(t.is_active, true) AND coalesce(t.employment_status, 'active') <> 'archived'),
    jsonb_build_object('source', 'teachers', 'employment_status', coalesce(t.employment_status, 'active'))
  FROM public.teachers t
  WHERE t.preschool_id = p_org_id
    AND t.id IS NOT NULL
  ON CONFLICT (organization_id, teacher_id)
  DO UPDATE SET
    profile_id = coalesce(excluded.profile_id, payroll_recipients.profile_id),
    display_name = excluded.display_name,
    active = excluded.active,
    metadata = coalesce(payroll_recipients.metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'teachers',
      'employment_status', coalesce(excluded.metadata->>'employment_status', 'active')
    ),
    updated_at = now();

  -- Ensure principal recipient exists.
  INSERT INTO public.payroll_recipients (organization_id, role_type, teacher_id, profile_id, display_name, active, metadata)
  SELECT
    p_org_id,
    'principal',
    NULL,
    pr.id,
    coalesce(nullif(trim(coalesce(pr.full_name, '')), ''), trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), pr.email, 'Principal'),
    true,
    jsonb_build_object('source', 'profiles')
  FROM public.profiles pr
  WHERE COALESCE(pr.organization_id, pr.preschool_id) = p_org_id
    AND lower(pr.role) IN ('principal', 'principal_admin')
  ORDER BY CASE WHEN lower(pr.role) = 'principal' THEN 0 ELSE 1 END
  LIMIT 1
  ON CONFLICT (organization_id, role_type, profile_id)
  DO UPDATE SET
    display_name = excluded.display_name,
    active = true,
    updated_at = now();

  -- Ensure staff recipients exist from organization_members.
  INSERT INTO public.payroll_recipients (organization_id, role_type, teacher_id, profile_id, display_name, active, metadata)
  SELECT
    om.organization_id,
    'staff',
    NULL,
    om.user_id,
    coalesce(
      nullif(trim(coalesce(prof.first_name, '') || ' ' || coalesce(prof.last_name, '')), ''),
      nullif(trim(coalesce(om.first_name, '') || ' ' || coalesce(om.last_name, '')), ''),
      prof.email,
      om.email,
      'Staff Member'
    ),
    coalesce(om.membership_status, 'active') = 'active',
    jsonb_build_object('source', 'organization_members', 'member_type', coalesce(om.member_type, 'staff'))
  FROM public.organization_members om
  LEFT JOIN public.profiles prof ON prof.id = om.user_id
  WHERE om.organization_id = p_org_id
    AND lower(coalesce(om.member_type, '')) = 'staff'
  ON CONFLICT (organization_id, role_type, profile_id)
  DO UPDATE SET
    display_name = excluded.display_name,
    active = excluded.active,
    metadata = coalesce(payroll_recipients.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  SELECT count(*)::integer
  INTO v_working_days
  FROM generate_series(
    date_trunc('month', v_month::timestamp)::date,
    (date_trunc('month', v_month::timestamp) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) AS d(day)
  WHERE extract(isodow from d.day) < 6;

  IF coalesce(v_working_days, 0) <= 0 THEN
    v_working_days := extract(day from (date_trunc('month', v_month::timestamp) + interval '1 month - 1 day'))::integer;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payroll_period_controls ppc
    WHERE ppc.organization_id = p_org_id
      AND ppc.period_month = v_month
      AND ppc.status = 'locked'
  ) OR EXISTS (
    SELECT 1
    FROM public.finance_month_closures fmc
    WHERE fmc.organization_id = p_org_id
      AND fmc.month = v_month
      AND fmc.is_locked = true
  )
  INTO v_period_locked;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'payroll_recipient_id', pr.id,
        'role_type', pr.role_type,
        'display_name', pr.display_name,
        'teacher_id', pr.teacher_id,
        'profile_id', pr.profile_id,
        'active', pr.active,
        'base_salary', coalesce(pprof.base_salary, 0),
        'allowances', coalesce(pprof.allowances, 0),
        'deductions', coalesce(pprof.deductions, 0),
        'net_salary', coalesce(pprof.net_salary, 0),
        'salary_effective_from', pprof.effective_from,
        'working_days', v_working_days,
        'present_days', coalesce(att.present_days, 0),
        'late_days', coalesce(att.late_days, 0),
        'absent_days', coalesce(att.absent_days, 0),
        'leave_days', coalesce(att.leave_days, 0),
        'paid_leave_days', coalesce(att.paid_leave_days, 0),
        'unpaid_leave_days', coalesce(att.unpaid_leave_days, 0),
        'payable_days', greatest(v_working_days - coalesce(att.absent_days, 0) - coalesce(att.unpaid_leave_days, 0), 0),
        'computed_net_pay',
          round(
            CASE
              WHEN v_working_days <= 0 THEN coalesce(pprof.net_salary, 0)
              ELSE (
                (coalesce(pprof.base_salary, 0) * greatest(v_working_days - coalesce(att.absent_days, 0) - coalesce(att.unpaid_leave_days, 0), 0))
                / v_working_days
              ) + coalesce(pprof.allowances, 0) - coalesce(pprof.deductions, 0)
            END
          , 2),
        'attendance_breakdown', jsonb_build_object(
          'present', coalesce(att.present_days, 0),
          'late', coalesce(att.late_days, 0),
          'absent', coalesce(att.absent_days, 0),
          'leave', coalesce(att.leave_days, 0),
          'paid_leave', coalesce(att.paid_leave_days, 0),
          'unpaid_leave', coalesce(att.unpaid_leave_days, 0)
        ),
        'paid_this_month', coalesce(pm.paid_this_month, false),
        'paid_amount_this_month', coalesce(pm.paid_amount, 0),
        'last_paid_at', pm.last_paid_at,
        'period_locked', v_period_locked
      )
      ORDER BY
        CASE WHEN pr.role_type = 'principal' THEN 0 WHEN pr.role_type = 'teacher' THEN 1 ELSE 2 END,
        lower(pr.display_name)
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.payroll_recipients pr
  LEFT JOIN LATERAL (
    SELECT pp.base_salary, pp.allowances, pp.deductions, pp.net_salary, pp.effective_from
    FROM public.payroll_profiles pp
    WHERE pp.payroll_recipient_id = pr.id
      AND pp.effective_from <= v_month
    ORDER BY pp.effective_from DESC, pp.created_at DESC
    LIMIT 1
  ) pprof ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE ear.status = 'present')::integer AS present_days,
      count(*) FILTER (WHERE ear.status = 'late')::integer AS late_days,
      count(*) FILTER (WHERE ear.status = 'absent')::integer AS absent_days,
      count(*) FILTER (WHERE ear.status = 'leave')::integer AS leave_days,
      count(*) FILTER (WHERE ear.status = 'leave' AND coalesce(ear.leave_paid, true) = true)::integer AS paid_leave_days,
      count(*) FILTER (WHERE ear.status = 'leave' AND coalesce(ear.leave_paid, true) = false)::integer AS unpaid_leave_days
    FROM public.employee_attendance_register ear
    WHERE ear.payroll_recipient_id = pr.id
      AND date_trunc('month', ear.attendance_date::timestamp)::date = v_month
  ) att ON true
  LEFT JOIN LATERAL (
    SELECT
      true AS paid_this_month,
      sum(p.amount)::numeric AS paid_amount,
      max(p.created_at) AS last_paid_at
    FROM public.payroll_payments p
    WHERE p.payroll_recipient_id = pr.id
      AND date_trunc('month', p.payment_month::timestamp)::date = v_month
  ) pm ON true
  WHERE pr.organization_id = p_org_id
    AND pr.active = true;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_org_id,
    'month', v_month,
    'period_locked', v_period_locked,
    'working_days', v_working_days,
    'items', v_items,
    'generated_at', now()
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Attendance-aware payroll payment posting (immutable references)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_payroll_payment(
  p_payroll_recipient_id uuid,
  p_amount numeric,
  p_payment_month date,
  p_payment_method text,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security = off
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_org uuid;
  v_is_super boolean := false;
  v_payment_month date := date_trunc('month', coalesce(p_payment_month, current_date))::date;
  v_method text := public.normalize_finance_payment_method(p_payment_method);
  v_recipient public.payroll_recipients%ROWTYPE;
  v_month_locked boolean := false;
  v_financial_tx_id uuid;
  v_payroll_payment_id uuid;
  v_role_label text;
  v_payment_reference text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF coalesce(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero');
  END IF;

  SELECT p.role, COALESCE(p.organization_id, p.preschool_id)
  INTO v_actor_role, v_actor_org
  FROM public.profiles p
  WHERE p.id = v_actor OR p.auth_user_id = v_actor
  ORDER BY CASE WHEN p.id = v_actor THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  v_is_super := lower(v_actor_role) IN ('super_admin', 'superadmin');
  IF lower(v_actor_role) NOT IN ('admin', 'principal', 'principal_admin', 'super_admin', 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT *
  INTO v_recipient
  FROM public.payroll_recipients
  WHERE id = p_payroll_recipient_id
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payroll recipient not found');
  END IF;

  IF NOT v_is_super AND v_actor_org IS DISTINCT FROM v_recipient.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-organization access denied');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payroll_period_controls ppc
    WHERE ppc.organization_id = v_recipient.organization_id
      AND ppc.period_month = v_payment_month
      AND ppc.status = 'locked'
  ) OR EXISTS (
    SELECT 1
    FROM public.finance_month_closures fmc
    WHERE fmc.organization_id = v_recipient.organization_id
      AND fmc.month = v_payment_month
      AND fmc.is_locked = true
  )
  INTO v_month_locked;

  IF v_month_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selected month is locked');
  END IF;

  v_role_label := CASE
    WHEN v_recipient.role_type = 'principal' THEN 'Principal'
    WHEN v_recipient.role_type = 'staff' THEN 'Staff'
    ELSE 'Teacher'
  END;

  v_payment_reference := public.fn_generate_payroll_reference(v_recipient.organization_id, v_payment_month);

  INSERT INTO public.financial_transactions (
    preschool_id,
    type,
    amount,
    description,
    payment_method,
    payment_reference,
    status,
    created_by,
    metadata
  )
  VALUES (
    v_recipient.organization_id,
    'expense',
    round(p_amount, 2),
    format('%s payroll payment - %s', v_role_label, v_recipient.display_name),
    v_method,
    v_payment_reference,
    'completed',
    v_actor,
    jsonb_build_object(
      'category', 'payroll',
      'payment_month', v_payment_month::text,
      'recipient_role', v_recipient.role_type,
      'recipient_id', v_recipient.id,
      'recipient_name', v_recipient.display_name,
      'external_reference', nullif(p_reference, '')
    )
  )
  RETURNING id INTO v_financial_tx_id;

  INSERT INTO public.payroll_payments (
    payroll_recipient_id,
    organization_id,
    amount,
    payment_month,
    payment_method,
    payment_reference,
    notes,
    financial_tx_id,
    recorded_by,
    updated_at
  )
  VALUES (
    v_recipient.id,
    v_recipient.organization_id,
    round(p_amount, 2),
    v_payment_month,
    v_method,
    v_payment_reference,
    nullif(p_notes, ''),
    v_financial_tx_id,
    v_actor,
    now()
  )
  RETURNING id INTO v_payroll_payment_id;

  -- Keep backward compatibility with teacher_payments history table.
  INSERT INTO public.teacher_payments (
    teacher_id,
    preschool_id,
    amount,
    payment_date,
    payment_method,
    payment_type,
    recipient_role,
    recipient_name,
    reference_number,
    notes,
    financial_tx_id,
    recorded_by
  )
  VALUES (
    CASE WHEN v_recipient.role_type = 'teacher' THEN v_recipient.teacher_id ELSE NULL END,
    v_recipient.organization_id,
    round(p_amount, 2),
    current_date,
    v_method,
    'salary',
    v_recipient.role_type,
    v_recipient.display_name,
    v_payment_reference,
    nullif(p_notes, ''),
    v_financial_tx_id,
    v_actor
  );

  RETURN jsonb_build_object(
    'success', true,
    'payroll_payment_id', v_payroll_payment_id,
    'financial_tx_id', v_financial_tx_id,
    'payment_reference', v_payment_reference,
    'organization_id', v_recipient.organization_id,
    'payment_month', v_payment_month,
    'recipient_role', v_recipient.role_type,
    'recipient_name', v_recipient.display_name
  );
END;
$$;

COMMIT;
