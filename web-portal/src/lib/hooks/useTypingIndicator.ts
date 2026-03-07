'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Auto-clear typing indicator after 3 seconds of inactivity
const TYPING_TIMEOUT_MS = 3000;
// Throttle typing updates to avoid flooding the server
const TYPING_THROTTLE_MS = 1000;

interface TypingUser {
  userId: string;
  userName?: string;
  isTyping: boolean;
  lastUpdated: string;
}

interface UseTypingIndicatorOptions {
  supabase: SupabaseClient;
  threadId: string | null;
  userId?: string;
  userName?: string;
}

interface TypingIndicatorRow {
  id: string;
  thread_id: string;
  user_id: string;
  is_typing: boolean;
  last_updated_at: string;
}

// Type for fetched typing indicator data
interface FetchedTypingIndicator {
  user_id: string;
  is_typing: boolean;
  last_updated_at: string;
}

export const useTypingIndicator = ({
  supabase,
  threadId,
  userId,
  userName,
}: UseTypingIndicatorOptions) => {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingUpdateRef = useRef<number>(0);
  const typingCleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update typing indicator on server
  const updateTypingStatus = useCallback(async (typing: boolean) => {
    if (!threadId || !userId) return;

    try {
      await supabase.rpc('update_typing_indicator', {
        p_thread_id: threadId,
        p_is_typing: typing,
      });
    } catch (err) {
      console.error('Error updating typing indicator:', err);
    }
  }, [supabase, threadId, userId]);

  // Start typing (with throttle)
  const startTyping = useCallback(() => {
    if (!threadId || !userId) return;

    const now = Date.now();
    
    // Throttle typing updates
    if (now - lastTypingUpdateRef.current < TYPING_THROTTLE_MS && isTyping) {
      // Just reset the timeout without sending another update
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        updateTypingStatus(false);
      }, TYPING_TIMEOUT_MS);
      return;
    }

    lastTypingUpdateRef.current = now;
    setIsTyping(true);
    updateTypingStatus(true);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-stop typing after timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      updateTypingStatus(false);
    }, TYPING_TIMEOUT_MS);
  }, [threadId, userId, isTyping, updateTypingStatus]);

  // Stop typing immediately
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    
    if (isTyping) {
      setIsTyping(false);
      updateTypingStatus(false);
    }
  }, [isTyping, updateTypingStatus]);

  // Fetch current typing users
  const fetchTypingUsers = useCallback(async () => {
    if (!threadId) {
      setTypingUsers([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('typing_indicators')
        .select(`
          user_id,
          is_typing,
          last_updated_at
        `)
        .eq('thread_id', threadId)
        .eq('is_typing', true);

      if (error) {
        console.warn('Error fetching typing users:', error);
        setTypingUsers([]);
        return;
      }

      // Filter out stale typing indicators (older than 5 seconds)
      const now = new Date();
      const activeTypers = (data || [] as FetchedTypingIndicator[])
        .filter((t: FetchedTypingIndicator) => {
          const lastUpdated = new Date(t.last_updated_at);
          const ageMs = now.getTime() - lastUpdated.getTime();
          return ageMs < TYPING_TIMEOUT_MS + 2000; // Give 2s grace period
        })
        .filter((t: FetchedTypingIndicator) => t.user_id !== userId) // Exclude self
        .map((t: FetchedTypingIndicator): TypingUser => {
          return {
            userId: t.user_id,
            userName: undefined, // Will be resolved elsewhere if needed
            isTyping: t.is_typing,
            lastUpdated: t.last_updated_at,
          };
        });

      setTypingUsers(activeTypers);
    } catch (err) {
      console.warn('Caught error in fetchTypingUsers:', err);
      setTypingUsers([]);
    }
  }, [supabase, threadId, userId]);

  // Set up real-time subscription
  useEffect(() => {
    if (!threadId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setTypingUsers([]);
      return;
    }

    // Fetch initial typing users
    fetchTypingUsers();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`typing:${threadId}`)
      .on<TypingIndicatorRow>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload: RealtimePostgresChangesPayload<TypingIndicatorRow>) => {
          const eventData = payload.eventType === 'DELETE' ? payload.old : payload.new;
          
          // Ignore own typing indicator or if data is missing
          if (!eventData || !eventData.user_id || eventData.user_id === userId) return;

          const typingUserId = eventData.user_id;

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (eventData.is_typing) {
              const lastUpdated = eventData.last_updated_at || new Date().toISOString();
              setTypingUsers((prev) => {
                // Update or add typing user
                const existing = prev.find((u) => u.userId === typingUserId);
                if (existing) {
                  return prev.map((u) =>
                    u.userId === typingUserId
                      ? { ...u, isTyping: true, lastUpdated }
                      : u
                  );
                }
                return [
                  ...prev,
                  {
                    userId: typingUserId,
                    isTyping: true,
                    lastUpdated,
                  },
                ];
              });
            } else {
              // Remove from typing users
              setTypingUsers((prev) =>
                prev.filter((u) => u.userId !== typingUserId)
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setTypingUsers((prev) =>
              prev.filter((u) => u.userId !== typingUserId)
            );
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Set up interval to clean up stale typing indicators
    typingCleanupIntervalRef.current = setInterval(() => {
      const now = new Date();
      setTypingUsers((prev) =>
        prev.filter((u) => {
          const lastUpdated = new Date(u.lastUpdated);
          const ageMs = now.getTime() - lastUpdated.getTime();
          return ageMs < TYPING_TIMEOUT_MS + 2000;
        })
      );
    }, 2000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (typingCleanupIntervalRef.current) {
        clearInterval(typingCleanupIntervalRef.current);
        typingCleanupIntervalRef.current = null;
      }
    };
  }, [supabase, threadId, userId, fetchTypingUsers]);

  // Clean up on unmount or thread change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Stop typing when leaving thread
      if (isTyping && threadId && userId) {
        updateTypingStatus(false);
      }
    };
  }, [isTyping, threadId, userId, updateTypingStatus]);

  // Get formatted typing text
  const typingText = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
      ? `${typingUsers[0].userName || 'Someone'} is typing...`
      : typingUsers.length === 2
        ? `${typingUsers[0].userName || 'Someone'} and ${typingUsers[1].userName || 'someone else'} are typing...`
        : `${typingUsers.length} people are typing...`;

  return {
    typingUsers,
    typingText,
    isTyping,
    startTyping,
    stopTyping,
  };
};