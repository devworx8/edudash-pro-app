export type PendingTeacherInvite = {
  token: string;
  email: string;
};

const STORAGE_KEY = 'pending_teacher_invite';

export function setPendingTeacherInvite(data: PendingTeacherInvite) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Non-fatal
  }
}

export function getPendingTeacherInvite(): PendingTeacherInvite | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingTeacherInvite;
    if (!parsed?.token || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingTeacherInvite() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal
  }
}
