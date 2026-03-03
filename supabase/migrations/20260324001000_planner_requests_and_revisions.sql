-- Planner reliability foundations:
-- 1) Teacher routine generation requests (principal inbox workflow)
-- 2) Versioned AI year-plan revisions and entries

BEGIN;

CREATE TABLE IF NOT EXISTS public.routine_generation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preschool_id uuid NOT NULL REFERENCES public.preschools(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  teacher_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('daily_routine', 'weekly_program')),
  week_start_date date NOT NULL,
  class_id uuid,
  age_group text,
  theme_title text,
  objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'approved', 'rejected', 'completed')),
  principal_notes text,
  resolution_reason text,
  linked_weekly_program_id uuid REFERENCES public.weekly_programs(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_requests_preschool_status
  ON public.routine_generation_requests (preschool_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_requests_teacher
  ON public.routine_generation_requests (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_requests_week
  ON public.routine_generation_requests (preschool_id, week_start_date);

CREATE TABLE IF NOT EXISTS public.year_plan_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preschool_id uuid NOT NULL REFERENCES public.preschools(id) ON DELETE CASCADE,
  academic_year integer NOT NULL CHECK (academic_year >= 2000 AND academic_year <= 2100),
  version_no integer NOT NULL CHECK (version_no > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid NOT NULL,
  published_at timestamptz,
  republished_from_revision_id uuid REFERENCES public.year_plan_revisions(id) ON DELETE SET NULL,
  changelog text,
  plan_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preschool_id, academic_year, version_no)
);

CREATE INDEX IF NOT EXISTS idx_year_plan_revisions_scope
  ON public.year_plan_revisions (preschool_id, academic_year, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_year_plan_revisions_status
  ON public.year_plan_revisions (preschool_id, status, published_at DESC);

CREATE TABLE IF NOT EXISTS public.year_plan_revision_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.year_plan_revisions(id) ON DELETE CASCADE,
  entry_kind text NOT NULL CHECK (entry_kind IN ('term', 'theme', 'monthly_entry')),
  entry_order integer NOT NULL DEFAULT 0,
  entry_month integer CHECK (entry_month BETWEEN 1 AND 12),
  entry_term_number integer,
  entry_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_year_plan_revision_entries_revision
  ON public.year_plan_revision_entries (revision_id, entry_order);
CREATE INDEX IF NOT EXISTS idx_year_plan_revision_entries_kind
  ON public.year_plan_revision_entries (revision_id, entry_kind);
CREATE INDEX IF NOT EXISTS idx_year_plan_revision_entries_month
  ON public.year_plan_revision_entries (revision_id, entry_month);

CREATE OR REPLACE FUNCTION public.planner_common_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_routine_generation_requests_updated_at ON public.routine_generation_requests;
CREATE TRIGGER trg_routine_generation_requests_updated_at
BEFORE UPDATE ON public.routine_generation_requests
FOR EACH ROW EXECUTE FUNCTION public.planner_common_set_updated_at();

DROP TRIGGER IF EXISTS trg_year_plan_revisions_updated_at ON public.year_plan_revisions;
CREATE TRIGGER trg_year_plan_revisions_updated_at
BEFORE UPDATE ON public.year_plan_revisions
FOR EACH ROW EXECUTE FUNCTION public.planner_common_set_updated_at();

CREATE OR REPLACE FUNCTION public.routine_requests_can_manage(p_preschool_id uuid)
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
          AND coalesce(p.organization_id, p.preschool_id) = p_preschool_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.routine_requests_is_teacher(p_preschool_id uuid, p_user_id uuid DEFAULT auth.uid())
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
      AND coalesce(p.organization_id, p.preschool_id) = p_preschool_id
  );
$$;

CREATE OR REPLACE FUNCTION public.year_plan_revisions_can_manage(p_preschool_id uuid)
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
          AND coalesce(p.organization_id, p.preschool_id) = p_preschool_id
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.routine_requests_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.routine_requests_is_teacher(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.year_plan_revisions_can_manage(uuid) TO authenticated;

ALTER TABLE public.routine_generation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.year_plan_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.year_plan_revision_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS routine_requests_select ON public.routine_generation_requests;
CREATE POLICY routine_requests_select
ON public.routine_generation_requests
FOR SELECT
TO authenticated
USING (
  public.routine_requests_can_manage(preschool_id)
  OR (
    requested_by = auth.uid()
    AND public.routine_requests_is_teacher(preschool_id, auth.uid())
  )
);

DROP POLICY IF EXISTS routine_requests_teacher_insert ON public.routine_generation_requests;
CREATE POLICY routine_requests_teacher_insert
ON public.routine_generation_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND teacher_id = auth.uid()
  AND public.routine_requests_is_teacher(preschool_id, auth.uid())
);

DROP POLICY IF EXISTS routine_requests_manage ON public.routine_generation_requests;
CREATE POLICY routine_requests_manage
ON public.routine_generation_requests
FOR ALL
TO authenticated
USING (public.routine_requests_can_manage(preschool_id))
WITH CHECK (public.routine_requests_can_manage(preschool_id));

DROP POLICY IF EXISTS year_plan_revisions_select ON public.year_plan_revisions;
CREATE POLICY year_plan_revisions_select
ON public.year_plan_revisions
FOR SELECT
TO authenticated
USING (
  public.year_plan_revisions_can_manage(preschool_id)
  OR (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
        AND lower(coalesce(p.role, '')) IN ('teacher', 'assistant_teacher')
        AND coalesce(p.organization_id, p.preschool_id) = year_plan_revisions.preschool_id
    )
  )
);

DROP POLICY IF EXISTS year_plan_revisions_manage ON public.year_plan_revisions;
CREATE POLICY year_plan_revisions_manage
ON public.year_plan_revisions
FOR ALL
TO authenticated
USING (public.year_plan_revisions_can_manage(preschool_id))
WITH CHECK (public.year_plan_revisions_can_manage(preschool_id));

DROP POLICY IF EXISTS year_plan_revision_entries_select ON public.year_plan_revision_entries;
CREATE POLICY year_plan_revision_entries_select
ON public.year_plan_revision_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.year_plan_revisions yr
    WHERE yr.id = year_plan_revision_entries.revision_id
      AND (
        public.year_plan_revisions_can_manage(yr.preschool_id)
        OR (
          yr.status = 'published'
          AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
              AND lower(coalesce(p.role, '')) IN ('teacher', 'assistant_teacher')
              AND coalesce(p.organization_id, p.preschool_id) = yr.preschool_id
          )
        )
      )
  )
);

DROP POLICY IF EXISTS year_plan_revision_entries_manage ON public.year_plan_revision_entries;
CREATE POLICY year_plan_revision_entries_manage
ON public.year_plan_revision_entries
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.year_plan_revisions yr
    WHERE yr.id = year_plan_revision_entries.revision_id
      AND public.year_plan_revisions_can_manage(yr.preschool_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.year_plan_revisions yr
    WHERE yr.id = year_plan_revision_entries.revision_id
      AND public.year_plan_revisions_can_manage(yr.preschool_id)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routine_generation_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.year_plan_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.year_plan_revision_entries TO authenticated;

COMMIT;
