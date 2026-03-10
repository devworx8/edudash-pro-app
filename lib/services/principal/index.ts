/**
 * Principal Services Index
 * 
 * Exports all principal-related enhanced services:
 * - Teacher Invite Service (enhanced)
 * - Teacher Approval Service (enhanced)
 * - Routine Sharing Service
 */

// Teacher Invite
export {
  TeacherInviteService,
  InviteError,
  type TeacherInvite,
  type TeacherInviteStatus,
  type TeacherInviteAcceptResult,
  type CreateInviteParams,
  type AcceptInviteParams,
} from './teacherInviteService.enhanced';

// Teacher Approval
export {
  TeacherApprovalService,
  ApprovalError,
  type PendingTeacher,
  type ApprovalStatus,
  type ApprovalResult,
  type ApprovalErrorCode,
  type BatchApprovalResult,
  type TeacherApprovalStats,
} from './teacherApprovalService.enhanced';

// Routine Sharing
export {
  RoutineSharingService,
  RoutineShareError,
  type RoutineShare,
  type RoutineShareRecipient,
  type ShareRoutineParams,
  type RoutineChangeNotification,
} from './routineSharingService';

// Legacy compatibility
export { getPendingTeachers, approveTeacher, rejectTeacher, getApprovalStats } from './teacherApprovalService.enhanced';
export { shareRoutine, getSharedRoutinesForTeacher, getSharedRoutinesForParent } from './routineSharingService';