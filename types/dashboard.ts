/**
 * Dashboard Data Types
 * 
 * Shared type definitions for all dashboard hooks.
 * Extracted from hooks/useDashboardData.ts per WARP.md standards.
 */

// Types for dashboard data
export interface PrincipalDashboardData {
  schoolId?: string;
  schoolName: string;
  totalStudents: number;
  totalTeachers: number;
  totalParents: number;
  attendanceRate: number;
  monthlyRevenue: number;
  pendingApplications: number;
  upcomingEvents: number;
  capacity?: number;
  enrollmentPercentage?: number;
  lastUpdated?: string;
  recentActivity: Array<{
    id: string;
    type: 'enrollment' | 'payment' | 'teacher' | 'event';
    message: string;
    time: string;
    userName?: string;
  }>;
}

export interface DashboardQuickStat {
  label: string;
  value: string | number;
  icon?: string;
  trend?: string;
  color?: string;
}

export interface RecentActivity {
  id: string;
  type: string;
  message: string;
  time: string;
  userName?: string;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  time: string;
  type?: string;
  eventDate?: string | null;
  daysUntil?: number | null;
  reminderOffsetDays?: number | null;
  reminderLabel?: string | null;
  // Excursion-specific metadata (present when type === 'excursion')
  destination?: string;
  departure_time?: string | null;
  estimated_cost?: number;
  consent_required?: boolean;
  consent_deadline?: string | null;
  items_to_bring?: string[];
}

export interface ChildData {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  dateOfBirth?: string | null;
  grade?: string;
  className?: string;
  teacher?: string;
}

export function createEmptyPrincipalData(): PrincipalDashboardData {
  return {
    schoolName: '',
    totalStudents: 0,
    totalTeachers: 0,
    totalParents: 0,
    attendanceRate: 0,
    monthlyRevenue: 0,
    pendingApplications: 0,
    upcomingEvents: 0,
    recentActivity: [],
  };
}

export function createEmptyTeacherData(): TeacherDashboardData {
  return {
    schoolName: '',
    totalStudents: 0,
    totalClasses: 0,
    upcomingLessons: 0,
    pendingGrading: 0,
    myClasses: [],
    recentAssignments: [],
    upcomingEvents: [],
    todayRoutine: null,
    schoolWideRoutine: null,
    classRoutines: [],
  };
}

export function createEmptyParentData(): ParentDashboardData {
  return {
    schoolName: '',
    totalChildren: 0,
    feesDueSoon: null,
    children: [],
    attendanceRate: 0,
    presentToday: 0,
    recentHomework: [],
    upcomingEvents: [],
    unreadMessages: 0,
  };
}

export interface TeacherRoutineSnapshot {
  weeklyProgramId: string;
  classId?: string | null;
  termId?: string | null;
  themeId?: string | null;
  title?: string | null;
  summary?: string | null;
  weekStartDate: string;
  weekEndDate: string;
  dayOfWeek: number;
  blockCount: number;
  nextBlockTitle?: string | null;
  nextBlockStart?: string | null;
  blocks: Array<{
    id: string;
    title: string;
    blockType: string;
    startTime?: string | null;
    endTime?: string | null;
  }>;
}

export interface TeacherDashboardData {
  schoolName: string;
  schoolTier?: 'free' | 'starter' | 'premium' | 'enterprise' | 'solo' | 'group_5' | 'group_10';
  totalStudents: number;
  totalClasses: number;
  upcomingLessons: number;
  pendingGrading: number;
  myClasses: Array<{
    id: string;
    name: string;
    studentCount: number;
    grade: string;
    room: string;
    nextLesson: string;
    attendanceRate?: number;
    presentToday?: number;
  }>;
  recentAssignments: Array<{
    id: string;
    title: string;
    dueDate: string;
    submitted: number;
    total: number;
    status: 'pending' | 'graded' | 'overdue';
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    time: string;
    type: 'meeting' | 'activity' | 'assessment';
    eventDate?: string | null;
    daysUntil?: number | null;
    reminderOffsetDays?: 7 | 3 | 1 | null;
    reminderLabel?: string | null;
  }>;
  todayRoutine?: TeacherRoutineSnapshot | null;
  schoolWideRoutine?: TeacherRoutineSnapshot | null;
  classRoutines?: TeacherRoutineSnapshot[];
}

export interface ParentDashboardData {
  schoolName: string;
  totalChildren: number;
  feesDueSoon?: {
    amount: number;
    dueDate: string | null;
    daysUntil: number;
    childName: string | null;
  } | null;
  children: Array<{
    id: string;
    firstName: string;
    lastName: string;
    studentCode?: string | null;
    preschoolId?: string | null;
    avatarUrl?: string | null;
    dateOfBirth?: string | null;
    grade: string;
    className: string;
    classId: string | null;
    teacher: string;
  }>;
  attendanceRate: number;
  presentToday: number;
  recentHomework: Array<{
    id: string;
    title: string;
    dueDate: string;
    due_date: string;
    status: 'submitted' | 'graded' | 'not_submitted';
    studentName: string;
    child_name?: string;
    student_id?: string;
    subject?: string;
    description?: string | null;
    class_id?: string | null;
    preschool_id?: string | null;
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    time: string;
    type: 'meeting' | 'activity' | 'assessment';
  }>;
  unreadMessages: number;
}
