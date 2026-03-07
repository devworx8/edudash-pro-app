'use client';

/**
 * usePresence Hook
 * 
 * Tracks user online/offline status using Supabase Presence channels
 * and the user_presence database table.
 * 
 * Features:
 * - Real-time presence tracking via Supabase Realtime
 * - Automatic offline detection on tab close/visibility change
 * - Last seen timestamp tracking
 * - Heartbeat to maintain online status
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type PresenceStatus = 'online' | 'offline' | 'away';

export interface UserPresence {
  user_id: string;
  status: PresenceStatus;
  last_seen_at: string;
  device_type?: string;
}

export interface UsePresenceOptions {
  /** Heartbeat interval in ms (default: 30000 = 30s) */
  heartbeatInterval?: number;
  /** Time before marking user as away (default: 300000 = 5 min) */
  awayTimeout?: number;
  /** Device type identifier */
  deviceType?: string;
}

export interface UsePresenceReturn {
  /** Current user's presence status */
  myStatus: PresenceStatus;
  /** Get presence for a specific user */
  getUserPresence: (userId: string) => UserPresence | null;
  /** Get all online users */
  onlineUsers: Map<string, UserPresence>;
  /** Manually set status */
  setStatus: (status: PresenceStatus) => Promise<void>;
  /** Check if a specific user is online */
  isUserOnline: (userId: string) => boolean;
  /** Get formatted "Last seen X ago" string */
  getLastSeenText: (userId: string) => string;
  /** Loading state */
  loading: boolean;
}

/**
 * Format a timestamp into "Last seen X ago" text
 */
function formatLastSeen(timestamp: string | null): string {
  if (!timestamp) return 'Never';
  
  const now = new Date();
  const lastSeen = new Date(timestamp);
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  
  return lastSeen.toLocaleDateString();
}

export function usePresence(
  userId: string | undefined,
  options: UsePresenceOptions = {}
): UsePresenceReturn {
  const {
    heartbeatInterval = 30000,
    awayTimeout = 300000,
    deviceType = typeof window !== 'undefined' ? (window.innerWidth < 768 ? 'mobile' : 'desktop') : 'unknown',
  } = options;

  const [myStatus, setMyStatus] = useState<PresenceStatus>('offline');
  const [onlineUsers, setOnlineUsers] = useState<Map<string, UserPresence>>(new Map());
  const [loading, setLoading] = useState(true);
  
  const supabaseRef = useRef(createClient());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Update presence in database
  const updatePresence = useCallback(async (status: PresenceStatus) => {
    if (!userId) return;
    
    const supabase = supabaseRef.current;
    try {
      await supabase.rpc('upsert_user_presence', {
        p_user_id: userId,
        p_status: status,
        p_device_type: deviceType,
      });
      setMyStatus(status);
    } catch (err) {
      console.error('[usePresence] Failed to update presence:', err);
    }
  }, [userId, deviceType]);

  // Set status manually
  const setStatus = useCallback(async (status: PresenceStatus) => {
    await updatePresence(status);
  }, [updatePresence]);

  // Track activity to detect away status
  const trackActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (myStatus === 'away') {
      updatePresence('online');
    }
  }, [myStatus, updatePresence]);

  // Get presence for a specific user
  const getUserPresence = useCallback((targetUserId: string): UserPresence | null => {
    return onlineUsers.get(targetUserId) || null;
  }, [onlineUsers]);

  // Check if user is online (with 30-second threshold for accuracy)
  const isUserOnline = useCallback((targetUserId: string): boolean => {
    const presence = onlineUsers.get(targetUserId);
    if (!presence || presence.status === 'offline') return false;
    
    // Consider online if status is 'online' AND last seen within 30 seconds
    if (presence.status === 'online') {
      const lastSeen = new Date(presence.last_seen_at).getTime();
      const thirtySecondsAgo = Date.now() - 30000;
      return lastSeen > thirtySecondsAgo;
    }
    
    return false;
  }, [onlineUsers]);

  // Get last seen text
  const getLastSeenText = useCallback((targetUserId: string): string => {
    const presence = onlineUsers.get(targetUserId);
    if (!presence) return 'Offline';
    if (presence.status === 'online') return 'Online';
    if (presence.status === 'away') return 'Away';
    return formatLastSeen(presence.last_seen_at);
  }, [onlineUsers]);

  // Load initial presence data
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const supabase = supabaseRef.current;

    const loadPresence = async () => {
      try {
        // Fetch all presence records
        const { data, error } = await supabase
          .from('user_presence')
          .select('*');

        if (error) {
          console.error('[usePresence] Failed to load presence:', error);
          return;
        }

        const presenceMap = new Map<string, UserPresence>();
        (data || []).forEach((p: UserPresence) => {
          presenceMap.set(p.user_id, p);
        });
        setOnlineUsers(presenceMap);

        // Set current user as online
        await updatePresence('online');
      } catch (err) {
        console.error('[usePresence] Error loading presence:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPresence();
  }, [userId, updatePresence]);

  // Subscribe to real-time presence changes
  useEffect(() => {
    if (!userId) return;

    const supabase = supabaseRef.current;

    // Subscribe to presence table changes
    const channel = supabase
      .channel('user-presence-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'user_presence' },
        (payload: { new?: UserPresence; old?: UserPresence; eventType: string }) => {
          const presence = (payload.new || payload.old) as UserPresence;
          if (presence) {
            setOnlineUsers(prev => {
              const updated = new Map(prev);
              if (payload.eventType === 'DELETE') {
                updated.delete(presence.user_id);
              } else {
                updated.set(presence.user_id, presence);
              }
              return updated;
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Heartbeat to maintain online status
  useEffect(() => {
    if (!userId) return;

    // Send heartbeat periodically
    const heartbeat = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;
      
      // If no activity for awayTimeout, set to away
      if (timeSinceActivity > awayTimeout && myStatus === 'online') {
        updatePresence('away');
      } else if (myStatus === 'online') {
        // Just update last_seen_at
        updatePresence('online');
      }
    }, heartbeatInterval);

    heartbeatRef.current = heartbeat;

    return () => {
      clearInterval(heartbeat);
    };
  }, [userId, heartbeatInterval, awayTimeout, myStatus, updatePresence]);

  // Track user activity
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, trackActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, trackActivity);
      });
    };
  }, [userId, trackActivity]);

  // Handle visibility change (tab switch, minimize)
  useEffect(() => {
    if (!userId || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        updatePresence('away');
      } else {
        updatePresence('online');
        trackActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, updatePresence, trackActivity]);

  // Set offline on unmount/page close
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable offline status on page close
      const supabase = supabaseRef.current;
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/upsert_user_presence`;
      
      navigator.sendBeacon?.(url, JSON.stringify({
        p_user_id: userId,
        p_status: 'offline',
        p_device_type: deviceType,
      }));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Set offline when hook unmounts
      updatePresence('offline');
    };
  }, [userId, deviceType, updatePresence]);

  return {
    myStatus,
    getUserPresence,
    onlineUsers,
    setStatus,
    isUserOnline,
    getLastSeenText,
    loading,
  };
}

export default usePresence;
