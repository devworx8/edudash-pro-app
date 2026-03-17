import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  type AdminUser,
  mapUserRole,
  getPermissionsForRole,
} from '@/lib/screen-styles/super-admin-admin-management.styles';

/** Map a profile role to its default department */
function getDepartmentForRole(role: string): string {
  const map: Record<string, string> = {
    system_admin: 'engineering',
    super_admin: 'engineering',
    superadmin: 'engineering',
    billing_admin: 'operations',
    content_moderator: 'content',
    support_admin: 'customer_success',
    admin: 'product',
  };
  return map[role.toLowerCase()] || 'customer_success';
}

/**
 * Fetches admin users from the profiles table filtered by admin roles.
 * Returns formatted AdminUser[] or empty array on error.
 */
export async function fetchAdminUsers(profileId: string): Promise<AdminUser[]> {
  try {
    const { data: usersData, error: usersError } = await assertSupabase()
      .from('profiles')
      .select('id, email, first_name, last_name, role, is_active, last_login_at, created_at, avatar_url')
      .in('role', ['admin', 'super_admin', 'superadmin', 'content_moderator', 'support_admin', 'billing_admin', 'system_admin'])
      .order('created_at', { ascending: false });

    if (usersError) {
      logger.error('Failed to fetch admin users:', usersError);
      return [];
    }

    if (!usersData || usersData.length === 0) {
      return [];
    }

    return usersData.map((user: any) => ({
      id: user.id,
      email: user.email || '',
      full_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Unknown',
      role: mapUserRole(user.role),
      department: getDepartmentForRole(user.role),
      permissions: getPermissionsForRole(user.role),
      is_active: user.is_active ?? true,
      last_login: user.last_login_at,
      created_at: user.created_at,
      created_by: profileId,
      avatar_url: user.avatar_url,
    }));
  } catch (error) {
    logger.error('Failed to fetch admin users:', error);
    return [];
  }
}
