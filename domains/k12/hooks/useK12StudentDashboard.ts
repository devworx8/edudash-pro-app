/**
 * K-12 Student Dashboard Data Hook
 *
 * Fetches assignments, grades, class schedule, attendance, and notifications
 * for the K-12 student dashboard. Uses the student's enrolled classes and
 * direct assignment tables.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface StudentMetrics {
  avgGrade: string;
  attendance: number;
  pendingTasks: number;
  completedToday: number;
}

export interface UpcomingAssignment {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  status: string;
}

export interface TodaysClass {
  id: string;
  name: string;
  time: string;
  room: string;
  teacher: string;
  current: boolean;
}

const DEFAULT_METRICS: StudentMetrics = {
  avgGrade: '--',
  attendance: 0,
  pendingTasks: 0,
  completedToday: 0,
};

export function useK12StudentDashboard(userId: string | undefined, orgId: string | undefined) {
  const [metrics, setMetrics] = useState<StudentMetrics>(DEFAULT_METRICS);
  const [upcomingAssignments, setUpcomingAssignments] = useState<UpcomingAssignment[]>([]);
  const [todaysClasses, setTodaysClasses] = useState<TodaysClass[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchDashboardData = useCallback(async () => {
    if (!userId) return;
    try {
      const supabase = assertSupabase();
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const startOfDay = `${todayStr}T00:00:00.000Z`;

      // Parallel queries for dashboard data
      const [assignmentsRes, submittedTodayRes, gradesRes, attendanceRes, classesRes, notifRes] =
        await Promise.all([
          // Upcoming assignments (due in future, not yet fully submitted)
          supabase
            .from('homework_assignments')
            .select('id, title, subject, due_date, status, class_id')
            .gte('due_date', todayStr)
            .in('status', ['active', 'published', 'assigned'])
            .order('due_date', { ascending: true })
            .limit(10),

          // Submissions completed today
          supabase
            .from('homework_submissions')
            .select('id')
            .eq('student_id', userId)
            .gte('submitted_at', startOfDay),

          // Recent graded submissions for average
          supabase
            .from('homework_submissions')
            .select('grade')
            .eq('student_id', userId)
            .not('grade', 'is', null)
            .order('submitted_at', { ascending: false })
            .limit(20),

          // Attendance this month
          supabase
            .from('attendance')
            .select('status')
            .eq('student_id', userId)
            .gte('attendance_date', `${todayStr.slice(0, 7)}-01`),

          // Enrolled classes via student_enrollments
          supabase
            .from('student_enrollments')
            .select('class_id, classes(id, name, schedule, room, teacher_id, profiles:teacher_id(full_name))')
            .eq('student_id', userId),

          // Unread notifications
          supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false),
        ]);

      if (!mountedRef.current) return;

      // --- Assignments ---
      const assignments = (assignmentsRes.data ?? []) as Array<{
        id: string;
        title: string;
        subject: string;
        due_date: string | null;
        status: string;
        class_id: string | null;
      }>;

      // Filter to student's enrolled classes if org-scoped
      const enrolledClassIds = new Set(
        ((classesRes.data ?? []) as Array<{ class_id: string }>).map(e => e.class_id),
      );
      const filtered = enrolledClassIds.size > 0
        ? assignments.filter(a => a.class_id && enrolledClassIds.has(a.class_id))
        : assignments;

      // Check which assignments the student already submitted
      const submittedAssignmentIds = new Set<string>();
      if (filtered.length > 0) {
        const { data: subs } = await supabase
          .from('homework_submissions')
          .select('assignment_id')
          .eq('student_id', userId)
          .in('assignment_id', filtered.map(a => a.id));
        for (const s of subs ?? []) {
          if (s.assignment_id) submittedAssignmentIds.add(s.assignment_id);
        }
      }
      if (!mountedRef.current) return;

      const pending = filtered.filter(a => !submittedAssignmentIds.has(a.id));
      const mapped: UpcomingAssignment[] = pending.slice(0, 5).map(a => ({
        id: a.id,
        title: a.title,
        subject: a.subject || 'General',
        dueDate: a.due_date ?? '',
        status: a.status,
      }));
      setUpcomingAssignments(mapped);

      // --- Metrics ---
      const completedToday = submittedTodayRes.data?.length ?? 0;

      const gradeValues = ((gradesRes.data ?? []) as Array<{ grade: number | null }>)
        .map(g => g.grade)
        .filter((g): g is number => g != null);
      const avgGrade = gradeValues.length > 0
        ? `${Math.round(gradeValues.reduce((s, v) => s + v, 0) / gradeValues.length)}%`
        : '--';

      const attendanceRecords = (attendanceRes.data ?? []) as Array<{ status: string }>;
      const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
      const attendancePct = attendanceRecords.length > 0
        ? Math.round((presentCount / attendanceRecords.length) * 100)
        : 0;

      setMetrics({
        avgGrade,
        attendance: attendancePct,
        pendingTasks: pending.length,
        completedToday,
      });

      // --- Classes ---
      type EnrollmentRow = {
        class_id: string;
        classes: {
          id: string;
          name: string;
          schedule: string | null;
          room: string | null;
          teacher_id: string | null;
          profiles: { full_name: string | null } | null;
        } | null;
      };
      const enrollments = (classesRes.data ?? []) as unknown as EnrollmentRow[];
      const hour = now.getHours();
      const classList: TodaysClass[] = enrollments
        .filter(e => e.classes)
        .map((e, idx) => {
          const c = e.classes!;
          const teacherName = c.profiles?.full_name ?? '';
          // Parse simple schedule string (e.g., "09:00-10:00" or free-text)
          const time = c.schedule ?? '';
          const isCurrent = inferCurrent(time, hour);
          return {
            id: c.id,
            name: c.name,
            time,
            room: c.room ?? '',
            teacher: teacherName,
            current: isCurrent,
          };
        });
      setTodaysClasses(classList);

      // --- Notifications ---
      setUnreadNotifications(notifRes.count ?? 0);

      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard';
      logger.error('[useK12StudentDashboard]', msg);
      setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId, orgId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    fetchDashboardData();
    return () => { mountedRef.current = false; };
  }, [fetchDashboardData]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchDashboardData();
  }, [fetchDashboardData]);

  return { metrics, upcomingAssignments, todaysClasses, unreadNotifications, loading, error, refresh };
}

/** Heuristic: if schedule looks like "HH:MM" and current hour is within range, mark as current */
function inferCurrent(schedule: string, currentHour: number): boolean {
  const match = schedule.match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return false;
  const startHour = parseInt(match[1], 10);
  return currentHour >= startHour && currentHour < startHour + 1;
}
