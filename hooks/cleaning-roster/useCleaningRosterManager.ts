import { useCallback, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import type { CleaningArea, CleaningAssignment, CleaningAssignmentStatus, CleaningShift, CleaningTeacher } from './types';
import type { CleaningShiftSlot } from '@/lib/cleaning-roster/constants';
import { mapMemberRows, mapTeacherRows } from './teacherUtils';
interface UseCleaningRosterManagerParams {
  organizationId: string | null;
}
const ORDER_BY_CREATED = { ascending: true } as const;
export function useCleaningRosterManager({ organizationId }: UseCleaningRosterManagerParams) {
  const [areas, setAreas] = useState<CleaningArea[]>([]);
  const [shifts, setShifts] = useState<CleaningShift[]>([]);
  const [assignments, setAssignments] = useState<CleaningAssignment[]>([]);
  const [teachers, setTeachers] = useState<CleaningTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRoster = useCallback(async (range: { from: string; to: string }) => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = assertSupabase();

      const [areasResult, shiftsResult, teachersResult] = await Promise.all([
        supabase
          .from('cleaning_areas')
          .select('id, organization_id, name, description, is_active, sort_order')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('sort_order')
          .order('name'),
        supabase
          .from('cleaning_shifts')
          .select('id, organization_id, cleaning_area_id, shift_date, shift_slot, notes, required_staff_count, is_active')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .gte('shift_date', range.from)
          .lte('shift_date', range.to)
          .order('shift_date')
          .order('shift_slot'),
        supabase
          .from('teachers')
          .select('id, user_id, auth_user_id, first_name, last_name, full_name, email, is_active')
          .eq('preschool_id', organizationId)
          .eq('is_active', true)
          .order('created_at', ORDER_BY_CREATED),
      ]);

      if (areasResult.error) throw new Error(areasResult.error.message);
      if (shiftsResult.error) throw new Error(shiftsResult.error.message);
      if (teachersResult.error) throw new Error(teachersResult.error.message);

      const nextAreas = (areasResult.data || []) as CleaningArea[];
      const nextShifts = (shiftsResult.data || []) as CleaningShift[];
      const shiftIds = nextShifts.map((shift) => shift.id);

      let nextAssignments: CleaningAssignment[] = [];
      if (shiftIds.length > 0) {
        const assignmentsResult = await supabase
          .from('cleaning_assignments')
          .select('id, organization_id, cleaning_shift_id, teacher_user_id, status, started_at, completed_at, completion_note, proof_photo_url')
          .in('cleaning_shift_id', shiftIds)
          .order('created_at', ORDER_BY_CREATED);
        if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
        nextAssignments = (assignmentsResult.data || []) as CleaningAssignment[];
      }

      let nextTeachers = mapTeacherRows((teachersResult.data || []) as any[]);

      if (nextTeachers.length === 0) {
        const membersResult = await supabase
          .from('organization_members')
          .select('user_id, first_name, last_name, email, role, membership_status')
          .eq('organization_id', organizationId)
          .eq('membership_status', 'active')
          .eq('role', 'teacher');
        if (membersResult.error) throw new Error(membersResult.error.message);

        nextTeachers = mapMemberRows((membersResult.data || []) as any[]);
      }

      setAreas(nextAreas);
      setShifts(nextShifts);
      setAssignments(nextAssignments);
      setTeachers(nextTeachers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cleaning roster');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const createArea = useCallback(async (name: string, description?: string) => {
    if (!organizationId) throw new Error('No organization assigned');
    const cleanedName = name.trim();
    if (!cleanedName) throw new Error('Area name is required');

    setSaving(true);
    try {
      const { error: insertError } = await assertSupabase()
        .from('cleaning_areas')
        .insert({
          organization_id: organizationId,
          name: cleanedName,
          description: (description || '').trim() || null,
        });
      if (insertError) throw new Error(insertError.message);
    } finally {
      setSaving(false);
    }
  }, [organizationId]);

  const createShift = useCallback(async (input: { areaId: string; shiftDate: string; slot: CleaningShiftSlot; requiredStaffCount?: number; notes?: string }) => {
    if (!organizationId) throw new Error('No organization assigned');
    if (!input.areaId) throw new Error('Select a cleaning area');
    if (!input.shiftDate) throw new Error('Select a shift date');

    setSaving(true);
    try {
      const { error: insertError } = await assertSupabase()
        .from('cleaning_shifts')
        .insert({
          organization_id: organizationId,
          cleaning_area_id: input.areaId,
          shift_date: input.shiftDate,
          shift_slot: input.slot,
          required_staff_count: Math.max(1, Number(input.requiredStaffCount || 1)),
          notes: (input.notes || '').trim() || null,
        });
      if (insertError) throw new Error(insertError.message);
    } finally {
      setSaving(false);
    }
  }, [organizationId]);

  const assignTeacher = useCallback(async (shiftId: string, teacherUserId: string) => {
    if (!organizationId) throw new Error('No organization assigned');
    setSaving(true);
    try {
      const { error: upsertError } = await assertSupabase()
        .from('cleaning_assignments')
        .upsert(
          [{ organization_id: organizationId, cleaning_shift_id: shiftId, teacher_user_id: teacherUserId }],
          { onConflict: 'cleaning_shift_id,teacher_user_id' }
        );
      if (upsertError) throw new Error(upsertError.message);
    } finally {
      setSaving(false);
    }
  }, [organizationId]);

  const unassignTeacher = useCallback(async (assignmentId: string) => {
    setSaving(true);
    try {
      const { error: deleteError } = await assertSupabase().from('cleaning_assignments').delete().eq('id', assignmentId);
      if (deleteError) throw new Error(deleteError.message);
    } finally {
      setSaving(false);
    }
  }, []);

  const updateAssignmentStatus = useCallback(async (assignmentId: string, status: CleaningAssignmentStatus) => {
    const nowIso = new Date().toISOString();
    const payload: Partial<CleaningAssignment> = {
      status,
      started_at: status === 'in_progress' ? nowIso : null,
      completed_at: status === 'completed' ? nowIso : null,
    };
    setSaving(true);
    try {
      const { error: updateError } = await assertSupabase().from('cleaning_assignments').update(payload).eq('id', assignmentId);
      if (updateError) throw new Error(updateError.message);
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    areas,
    shifts,
    assignments,
    teachers,
    loading,
    saving,
    error,
    loadRoster,
    createArea,
    createShift,
    assignTeacher,
    unassignTeacher,
    updateAssignmentStatus,
  };
}
