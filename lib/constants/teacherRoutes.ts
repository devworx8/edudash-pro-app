/**
 * Teacher Routes - Single Source of Truth
 * 
 * Centralizes all teacher dashboard navigation routes.
 * Use this file for consistent routing across the app.
 * 
 * @module lib/constants/teacherRoutes
 */

import type { Href } from 'expo-router';
import type { ResolvedSchoolType } from '@/lib/schoolTypeResolver';

/**
 * Route configuration for teacher features
 */
export interface TeacherRoute {
  /** Route path */
  path: Href;
  /** Display title */
  title: string;
  /** Icon name (Ionicons) */
  icon: string;
  /** Theme color key or hex color */
  color: string;
  /** Translation key for title */
  titleKey: string;
  /** Whether route requires premium tier */
  requiresPremium?: boolean;
  /** Roles that can access this route */
  roles?: ('teacher' | 'principal_admin')[];
  /** Category for grouping */
  category: 'lessons' | 'classroom' | 'communication' | 'ai' | 'reports';
  /** Location indicator for search index */
  location?: string;
}

/**
 * All teacher routes - Single Source of Truth
 * 
 * Add new routes here and they will automatically appear
 * in the dashboard quick actions.
 */
export const TEACHER_ROUTES: Record<string, TeacherRoute> = {
  // === LESSONS ===
  browse_lessons: {
    path: '/screens/teacher-lessons' as Href,
    title: 'Browse Lessons',
    titleKey: 'teacher.browse_lessons',
    icon: 'albums',
    color: '#6366F1',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  create_lesson: {
    path: '/screens/preschool-lesson-generator' as Href,
    title: 'Create Lesson',
    titleKey: 'teacher.create_lesson',
    icon: 'book',
    color: 'primary',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  quick_lesson: {
    path: '/screens/preschool-lesson-generator?mode=quick' as Href,
    title: 'Quick Lesson',
    titleKey: 'teacher.quick_lesson',
    icon: 'flash',
    color: '#22C55E',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  create_activity: {
    path: '/screens/teacher-activity-builder' as Href,
    title: 'Create Activity',
    titleKey: 'teacher.create_activity',
    icon: 'color-wand',
    color: '#F97316',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  edit_lesson: {
    path: '/screens/lesson-edit' as Href,
    title: 'Edit Lesson',
    titleKey: 'teacher.edit_lesson',
    icon: 'create',
    color: '#F59E0B',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  assign_lesson: {
    path: '/screens/assign-lesson' as Href,
    title: 'Assign Lesson',
    titleKey: 'teacher.grade_assignments',
    icon: 'checkmark-circle',
    color: 'success',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  assign_playground_activity: {
    path: '/screens/assign-lesson?mode=activity-only' as Href,
    title: 'Assign Playground Activity',
    titleKey: 'teacher.assign_playground_activity',
    icon: 'game-controller',
    color: '#EC4899',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  assign_homework: {
    path: '/screens/assign-homework' as Href,
    title: 'Assign Homework',
    titleKey: 'teacher.assign_homework',
    icon: 'document-text',
    color: '#6366F1',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  
  // === CLASSROOM ===
  start_live_lesson: {
    path: '/screens/start-live-lesson' as Href,
    title: 'Start Live Lesson',
    titleKey: 'teacher.start_live_lesson',
    icon: 'videocam',
    color: '#ec4899',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  my_class: {
    path: '/screens/my-class' as Href,
    title: 'My Class',
    titleKey: 'teacher.my_class',
    icon: 'school',
    color: 'secondary',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  daily_program: {
    path: '/screens/teacher-daily-program-planner' as Href,
    title: 'Daily Routine (View)',
    titleKey: 'teacher.daily_program',
    icon: 'time',
    color: '#14B8A6',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  cleaning_tasks: {
    path: '/screens/teacher-cleaning-tasks' as Href,
    title: 'Cleaning Tasks',
    titleKey: 'teacher.cleaning_tasks',
    icon: 'sparkles-outline',
    color: '#0EA5E9',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  year_plan: {
    path: '/screens/teacher-year-plan-view' as Href,
    title: 'Year Plan',
    titleKey: 'dashboard.year_planner',
    icon: 'calendar',
    color: '#3B82F6',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  view_timetable: {
    path: '/screens/teacher-timetable' as Href,
    title: 'My Timetable',
    titleKey: 'teacher.view_timetable',
    icon: 'calendar',
    color: '#0EA5E9',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  school_calendar: {
    path: '/screens/teacher-school-calendar' as Href,
    title: 'School Calendar',
    titleKey: 'teacher.school_calendar',
    icon: 'calendar-outline',
    color: '#10B981',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  activity_samples: {
    path: '/screens/activity-sample-library' as Href,
    title: 'Activity Samples',
    titleKey: 'teacher.activity_samples',
    icon: 'book',
    color: '#8B5CF6',
    category: 'lessons',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Lessons',
  },
  room_display_connect: {
    path: '/screens/room-display-connect' as Href,
    title: 'Room Display',
    titleKey: 'teacher.room_display_connect',
    icon: 'tv',
    color: '#8B5CF6',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  
  // === COMMUNICATION ===
  messages: {
    path: '/screens/teacher-message-list' as Href,
    title: 'Parent Messages',
    titleKey: 'teacher.parent_communication',
    icon: 'chatbubbles',
    color: 'info',
    category: 'communication',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Communication',
  },
  manage_groups: {
    path: '/screens/group-management' as Href,
    title: 'Groups',
    titleKey: 'teacher.manage_groups',
    icon: 'people',
    color: '#06B6D4',
    category: 'communication',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Communication',
  },
  call_parent: {
    path: '/screens/calls' as Href,
    title: 'Call Parent',
    titleKey: 'teacher.call_parent',
    icon: 'call',
    color: '#10B981',
    category: 'communication',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Communication',
  },
  
  // === AI FEATURES ===
  ai_assistant: {
    path: '/screens/dash-assistant' as Href,
    title: 'AI Assistant',
    titleKey: 'teacher.ai_assistant',
    icon: 'sparkles',
    color: 'accent',
    requiresPremium: true,
    category: 'ai',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > AI',
  },
  homework_grader: {
    path: '/screens/ai-homework-grader-live' as Href,
    title: 'Grade Homework',
    titleKey: 'teacher.homework_grader',
    icon: 'checkmark-circle',
    color: '#059669',
    category: 'ai',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > AI',
  },
  homework_helper: {
    path: '/screens/ai-homework-helper' as Href,
    title: 'Homework Helper',
    titleKey: 'teacher.homework_helper',
    icon: 'help-circle',
    color: '#2563EB',
    category: 'ai',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > AI',
  },
  progress_analysis: {
    path: '/screens/ai-progress-analysis' as Href,
    title: 'Progress Analysis',
    titleKey: 'teacher.progress_analysis',
    icon: 'analytics',
    color: '#7C3AED',
    category: 'ai',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > AI',
  },
  generate_image: {
    path: '/screens/dash-image-studio' as Href,
    title: 'Generate Image',
    titleKey: 'teacher.generate_image',
    icon: 'image-outline',
    color: '#2563EB',
    category: 'ai',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > AI',
  },
  
  // === ATTENDANCE ===
  take_attendance: {
    path: '/screens/attendance' as Href,
    title: 'Take Attendance',
    titleKey: 'teacher.take_attendance',
    icon: 'checkbox',
    color: '#10B981',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },
  
  // === REPORTS ===
  request_petty_cash: {
    path: '/screens/petty-cash-request' as Href,
    title: 'Request Petty Cash',
    titleKey: 'teacher.request_petty_cash',
    icon: 'wallet',
    color: '#14B8A6',
    category: 'reports',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Reports',
  },
  student_reports: {
    path: '/screens/teacher-reports' as Href,
    title: 'Student Reports',
    titleKey: 'teacher.student_reports',
    icon: 'bar-chart',
    color: 'warning',
    category: 'reports',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Reports',
  },
  tutor_analytics: {
    path: '/screens/teacher-tutor-analytics' as Href,
    title: 'Tutor Analytics',
    titleKey: 'teacher.tutor_analytics',
    icon: 'analytics',
    color: '#8B5CF6',
    category: 'reports',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Reports',
  },
  family_activity_review: {
    path: '/screens/family-activity-review' as Href,
    title: 'Family Activity Review',
    titleKey: 'teacher.family_activity_review',
    icon: 'home',
    color: '#14B8A6',
    category: 'reports',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Reports',
  },
  reputation: {
    path: '/screens/teacher-references' as Href,
    title: 'My Reputation',
    titleKey: 'teacher.reputation',
    icon: 'star',
    color: '#F59E0B',
    category: 'reports',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Reports',
  },
  
  // === BIRTHDAYS ===
  birthday_chart: {
    path: '/screens/birthday-chart' as Href,
    title: 'Birthday Chart',
    titleKey: 'teacher.birthday_chart',
    icon: 'gift',
    color: '#E91E63',
    category: 'classroom',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Classroom',
  },

  // === SA-SPECIFIC ===
  cptd_logger: {
    path: '/screens/cptd-logger' as Href,
    title: 'CPTD Logger',
    titleKey: 'teacher.cptd_logger',
    icon: 'ribbon',
    color: '#7C3AED',
    category: 'reports',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Reports',
  },
  nsnp_reporting: {
    path: '/screens/nsnp-reporting' as Href,
    title: 'NSNP Meals',
    titleKey: 'teacher.nsnp_reporting',
    icon: 'nutrition',
    color: '#F59200',
    category: 'reports',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Reports',
  },
  class_story: {
    path: '/screens/class-story' as Href,
    title: 'Class Story',
    titleKey: 'teacher.class_story',
    icon: 'camera',
    color: '#EC4899',
    category: 'communication',
    roles: ['teacher', 'principal_admin'],
    location: 'Teacher > Communication',
  },
} as const;

/**
 * Get route path for a specific action
 */
export const getTeacherRoute = (action: keyof typeof TEACHER_ROUTES): Href => {
  return TEACHER_ROUTES[action]?.path || '/screens/teacher-dashboard' as Href;
};

/**
 * Resolve teacher route with school-type-aware overrides.
 * Preschool keeps the preschool lesson generator; K-12 uses the generic AI generator.
 */
export const getTeacherRouteForSchoolType = (
  action: keyof typeof TEACHER_ROUTES,
  schoolType: ResolvedSchoolType
): Href => {
  if (action === 'create_lesson') {
    return (schoolType === 'k12_school'
      ? '/screens/ai-lesson-generator'
      : '/screens/preschool-lesson-generator') as Href;
  }
  if (action === 'quick_lesson') {
    return (schoolType === 'k12_school'
      ? '/screens/ai-lesson-generator'
      : '/screens/preschool-lesson-generator?mode=quick') as Href;
  }
  return getTeacherRoute(action);
};

/**
 * Get all routes for a specific category
 */
export const getRoutesByCategory = (category: TeacherRoute['category']): TeacherRoute[] => {
  return Object.values(TEACHER_ROUTES).filter(route => route.category === category);
};

/**
 * Quick actions to display on the dashboard
 * Order matters - this is the display order
 */
export const TEACHER_QUICK_ACTIONS: (keyof typeof TEACHER_ROUTES)[] = [
  'browse_lessons',
  'create_lesson',
  'quick_lesson',
  'create_activity',
  'take_attendance',
  'start_live_lesson',
  'assign_lesson',
  'assign_playground_activity',
  'assign_homework',
  'my_class',
  'daily_program',
  'cleaning_tasks',
  'year_plan',
  'room_display_connect',
  'view_timetable',
  'activity_samples',
  'birthday_chart',
  'messages',
  'manage_groups',
  'request_petty_cash',
  'student_reports',
  'family_activity_review',
  'reputation',
  'generate_image',
  'ai_assistant',
  'homework_grader',
  'homework_helper',
  'progress_analysis',
  'call_parent',
  'cptd_logger',
  'nsnp_reporting',
  'class_story',
];

/**
 * Resolve color from theme or hex
 */
export const resolveRouteColor = (colorKey: string, theme: any): string => {
  // If it's a hex color, return as-is
  if (colorKey.startsWith('#')) {
    return colorKey;
  }
  // Otherwise resolve from theme
  return theme[colorKey] || theme.primary;
};
