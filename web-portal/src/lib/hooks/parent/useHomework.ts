'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface HomeworkAssignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  class_id: string;
  subject?: string;
  difficulty_level?: 'easy' | 'medium' | 'hard';
  estimated_time_minutes?: number;
  created_at: string;
  // Joined data
  class?: {
    name: string;
    grade_level?: string;
  };
  submissions?: {
    id: string;
    submitted_at: string;
    status: 'submitted' | 'graded' | 'returned';
    grade?: number;
    feedback?: string;
  }[];
}

/**
 * Hook to get homework assignments for a specific child
 */
export const useChildHomework = (studentId: string | undefined, userId: string | undefined) => {
  return useQuery({
    queryKey: ['homework', studentId, userId],
    queryFn: async (): Promise<HomeworkAssignment[]> => {
      if (!studentId || !userId) throw new Error('Student ID and User ID required');
      
      const client = createClient();
      
      // Get student's class_id
      const { data: student, error: studentError } = await client
        .from('students')
        .select('class_id, preschool_id, organization_id')
        .eq('id', studentId)
        .maybeSingle();
      
      if (studentError) throw studentError;
      if (!student?.class_id) return [];
      const schoolId = student.organization_id || student.preschool_id || null;
      
      // Get assignments for the class
      let assignmentsQuery = client
        .from('homework_assignments')
        .select(`
          id,
          title,
          description,
          due_date,
          class_id,
          subject,
          difficulty_level,
          estimated_time_minutes,
          created_at,
          class:classes(name, grade_level)
        `)
        .eq('class_id', student.class_id)
        .eq('is_published', true)
        .order('due_date', { ascending: true });

      if (schoolId) {
        assignmentsQuery = assignmentsQuery.eq('preschool_id', schoolId);
      }

      const { data: assignments, error: assignmentsError } = await assignmentsQuery;
      
      if (assignmentsError) throw assignmentsError;
      if (!assignments) return [];
      
      // Get submissions for each assignment
      const assignmentIds = assignments.map((a: any) => a.id);
      let submissionsQuery = client
        .from('homework_submissions')
        .select('id, assignment_id, submitted_at, status, grade, feedback')
        .eq('student_id', studentId)
        .in('assignment_id', assignmentIds);

      if (schoolId) {
        submissionsQuery = submissionsQuery.eq('preschool_id', schoolId);
      }

      const { data: submissions } = await submissionsQuery;
      
      // Map submissions to assignments
      const assignmentsWithSubmissions = assignments.map((assignment: any) => ({
        ...assignment,
        submissions: submissions?.filter((s: any) => s.assignment_id === assignment.id) || []
      }));
      
      return assignmentsWithSubmissions;
    },
    enabled: !!studentId && !!userId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

/**
 * Hook to get homework statistics for a child
 */
export const useHomeworkStats = (studentId: string | undefined, userId: string | undefined) => {
  return useQuery({
    queryKey: ['homework', 'stats', studentId, userId],
    queryFn: async () => {
      if (!studentId || !userId) throw new Error('Student ID and User ID required');
      
      const client = createClient();
      
      // Get student's class_id
      const { data: student } = await client
        .from('students')
        .select('class_id, preschool_id, organization_id')
        .eq('id', studentId)
        .maybeSingle();
      
      if (!student?.class_id) return { total: 0, completed: 0, pending: 0, overdue: 0 };
      const schoolId = student.organization_id || student.preschool_id || null;
      
      const today = new Date().toISOString().split('T')[0];
      
      // Get all assignments
      let assignmentsQuery = client
        .from('homework_assignments')
        .select('id, due_date')
        .eq('class_id', student.class_id)
        .eq('is_published', true);

      if (schoolId) {
        assignmentsQuery = assignmentsQuery.eq('preschool_id', schoolId);
      }

      const { data: assignments } = await assignmentsQuery;
      
      if (!assignments || assignments.length === 0) {
        return { total: 0, completed: 0, pending: 0, overdue: 0 };
      }
      
      // Get submissions
      const assignmentIds = assignments.map((a: any) => a.id);
      let submissionsQuery = client
        .from('homework_submissions')
        .select('assignment_id, status')
        .eq('student_id', studentId)
        .in('assignment_id', assignmentIds);

      if (schoolId) {
        submissionsQuery = submissionsQuery.eq('preschool_id', schoolId);
      }

      const { data: submissions } = await submissionsQuery;
      
      const submittedIds = new Set(submissions?.map((s: any) => s.assignment_id) || []);
      
      let pending = 0;
      let overdue = 0;
      
      for (const assignment of assignments) {
        if (!submittedIds.has(assignment.id)) {
          if (assignment.due_date < today) {
            overdue++;
          } else {
            pending++;
          }
        }
      }
      
      return {
        total: assignments.length,
        completed: submittedIds.size,
        pending,
        overdue
      };
    },
    enabled: !!studentId && !!userId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};
