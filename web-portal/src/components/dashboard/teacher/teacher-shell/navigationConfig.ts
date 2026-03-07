/**
 * Teacher Navigation Configuration
 * Expanded for feature parity with mobile teacherRoutes.ts
 */

import {
  MessageCircle,
  Users,
  LayoutDashboard,
  Settings,
  BookOpen,
  ClipboardCheck,
  Sparkles,
  BarChart3,
  Video,
  CheckSquare,
  Calendar,
  Users2,
  Phone,
  FileText,
  Star,
  Gift,
  Home,
  MonitorPlay,
} from 'lucide-react';
import type { ResolvedSchoolType } from '@/lib/tenant/schoolTypeResolver';
import { isDashboardActionAllowed } from '@/lib/dashboard/dashboardPolicy';
import type { NavItem } from './types';

export interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_ACTION_MAP: Record<string, string> = {
  '/dashboard/teacher/lessons': 'browse_lessons',
  '/dashboard/teacher/activities': 'create_activity',
  '/dashboard/teacher/interactive-activities': 'create_activity',
  '/dashboard/teacher/weekly-plans': 'browse_lessons',
  '/dashboard/teacher/assignments': 'assign_lesson',
  '/dashboard/teacher/homework': 'assign_homework',
  '/dashboard/teacher/classes': 'my_class',
  '/dashboard/teacher/attendance': 'take_attendance',
  '/dashboard/teacher/live-lesson': 'start_live_lesson',
  '/dashboard/teacher/birthdays': 'birthday_chart',
  '/dashboard/teacher/menu': 'weekly_menu',
  '/dashboard/teacher/timetable': 'view_timetable',
  '/dashboard/teacher/school-calendar': 'school_calendar',
  '/dashboard/teacher/activity-samples': 'activity_samples',
  '/dashboard/teacher/messages': 'messages',
  '/dashboard/teacher/groups': 'manage_groups',
  '/dashboard/teacher/calls': 'call_parent',
  '/dashboard/teacher/ai-assistant': 'ai_assistant',
  '/dashboard/teacher/ai-grader': 'assign_homework',
  '/dashboard/teacher/reports': 'student_reports',
  '/dashboard/teacher/tutor-analytics': 'student_reports',
  '/dashboard/teacher/family-review': 'family_activity_review',
  '/dashboard/teacher/reputation': 'reputation',
  '/display': 'room_display_connect',
};

function filterBySchoolType(items: NavItem[], schoolType?: ResolvedSchoolType | null): NavItem[] {
  if (!schoolType) return items;
  return items.filter((item) => {
    const actionId = NAV_ACTION_MAP[item.href];
    if (!actionId) return true;
    return isDashboardActionAllowed('teacher', schoolType, actionId);
  });
}

export function getTeacherNavItems(
  unreadCount: number = 0,
  schoolType?: ResolvedSchoolType | null,
): NavItem[] {
  // Flat list for backward compatibility — used by sidebar/mobile nav
  return getTeacherNavSections(unreadCount, schoolType).flatMap((s) => s.items);
}

/**
 * Grouped nav sections — mirrors mobile category grouping
 */
export function getTeacherNavSections(
  unreadCount: number = 0,
  schoolType?: ResolvedSchoolType | null,
): NavSection[] {
  return [
    {
      label: 'Overview',
      items: [
        { href: '/dashboard/teacher', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Lessons & Activities',
      items: [
        { href: '/dashboard/teacher/lessons', label: 'Lesson Plans', icon: BookOpen },
        { href: '/dashboard/teacher/activities', label: 'Activities', icon: Sparkles },
        { href: '/dashboard/teacher/interactive-activities', label: 'Interactive Activities', icon: Sparkles },
        { href: '/dashboard/teacher/weekly-plans', label: 'Weekly Plans', icon: Calendar },
        { href: '/dashboard/teacher/activity-samples', label: 'Activity Samples', icon: BookOpen },
        { href: '/dashboard/teacher/assignments', label: 'Assignments', icon: ClipboardCheck },
        { href: '/dashboard/teacher/homework', label: 'Homework', icon: FileText },
      ],
    },
    {
      label: 'Classroom',
      items: [
        { href: '/dashboard/teacher/classes', label: 'My Classes', icon: Users },
        { href: '/dashboard/teacher/attendance', label: 'Attendance', icon: CheckSquare },
        { href: '/dashboard/teacher/timetable', label: 'My Timetable', icon: Calendar },
        { href: '/dashboard/teacher/school-calendar', label: 'School Calendar', icon: Calendar },
        { href: '/dashboard/teacher/live-lesson', label: 'Live Lesson', icon: Video },
        { href: '/dashboard/teacher/birthdays', label: 'Birthday Chart', icon: Gift },
        { href: '/dashboard/teacher/menu', label: 'Weekly Menu', icon: Calendar },
      ],
    },
    {
      label: 'Communication',
      items: [
        { href: '/dashboard/teacher/messages', label: 'Messages', icon: MessageCircle, badge: unreadCount },
        { href: '/dashboard/teacher/groups', label: 'Groups', icon: Users2 },
        { href: '/dashboard/teacher/calls', label: 'Calls', icon: Phone },
      ],
    },
    {
      label: 'AI Tools',
      items: [
        { href: '/dashboard/teacher/ai-assistant', label: 'AI Assistant', icon: Sparkles },
        { href: '/dashboard/teacher/ai-grader', label: 'Homework Grader', icon: ClipboardCheck },
      ],
    },
    {
      label: 'Reports & Analytics',
      items: [
        { href: '/dashboard/teacher/reports', label: 'Student Reports', icon: BarChart3 },
        { href: '/dashboard/teacher/tutor-analytics', label: 'Tutor Analytics', icon: Sparkles },
        { href: '/dashboard/teacher/family-review', label: 'Family Activity', icon: Home },
        { href: '/dashboard/teacher/reputation', label: 'My Reputation', icon: Star },
      ],
    },
    {
      label: 'Display',
      items: [
        { href: '/display', label: 'Daily Room (TV)', icon: MonitorPlay },
      ],
    },
    {
      label: 'Account',
      items: [
        { href: '/dashboard/teacher/settings', label: 'Settings', icon: Settings },
      ],
    },
  ]
    .map((section) => ({
      ...section,
      items: filterBySchoolType(section.items, schoolType),
    }))
    .filter((section) => section.items.length > 0);
}
