import type { CleaningShiftSlot } from '@/lib/cleaning-roster/constants';

export interface CleaningArea {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface CleaningShift {
  id: string;
  organization_id: string;
  cleaning_area_id: string;
  shift_date: string;
  shift_slot: CleaningShiftSlot;
  notes: string | null;
  required_staff_count: number;
  is_active: boolean;
}

export type CleaningAssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'missed';

export interface CleaningAssignment {
  id: string;
  organization_id: string;
  cleaning_shift_id: string;
  teacher_user_id: string;
  status: CleaningAssignmentStatus;
  started_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
  proof_photo_url: string | null;
}

export interface CleaningTeacher {
  id: string;
  teacherUserId: string;
  displayName: string;
  email: string | null;
}

export interface CleaningTaskView {
  assignmentId: string;
  shiftId: string;
  areaName: string;
  shiftDate: string;
  shiftSlot: CleaningShiftSlot;
  status: CleaningAssignmentStatus;
  startedAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
}
