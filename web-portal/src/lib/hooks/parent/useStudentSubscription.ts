'use client';

/**
 * Hook for real-time student changes subscription
 * Extracted from useChildrenData.ts for single responsibility
 */

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UseStudentSubscriptionOptions {
  userId: string | undefined;
  activeChildId: string | null;
  onStudentDeleted: (deletedId: string) => void;
  onStudentChanged: () => void;
}

/**
 * Subscribe to real-time student changes for a parent
 * Handles both parent_id and guardian_id relationships
 */
export function useStudentSubscription({
  userId,
  activeChildId,
  onStudentDeleted,
  onStudentChanged,
}: UseStudentSubscriptionOptions) {
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    
    const handleStudentChange = (payload: any) => {
      console.log('[useStudentSubscription] Student change detected:', payload);
      
      if (payload.eventType === 'DELETE') {
        const deletedId = (payload.old as any)?.id;
        console.log('[useStudentSubscription] Student deleted:', deletedId);
        
        if (deletedId === activeChildId) {
          onStudentDeleted(deletedId);
        }
        onStudentChanged();
      } else if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
        onStudentChanged();
      }
    };

    // Subscribe to student deletions and updates
    const channel = supabase
      .channel('student-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'students',
          filter: `parent_id=eq.${userId}`,
        },
        handleStudentChange
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'students',
          filter: `guardian_id=eq.${userId}`,
        },
        (payload: any) => {
          console.log('[useStudentSubscription] Student change detected (guardian):', payload);
          handleStudentChange(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, activeChildId, onStudentDeleted, onStudentChanged]);
}
