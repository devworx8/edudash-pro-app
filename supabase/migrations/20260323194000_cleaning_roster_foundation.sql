-- Cleaning roster foundation for preschool staff operations.
-- WARP-compliant: forward-only migration, RLS enabled, tenant-scoped access.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cleaning_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cleaning_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cleaning_area_id uuid NOT NULL REFERENCES public.cleaning_areas(id) ON DELETE RESTRICT,
  shift_date date NOT NULL,
  shift_slot text NOT NULL CHECK (shift_slot IN ('morning', 'midday', 'afternoon', 'closing')),
  notes text,
  required_staff_count integer NOT NULL DEFAULT 1 CHECK (required_staff_count > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cleaning_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cleaning_shift_id uuid NOT NULL REFERENCES public.cleaning_shifts(id) ON DELETE CASCADE,
  teacher_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'missed')),
  started_at timestamptz,
  completed_at timestamptz,
  completion_note text,
  proof_photo_url text,
  completed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cleaning_shift_id, teacher_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cleaning_areas_org_name
  ON public.cleaning_areas (organization_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_cleaning_areas_org_active
  ON public.cleaning_areas (organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_cleaning_shifts_org_date
  ON public.cleaning_shifts (organization_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_shifts_area
  ON public.cleaning_shifts (cleaning_area_id);

CREATE INDEX IF NOT EXISTS idx_cleaning_assignments_shift
  ON public.cleaning_assignments (cleaning_shift_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_assignments_teacher
  ON public.cleaning_assignments (teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_assignments_org_status
  ON public.cleaning_assignments (organization_id, status);

CREATE OR REPLACE FUNCTION public.cleaning_roster_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleaning_areas_updated_at ON public.cleaning_areas;
CREATE TRIGGER trg_cleaning_areas_updated_at
BEFORE UPDATE ON public.cleaning_areas
FOR EACH ROW EXECUTE FUNCTION public.cleaning_roster_set_updated_at();

DROP TRIGGER IF EXISTS trg_cleaning_shifts_updated_at ON public.cleaning_shifts;
CREATE TRIGGER trg_cleaning_shifts_updated_at
BEFORE UPDATE ON public.cleaning_shifts
FOR EACH ROW EXECUTE FUNCTION public.cleaning_roster_set_updated_at();

DROP TRIGGER IF EXISTS trg_cleaning_assignments_updated_at ON public.cleaning_assignments;
CREATE TRIGGER trg_cleaning_assignments_updated_at
BEFORE UPDATE ON public.cleaning_assignments
FOR EACH ROW EXECUTE FUNCTION public.cleaning_roster_set_updated_at();

CREATE OR REPLACE FUNCTION public.cleaning_roster_can_manage(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      AND (
        lower(coalesce(p.role, '')) IN ('super_admin', 'superadmin')
        OR (
          lower(coalesce(p.role, '')) IN ('principal', 'principal_admin', 'admin')
          AND coalesce(p.organization_id, p.preschool_id) = p_org_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.cleaning_roster_is_teacher(p_org_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.id = p_user_id OR p.auth_user_id = p_user_id)
      AND lower(coalesce(p.role, '')) = 'teacher'
      AND coalesce(p.organization_id, p.preschool_id) = p_org_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.cleaning_roster_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleaning_roster_is_teacher(uuid, uuid) TO authenticated;

ALTER TABLE public.cleaning_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cleaning_areas_select ON public.cleaning_areas;
CREATE POLICY cleaning_areas_select
ON public.cleaning_areas
FOR SELECT
TO authenticated
USING (
  public.cleaning_roster_can_manage(organization_id)
  OR public.cleaning_roster_is_teacher(organization_id, auth.uid())
);

DROP POLICY IF EXISTS cleaning_areas_modify ON public.cleaning_areas;
CREATE POLICY cleaning_areas_modify
ON public.cleaning_areas
FOR ALL
TO authenticated
USING (public.cleaning_roster_can_manage(organization_id))
WITH CHECK (public.cleaning_roster_can_manage(organization_id));

DROP POLICY IF EXISTS cleaning_shifts_select ON public.cleaning_shifts;
CREATE POLICY cleaning_shifts_select
ON public.cleaning_shifts
FOR SELECT
TO authenticated
USING (
  public.cleaning_roster_can_manage(organization_id)
  OR public.cleaning_roster_is_teacher(organization_id, auth.uid())
);

DROP POLICY IF EXISTS cleaning_shifts_modify ON public.cleaning_shifts;
CREATE POLICY cleaning_shifts_modify
ON public.cleaning_shifts
FOR ALL
TO authenticated
USING (public.cleaning_roster_can_manage(organization_id))
WITH CHECK (public.cleaning_roster_can_manage(organization_id));

DROP POLICY IF EXISTS cleaning_assignments_select ON public.cleaning_assignments;
CREATE POLICY cleaning_assignments_select
ON public.cleaning_assignments
FOR SELECT
TO authenticated
USING (
  public.cleaning_roster_can_manage(organization_id)
  OR (
    teacher_user_id = auth.uid()
    AND public.cleaning_roster_is_teacher(organization_id, auth.uid())
  )
);

DROP POLICY IF EXISTS cleaning_assignments_manage ON public.cleaning_assignments;
CREATE POLICY cleaning_assignments_manage
ON public.cleaning_assignments
FOR ALL
TO authenticated
USING (public.cleaning_roster_can_manage(organization_id))
WITH CHECK (public.cleaning_roster_can_manage(organization_id));

DROP POLICY IF EXISTS cleaning_assignments_teacher_update ON public.cleaning_assignments;
CREATE POLICY cleaning_assignments_teacher_update
ON public.cleaning_assignments
FOR UPDATE
TO authenticated
USING (
  teacher_user_id = auth.uid()
  AND public.cleaning_roster_is_teacher(organization_id, auth.uid())
)
WITH CHECK (
  teacher_user_id = auth.uid()
  AND public.cleaning_roster_is_teacher(organization_id, auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_shifts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_assignments TO authenticated;

COMMIT;
