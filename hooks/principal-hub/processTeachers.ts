/**
 * Principal Hub — Teacher Processing
 *
 * Processes raw teacher rows into TeacherSummary[] with performance indicators.
 * Uses vw_teacher_overview for efficient batch stats when available.
 * Falls back to one batched classes/students lookup instead of one query per teacher.
 */

import { logger } from '@/lib/logger';
import { assertSupabase } from '@/lib/supabase';
import type { TeacherSummary } from './types';

type TFunc = (key: string, opts?: Record<string, any>) => string;
type OverviewStats = { class_count: number; student_count: number };
type ResolvedTeacherRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  subject_specialization: string | null;
  created_at: string | null;
  user_id: string | null;
  effectiveUserId: string | null;
};

export async function processTeachers(
  teachersData: any[],
  preschoolId: string,
  t: TFunc,
): Promise<TeacherSummary[]> {
  if (!teachersData.length) return [];

  const supabase = assertSupabase();

  // Preload per-teacher stats from materialised view (tenant-isolated by RLS)
  const overviewByEmail = new Map<string, OverviewStats>();
  try {
    const { data: rows } = await supabase
      .from('vw_teacher_overview')
      .select('email, class_count, student_count');
    (rows || []).forEach((row: any) => {
      if (row?.email) {
        overviewByEmail.set(String(row.email).toLowerCase(), {
          class_count: Number(row.class_count || 0),
          student_count: Number(row.student_count || 0),
        });
      }
    });
  } catch (e) {
    logger.warn('[PrincipalHub] vw_teacher_overview fetch failed, using batched fallback queries:', e);
  }

  const resolvedTeachers = await resolveTeachers(teachersData, preschoolId);
  const teacherFallbackStats = await loadTeacherFallbackStats(
    resolvedTeachers,
    preschoolId,
    overviewByEmail,
  );

  return resolvedTeachers.map((teacher) => {
    const emailKey = String(teacher.email || '').toLowerCase();
    const viewStats = overviewByEmail.get(emailKey);
    const fallbackStats = teacherFallbackStats.get(teacher.id) || {
      classIds: [],
      classCount: 0,
      studentCount: 0,
      attendanceRate: 0,
    };

    const teacherClassesCount = viewStats?.class_count || fallbackStats.classCount;
    const studentsInClasses = viewStats?.student_count || fallbackStats.studentCount;
    const teacherAttendanceRate = fallbackStats.attendanceRate;

    const { status, performanceIndicator } = evaluatePerformance(
      teacherClassesCount,
      studentsInClasses,
      teacherAttendanceRate,
      t,
    );

    return {
      id: teacher.id,
      email: teacher.email || '',
      first_name: teacher.first_name || 'Unknown',
      last_name: teacher.last_name || 'Teacher',
      full_name: `${teacher.first_name || 'Unknown'} ${teacher.last_name || 'Teacher'}`.trim(),
      phone: teacher.phone || undefined,
      subject_specialization: teacher.subject_specialization || 'General',
      hire_date: teacher.created_at || undefined,
      classes_assigned: teacherClassesCount,
      students_count: studentsInClasses,
      status,
      performance_indicator: performanceIndicator,
    } satisfies TeacherSummary;
  });
}

// ────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────

function evaluatePerformance(
  classesCount: number,
  studentsCount: number,
  attendanceRate: number,
  t: TFunc,
): { status: TeacherSummary['status']; performanceIndicator: string } {
  const ratio = studentsCount > 0 ? studentsCount / Math.max(classesCount, 1) : 0;

  if (classesCount === 0) {
    return { status: 'needs_attention', performanceIndicator: t('teacher.performance.no_classes', { defaultValue: 'No classes assigned - requires attention' }) };
  }
  if (ratio > 25) {
    return { status: 'needs_attention', performanceIndicator: t('teacher.performance.high_ratio', { ratio: Math.round(ratio), defaultValue: 'High student ratio ({{ratio}}:1) - may need support' }) };
  }
  if (classesCount >= 3 && ratio <= 20 && attendanceRate >= 85) {
    return { status: 'excellent', performanceIndicator: t('teacher.performance.excellent', { classes: classesCount, ratio: Math.round(ratio), attendance: attendanceRate, defaultValue: 'Excellent performance - {{classes}} classes, {{ratio}}:1 ratio, {{attendance}}% attendance' }) };
  }
  if (classesCount >= 2 && ratio <= 22 && attendanceRate >= 80) {
    return { status: 'excellent', performanceIndicator: t('teacher.performance.strong', { classes: classesCount, defaultValue: 'Strong performance - {{classes}} classes, good attendance rates' }) };
  }
  if (ratio <= 25 && attendanceRate >= 75) {
    return { status: 'good', performanceIndicator: t('teacher.performance.good', { students: studentsCount, defaultValue: 'Good performance - managing {{students}} students effectively' }) };
  }
  return { status: 'needs_attention', performanceIndicator: t('teacher.performance.review_needed', { attendance: attendanceRate, defaultValue: 'Performance review needed - {{attendance}}% attendance rate in classes' }) };
}

async function resolveTeachers(
  teachersData: any[],
  preschoolId: string,
): Promise<ResolvedTeacherRow[]> {
  const supabase = assertSupabase();
  const teachersMissingUserId = teachersData.filter((teacher) => !teacher.user_id && teacher.email);
  const emailToProfileId = new Map<string, string>();

  if (teachersMissingUserId.length > 0) {
    const teacherEmails = Array.from(
      new Set(
        teachersMissingUserId
          .map((teacher) => String(teacher.email || '').trim().toLowerCase())
          .filter((email) => email.length > 0),
      ),
    );

    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('email', teacherEmails)
        .or(`preschool_id.eq.${preschoolId},organization_id.eq.${preschoolId}`);
      (profiles || []).forEach((profile: any) => {
        if (profile?.email && profile?.id) {
          emailToProfileId.set(String(profile.email).toLowerCase(), profile.id);
        }
      });
    } catch (error) {
      logger.warn('[PrincipalHub] teacher profile fallback lookup failed', error);
    }
  }

  return teachersData.map((teacher): ResolvedTeacherRow => {
    const email = teacher.email ? String(teacher.email).trim() : null;
    const emailKey = String(email || '').toLowerCase();
    return {
      id: String(teacher.id),
      email,
      first_name: teacher.first_name || null,
      last_name: teacher.last_name || null,
      phone: teacher.phone || null,
      subject_specialization: teacher.subject_specialization || null,
      created_at: teacher.created_at || null,
      user_id: teacher.user_id || null,
      effectiveUserId: teacher.user_id || emailToProfileId.get(emailKey) || null,
    };
  });
}

async function loadTeacherFallbackStats(
  teachers: ResolvedTeacherRow[],
  preschoolId: string,
  overviewByEmail: Map<string, OverviewStats>,
): Promise<Map<string, { classIds: string[]; classCount: number; studentCount: number; attendanceRate: number }>> {
  const statsByTeacherId = new Map<string, { classIds: string[]; classCount: number; studentCount: number; attendanceRate: number }>();
  const teachersNeedingFallback = teachers.filter((teacher) => {
    const emailKey = String(teacher.email || '').toLowerCase();
    return !overviewByEmail.has(emailKey);
  });

  if (teachersNeedingFallback.length === 0) {
    return statsByTeacherId;
  }

  const supabase = assertSupabase();
  let classRows: Array<{ id: string; teacher_id: string | null }> = [];

  try {
    const { data, error } = await supabase
      .from('classes')
      .select('id, teacher_id')
      .eq('preschool_id', preschoolId)
      .or('active.eq.true,active.is.null');
    if (error) throw error;
    classRows = (data || []).map((row: any) => ({
      id: String(row.id),
      teacher_id: row.teacher_id ? String(row.teacher_id) : null,
    }));
  } catch (error) {
    logger.warn('[PrincipalHub] classes fallback lookup failed; defaulting teacher stats to zero', error);
    return statsByTeacherId;
  }

  const classIdsByTeacherId = new Map<string, string[]>();
  classRows.forEach((row) => {
    if (!row.teacher_id) return;
    const ids = classIdsByTeacherId.get(row.teacher_id) || [];
    ids.push(row.id);
    classIdsByTeacherId.set(row.teacher_id, ids);
  });

  const unassignedClassIds = classRows.filter((row) => !row.teacher_id).map((row) => row.id);
  const soleTeacherId =
    teachersNeedingFallback.length === 1 ? teachersNeedingFallback[0].effectiveUserId || teachersNeedingFallback[0].id : null;

  const allClassIds = Array.from(
    new Set(
      teachersNeedingFallback.flatMap((teacher) => {
        const directIds = teacher.effectiveUserId ? classIdsByTeacherId.get(teacher.effectiveUserId) || [] : [];
        if (directIds.length > 0) return directIds;
        if (soleTeacherId && (teacher.effectiveUserId || teacher.id) === soleTeacherId) return unassignedClassIds;
        return [];
      }),
    ),
  );

  const studentIdsByClassId = new Map<string, string[]>();
  if (allClassIds.length > 0) {
    try {
      const { data: studentRows, error } = await supabase
        .from('students')
        .select('id, class_id')
        .in('class_id', allClassIds)
        .eq('status', 'active')
        .eq('is_active', true);
      if (error) throw error;

      (studentRows || []).forEach((row: any) => {
        if (!row?.class_id || !row?.id) return;
        const classId = String(row.class_id);
        const studentIds = studentIdsByClassId.get(classId) || [];
        studentIds.push(String(row.id));
        studentIdsByClassId.set(classId, studentIds);
      });
    } catch (error) {
      logger.warn('[PrincipalHub] students fallback lookup failed; attendance metrics will be empty', error);
    }
  }

  const attendanceTotalsByStudentId = new Map<string, { present: number; total: number }>();
  const allStudentIds = Array.from(
    new Set(Array.from(studentIdsByClassId.values()).flat()),
  );

  if (allStudentIds.length > 0) {
    try {
      const { data: attendanceRows, error } = await supabase
        .from('attendance')
        .select('status, student_id')
        .in('student_id', allStudentIds)
        .gte('attendance_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      if (error) throw error;

      (attendanceRows || []).forEach((row: any) => {
        if (!row?.student_id) return;
        const studentId = String(row.student_id);
        const current = attendanceTotalsByStudentId.get(studentId) || { present: 0, total: 0 };
        current.total += 1;
        if (row.status === 'present') current.present += 1;
        attendanceTotalsByStudentId.set(studentId, current);
      });
    } catch (error) {
      logger.warn('[PrincipalHub] attendance fallback lookup failed; attendance rates will be zero', error);
    }
  }

  teachersNeedingFallback.forEach((teacher) => {
    let classIds = teacher.effectiveUserId ? classIdsByTeacherId.get(teacher.effectiveUserId) || [] : [];
    if (classIds.length === 0 && soleTeacherId && (teacher.effectiveUserId || teacher.id) === soleTeacherId) {
      classIds = unassignedClassIds;
    }

    const studentIds = classIds.flatMap((classId) => studentIdsByClassId.get(classId) || []);
    const attendanceTotals = studentIds.reduce(
      (acc, studentId) => {
        const totals = attendanceTotalsByStudentId.get(studentId);
        if (!totals) return acc;
        acc.present += totals.present;
        acc.total += totals.total;
        return acc;
      },
      { present: 0, total: 0 },
    );

    statsByTeacherId.set(teacher.id, {
      classIds,
      classCount: classIds.length,
      studentCount: studentIds.length,
      attendanceRate: attendanceTotals.total > 0
        ? Math.round((attendanceTotals.present / attendanceTotals.total) * 100)
        : 0,
    });
  });

  return statsByTeacherId;
}
