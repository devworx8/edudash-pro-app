import { createClient } from 'npm:@supabase/supabase-js@2';

export type ProfileRow = {
  id: string;
  role: string | null;
  organization_id: string | null;
  preschool_id: string | null;
  auth_user_id: string | null;
  subscription_tier: string | null;
};

export type StudentRow = {
  id: string;
  parent_id: string | null;
  guardian_id: string | null;
  class_id: string | null;
  organization_id: string | null;
  preschool_id: string | null;
  grade: string | null;
  grade_level: string | null;
  student_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type AuthorizedRequestScope = {
  profile: ProfileRow;
  role: string;
  student: StudentRow | null;
  effectiveClassId: string | null;
  effectiveSchoolId: string | null;
  effectiveStudentId: string | null;
};

const STAFF_ROLES = new Set([
  'teacher',
  'principal',
  'principal_admin',
  'admin',
  'school_admin',
  'super_admin',
]);

export const PARENT_ROLES = new Set(['parent', 'guardian', 'sponsor']);
export const STUDENT_ROLES = new Set(['student', 'learner']);

function normalizeOrgId(profile: ProfileRow): string | null {
  return profile.organization_id || profile.preschool_id || null;
}

async function fetchProfileByAuthUser(
  supabase: ReturnType<typeof createClient>,
  authUserId: string,
): Promise<ProfileRow | null> {
  const byAuth = await supabase
    .from('profiles')
    .select('id, role, organization_id, preschool_id, auth_user_id, subscription_tier')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (!byAuth.error && byAuth.data) {
    return byAuth.data as ProfileRow;
  }

  const byId = await supabase
    .from('profiles')
    .select('id, role, organization_id, preschool_id, auth_user_id, subscription_tier')
    .eq('id', authUserId)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return byId.data as ProfileRow;
  }

  return null;
}

async function isParentLinkedToStudent(
  supabase: ReturnType<typeof createClient>,
  parentProfileId: string,
  studentId: string,
): Promise<boolean> {
  const studentResult = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .or(`parent_id.eq.${parentProfileId},guardian_id.eq.${parentProfileId}`)
    .maybeSingle();

  if (!studentResult.error && studentResult.data) {
    return true;
  }

  const relationResult = await supabase
    .from('student_parent_relationships')
    .select('id')
    .eq('student_id', studentId)
    .eq('parent_id', parentProfileId)
    .maybeSingle();

  return !relationResult.error && !!relationResult.data;
}

async function resolveStudentForRequest(
  supabase: ReturnType<typeof createClient>,
  studentId: string,
): Promise<StudentRow | null> {
  const { data, error } = await supabase
    .from('students')
    .select(
      'id, parent_id, guardian_id, class_id, organization_id, preschool_id, grade, grade_level, student_id, first_name, last_name',
    )
    .eq('id', studentId)
    .maybeSingle();

  if (error || !data) return null;
  return data as StudentRow;
}

async function resolveStudentForStudentRole(
  supabase: ReturnType<typeof createClient>,
  profile: ProfileRow,
  authUserId: string,
): Promise<StudentRow | null> {
  const candidateIds = [profile.id, authUserId]
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);

  if (candidateIds.length === 0) return null;

  for (const candidate of candidateIds) {
    const { data, error } = await supabase
      .from('students')
      .select(
        'id, parent_id, guardian_id, class_id, organization_id, preschool_id, grade, grade_level, student_id, first_name, last_name',
      )
      .eq('student_id', candidate)
      .limit(1);

    if (!error && data && data.length === 1) {
      return data[0] as StudentRow;
    }
  }

  return null;
}

export async function resolveAuthorizedScope(
  supabase: ReturnType<typeof createClient>,
  authUserId: string,
  payload: {
    studentId?: string;
    classId?: string;
    schoolId?: string;
    useTeacherContext: boolean;
  },
): Promise<AuthorizedRequestScope> {
  const profile = await fetchProfileByAuthUser(supabase, authUserId);
  if (!profile) {
    throw new Error('Organization membership required');
  }

  const role = String(profile.role || '').toLowerCase();
  const isParent = PARENT_ROLES.has(role);
  const isStudent = STUDENT_ROLES.has(role);
  const isStaff = STAFF_ROLES.has(role);
  const isSuperAdmin = role === 'super_admin';
  const profileOrgId = normalizeOrgId(profile);

  if (isStaff && !isSuperAdmin && !profileOrgId) {
    throw new Error('School membership required for staff exam generation');
  }

  let student: StudentRow | null = null;
  if (payload.studentId) {
    student = await resolveStudentForRequest(supabase, payload.studentId);
  } else if (isStudent) {
    student = await resolveStudentForStudentRole(supabase, profile, authUserId);
  }

  if (payload.studentId && !student && payload.useTeacherContext && !isStudent) {
    throw new Error('Requested student record was not found');
  }

  if (student) {
    if (isParent) {
      const linked = await isParentLinkedToStudent(supabase, profile.id, student.id);
      if (!linked) {
        throw new Error('Parent can only generate exams for linked children');
      }
    }

    if (isStudent) {
      const matchesSelf =
        student.id === profile.id ||
        student.student_id === profile.id ||
        student.student_id === authUserId;

      if (!matchesSelf && payload.studentId) {
        throw new Error('Student can only generate for self');
      }
    }

    if (isStaff && !isSuperAdmin) {
      const studentOrg = student.organization_id || student.preschool_id || null;
      if (profileOrgId && studentOrg && profileOrgId !== studentOrg) {
        throw new Error('Staff can only access students in their own school scope');
      }
    }
  } else if (isParent && payload.useTeacherContext) {
    throw new Error('A linked learner is required to use teacher artifact context');
  }

  const studentOrgId = student?.organization_id || student?.preschool_id || null;

  let effectiveSchoolId = payload.schoolId || studentOrgId || profileOrgId || null;
  if (payload.schoolId) {
    if (studentOrgId && payload.schoolId !== studentOrgId) {
      throw new Error('Requested school scope does not match learner scope');
    }

    if (!studentOrgId && isStaff && !isSuperAdmin && profileOrgId && payload.schoolId !== profileOrgId) {
      throw new Error('Requested school scope is outside staff access');
    }
  }

  let effectiveClassId = payload.classId || student?.class_id || null;
  if (student?.class_id) {
    effectiveClassId = student.class_id;
  }

  if (!effectiveClassId && payload.useTeacherContext && (isParent || isStudent)) {
    console.warn('[generate-exam] teacher context running without class scope', {
      role,
      studentId: student?.id,
    });
  }

  if (isStaff && effectiveClassId && !isSuperAdmin && profileOrgId) {
    const { data: klass } = await supabase
      .from('classes')
      .select('id, preschool_id, organization_id')
      .eq('id', effectiveClassId)
      .maybeSingle();

    if (!klass) {
      throw new Error('Requested class was not found');
    }

    const classOrg = klass.organization_id || klass.preschool_id || null;
    if (classOrg && classOrg !== profileOrgId) {
      throw new Error('Requested class is outside staff school scope');
    }

    if (!effectiveSchoolId) {
      effectiveSchoolId = classOrg;
    }
  }

  return {
    profile,
    role,
    student,
    effectiveClassId,
    effectiveSchoolId,
    effectiveStudentId: student?.id || null,
  };
}
