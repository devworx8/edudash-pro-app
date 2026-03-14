/**
 * usePresence Hook - React Native
 * Real-time presence tracking for online/offline status
 * Uses background tasks to maintain presence when app is backgrounded
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

// Try to import background fetch (optional, may not be available)
let BackgroundFetch: any = null;
try {
  BackgroundFetch = require('react-native-background-fetch').default;
} catch {
  console.log('[usePresence] Background fetch not available');
}

export type PresenceStatus = 'online' | 'away' | 'offline';

interface PresenceRecord {
  user_id: string;
  status: PresenceStatus;
  last_seen_at: string;
}

interface UsePresenceOptions {
  heartbeatInterval?: number; // ms, default 30000 (30s)
  awayTimeout?: number; // ms, default 300000 (5 min)
}

interface UsePresenceReturn {
  myStatus: PresenceStatus;
  getUserPresence: (userId: string) => PresenceRecord | null;
  onlineUsers: Map<string, PresenceRecord>;
  setStatus: (status: PresenceStatus) => Promise<void>;
  isUserOnline: (userId: string) => boolean;
  getLastSeenText: (userId: string) => string;
  refreshPresence: () => Promise<void>;
  /** Call on user interactions (typing, scrolling, tapping) to prevent away status */
  recordActivity: () => void;
  loading: boolean;
}

export function usePresence(
  userId: string | undefined,
  options: UsePresenceOptions = {}
): UsePresenceReturn {
  const { 
    heartbeatInterval = 30000, 
    awayTimeout = 300000 
  } = options;

  const [myStatus, setMyStatus] = useState<PresenceStatus>('offline');
  const [onlineUsers, setOnlineUsers] = useState<Map<string, PresenceRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const myStatusRef = useRef<PresenceStatus>(myStatus);

  // Keep ref in sync with state so heartbeat reads current value
  useEffect(() => {
    myStatusRef.current = myStatus;
  }, [myStatus]);

  // Update presence in database
  const upsertPresence = useCallback(async (status: PresenceStatus) => {
    if (!userId) return;
    
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase.rpc('upsert_user_presence', {
        p_user_id: userId,
        p_status: status,
      });
      
      if (error) {
        console.warn('[usePresence] Failed to update presence:', error.message, error.code);
        // If RPC fails, try direct upsert as fallback
        if (error.code === 'PGRST202' || error.message.includes('function') || error.message.includes('not found')) {
          console.log('[usePresence] RPC not found, trying direct upsert...');
          const { error: directError } = await supabase
            .from('user_presence')
            .upsert({
              user_id: userId,
              status: status,
              last_seen_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
          
          if (directError) {
            console.warn('[usePresence] Direct upsert failed:', directError.message);
          } else {
            console.log('[usePresence] Direct upsert succeeded for status:', status);
          }
        }
      } else {
        console.log('[usePresence] Presence updated via RPC:', status, 'result:', data);
      }
    } catch (err) {
      console.warn('[usePresence] Error updating presence:', err);
    }
  }, [userId]);

  // Set status manually
  const setStatus = useCallback(async (status: PresenceStatus) => {
    setMyStatus(status);
    await upsertPresence(status);
  }, [upsertPresence]);

  // Load all presence records
  const loadPresence = useCallback(async () => {
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id, status, last_seen_at');

      if (error) {
        console.warn('[usePresence] Failed to load presence:', error.message);
        return;
      }

      const presenceMap = new Map<string, PresenceRecord>();
      (data || []).forEach((record: PresenceRecord) => {
        presenceMap.set(record.user_id, record);
      });
      console.log('[usePresence] Loaded presence data:', {
        count: presenceMap.size,
        onlineCount: Array.from(presenceMap.values()).filter(r => r.status === 'online').length
      });
      setOnlineUsers(presenceMap);
    } catch (err) {
      console.warn('[usePresence] Error loading presence:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check if user is online
  // Users are considered online if:
  // 1. Status is 'online' and last seen within 2 minutes (active heartbeat)
  // 'away' is treated as not online for chat header (shows "Away")
  const isUserOnline = useCallback((targetUserId: string): boolean => {
    const record = onlineUsers.get(targetUserId);
    if (!record) {
      console.log('[usePresence] isUserOnline: no record for', targetUserId);
      return false;
    }
    if (record.status !== 'online') {
      console.log('[usePresence] isUserOnline: user offline', targetUserId);
      return false;
    }
    
    const lastSeen = new Date(record.last_seen_at).getTime();
    const now = Date.now();
    const ageSeconds = Math.floor((now - lastSeen) / 1000);
    
    // Different grace periods based on status
    // - 'online': 2 minutes (heartbeat is every 30s, so 4 missed heartbeats = offline)
    const graceMs = 120000; // 2 min
    const isOnline = lastSeen > (now - graceMs);
    
    console.log('[usePresence] isUserOnline check:', {
      targetUserId,
      status: record.status,
      lastSeen: new Date(record.last_seen_at).toISOString(),
      ageSeconds,
      isOnline,
      threshold: '2min'
    });
    
    return isOnline;
  }, [onlineUsers]);

  // Get presence record for a user
  const getUserPresence = useCallback((targetUserId: string): PresenceRecord | null => {
    return onlineUsers.get(targetUserId) || null;
  }, [onlineUsers]);

  // Get human-readable last seen text
  const getLastSeenText = useCallback((targetUserId: string): string => {
    const record = onlineUsers.get(targetUserId);
    if (!record) return 'Offline';
    if (record.status === 'online' && isUserOnline(targetUserId)) return 'Online';
    if (record.status === 'away') {
      const lastSeen = new Date(record.last_seen_at).getTime();
      const now = Date.now();
      if (lastSeen > now - 1800000) {
        return 'Away';
      }
    }
    
    const lastSeen = new Date(record.last_seen_at);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    const timeText = lastSeen.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    
    if (diffMins < 1) return 'Last seen just now';
    if (diffMins < 60) return `Last seen ${diffMins} min ago`;
    if (diffHours < 24) return `Last seen today at ${timeText}`;
    if (diffDays === 1) return `Last seen yesterday at ${timeText}`;
    if (diffDays < 7) return `Last seen ${diffDays} days ago`;
    return `Last seen ${lastSeen.toLocaleDateString()}`;
  }, [onlineUsers, isUserOnline]);

  // Handle app state changes (foreground/background)
  useEffect(() => {
    if (!userId) return;

    // Track the last AppState transition time to ignore rapid cycling.
    // On Android, AudioModule.setAudioModeAsync can cause a spurious
    // background→active blip within ~200ms. Ignoring transitions that
    // reverse within a short window prevents unnecessary presence RPCs.
    let lastTransitionTime = 0;
    let pendingBackgroundTimer: ReturnType<typeof setTimeout> | null = null;

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      console.log('[usePresence] App state changed to:', nextAppState);
      const now = Date.now();
      
      if (nextAppState === 'active') {
        // If we had a pending "background" action queued, cancel it —
        // the app never truly went to background.
        if (pendingBackgroundTimer) {
          clearTimeout(pendingBackgroundTimer);
          pendingBackgroundTimer = null;
          console.log('[usePresence] Cancelled spurious background transition (rapid active→bg→active)');
          return;
        }
        
        // App came to foreground - go online immediately
        console.log('[usePresence] App active - setting online');
        setMyStatus('online');
        await upsertPresence('online');
        lastActivityRef.current = Date.now();
        
        // Refresh presence data
        loadPresence();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Delay the "away" update slightly to filter out spurious blips.
        // If the app returns to "active" within 500ms, we skip the update entirely.
        lastTransitionTime = now;
        pendingBackgroundTimer = setTimeout(async () => {
          pendingBackgroundTimer = null;
          
          // App went to background - set to away and send immediate update
          console.log('[usePresence] App backgrounded - setting away (still available)');
          setMyStatus('away');
          
          // Fire-and-forget: send presence update before app may suspend.
          // Non-blocking — we don't await; timeout/failure is expected when backgrounding.
          const supabase = assertSupabase();
          Promise.race([
            supabase.rpc('upsert_user_presence', {
              p_user_id: userId,
              p_status: 'away',
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000)),
          ])
            .then(() => { if (__DEV__) console.log('[usePresence] Background presence sent'); })
            .catch((err) => { if (__DEV__) console.warn('[usePresence] Background presence failed (non-blocking):', (err as Error)?.message); });
          
          lastActivityRef.current = Date.now();
        }, 500); // 500ms debounce to filter Android audio focus blips
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
      if (pendingBackgroundTimer) {
        clearTimeout(pendingBackgroundTimer);
      }
    };
  }, [userId, upsertPresence, loadPresence]);

  // Setup heartbeat and real-time subscription
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const supabase = assertSupabase();

    // Initial load
    loadPresence();
    
    // Set initial online status
    setMyStatus('online');
    upsertPresence('online');

    // Heartbeat to maintain presence
    // Note: This runs in foreground only. For background, we rely on the 'away' status
    // set during app state change and the 5-minute grace period
    heartbeatRef.current = setInterval(() => {
      // Only send heartbeat if app is in foreground
      const appState = AppState.currentState;
      if (appState !== 'active') {
        console.log('[usePresence] Skipping heartbeat - app not active:', appState);
        return;
      }
      
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;
      
      console.log('[usePresence] Heartbeat - app state:', appState, 'time since activity:', Math.floor(timeSinceActivity / 1000), 's');
      
      if (timeSinceActivity > awayTimeout) {
        // User has been inactive - mark as away
        if (myStatusRef.current !== 'away') {
          console.log('[usePresence] User inactive, marking as away');
          setMyStatus('away');
          upsertPresence('away');
        }
      } else {
        // User is active - maintain online status
        console.log('[usePresence] User active, maintaining online status');
        upsertPresence(myStatusRef.current === 'away' ? 'away' : 'online');
      }
    }, heartbeatInterval);

    // Subscribe to presence changes
    channelRef.current = supabase
      .channel('presence-changes')
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
        } as any,
        (payload: { eventType: string; new: PresenceRecord }) => {
          const record = payload.new;
          if (record && record.user_id) {
            setOnlineUsers((prev) => {
              const next = new Map(prev);
              if (payload.eventType === 'DELETE') {
                next.delete(record.user_id);
              } else {
                next.set(record.user_id, record);
              }
              return next;
            });
          }
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      // Mark as offline on unmount
      upsertPresence('offline');
    };
  }, [userId, heartbeatInterval, awayTimeout, loadPresence, upsertPresence]);

  // Track user activity (call this on user interactions)
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Throttled activity recorder — call on typing, scrolling, sending
  const lastRecordedRef = useRef(0);
  const recordActivity = useCallback(() => {
    const now = Date.now();
    // Throttle: max once per 15 seconds to avoid excessive updates
    if (now - lastRecordedRef.current < 15_000) return;
    lastRecordedRef.current = now;
    lastActivityRef.current = now;
    // If currently away due to inactivity, flip back to online
    if (myStatusRef.current === 'away' && AppState.currentState === 'active') {
      setMyStatus('online');
      upsertPresence('online');
    }
  }, [upsertPresence]);

  return {
    myStatus,
    getUserPresence,
    onlineUsers,
    setStatus,
    isUserOnline,
    getLastSeenText,
    refreshPresence: loadPresence,
    recordActivity,
    loading,
  };
}

export default usePresence;
