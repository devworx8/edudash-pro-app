import { createHash, randomBytes } from 'crypto';

const DEFAULT_TRUSTED_TV_DAYS = 180;
const MIN_TRUSTED_TV_DAYS = 14;
const MAX_TRUSTED_TV_DAYS = 365;

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function createTrustedTvPairToken(bytes = 32): string {
  return toBase64Url(randomBytes(bytes));
}

export function hashTrustedTvPairToken(token: string): string {
  return createHash('sha256').update(String(token || '').trim()).digest('hex');
}

export function resolveTrustedTvDurationDays(rawValue: unknown = process.env.DISPLAY_TRUSTED_TV_DAYS): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return DEFAULT_TRUSTED_TV_DAYS;
  return Math.max(MIN_TRUSTED_TV_DAYS, Math.min(MAX_TRUSTED_TV_DAYS, Math.round(parsed)));
}

export function trustedTvExpiryIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
