/**
 * Hook for tracking missed calls count
 * 
 * Used by parent dashboard to show badge counter and glow effect
 * on the Calls metric tile.
 * 
 * Only counts UNSEEN missed calls - once user views the calls screen,
 * the count resets to 0.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CALLS_LAST_SEEN_KEY = 'calls_last_seen_at';

/**
 * Get the last time user viewed the calls screen
 */
const getLastSeenCalls = async (userId: string): Promise<string | null> => {
  try {
    const key = `${CALLS_LAST_SEEN_KEY}_${userId}`;
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Save the current time as last seen calls
 */
const setLastSeenCalls = async (userId: string): Promise<void> => {
  try {
    const key = `${CALLS_LAST_SEEN_KEY}_${userId}`;
    await AsyncStorage.setItem(key, new Date().toISOString());
  } catch (error) {
    console.error('[setLastSeenCalls] Error:', error);
  }
};

/**
 * Hook to get count of UNSEEN missed calls for the current user
 * Only counts missed calls that occurred after the user last viewed the calls screen.
 */
export const useMissedCallsCount = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['missed-calls-count', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user?.id) return 0;
      
      const client = assertSupabase();
      
      try {
        // Get last seen timestamp
        const lastSeen = await getLastSeenCalls(user.id);
        
        // Build query for missed calls
        // A call is missed if: status='missed' OR (status='ended' AND duration_seconds IS NULL) OR (status='ended' AND duration_seconds=0)
        // PostgREST doesn't support complex OR with AND, so we fetch all and filter client-side
        let query = client
          .from('active_calls')
          .select('id, status, duration_seconds, started_at', { count: 'exact' })
          .eq('callee_id', user.id)
          .in('status', ['missed', 'ended']);
        
        // Only count calls after last seen
        if (lastSeen) {
          query = query.gt('started_at', lastSeen);
        }
        
        const { data, count, error } = await query;
        
        // Filter client-side for missed calls
        const missedCalls = (data || []).filter(call => 
          call.status === 'missed' || 
          (call.status === 'ended' && (call.duration_seconds === null || call.duration_seconds === 0))
        );
        
        const missedCount = missedCalls.length;
        
        if (error) {
          // Table might not exist yet
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('[useMissedCallsCount] active_calls table not found');
            return 0;
          }
          console.error('[useMissedCallsCount] Error:', error);
          return 0;
        }
        
        return missedCount;
      } catch (error) {
        console.error('[useMissedCallsCount] Exception:', error);
        return 0;
      }
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 2, // Refetch every 2 minutes
  });
};

/**
 * Hook to mark calls as seen (when user views the calls screen)
 */
export const useMarkCallsSeen = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      await setLastSeenCalls(user.id);
    },
    onSuccess: () => {
      // Invalidate the count so badge updates
      queryClient.invalidateQueries({ queryKey: ['missed-calls-count'] });
    },
  });
};

/**
 * Hook to get recent missed calls (for notifications or quick view)
 */
export const useRecentMissedCalls = (limit: number = 5) => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['recent-missed-calls', user?.id, limit],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const client = assertSupabase();
      
      try {
        // Note: active_calls table doesn't have foreign keys to profiles,
        // so we fetch calls first, then separately fetch caller profiles
        const { data: calls, error } = await client
          .from('active_calls')
          .select('id, call_id, call_type, status, caller_id, callee_id, caller_name, started_at, duration_seconds')
          .eq('callee_id', user.id)
          .in('status', ['missed', 'ended'])
          .order('started_at', { ascending: false })
          .limit(limit * 2); // Fetch more to filter client-side
        
        if (error) {
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            return [];
          }
          console.error('[useRecentMissedCalls] Error:', error);
          return [];
        }
        
        // Filter client-side for missed calls
        const missedCalls = (calls || []).filter(call => 
          call.status === 'missed' || 
          (call.status === 'ended' && (call.duration_seconds === null || call.duration_seconds === 0))
        ).slice(0, limit);
        
        if (missedCalls.length === 0) return [];
        
        // Fetch caller profiles separately
        const callerIds = [...new Set(missedCalls.map(c => c.caller_id))];
        const { data: callerProfiles } = await client
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', callerIds);
        
        const profileMap = new Map(
          (callerProfiles || []).map(p => [
            p.id,
            `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown'
          ])
        );
        
        return missedCalls.map(call => ({
          id: call.id,
          // Use caller_name from call record if available, otherwise look up profile
          callerName: call.caller_name || profileMap.get(call.caller_id) || 'Unknown',
          callType: call.call_type,
          startedAt: call.started_at,
        })) ?? [];
      } catch (error) {
        console.error('[useRecentMissedCalls] Exception:', error);
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60,
  });
};

export default useMissedCallsCount;
