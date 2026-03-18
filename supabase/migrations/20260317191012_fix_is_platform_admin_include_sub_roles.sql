-- Fix is_platform_admin() to include all platform sub-admin roles.
-- Required for team chat, activity log, and shared screen RLS access.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN (
            'superadmin', 'super_admin', 'platform_admin', 'admin',
            'system_admin', 'content_moderator', 'support_admin', 'billing_admin'
          )
    );
$$;
