/**
 * Request Deduplication Utility
 * 
 * Prevents redundant concurrent requests for the same data.
 * Uses a promise-sharing pattern to coalesce duplicate requests.
 * 
 * @module lib/dashboard/requestDeduplication
 */

type PendingRequest<T> = {
  promise: Promise<T>;
  timestamp: number;
};

/**
 * In-flight request cache for deduplication.
 * Key: unique request identifier
 * Value: shared promise + timestamp
 */
const pendingRequests = new Map<string, PendingRequest<unknown>>();

/**
 * Default TTL for cached promises (prevents memory leaks from stale entries)
 */
const DEFAULT_TTL_MS = 30_000;

/**
 * Generate a unique key for the request
 */
export function createRequestKey(namespace: string, ...identifiers: (string | number | undefined | null)[]): string {
  const validIds = identifiers.filter(id => id != null);
  return `${namespace}:${validIds.join(':')}`;
}

/**
 * Execute a request with deduplication.
 * If an identical request is already in-flight, returns the existing promise.
 * 
 * @param key - Unique identifier for this request
 * @param fetcher - Async function that performs the actual fetch
 * @param ttlMs - How long to keep the promise in the cache (default 30s)
 * @returns Promise that resolves to the fetched data
 * 
 * @example
 * const data = await dedupeRequest(
 *   createRequestKey('teacher-dashboard', userId),
 *   () => fetchTeacherDashboardData(userId)
 * );
 */
export async function dedupeRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  // Check for existing in-flight request
  const existing = pendingRequests.get(key) as PendingRequest<T> | undefined;
  
  if (existing) {
    // Check if the cached promise is still valid
    if (Date.now() - existing.timestamp < ttlMs) {
      return existing.promise as Promise<T>;
    }
    // Stale entry, remove it
    pendingRequests.delete(key);
  }

  // Create new request
  const promise = fetcher();
  
  // Store in cache
  pendingRequests.set(key, {
    promise: promise as Promise<unknown>,
    timestamp: Date.now(),
  });

  // Clean up after resolution
  try {
    const result = await promise;
    return result;
  } finally {
    // Remove from pending after resolution (success or failure)
    pendingRequests.delete(key);
  }

  return promise;
}

/**
 * Clear all pending requests (useful for logout or cache invalidation)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

/**
 * Get the count of pending requests (for debugging/monitoring)
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Check if a specific request is pending
 */
export function isRequestPending(key: string): boolean {
  return pendingRequests.has(key);
}