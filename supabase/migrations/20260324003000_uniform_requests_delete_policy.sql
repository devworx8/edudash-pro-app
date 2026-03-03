BEGIN;

GRANT DELETE ON public.uniform_requests TO authenticated;

DROP POLICY IF EXISTS uniform_requests_staff_delete ON public.uniform_requests;
CREATE POLICY uniform_requests_staff_delete
ON public.uniform_requests
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
      AND COALESCE(p.organization_id, p.preschool_id) = uniform_requests.preschool_id
  )
);

DROP POLICY IF EXISTS uniform_requests_parent_delete ON public.uniform_requests;
CREATE POLICY uniform_requests_parent_delete
ON public.uniform_requests
FOR DELETE
TO authenticated
USING (
  student_id IN (SELECT get_my_children_ids())
);

COMMIT;
