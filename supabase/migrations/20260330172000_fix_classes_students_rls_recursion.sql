-- Normalize classes/students RLS to remove recursive policy evaluation.
-- Problem:
-- - classes SELECT policies were reintroduced that query students directly.
-- - students SELECT policies were reintroduced that query classes directly.
-- - PostgREST HEAD/count queries against classes then recurse through RLS and fail with 500s.
--
-- Strategy:
-- - Keep helper-based, SECURITY DEFINER access checks.
-- - Remove direct classes<->students policy references.
-- - Preserve parent birthday/class-list access using helper functions instead of inline subqueries.

-- ---------------------------------------------------------------------------
-- Parent helper functions (SECURITY DEFINER so they do not recurse through RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_parent_of_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.profiles p
      ON s.parent_id = p.id OR s.guardian_id = p.id
    WHERE s.id = p_student_id
      AND p.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_children_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.profiles p
    ON s.parent_id = p.id OR s.guardian_id = p.id
  WHERE p.auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_children_class_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
  SELECT DISTINCT s.class_id
  FROM public.students s
  JOIN public.profiles p
    ON s.parent_id = p.id OR s.guardian_id = p.id
  WHERE p.auth_user_id = auth.uid()
    AND s.class_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_my_children_preschool_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
  SELECT DISTINCT s.preschool_id
  FROM public.students s
  JOIN public.profiles p
    ON s.parent_id = p.id OR s.guardian_id = p.id
  WHERE p.auth_user_id = auth.uid()
    AND s.preschool_id IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- Students policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "parents_view_school_students" ON public.students;
DROP POLICY IF EXISTS "parents_view_school_students_via_child" ON public.students;
DROP POLICY IF EXISTS "parents_view_their_children" ON public.students;
DROP POLICY IF EXISTS "students_parent_access" ON public.students;
DROP POLICY IF EXISTS "students_select_by_preschool_authenticated" ON public.students;
DROP POLICY IF EXISTS "students_teacher_access" ON public.students;
DROP POLICY IF EXISTS "students_tenant_modify" ON public.students;
DROP POLICY IF EXISTS "students_principal_access" ON public.students;
DROP POLICY IF EXISTS students_service_bypass ON public.students;
DROP POLICY IF EXISTS students_superadmin_all ON public.students;
DROP POLICY IF EXISTS students_school_staff_select ON public.students;
DROP POLICY IF EXISTS students_school_admin_modify ON public.students;
DROP POLICY IF EXISTS students_parent_own_children ON public.students;
DROP POLICY IF EXISTS students_parent_update_children ON public.students;
DROP POLICY IF EXISTS students_parent_update_own_children ON public.students;

CREATE POLICY students_service_bypass
ON public.students
FOR ALL
USING (
  (SELECT current_setting('role', true)) = 'service_role'
  OR COALESCE((SELECT current_setting('is_superuser', true)), 'false')::boolean = true
)
WITH CHECK (
  (SELECT current_setting('role', true)) = 'service_role'
  OR COALESCE((SELECT current_setting('is_superuser', true)), 'false')::boolean = true
);

CREATE POLICY students_superadmin_all
ON public.students
FOR ALL
TO authenticated
USING (public.is_superadmin_safe())
WITH CHECK (public.is_superadmin_safe());

CREATE POLICY students_school_staff_select
ON public.students
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.role IN (
        'principal',
        'principal_admin',
        'admin',
        'preschool_admin',
        'teacher',
        'instructor',
        'coach',
        'superadmin',
        'super_admin'
      )
      AND COALESCE(p.organization_id, p.preschool_id) = students.preschool_id
  )
);

CREATE POLICY students_school_admin_modify
ON public.students
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.role IN ('principal', 'principal_admin', 'admin', 'preschool_admin', 'superadmin', 'super_admin')
      AND COALESCE(p.organization_id, p.preschool_id) = students.preschool_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.role IN ('principal', 'principal_admin', 'admin', 'preschool_admin', 'superadmin', 'super_admin')
      AND COALESCE(p.organization_id, p.preschool_id) = students.preschool_id
  )
);

CREATE POLICY parents_view_school_students
ON public.students
FOR SELECT
TO authenticated
USING (
  public.is_parent_of_student(id)
  OR students.preschool_id IN (SELECT public.get_my_children_preschool_ids())
);

CREATE POLICY students_parent_own_children
ON public.students
FOR SELECT
TO authenticated
USING (public.is_parent_of_student(id));

CREATE POLICY students_parent_update_own_children
ON public.students
FOR UPDATE
TO authenticated
USING (public.is_parent_of_student(id))
WITH CHECK (public.is_parent_of_student(id));

-- ---------------------------------------------------------------------------
-- Classes policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "classes_service_role" ON public.classes;
DROP POLICY IF EXISTS "classes_admin_all" ON public.classes;
DROP POLICY IF EXISTS "classes_teacher_select" ON public.classes;
DROP POLICY IF EXISTS "classes_org_members_select" ON public.classes;
DROP POLICY IF EXISTS "parents_view_child_classes" ON public.classes;
DROP POLICY IF EXISTS "staff_view_school_classes" ON public.classes;
DROP POLICY IF EXISTS "authenticated_read_classes" ON public.classes;
DROP POLICY IF EXISTS "classes_school_staff_manage" ON public.classes;
DROP POLICY IF EXISTS "classes_teacher_read_own" ON public.classes;
DROP POLICY IF EXISTS "classes_service_full" ON public.classes;

CREATE POLICY "classes_service_role"
ON public.classes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "classes_admin_all"
ON public.classes
FOR ALL
TO authenticated
USING (public.user_can_manage_classes(preschool_id))
WITH CHECK (public.user_can_manage_classes(preschool_id));

CREATE POLICY "classes_teacher_select"
ON public.classes
FOR SELECT
TO authenticated
USING (public.user_can_view_classes(preschool_id, teacher_id));

CREATE POLICY "parents_view_child_classes"
ON public.classes
FOR SELECT
TO authenticated
USING (
  id IN (SELECT public.get_my_children_class_ids())
  OR public.user_can_view_classes(preschool_id, teacher_id)
);

COMMENT ON POLICY students_school_staff_select ON public.students IS
'Staff can view students in their school without querying classes from RLS.';

COMMENT ON POLICY parents_view_school_students ON public.students IS
'Parents can view their own children and same-school learners through SECURITY DEFINER helpers.';

COMMENT ON POLICY "parents_view_child_classes" ON public.classes IS
'Parents can view child classes through SECURITY DEFINER helpers without querying students in RLS.';
