/**
 * Principal Services Index
 * 
 * Exports all principal-related enhanced services:
 * - Teacher Invite Service (enhanced)
 * - Teacher Approval Service (enhanced)
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
} from '../teacherInviteService.enhanced';

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
} from '../teacherApprovalService.enhanced';

// Legacy compatibility
export { getPendingTeachers, approveTeacher, rejectTeacher, getApprovalStats } from '../teacherApprovalService.enhanced';
