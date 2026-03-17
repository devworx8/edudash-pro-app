-- Fix: "column reference class_id is ambiguous" (SQLSTATE 42702)
-- The function parameter "class_id" clashes with ct.class_id column.
-- Rename parameter to p_class_id to disambiguate.

-- CASCADE drops dependent policies (classes_teacher_select, parents_view_child_classes)
DROP FUNCTION IF EXISTS public.user_can_view_classes(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.user_can_view_classes(
  p_preschool_org_id uuid,
  p_class_id uuid
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
  SELECT p.preschool_id, p.organization_id, p.id, p.auth_user_id
  INTO user_preschool_id, user_org_id, user_profile_id, user_auth_id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
     OR p.id = auth.uid()
  LIMIT 1;

  -- Check if user is an assigned teacher for this class
  IF user_profile_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.class_teachers ct
      WHERE ct.class_id = p_class_id
        AND (
          ct.teacher_id = user_profile_id
          OR ct.teacher_id = auth.uid()
          OR (user_auth_id IS NOT NULL AND ct.teacher_id = user_auth_id)
        )
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Fallback: check by auth.uid() directly
  IF EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = p_class_id
      AND ct.teacher_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  -- Same org = can view
  IF COALESCE(user_preschool_id, user_org_id) = p_preschool_org_id THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Re-create policies that were dropped by CASCADE
CREATE POLICY "classes_teacher_select"
ON public.classes
FOR SELECT
TO authenticated
USING (public.user_can_view_classes(preschool_id, id));

CREATE POLICY "parents_view_child_classes"
ON public.classes
FOR SELECT
TO authenticated
USING (
  id IN (SELECT public.get_my_children_class_ids())
  OR public.user_can_view_classes(preschool_id, id)
);

-- Notify PostgREST to reload schema cache (picks up new class_teachers table too)
NOTIFY pgrst, 'reload schema';
