/**
 * Session Token Cache
 * 
 * Shared cache for Supabase session tokens to avoid repeated
 * getSession() calls across TTS and STT modules.
 * 
 * Tokens are cached for 4 minutes (typical token TTL is 1 hour).
 * Provides proactive refresh capability to ensure tokens are always fresh.
 */

type CachedToken = {
  token: string;
  expiresAt: number;
  fetchedAt: number;
};

// Global cache instance
let cachedToken: CachedToken | null = null;

// Cache duration: 4 minutes (tokens typically valid 1 hour)
const CACHE_DURATION_MS = 4 * 60 * 1000;

// Proactive refresh threshold: refresh if token is older than 3 minutes
const PROACTIVE_REFRESH_THRESHOLD_MS = 3 * 60 * 1000;

/**
 * Check if the cached token is still valid
 */
export function isTokenValid(): boolean {
  if (!cachedToken) return false;
  return Date.now() < cachedToken.expiresAt;
}

/**
 * Check if the token should be proactively refreshed
 * (still valid but getting old)
 */
export function shouldProactiveRefresh(): boolean {
  if (!cachedToken) return true;
  const age = Date.now() - cachedToken.fetchedAt;
  return age > PROACTIVE_REFRESH_THRESHOLD_MS;
}

/**
 * Get the cached token if valid
 */
export function getCachedToken(): string | null {
  if (!isTokenValid()) {
    cachedToken = null;
    return null;
  }
  return cachedToken.token;
}

/**
 * Set the cached token
 */
export function setCachedToken(token: string): void {
  const now = Date.now();
  cachedToken = {
    token,
    expiresAt: now + CACHE_DURATION_MS,
    fetchedAt: now,
  };
}

/**
 * Invalidate the cache (e.g., on auth state change)
 */
export function invalidateTokenCache(): void {
  cachedToken = null;
}

/**
 * Get token age in milliseconds (for debugging/metrics)
 */
export function getTokenAge(): number | null {
  if (!cachedToken) return null;
  return Date.now() - cachedToken.fetchedAt;
}

/**
 * Hook-compatible token getter that accepts a fetcher function
 * This allows the cache to be used with Supabase auth
 */
export async function getOrFetchToken(
  fetcher: () => Promise<string | null>
): Promise<string | null> {
  // Return cached token if valid and not too old
  const cached = getCachedToken();
  if (cached && !shouldProactiveRefresh()) {
    return cached;
  }

  // Fetch fresh token
  try {
    const freshToken = await fetcher();
    if (freshToken) {
      setCachedToken(freshToken);
      return freshToken;
    }
  } catch (error) {
    // If fetch fails but we have a valid cached token, use it
    if (cached) {
      console.warn('[SessionTokenCache] Fetch failed, using cached token');
      return cached;
    }
    throw error;
  }

  return getCachedToken();
}

export default {
  isTokenValid,
  shouldProactiveRefresh,
  getCachedToken,
  setCachedToken,
  invalidateTokenCache,
  getTokenAge,
  getOrFetchToken,
};