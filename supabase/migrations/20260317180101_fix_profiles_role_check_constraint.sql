-- Fix: profiles_role_check constraint was missing admin sub-roles and other RBAC roles.
-- The RPC superadmin_update_user_role validates roles itself, but the table CHECK
-- constraint also blocks invalid values at the row level.
--
-- Drop the old constraint and recreate with the full RBAC role set.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (
    role IN (
      'principal',
      'principal_admin',
      'teacher',
      'parent',
      'student',
      'learner',
      'super_admin',
      'superadmin',
      'admin',
      'independent_user',
      'content_moderator',
      'support_admin',
      'billing_admin',
      'system_admin'
    )
  );

NOTIFY pgrst, 'reload schema';
