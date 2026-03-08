/**
 * Centralized runtime URL helpers for app/web links.
 * Keep operational links in one place to avoid scattered hardcoded domains.
 */

export const DEFAULT_EDUDASH_WEB_URL = 'https://www.edudashpro.org.za';
export const DEFAULT_SOA_WEB_URL = 'https://www.soilofafrica.org';

export const SUPPORT_EMAIL_EDUDASH = 'support@edudashpro.org.za';
export const SUPPORT_EMAIL_SOA = 'support@soilofafrica.org';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizePath(path: string): string {
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function getOptionalEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getEduDashWebBaseUrl(): string {
  return normalizeBaseUrl(
    getOptionalEnv('EXPO_PUBLIC_APP_WEB_URL') ||
      getOptionalEnv('EXPO_PUBLIC_WEB_URL') ||
      DEFAULT_EDUDASH_WEB_URL,
  );
}

export function getSoaWebBaseUrl(): string {
  return normalizeBaseUrl(
    getOptionalEnv('EXPO_PUBLIC_SOA_WEB_URL') || DEFAULT_SOA_WEB_URL,
  );
}

export function buildEduDashWebUrl(path: string): string {
  return `${getEduDashWebBaseUrl()}${normalizePath(path)}`;
}

export function buildSoaWebUrl(path: string): string {
  return `${getSoaWebBaseUrl()}${normalizePath(path)}`;
}

