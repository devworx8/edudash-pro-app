import { Platform } from 'react-native'
import { assertSupabase } from '@/lib/supabase'

// Dynamically import SecureStore to avoid web issues
let SecureStore: any = null;
try {
  if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
  }
} catch (e) {
  console.debug('SecureStore import failed (web or unsupported platform)', e);
}

// Dynamically require AsyncStorage to avoid web/test issues
let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  console.debug('AsyncStorage import failed (non-React Native env?)', e);
  // Web fallback using localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    AsyncStorage = {
      getItem: async (key: string) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // ignore
        }
      },
      removeItem: async (key: string) => {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore
        }
      },
    };
  }
}

// SecureStore adapter (preferred for iOS). Note: SecureStore has a ~2KB limit per item on Android.
const SecureStoreAdapter = SecureStore ? {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, { keychainService: key }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
} : null;

// AsyncStorage adapter (preferred for Android, no 2KB limit)
const AsyncStorageAdapter = AsyncStorage
  ? {
      getItem: (key: string) => AsyncStorage.getItem(key),
      setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
      removeItem: (key: string) => AsyncStorage.removeItem(key),
    }
  : null;

// In-memory fallback for tests or environments without the above storages
const MemoryStorageAdapter = {
  _map: new Map<string, string>(),
  getItem: async (key: string) => (MemoryStorageAdapter._map.has(key) ? MemoryStorageAdapter._map.get(key)! : null),
  setItem: async (key: string, value: string) => {
    MemoryStorageAdapter._map.set(key, value);
  },
  removeItem: async (key: string) => {
    MemoryStorageAdapter._map.delete(key);
  },
};

function chooseStorage() {
  try {
    // Web platform: use localStorage via AsyncStorage or memory fallback
    if (Platform?.OS === 'web') {
      if (AsyncStorageAdapter) return AsyncStorageAdapter;
      return MemoryStorageAdapter;
    }
    // Use AsyncStorage on Android to avoid SecureStore size limit warning/failures
    if (Platform?.OS === 'android' && AsyncStorageAdapter) return AsyncStorageAdapter;
    // iOS and other platforms: prefer SecureStore; fall back if unavailable
    if (SecureStoreAdapter) return SecureStoreAdapter;
    if (AsyncStorageAdapter) return AsyncStorageAdapter;
  } catch (e) {
    console.debug('chooseStorage unexpected error', e);
  }
  return MemoryStorageAdapter;
}

const storage = chooseStorage();

export type AIUsageFeature =
  | 'lesson_generation'
  | 'grading_assistance'
  | 'homework_help'
  | 'homework_help_agentic'
  | 'transcription'

const STORAGE_PREFIX = 'ai_usage'

function monthKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${y}${m}`
}

async function getCurrentUserId(): Promise<string> {
  try {
    const { data } = await assertSupabase().auth.getUser()
    return data?.user?.id || 'anonymous'
  } catch {
    return 'anonymous'
  }
}

export type AIUsageRecord = Record<AIUsageFeature, number>

export type AIUsageLogEvent = {
  feature: AIUsageFeature
  model: string
  tokensIn?: number
  tokensOut?: number
  estCostCents?: number
  // Optional context to help debugging/analytics
  metadata?: Record<string, unknown>
  timestamp: string // ISO string
}

export type UsageDataSource = 'server' | 'fallback'

export type UsageSourceState = {
  source: UsageDataSource
  serverReachable: boolean
  lastUpdated: string
}

let usageSourceState: UsageSourceState = {
  source: 'server',
  serverReachable: true,
  lastUpdated: new Date().toISOString(),
}

function setUsageSourceState(source: UsageDataSource, serverReachable: boolean) {
  usageSourceState = {
    source,
    serverReachable,
    lastUpdated: new Date().toISOString(),
  }
}

export function getUsageSourceState(): UsageSourceState {
  return usageSourceState
}

export async function getUsage(): Promise<AIUsageRecord> {
  const uid = await getCurrentUserId()
  const key = `${STORAGE_PREFIX}_${uid}_${monthKey()}`
  try {
    const raw = await storage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      lesson_generation: Number(parsed.lesson_generation) || 0,
      grading_assistance: Number(parsed.grading_assistance) || 0,
      homework_help: Number(parsed.homework_help) || 0,
      homework_help_agentic: Number(parsed.homework_help_agentic) || 0,
      transcription: Number(parsed.transcription) || 0,
    }
  } catch {
    return { lesson_generation: 0, grading_assistance: 0, homework_help: 0, homework_help_agentic: 0, transcription: 0 }
  }
}

export async function incrementUsage(feature: AIUsageFeature, count = 1, model = 'unknown'): Promise<void> {
  const uid = await getCurrentUserId()
  const key = `${STORAGE_PREFIX}_${uid}_${monthKey()}`
  
  // Create usage log event for server tracking
  const event: AIUsageLogEvent = {
    feature,
    model,
    timestamp: new Date().toISOString(),
  }
  
  try {
    // 1. Immediately try to sync to server (write-through)
    await logUsageEvent(event)
    setUsageSourceState('server', true)
    console.log(`[Usage] Successfully synced ${feature} usage to server`)
    
    // 2. Clear any local cache since server is now authoritative
    // Local storage is only used for offline scenarios
    await storage.removeItem(key)
    
  } catch (serverError) {
    setUsageSourceState('fallback', false)
    console.warn(`[Usage] Server sync failed, using local cache:`, serverError)
    
    // 3. Fallback: update local storage for offline scenarios
    try {
      const current = await getUsage()
      const next = { ...current, [feature]: (current[feature] || 0) + count }
      await storage.setItem(key, JSON.stringify(next))
      console.log(`[Usage] Updated local cache for ${feature}:`, next[feature])
      
      // 4. Queue for retry when connectivity is restored
      await enqueueUsageLog(event)
      
    } catch (localError) {
      console.error(`[Usage] Both server and local storage failed:`, { serverError, localError })
    }
  }
}

const LOG_QUEUE_KEY_PREFIX = 'ai_usage_log_queue'

async function enqueueUsageLog(event: AIUsageLogEvent): Promise<void> {
  const uid = await getCurrentUserId()
  const key = `${LOG_QUEUE_KEY_PREFIX}_${uid}`
  try {
    const raw = await storage.getItem(key)
    const arr: AIUsageLogEvent[] = raw ? JSON.parse(raw) : []
    arr.push(event)
    await storage.setItem(key, JSON.stringify(arr))
  } catch {
    // swallow
  }
}

/**
 * Enhanced flush with retry logic and exponential backoff
 * Attempts to sync queued usage events with improved reliability
 */
export async function flushUsageLogQueue(maxRetries = 3): Promise<void> {
  const uid = await getCurrentUserId()
  const key = `${LOG_QUEUE_KEY_PREFIX}_${uid}`
  const metaKey = `${key}_meta`
  
  try {
    const raw = await storage.getItem(key)
    const arr: AIUsageLogEvent[] = raw ? JSON.parse(raw) : []
    if (!arr.length) return
    
    // Get retry metadata
    const metaRaw = await storage.getItem(metaKey)
    const meta = metaRaw ? JSON.parse(metaRaw) : { retryCount: 0, lastAttempt: 0 }
    
    // Implement exponential backoff: 1s, 2s, 4s, etc.
    const backoffMs = Math.min(1000 * Math.pow(2, meta.retryCount), 30000) // max 30s
    const timeSinceLastAttempt = Date.now() - meta.lastAttempt
    
    if (timeSinceLastAttempt < backoffMs) {
      console.log(`[Usage Queue] Backing off for ${backoffMs - timeSinceLastAttempt}ms`)
      return // Still in backoff period
    }
    
    console.log(`[Usage Queue] Attempting to flush ${arr.length} queued events (retry ${meta.retryCount})`)
    
    const remaining: AIUsageLogEvent[] = []
    let syncedCount = 0
    
    // Process events in batches to avoid overwhelming the server
    const batchSize = 5
    for (let i = 0; i < arr.length; i += batchSize) {
      const batch = arr.slice(i, i + batchSize)
      
      for (const ev of batch) {
        try {
          const { error } = await assertSupabase().functions.invoke('ai-usage', { 
            body: { action: 'log', event: ev } as any 
          })
          if (error) {
            console.warn('[Usage Queue] Server rejected event:', error, ev)
            remaining.push(ev)
          } else {
            syncedCount++
          }
        } catch (syncError) {
          console.warn('[Usage Queue] Failed to sync event:', syncError, ev)
          remaining.push(ev)
        }
      }
      
      // Small delay between batches
      if (i + batchSize < arr.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    // Update queue and metadata
    if (remaining.length > 0) {
      if (meta.retryCount >= maxRetries) {
        console.error(`[Usage Queue] Max retries reached, discarding ${remaining.length} events`)
        await storage.removeItem(key)
        await storage.removeItem(metaKey)
      } else {
        await storage.setItem(key, JSON.stringify(remaining))
        await storage.setItem(metaKey, JSON.stringify({
          retryCount: meta.retryCount + 1,
          lastAttempt: Date.now()
        }))
        console.log(`[Usage Queue] ${syncedCount} events synced, ${remaining.length} remain (will retry)`)
      }
    } else {
      // All events synced successfully
      await storage.removeItem(key)
      await storage.removeItem(metaKey)
      console.log(`[Usage Queue] All ${syncedCount} events synced successfully`)
    }
    
  } catch (error) {
    console.error('[Usage Queue] Queue flush failed:', error)
  }
}

export async function logUsageEvent(event: AIUsageLogEvent): Promise<void> {
  try {
    const payload = { action: 'log', event }
    const { error } = await assertSupabase().functions.invoke('ai-usage', { body: payload as any })
    if (error) throw error
    setUsageSourceState('server', true)
  } catch {
    setUsageSourceState('fallback', false)
    await enqueueUsageLog(event)
    // Only flush queue periodically to avoid performance issues
    // Flush every 10th failed event or after 5 minutes
    if (shouldFlushQueue()) {
      try {
        await flushUsageLogQueue()
      } catch {
        // Silent failure for background flush
      }
    }
  }
}

// Performance optimization: track flush timing to avoid excessive queue processing
let lastFlushTime = 0
let failedEventCount = 0

function shouldFlushQueue(): boolean {
  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000
  
  failedEventCount++
  
  // Flush if 5 minutes have passed OR every 10th failed event
  if (now - lastFlushTime > fiveMinutes || failedEventCount >= 10) {
    lastFlushTime = now
    failedEventCount = 0
    return true
  }
  
  return false
}

export async function getServerUsage(): Promise<AIUsageRecord | null> {
  try {
    const { data, error } = await assertSupabase().functions.invoke('ai-usage', { body: {} as any })
    if (error) throw error
    const source = data?.source === 'fallback' ? 'fallback' : 'server'
    const serverReachable = data?.serverReachable !== false
    setUsageSourceState(source, serverReachable)
    const src: any = (data && (data.monthly || data)) || {}
    const counts: AIUsageRecord = {
      lesson_generation: Number(src.lesson_generation ?? src.lesson ?? src.lessons ?? 0) || 0,
      grading_assistance: Number(src.grading_assistance ?? src.grading ?? 0) || 0,
      homework_help: Number(src.homework_help ?? src.helper ?? 0) || 0,
      homework_help_agentic: Number(src.homework_help_agentic ?? src.homework_help_agent ?? src.agentic ?? 0) || 0,
      transcription: Number(src.transcription ?? src.asr ?? 0) || 0,
    }
    return counts
  } catch {
    setUsageSourceState('fallback', false)
    return null
  }
}

/**
 * Syncs any pending local usage to the server and clears local storage
 * Should be called on app startup to prevent cross-device inconsistencies
 */
export async function syncLocalUsageToServer(): Promise<void> {
  const uid = await getCurrentUserId()
  const key = `${STORAGE_PREFIX}_${uid}_${monthKey()}`
  
  try {
    const local = await getUsage()
    const localTotal = local.lesson_generation + local.grading_assistance + local.homework_help + local.transcription
    
    // Only sync if there's local usage to sync
    if (localTotal > 0) {
      console.log('[Usage Sync] Syncing local usage to server:', local)
      
      // Send each feature's usage to server
      for (const [feature, count] of Object.entries(local) as [AIUsageFeature, number][]) {
        if (count > 0) {
          // Create a usage log event for each accumulated usage
          const event: AIUsageLogEvent = {
            feature,
            model: 'bulk_sync',
            timestamp: new Date().toISOString(),
          }
          
          // Try direct sync first
          try {
            const { error } = await assertSupabase().functions.invoke('ai-usage', { 
              body: { action: 'bulk_increment', feature, count } as any 
            })
            if (error) throw error
            console.log(`[Usage Sync] Successfully synced ${count} ${feature} usage`)
          } catch (syncError) {
            console.warn(`[Usage Sync] Failed to sync ${feature}, queueing for retry:`, syncError)
            // Fallback to logging individual events
            for (let i = 0; i < count; i++) {
              await enqueueUsageLog(event)
            }
          }
        }
      }
      
      // Clear local storage after successful sync attempt
      await storage.removeItem(key)
      console.log('[Usage Sync] Cleared local usage cache after sync')
    }
    
    // Always flush the log queue on startup
    await flushUsageLogQueue()
    
  } catch (error) {
    console.error('[Usage Sync] Failed to sync local usage:', error)
    // Don't throw - we don't want to break app startup
  }
}

export async function getCombinedUsage(): Promise<AIUsageRecord> {
  // Server is the authoritative source for usage tracking
  // This fixes cross-device sync issues where local storage would reset quota
  const server = await getServerUsage()
  if (server) {
    setUsageSourceState('server', true)
    return server
  }
  
  // Fallback to local only when server is completely unavailable
  // This handles offline scenarios but won't persist across devices
  const local = await getUsage()
  setUsageSourceState('fallback', false)
  console.warn('Using local usage as fallback - server unavailable:', local)
  return local
}
