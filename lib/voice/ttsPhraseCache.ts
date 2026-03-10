/**
 * TTS Phrase Cache
 * 
 * Caches audio URLs for frequently used phrases to reduce
 * network latency for common responses like praise, transitions, etc.
 * 
 * Uses LRU eviction with size limits.
 */

interface CacheEntry {
  audioUrl: string;
  timestamp: number;
  language: string;
  voiceId?: string;
}

// Maximum cache entries (prevents memory bloat)
const MAX_CACHE_ENTRIES = 50;

// Cache TTL: 30 minutes (audio URLs may expire)
const CACHE_TTL_MS = 30 * 60 * 1000;

// Cache storage
const cache = new Map<string, CacheEntry>();

// Common phrases that benefit from caching
const CACHEABLE_PHRASES = [
  // Praise phrases
  'Great job!',
  'Well done!',
  'Excellent!',
  'Good try!',
  'Keep going!',
  'You got it!',
  'Perfect!',
  'Amazing!',
  'Wonderful!',
  'Fantastic!',
  // Transition phrases
  'Let me think...',
  'Here is the answer.',
  'Good question!',
  'Try again!',
  "You're doing great!",
  // Phonics phrases
  'Can you say it with me?',
  'Say the sound.',
  'Listen carefully.',
  'Now you try.',
];

/**
 * Generate a cache key for a phrase
 */
function getCacheKey(text: string, language: string, voiceId?: string): string {
  const normalizedText = text.trim().toLowerCase();
  const voice = voiceId || 'default';
  return `${language}:${voice}:${normalizedText}`;
}

/**
 * Check if a phrase should be cached
 */
export function shouldCachePhrase(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  // Cache short phrases (under 100 chars) that match common patterns
  if (text.length > 100) return false;
  
  return CACHEABLE_PHRASES.some(phrase => 
    normalized.includes(phrase.toLowerCase())
  );
}

/**
 * Get a cached audio URL if available
 */
export function getCachedPhrase(
  text: string,
  language: string,
  voiceId?: string
): string | null {
  const key = getCacheKey(text, language, voiceId);
  const entry = cache.get(key);
  
  if (!entry) return null;
  
  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  
  // Verify language and voice match
  if (entry.language !== language) return null;
  if (voiceId && entry.voiceId !== voiceId) return null;
  
  return entry.audioUrl;
}

/**
 * Cache an audio URL for a phrase
 */
export function cachePhrase(
  text: string,
  audioUrl: string,
  language: string,
  voiceId?: string
): void {
  if (!shouldCachePhrase(text)) return;
  
  const key = getCacheKey(text, language, voiceId);
  
  // LRU eviction: remove oldest entries if at capacity
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  
  cache.set(key, {
    audioUrl,
    timestamp: Date.now(),
    language,
    voiceId,
  });
}

/**
 * Clear the entire cache (e.g., on language change)
 */
export function clearPhraseCache(): void {
  cache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getPhraseCacheStats(): {
  entries: number;
  maxSize: number;
  ttlMs: number;
} {
  return {
    entries: cache.size,
    maxSize: MAX_CACHE_ENTRIES,
    ttlMs: CACHE_TTL_MS,
  };
}

export default {
  shouldCachePhrase,
  getCachedPhrase,
  cachePhrase,
  clearPhraseCache,
  getPhraseCacheStats,
};