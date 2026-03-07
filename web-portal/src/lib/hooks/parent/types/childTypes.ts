/**
 * Child Data Types
 * Extracted from useChildrenData.ts for reuse across child-related hooks
 */

export interface ChildCard {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  grade: string;
  className: string | null;
  classId?: string;
  preschoolId?: string | null;
  organizationId?: string | null;
  preschoolName?: string | null;
  studentCode?: string | null;
  lastActivity: Date;
  homeworkPending: number;
  upcomingEvents: number;
  progressScore: number;
  status: 'active' | 'absent' | 'late';
  avatarUrl?: string | null;
}

export interface UseChildrenDataReturn {
  children: any[];
  childrenCards: ChildCard[];
  activeChildId: string | null;
  setActiveChildId: (id: string) => void;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface ChildMetrics {
  homeworkPending: number;
  upcomingEvents: number;
  progressScore: number;
  status: 'active' | 'absent' | 'late';
  lastActivity: Date;
}

// Database row types for type safety
export type HomeworkAssignmentRow = { id: string };
export type HomeworkSubmissionRow = { assignment_id: string };
