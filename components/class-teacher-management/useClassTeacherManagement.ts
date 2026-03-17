/**
 * Hook for Class & Teacher Management
 * Extracted from app/screens/class-teacher-management.tsx
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAlertModal } from '@/components/ui/AlertModal';
import { assertSupabase } from '@/lib/supabase';
import { removeTeacherFromSchool } from '@/lib/services/teacherRemovalService';
import { setSchoolStaffRole } from '@/lib/services/schoolRoleService';
import type {
  ClassInfo,
  Teacher,
  ClassFormData,
  ActiveTab,
  UseClassTeacherManagementResult,
  ClassTeacherAssignment,
  ClassTeacherRole,
} from './types';
import { INITIAL_CLASS_FORM } from './utils';

interface UseClassTeacherManagementOptions {
  orgId: string | null | undefined;
  userId: string | undefined;
}

interface TeacherMembershipRow {
  user_id: string | null;
  role: string | null;
  member_type: string | null;
  seat_status: string | null;
  membership_status: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
}

interface TeacherRow {
  id: string;
  user_id: string | null;
  auth_user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  created_at: string | null;
  is_active: boolean | null;
}

interface TeacherProfileRow {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string | null;
  created_at: string | null;
}

interface ClassTeacherRow {
  class_id: string;
  teacher_id: string;
  role: string | null;
}

interface TeacherCandidateMeta {
  profile?: TeacherProfileRow;
  teacherRecordId?: string | null;
  roleHint?: string | null;
  createdAt?: string | null;
  emailHint?: string | null;
  firstNameHint?: string | null;
  lastNameHint?: string | null;
  userIdHint?: string | null;
}

const normalizeTeacherRole = (role: string | null | undefined): Teacher['role'] => {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'principal_admin') return 'principal_admin';
  return 'teacher';
};

const normalizeClassTeacherRole = (role: string | null | undefined): ClassTeacherRole => {
  return String(role || '').toLowerCase() === 'lead' ? 'lead' : 'assistant';
};

const isMissingClassTeachersTable = (error: { code?: string | null; message?: string | null } | null | undefined): boolean => {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return /class_teachers/i.test(error.message || '');
};

const isTeacherMembership = (row: TeacherMembershipRow): boolean => {
  const role = String(row.role || '').toLowerCase();
  const memberType = String(row.member_type || '').toLowerCase();
  const seatStatus = String(row.seat_status || 'active').toLowerCase();
  const membershipStatus = String(row.membership_status || 'active').toLowerCase();

  const hasActiveSeat = seatStatus === 'active' || seatStatus === 'pending' || seatStatus === '';
  const isActiveMembership = membershipStatus === 'active' || membershipStatus === '';
  const isStaffRole =
    role.includes('teacher') ||
    role === 'admin' ||
    role === 'principal_admin' ||
    memberType === 'staff';

  return hasActiveSeat && isActiveMembership && isStaffRole;
};

const pushClassIndex = (map: Map<string, ClassInfo[]>, key: string, classInfo: ClassInfo): void => {
  if (!key) return;
  const existing = map.get(key) || [];
  map.set(key, existing.concat(classInfo));
};

export function useClassTeacherManagement({
  orgId,
  userId,
}: UseClassTeacherManagementOptions): UseClassTeacherManagementResult & { AlertModalComponent: React.FC } {
  const { showAlert, AlertModalComponent } = useAlertModal();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showTeacherAssignment, setShowTeacherAssignment] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [assignmentTeacherId, setAssignmentTeacherId] = useState('');
  const [assignmentRole, setAssignmentRole] = useState<ClassTeacherRole>('lead');
  const [classTeachersAvailable, setClassTeachersAvailable] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('classes');
  const [classForm, setClassForm] = useState<ClassFormData>(INITIAL_CLASS_FORM);
  const [roleUpdateTeacherId, setRoleUpdateTeacherId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!userId || !orgId) return;

    try {
      setLoading(true);
      const schoolId = orgId;
      const supabase = assertSupabase();

      const [classesResult, teacherMembersResult, teacherRowsResult] = await Promise.all([
        supabase
          .from('classes')
          .select('id,name,grade_level,max_capacity,room_number,teacher_id,active')
          .eq('preschool_id', schoolId),
        supabase
          .from('organization_members')
          .select('user_id,role,member_type,seat_status,membership_status,email,first_name,last_name,created_at')
          .eq('organization_id', schoolId),
        supabase
          .from('teachers')
          .select('id,user_id,auth_user_id,email,first_name,last_name,role,created_at,is_active')
          .eq('preschool_id', schoolId)
          .eq('is_active', true),
      ]);

      if (classesResult.error) {
        console.error('[ClassTeacherManagement] Error loading classes:', classesResult.error);
      }
      if (teacherMembersResult.error) {
        console.error('[ClassTeacherManagement] Error loading memberships:', teacherMembersResult.error);
      }
      if (teacherRowsResult.error) {
        console.error('[ClassTeacherManagement] Error loading teachers table:', teacherRowsResult.error);
      }

      const classRows = (classesResult.data || []) as Array<{
        id: string;
        name: string;
        grade_level: string;
        max_capacity: number | null;
        room_number: string | null;
        teacher_id: string | null;
        active: boolean | null;
      }>;

      const classIds = classRows.map((row) => row.id);
      let classTeacherRows: ClassTeacherRow[] = [];
      if (classIds.length > 0 && classTeachersAvailable) {
        const { data: classTeacherData, error: classTeacherError } = await supabase
          .from('class_teachers')
          .select('class_id,teacher_id,role')
          .in('class_id', classIds);

        if (classTeacherError) {
          if (isMissingClassTeachersTable(classTeacherError)) {
            setClassTeachersAvailable(false);
          } else {
            console.warn('[ClassTeacherManagement] Error loading class_teachers:', classTeacherError);
          }
        }
        classTeacherRows = (classTeacherData || []) as ClassTeacherRow[];
      }

      const teacherMembers = (teacherMembersResult.data || []) as TeacherMembershipRow[];
      const teacherRows = (teacherRowsResult.data || []) as TeacherRow[];

      const classTeacherRefs = Array.from(
        new Set(classRows.map((row) => row.teacher_id).filter((id): id is string => Boolean(id)))
      );
      const classTeacherJoinRefs = Array.from(
        new Set(classTeacherRows.map((row) => row.teacher_id).filter((id): id is string => Boolean(id)))
      );

      const membershipTeacherRefs = Array.from(
        new Set(
          teacherMembers
            .filter(isTeacherMembership)
            .map((row) => row.user_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const teacherTableRefs = Array.from(
        new Set(
          teacherRows
            .flatMap((row) => [row.user_id, row.auth_user_id])
            .filter((id): id is string => Boolean(id))
        )
      );

      const lookupRefs = Array.from(
        new Set([...classTeacherRefs, ...classTeacherJoinRefs, ...membershipTeacherRefs, ...teacherTableRefs])
      );

      let profiles: TeacherProfileRow[] = [];
      if (lookupRefs.length > 0) {
        const [profilesByIdResult, profilesByAuthIdResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id,auth_user_id,email,first_name,last_name,phone,role,created_at')
            .in('id', lookupRefs),
          supabase
            .from('profiles')
            .select('id,auth_user_id,email,first_name,last_name,phone,role,created_at')
            .in('auth_user_id', lookupRefs),
        ]);

        if (profilesByIdResult.error) {
          console.warn('[ClassTeacherManagement] Profile lookup by id warning:', profilesByIdResult.error);
        }
        if (profilesByAuthIdResult.error) {
          console.warn('[ClassTeacherManagement] Profile lookup by auth_user_id warning:', profilesByAuthIdResult.error);
        }

        const mergedProfiles = [
          ...((profilesByIdResult.data || []) as TeacherProfileRow[]),
          ...((profilesByAuthIdResult.data || []) as TeacherProfileRow[]),
        ];

        const dedupedById = new Map<string, TeacherProfileRow>();
        for (const row of mergedProfiles) {
          if (!row?.id) continue;
          dedupedById.set(row.id, row);
        }
        profiles = Array.from(dedupedById.values());
      }

      const profileById = new Map<string, TeacherProfileRow>();
      const profileByAuthId = new Map<string, TeacherProfileRow>();
      for (const profile of profiles) {
        profileById.set(profile.id, profile);
        if (profile.auth_user_id) {
          profileByAuthId.set(profile.auth_user_id, profile);
        }
      }

      const resolveProfile = (refId: string | null | undefined): TeacherProfileRow | null => {
        if (!refId) return null;
        return profileById.get(refId) || profileByAuthId.get(refId) || null;
      };

      const classTeachersByClassId = new Map<string, ClassTeacherRow[]>();
      classTeacherRows.forEach((row) => {
        const existing = classTeachersByClassId.get(row.class_id) || [];
        classTeachersByClassId.set(row.class_id, existing.concat(row));
      });

      const buildAssignment = (
        teacherRef: string,
        role: ClassTeacherRole,
        fallbackName?: string
      ): ClassTeacherAssignment => {
        const profile = resolveProfile(teacherRef);
        const name =
          `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() ||
          profile?.email ||
          fallbackName ||
          'Teacher';

        return {
          teacher_id: profile?.id || teacherRef,
          auth_user_id: profile?.auth_user_id || undefined,
          teacher_name: name,
          role,
        };
      };

      const processedClasses: ClassInfo[] = classRows.map((row) => {
        const assignments = (classTeachersByClassId.get(row.id) || []).map((assignmentRow) =>
          buildAssignment(assignmentRow.teacher_id, normalizeClassTeacherRole(assignmentRow.role))
        );

        if (assignments.length === 0 && row.teacher_id) {
          assignments.push(buildAssignment(row.teacher_id, 'lead'));
        }

        assignments.sort((a, b) => {
          if (a.role === b.role) {
            return a.teacher_name.localeCompare(b.teacher_name);
          }
          if (a.role === 'lead') return -1;
          if (b.role === 'lead') return 1;
          return 0;
        });
        const leadAssignment = assignments.find((assignment) => assignment.role === 'lead');

        return {
          id: row.id,
          name: row.name,
          grade_level: row.grade_level,
          capacity: row.max_capacity || 0,
          current_enrollment: 0,
          room_number: row.room_number || undefined,
          teacher_id: leadAssignment?.teacher_id,
          teacher_name: leadAssignment?.teacher_name,
          teacher_assignments: assignments,
          is_active: row.active ?? true,
        } as ClassInfo;
      });

      const processedClassIds = processedClasses.map((c) => c.id);
      if (processedClassIds.length > 0) {
        const { data: enrollments, error: enrollmentError } = await supabase
          .from('students')
          .select('class_id')
          .in('class_id', processedClassIds);

        if (enrollmentError) {
          console.warn('[ClassTeacherManagement] Enrollment count warning:', enrollmentError);
        }

        const countMap: Record<string, number> = {};
        (enrollments || []).forEach((e: { class_id: string }) => {
          countMap[e.class_id] = (countMap[e.class_id] || 0) + 1;
        });

        processedClasses.forEach((cls) => {
          cls.current_enrollment = countMap[cls.id] || 0;
        });
      }

      setClasses(processedClasses);

      const classesByTeacherRef = new Map<string, ClassInfo[]>();
      processedClasses.forEach((classInfo) => {
        classInfo.teacher_assignments.forEach((assignment) => {
          pushClassIndex(classesByTeacherRef, assignment.teacher_id, classInfo);
          if (assignment.auth_user_id) {
            pushClassIndex(classesByTeacherRef, assignment.auth_user_id, classInfo);
          }
        });
      });

      const candidateByProfileId = new Map<string, TeacherCandidateMeta>();
      const addCandidate = (
        refId: string | null | undefined,
        meta: Partial<TeacherCandidateMeta> = {}
      ): void => {
        if (!refId) return;

        const matchedProfile = resolveProfile(refId);
        const profileId = matchedProfile?.id || refId;
        const existing = candidateByProfileId.get(profileId) || {};

        candidateByProfileId.set(profileId, {
          ...existing,
          ...meta,
          profile: matchedProfile || existing.profile,
          userIdHint: meta.userIdHint || existing.userIdHint || matchedProfile?.auth_user_id || matchedProfile?.id || refId,
        });
      };

      teacherMembers.forEach((row) => {
        if (!isTeacherMembership(row)) return;
        addCandidate(row.user_id, {
          roleHint: row.role || row.member_type,
          createdAt: row.created_at,
          emailHint: row.email,
          firstNameHint: row.first_name,
          lastNameHint: row.last_name,
          userIdHint: row.user_id,
        });
      });

      teacherRows.forEach((row) => {
        addCandidate(row.user_id, {
          teacherRecordId: row.id,
          roleHint: row.role,
          createdAt: row.created_at,
          emailHint: row.email,
          firstNameHint: row.first_name,
          lastNameHint: row.last_name,
          userIdHint: row.auth_user_id || row.user_id,
        });
        addCandidate(row.auth_user_id, {
          teacherRecordId: row.id,
          roleHint: row.role,
          createdAt: row.created_at,
          emailHint: row.email,
          firstNameHint: row.first_name,
          lastNameHint: row.last_name,
          userIdHint: row.auth_user_id || row.user_id,
        });
      });

      processedClasses.forEach((cls) => {
        if (!cls.teacher_id) return;
        addCandidate(cls.teacher_id, {});
      });

      if (candidateByProfileId.size === 0) {
        const { data: fallbackProfiles, error: fallbackError } = await supabase
          .from('profiles')
          .select('id,auth_user_id,email,first_name,last_name,phone,role,created_at')
          .eq('preschool_id', schoolId)
          .or('role.ilike.%teacher%,role.eq.admin,role.eq.principal_admin');

        if (fallbackError) {
          console.warn('[ClassTeacherManagement] Fallback teacher profile warning:', fallbackError);
        }

        ((fallbackProfiles || []) as TeacherProfileRow[]).forEach((profile) => {
          addCandidate(profile.id, {
            roleHint: profile.role,
            createdAt: profile.created_at,
            emailHint: profile.email,
            firstNameHint: profile.first_name,
            lastNameHint: profile.last_name,
            userIdHint: profile.auth_user_id || profile.id,
            profile,
          });
        });
      }

      const processedTeachers: Teacher[] = Array.from(candidateByProfileId.entries())
        .map(([profileId, candidate]) => {
          const role = normalizeTeacherRole(candidate.profile?.role || candidate.roleHint);
          const firstName = candidate.profile?.first_name || candidate.firstNameHint || '';
          const lastName = candidate.profile?.last_name || candidate.lastNameHint || '';
          const fullName = `${firstName} ${lastName}`.trim() || candidate.profile?.email || candidate.emailHint || 'Teacher';

          const classLookupKeys = new Set<string>();
          classLookupKeys.add(profileId);
          if (candidate.profile?.auth_user_id) classLookupKeys.add(candidate.profile.auth_user_id);
          if (candidate.userIdHint) classLookupKeys.add(candidate.userIdHint);

          const classMap = new Map<string, ClassInfo>();
          classLookupKeys.forEach((key) => {
            (classesByTeacherRef.get(key) || []).forEach((cls) => classMap.set(cls.id, cls));
          });

          const teacherClasses = Array.from(classMap.values());
          const studentsCount = teacherClasses.reduce((sum, cls) => sum + (cls.current_enrollment || 0), 0);

          return {
            id: profileId,
            teacher_record_id: candidate.teacherRecordId || undefined,
            user_id: candidate.profile?.auth_user_id || candidate.userIdHint || profileId,
            auth_user_id: candidate.profile?.auth_user_id || undefined,
            full_name: fullName,
            email: candidate.profile?.email || candidate.emailHint || 'No email',
            phone: candidate.profile?.phone || undefined,
            specialization: '',
            role,
            status: 'active',
            hire_date: candidate.profile?.created_at || candidate.createdAt || new Date().toISOString(),
            classes_assigned: teacherClasses.length,
            students_count: studentsCount,
          } as Teacher;
        })
        .sort((a, b) => {
          if (a.role !== b.role) {
            if (a.role === 'admin') return -1;
            if (b.role === 'admin') return 1;
          }
          return a.full_name.localeCompare(b.full_name);
        });

      setTeachers(processedTeachers);
    } catch (error) {
      console.error('[ClassTeacherManagement] Error loading class/teacher data:', error);
      showAlert({ title: 'Error', message: 'Failed to load data', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, orgId, classTeachersAvailable, showAlert]);

  useEffect(() => {
    if (orgId && userId) {
      loadData();
    }
  }, [orgId, userId, loadData]);

  const activeTeachers = useMemo(
    () => teachers.filter((t) => t.status === 'active' && (t.role === 'teacher' || t.role === 'admin' || t.role === 'principal_admin')),
    [teachers]
  );

  const activeClasses = useMemo(() => classes.filter((c) => c.is_active), [classes]);

  const handleCreateClass = useCallback(async () => {
    if (!classForm.name.trim() || !classForm.grade_level.trim()) {
      showAlert({ title: 'Error', message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    try {
      const schoolId = orgId;
      const client = assertSupabase();

      const selectedLead = activeTeachers.find((teacher) => teacher.id === classForm.teacher_id);
      const leadAuthUserId = selectedLead?.auth_user_id || selectedLead?.user_id || null;

      const { data: newClass, error } = await client
        .from('classes')
        .insert({
          name: classForm.name.trim(),
          grade_level: classForm.grade_level.trim(),
          max_capacity: classForm.capacity,
          room_number: classForm.room_number.trim() || null,
          teacher_id: leadAuthUserId,
          preschool_id: schoolId,
          active: true,
        })
        .select('id')
        .single();

      if (error) {
        showAlert({ title: 'Error', message: error.message || 'Failed to create class', type: 'error' });
        return;
      }

      if (newClass?.id && classForm.teacher_id && classTeachersAvailable) {
        const { error: assignmentError } = await client
          .from('class_teachers')
          .upsert(
            {
              class_id: newClass.id,
              teacher_id: classForm.teacher_id,
              role: 'lead',
            },
            { onConflict: 'class_id,teacher_id' }
          );

        if (assignmentError) {
          console.warn('[ClassTeacherManagement] Lead assignment warning:', assignmentError);
        }
      }

      // Auto-create class messaging group if org setting is enabled
      if (newClass?.id) {
        try {
          const { data: preschool } = await client
            .from('preschools')
            .select('auto_create_class_groups')
            .eq('id', schoolId)
            .single();

          if (preschool?.auto_create_class_groups !== false) {
            const { data: { user } } = await client.auth.getUser();
            if (user) {
              await client.rpc('create_class_group', {
                p_class_id: newClass.id,
                p_preschool_id: schoolId,
                p_created_by: user.id,
                p_group_name: null,
              });
            }
          }
        } catch {
          // Non-blocking — class was created successfully
        }
      }

      showAlert({ title: 'Success', message: 'Class created successfully', type: 'success' });
      setShowClassModal(false);
      setClassForm(INITIAL_CLASS_FORM);
      loadData();
    } catch (error) {
      console.error('[ClassTeacherManagement] create class failed:', error);
      showAlert({ title: 'Error', message: 'Failed to create class', type: 'error' });
    }
  }, [classForm, orgId, activeTeachers, classTeachersAvailable, loadData, showAlert]);

  const handleAssignTeacher = useCallback(async () => {
    if (!selectedClass || !assignmentTeacherId) return;

    try {
      const client = assertSupabase();
      const targetRole = assignmentRole;
      if (!classTeachersAvailable) {
        if (targetRole !== 'lead') {
          showAlert({
            title: 'Upgrade Required',
            message: 'Assistant teacher assignments require the class_teachers table. Please run the migration first.',
            type: 'warning',
          });
          return;
        }

        const selectedTeacher = teachers.find((teacher) => teacher.id === assignmentTeacherId);
        const leadAuthUserId = selectedTeacher?.auth_user_id || selectedTeacher?.user_id || assignmentTeacherId;
        const { error: legacyAssignError } = await client
          .from('classes')
          .update({ teacher_id: leadAuthUserId })
          .eq('id', selectedClass.id);

        if (legacyAssignError) {
          showAlert({ title: 'Error', message: legacyAssignError.message || 'Failed to assign teacher', type: 'error' });
          return;
        }

        showAlert({ title: 'Success', message: 'Lead teacher assigned successfully', type: 'success' });
        setShowTeacherAssignment(false);
        setSelectedClass(null);
        setAssignmentTeacherId('');
        setAssignmentRole('lead');
        loadData();
        return;
      }
      const existingAssignment = selectedClass.teacher_assignments.find(
        (assignment) => assignment.teacher_id === assignmentTeacherId
      );

      if (targetRole === 'lead') {
        await client
          .from('class_teachers')
          .delete()
          .eq('class_id', selectedClass.id)
          .eq('role', 'lead')
          .neq('teacher_id', assignmentTeacherId);
      }

      const { error: upsertError } = await client
        .from('class_teachers')
        .upsert(
          {
            class_id: selectedClass.id,
            teacher_id: assignmentTeacherId,
            role: targetRole,
          },
          { onConflict: 'class_id,teacher_id' }
        );

      if (upsertError) {
        if (isMissingClassTeachersTable(upsertError)) {
          setClassTeachersAvailable(false);
          showAlert({
            title: 'Upgrade Required',
            message: 'Assistant teacher assignments require the class_teachers table. Please run the migration first.',
            type: 'warning',
          });
          return;
        }
        console.error('[ClassTeacherManagement] assign teacher failed:', {
          classId: selectedClass.id,
          teacherId: assignmentTeacherId,
          error: upsertError,
        });
        showAlert({ title: 'Error', message: upsertError.message || 'Failed to assign teacher', type: 'error' });
        return;
      }

      if (targetRole === 'lead') {
        const selectedTeacher = teachers.find((teacher) => teacher.id === assignmentTeacherId);
        const leadAuthUserId = selectedTeacher?.auth_user_id || selectedTeacher?.user_id || null;
        const { error: leadUpdateError } = await client
          .from('classes')
          .update({ teacher_id: leadAuthUserId })
          .eq('id', selectedClass.id);

        if (leadUpdateError) {
          console.warn('[ClassTeacherManagement] lead teacher sync warning:', leadUpdateError);
        }
      } else if (existingAssignment?.role === 'lead') {
        const { error: leadClearError } = await client
          .from('classes')
          .update({ teacher_id: null })
          .eq('id', selectedClass.id);

        if (leadClearError) {
          console.warn('[ClassTeacherManagement] lead teacher clear warning:', leadClearError);
        }
      }

      showAlert({
        title: 'Success',
        message: targetRole === 'lead' ? 'Lead teacher assigned successfully' : 'Assistant teacher assigned successfully',
        type: 'success',
      });
      setShowTeacherAssignment(false);
      setSelectedClass(null);
      setAssignmentTeacherId('');
      setAssignmentRole('lead');
      loadData();
    } catch (error) {
      console.error('[ClassTeacherManagement] assign teacher exception:', error);
      showAlert({ title: 'Error', message: 'Failed to assign teacher', type: 'error' });
    }
  }, [selectedClass, assignmentTeacherId, assignmentRole, teachers, classTeachersAvailable, loadData, showAlert]);

  const handleRemoveTeacher = useCallback(
    (classInfo: ClassInfo, assignment: ClassTeacherAssignment) => {
      showAlert({
        title: 'Remove Teacher',
        message: `Remove ${assignment.teacher_name} from ${classInfo.name}?`,
        type: 'warning',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                const client = assertSupabase();
                if (!classTeachersAvailable) {
                  if (assignment.role !== 'lead') {
                    showAlert({
                      title: 'Upgrade Required',
                      message: 'Assistant teachers are stored in class_teachers. Please run the migration first.',
                      type: 'warning',
                    });
                    return;
                  }

                  const { error: legacyClearError } = await client
                    .from('classes')
                    .update({ teacher_id: null })
                    .eq('id', classInfo.id);

                  if (legacyClearError) {
                    showAlert({ title: 'Error', message: legacyClearError.message || 'Failed to remove teacher', type: 'error' });
                    return;
                  }
                } else {
                  const { error } = await client
                    .from('class_teachers')
                    .delete()
                    .eq('class_id', classInfo.id)
                    .eq('teacher_id', assignment.teacher_id);

                  if (error) {
                    showAlert({ title: 'Error', message: error.message || 'Failed to remove teacher', type: 'error' });
                    return;
                  }
                }

                if (assignment.role === 'lead') {
                  const { error: leadClearError } = await client
                    .from('classes')
                    .update({ teacher_id: null })
                    .eq('id', classInfo.id);

                  if (leadClearError) {
                    console.warn('[ClassTeacherManagement] lead clear warning:', leadClearError);
                  }
                }

                showAlert({ title: 'Success', message: 'Teacher removed from class', type: 'success' });
                loadData();
              } catch (error) {
                console.error('[ClassTeacherManagement] remove teacher exception:', error);
                showAlert({ title: 'Error', message: 'Failed to remove teacher', type: 'error' });
              }
            },
          },
        ],
      });
    },
    [classTeachersAvailable, loadData, showAlert]
  );

  const handleDeleteTeacher = useCallback(
    (teacher: Teacher) => {
      if (!orgId) {
        showAlert({ title: 'Error', message: 'No school found for this account.', type: 'error' });
        return;
      }
      if (!teacher.teacher_record_id) {
        showAlert({ title: 'Error', message: 'Missing teacher record.', type: 'error' });
        return;
      }

      showAlert({
        title: 'Archive Teacher',
        message: `Archive ${teacher.full_name} from your school? This will keep history intact, revoke their seat, and hide them from active teacher lists.`,
        type: 'warning',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Archive',
            style: 'destructive',
            onPress: async () => {
              try {
                await removeTeacherFromSchool({
                  teacherRecordId: teacher.teacher_record_id,
                  teacherUserId: teacher.user_id || teacher.id,
                  organizationId: orgId,
                  reason: 'Archived via class teacher management',
                });
                showAlert({ title: 'Success', message: 'Teacher archived', type: 'success' });
                loadData();
              } catch (error) {
                console.error('Error removing teacher:', error);
                showAlert({ title: 'Error', message: 'Failed to archive teacher', type: 'error' });
              }
            },
          },
        ],
      });
    },
    [loadData, orgId]
  );

  const handleSetTeacherRole = useCallback(
    async (teacher: Teacher, targetRole: 'teacher' | 'admin') => {
      if (!orgId) {
        showAlert({ title: 'Error', message: 'No school found for this account.', type: 'error' });
        return;
      }
      if (!teacher.id) {
        showAlert({ title: 'Error', message: 'Missing teacher identifier.', type: 'error' });
        return;
      }
      if (teacher.role === targetRole) {
        return;
      }

      try {
        setRoleUpdateTeacherId(teacher.id);

        await setSchoolStaffRole({
          targetProfileId: teacher.id,
          schoolId: orgId,
          role: targetRole,
        });

        showAlert({
          title: 'Success',
          message: targetRole === 'admin'
            ? `${teacher.full_name} is now a school admin.`
            : `${teacher.full_name} is now assigned as a teacher.`,
          type: 'success',
        });

        await loadData();
      } catch (error) {
        console.error('[ClassTeacherManagement] role update failed:', error);
        showAlert({ title: 'Error', message: error instanceof Error ? error.message : 'Failed to update role', type: 'error' });
      } finally {
        setRoleUpdateTeacherId(null);
      }
    },
    [orgId, loadData]
  );

  const handleToggleClassStatus = useCallback(
    async (classInfo: ClassInfo) => {
      try {
        const { error } = await assertSupabase()
          .from('classes')
          .update({ active: !classInfo.is_active })
          .eq('id', classInfo.id);

        if (error) {
          showAlert({ title: 'Error', message: error.message || 'Failed to update class status', type: 'error' });
          return;
        }

        loadData();
      } catch (error) {
        console.error('[ClassTeacherManagement] toggle class status exception:', error);
        showAlert({ title: 'Error', message: 'Failed to update class status', type: 'error' });
      }
    },
    [loadData]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  return {
    classes,
    teachers,
    loading,
    refreshing,
    showClassModal,
    showTeacherAssignment,
    selectedClass,
    assignmentTeacherId,
    assignmentRole,
    activeTab,
    classForm,
    roleUpdateTeacherId,
    activeTeachers,
    activeClasses,
    loadData,
    handleCreateClass,
    handleAssignTeacher,
    handleRemoveTeacher,
    handleDeleteTeacher,
    handleSetTeacherRole,
    handleToggleClassStatus,
    setShowClassModal,
    setShowTeacherAssignment,
    setSelectedClass,
    setAssignmentTeacherId,
    setAssignmentRole,
    setActiveTab,
    setClassForm,
    onRefresh,
    AlertModalComponent,
  };
}
