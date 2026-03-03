/**
 * NotificationContext - Unified notification management for EduDash Pro
 *
 * Centralizes all notification counts (messages, calls, announcements) with:
 * - Real-time Supabase subscriptions
 * - Focus-based refresh via useFocusEffect
 * - Proper query invalidation on mark-as-read
 * - Badge sync for native and PWA
 *
 * @fileoverview Provides NotificationProvider and useNotificationContext
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { assertSupabase } from '../lib/supabase';
import { logger } from '@/lib/logger';
import { BadgeCoordinator } from '@/lib/BadgeCoordinator';

// ============================================================================
// Types
// ============================================================================

interface NotificationCounts {
  messages: number;
  calls: number;
  announcements: number;
  total: number;
}

interface NotificationContextValue {
  /** Current notification counts */
  counts: NotificationCounts;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Mark all messages as read for a specific thread */
  markMessagesRead: (threadId: string) => Promise<void>;
  /** Mark all calls as seen */
  markCallsSeen: () => Promise<void>;
  /** Mark all announcements as seen */
  markAnnouncementsSeen: () => Promise<void>;
  /** Force refresh all notification counts */
  refresh: () => Promise<void>;
  /** Update the native/PWA badge count */
  syncBadge: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const QUERY_KEYS = {
  messages: (userId: string) => ['notifications', 'messages', userId] as const,
  calls: (userId: string) => ['notifications', 'calls', userId] as const,
  announcements: (userId: string) => ['notifications', 'announcements', userId] as const,
};

const ASYNC_STORAGE_KEYS = {
  callsLastSeen: (userId: string) => `calls_last_seen_at_${userId}`,
  announcementsLastSeen: (userId: string) => `announcements_last_seen_at_${userId}`,
};

// Stale times - how long data is considered fresh
const STALE_TIMES = {
  messages: 15 * 1000, // 15 seconds (was 1 minute - bug fix)
  calls: 30 * 1000, // 30 seconds
  announcements: 60 * 1000, // 1 minute
};

const isNetworkError = (error: any) => {
  const message = (error?.message || error?.toString?.() || '').toLowerCase();
  return message.includes('network request failed') || message.includes('failed to fetch');
};

const isWebRuntime = (): boolean =>
  Platform.OS === 'web' ||
  (typeof window !== 'undefined' && typeof document !== 'undefined');

const isNotificationUnavailableOnWeb = (error: unknown): boolean => {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    (error as any)?.name === 'UnavailabilityError' ||
    msg.includes('not available on web') ||
    msg.includes('unavailabilityerror') ||
    msg.includes('schedulenotificationasync is not available') ||
    msg.includes('method or property notifications.schedulenotificationasync')
  );
};

const canScheduleLocalNotification = (): boolean => {
  if (isWebRuntime()) return false;
  return typeof (Notifications as any)?.scheduleNotificationAsync === 'function';
};

// ============================================================================
// Context
// ============================================================================

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Fetch unread message count across all threads
 */
async function fetchUnreadMessageCount(userId: string): Promise<number> {
  const client = assertSupabase();

  try {
  // Get all thread participations with last_read_at
    const { data: participantData, error: participantError } = await client
    .from('message_participants')
    .select('thread_id, last_read_at')
    .eq('user_id', userId);

    if (participantError) {
      if (isNetworkError(participantError)) {
        logger.warn('NotificationContext', 'Network error fetching message participants, returning 0.');
      } else {
        console.error('[NotificationContext] Error fetching message participants:', participantError);
      }
      return 0;
    }

    if (!participantData || participantData.length === 0) {
      logger.debug('NotificationContext', `No message threads for user ${userId}`);
      return 0;
    }

  // Count unread messages across all threads
  let totalUnread = 0;
    const threadCounts: Array<{ thread_id: string; unread: number }> = [];

  for (const participant of participantData) {
      const { count, error: messageError } = await client
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', participant.thread_id)
        .gt('created_at', participant.last_read_at || '1970-01-01')
      .neq('sender_id', userId)
      .is('deleted_at', null);

      if (messageError) {
        if (isNetworkError(messageError)) {
          logger.warn('NotificationContext', `Network error counting messages for thread ${participant.thread_id}`);
        } else {
          logger.warn('NotificationContext', `Error counting messages for thread ${participant.thread_id}:`, messageError);
        }
        continue;
      }

      const unread = count || 0;
      totalUnread += unread;
      if (unread > 0) {
        threadCounts.push({ thread_id: participant.thread_id, unread });
      }
    }

    logger.debug('NotificationContext', `Unread messages count for user ${userId}:`, {
      totalUnread,
      threadCount: participantData.length,
      threadsWithUnread: threadCounts.length,
      sampleThreads: threadCounts.slice(0, 3),
    });

  return totalUnread;
  } catch (error) {
    if (isNetworkError(error)) {
      logger.warn('NotificationContext', 'Network error fetching unread messages (exception).');
    } else {
      console.error('[NotificationContext] Exception fetching unread messages:', error);
    }
    return 0;
  }
}

/**
 * Fetch missed calls count since last seen
 */
async function fetchMissedCallsCount(userId: string): Promise<number> {
  const client = assertSupabase();
  const lastSeenKey = ASYNC_STORAGE_KEYS.callsLastSeen(userId);
  const lastSeen = await AsyncStorage.getItem(lastSeenKey);

  try {
  // Build query for missed calls (unanswered calls to this user)
    // A call is missed if:
    // 1. User is the callee (incoming call)
    // 2. Status is 'missed' OR (status is 'ended' AND answered_at is null)
  let query = client
    .from('active_calls')
      .select('id, status, answered_at, duration_seconds', { count: 'exact' })
    .eq('callee_id', userId)
      .or('status.eq.missed,and(status.eq.ended,answered_at.is.null)');

  // Only count calls after last seen timestamp
  if (lastSeen) {
    query = query.gt('started_at', lastSeen);
  }

    const { data, count, error } = await query;
    
    if (error) {
      if (isNetworkError(error)) {
        logger.warn('NotificationContext', 'Network error fetching missed calls.');
      } else {
        console.error('[NotificationContext] Error fetching missed calls:', error);
      }
      return 0;
    }
    
    // Filter to ensure we only count truly missed calls
    // (status='missed' OR (status='ended' AND answered_at IS NULL AND duration is 0 or null))
    const missedCount = data?.filter(call => 
      call.status === 'missed' || 
      (call.status === 'ended' && !call.answered_at && (call.duration_seconds === null || call.duration_seconds === 0))
    ).length || 0;
    
    logger.debug('NotificationContext', `Missed calls count for user ${userId}:`, {
      rawCount: count,
      filteredCount: missedCount,
      lastSeen: lastSeen || 'never',
      sampleCalls: data?.slice(0, 3).map(c => ({ 
        status: c.status, 
        answered_at: c.answered_at, 
        duration: c.duration_seconds 
      }))
    });
    
    return missedCount;
  } catch (error) {
    if (isNetworkError(error)) {
      logger.warn('NotificationContext', 'Network error fetching missed calls (exception).');
    } else {
      console.error('[NotificationContext] Exception fetching missed calls:', error);
    }
    return 0;
  }
}

/**
 * Fetch unread announcements count since last seen
 */
async function fetchUnreadAnnouncementsCount(userId: string): Promise<number> {
  const client = assertSupabase();
  const lastSeenKey = ASYNC_STORAGE_KEYS.announcementsLastSeen(userId);
  const lastSeen = await AsyncStorage.getItem(lastSeenKey);

  // Build query for announcements
  let query = client
    .from('announcements')
    .select('id', { count: 'exact', head: true })
    .eq('is_published', true);

  // Only count announcements after last seen timestamp
  if (lastSeen) {
    query = query.gt('created_at', lastSeen);
  }

  try {
    const { count, error } = await query;
    if (error) {
      if (isNetworkError(error)) {
        logger.warn('NotificationContext', 'Network error fetching announcements count.');
        return 0;
      }
      throw error;
    }
    return count || 0;
  } catch (error) {
    if (isNetworkError(error)) {
      logger.warn('NotificationContext', 'Network error fetching announcements count (exception).');
      return 0;
    }
    console.error('[NotificationContext] Error fetching announcements count:', error);
    return 0;
  }
}

// ============================================================================
// Provider Component
// ============================================================================

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
}) => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const subscriptionsRef = useRef<Array<{ unsubscribe: () => void }>>([]);
  const lastUserIdRef = useRef<string | null>(null);
  const hapticsEnabledRef = useRef(true);
  const soundEnabledRef = useRef(true);

  const userId = user?.id;

  // Load notification/haptics preferences
  useEffect(() => {
    let mounted = true;
    const loadPrefs = async () => {
      try {
        const [hapticsPref, soundPref] = await Promise.all([
          AsyncStorage.getItem('pref_haptics_enabled'),
          AsyncStorage.getItem('pref_sound_enabled'),
        ]);
        if (!mounted) return;
        hapticsEnabledRef.current = hapticsPref !== 'false';
        soundEnabledRef.current = soundPref !== 'false';
      } catch {
        // Keep defaults
      }
    };
    void loadPrefs();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const lastUserId = lastUserIdRef.current;
    if (lastUserId && lastUserId !== userId) {
      // Cancel old subscriptions immediately
      subscriptionsRef.current.forEach((sub) => sub.unsubscribe());
      subscriptionsRef.current = [];

      // Clear cached queries for the previous user to avoid cross-account bleed
      queryClient.removeQueries({ queryKey: QUERY_KEYS.messages(lastUserId) });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.calls(lastUserId) });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.announcements(lastUserId) });
      queryClient.removeQueries({ queryKey: ['parent', 'unread-count', lastUserId] });
      queryClient.removeQueries({ queryKey: ['missed-calls-count', lastUserId] });
      queryClient.removeQueries({ queryKey: ['unread-announcements-count', lastUserId] });

      // Reset badge so stale counts don't persist after switch
      if (Platform.OS !== 'web') {
        BadgeCoordinator.setCategories({
          messages: 0,
          calls: 0,
          announcements: 0,
        }).catch(() => undefined);
      }
    }

    if (!userId) {
      // No active user: clear badges and subscriptions
      subscriptionsRef.current.forEach((sub) => sub.unsubscribe());
      subscriptionsRef.current = [];
      if (Platform.OS !== 'web') {
        BadgeCoordinator.setCategories({
          messages: 0,
          calls: 0,
          announcements: 0,
        }).catch(() => undefined);
      }
    }

    lastUserIdRef.current = userId ?? null;
  }, [userId, queryClient]);

  // -------------------------------------------------------------------------
  // Clear old cached data on mount (cache busting for new system)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return;
    
    // Invalidate ALL old notification-related queries to force fresh data
    // This ensures the new unified system takes over from old cached hooks
    queryClient.invalidateQueries({ queryKey: ['parent', 'unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['missed-calls-count'] });
    queryClient.invalidateQueries({ queryKey: ['unread-announcements-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    
    logger.debug('NotificationContext', 'Cleared old notification caches for user:', userId);
  }, [userId, queryClient]);

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  const messagesQuery = useQuery({
    queryKey: userId ? QUERY_KEYS.messages(userId) : ['disabled'],
    queryFn: () => fetchUnreadMessageCount(userId!),
    enabled: !!userId,
    staleTime: STALE_TIMES.messages,
    refetchInterval: 30 * 1000, // Refetch every 30 seconds as backup
  });

  const callsQuery = useQuery({
    queryKey: userId ? QUERY_KEYS.calls(userId) : ['disabled'],
    queryFn: () => fetchMissedCallsCount(userId!),
    enabled: !!userId,
    staleTime: STALE_TIMES.calls,
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  const announcementsQuery = useQuery({
    queryKey: userId ? QUERY_KEYS.announcements(userId) : ['disabled'],
    queryFn: () => fetchUnreadAnnouncementsCount(userId!),
    enabled: !!userId,
    staleTime: STALE_TIMES.announcements,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // -------------------------------------------------------------------------
  // Computed Values
  // -------------------------------------------------------------------------

  const counts = useMemo<NotificationCounts>(() => {
    const messages = messagesQuery.data ?? 0;
    const calls = callsQuery.data ?? 0;
    const announcements = announcementsQuery.data ?? 0;

    return {
      messages,
      calls,
      announcements,
      total: messages + calls + announcements,
    };
  }, [messagesQuery.data, callsQuery.data, announcementsQuery.data]);

  const isLoading = messagesQuery.isLoading || callsQuery.isLoading || announcementsQuery.isLoading;
  const error = messagesQuery.error || callsQuery.error || announcementsQuery.error;

  // -------------------------------------------------------------------------
  // Badge Sync
  // -------------------------------------------------------------------------

  const syncBadge = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        // Use BadgeCoordinator to coordinate with other badge sources (calls, updates)
        await BadgeCoordinator.setCategories({
          messages: counts.messages,
          calls: counts.calls,
          announcements: counts.announcements,
        });
        logger.debug('NotificationContext', `Badge synced via coordinator: messages=${counts.messages}, calls=${counts.calls}, announcements=${counts.announcements}`);
      }
      // For PWA, we could update document.title or use the Badging API
      // when running in browser context
    } catch (error) {
      // Log error instead of silent fail - badge sync is important
      console.error('[NotificationContext] Failed to sync badge:', error);
    }
  }, [counts.total, counts.messages, counts.calls, counts.announcements]);

  // Sync badge whenever total changes
  useEffect(() => {
    syncBadge();
  }, [syncBadge]);

  // -------------------------------------------------------------------------
  // Refresh Functions
  // -------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    if (!userId) return;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(userId) }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calls(userId) }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.announcements(userId) }),
      // Also invalidate legacy query keys for backward compatibility
      queryClient.invalidateQueries({ queryKey: ['parent', 'unread-count', userId] }),
      queryClient.invalidateQueries({ queryKey: ['missed-calls-count', userId] }),
      queryClient.invalidateQueries({ queryKey: ['unread-announcements-count', userId] }),
    ]);
  }, [queryClient, userId]);

  // -------------------------------------------------------------------------
  // Mark As Read Functions
  // -------------------------------------------------------------------------

  const markMessagesRead = useCallback(async (threadId: string) => {
    if (!userId) return;

    try {
      const client = assertSupabase();
      await client.rpc('mark_thread_messages_as_read', {
        thread_id: threadId,
        reader_id: userId,
      });

      // Immediately invalidate message count query
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(userId) });
      // Also invalidate legacy key
      await queryClient.invalidateQueries({ queryKey: ['parent', 'unread-count', userId] });
    } catch {
      // Silent fail
    }
  }, [userId, queryClient]);

  const markCallsSeen = useCallback(async () => {
    if (!userId) return;

    try {
      // Update last seen timestamp in AsyncStorage
      const now = new Date().toISOString();
      await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.callsLastSeen(userId), now);

      // Immediately invalidate calls count query
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calls(userId) });
      // Also invalidate legacy key
      await queryClient.invalidateQueries({ queryKey: ['missed-calls-count', userId] });
    } catch {
      // Silent fail
    }
  }, [userId, queryClient]);

  const markAnnouncementsSeen = useCallback(async () => {
    if (!userId) return;

    try {
      // Update last seen timestamp in AsyncStorage
      const now = new Date().toISOString();
      await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.announcementsLastSeen(userId), now);

      // Immediately invalidate announcements count query
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.announcements(userId) });
      // Also invalidate legacy key
      await queryClient.invalidateQueries({ queryKey: ['unread-announcements-count', userId] });
    } catch {
      // Silent fail
    }
  }, [userId, queryClient]);

  // -------------------------------------------------------------------------
  // Real-time Subscriptions
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!userId) return;

    const client = assertSupabase();

    // Subscribe to new messages — show banner, mark delivered, refresh lists
    const messagesSubscription = client
      .channel(`notifications-messages-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload: any) => {
          const msg = payload.new;
          if (!msg) return;

          // Skip own messages
          if (msg.sender_id === userId) return;

          // Verify user is a participant in this thread
          const { data: participation } = await client
            .from('message_participants')
            .select('thread_id')
            .eq('thread_id', msg.thread_id)
            .eq('user_id', userId)
            .maybeSingle();

          if (!participation) return; // Not our thread

          // ── 1. Invalidate counts + thread lists for realtime ──
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(userId) });
          queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
          queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
          queryClient.invalidateQueries({ queryKey: ['parent', 'unread-count', userId] });

          const isForeground = AppState.currentState === 'active';

          // ── 2. Mark messages as delivered (updates sender's ticks) ──
          if (isForeground) {
            try {
              await client.rpc('mark_messages_delivered', {
                p_thread_id: msg.thread_id,
                p_user_id: userId,
              });
              logger.debug('NotificationContext', `Marked messages delivered for thread ${msg.thread_id}`);
            } catch (deliverError) {
              logger.warn('NotificationContext', 'Failed to mark messages delivered:', deliverError);
            }
          }

          // ── 3. Show in-app notification banner (WhatsApp-style) ──
          const canScheduleLocalBanner = canScheduleLocalNotification();
          if (!canScheduleLocalBanner) {
            logger.debug(
              'NotificationContext',
              'Skipping local message banner: scheduleNotificationAsync unavailable on this platform'
            );
            return;
          }

          try {
            const { data: senderProfile } = await client
              .from('profiles')
              .select('first_name, last_name, role')
              .eq('id', msg.sender_id)
              .single();

            const senderName = senderProfile
              ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Someone'
              : 'Someone';

            const messagePreview = msg.content?.length > 50
              ? `${msg.content.substring(0, 47)}...`
              : msg.content || 'New message';

            await Notifications.scheduleNotificationAsync({
              identifier: `message-${msg.id}`,
              content: {
                title: `💬 ${senderName}`,
                body: messagePreview,
                data: {
                  type: 'message',
                  thread_id: msg.thread_id,
                  message_id: msg.id,
                  sender_id: msg.sender_id,
                  sender_name: senderName,
                },
                sound: soundEnabledRef.current ? 'default' : undefined,
              },
              trigger: null,
            });

            if (hapticsEnabledRef.current) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            }

            logger.debug('NotificationContext', `Showed notification for message from ${senderName}`);
          } catch (notifError) {
            if (isNotificationUnavailableOnWeb(notifError)) {
              logger.debug(
                'NotificationContext',
                'Skipping local message banner: expo-notifications local scheduling unavailable on web'
              );
              return;
            }
            logger.warn('NotificationContext', 'Failed to show message notification:', notifError);
          }
        }
      )
      .subscribe();

    // Subscribe to call status changes
    const callsSubscription = client
      .channel(`notifications-calls-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_calls',
          filter: `callee_id=eq.${userId}`,
        },
        () => {
          // Invalidate calls count when call status changes
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calls(userId) });
        }
      )
      .subscribe();

    // Subscribe to new announcements (scoped to the user's school)
    const orgId: string | null =
      (profile as any)?.preschool_id ||
      (profile as any)?.organization_id ||
      null;

    const announcementsChannelConfig: Record<string, unknown> = {
      event: 'INSERT',
      schema: 'public',
      table: 'announcements',
    };
    if (orgId) {
      announcementsChannelConfig.filter = `preschool_id=eq.${orgId}`;
    }

    const announcementsSubscription = client
      .channel(`notifications-announcements-${userId}`)
      .on(
        'postgres_changes',
        announcementsChannelConfig as any,
        async (payload: any) => {
          // Invalidate count so badge + dot updates immediately
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.announcements(userId) });

          // Show in-app notification banner when app is in foreground
          const isForeground = AppState.currentState === 'active';
          if (!isForeground) return;

          const announcement = payload.new as {
            id?: string;
            title?: string;
            content?: string;
            priority?: string;
          } | null;

          const title = announcement?.title || 'New School Announcement';
          const preview = announcement?.content
            ? announcement.content.length > 80
              ? `${announcement.content.substring(0, 77)}…`
              : announcement.content
            : 'A new announcement from your school.';

          const canScheduleLocalBanner = canScheduleLocalNotification();
          if (!canScheduleLocalBanner) {
            logger.debug(
              'NotificationContext',
              'Skipping local announcement banner: scheduleNotificationAsync unavailable on this platform'
            );
            return;
          }

          try {
            await Notifications.scheduleNotificationAsync({
              identifier: `announcement-${announcement?.id ?? Date.now()}`,
              content: {
                title: `📢 ${title}`,
                body: preview,
                data: {
                  type: 'announcement',
                  announcement_id: announcement?.id,
                  screen: 'announcements',
                },
                sound: soundEnabledRef.current ? 'default' : undefined,
              },
              trigger: null,
            });

            if (hapticsEnabledRef.current) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            }

            logger.debug('NotificationContext', 'Showed in-app banner for announcement:', title);
          } catch (notifError) {
            if (isNotificationUnavailableOnWeb(notifError)) {
              logger.debug(
                'NotificationContext',
                'Skipping local announcement banner: expo-notifications local scheduling unavailable on web'
              );
              return;
            }
            logger.warn('NotificationContext', 'Failed to show announcement notification:', notifError);
          }
        }
      )
      .subscribe();

    subscriptionsRef.current = [
      messagesSubscription,
      callsSubscription,
      announcementsSubscription,
    ];

    return () => {
      subscriptionsRef.current.forEach((sub) => sub.unsubscribe());
      subscriptionsRef.current = [];
    };
  }, [userId, profile, queryClient]);

  // -------------------------------------------------------------------------
  // App State & Focus Handling
  // -------------------------------------------------------------------------

  // Refresh when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        refresh();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [refresh]);

  // Note: Dashboards should call refresh() in their own useFocusEffect
  // if they want to refresh counts on screen focus. The provider-level
  // refresh handles app foreground transitions.

  // -------------------------------------------------------------------------
  // Context Value
  // -------------------------------------------------------------------------

  const value = useMemo<NotificationContextValue>(
    () => ({
      counts,
      isLoading,
      error: error as Error | null,
      markMessagesRead,
      markCallsSeen,
      markAnnouncementsSeen,
      refresh,
      syncBadge,
    }),
    [
      counts,
      isLoading,
      error,
      markMessagesRead,
      markCallsSeen,
      markAnnouncementsSeen,
      refresh,
      syncBadge,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access notification context
 * Must be used within NotificationProvider
 */
export const useNotificationContext = (): NotificationContextValue => {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error(
      'useNotificationContext must be used within a NotificationProvider'
    );
  }

  return context;
};

// ============================================================================
// Convenience Hooks (for backward compatibility and simpler usage)
// ============================================================================

/**
 * Get just the notification counts
 */
export const useNotificationCounts = (): NotificationCounts => {
  const { counts } = useNotificationContext();
  return counts;
};

/**
 * Get total notification count (for badge display)
 */
export const useTotalNotificationCount = (): number => {
  const { counts } = useNotificationContext();
  return counts.total;
};

/**
 * Get unread message count
 */
export const useUnreadMessages = (): number => {
  const { counts } = useNotificationContext();
  return counts.messages;
};

/**
 * Get missed calls count
 */
export const useMissedCalls = (): number => {
  const { counts } = useNotificationContext();
  return counts.calls;
};

/**
 * Get unread announcements count
 */
export const useUnreadAnnouncements = (): number => {
  const { counts } = useNotificationContext();
  return counts.announcements;
};

export default NotificationContext;
