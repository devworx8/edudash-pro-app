/**
 * Role-resolution helpers extracted from routeAfterLogin.ts
 *
 * Pure(ish) functions that normalise roles, resolve admin school types,
 * and handle teacher-approval redirects.
 */

import { assertSupabase } from '@/lib/supabase';
import {
  normalizeResolvedSchoolType,
  type ResolvedSchoolType,
} from '@/lib/schoolTypeResolver';
import { fetchEnhancedUserProfile, type EnhancedUserProfile, type Role } from '@/lib/rbac';
import type { User } from '@supabase/supabase-js';
import { resolveTeacherApproval } from '@/lib/utils/resolveTeacherApproval';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** Legacy constant reused by registration and fallback screens. */
export const COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';

// ──────────────────────────────────────────────
// Role normalisation
// ──────────────────────────────────────────────

/**
 * Normalise free-form role strings to canonical `Role` values.
 * Returns `null` for unrecognised input.
 */
/** Sub-admin roles that are distinct platform admin types (NOT org admins). */
const PLATFORM_ADMIN_ROLES = ['content_moderator', 'support_admin', 'billing_admin', 'system_admin'];

export function normalizeRole(r?: string | null): string | null {
  if (!r) return null;
  const s = String(r).trim().toLowerCase();

  // Map potential variants to canonical Role types
  if (s.includes('super') || s === 'superadmin') return 'super_admin';
  // Note: 'admin' role is for Skills Development/Tertiary/Other orgs (separate from principal)
  if (s === 'principal' || s.includes('principal') || s.includes('school admin')) return 'principal_admin';
  if (s.includes('teacher')) return 'teacher';
  if (s.includes('parent')) return 'parent';
  if (s.includes('student') || s.includes('learner')) return 'student';

  // Platform admin sub-roles — keep distinct for RBAC routing
  if (PLATFORM_ADMIN_ROLES.includes(s)) return s;

  // Handle exact matches for the canonical types (including 'admin')
  if (['super_admin', 'principal_admin', 'admin', 'teacher', 'parent', 'student'].includes(s)) {
    return s;
  }

  console.warn('Unrecognized role:', r, '-> normalized to null');
  return null;
}

// ──────────────────────────────────────────────
// Admin-school-type detection
// ──────────────────────────────────────────────

/** Try various profile paths to resolve the school type for admin users. */
export function resolveAdminSchoolType(profile: EnhancedUserProfile): ResolvedSchoolType | null {
  const fromMembership = normalizeResolvedSchoolType(
    (profile as any)?.organization_membership?.school_type,
  );
  if (fromMembership) return fromMembership;

  const fromOrgKind = normalizeResolvedSchoolType(
    (profile as any)?.organization_membership?.organization_kind,
  );
  if (fromOrgKind) return fromOrgKind;

  const fromTenantKind = normalizeResolvedSchoolType(
    (profile as any)?.organization_kind || (profile as any)?.tenant_kind,
  );
  if (fromTenantKind) return fromTenantKind;

  return null;
}

// ──────────────────────────────────────────────
// Teacher-approval redirect
// ──────────────────────────────────────────────

/**
 * If the current user is a teacher whose approval is still pending or
 * rejected, return the redirect route. Otherwise `null`.
 */
export async function resolveTeacherApprovalRoute(
  profile: EnhancedUserProfile,
): Promise<{ path: string; params?: Record<string, string> } | null> {
  const role = normalizeRole(profile.role);
  if (role !== 'teacher') return null;

  const teacherId = profile.id;
  const schoolId = profile.organization_id || (profile as any)?.preschool_id || null;
  if (!teacherId || !schoolId) return null;

  const result = await resolveTeacherApproval(teacherId, schoolId);

  if (result.allowed) return null;

  if ('status' in result && result.status === 'rejected') {
    return { path: '/screens/teacher-approval-pending', params: { state: 'rejected' } };
  }

  return { path: '/screens/teacher-approval-pending' };
}

// ──────────────────────────────────────────────
// Legacy helper
// ──────────────────────────────────────────────

/**
 * Legacy function for backward compatibility
 * @deprecated Use fetchEnhancedUserProfile from RBAC instead
 */
export async function detectRoleAndSchool(
  user?: User | null,
): Promise<{ role: string | null; school: string | null }> {
  let authUser = user;
  if (!authUser) {
    const {
      data: { user: fetchedUser },
    } = await assertSupabase().auth.getUser();
    authUser = fetchedUser;
  }

  const id = authUser?.id;
  const metadata = authUser?.user_metadata as
    | { role?: string; preschool_id?: string }
    | undefined;
  let role: string | null = normalizeRole(metadata?.role ?? null);
  let school: string | null = metadata?.preschool_id ?? null;

  // Fallback: check profiles table by id (auth.users.id)
  if (id && (!role || school === null)) {
    try {
      const { data: udata, error: uerror } = await assertSupabase()
        .from('profiles')
        .select('role,preschool_id')
        .eq('id', id)
        .maybeSingle();
      if (!uerror && udata) {
        const profileData = udata as { role?: string; preschool_id?: string };
        role = normalizeRole(profileData.role ?? role);
        school = profileData.preschool_id ?? school;
      }
    } catch (e) {
      console.debug('Fallback #1 (profiles table) lookup failed', e);
    }
  }

  return { role, school };
}
