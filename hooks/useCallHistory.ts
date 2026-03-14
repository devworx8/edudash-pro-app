/**
 * useCallHistory Hook
 * Fetches and manages call history with user profile enrichment
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';

interface CallRecord {
  id: string;
  call_type: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'rejected' | 'missed' | 'busy';
  caller_id: string;
  callee_id: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  meeting_url?: string;
}

interface ProfileRecord {
  id: string;
  first_name?: string;
  last_name?: string;
}

export interface EnrichedCallRecord extends CallRecord {
  caller_name: string;
  callee_name: string;
}

export const useCallHistory = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['call-history', user?.id],
    queryFn: async (): Promise<EnrichedCallRecord[]> => {
      if (!user?.id) return [];
      
      const client = assertSupabase();
      
      // Fetch call records for current user
      const { data, error } = await client
        .from('active_calls')
        .select('id, call_id, call_type, status, caller_id, callee_id, started_at, ended_at, duration_seconds, meeting_url, caller_name')
        .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
        .order('started_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('[useCallHistory] Error fetching calls:', error);
        return [];
      }
      
      if (!data || data.length === 0) return [];
      
      // Collect unique user IDs from calls
      const userIds = new Set<string>();
      data.forEach((call: CallRecord) => {
        userIds.add(call.caller_id);
        userIds.add(call.callee_id);
      });
      
      // Fetch user profiles
      const { data: profiles } = await client
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', Array.from(userIds));
      
      // Create profile name map
      const profileMap = new Map(
        (profiles as ProfileRecord[])?.map((p: ProfileRecord) => [
          p.id, 
          `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown User'
        ]) || []
      );
      
      // Enrich calls with user names
      return data.map((call: CallRecord): EnrichedCallRecord => ({
        ...call,
        caller_name: profileMap.get(call.caller_id) || 'Unknown',
        callee_name: profileMap.get(call.callee_id) || 'Unknown',
      }));
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
  });
};

/**
 * Helper to check if a call is considered "missed"
 * A call is missed if:
 * - It's an incoming call (user is callee)
 * - Status is 'missed' OR (status is 'ended' AND duration is 0)
 */
export const isMissedCall = (call: EnrichedCallRecord, userId: string): boolean => {
  const isIncoming = call.callee_id === userId;
  const wasAnswered = (call.duration_seconds ?? 0) > 0;
  return isIncoming && (call.status === 'missed' || (call.status === 'ended' && !wasAnswered));
};

/**
 * Filter calls by type
 */
export type CallFilter = 'all' | 'missed' | 'incoming' | 'outgoing';

export const filterCalls = (
  calls: EnrichedCallRecord[], 
  filter: CallFilter, 
  userId: string
): EnrichedCallRecord[] => {
  if (filter === 'all') return calls;
  if (filter === 'missed') return calls.filter(call => isMissedCall(call, userId));
  if (filter === 'incoming') return calls.filter(call => call.callee_id === userId);
  if (filter === 'outgoing') return calls.filter(call => call.caller_id === userId);
  return calls;
};

/**
 * Calculate call counts by filter type
 */
export const getCallCounts = (calls: EnrichedCallRecord[], userId: string) => {
  return {
    all: calls.length,
    missed: calls.filter(call => isMissedCall(call, userId)).length,
    incoming: calls.filter(call => call.callee_id === userId).length,
    outgoing: calls.filter(call => call.caller_id === userId).length,
  };
};
