/**
 * useTeacherManagement — orchestrator hook (barrel module).
 *
 * Composes state, sub-modules, and effects; delegates heavy lifting
 * to fetchTeachers, fetchCandidates, seatHandlers, and documentHandlers.
 *
 * Re-exports all types for consumers.
 */

export type { UseTeacherManagementOptions, UseTeacherManagementReturn } from './types';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TeacherInviteService } from '@/lib/services/teacherInviteService';
import { setSchoolStaffRole } from '@/lib/services/schoolRoleService';
import { useSeatLimits, useTeacherHasSeat } from '@/lib/hooks/useSeatLimits';
import type { TeacherDocument, TeacherDocType } from '@/lib/services/TeacherDocumentsService';
import type { AlertButton } from '@/components/ui/AlertModal';
import type {
  Teacher,
  AvailableTeacher,
  TeacherInvite,
  TeacherManagementView,
} from '@/types/teacher-management';
import type { UseTeacherManagementOptions, UseTeacherManagementReturn, SafeAlert } from './types';

import { assertSupabase } from '@/lib/supabase';
import { fetchTeachersForSchool } from './fetchTeachers';
import { fetchAvailableCandidatesForSchool } from './fetchCandidates';
import { createSeatHandlers } from './seatHandlers';
import {
  refreshSelectedTeacherDocs as refreshDocs,
  pickAndUploadTeacherDoc as pickDoc,
  showAttachDocActionSheet as showDocSheet,
} from './documentHandlers';

export function useTeacherManagement(
  options: UseTeacherManagementOptions = {},
): UseTeacherManagementReturn {
  const { autoFetch = true, showAlert } = options;
  const { user, profile } = useAuth();

  // --- Safe alert wrapper ---
  const safeAlert: SafeAlert = useCallback(
    (config) => {
      if (showAlert) {
        showAlert(config);
      } else {
        console.warn('[TeacherManagement] Alert:', config.title, config.message || '');
      }
    },
    [showAlert],
  );

  // --- Core state ---
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [candidates, setCandidates] = useState<never[]>([]);
  const [invites, setInvites] = useState<TeacherInvite[]>([]);
  const [availableTeachers, setAvailableTeachers] = useState<AvailableTeacher[]>([]);
  const [currentView, setCurrentView] = useState<TeacherManagementView>('overview');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [hiringSearch, setHiringSearch] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [teacherDocsMap, setTeacherDocsMap] = useState<Record<string, TeacherDocument | undefined>>({});
  const [isUploadingDoc] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [updatingRoleTeacherId, setUpdatingRoleTeacherId] = useState<string | null>(null);

  // --- Seat management ---
  const {
    seatUsageDisplay,
    shouldDisableAssignment,
    assignSeatAsync,
    revokeSeatAsync,
    isAssigning,
    isRevoking,
    isLoading: seatLimitsLoading,
    isError: seatLimitsError,
    refetch: refetchSeatLimits,
  } = useSeatLimits();

  const selectedTeacherHasSeat = useTeacherHasSeat(selectedTeacher?.teacherUserId ?? '__none__');

  // --- Preschool ID resolver ---
  const getPreschoolId = useCallback((): string | null => {
    if (profile?.organization_id) return profile.organization_id as string;
    if ((profile as unknown as Record<string, unknown>)?.preschool_id)
      return (profile as unknown as Record<string, unknown>).preschool_id as string;
    return user?.user_metadata?.preschool_id || null;
  }, [profile, user]);

  // --- Data fetchers ---
  const fetchTeachers = useCallback(async () => {
    const pid = getPreschoolId();
    if (!pid) return;
    setLoading(true);
    try {
      const result = await fetchTeachersForSchool(pid);
      setTeachers(result);
    } finally {
      setLoading(false);
    }
  }, [getPreschoolId]);

  const fetchAvailableCandidates = useCallback(async () => {
    const pid = getPreschoolId();
    if (!pid) return;
    try {
      const result = await fetchAvailableCandidatesForSchool(pid, radiusKm, hiringSearch);
      setAvailableTeachers(result);
    } catch {
      // ignore — non-critical
    }
  }, [getPreschoolId, radiusKm, hiringSearch]);

  const loadInvites = useCallback(async () => {
    const pid = getPreschoolId();
    if (!pid) return;
    try {
      const pendingInvites = await TeacherInviteService.listInvites(pid);
      setInvites(
        pendingInvites.map((i) => ({
          id: i.id,
          email: i.email,
          status: i.status,
          created_at: i.created_at,
          token: i.token,
        })),
      );
    } catch {
      // ignore
    }
  }, [getPreschoolId]);

  // --- Seat handlers ---
  const { handleAssignSeat, handleRevokeSeat } = createSeatHandlers({
    shouldDisableAssignment,
    seatUsageDisplay,
    assignSeat: assignSeatAsync,
    revokeSeat: revokeSeatAsync,
    fetchTeachers,
    safeAlert,
  });

  const handleSetTeacherRole = useCallback(
    async (teacher: Teacher, role: 'teacher' | 'admin' | 'principal_admin') => {
      const schoolId = getPreschoolId();
      if (!schoolId) {
        safeAlert({
          title: 'School Not Found',
          message: 'Could not determine your school. Please re-open this screen and try again.',
          type: 'error',
        });
        return;
      }

      const profileId = teacher.profileId;
      if (!profileId) {
        safeAlert({
          title: 'Cannot Update Role',
          message: 'This teacher is missing a linked profile record. Please ask them to complete account setup first.',
          type: 'warning',
        });
        return;
      }

      const currentRole = teacher.schoolRole || 'teacher';
      if (currentRole === role) return;

      const teacherName = `${teacher.firstName} ${teacher.lastName}`.trim() || teacher.email;
      const roleLabel = role === 'teacher' ? 'Teacher' : 'School Admin';
      const actionLabel = role === 'teacher' ? 'Set as Teacher' : 'Make School Admin';
      const confirmMessage =
        role === 'teacher'
          ? `${teacherName} will lose school admin privileges and remain a teacher.`
          : `${teacherName} will gain school admin access for this school.`;

      safeAlert({
        title: actionLabel,
        message: confirmMessage,
        type: 'info',
        buttons: [
          { text: 'Cancel', style: 'cancel' } as AlertButton,
          {
            text: actionLabel,
            onPress: async () => {
              try {
                setIsUpdatingRole(true);
                setUpdatingRoleTeacherId(teacher.id);
                await setSchoolStaffRole({
                  targetProfileId: profileId,
                  schoolId,
                  role,
                });
                await fetchTeachers();
                safeAlert({
                  title: 'Role Updated',
                  message: `${teacherName} is now ${roleLabel}.`,
                  type: 'success',
                });
              } catch (error) {
                safeAlert({
                  title: 'Role Update Failed',
                  message: error instanceof Error ? error.message : 'Could not update school role.',
                  type: 'error',
                });
              } finally {
                setIsUpdatingRole(false);
                setUpdatingRoleTeacherId(null);
              }
            },
          } as AlertButton,
        ],
      });
    },
    [fetchTeachers, getPreschoolId, safeAlert],
  );

  // --- Update handler ---
  const updateTeacher = useCallback(
    async (teacherId: string, payload: Record<string, unknown>) => {
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('teachers')
        .update(payload)
        .eq('id', teacherId);
      if (error) throw error;
      // Refresh list so UI reflects changes
      await fetchTeachers();
      // Refresh selected teacher if it's the one we just edited
      if (selectedTeacher?.id === teacherId) {
        const updated = (await fetchTeachersForSchool(getPreschoolId()!)).find(
          (t) => t.id === teacherId,
        );
        if (updated) setSelectedTeacher(updated);
      }
    },
    [fetchTeachers, selectedTeacher, getPreschoolId],
  );

  // --- Document handlers ---
  const refreshSelectedTeacherDocs = useCallback(
    () => refreshDocs({ selectedTeacher, setTeacherDocsMap, safeAlert }),
    [selectedTeacher, safeAlert],
  );

  const pickAndUploadTeacherDoc = useCallback(
    (docType: TeacherDocType) => pickDoc(docType),
    [],
  );

  const showAttachDocActionSheet = useCallback(
    () => showDocSheet(safeAlert, pickAndUploadTeacherDoc),
    [safeAlert, pickAndUploadTeacherDoc],
  );

  // --- Effects ---
  useEffect(() => {
    if (autoFetch) {
      loadInvites();
      fetchTeachers();
      fetchAvailableCandidates();
    }
  }, [autoFetch, fetchTeachers, loadInvites, fetchAvailableCandidates]);

  useEffect(() => {
    if (currentView === 'profile' && selectedTeacher?.id) {
      refreshSelectedTeacherDocs();
    }
  }, [currentView, selectedTeacher?.id, refreshSelectedTeacherDocs]);

  // --- Public API ---
  return {
    teachers,
    candidates,
    invites,
    availableTeachers,
    currentView,
    selectedTeacher,
    loading,
    searchQuery,
    filterStatus,
    hiringSearch,
    radiusKm,
    teacherDocsMap,
    isUploadingDoc,
    showInviteModal,
    inviteEmail,

    seatUsageDisplay,
    shouldDisableAssignment,
    isAssigning,
    isRevoking,
    isUpdatingRole,
    updatingRoleTeacherId,
    seatLimitsLoading,
    seatLimitsError,
    selectedTeacherHasSeat,

    setCurrentView,
    setSelectedTeacher,
    setSearchQuery,
    setFilterStatus,
    setHiringSearch,
    setRadiusKm,
    setShowInviteModal,
    setInviteEmail,
    fetchTeachers,
    fetchAvailableCandidates,
    loadInvites,
    refetchSeatLimits,
    handleAssignSeat,
    handleRevokeSeat,
    handleSetTeacherRole,
    updateTeacher,
    pickAndUploadTeacherDoc,
    showAttachDocActionSheet,
    refreshSelectedTeacherDocs,
    getPreschoolId,
  };
}
