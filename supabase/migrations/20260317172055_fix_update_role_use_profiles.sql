-- Fix: superadmin_update_user_role was querying deprecated `users` table.
-- Now uses `profiles` where profiles.id = auth.uid().

CREATE OR REPLACE FUNCTION public.superadmin_update_user_role(
  target_user_id uuid,
  new_role text,
  reason text DEFAULT 'Administrative role change'::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  target_profile RECORD;
  old_role TEXT;
BEGIN
  -- Check if current user is superadmin
  IF NOT is_superadmin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Access denied: Superadmin privileges required'
    );
  END IF;

  -- Validate new role
  IF new_role NOT IN ('principal', 'teacher', 'parent', 'student', 'super_admin', 'superadmin', 'admin', 'independent_user') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid role. Must be: principal, teacher, parent, student, super_admin, admin, or independent_user'
    );
  END IF;

  -- Get target user from profiles (profiles.id = auth.uid())
  SELECT id, email, role, full_name
  INTO target_profile
  FROM public.profiles
  WHERE id = target_user_id;

  -- Check if user exists
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found in profiles'
    );
  END IF;

  old_role := target_profile.role;

  -- Prevent changing role from/to superadmin unless current user is superadmin
  IF (old_role IN ('super_admin', 'superadmin') OR new_role IN ('super_admin', 'superadmin')) AND NOT is_superadmin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot change superadmin role'
    );
  END IF;

  -- Update the profile role
  UPDATE public.profiles
  SET
    role = new_role,
    updated_at = NOW()
  WHERE id = target_user_id;

  -- Also update legacy users table if it exists (for backward compat)
  UPDATE public.users
  SET
    role = new_role,
    updated_at = NOW()
  WHERE auth_user_id = target_user_id;

  -- Log the role change to platform_activity_log
  INSERT INTO public.platform_activity_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'user_role_updated',
    'profile',
    target_user_id,
    jsonb_build_object(
      'target_email', target_profile.email,
      'target_name', target_profile.full_name,
      'old_role', old_role,
      'new_role', new_role,
      'reason', reason
    )
  );

  RETURN json_build_object(
    'success', true,
    'message', 'User role updated successfully',
    'target_user_id', target_user_id,
    'old_role', old_role,
    'new_role', new_role,
    'reason', reason
  );
END;
$function$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
