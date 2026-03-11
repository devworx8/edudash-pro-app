/**
 * fetchTeachers — Loads all active teachers for a school.
 *
 * Queries the `teachers` table, enriches with profile names,
 * per-teacher overview stats (`vw_teacher_overview`), and inline
 * document metadata. Deduplicates by email/userId.
 */

import { assertSupabase } from '@/lib/supabase';
import { normalizePersonName } from '@/lib/utils/nameUtils';
import type { TeacherDocument } from '@/lib/services/TeacherDocumentsService';
import type { Teacher } from '@/types/teacher-management';
import { parseClasses } from './types';

const normalizeSchoolRole = (role: string | null | undefined): Teacher['schoolRole'] => {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'principal_admin') return 'principal_admin';
  return 'teacher';
};

export async function fetchTeachersForSchool(preschoolId: string): Promise<Teacher[]> {
  const supabase = assertSupabase();

  // 1. Core teacher rows
  const { data: teachersData, error: teachersError } = await supabase
    .from('teachers')
    .select(`
      id, user_id, auth_user_id, email, phone, full_name, preschool_id, is_active, created_at,
      employee_id, contract_type, employment_status, hire_date, contract_end_date,
      position_title, department, date_of_birth, gender, id_number, address,
      salary_basic, salary_allowances, salary_deductions, pay_scale,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      notes,
      cv_file_path, cv_file_name, cv_mime_type, cv_file_size, cv_uploaded_at, cv_uploaded_by,
      qualifications_file_path, qualifications_file_name, qualifications_mime_type, qualifications_file_size, qualifications_uploaded_at, qualifications_uploaded_by,
      id_copy_file_path, id_copy_file_name, id_copy_mime_type, id_copy_file_size, id_copy_uploaded_at, id_copy_uploaded_by,
      contracts_file_path, contracts_file_name, contracts_mime_type, contracts_file_size, contracts_uploaded_at, contracts_uploaded_by
    `)
    .eq('preschool_id', preschoolId)
    .eq('is_active', true);

  if (teachersError) throw teachersError;

  // 2. Profile names + school role
  const teacherRefs = Array.from(
    new Set(
      (teachersData || [])
        .flatMap((t: Record<string, unknown>) => [t.user_id, t.auth_user_id])
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  type ProfileRow = {
    id: string;
    auth_user_id: string | null;
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
  };
  const profileById = new Map<string, ProfileRow>();
  const profileByAuthUserId = new Map<string, ProfileRow>();

  if (teacherRefs.length > 0) {
    const [profilesByIdResult, profilesByAuthResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, auth_user_id, first_name, last_name, role')
        .in('id', teacherRefs),
      supabase
        .from('profiles')
        .select('id, auth_user_id, first_name, last_name, role')
        .in('auth_user_id', teacherRefs),
    ]);

    const combinedProfiles = [
      ...((profilesByIdResult.data || []) as ProfileRow[]),
      ...((profilesByAuthResult.data || []) as ProfileRow[]),
    ];

    for (const profile of combinedProfiles) {
      if (!profile?.id) continue;
      profileById.set(profile.id, profile);
      if (profile.auth_user_id) profileByAuthUserId.set(profile.auth_user_id, profile);
    }
  }

  const resolveProfile = (idOrAuthId: string | null | undefined): ProfileRow | null => {
    if (!idOrAuthId) return null;
    return profileById.get(idOrAuthId) || profileByAuthUserId.get(idOrAuthId) || null;
  };

  // 3. Overview stats (class count / student count)
  const { data: overviewRows } = await supabase
    .from('vw_teacher_overview')
    .select('email, class_count, student_count, classes_text');

  const overviewByEmail = new Map<string, { class_count: number; student_count: number; classes_text: string }>();
  (overviewRows || []).forEach((row: Record<string, unknown>) => {
    if (row?.email) {
      overviewByEmail.set(String(row.email).toLowerCase(), {
        class_count: Number(row.class_count || 0),
        student_count: Number(row.student_count || 0),
        classes_text: String(row.classes_text || ''),
      });
    }
  });

  // 4. Transform
  const transformed = (teachersData || []).map((db: Record<string, unknown>) => {
    const teacherUserId = db.user_id as string;
    const profileData = resolveProfile(teacherUserId) || resolveProfile(db.auth_user_id as string | null);

    const { firstName, lastName, fullName } = resolveName(db, profileData);
    const documents = buildDocuments(db, preschoolId);
    const authUserId = (db.auth_user_id as string) || null;
    const resolvedUserId = teacherUserId || authUserId || '';
    const emailKey = String(db.email || '').toLowerCase();
    const overview = overviewByEmail.get(emailKey);

    return {
      id: db.id as string,
      teacherUserId: resolvedUserId,
      authUserId,
      profileId: profileData?.id || null,
      schoolRole: normalizeSchoolRole(profileData?.role),
      employeeId: (db.employee_id as string) || `EMP${(db.id as string).slice(0, 3)}`,
      firstName,
      lastName,
      email: (db.email as string) || 'No email',
      phone: (db.phone as string) || 'No phone',
      address: (db.address as string) || '',
      idNumber: (db.id_number as string) || '',
      dateOfBirth: (db.date_of_birth as string) || '',
      gender: (db.gender as string) || '',
      status: ((db.employment_status as string) || (resolvedUserId ? 'active' : 'pending')) as Teacher['status'],
      contractType: ((db.contract_type as string) || 'permanent') as Teacher['contractType'],
      positionTitle: (db.position_title as string) || '',
      department: (db.department as string) || '',
      classes: parseClasses(overview?.classes_text),
      subjects: ['General Education'],
      qualifications: ['Teaching Qualification'],
      studentCount: overview?.student_count || 0,
      hireDate: (db.hire_date as string) || (db.created_at as string)?.split('T')[0] || '',
      contractEndDate: (db.contract_end_date as string) || undefined,
      notes: (db.notes as string) || '',
      emergencyContact: {
        name: (db.emergency_contact_name as string) || '',
        phone: (db.emergency_contact_phone as string) || '',
        relationship: (db.emergency_contact_relationship as string) || '',
      },
      salary: {
        basic: (db.salary_basic as number) || 0,
        allowances: (db.salary_allowances as number) || 0,
        deductions: (db.salary_deductions as number) || 0,
        net: ((db.salary_basic as number) || 0) + ((db.salary_allowances as number) || 0) - ((db.salary_deductions as number) || 0),
        payScale: (db.pay_scale as string) || '',
      },
      performance: { rating: 0, lastReviewDate: '', strengths: [], improvementAreas: [], goals: [] },
      documents,
      attendance: { daysPresent: 0, daysAbsent: 0, lateArrivals: 0, leaveBalance: 0 },
      workload: { teachingHours: 0, adminDuties: [], extraCurricular: [] },
    } as Teacher;
  });

  return dedupeTeachers(transformed);
}

// ---------- internal helpers ----------

function resolveName(
  db: Record<string, unknown>,
  profileData: { first_name?: string | null; last_name?: string | null } | null | undefined,
): { firstName: string; lastName: string; fullName: string } {
  // Priority 1: profile table
  if (profileData && (profileData.first_name || profileData.last_name)) {
    const n = normalizePersonName({ first: profileData.first_name, last: profileData.last_name });
    return { firstName: n.firstName, lastName: n.lastName, fullName: n.fullName };
  }
  // Priority 2: teachers.full_name
  const rawFull = ((db.full_name as string) || '').trim();
  if (rawFull) {
    const n = normalizePersonName({ full: rawFull });
    return { firstName: n.firstName, lastName: n.lastName, fullName: n.fullName };
  }
  // Priority 3: email username
  const emailName = (db.email as string)?.split('@')[0] || 'Unknown';
  const n = normalizePersonName({ full: emailName });
  return { firstName: n.firstName || emailName, lastName: n.lastName || '', fullName: n.fullName || emailName };
}

function buildDocuments(db: Record<string, unknown>, preschoolId: string): Record<string, TeacherDocument> {
  const docs: Record<string, TeacherDocument> = {};
  const types = ['cv', 'qualifications', 'id_copy', 'contracts'] as const;

  for (const dt of types) {
    const pathKey = `${dt}_file_path`;
    if (db[pathKey]) {
      docs[dt] = {
        id: `${dt}_${db.id}`,
        teacher_user_id: db.id as string,
        preschool_id: (db.preschool_id as string) || preschoolId,
        doc_type: dt,
        file_path: db[pathKey] as string,
        file_name: (db[`${dt}_file_name`] as string) || dt.replace('_', ' '),
        mime_type: (db[`${dt}_mime_type`] as string) || 'application/pdf',
        file_size: (db[`${dt}_file_size`] as number) || 0,
        uploaded_by: (db[`${dt}_uploaded_by`] as string) || '',
        created_at: (db[`${dt}_uploaded_at`] as string) || (db.created_at as string),
        updated_at: (db.updated_at as string) || (db.created_at as string),
      };
    }
  }
  return docs;
}

function dedupeTeachers(list: Teacher[]): Teacher[] {
  const key = (t: Teacher) => t.email?.toLowerCase() || t.teacherUserId || t.authUserId || t.id;
  const map = new Map<string, Teacher>();

  for (const teacher of list) {
    const k = key(teacher);
    const existing = map.get(k);
    if (!existing) { map.set(k, teacher); continue; }
    map.set(k, {
      ...existing,
      teacherUserId: existing.teacherUserId || teacher.teacherUserId,
      authUserId: existing.authUserId || teacher.authUserId,
      profileId: existing.profileId || teacher.profileId,
      schoolRole:
        existing.schoolRole === 'principal_admin' || teacher.schoolRole === 'principal_admin'
          ? 'principal_admin'
          : existing.schoolRole === 'admin' || teacher.schoolRole === 'admin'
            ? 'admin'
            : existing.schoolRole || teacher.schoolRole || 'teacher',
      firstName: existing.firstName || teacher.firstName,
      lastName: existing.lastName || teacher.lastName,
      email: existing.email || teacher.email,
      phone: existing.phone || teacher.phone,
      classes: Array.from(new Set([...(existing.classes || []), ...(teacher.classes || [])])),
      studentCount: Math.max(existing.studentCount || 0, teacher.studentCount || 0),
    });
  }
  return Array.from(map.values());
}
