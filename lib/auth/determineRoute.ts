/**
 * Route-determination helpers extracted from routeAfterLogin.ts
 *
 * Given an EnhancedUserProfile, these functions decide which dashboard
 * path the user should land on.
 */

import type { EnhancedUserProfile, Role } from '@/lib/rbac';
import {
  resolveSchoolTypeFromProfile,
} from '@/lib/schoolTypeResolver';
import { getDashboardRouteForRole } from '@/lib/dashboard/routeMatrix';
import { normalizeRole, resolveAdminSchoolType } from '@/lib/auth/roleResolution';

const debugEnabled = process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' || __DEV__;
const debugLog = (...args: unknown[]) => {
  if (debugEnabled) console.log(...args);
};
const debugWarn = (...args: unknown[]) => {
  if (debugEnabled) console.warn(...args);
};

// ──────────────────────────────────────────────
// SOA member-type list
// ──────────────────────────────────────────────

const SOA_SPECIFIC_MEMBER_TYPES = [
  // Executive
  'ceo', 'president', 'deputy_president', 'secretary_general', 'treasurer',
  'national_admin', 'national_coordinator', 'executive', 'board_member',
  // Youth wing
  'youth_president', 'youth_deputy', 'youth_secretary', 'youth_treasurer',
  'youth_coordinator', 'youth_facilitator', 'youth_mentor', 'youth_member',
  // Women's wing
  'women_president', 'women_deputy', 'women_secretary', 'women_treasurer',
  'women_coordinator', 'women_facilitator', 'women_mentor', 'women_member',
  // Veterans league
  'veterans_president', 'veterans_coordinator', 'veterans_member',
  // Regional/Provincial
  'regional_manager', 'regional_coordinator', 'provincial_manager', 'provincial_coordinator',
  'branch_manager',
] as const;

// ──────────────────────────────────────────────
// Route for SOA-specific member types
// ──────────────────────────────────────────────

function routeForSoaMemberType(
  memberType: string,
): { path: string; params?: Record<string, string> } | null {
  // CEO / National Admin / President / Executive leadership
  if (['national_admin', 'ceo', 'president', 'deputy_president', 'secretary_general', 'treasurer'].includes(memberType)) {
    return { path: '/screens/membership/ceo-dashboard' };
  }
  // National coordinators and executives
  if (['national_coordinator', 'executive', 'board_member'].includes(memberType)) {
    return { path: '/screens/membership/ceo-dashboard' };
  }
  // Youth Wing executives
  if (memberType === 'youth_president' || memberType === 'youth_deputy') {
    return { path: '/screens/membership/youth-president-dashboard' };
  }
  if (memberType === 'youth_secretary') {
    return { path: '/screens/membership/youth-secretary-dashboard' };
  }
  if (memberType === 'youth_treasurer') {
    return { path: '/screens/membership/youth-president-dashboard' };
  }
  // Youth Wing coordinators/facilitators/mentors
  if (['youth_coordinator', 'youth_facilitator', 'youth_mentor'].includes(memberType)) {
    return { path: '/screens/membership/youth-president-dashboard' };
  }
  // Regular youth members → learner
  if (memberType === 'youth_member') {
    return { path: '/screens/learner-dashboard' };
  }
  // Women's Wing
  if (memberType.startsWith('women_')) {
    return { path: '/screens/membership/women-dashboard' };
  }
  // Veterans League
  if (memberType.startsWith('veterans_')) {
    return { path: '/screens/membership/veterans-dashboard' };
  }
  // Regional / Provincial / Branch
  if (['regional_coordinator', 'provincial_coordinator', 'regional_manager', 'provincial_manager', 'branch_manager'].includes(memberType)) {
    return { path: '/screens/membership/dashboard' };
  }
  return null;
}

// ──────────────────────────────────────────────
// Independent-user routing
// ──────────────────────────────────────────────

function routeForIndependentUser(
  role: string,
): { path: string; params?: Record<string, string> } | null {
  switch (role) {
    case 'super_admin':
      return { path: '/screens/super-admin-dashboard' };
    case 'system_admin':
    case 'content_moderator':
    case 'support_admin':
    case 'billing_admin':
      return { path: '/screens/platform-admin-dashboard' };
    case 'admin':
      return { path: '/screens/org-onboarding' };
    case 'principal_admin':
      return { path: '/screens/principal-dashboard', params: { standalone: 'true' } };
    case 'teacher':
      return { path: '/screens/teacher-dashboard', params: { standalone: 'true' } };
    case 'parent':
      return { path: '/screens/parent-dashboard', params: { standalone: 'true' } };
    case 'student':
      return { path: '/screens/learner-dashboard', params: { standalone: 'true' } };
    default:
      // Independent user with no matching route — fall through
      return null;
  }
}

// ──────────────────────────────────────────────
// Main route determination
// ──────────────────────────────────────────────

/**
 * Determine the appropriate route for a user based on their enhanced profile.
 * Pure function — no side-effects other than debug logging.
 */
export function determineUserRoute(
  profile: EnhancedUserProfile,
): { path: string; params?: Record<string, string> } {
  const role = normalizeRole(profile.role);

  debugLog('[ROUTE DEBUG] ==> Determining route for user');
  debugLog('[ROUTE DEBUG] Original role:', profile.role, '-> normalized:', role);

  // ── Membership status ──────────────────────
  const membershipStatus =
    (profile as any)?.organization_membership?.membership_status ||
    (profile as any)?.membership_status;
  const isPendingMember =
    membershipStatus === 'pending' || membershipStatus === 'pending_verification';

  const executiveTypes = [
    'youth_president', 'youth_deputy', 'youth_secretary', 'youth_treasurer',
    'ceo', 'president', 'national_admin', 'secretary_general', 'treasurer',
  ];
  const memberType: string | undefined = (profile as any)?.organization_membership?.member_type;
  const isExecutive = !!memberType && executiveTypes.includes(memberType);

  if (isPendingMember && !isExecutive && role !== 'super_admin') {
    debugLog('[ROUTE DEBUG] User has pending membership - routing to membership-pending screen');
    return { path: '/screens/membership/membership-pending' };
  }

  // ── Organisation detection ─────────────────
  const hasOrganization = !!(profile.organization_id || (profile as any).preschool_id);
  const isIndependentUser = !hasOrganization;

  const memberRole = (profile as any)?.organization_membership?.role;

  debugLog('[ROUTE DEBUG] Organization membership member_type:', memberType);
  debugLog('[ROUTE DEBUG] Organization membership role:', memberRole);

  // ── SOA-specific member-type routing ───────
  const hasSoaSpecificRole = !!memberType && (SOA_SPECIFIC_MEMBER_TYPES as readonly string[]).includes(memberType);

  debugLog('[DEBUG_AGENT] RouteDecision-SOA_CHECK', JSON.stringify({
    memberType, hasSoaSpecificRole, hasOrganization, timestamp: Date.now(),
  }));

  if (hasSoaSpecificRole && hasOrganization) {
    const soaRoute = routeForSoaMemberType(memberType!);
    if (soaRoute) return soaRoute;
  }

  // ── School admin bypass ────────────────────
  const isSchoolAdminRole = role === 'admin' && !!resolveAdminSchoolType(profile);
  const schoolAdminRoles = ['super_admin', 'principal_admin', 'principal', 'teacher'];
  if (!((role && schoolAdminRoles.includes(role)) || isSchoolAdminRole)) {
    // Generic member types for non-school-admin users
    if (memberType && hasOrganization) {
      if (memberType === 'staff' || memberType === 'admin') {
        return { path: '/screens/membership/ceo-dashboard' };
      }
      if (['learner', 'facilitator', 'mentor', 'volunteer', 'member'].includes(memberType)) {
        return { path: '/screens/learner-dashboard' };
      }
    }
  }

  // ── Tenant kind ────────────────────────────
  const orgKind =
    (profile as any)?.organization_membership?.organization_kind ||
    (profile as any)?.organization_kind ||
    (profile as any)?.tenant_kind ||
    'school';
  const isSkillsLike = ['skills', 'tertiary', 'org'].includes(String(orgKind).toLowerCase());

  // ── Null role guard ────────────────────────
  // Route to /profiles-gate (not sign-in) to avoid redirect loop:
  // auth guard sees authenticated user on auth route → redirects to dashboard →
  // determineRoute sees null role → routes to sign-in → loop.
  if (!role) {
    console.warn('User role is null, routing to profiles-gate');
    return { path: '/profiles-gate' };
  }

  // ── Capability check (permissive) ──────────
  if (!profile.hasCapability('access_mobile_app')) {
    debugLog('[ROUTE DEBUG] User lacks access_mobile_app capability, allowing anyway');
  }

  // ── Independent users ──────────────────────
  if (isIndependentUser) {
    debugLog('[ROUTE DEBUG] Independent user detected');
    const independentRoute = routeForIndependentUser(role);
    if (independentRoute) return independentRoute;
  }

  // ── Role-based routing for org members ─────
  debugLog('[DEBUG_AGENT] RouteDecision-FALLBACK_TO_ROLE', JSON.stringify({
    role, memberType, hasOrganization, timestamp: Date.now(),
  }));

  const resolvedDashboardSchoolType = resolveSchoolTypeFromProfile(profile);
  debugLog('[ROUTE DEBUG] School type context:', {
    resolvedDashboardSchoolType,
    organizationId: profile.organization_id || (profile as any)?.preschool_id || null,
    organizationName:
      (profile as any)?.organization_name ||
      (profile as any)?.organization_membership?.organization_name ||
      null,
    schoolType:
      (profile as any)?.school_type ||
      (profile as any)?.organization_membership?.school_type ||
      null,
  });
  const resolveDashboardPathForRole = (roleValue: string): string | null =>
    getDashboardRouteForRole({
      role: roleValue,
      resolvedSchoolType: resolvedDashboardSchoolType,
      hasOrganization,
      traceContext: 'routeAfterLogin.resolveDashboardPathForRole',
    });

  switch (role) {
    case 'super_admin':
      return { path: '/screens/super-admin-dashboard' };

    case 'system_admin':
    case 'content_moderator':
    case 'support_admin':
    case 'billing_admin':
      return { path: '/screens/platform-admin-dashboard' };

    case 'admin': {
      debugWarn('[ROUTE DEBUG] Admin routing FALLBACK - member_type should have been used!', {
        memberType, hasOrganization, orgId: profile.organization_id,
      });
      const adminSchoolType = resolveAdminSchoolType(profile);
      const isSchoolDashboardOrg = adminSchoolType === 'preschool' || adminSchoolType === 'k12_school';
      if (isSchoolDashboardOrg) {
        return { path: '/screens/admin-dashboard', params: adminSchoolType ? { schoolType: adminSchoolType } : undefined };
      }
      return { path: '/screens/org-admin-dashboard' };
    }

    case 'principal_admin':
      if (isSkillsLike) return { path: '/screens/org-admin-dashboard' };
      return { path: resolveDashboardPathForRole('principal_admin') || '/screens/principal-dashboard' };

    case 'teacher':
      return { path: resolveDashboardPathForRole('teacher') || '/screens/teacher-dashboard' };

    case 'parent': {
      const parentPath = resolveDashboardPathForRole('parent') || '/screens/parent-dashboard';
      if (parentPath === '/(k12)/parent/dashboard') {
        return { path: parentPath, params: { schoolType: 'k12_school', mode: 'k12' } };
      }
      return { path: parentPath };
    }

    case 'student': {
      const studentPath =
        resolveDashboardPathForRole('student') ||
        (hasOrganization ? '/screens/learner-dashboard' : '/screens/student-dashboard');
      if (studentPath === '/(k12)/student/dashboard') {
        return { path: studentPath, params: { schoolType: 'k12_school', mode: 'k12' } };
      }
      return { path: studentPath };
    }
  }

  // Default fallback
  return { path: '/' };
}

// ──────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────

/**
 * Check if user has valid access to the mobile app.
 */
export function validateUserAccess(profile: EnhancedUserProfile | null): {
  hasAccess: boolean;
  reason?: string;
  suggestedAction?: string;
} {
  if (!profile) {
    return { hasAccess: false, reason: 'No user profile found', suggestedAction: 'Complete your profile setup' };
  }
  const role = normalizeRole(profile.role) as Role;
  if (role && ['parent', 'teacher', 'principal_admin', 'admin', 'super_admin', 'student', 'learner', 'independent_user', 'system_admin', 'content_moderator', 'support_admin', 'billing_admin'].includes(role)) {
    console.log('[validateUserAccess] User has valid role:', role, '- granting access');
    return { hasAccess: true };
  }
  if (!profile.hasCapability('access_mobile_app')) {
    return { hasAccess: false, reason: 'Mobile app access not enabled', suggestedAction: 'Contact your administrator' };
  }
  return { hasAccess: true };
}

/**
 * Get the appropriate route path for a given role (without navigation).
 */
export function getRouteForRole(role: Role | string | null): string {
  const normalized = normalizeRole(role as string);
  switch (normalized) {
    case 'super_admin': return '/screens/super-admin-dashboard';
    case 'system_admin':
    case 'content_moderator':
    case 'support_admin':
    case 'billing_admin': return '/screens/platform-admin-dashboard';
    case 'admin': return '/screens/org-admin-dashboard';
    case 'principal_admin': return '/screens/principal-dashboard';
    case 'teacher': return '/screens/teacher-dashboard';
    case 'parent': return '/screens/parent-dashboard';
    case 'student':
    case 'learner': return '/screens/learner-dashboard';
    default: return '/landing';
  }
}
