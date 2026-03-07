'use client';

/**
 * Hook for fetching and managing children data
 * Types extracted to types/childTypes.ts
 * Card builder utility extracted to lib/utils/childCardBuilder.ts
 * Real-time subscription extracted to useStudentSubscription.ts
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildChildCardFromData, createDefaultMetrics } from '@/lib/utils/childCardBuilder';
import { useStudentSubscription } from './useStudentSubscription';
import type { ChildCard, UseChildrenDataReturn, HomeworkAssignmentRow, HomeworkSubmissionRow, ChildMetrics } from './types';

// Re-export types for backward compatibility
export type { ChildCard, UseChildrenDataReturn } from './types';

export function useChildrenData(userId: string | undefined): UseChildrenDataReturn {
  const [children, setChildren] = useState<any[]>([]);
  const [childrenCards, setChildrenCards] = useState<ChildCard[]>([]);
  const [activeChildId, setActiveChildIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setActiveChildId = useCallback((id: string) => {
    setActiveChildIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('edudash_active_child_id', id);
      window.dispatchEvent(new CustomEvent('edudash_active_child_changed', { detail: id }));
    }
  }, []);

  const clearActiveChild = useCallback(() => {
    setActiveChildIdState(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('edudash_active_child_id');
    }
  }, []);

  const fetchChildMetrics = useCallback(async (child: any, supabase: ReturnType<typeof createClient>): Promise<ChildMetrics> => {
    const today = new Date().toISOString().split('T')[0];
    const metrics = createDefaultMetrics();
    const schoolId = child.organization_id || child.preschool_id || null;

    // Attendance check
    try {
      const { data: att } = await supabase.from('attendance').select('status')
        .eq('student_id', child.id).eq('attendance_date', today).maybeSingle();
      if (att) {
        const s = String(att.status).toLowerCase();
        metrics.status = ['present', 'absent', 'late'].includes(s) ? (s as 'active' | 'absent' | 'late') : 'active';
      }
    } catch {}

    if (child.class_id) {
      // Homework count
      try {
        // Fetch assignments for the class
        let assignmentsQuery = supabase
          .from('homework_assignments')
          .select('id')
          .eq('class_id', child.class_id)
          .eq('is_published', true)
          .gte('due_date', today);

        if (schoolId) {
          assignmentsQuery = assignmentsQuery.eq('preschool_id', schoolId);
        }

        const { data: assignments } = await assignmentsQuery;

        if (assignments && assignments.length > 0) {
          const assignmentIds = assignments.map((a: { id: string }) => a.id);
          // Check which ones have been submitted
          let submissionsQuery = supabase
            .from('homework_submissions')
            .select('assignment_id')
            .eq('student_id', child.id)
            .in('assignment_id', assignmentIds);

          if (schoolId) {
            submissionsQuery = submissionsQuery.eq('preschool_id', schoolId);
          }

          const { data: submissions } = await submissionsQuery;

          const submittedIds = new Set(submissions?.map((s: { assignment_id: string }) => s.assignment_id) || []);
          metrics.homeworkPending = assignmentIds.filter((id: string) => !submittedIds.has(id)).length;
        }
      } catch {}
      // Events count
      try {
        let eventsQuery = supabase.from('class_events').select('*', { count: 'exact', head: true })
          .eq('class_id', child.class_id).gte('start_time', new Date().toISOString());

        if (schoolId) {
          eventsQuery = eventsQuery.eq('preschool_id', schoolId);
        }

        const { count } = await eventsQuery;
        metrics.upcomingEvents = count || 0;
      } catch {}
    }
    return metrics;
  }, []);

  const buildChildCard = useCallback(async (child: any, supabase: ReturnType<typeof createClient>): Promise<ChildCard> => {
    const metrics = await fetchChildMetrics(child, supabase);
    return buildChildCardFromData(child, metrics);
  }, [fetchChildMetrics]);

  const loadChildrenData = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, preschool_id, organization_id')
        .eq('id', userId)
        .maybeSingle();
      if (!profile) {
        setError('Profile not found. Please complete registration or contact support.');
        setLoading(false);
        return;
      }
      const scopeId = profile.preschool_id || profile.organization_id || null;

      let query = supabase
        .from('students')
        .select(`id, first_name, last_name, class_id, is_active, preschool_id, organization_id, student_id, date_of_birth, parent_id, guardian_id, avatar_url, classes!students_class_id_fkey(id, name, grade_level)`)
        .or(`parent_id.eq.${profile.id},guardian_id.eq.${profile.id}`)
        .eq('is_active', true);

      if (scopeId) {
        query = query.or(`preschool_id.eq.${scopeId},organization_id.eq.${scopeId}`);
      }

      const { data: students } = await query;

      const data = students || [];
      setChildren(data);
      const cards = await Promise.all(data.map((c: any) => buildChildCard(c, supabase)));
      setChildrenCards(cards);

      if (cards.length > 0) {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('edudash_active_child_id') : null;
        setActiveChildIdState(saved && cards.find((c: ChildCard) => c.id === saved) ? saved : cards[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally { setLoading(false); }
  }, [userId, buildChildCard]);

  useEffect(() => { loadChildrenData(); }, [loadChildrenData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleActiveChildChanged = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail && detail !== activeChildId) {
        setActiveChildIdState(detail);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'edudash_active_child_id') return;
      if (event.newValue && event.newValue !== activeChildId) {
        setActiveChildIdState(event.newValue);
      }
    };
    window.addEventListener('edudash_active_child_changed', handleActiveChildChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('edudash_active_child_changed', handleActiveChildChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, [activeChildId]);

  useStudentSubscription({
    userId,
    activeChildId,
    onStudentDeleted: clearActiveChild,
    onStudentChanged: loadChildrenData,
  });

  return { children, childrenCards, activeChildId, setActiveChildId, loading, error, refetch: loadChildrenData };
}
