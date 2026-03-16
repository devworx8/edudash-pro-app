/**
 * Learner Data Hooks
 * 
 * Custom hooks for fetching and managing learner-specific data:
 * - Enrollments and programs
 * - Progress tracking
 * - Connections and networking
 * - Submissions and assignments
 * - CV and portfolio management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface LearnerEnrollment {
  id: string;
  learner_id: string;
  program_id: string;
  status: 'enrolled' | 'completed' | 'withdrawn';
  enrollment_date: string;
  enrolled_at: string; // Added for compatibility with database schema
  is_active: boolean; // Added for compatibility with database schema
  completion_date: string | null;
  progress_percentage: number;
  program?: {
    id: string;
    title: string;
    code: string;
    organization_id: string;
  };
}

export interface LearnerConnection {
  id: string;
  learner_id: string;
  connection_id: string;
  connection_type: 'peer' | 'instructor';
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  connection?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string;
  };
}

export interface LearnerSubmission {
  id: string;
  learner_id: string;
  enrollment_id: string;
  assignment_id: string;
  status: 'draft' | 'submitted' | 'graded' | 'returned';
  text_response?: string;
  files?: Array<{ url: string; name: string; type: string }>;
  submitted_at?: string;
  graded_at?: string;
  grade?: string;
  feedback?: string;
  assignment?: {
    id: string;
    title: string;
    description: string;
    due_date: string;
  };
}

export interface LearnerCV {
  id: string;
  learner_id: string;
  title: string;
  cv_data: Record<string, any>;
  file_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortfolioItem {
  id: string;
  learner_id: string;
  title: string;
  description?: string;
  item_type: 'project' | 'certificate' | 'achievement' | 'work_sample';
  file_urls: string[];
  tags: string[];
  created_at: string;
}

// ============================================
// Enrollments
// ============================================

/** Compute progress from enrollment metadata or default to status-based estimate */
function computeProgress(enrollment: any): number {
  // If enrollment has explicit progress field, use it
  if (typeof enrollment.progress === 'number') return enrollment.progress;
  if (typeof enrollment.completion_percentage === 'number') return enrollment.completion_percentage;
  // Status-based fallback
  if (enrollment.dropped_at || !enrollment.is_active) return 0;
  return 0; // Will be refined when lesson_completions relation is added
}

export function useLearnerEnrollments() {
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useQuery({
    queryKey: ['learner-enrollments', learnerId],
    queryFn: async () => {
      if (!learnerId) throw new Error('No learner ID available');

      const { data, error } = await assertSupabase()
        .from('enrollments')
        .select(`
          *,
          course:courses (
            id,
            title,
            course_code,
            organization_id
          )
        `)
        .eq('student_id', learnerId) // Fixed: use student_id instead of learner_id
        .eq('is_active', true) // Only get active enrollments
        .order('enrolled_at', { ascending: false }); // Fixed: use enrolled_at instead of enrollment_date

      if (error) throw error;
      
      // Transform the data to match LearnerEnrollment interface
      const transformed = (data || []).map((enrollment: any) => ({
        id: enrollment.id,
        learner_id: enrollment.student_id, // Map student_id to learner_id for interface compatibility
        program_id: enrollment.course_id, // Map course_id to program_id for interface compatibility
        status: enrollment.is_active ? 'enrolled' as const : 'withdrawn' as const,
        enrollment_date: enrollment.enrolled_at,
        enrolled_at: enrollment.enrolled_at, // Added for compatibility
        is_active: enrollment.is_active, // Added for compatibility
        completion_date: enrollment.dropped_at || null,
        progress_percentage: computeProgress(enrollment),
        program: enrollment.course ? {
          id: enrollment.course.id,
          title: enrollment.course.title,
          code: enrollment.course.course_code,
          organization_id: enrollment.course.organization_id,
        } : undefined,
      }));
      
      return transformed as LearnerEnrollment[];
    },
    enabled: !!learnerId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// ============================================
// Connections
// ============================================

export function useLearnerConnections() {
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useQuery({
    queryKey: ['learner-connections', learnerId],
    queryFn: async () => {
      if (!learnerId) throw new Error('No learner ID available');

      const { data, error } = await assertSupabase()
        .from('learner_connections')
        .select(`
          *,
          connection:profiles!learner_connections_connection_id_fkey (
            id,
            first_name,
            last_name,
            email,
            avatar_url
          )
        `)
        .eq('learner_id', learnerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LearnerConnection[];
    },
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateConnection() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useMutation({
    mutationFn: async (data: { connection_id: string; connection_type: 'peer' | 'instructor' }) => {
      if (!learnerId) throw new Error('No learner ID available');

      const { data: result, error } = await assertSupabase()
        .from('learner_connections')
        .insert({
          learner_id: learnerId,
          connection_id: data.connection_id,
          connection_type: data.connection_type,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-connections', learnerId] });
    },
  });
}

export function useUpdateConnectionStatus() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ connectionId, status }: { connectionId: string; status: 'accepted' | 'blocked' }) => {
      const { data, error } = await assertSupabase()
        .from('learner_connections')
        .update({ status })
        .eq('id', connectionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-connections'] });
    },
  });
}

// ============================================
// Submissions
// ============================================

export function useLearnerSubmissions(enrollmentId?: string) {
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useQuery({
    queryKey: ['learner-submissions', learnerId, enrollmentId],
    queryFn: async () => {
      if (!learnerId) throw new Error('No learner ID available');

      let query = assertSupabase()
        .from('assignment_submissions')
        .select(`
          *,
          assignment:homework_assignments!assignment_submissions_assignment_id_fkey (
            id,
            title,
            description,
            due_date,
            is_published
          )
        `)
        .eq('learner_id', learnerId)
        .order('submitted_at', { ascending: false, nullsFirst: false });

      if (enrollmentId) {
        query = query.eq('enrollment_id', enrollmentId);
      }

      const { data, error } = await query;

      if (error) throw error;
      const filtered = (data || []).filter((row: any) => row.assignment?.is_published !== false);
      return filtered as LearnerSubmission[];
    },
    enabled: !!learnerId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

export function useCreateSubmission() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useMutation({
    mutationFn: async (data: {
      enrollment_id: string;
      assignment_id: string;
      text_response?: string;
      files?: Array<{ url: string; name: string; type: string }>;
      status?: 'draft' | 'submitted';
    }) => {
      if (!learnerId) throw new Error('No learner ID available');

      const { data: result, error } = await assertSupabase()
        .from('assignment_submissions')
        .insert({
          learner_id: learnerId,
          enrollment_id: data.enrollment_id,
          assignment_id: data.assignment_id,
          text_response: data.text_response,
          files: data.files || [],
          status: data.status || 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-submissions', learnerId] });
    },
  });
}

export function useUpdateSubmission() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useMutation({
    mutationFn: async ({
      submissionId,
      updates,
    }: {
      submissionId: string;
      updates: Partial<Pick<LearnerSubmission, 'text_response' | 'files' | 'status'>>;
    }) => {
      const { data, error } = await assertSupabase()
        .from('assignment_submissions')
        .update(updates)
        .eq('id', submissionId)
        .eq('learner_id', learnerId) // Ensure user can only update their own
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-submissions', learnerId] });
    },
  });
}

// ============================================
// CV Management
// ============================================

export function useLearnerCVs() {
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useQuery({
    queryKey: ['learner-cvs', learnerId],
    queryFn: async () => {
      if (!learnerId) throw new Error('No learner ID available');

      const { data, error } = await assertSupabase()
        .from('learner_cvs')
        .select('*')
        .eq('learner_id', learnerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LearnerCV[];
    },
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateCV() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useMutation({
    mutationFn: async (data: { title: string; cv_data: Record<string, any>; file_url?: string }) => {
      if (!learnerId) throw new Error('No learner ID available');

      const { data: result, error } = await assertSupabase()
        .from('learner_cvs')
        .insert({
          learner_id: learnerId,
          title: data.title,
          cv_data: data.cv_data,
          file_url: data.file_url,
          is_active: false,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-cvs', learnerId] });
    },
  });
}

// ============================================
// Portfolio
// ============================================

export function useLearnerPortfolio() {
  const { profile } = useAuth();
  const learnerId = profile?.id;

  return useQuery({
    queryKey: ['learner-portfolio', learnerId],
    queryFn: async () => {
      if (!learnerId) throw new Error('No learner ID available');

      const { data, error } = await assertSupabase()
        .from('portfolio_items')
        .select('*')
        .eq('learner_id', learnerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PortfolioItem[];
    },
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================
// Progress Overview
// ============================================

export function useLearnerProgress() {
  const { profile } = useAuth();
  const learnerId = profile?.id;
  const { data: enrollments } = useLearnerEnrollments();

  return useQuery({
    queryKey: ['learner-progress', learnerId],
    queryFn: async () => {
      if (!learnerId || !enrollments) return null;

      const totalPrograms = enrollments.length;
      const completedPrograms = enrollments.filter((e) => e.status === 'completed').length;
      const inProgressPrograms = enrollments.filter((e) => e.status === 'enrolled').length;
      const avgProgress =
        enrollments.reduce((sum, e) => sum + (e.progress_percentage || 0), 0) / totalPrograms || 0;

      // Get recent submissions
      const { data: recentSubmissions } = await assertSupabase()
        .from('assignment_submissions')
        .select('id, status, submitted_at')
        .eq('learner_id', learnerId)
        .order('submitted_at', { ascending: false })
        .limit(5);

      return {
        totalPrograms,
        completedPrograms,
        inProgressPrograms,
        avgProgress: Math.round(avgProgress),
        recentSubmissionsCount: recentSubmissions?.length || 0,
        pendingSubmissions: recentSubmissions?.filter((s) => s.status === 'draft').length || 0,
      };
    },
    enabled: !!learnerId && !!enrollments,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}




