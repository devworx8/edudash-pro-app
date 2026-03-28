import { storage } from '@/lib/storage';

const SUPERADMIN_IMPERSONATION_KEY = 'superadmin_impersonation_session_v1';
const STALE_IMPERSONATION_MS = 1000 * 60 * 60 * 24;

export interface SuperAdminImpersonationSession {
  adminUserId: string;
  adminEmail: string;
  adminRole?: string | null;
  targetUserId: string;
  targetEmail: string;
  targetRole?: string | null;
  startedAt: string;
  returnPath?: string | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSession(
  value: unknown,
): SuperAdminImpersonationSession | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.adminUserId) ||
    !isNonEmptyString(candidate.adminEmail) ||
    !isNonEmptyString(candidate.targetUserId) ||
    !isNonEmptyString(candidate.targetEmail) ||
    !isNonEmptyString(candidate.startedAt)
  ) {
    return null;
  }

  return {
    adminUserId: candidate.adminUserId.trim(),
    adminEmail: candidate.adminEmail.trim(),
    adminRole: isNonEmptyString(candidate.adminRole) ? candidate.adminRole.trim() : null,
    targetUserId: candidate.targetUserId.trim(),
    targetEmail: candidate.targetEmail.trim(),
    targetRole: isNonEmptyString(candidate.targetRole) ? candidate.targetRole.trim() : null,
    startedAt: candidate.startedAt.trim(),
    returnPath: isNonEmptyString(candidate.returnPath) ? candidate.returnPath.trim() : null,
  };
}

function isStale(session: SuperAdminImpersonationSession): boolean {
  const startedAtMs = new Date(session.startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) return true;
  return Date.now() - startedAtMs > STALE_IMPERSONATION_MS;
}

export async function setSuperAdminImpersonationSession(
  session: SuperAdminImpersonationSession,
): Promise<void> {
  await storage.setItem(
    SUPERADMIN_IMPERSONATION_KEY,
    JSON.stringify(session),
  );
}

export async function getSuperAdminImpersonationSession(): Promise<SuperAdminImpersonationSession | null> {
  try {
    const raw = await storage.getItem(SUPERADMIN_IMPERSONATION_KEY);
    if (!raw) return null;
    const parsed = normalizeSession(JSON.parse(raw));
    if (!parsed || isStale(parsed)) {
      await clearSuperAdminImpersonationSession();
      return null;
    }
    return parsed;
  } catch {
    await clearSuperAdminImpersonationSession();
    return null;
  }
}

export async function clearSuperAdminImpersonationSession(): Promise<void> {
  await storage.removeItem(SUPERADMIN_IMPERSONATION_KEY);
}
