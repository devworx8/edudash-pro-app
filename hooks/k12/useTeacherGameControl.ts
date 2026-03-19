/**
 * Teacher Game Control Hooks
 * Manages game library filtering, assignments CRUD, and leaderboards.
 * ≤200 lines (WARP)
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { K12_GAMES } from '@/lib/activities/k12Games.data';
import type {
  K12Game,
  K12GameAssignmentRow,
  K12Difficulty,
  K12Subject,
  K12GradeRange,
} from '@/lib/activities/k12Activities.types';

// ── Types ─────────────────────────────────────────────────────

export interface ClassRow {
  id: string;
  name: string;
  grade?: string;
}

export interface AssignmentWithStats extends K12GameAssignmentRow {
  studentCount: number;
  completedCount: number;
}

// ── Library filter ────────────────────────────────────────────

export function useFilteredGames(
  subject: K12Subject | 'all',
  grade: K12GradeRange | 'all',
): K12Game[] {
  return useMemo(
    () =>
      K12_GAMES.filter(g => {
        if (subject !== 'all' && g.subject !== subject) return false;
        if (grade !== 'all' && g.gradeRange !== grade) return false;
        return true;
      }),
    [subject, grade],
  );
}

// ── Teacher's classes ─────────────────────────────────────────

export function useTeacherClasses() {
  return useQuery({
    queryKey: ['teacher-classes'],
    queryFn: async (): Promise<ClassRow[]> => {
      const sb = assertSupabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return [];

      // Get class IDs from class_teachers (covers lead + assistant)
      const { data: ctRows } = await sb
        .from('class_teachers')
        .select('class_id')
        .eq('teacher_id', user.id);
      const joinIds = (ctRows || []).map((r: { class_id: string }) => r.class_id);

      // Also get classes where teacher_id is set directly (legacy)
      const { data: legacyRows } = await sb
        .from('classes')
        .select('id')
        .eq('teacher_id', user.id);
      const legacyIds = (legacyRows || []).map((r: { id: string }) => r.id);

      const allIds = [...new Set([...joinIds, ...legacyIds])];
      if (allIds.length === 0) return [];

      const { data, error } = await sb
        .from('classes')
        .select('id, name, grade')
        .in('id', allIds)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Teacher assignments with stats ────────────────────────────

export function useTeacherAssignments() {
  return useQuery({
    queryKey: ['k12-assignments-teacher'],
    queryFn: async (): Promise<AssignmentWithStats[]> => {
      const sb = assertSupabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return [];

      const { data: assignments, error } = await sb
        .from('k12_game_assignments')
        .select('*, class:classes(id, name)')
        .eq('teacher_id', user.id)
        .in('status', ['active', 'closed'])
        .order('assigned_at', { ascending: false });
      if (error) throw error;
      if (!assignments?.length) return [];

      const ids = assignments.map(a => a.id);
      const { data: sessions } = await sb
        .from('k12_game_sessions')
        .select('assignment_id, student_id')
        .in('assignment_id', ids);

      const { data: classStudents } = await sb
        .from('class_students')
        .select('class_id, student_id')
        .in(
          'class_id',
          assignments.map(a => a.class_id),
        );

      return assignments.map(a => {
        const studentCount =
          classStudents?.filter(cs => cs.class_id === a.class_id).length ?? 0;
        const uniqueStudents = new Set(
          sessions
            ?.filter(s => s.assignment_id === a.id)
            .map(s => s.student_id) ?? [],
        );
        return { ...a, studentCount, completedCount: uniqueStudents.size };
      });
    },
    refetchInterval: 30_000,
  });
}

// ── Leaderboard for a single assignment ───────────────────────

export function useAssignmentLeaderboard(assignmentId: string | null) {
  return useQuery({
    queryKey: ['k12-leaderboard', assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const sb = assertSupabase();
      const { data, error } = await sb
        .from('k12_game_sessions')
        .select(
          'student_id, score, stars, xp_earned, time_spent_seconds, completed_at, profiles:student_id(display_name, avatar_url)',
        )
        .eq('assignment_id', assignmentId!)
        .order('score', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });
}

// ── Assign game mutation ──────────────────────────────────────

export interface AssignGamePayload {
  game_id: string;
  class_id: string;
  difficulty: K12Difficulty;
  due_date: string | null;
  is_challenge: boolean;
  show_leaderboard: boolean;
  max_attempts: number;
}

export function useAssignGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AssignGamePayload) => {
      const sb = assertSupabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await sb
        .from('k12_game_assignments')
        .insert({ ...payload, teacher_id: user.id, status: 'active' });
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['k12-assignments-teacher'] }),
  });
}

// ── Close / archive assignment ────────────────────────────────

export function useCloseAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = assertSupabase();
      const { error } = await sb
        .from('k12_game_assignments')
        .update({ status: 'closed' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['k12-assignments-teacher'] }),
  });
}
