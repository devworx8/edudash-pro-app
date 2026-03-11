/**
 * Teacher Management Hook — Types & Helpers
 *
 * Interfaces, type aliases, and pure utility functions used across
 * the teacher-management hook family.
 */

import type { TeacherDocument, TeacherDocType } from '@/lib/services/TeacherDocumentsService';
import type { useSeatLimits } from '@/lib/hooks/useSeatLimits';
import type { AlertButton } from '@/components/ui/AlertModal';
import type {
  Teacher,
  Candidate,
  AvailableTeacher,
  TeacherInvite,
  TeacherManagementView,
} from '@/types/teacher-management';

// Re-export domain types so consumers only need one import
export type {
  Teacher,
  Candidate,
  AvailableTeacher,
  TeacherInvite,
  TeacherManagementView,
  TeacherDocument,
  TeacherDocType,
};

export interface UseTeacherManagementOptions {
  autoFetch?: boolean;
  showAlert?: (config: {
    title: string;
    message?: string;
    type?: 'info' | 'warning' | 'success' | 'error';
    buttons?: AlertButton[];
  }) => void;
}

export interface UseTeacherManagementReturn {
  // State
  teachers: Teacher[];
  candidates: Candidate[];
  invites: TeacherInvite[];
  availableTeachers: AvailableTeacher[];
  currentView: TeacherManagementView;
  selectedTeacher: Teacher | null;
  loading: boolean;
  searchQuery: string;
  filterStatus: string;
  hiringSearch: string;
  radiusKm: number;
  teacherDocsMap: Record<string, TeacherDocument | undefined>;
  isUploadingDoc: boolean;
  showInviteModal: boolean;
  inviteEmail: string;

  // Seat management
  seatUsageDisplay: ReturnType<typeof useSeatLimits>['seatUsageDisplay'];
  shouldDisableAssignment: boolean;
  isAssigning: boolean;
  isRevoking: boolean;
  isUpdatingRole: boolean;
  updatingRoleTeacherId: string | null;
  seatLimitsLoading: boolean;
  seatLimitsError: boolean;
  selectedTeacherHasSeat: boolean;

  // Actions
  setCurrentView: (view: TeacherManagementView) => void;
  setSelectedTeacher: (teacher: Teacher | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterStatus: (status: string) => void;
  setHiringSearch: (search: string) => void;
  setRadiusKm: (km: number) => void;
  setShowInviteModal: (show: boolean) => void;
  setInviteEmail: (email: string) => void;
  fetchTeachers: () => Promise<void>;
  fetchAvailableCandidates: () => Promise<void>;
  loadInvites: () => Promise<void>;
  refetchSeatLimits: () => void;
  handleAssignSeat: (teacherUserId: string, teacherName: string) => void;
  handleRevokeSeat: (teacherUserId: string, teacherName: string) => void;
  handleSetTeacherRole: (teacher: Teacher, role: 'teacher' | 'admin' | 'principal_admin') => Promise<void>;
  updateTeacher: (teacherId: string, payload: Record<string, unknown>) => Promise<void>;
  pickAndUploadTeacherDoc: (docType: TeacherDocType) => Promise<void>;
  showAttachDocActionSheet: () => void;
  refreshSelectedTeacherDocs: () => Promise<void>;
  getPreschoolId: () => string | null;
}

/** Alert helper type used by handlers across the hook family. */
export type SafeAlert = (config: {
  title: string;
  message?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  buttons?: AlertButton[];
}) => void;

/** Parse comma-separated class names. */
export function parseClasses(text?: string): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  return t.split(',').map(s => s.trim()).filter(Boolean);
}
