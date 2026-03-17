-- Add class_teachers join table for multi-teacher class support
-- Includes lead/assistant roles, RLS policies, and class view helpers.

CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'assistant',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.class_teachers
  ADD CONSTRAINT class_teachers_role_check
  CHECK (role IN ('lead', 'assistant'));

CREATE UNIQUE INDEX IF NOT EXISTS class_teachers_class_teacher_unique
  ON public.class_teachers (class_id, teacher_id);

CREATE UNIQUE INDEX IF NOT EXISTS class_teachers_one_lead_per_class
  ON public.class_teachers (class_id)
  WHERE role = 'lead';

CREATE INDEX IF NOT EXISTS class_teachers_teacher_idx
  ON public.class_teachers (teacher_id);

CREATE INDEX IF NOT EXISTS class_teachers_class_idx
  ON public.class_teachers (class_id);

ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_class_school_id(p_class_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
  SELECT COALESCE(c.organization_id, c.preschool_id)
  FROM public.classes c
  WHERE c.id = p_class_id
$$;

-- Drop first: existing function has different parameter names (class_teacher_id)
-- and PostgreSQL doesn't allow renaming params via CREATE OR REPLACE
-- CASCADE drops dependent policies (classes_teacher_select, parents_view_child_classes)
-- which are re-created below in this same migration
DROP FUNCTION IF EXISTS public.user_can_view_classes(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.user_can_view_classes(
  preschool_org_id uuid,
  class_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  user_preschool_id uuid;
  user_org_id uuid;
  user_profile_id uuid;
  user_auth_id uuid;
BEGIN
  SELECT p.preschool_id, p.organization_id, p.id
       , p.auth_user_id
  INTO user_preschool_id, user_org_id, user_profile_id, user_auth_id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
     OR p.id = auth.uid()
  LIMIT 1;

  IF user_profile_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.class_teachers ct
      WHERE ct.class_id = class_id
        AND (
          ct.teacher_id = user_profile_id
          OR ct.teacher_id = auth.uid()
          OR (user_auth_id IS NOT NULL AND ct.teacher_id = user_auth_id)
        )
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = class_id
      AND ct.teacher_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  IF COALESCE(user_preschool_id, user_org_id) = preschool_org_id THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

DROP POLICY IF EXISTS "classes_teacher_select" ON public.classes;
CREATE POLICY "classes_teacher_select"
ON public.classes
FOR SELECT
TO authenticated
USING (public.user_can_view_classes(preschool_id, id));

DROP POLICY IF EXISTS "parents_view_child_classes" ON public.classes;
CREATE POLICY "parents_view_child_classes"
ON public.classes
FOR SELECT
TO authenticated
USING (
  id IN (SELECT public.get_my_children_class_ids())
  OR public.user_can_view_classes(preschool_id, id)
);

DROP POLICY IF EXISTS class_teachers_service_role ON public.class_teachers;
CREATE POLICY class_teachers_service_role
ON public.class_teachers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS class_teachers_admin_manage ON public.class_teachers;
CREATE POLICY class_teachers_admin_manage
ON public.class_teachers
FOR ALL
TO authenticated
USING (public.user_can_manage_classes(public.get_class_school_id(class_id)))
WITH CHECK (public.user_can_manage_classes(public.get_class_school_id(class_id)));

DROP POLICY IF EXISTS class_teachers_teacher_select ON public.class_teachers;
CREATE POLICY class_teachers_teacher_select
ON public.class_teachers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND (class_teachers.teacher_id = p.id OR class_teachers.teacher_id = p.auth_user_id)
  )
  OR class_teachers.teacher_id = auth.uid()
);

INSERT INTO public.class_teachers (class_id, teacher_id, role)
SELECT DISTINCT
  c.id AS class_id,
  p.id AS teacher_id,
  'lead' AS role
FROM public.classes c
JOIN public.profiles p
  ON c.teacher_id = p.id
  OR c.teacher_id = p.auth_user_id
WHERE c.teacher_id IS NOT NULL
ON CONFLICT (class_id, teacher_id) DO NOTHING;

COMMENT ON TABLE public.class_teachers IS
'Join table for class-to-teacher assignments with lead/assistant roles.';

COMMENT ON FUNCTION public.user_can_view_classes(uuid, uuid) IS
'Checks if a user can view a class by id (assigned teacher or same organization).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
