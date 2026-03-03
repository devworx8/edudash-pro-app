BEGIN;

CREATE TABLE IF NOT EXISTS public.uniform_number_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  preschool_id uuid NOT NULL REFERENCES public.preschools(id) ON DELETE CASCADE,
  tshirt_number text NOT NULL,
  assigned_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT uniform_number_assignments_tshirt_number_chk CHECK (
    tshirt_number ~ '^[0-9]{1,2}$'
    AND tshirt_number::integer BETWEEN 1 AND 99
  ),
  CONSTRAINT uniform_number_assignments_school_number_key UNIQUE (preschool_id, tshirt_number)
);

CREATE INDEX IF NOT EXISTS idx_uniform_number_assignments_preschool_id
  ON public.uniform_number_assignments(preschool_id);
CREATE INDEX IF NOT EXISTS idx_uniform_number_assignments_parent_id
  ON public.uniform_number_assignments(parent_id);

ALTER TABLE public.uniform_number_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_uniform_number_assignment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_preschool_id uuid;
  v_parent_id uuid;
BEGIN
  SELECT
    COALESCE(s.preschool_id, s.organization_id),
    COALESCE(s.parent_id, s.guardian_id)
  INTO v_preschool_id, v_parent_id
  FROM public.students s
  WHERE s.id = NEW.student_id;

  IF v_preschool_id IS NULL THEN
    RAISE EXCEPTION 'Student has no preschool or organization';
  END IF;

  NEW.preschool_id := v_preschool_id;
  NEW.parent_id := COALESCE(v_parent_id, NEW.parent_id);
  NEW.updated_at := now();

  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uniform_number_assignments_set_fields ON public.uniform_number_assignments;
CREATE TRIGGER trg_uniform_number_assignments_set_fields
BEFORE INSERT OR UPDATE ON public.uniform_number_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_uniform_number_assignment_fields();

DROP POLICY IF EXISTS uniform_number_assignments_parent_select ON public.uniform_number_assignments;
CREATE POLICY uniform_number_assignments_parent_select
ON public.uniform_number_assignments
FOR SELECT
TO authenticated
USING (student_id IN (SELECT get_my_children_ids()));

DROP POLICY IF EXISTS uniform_number_assignments_parent_insert ON public.uniform_number_assignments;
CREATE POLICY uniform_number_assignments_parent_insert
ON public.uniform_number_assignments
FOR INSERT
TO authenticated
WITH CHECK (student_id IN (SELECT get_my_children_ids()));

DROP POLICY IF EXISTS uniform_number_assignments_parent_update ON public.uniform_number_assignments;
CREATE POLICY uniform_number_assignments_parent_update
ON public.uniform_number_assignments
FOR UPDATE
TO authenticated
USING (student_id IN (SELECT get_my_children_ids()))
WITH CHECK (student_id IN (SELECT get_my_children_ids()));

DROP POLICY IF EXISTS uniform_number_assignments_staff_select ON public.uniform_number_assignments;
CREATE POLICY uniform_number_assignments_staff_select
ON public.uniform_number_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.auth_user_id = auth.uid() OR p.id = auth.uid())
      AND lower(COALESCE(p.role, '')) IN (
        'principal',
        'principal_admin',
        'admin',
        'super_admin',
        'superadmin'
      )
      AND COALESCE(p.organization_id, p.preschool_id) = uniform_number_assignments.preschool_id
  )
);

DROP POLICY IF EXISTS uniform_number_assignments_staff_insert ON public.uniform_number_assignments;
CREATE POLICY uniform_number_assignments_staff_insert
ON public.uniform_number_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.auth_user_id = auth.uid() OR p.id = auth.uid())
      AND lower(COALESCE(p.role, '')) IN (
        'principal',
        'principal_admin',
        'admin',
        'super_admin',
        'superadmin'
      )
      AND COALESCE(p.organization_id, p.preschool_id) = uniform_number_assignments.preschool_id
  )
);

DROP POLICY IF EXISTS uniform_number_assignments_staff_update ON public.uniform_number_assignments;
CREATE POLICY uniform_number_assignments_staff_update
ON public.uniform_number_assignments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.auth_user_id = auth.uid() OR p.id = auth.uid())
      AND lower(COALESCE(p.role, '')) IN (
        'principal',
        'principal_admin',
        'admin',
        'super_admin',
        'superadmin'
      )
      AND COALESCE(p.organization_id, p.preschool_id) = uniform_number_assignments.preschool_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.auth_user_id = auth.uid() OR p.id = auth.uid())
      AND lower(COALESCE(p.role, '')) IN (
        'principal',
        'principal_admin',
        'admin',
        'super_admin',
        'superadmin'
      )
      AND COALESCE(p.organization_id, p.preschool_id) = uniform_number_assignments.preschool_id
  )
);

DROP POLICY IF EXISTS uniform_number_assignments_staff_delete ON public.uniform_number_assignments;
CREATE POLICY uniform_number_assignments_staff_delete
ON public.uniform_number_assignments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.auth_user_id = auth.uid() OR p.id = auth.uid())
      AND lower(COALESCE(p.role, '')) IN (
        'principal',
        'principal_admin',
        'admin',
        'super_admin',
        'superadmin'
      )
      AND COALESCE(p.organization_id, p.preschool_id) = uniform_number_assignments.preschool_id
  )
);

WITH valid_uniform_numbers AS (
  SELECT
    ur.student_id,
    ur.parent_id,
    ur.preschool_id,
    trim(ur.tshirt_number) AS tshirt_number,
    row_number() OVER (
      PARTITION BY ur.preschool_id, trim(ur.tshirt_number)
      ORDER BY COALESCE(ur.created_at, now()), ur.student_id
    ) AS number_rank
  FROM public.uniform_requests ur
  WHERE trim(COALESCE(ur.tshirt_number, '')) ~ '^[0-9]{1,2}$'
    AND (trim(ur.tshirt_number))::integer BETWEEN 1 AND 99
)
INSERT INTO public.uniform_number_assignments (
  student_id,
  parent_id,
  preschool_id,
  tshirt_number,
  assigned_by,
  created_at,
  updated_at
)
SELECT
  v.student_id,
  v.parent_id,
  v.preschool_id,
  v.tshirt_number,
  NULL,
  now(),
  now()
FROM valid_uniform_numbers v
WHERE v.number_rank = 1
ON CONFLICT DO NOTHING;

COMMIT;
