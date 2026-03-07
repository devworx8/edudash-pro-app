const RECOVERY_WINDOW_MS = 60 * 60 * 1000;

function normalize(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

export function isRecentRecoverySentAt(
  recoverySentAt?: string | null,
  nowMs: number = Date.now(),
  windowMs: number = RECOVERY_WINDOW_MS,
): boolean {
  if (!recoverySentAt) return false;
  const sentAtMs = new Date(recoverySentAt).getTime();
  if (!Number.isFinite(sentAtMs)) return false;
  return nowMs - sentAtMs <= windowMs;
}

export function resolveIsRecoveryFlow(input: {
  type?: string | null;
  flow?: string | null;
  recoverySentAt?: string | null;
  hasRecoveryFlag?: boolean;
  nowMs?: number;
}): boolean {
  const normalizedType = normalize(input.type);
  const normalizedFlow = normalize(input.flow);

  if (normalizedType === 'recovery' || normalizedFlow === 'recovery') return true;
  if (input.hasRecoveryFlag) return true;

  return isRecentRecoverySentAt(input.recoverySentAt, input.nowMs);
}
