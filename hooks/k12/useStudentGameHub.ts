/**
 * Student Game Hub Hooks
 * Fetches assignments, XP, leaderboard, and submits game sessions.
 * ≤200 lines (WARP)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  K12GameAssignmentRow,
  K12GameSessionRow,
  K12StudentXPRow,
  K12Subject,
} from '@/lib/activities/k12Activities.types';

// ── My active assignments with attempt counts ─────────────────

export interface StudentAssignment extends K12GameAssignmentRow {
  attempts_used: number;
}

export function useMyAssignments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['k12', 'my-assignments', user?.id],
    queryFn: async (): Promise<StudentAssignment[]> => {
      const sb = assertSupabase();
      const { data, error } = await sb
        .from('k12_game_assignments')
        .select('*, class:classes(id, name)')
        .eq('status', 'active')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      if (!data?.length) return [];

      const withAttempts = await Promise.all(
        data.map(async a => {
          const { data: count } = await sb.rpc('k12_attempts_used', {
            p_assignment_id: a.id,
            p_student_id: user!.id,
          });
          return { ...a, attempts_used: (count as number) || 0 } as StudentAssignment;
        }),
      );
      return withAttempts;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

// ── My XP / Level / Streak ────────────────────────────────────

export function useMyXP() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['k12', 'my-xp', user?.id],
    queryFn: async (): Promise<K12StudentXPRow | null> => {
      const sb = assertSupabase();
      const { data, error } = await sb
        .from('k12_student_xp')
        .select('*')
        .eq('student_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as K12StudentXPRow | null;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

// ── Recent game sessions ──────────────────────────────────────

export function useRecentSessions(limit = 10) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['k12', 'recent-sessions', user?.id, limit],
    queryFn: async (): Promise<K12GameSessionRow[]> => {
      const sb = assertSupabase();
      const { data, error } = await sb
        .from('k12_game_sessions')
        .select('*')
        .eq('student_id', user!.id)
        .order('completed_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as K12GameSessionRow[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

// ── Class leaderboard ─────────────────────────────────────────

export interface LeaderboardEntry {
  studentId: string;
  name: string;
  totalXp: number;
  level: number;
  avatarUrl?: string;
}

export function useClassLeaderboard() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['k12', 'leaderboard', user?.id],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const sb = assertSupabase();
      const { data, error } = await sb
        .from('k12_student_xp')
        .select('student_id, total_xp, level')
        .order('total_xp', { ascending: false })
        .limit(20);
      if (error) throw error;
      if (!data?.length) return [];

      const ids = data.map(d => d.student_id);
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', ids);

      const profileMap = new Map(
        (profiles || []).map(p => [p.id, p]),
      );

      return data.map(d => {
        const p = profileMap.get(d.student_id);
        return {
          studentId: d.student_id,
          name: p
            ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
            : 'Unknown',
          totalXp: d.total_xp,
          level: d.level,
          avatarUrl: p?.avatar_url ?? undefined,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

// ── Submit session + upsert XP ────────────────────────────────

export interface SubmitSessionParams {
  assignmentId: string | null;
  gameId: string;
  score: number;
  maxScore: number;
  correctAnswers: number;
  totalQuestions: number;
  timeSpentSeconds: number;
  stars: number;
  xpEarned: number;
  subject: K12Subject;
}

export function useSubmitSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: SubmitSessionParams) => {
      const sb = assertSupabase();
      const { error: sessionError } = await sb
        .from('k12_game_sessions')
        .insert({
          assignment_id: params.assignmentId,
          student_id: user!.id,
          game_id: params.gameId,
          score: params.score,
          max_score: params.maxScore,
          correct_answers: params.correctAnswers,
          total_questions: params.totalQuestions,
          time_spent_seconds: params.timeSpentSeconds,
          stars: params.stars,
          xp_earned: params.xpEarned,
        });
      if (sessionError) throw sessionError;

      const { error: xpError } = await sb.rpc('upsert_student_xp', {
        p_student_id: user!.id,
        p_xp_earned: params.xpEarned,
        p_subject: params.subject,
      });
      if (xpError) throw xpError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['k12'] });
    },
  });
}
