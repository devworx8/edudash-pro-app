import { createHmac, timingSafeEqual } from 'crypto';

const SEP = '.';
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (3 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export interface DisplayTokenPayload {
  org: string;
  class?: string;
  exp: number;
}

export function createDisplayToken(
  payload: Omit<DisplayTokenPayload, 'exp'>,
  secret: string
): string {
  const exp = Date.now() + EXPIRY_MS;
  const payloadStr = JSON.stringify({ ...payload, exp });
  const payloadB64 = base64UrlEncode(Buffer.from(payloadStr, 'utf8'));
  const sig = createHmac('sha256', secret).update(payloadB64).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}${SEP}${sigB64}`;
}

export function verifyDisplayToken(token: string, secret: string): DisplayTokenPayload | null {
  if (!token || !secret) return null;
  const i = token.lastIndexOf(SEP);
  if (i <= 0) return null;
  const payloadB64 = token.slice(0, i);
  const sigB64 = token.slice(i + 1);
  try {
    const sig = base64UrlDecode(sigB64);
    const expected = createHmac('sha256', secret).update(payloadB64).digest();
    if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
    const payloadStr = base64UrlDecode(payloadB64).toString('utf8');
    const decoded = JSON.parse(payloadStr) as DisplayTokenPayload;
    if (typeof decoded.exp !== 'number' || decoded.exp < Date.now()) return null;
    if (!decoded.org || typeof decoded.org !== 'string') return null;
    return decoded;
  } catch {
    return null;
  }
}
