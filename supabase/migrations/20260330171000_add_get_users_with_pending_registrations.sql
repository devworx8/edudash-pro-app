-- Helper function for cron: find users with pending children in metadata
CREATE OR REPLACE FUNCTION public.get_users_with_pending_registrations()
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
  SELECT au.id
  FROM auth.users au
  WHERE au.raw_user_meta_data ? 'pending_children'
    AND jsonb_array_length(au.raw_user_meta_data->'pending_children') > 0;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_with_pending_registrations() TO service_role;
