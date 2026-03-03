/**
 * Shared CORS configuration for all Edge Functions.
 *
 * Supports environment-driven allowlists via `ALLOWED_WEB_ORIGINS`
 * (comma-separated exact origins) while keeping safe defaults.
 */

const ALLOWED_ORIGINS = [
  'https://www.edudashpro.org.za',
  'https://edudashpro.org.za',
  'https://app.edudashpro.org.za',
  'https://admin.edudashpro.org.za',
];

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:19006',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
  'http://127.0.0.1:8083',
  'http://127.0.0.1:19006',
];

function parseOriginList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isPrivateLanOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    const classB = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (classB) {
      const secondOctet = Number(classB[1]);
      return secondOctet >= 16 && secondOctet <= 31;
    }
    return false;
  } catch {
    return false;
  }
}

function getAllowedOrigins(): string[] {
  const envOrigins = parseOriginList(Deno.env.get('ALLOWED_WEB_ORIGINS'));
  return Array.from(new Set([...ALLOWED_ORIGINS, ...envOrigins]));
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') || '';
  const requestedHeaders = req?.headers.get('Access-Control-Request-Headers');
  const environment = Deno.env.get('ENVIRONMENT') || 'production';
  const corsOverride = Deno.env.get('CORS_ALLOW_ORIGIN');
  const allowedOrigins = getAllowedOrigins();
  const defaultOrigin = allowedOrigins[0] || ALLOWED_ORIGINS[0];

  // If explicit override is set, use it
  if (corsOverride) {
    const overrides = parseOriginList(corsOverride);
    const mergedOverrides = Array.from(new Set([...overrides, ...allowedOrigins]));
    if (overrides.includes('*')) {
      return buildHeaders('*', requestedHeaders);
    }
    if (!origin) {
      return buildHeaders(mergedOverrides[0] || defaultOrigin, requestedHeaders);
    }
    if (mergedOverrides.includes(origin)) {
      return buildHeaders(origin, requestedHeaders);
    }
    if (DEV_ORIGINS.includes(origin) || isPrivateLanOrigin(origin)) {
      return buildHeaders(origin, requestedHeaders);
    }
    return buildHeaders(mergedOverrides[0] || defaultOrigin, requestedHeaders);
  }

  if (!origin) {
    return buildHeaders(defaultOrigin, requestedHeaders);
  }

  // In development, allow dev origins
  if (environment === 'development' || environment === 'local') {
    if (DEV_ORIGINS.includes(origin) || isPrivateLanOrigin(origin) || allowedOrigins.includes(origin)) {
      return buildHeaders(origin, requestedHeaders);
    }
    return buildHeaders(defaultOrigin, requestedHeaders);
  }

  // In production, allow known origins
  if (allowedOrigins.includes(origin)) {
    return buildHeaders(origin, requestedHeaders);
  }

  // Always allow localhost for local dev against deployed functions
  if (DEV_ORIGINS.includes(origin)) {
    return buildHeaders(origin, requestedHeaders);
  }

  if (isPrivateLanOrigin(origin)) {
    return buildHeaders(origin, requestedHeaders);
  }

  return buildHeaders(defaultOrigin, requestedHeaders);
}

function buildHeaders(origin: string, requestedHeaders?: string | null): Record<string, string> {
  const allowHeaders = requestedHeaders?.trim()
    ? requestedHeaders
    : 'authorization, x-client-info, apikey, content-type, accept, origin, x-requested-with';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    Vary: 'Origin, Access-Control-Request-Headers',
  };
}

/**
 * Handle OPTIONS preflight request
 */
export function handleCorsOptions(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}
