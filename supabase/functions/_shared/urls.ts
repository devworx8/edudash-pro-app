/**
 * Shared URL helpers for Edge Functions.
 */

const DEFAULT_APP_URL = 'https://app.edudashpro.org.za';
const DEFAULT_WEB_BASE_URL = 'https://www.edudashpro.org.za';
const DEFAULT_SOA_WEB_URL = 'https://www.soilofafrica.org';

function sanitizeBaseUrl(value: string, fallback: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function withLeadingSlash(path: string): string {
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

export const APP_URL = sanitizeBaseUrl(
  Deno.env.get('APP_URL') || '',
  DEFAULT_APP_URL,
);

export const WEB_BASE_URL = sanitizeBaseUrl(
  Deno.env.get('WEB_BASE_URL') || Deno.env.get('APP_URL') || '',
  DEFAULT_WEB_BASE_URL,
);

export const SOA_WEB_URL = sanitizeBaseUrl(
  Deno.env.get('SOA_WEB_URL') || '',
  DEFAULT_SOA_WEB_URL,
);

export function buildAppUrl(path: string): string {
  return `${APP_URL}${withLeadingSlash(path)}`;
}

export function buildWebUrl(path: string): string {
  return `${WEB_BASE_URL}${withLeadingSlash(path)}`;
}

export function buildSoaWebUrl(path: string): string {
  return `${SOA_WEB_URL}${withLeadingSlash(path)}`;
}

