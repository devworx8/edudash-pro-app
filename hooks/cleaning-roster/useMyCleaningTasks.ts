import { useCallback, useMemo, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { slotSortValue } from '@/lib/cleaning-roster/constants';
import type { CleaningArea, CleaningAssignment, CleaningShift, CleaningTaskView } from './types';

interface UseMyCleaningTasksParams {
  organizationId: string | null;
  userId: string | null;
}

interface DateRange {
  from: string;
  to: string;
}

export function useMyCleaningTasks({ organizationId, userId }: UseMyCleaningTasksParams) {
  const [tasks, setTasks] = useState<CleaningTaskView[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async (range: DateRange) => {
    if (!organizationId || !userId) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = assertSupabase();
      const shiftsResult = await supabase
        .from('cleaning_shifts')
        .select('id, organization_id, cleaning_area_id, shift_date, shift_slot, notes, required_staff_count, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .gte('shift_date', range.from)
        .lte('shift_date', range.to);
      if (shiftsResult.error) throw new Error(shiftsResult.error.message);

      const shifts = (shiftsResult.data || []) as CleaningShift[];
      const shiftIds = shifts.map((shift) => shift.id);
      if (shiftIds.length === 0) {
        setTasks([]);
        return;
      }

      const assignmentsResult = await supabase
        .from('cleaning_assignments')
        .select('id, organization_id, cleaning_shift_id, teacher_user_id, status, started_at, completed_at, completion_note, proof_photo_url')
        .eq('organization_id', organizationId)
        .eq('teacher_user_id', userId)
        .in('cleaning_shift_id', shiftIds);
      if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);

      const assignments = (assignmentsResult.data || []) as CleaningAssignment[];
      const areaIds = Array.from(new Set(shifts.map((shift) => shift.cleaning_area_id).filter(Boolean)));
      let areas: CleaningArea[] = [];
      if (areaIds.length > 0) {
        const areasResult = await supabase
          .from('cleaning_areas')
          .select('id, organization_id, name, description, is_active, sort_order')
          .in('id', areaIds);
        if (areasResult.error) throw new Error(areasResult.error.message);
        areas = (areasResult.data || []) as CleaningArea[];
      }

      const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
      const areaById = new Map(areas.map((area) => [area.id, area]));
      const nextTasks = assignments
        .map((assignment) => {
          const shift = shiftById.get(assignment.cleaning_shift_id);
          if (!shift) return null;
          const area = areaById.get(shift.cleaning_area_id);
          return {
            assignmentId: assignment.id,
            shiftId: shift.id,
            areaName: area?.name || 'Cleaning Area',
            shiftDate: shift.shift_date,
            shiftSlot: shift.shift_slot,
            status: assignment.status,
            startedAt: assignment.started_at,
            completedAt: assignment.completed_at,
            completionNote: assignment.completion_note,
          } satisfies CleaningTaskView;
        })
        .filter((task): task is CleaningTaskView => Boolean(task))
        .sort((a, b) => {
          if (a.shiftDate === b.shiftDate) return slotSortValue(a.shiftSlot) - slotSortValue(b.shiftSlot);
          return a.shiftDate.localeCompare(b.shiftDate);
        });

      setTasks(nextTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cleaning tasks');
    } finally {
      setLoading(false);
    }
  }, [organizationId, userId]);

  const startTask = useCallback(async (assignmentId: string) => {
    setSavingTaskId(assignmentId);
    try {
      const { error: updateError } = await assertSupabase()
        .from('cleaning_assignments')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
          completed_at: null,
        })
        .eq('id', assignmentId);
      if (updateError) throw new Error(updateError.message);
    } finally {
      setSavingTaskId(null);
    }
  }, []);

  const completeTask = useCallback(async (assignmentId: string, note?: string) => {
    setSavingTaskId(assignmentId);
    try {
      const { error: updateError } = await assertSupabase()
        .from('cleaning_assignments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completion_note: (note || '').trim() || null,
        })
        .eq('id', assignmentId);
      if (updateError) throw new Error(updateError.message);
    } finally {
      setSavingTaskId(null);
    }
  }, []);

  return useMemo(() => ({
    tasks,
    loading,
    error,
    savingTaskId,
    loadTasks,
    startTask,
    completeTask,
  }), [tasks, loading, error, savingTaskId, loadTasks, startTask, completeTask]);
}
