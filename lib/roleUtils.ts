/**
 * Role utility functions for consistent role checking across the application
 */

export type UserRole = 'student' | 'parent' | 'teacher' | 'principal' | 'principal_admin' | 'super_admin';

/** Platform admin sub-roles that operate at the platform (not organization) level. */
export const PLATFORM_ADMIN_ROLES = ['system_admin', 'content_moderator', 'support_admin', 'billing_admin'] as const;
export type PlatformAdminRole = typeof PLATFORM_ADMIN_ROLES[number];

/**
 * Check if a user has super admin privileges
 * Handles all possible super admin role variants for maximum compatibility
 */
export function isSuperAdmin(role?: string | null): boolean {
  if (!role) return false;
  const normalizedRole = String(role).trim().toLowerCase();
  
  // Check for all possible super admin role variants
  // NOTE: 'admin' is NOT included here because it's used for organization admins
  // Only platform-level super admin roles should pass this check
  return normalizedRole === 'super_admin' || 
         normalizedRole === 'superadmin' ||
         normalizedRole === 'super-admin' ||
         normalizedRole === 'platform_admin';
}

/**
 * Check if a user has any platform-level admin privileges.
 * Includes super_admin AND all platform admin sub-roles.
 * Use this for screen guards where any platform staff should have access.
 */
export function isPlatformStaff(role?: string | null): boolean {
  if (!role) return false;
  if (isSuperAdmin(role)) return true;
  const r = String(role).trim().toLowerCase();
  return (PLATFORM_ADMIN_ROLES as readonly string[]).includes(r);
}

/**
 * Check if a user has a platform admin sub-role (NOT super_admin).
 */
export function isPlatformAdmin(role?: string | null): boolean {
  if (!role) return false;
  const r = String(role).trim().toLowerCase();
  return (PLATFORM_ADMIN_ROLES as readonly string[]).includes(r);
}

/**
 * Check if a user has principal-level privileges (principal or super admin)
 */
export function isPrincipalOrAbove(role?: string | null): boolean {
  if (!role) return false;
  const normalizedRole = String(role).trim().toLowerCase();
  
  return isSuperAdmin(role) ||
         normalizedRole === 'principal' ||
         normalizedRole === 'principal_admin';
}

/**
 * Check if a user has teacher-level privileges or above
 */
export function isTeacherOrAbove(role?: string | null): boolean {
  if (!role) return false;
  const normalizedRole = String(role).trim().toLowerCase();
  
  return isPrincipalOrAbove(role) ||
         normalizedRole === 'teacher';
}

/**
 * Get a human-readable display name for a role
 */
export function getRoleDisplayName(role?: string | null): string {
  if (!role) return 'Unknown';
  
  const normalizedRole = String(role).trim().toLowerCase();
  
  switch (normalizedRole) {
    case 'super_admin':
    case 'superadmin':
    case 'super-admin':
    case 'platform_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'system_admin':
      return 'System Admin';
    case 'content_moderator':
      return 'Content Moderator';
    case 'support_admin':
      return 'Support Admin';
    case 'billing_admin':
      return 'Billing Admin';
    case 'principal':
      return 'Principal';
    case 'principal_admin':
      return 'Principal Admin';
    case 'teacher':
      return 'Teacher';
    case 'parent':
      return 'Parent';
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

/**
 * Normalize role value to the standard format used in the system
 */
export function normalizeRole(role?: string | null): UserRole | null {
  if (!role) return null;
  
  const normalizedRole = String(role).trim().toLowerCase();
  
  if (isSuperAdmin(role)) return 'super_admin';
  if (normalizedRole === 'principal') return 'principal';
  if (normalizedRole === 'principal_admin') return 'principal_admin';
  // Teachers, instructors, facilitators, trainers, coaches all map to teacher
  if (normalizedRole === 'teacher' || 
      normalizedRole === 'instructor' ||
      normalizedRole === 'facilitator' ||
      normalizedRole === 'trainer' ||
      normalizedRole === 'coach') return 'teacher';
  // Parents, guardians, sponsors map to parent
  if (normalizedRole === 'parent' ||
      normalizedRole === 'guardian' ||
      normalizedRole === 'sponsor') return 'parent';
  // Students, learners map to student
  if (normalizedRole === 'student' ||
      normalizedRole === 'learner') return 'student';
  
  return null;
}

/**
 * Roles that can manage AI quota allocations
 */
export const PRINCIPAL_ROLES = new Set(['principal', 'principal_admin', 'super_admin']);

/**
 * Check if a user role can manage AI quota allocations
 */
export function canManageAllocationsRole(role?: string | null): boolean {
  if (!role) return false;
  const normalizedRole = String(role).trim().toLowerCase();
  return PRINCIPAL_ROLES.has(normalizedRole as UserRole) || isSuperAdmin(role);
}

/**
 * Check if a user is a teacher (includes facilitators, instructors, etc.)
 */
export function isTeacher(role?: string | null): boolean {
  if (!role) return false;
  const normalizedRole = String(role).trim().toLowerCase();
  return normalizedRole === 'teacher' || 
         normalizedRole === 'instructor' ||
         normalizedRole === 'facilitator' ||
         normalizedRole === 'trainer' ||
         normalizedRole === 'coach';
}

/**
 * Derive canonical preschool ID from enhanced profile
 * Handles different profile structures for scope resolution
 */
export function derivePreschoolId(profile: any | null | undefined): string | null {
  if (!profile) return null;
  
  // Try different possible field names based on your schema
  return profile.preschool_id || 
         profile.preschoolId || 
         profile.organization_id || 
         profile.organizationId || 
         profile.school_id ||
         profile.schoolId ||
         null;
}

/**
 * Get allocation scope for a profile
 */
export function getAllocationScope(profile: any | null | undefined) {
  const preschoolId = derivePreschoolId(profile);
  return { preschoolId };
}
