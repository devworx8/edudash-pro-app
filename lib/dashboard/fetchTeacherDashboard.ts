/**
 * Teacher Dashboard Data Fetcher
 *
 * Pure async function that fetches all teacher dashboard data from Supabase.
 * Extracted from the hook to be independently testable and reusable by
 * React Query's queryFn.
 *
 * @module lib/dashboard/fetchTeacherDashboard
 * @see WARP.md § "Use React Query for all async data operations"
 */

import { assertSupabase } from '@/lib/supabase';
import { log, logError } from '@/lib/debug';
import type { TeacherDashboardData } from '@/types/dashboard';
import {
  formatDueDate,
  getNextLessonTime,
  formatEventTime,
  createEmptyTeacherData,
} from '@/lib/dashboard/utils';
import { fetchTodayRoutine } from '@/lib/dashboard/fetchTeacherTodayRoutine';
import { dedupeRequest, createRequestKey } from '@/lib/dashboard/requestDeduplication';

interface ResolvedTeacherProfile {
  id: string;
  auth_user_id: string;
  preschool_id: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
}

/**
 * Resolve the teacher profile from Supabase `profiles` table.
 * Handles the auth_user_id ↔ profiles.id duality.
 */
async function resolveTeacherProfile(
  userId: string
): Promise<ResolvedTeacherProfile | null> {
  const supabase = assertSupabase();

  const { data: teacherProfile, error: teacherError } = await supabase
    .from('profiles')
    .select('id, preschool_id, organization_id, first_name, last_name, role')
    .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();

  if (teacherError) {
    logError('Teacher profile fetch error:', teacherError);
  }

  let resolved: ResolvedTeacherProfile | null = teacherProfile
    ? {
        id: teacherProfile.id,
        auth_user_id: userId,
        preschool_id:
          teacherProfile.preschool_id || teacherProfile.organization_id || null,
        first_name: teacherProfile.first_name,
        last_name: teacherProfile.last_name,
        role: teacherProfile.role,
      }
    : null;

  // Fallback: re-query if preschool_id missing or role doesn't include 'teacher'
  if (
    !resolved ||
    !resolved.preschool_id ||
    !String(resolved.role || '').toLowerCase().includes('teacher')
  ) {
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('id, preschool_id, role, first_name, last_name, organization_id')
      .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();

    if (!profErr && prof) {
      const roleStr = String(prof.role || '').toLowerCase();
      if (!resolved || roleStr.includes('teacher')) {
        resolved = {
          id: teacherProfile?.id || userId,
          auth_user_id: userId,
          preschool_id:
            prof.preschool_id ||
            prof.organization_id ||
            teacherProfile?.preschool_id ||
            teacherProfile?.organization_id ||
            null,
          first_name: prof.first_name || teacherProfile?.first_name || null,
          last_name: prof.last_name || teacherProfile?.last_name || null,
          role: prof.role || teacherProfile?.role || 'teacher',
        };
      }
    }
  }

  return resolved;
}

/**
 * Fetch school name + subscription tier.
 */
async function fetchSchoolInfo(schoolId: string): Promise<{
  schoolName: string;
  schoolTier: TeacherDashboardData['schoolTier'];
}> {
  const supabase = assertSupabase();
  let schoolName = 'Unknown School';
  let schoolTier: TeacherDashboardData['schoolTier'] = 'free';

  // Try preschools table first
  const { data: school } = await supabase
    .from('preschools')
    .select('id, name')
    .eq('id', schoolId)
    .maybeSingle();

  if (school) {
    schoolName = school.name || schoolName;

    // PRIORITY 1: active subscription tier
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id, plan_id, status, subscription_plans!inner(tier)')
      .eq('school_id', schoolId)
      .in('status', ['active', 'trialing'])
      .maybeSingle();

    const plan = Array.isArray(subscription?.subscription_plans)
      ? subscription?.subscription_plans[0]
      : subscription?.subscription_plans;

    if (plan?.tier) {
      schoolTier = plan.tier as TeacherDashboardData['schoolTier'];
    } else {
      // PRIORITY 2: preschool.subscription_tier column
      const { data: preschoolData } = await supabase
        .from('preschools')
        .select('subscription_tier')
        .eq('id', schoolId)
        .maybeSingle();
      if (preschoolData?.subscription_tier) {
        schoolTier = preschoolData.subscription_tier as TeacherDashboardData['schoolTier'];
      }
    }
  } else {
    // Fallback: organizations table
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, plan_tier')
      .eq('id', schoolId)
      .maybeSingle();
    schoolName = org?.name || schoolName;
    schoolTier = (org?.plan_tier as TeacherDashboardData['schoolTier']) || 'free';
  }

  return { schoolName, schoolTier };
}

/**
 * Fetch classes with student counts and today's attendance.
 */
async function fetchClassesWithAttendance(
  teacherId: string,
  schoolId: string | null
) {
  const supabase = assertSupabase();
  const today = new Date().toISOString().split('T')[0];

  let classesQuery = supabase
    .from('classes')
    .select(`
      id, name, grade_level, room_number, preschool_id,
      students(id, first_name, last_name, is_active)
    `)
    .eq('teacher_id', teacherId)
    .eq('active', true);

  if (schoolId) {
    classesQuery = classesQuery.eq('preschool_id', schoolId);
  }

  const { data: classesData, error: classesError } = await classesQuery;
  if (classesError) logError('Classes fetch error:', classesError);

  // Deduplicate active student IDs across all classes
  const seenGlobal = new Set<string>();
  const allStudentIds =
    classesData?.flatMap((cls) =>
      ((cls.students as Array<{ id: string; is_active?: boolean }>) || [])
        .filter((s) => s.is_active !== false)
        .filter((s) => {
          if (seenGlobal.has(s.id)) return false;
          seenGlobal.add(s.id);
          return true;
        })
        .map((s) => s.id)
    ) || [];

  // Batch-fetch today's attendance
  let todayAttendance: Array<{ student_id: string; status: string }> = [];
  if (allStudentIds.length > 0) {
    const { data } = await supabase
      .from('attendance')
      .select('student_id, status')
      .in('student_id', allStudentIds)
      .eq('attendance_date', today);
    todayAttendance = data || [];
  }

  const myClasses = (classesData || []).map((cls: Record<string, unknown>) => {
    const seen = new Set<string>();
    const students = (
      (cls.students as Array<{ id: string; is_active?: boolean }>) || []
    )
      .filter((s) => s.is_active !== false)
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });

    const ids = students.map((s) => s.id);
    const classAttendance = todayAttendance.filter((a) =>
      ids.includes(a.student_id)
    );
    const presentCount = classAttendance.filter(
      (a) => a.status === 'present'
    ).length;

    return {
      id: cls.id as string,
      name: cls.name as string,
      studentCount: students.length,
      __studentIds: ids,
      grade: (cls.grade_level as string) || 'Grade R',
      room: (cls.room_number as string) || 'TBD',
      nextLesson: getNextLessonTime(),
      attendanceRate:
        students.length > 0
          ? Math.round((presentCount / students.length) * 100)
          : 0,
      presentToday: presentCount,
    };
  });

  return myClasses;
}

/**
 * Fetch recent homework assignments with submission stats.
 */
async function fetchAssignments(teacherId: string) {
  const supabase = assertSupabase();

  const { data: assignmentsData } = await supabase
    .from('homework_assignments')
    .select(`
      id, title, due_date, is_published,
      homework_submissions!homework_submissions_assignment_id_fkey(id, status)
    `)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(3);

  return (assignmentsData || []).map((assignment: Record<string, unknown>) => {
    const submissions =
      (assignment.homework_submissions as Array<{ status: string }>) || [];
    const submittedCount = submissions.filter(
      (s) => s.status === 'submitted'
    ).length;

    const status = (() => {
      const now = new Date();
      const due = new Date(assignment.due_date as string);
      if (
        submissions.length > 0 &&
        submissions.every((s) => s.status === 'graded')
      )
        return 'graded' as const;
      if (due < now) return 'overdue' as const;
      return 'pending' as const;
    })();

    return {
      id: assignment.id as string,
      title: assignment.title as string,
      dueDate: formatDueDate(assignment.due_date as string),
      submitted: submittedCount,
      total: submissions.length,
      status,
    };
  });
}

/**
 * Fetch upcoming school events.
 */
async function fetchEvents(schoolId: string) {
  const supabase = assertSupabase();

  const { data: eventsData } = await supabase
    .from('events')
    .select('id, title, event_date, event_type, description')
    .eq('preschool_id', schoolId)
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(5);

  return (eventsData || []).map((event: Record<string, unknown>) => ({
    id: event.id as string,
    title: event.title as string,
    time: formatEventTime(new Date(event.event_date as string)),
    type: ((event.event_type as string) || 'event') as
      | 'meeting'
      | 'activity'
      | 'assessment',
  }));
}

/**
 * Orchestrator — fetches all teacher dashboard data.
 *
 * Resolves teacher profile first, then parallelizes independent queries.
 * Returns fully-composed `TeacherDashboardData`.
 * Uses request deduplication to prevent redundant concurrent fetches.
 *
 * @throws Error if user is not authenticated or profile resolution fails
 */
export async function fetchTeacherDashboardData(
  userId: string
): Promise<TeacherDashboardData> {
  // Use request deduplication to prevent concurrent duplicate fetches
  return dedupeRequest<TeacherDashboardData>(
    createRequestKey('teacher-dashboard', userId),
    async () => {
      return await fetchTeacherDashboardDataInternal(userId);
    }
  );
}

/**
 * Internal implementation of teacher dashboard data fetching.
 * Separated for deduplication wrapper.
 */
async function fetchTeacherDashboardDataInternal(
  userId: string
): Promise<TeacherDashboardData> {
  const supabase = assertSupabase();

  // Soft auth check (2.5s timeout, non-blocking)
  const authCheck = await Promise.race([
    supabase.auth.getUser(),
    new Promise<{ data: { user: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null } }), 2500)
    ),
  ]);
  if (!authCheck?.data?.user) {
    log('[fetchTeacherDashboard] auth.getUser timed out, continuing with userId');
  }

  // Step 1: resolve teacher profile (sequential — everything depends on this)
  const profile = await resolveTeacherProfile(userId);

  if (!profile) {
    log('[fetchTeacherDashboard] No teacher profile found, returning empty');
    return createEmptyTeacherData();
  }

  const schoolId = profile.preschool_id;
  log('👨‍🏫 Resolved teacher:', {
    id: profile.id,
    schoolId,
    role: profile.role,
  });

  // Step 2: parallel fetch (school info, classes, assignments, events)
  const [schoolInfo, myClasses, recentAssignments, upcomingEvents] =
    await Promise.all([
      schoolId
        ? fetchSchoolInfo(schoolId)
        : Promise.resolve({
            schoolName: 'Unknown School',
            schoolTier: 'free' as const,
          }),
      fetchClassesWithAttendance(userId, schoolId),
      fetchAssignments(userId),
      schoolId ? fetchEvents(schoolId) : Promise.resolve([]),
    ]);

  const routineBundle = schoolId
    ? await fetchTodayRoutine(
        schoolId,
        myClasses.map((cls: any) => String(cls.id))
      )
    : {
        todayRoutine: null,
        schoolWideRoutine: null,
        classRoutines: [],
      };

  const uniqueStudentIds = new Set<string>();
  myClasses.forEach((cls: any) => {
    const ids = Array.isArray(cls?.__studentIds) ? cls.__studentIds : [];
    ids.forEach((id: string) => uniqueStudentIds.add(id));
  });
  const totalStudents = uniqueStudentIds.size > 0
    ? uniqueStudentIds.size
    : myClasses.reduce((sum, cls) => sum + cls.studentCount, 0);

  const normalizedClasses = myClasses.map((cls: any) => {
    const { __studentIds: _studentIds, ...rest } = cls || {};
    return rest;
  });
  const pendingGrading = recentAssignments
    .filter((a) => a.status === 'pending')
    .reduce((sum, a) => sum + a.submitted, 0);

  return {
    schoolName: schoolInfo.schoolName,
    schoolTier: schoolInfo.schoolTier,
    totalStudents,
    totalClasses: normalizedClasses.length,
    upcomingLessons: Math.min(normalizedClasses.length, 3),
    pendingGrading,
    myClasses: normalizedClasses,
    recentAssignments,
    upcomingEvents,
    todayRoutine: routineBundle.todayRoutine,
    schoolWideRoutine: routineBundle.schoolWideRoutine,
    classRoutines: routineBundle.classRoutines,
  };
}
