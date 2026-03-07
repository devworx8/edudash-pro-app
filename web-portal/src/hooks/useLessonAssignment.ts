/**
 * useLessonAssignment Hook (Web)
 * 
 * Manages lesson assignments to students and classes.
 * Provides functionality for assigning, tracking, and completing lessons.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface LessonAssignment {
  id: string;
  lesson_id: string;
  student_id: string | null;
  class_id: string | null;
  preschool_id: string;
  assigned_by: string;
  assigned_at: string;
  due_date: string | null;
  status: 'assigned' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  notes: string | null;
  // Joined data
  lesson?: {
    id: string;
    title: string;
    description: string | null;
    subject: string;
    duration_minutes: number;
    age_group: string;
  };
  student?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  class?: {
    id: string;
    name: string;
  };
}

export interface AssignLessonParams {
  lesson_id?: string;
  interactive_activity_id?: string;
  student_id?: string;
  class_id?: string;
  due_date?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  notes?: string;
  lesson_type?: 'standard' | 'interactive' | 'ai_enhanced' | 'robotics' | 'computer_literacy';
  stem_category?: 'ai' | 'robotics' | 'computer_literacy' | 'none';
}

export interface LessonCompletion {
  id: string;
  assignment_id: string;
  lesson_id: string;
  student_id: string;
  preschool_id: string;
  started_at: string | null;
  completed_at: string;
  time_spent_minutes: number | null;
  score: number | null;
  feedback: Record<string, unknown>;
  teacher_notes: string | null;
  status: 'in_progress' | 'completed' | 'needs_review' | 'reviewed';
}

interface UseLessonAssignmentReturn {
  // Data
  assignments: LessonAssignment[];
  studentAssignments: LessonAssignment[];
  classAssignments: LessonAssignment[];
  completions: LessonCompletion[];
  
  // State
  isLoading: boolean;
  isAssigning: boolean;
  isCompleting: boolean;
  error: Error | null;
  
  // Actions
  assignLesson: (params: AssignLessonParams) => Promise<boolean>;
  assignLessonToClass: (lessonId: string, classId: string, options?: Partial<AssignLessonParams>) => Promise<boolean>;
  updateAssignmentStatus: (assignmentId: string, status: LessonAssignment['status']) => Promise<boolean>;
  completeLesson: (assignmentId: string, data: Partial<LessonCompletion>) => Promise<boolean>;
  cancelAssignment: (assignmentId: string) => Promise<boolean>;
  refetch: () => void;
}

export function useLessonAssignment(options?: {
  studentId?: string;
  classId?: string;
  lessonId?: string;
  organizationId?: string;
  userId?: string;
}): UseLessonAssignmentReturn {
  const queryClient = useQueryClient();
  const [isAssigning, setIsAssigning] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  
  const organizationId = options?.organizationId;
  const userId = options?.userId;
  
  // Fetch assignments
  const {
    data: assignments = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['lesson-assignments', organizationId, options?.studentId, options?.classId, options?.lessonId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const supabase = createClient();
      let query = supabase
        .from('lesson_assignments')
        .select(`
          *,
          lesson:lessons(id, title, description, subject, duration_minutes, age_group),
          student:students(id, first_name, last_name),
          class:classes(id, name)
        `)
        .eq('preschool_id', organizationId)
        .order('assigned_at', { ascending: false });
      
      if (options?.studentId) {
        query = query.eq('student_id', options.studentId);
      }
      if (options?.classId) {
        query = query.eq('class_id', options.classId);
      }
      if (options?.lessonId) {
        query = query.eq('lesson_id', options.lessonId);
      }
      
      const { data, error: fetchError } = await query;
      
      if (fetchError) {
        console.error('[useLessonAssignment] Fetch error:', fetchError);
        throw fetchError;
      }
      
      return (data || []) as LessonAssignment[];
    },
    enabled: !!organizationId,
    staleTime: 30000,
  });
  
  // Fetch completions for a student
  const {
    data: completions = [],
  } = useQuery({
    queryKey: ['lesson-completions', organizationId, options?.studentId],
    queryFn: async () => {
      if (!organizationId || !options?.studentId) return [];
      
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('lesson_completions')
        .select('*')
        .eq('student_id', options.studentId)
        .order('completed_at', { ascending: false });
      
      if (fetchError) {
        console.error('[useLessonAssignment] Completions fetch error:', fetchError);
        throw fetchError;
      }
      
      return (data || []) as LessonCompletion[];
    },
    enabled: !!organizationId && !!options?.studentId,
    staleTime: 30000,
  });
  
  // Update assignment status
  const updateAssignmentStatus = useCallback(async (
    assignmentId: string,
    status: LessonAssignment['status']
  ): Promise<boolean> => {
    try {
      const supabase = createClient();
      
      const { error: updateError } = await supabase
        .from('lesson_assignments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', assignmentId);
      
      if (updateError) throw updateError;
      
      queryClient.invalidateQueries({ queryKey: ['lesson-assignments'] });
      return true;
    } catch (err) {
      console.error('[useLessonAssignment] Update status error:', err);
      return false;
    }
  }, [queryClient]);
  
  // Assign lesson to student
  const assignLesson = useCallback(async (params: AssignLessonParams): Promise<boolean> => {
    if (!organizationId || !userId) return false;
    
    if (!params.student_id && !params.class_id) {
      console.error('[useLessonAssignment] Either student_id or class_id is required');
      return false;
    }
    
    if (!params.lesson_id && !params.interactive_activity_id) {
      console.error('[useLessonAssignment] Either lesson_id or interactive_activity_id is required');
      return false;
    }
    
    setIsAssigning(true);
    try {
      const supabase = createClient();
      
      const assignmentData = {
        lesson_id: params.lesson_id || null,
        interactive_activity_id: params.interactive_activity_id || null,
        student_id: params.student_id || null,
        class_id: params.class_id || null,
        preschool_id: organizationId,
        assigned_by: userId,
        due_date: params.due_date || null,
        priority: params.priority || 'normal',
        notes: params.notes || null,
        status: 'assigned' as const,
        lesson_type: params.lesson_type || (params.interactive_activity_id ? 'interactive' : 'standard'),
        stem_category: params.stem_category || 'none',
      };
      
      const { error: insertError } = await supabase
        .from('lesson_assignments')
        .insert(assignmentData);
      
      if (insertError) throw insertError;
      
      queryClient.invalidateQueries({ queryKey: ['lesson-assignments'] });
      return true;
    } catch (err) {
      console.error('[useLessonAssignment] Assign error:', err);
      return false;
    } finally {
      setIsAssigning(false);
    }
  }, [organizationId, userId, queryClient]);
  
  // Assign lesson to entire class
  const assignLessonToClass = useCallback(async (
    lessonId: string,
    classId: string,
    assignOptions?: Partial<AssignLessonParams>
  ): Promise<boolean> => {
    if (!organizationId || !userId) return false;
    
    setIsAssigning(true);
    try {
      const supabase = createClient();
      
      // Get all students in the class
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id')
        .eq('class_id', classId)
        .eq('is_active', true);
      
      if (studentsError) throw studentsError;
      
      if (!students || students.length === 0) {
        // Assign to class directly
        const { error: insertError } = await supabase
          .from('lesson_assignments')
          .insert({
            lesson_id: lessonId,
            class_id: classId,
            preschool_id: organizationId,
            assigned_by: userId,
            due_date: assignOptions?.due_date || null,
            priority: assignOptions?.priority || 'normal',
            notes: assignOptions?.notes || null,
            status: 'assigned',
          });
        
        if (insertError) throw insertError;
      } else {
        // Assign to each student in the class
        const classAssignments = students.map((student: { id: string }) => ({
          lesson_id: lessonId,
          student_id: student.id,
          class_id: classId,
          preschool_id: organizationId,
          assigned_by: userId,
          due_date: assignOptions?.due_date || null,
          priority: assignOptions?.priority || 'normal',
          notes: assignOptions?.notes || null,
          status: 'assigned' as const,
        }));
        
        const { error: insertError } = await supabase
          .from('lesson_assignments')
          .insert(classAssignments);
        
        if (insertError) throw insertError;
      }
      
      queryClient.invalidateQueries({ queryKey: ['lesson-assignments'] });
      return true;
    } catch (err) {
      console.error('[useLessonAssignment] Class assign error:', err);
      return false;
    } finally {
      setIsAssigning(false);
    }
  }, [organizationId, userId, queryClient]);
  
  // Complete a lesson
  const completeLesson = useCallback(async (
    assignmentId: string,
    data: Partial<LessonCompletion>
  ): Promise<boolean> => {
    if (!organizationId) return false;
    
    setIsCompleting(true);
    try {
      const supabase = createClient();
      
      // Get assignment details
      const { data: assignment, error: assignmentError } = await supabase
        .from('lesson_assignments')
        .select('lesson_id, student_id')
        .eq('id', assignmentId)
        .single();
      
      if (assignmentError || !assignment) throw assignmentError || new Error('Assignment not found');
      
      // Create completion record
      const { error: completionError } = await supabase
        .from('lesson_completions')
        .insert({
          assignment_id: assignmentId,
          lesson_id: assignment.lesson_id,
          student_id: assignment.student_id,
          preschool_id: organizationId,
          completed_at: new Date().toISOString(),
          time_spent_minutes: data.time_spent_minutes || null,
          score: data.score || null,
          feedback: data.feedback || {},
          teacher_notes: data.teacher_notes || null,
          status: 'completed',
        });
      
      if (completionError) throw completionError;
      
      // Update assignment status
      await updateAssignmentStatus(assignmentId, 'completed');
      
      queryClient.invalidateQueries({ queryKey: ['lesson-completions'] });
      return true;
    } catch (err) {
      console.error('[useLessonAssignment] Complete error:', err);
      return false;
    } finally {
      setIsCompleting(false);
    }
  }, [organizationId, updateAssignmentStatus, queryClient]);
  
  // Cancel assignment
  const cancelAssignment = useCallback(async (assignmentId: string): Promise<boolean> => {
    return updateAssignmentStatus(assignmentId, 'cancelled');
  }, [updateAssignmentStatus]);
  
  // Derived data
  const studentAssignments = useMemo(
    () => assignments.filter(a => a.student_id !== null),
    [assignments]
  );
  
  const classAssignments = useMemo(
    () => assignments.filter(a => a.class_id !== null && a.student_id === null),
    [assignments]
  );
  
  return {
    assignments,
    studentAssignments,
    classAssignments,
    completions,
    isLoading,
    isAssigning,
    isCompleting,
    error: error as Error | null,
    assignLesson,
    assignLessonToClass,
    updateAssignmentStatus,
    completeLesson,
    cancelAssignment,
    refetch,
  };
}
