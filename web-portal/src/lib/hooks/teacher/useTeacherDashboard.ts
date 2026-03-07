'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TeacherMetrics {
  totalStudents: number;
  totalClasses: number;
  pendingGrading: number;
  upcomingLessons: number;
}

interface ClassData {
  id: string;
  name: string;
  grade: string;
  studentCount: number;
  pendingAssignments: number;
  upcomingLessons: number;
}

export function useTeacherDashboard(userId?: string) {
  const [metrics, setMetrics] = useState<TeacherMetrics>({
    totalStudents: 0,
    totalClasses: 0,
    pendingGrading: 0,
    upcomingLessons: 0,
  });
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      const supabase = createClient();

      // Get teacher's profile — prefer organization_id, fall back to preschool_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, preschool_id, organization_id')
        .eq('id', userId)
        .maybeSingle();

      if (profileError || !profile) {
        throw new Error('Failed to fetch profile data');
      }

      const teacherId = userId;
      const preschoolId = profile.organization_id || profile.preschool_id;

      if (!preschoolId) {
        // Standalone teacher — no school-linked data to show
        setClasses([]);
        setMetrics({ totalStudents: 0, totalClasses: 0, pendingGrading: 0, upcomingLessons: 0 });
        return;
      }

      // Fetch classes assigned to this teacher
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, name, grade')
        .eq('teacher_id', teacherId)
        .eq('preschool_id', preschoolId);

      if (classesError) throw classesError;

      const classIds = (classesData || []).map((c: { id: string }) => c.id);

      // Single aggregate query for student counts per class (fixes N+1)
      const studentCountsByClass: Record<string, number> = {};
      if (classIds.length > 0) {
        const { data: studentRows } = await supabase
          .from('students')
          .select('class_id')
          .eq('preschool_id', preschoolId)
          .in('class_id', classIds);

        for (const row of studentRows || []) {
          if (row.class_id) {
            studentCountsByClass[row.class_id] = (studentCountsByClass[row.class_id] || 0) + 1;
          }
        }
      }

      // Fetch pending homework submissions (ungraded) for this teacher
      // homework_submissions has assignment_id, not class_id; class_id is on homework_assignments
      let pendingGradingCount = 0;
      if (classIds.length > 0) {
        const { data: assignmentIds } = await supabase
          .from('homework_assignments')
          .select('id')
          .eq('preschool_id', preschoolId)
          .in('class_id', classIds);
        const ids = (assignmentIds || []).map((a: { id: string }) => a.id);
        if (ids.length > 0) {
          const { count } = await supabase
            .from('homework_submissions')
            .select('*', { count: 'exact', head: true })
            .in('assignment_id', ids)
            .eq('status', 'submitted');
          pendingGradingCount = count || 0;
        }
      }

      // Fetch upcoming lessons count
      let upcomingLessonCount = 0;
      if (classIds.length > 0) {
        const { count } = await supabase
          .from('lesson_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('preschool_id', preschoolId)
          .in('class_id', classIds)
          .gte('due_date', new Date().toISOString())
          .eq('status', 'assigned');
        upcomingLessonCount = count || 0;
      }

      const classesWithMetrics: ClassData[] = (classesData || []).map((cls: { id: string; name: string; grade: string }) => ({
        id: cls.id,
        name: cls.name,
        grade: cls.grade,
        studentCount: studentCountsByClass[cls.id] || 0,
        pendingAssignments: 0,
        upcomingLessons: 0,
      }));

      setClasses(classesWithMetrics);

      const totalStudents = classesWithMetrics.reduce((sum, cls) => sum + cls.studentCount, 0);

      setMetrics({
        totalStudents,
        totalClasses: classesWithMetrics.length,
        pendingGrading: pendingGradingCount,
        upcomingLessons: upcomingLessonCount,
      });

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return {
    metrics,
    classes,
    loading,
    error,
    refetch: fetchDashboardData,
  };
}
