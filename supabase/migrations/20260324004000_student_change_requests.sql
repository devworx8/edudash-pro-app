-- Parent-requested student detail changes with principal approval workflow.

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_note text,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_change_requests_school_status
  ON public.student_change_requests (school_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_change_requests_student_created
  ON public.student_change_requests (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_change_requests_requested_by
  ON public.student_change_requests (requested_by, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_change_requests_pending_unique
  ON public.student_change_requests (student_id, requested_by)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.student_change_requests_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_change_requests_updated_at ON public.student_change_requests;
CREATE TRIGGER trg_student_change_requests_updated_at
BEFORE UPDATE ON public.student_change_requests
FOR EACH ROW EXECUTE FUNCTION public.student_change_requests_set_updated_at();

CREATE OR REPLACE FUNCTION public.student_change_requests_can_manage(p_school_id uuid)
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
          AND coalesce(p.organization_id, p.preschool_id) = p_school_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.student_change_requests_is_linked_parent(
  p_student_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer AS (
    SELECT p.id AS profile_id, p.auth_user_id
    FROM public.profiles p
    WHERE p.id = p_user_id OR p.auth_user_id = p_user_id
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    LEFT JOIN viewer v ON true
    WHERE s.id = p_student_id
      AND (
        s.parent_id = p_user_id
        OR s.guardian_id = p_user_id
        OR (v.profile_id IS NOT NULL AND (s.parent_id = v.profile_id OR s.guardian_id = v.profile_id))
        OR (v.auth_user_id IS NOT NULL AND (s.parent_id = v.auth_user_id OR s.guardian_id = v.auth_user_id))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_change_requests_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_change_requests_is_linked_parent(uuid, uuid) TO authenticated;

ALTER TABLE public.student_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_change_requests_select ON public.student_change_requests;
CREATE POLICY student_change_requests_select
ON public.student_change_requests
FOR SELECT
TO authenticated
USING (
  public.student_change_requests_can_manage(school_id)
  OR (
    requested_by = auth.uid()
    AND public.student_change_requests_is_linked_parent(student_id, auth.uid())
  )
);

DROP POLICY IF EXISTS student_change_requests_parent_insert ON public.student_change_requests;
CREATE POLICY student_change_requests_parent_insert
ON public.student_change_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND status = 'pending'
  AND jsonb_typeof(requested_changes) = 'object'
  AND public.student_change_requests_is_linked_parent(student_id, auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = student_change_requests.student_id
      AND coalesce(s.organization_id, s.preschool_id) = student_change_requests.school_id
  )
);

DROP POLICY IF EXISTS student_change_requests_manage ON public.student_change_requests;
CREATE POLICY student_change_requests_manage
ON public.student_change_requests
FOR ALL
TO authenticated
USING (public.student_change_requests_can_manage(school_id))
WITH CHECK (public.student_change_requests_can_manage(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_change_requests TO authenticated;

COMMIT;
