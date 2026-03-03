/**
 * Dashboard Utilities
 * 
 * Shared helper functions for dashboard data processing.
 * Extracted from hooks/useDashboardData.ts per WARP.md standards.
 */

import { assertSupabase } from '@/lib/supabase';
import type { PrincipalDashboardData, TeacherDashboardData, ParentDashboardData } from '@/types/dashboard';

// Polyfill for Promise.allSettled (for older JavaScript engines)
if (!Promise.allSettled) {
  Promise.allSettled = function <T>(promises: Array<Promise<T>>): Promise<Array<PromiseSettledResult<T>>> {
    return Promise.all(
      promises.map((promise) =>
        Promise.resolve(promise)
          .then((value) => ({ status: 'fulfilled' as const, value }))
          .catch((reason) => ({ status: 'rejected' as const, reason }))
      )
    );
  };
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
export const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
};

/**
 * Calculate estimated revenue based on student count
 * Only use as absolute fallback when no payment data exists
 */
export const calculateEstimatedRevenue = (studentCount: number): number => {
  // Average fee per student per month (in Rand) - conservative estimate
  const averageFeePerStudent = 1000;
  return studentCount * averageFeePerStudent;
};

/**
 * Calculate attendance rate for a school
 */
export const calculateAttendanceRate = async (schoolId: string): Promise<number> => {
  try {
    // Get attendance records from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: attendanceData } = await assertSupabase()
      .from('attendance')
      .select('status, student_id')
      .eq('organization_id', schoolId)
      .gte('attendance_date', thirtyDaysAgo.toISOString().split('T')[0]);
    
    if (attendanceData && attendanceData.length > 0) {
      const presentCount = attendanceData.filter(a => a.status === 'present').length;
      return Math.round((presentCount / attendanceData.length) * 1000) / 10;
    }
  } catch (error) {
    console.error('Failed to calculate attendance rate:', error);
  }
  
  return 0;
};

/**
 * Get the next lesson time (9 AM tomorrow)
 */
export const getNextLessonTime = (): string => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  
  return tomorrow.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

/**
 * Format a due date as relative text
 */
export const formatDueDate = (dueDateString: string): string => {
  const dueDate = new Date(dueDateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  if (dueDate.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (dueDate.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  } else {
    return dueDate.toLocaleDateString('en-ZA', {
      month: 'short',
      day: 'numeric'
    });
  }
};

/**
 * Map database activity types to dashboard display types
 */
export const mapActivityType = (actionType: string): string => {
  const typeMap: { [key: string]: string } = {
    'student_created': 'enrollment',
    'student_enrolled': 'enrollment',
    'payment_completed': 'payment',
    'payment_received': 'payment',
    'teacher_hired': 'teacher',
    'teacher_updated': 'teacher',
    'event_created': 'event',
    'meeting_scheduled': 'event'
  };
  
  return typeMap[actionType] || 'event';
};

/**
 * Check if a string is a valid UUID (accepts any UUID-formatted string including non-RFC-compliant)
 */
export const isUuid = (v: string): boolean => 
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Format event time as relative text
 */
export const formatEventTime = (eventDate: Date): string => {
  const now = new Date();
  const diffInHours = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 24) {
    return diffInHours <= 2 ? 'Soon' : `In ${diffInHours} hours`;
  } else {
    const diffInDays = Math.floor(diffInHours / 24);
    return diffInDays === 1 ? 'Tomorrow' : `In ${diffInDays} days`;
  }
};

// Helper functions to create empty dashboard data
export const createEmptyPrincipalData = (schoolName: string = 'No School Assigned'): PrincipalDashboardData => ({
  schoolName,
  totalStudents: 0,
  totalTeachers: 0,
  totalParents: 0,
  attendanceRate: 0,
  monthlyRevenue: 0,
  pendingApplications: 0,
  upcomingEvents: 0,
  recentActivity: []
});

export const createEmptyTeacherData = (): TeacherDashboardData => ({
  schoolName: 'No School Assigned',
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
});

export const createEmptyParentData = (): ParentDashboardData => ({
  schoolName: 'No School Assigned',
  totalChildren: 0,
  children: [],
  attendanceRate: 0,
  presentToday: 0,
  recentHomework: [],
  upcomingEvents: [],
  unreadMessages: 0
});
