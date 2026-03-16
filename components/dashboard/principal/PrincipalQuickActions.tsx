/**
 * Principal Dashboard - Quick Actions Section
 *
 * Core shortcuts (badged, high-urgency) + tabbed groups.
 * Each destination appears at most ONCE within this component.
 * Contextual sections (Metrics, SchoolPulse, DoNow) may also
 * link to the same screens — that is intentional drill-down UX.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlert } from '@/components/ui/StyledAlert';
import { QuickActionCard } from '../shared/QuickActionCard';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { getFeatureFlagsSync, isNextGenDashPolicyEnabled } from '@/lib/featureFlags';
import { isDashboardActionAllowed } from '@/lib/dashboard/dashboardPolicy';
import { createQuickActionsStyles } from './PrincipalQuickActions.styles';
import type { ResolvedSchoolType } from '@/lib/schoolTypeResolver';

type QuickActionGroup = 'people' | 'money' | 'learning' | 'more';
type ActionItem = { id: string; title: string; icon: string; color: string; badge?: number };

/** Route map — single source of truth for action→screen mapping */
const ROUTE_MAP: Record<string, string> = {
  students: '/screens/student-management',
  registrations: '/screens/principal-registrations',
  payments: '/screens/pop-review',
  'teacher-approval': '/screens/teacher-approval',
  'learner-activity-control': '/screens/principal-learner-activity-control',
  'uniform-orders': '/screens/principal-uniforms',
  stationery: '/screens/principal-stationery',
  'dash-advisor': '/screens/dash-voice?mode=advisor',
  'dash-tutor': '/screens/dash-tutor',
  teachers: '/screens/teacher-management',
  classes: '/screens/class-teacher-management',
  'parent-links': '/screens/principal-parent-requests',
  groups: '/screens/group-management',
  'seat-management': '/screens/principal-seat-management',
  'unpaid-fees': '/screens/finance-control-center?tab=receivables',
  'fee-management': '/screens/finance-control-center?tab=overview',
  'log-expense': '/screens/log-expense',
  'petty-cash-request': '/screens/petty-cash-request',
  aftercare: '/screens/aftercare-admin',
  'browse-lessons': '/screens/teacher-lessons',
  'assign-lessons': '/screens/assign-lesson',
  'assign-playground-activity': '/screens/assign-lesson?mode=activity-only',
  reports: '/screens/principal-reports',
  'family-activity-review': '/screens/family-activity-review',
  activities: '/screens/aftercare-activities',
  calendar: '/screens/calendar-management',
  'weekly-menu': '/screens/principal-menu',
  'year-planner': '/screens/principal-year-planner',
  'ai-year-planner': '/screens/principal-ai-year-planner',
  'daily-program-ai': '/screens/principal-daily-program-planner',
  'room-display-connect': '/screens/room-display-connect',
  'live-lessons': '/screens/start-live-lesson',
  announcements: '/screens/principal-announcement',
  'dash-studio': '/screens/dash-studio',
  'birthday-chart': '/screens/birthday-chart',
  excursions: '/screens/principal-excursions',
  meetings: '/screens/principal-meetings',
  settings: '/screens/school-settings',
  'curriculum-themes': '/screens/principal-curriculum-themes',
  'lesson-templates': '/screens/principal-lesson-templates',
  'weekly-plans': '/screens/principal-weekly-plans',
  timetable: '/screens/timetable-management',
  'staff-leave': '/screens/staff-leave',
  waitlist: '/screens/waitlist-management',
  compliance: '/screens/compliance-dashboard',
  budget: '/screens/budget-management',
  'cleaning-roster': '/screens/cleaning-roster',
};

interface PrincipalQuickActionsProps {
  stats?: {
    pendingRegistrations?: { total: number };
    pendingPayments?: { total: number };
    pendingPOPUploads?: { total: number };
  };
  pendingRegistrationsCount?: number;
  pendingPaymentsCount?: number;
  pendingPOPUploadsCount?: number;
  pendingTeacherApprovalsCount?: number;
  collapsedSections: Set<string>;
  onToggleSection: (sectionId: string, isCollapsed?: boolean) => void;
  onAction?: (actionId: string) => void;
  resolvedSchoolType?: ResolvedSchoolType;
  organizationId?: string | null;
  hideFinancialActions?: boolean;
}

export const PrincipalQuickActions: React.FC<PrincipalQuickActionsProps> = ({
  stats,
  pendingRegistrationsCount = 0,
  pendingPaymentsCount = 0,
  pendingPOPUploadsCount = 0,
  pendingTeacherApprovalsCount = 0,
  collapsedSections,
  onToggleSection,
  onAction,
  resolvedSchoolType = 'preschool',
  organizationId,
  hideFinancialActions = false,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const alert = useAlert();
  const styles = useMemo(() => createQuickActionsStyles(theme), [theme]);
  const flags = getFeatureFlagsSync();
  const canLiveLessons = flags.live_lessons_enabled || flags.group_calls_enabled;
  const lifecycleEnabled = flags.learner_activity_lifecycle_v1 !== false;
  const applyNextGenPolicy = isNextGenDashPolicyEnabled({ organizationId, resolvedSchoolType });

  const registrationsBadge = stats?.pendingRegistrations?.total ?? pendingRegistrationsCount;
  const popBadge = stats?.pendingPOPUploads?.total ?? pendingPOPUploadsCount;
  const unpaidBadge = stats?.pendingPayments?.total ?? pendingPaymentsCount;

  const defaultTab: QuickActionGroup = useMemo(() => {
    if ((popBadge ?? 0) > 0 || (unpaidBadge ?? 0) > 0) return 'money';
    if ((registrationsBadge ?? 0) > 0) return 'people';
    return 'learning';
  }, [popBadge, registrationsBadge, unpaidBadge]);

  const [activeGroup, setActiveGroup] = useState<QuickActionGroup>(defaultTab);

  const groupHint = useMemo(() => {
    const hints: Record<QuickActionGroup, string> = {
      people: t('dashboard.qa.people_hint', { defaultValue: 'Students, teachers, classes, and parent links.' }),
      money: t('dashboard.qa.money_hint', { defaultValue: 'Fees, expenses, and financial tools.' }),
      learning: t('dashboard.qa.learning_hint', { defaultValue: 'Lessons, reports, planning, and calendar.' }),
      more: t('dashboard.qa.more_hint', { defaultValue: 'Announcements, settings, and less-used tools.' }),
    };
    return hints[activeGroup];
  }, [activeGroup, t]);

  // Core shortcuts — badged/high-urgency items. Each appears ONLY here.
  const coreShortcuts = useMemo<ActionItem[]>(() => [
    { id: 'registrations', title: t('dashboard.review_registrations', { defaultValue: 'Registrations' }), icon: 'person-add', color: '#6366F1', badge: registrationsBadge },
    ...(!hideFinancialActions ? [{ id: 'payments', title: t('dashboard.payment_proofs', { defaultValue: 'Proof of Payment' }), icon: 'document-text', color: '#F59E0B', badge: popBadge }] : []),
    { id: 'teacher-approval', title: t('dashboard.approve_teachers', { defaultValue: 'Approve Teachers' }), icon: 'checkmark-circle', color: '#06B6D4', badge: pendingTeacherApprovalsCount },
    { id: 'uniform-orders', title: t('dashboard.uniform_orders', { defaultValue: 'Uniform Orders' }), icon: 'shirt', color: '#0EA5E9' },
    { id: 'stationery', title: t('dashboard.stationery', { defaultValue: 'Stationery' }), icon: 'checkbox', color: '#14B8A6' },
    { id: 'dash-advisor', title: t('dashboard.dash_ai_advisor', { defaultValue: 'Dash AI Advisor' }), icon: 'sparkles', color: '#7C3AED' },
  ], [hideFinancialActions, pendingTeacherApprovalsCount, popBadge, registrationsBadge, t]);

  // Tabbed groups — NO overlap with core shortcuts
  const actionsByGroup = useMemo(() => {
    const groups: Record<QuickActionGroup, ActionItem[]> = {
      people: [
        { id: 'students', title: t('dashboard.manage_students', { defaultValue: 'Students' }), icon: 'school', color: '#6366F1' },
        ...(lifecycleEnabled ? [{ id: 'learner-activity-control', title: t('dashboard.learner_activity_control', { defaultValue: 'Learner Activity' }), icon: 'pulse', color: '#EF4444' }] : []),
        { id: 'teachers', title: t('dashboard.manage_teachers', { defaultValue: 'Teachers' }), icon: 'people', color: '#06B6D4' },
        { id: 'classes', title: t('dashboard.manage_classes', { defaultValue: 'Classes' }), icon: 'library', color: '#14B8A6' },
        { id: 'parent-links', title: t('dashboard.parent_links', { defaultValue: 'Connect Parents' }), icon: 'link', color: '#14B8A6' },
        { id: 'groups', title: t('dashboard.manage_groups', { defaultValue: 'Groups' }), icon: 'people-circle', color: '#14B8A6' },
        { id: 'seat-management', title: t('dashboard.seat_management', { defaultValue: 'Seats' }), icon: 'people-circle', color: '#8B5CF6' },
        { id: 'waitlist', title: t('dashboard.waitlist', { defaultValue: 'Waitlist' }), icon: 'list', color: '#3B82F6' },
        { id: 'staff-leave', title: t('dashboard.staff_leave', { defaultValue: 'Staff Leave' }), icon: 'calendar-outline', color: '#F59E0B' },
        { id: 'cleaning-roster', title: t('dashboard.cleaning_roster', { defaultValue: 'Cleaning Roster' }), icon: 'sparkles-outline', color: '#22C55E' },
      ],
      money: [
        ...(!hideFinancialActions ? [
          { id: 'unpaid-fees', title: t('dashboard.unpaid_fees', { defaultValue: 'Unpaid Fees' }), icon: 'alert-circle', color: '#EF4444', badge: unpaidBadge },
          { id: 'fee-management', title: t('dashboard.fee_management', { defaultValue: 'Fee Management' }), icon: 'wallet', color: '#10B981' },
        ] : []),
        { id: 'log-expense', title: t('dashboard.log_expense', { defaultValue: 'Log Expense' }), icon: 'add-circle', color: '#6366F1' },
        { id: 'petty-cash-request', title: t('dashboard.petty_cash_request', { defaultValue: 'Petty Cash Request' }), icon: 'wallet-outline', color: '#14B8A6' },
        { id: 'aftercare', title: t('dashboard.aftercare_registrations', { defaultValue: 'Aftercare' }), icon: 'school', color: '#8B5CF6' },
        { id: 'budget', title: t('dashboard.budget_management', { defaultValue: 'Budget' }), icon: 'pie-chart', color: '#3B82F6' },
      ],
      learning: [
        { id: 'dash-tutor', title: t('teacher.start_tutor_session', { defaultValue: 'Start Tutor Session' }), icon: 'school', color: '#7C3AED' },
        { id: 'browse-lessons', title: t('dashboard.browse_lessons', { defaultValue: 'Browse Lessons' }), icon: 'book', color: '#F59E0B' },
        { id: 'create-lesson', title: t('dashboard.create_lesson', { defaultValue: 'Create Lesson' }), icon: 'add-circle', color: '#10B981' },
        { id: 'assign-lessons', title: t('dashboard.assign_lessons', { defaultValue: 'Assign Lessons' }), icon: 'paper-plane', color: '#8B5CF6' },
        ...(resolvedSchoolType === 'preschool' ? [{ id: 'assign-playground-activity', title: t('dashboard.assign_playground_activity', { defaultValue: 'Assign Playground Activity' }), icon: 'game-controller', color: '#EC4899' }] : []),
        { id: 'reports', title: t('dashboard.view_reports', { defaultValue: 'Reports' }), icon: 'bar-chart', color: '#8B5CF6' },
        { id: 'family-activity-review', title: t('dashboard.family_activity_review', { defaultValue: 'Family Activity Review' }), icon: 'home', color: '#14B8A6' },
        { id: 'activities', title: t('dashboard.learning_activities', { defaultValue: 'Activities' }), icon: 'game-controller', color: '#EC4899' },
        { id: 'calendar', title: t('dashboard.manage_calendar', { defaultValue: 'Calendar' }), icon: 'calendar', color: '#EC4899' },
        { id: 'weekly-menu', title: t('dashboard.weekly_menu', { defaultValue: 'Weekly Menu' }), icon: 'restaurant', color: '#F97316' },
        { id: 'year-planner', title: t('dashboard.year_planner', { defaultValue: 'Year Planner' }), icon: 'calendar', color: '#3B82F6' },
        { id: 'ai-year-planner', title: t('dashboard.ai_year_planner', { defaultValue: 'AI Year Planner' }), icon: 'sparkles', color: '#8B5CF6' },
        { id: 'daily-program-ai', title: t('dashboard.daily_program_ai', { defaultValue: 'AI Daily Routine' }), icon: 'time', color: '#0891B2' },
        { id: 'room-display-connect', title: t('dashboard.room_display_connect', { defaultValue: 'Room Display' }), icon: 'tv', color: '#8B5CF6' },
        ...(canLiveLessons ? [{ id: 'live-lessons', title: t('dashboard.live_lessons', { defaultValue: 'Live Lessons' }), icon: 'videocam', color: '#EC4899' }] : []),
        { id: 'timetable', title: t('dashboard.timetable', { defaultValue: 'Timetable' }), icon: 'grid', color: '#6366F1' },
      ],
      more: [
        { id: 'announcements', title: t('dashboard.send_announcement', { defaultValue: 'Announcements' }), icon: 'megaphone', color: '#F59E0B' },
        { id: 'dash-studio', title: t('dashboard.dash_studio', { defaultValue: 'Dash Studio' }), icon: 'sparkles', color: '#6366F1' },
        { id: 'birthday-chart', title: t('dashboard.birthday_chart', { defaultValue: 'Birthday Chart' }), icon: 'gift', color: '#F472B6' },
        { id: 'excursions', title: t('dashboard.excursions', { defaultValue: 'Excursions' }), icon: 'bus', color: '#10B981' },
        { id: 'meetings', title: t('dashboard.meetings', { defaultValue: 'Meetings' }), icon: 'people', color: '#F59E0B' },
        { id: 'settings', title: t('dashboard.school_settings', { defaultValue: 'School Settings' }), icon: 'settings', color: '#64748B' },
        { id: 'stationery', title: t('dashboard.stationery', { defaultValue: 'Stationery' }), icon: 'checkbox', color: '#14B8A6' },
        { id: 'compliance', title: t('dashboard.compliance', { defaultValue: 'Compliance' }), icon: 'shield-checkmark', color: '#10B981' },
        { id: 'curriculum-themes', title: t('dashboard.curriculum_themes', { defaultValue: 'Curriculum Themes' }), icon: 'book', color: '#6366F1' },
        { id: 'lesson-templates', title: t('dashboard.lesson_templates', { defaultValue: 'Lesson Templates' }), icon: 'document-text', color: '#14B8A6' },
        { id: 'weekly-plans', title: t('dashboard.weekly_plans', { defaultValue: 'Weekly Plans' }), icon: 'list', color: '#64748B' },
      ],
    };

    if (applyNextGenPolicy) {
      (Object.keys(groups) as QuickActionGroup[]).forEach((key) => {
        groups[key] = groups[key].filter((a) => isDashboardActionAllowed('principal', resolvedSchoolType, a.id));
      });
    }
    return groups;
  }, [applyNextGenPolicy, canLiveLessons, hideFinancialActions, lifecycleEnabled, resolvedSchoolType, t, unpaidBadge]);

  const handleActionPress = (actionId: string) => {
    onAction?.(actionId);

    // create-lesson has conditional routing based on school type
    if (actionId === 'create-lesson') {
      router.push(resolvedSchoolType === 'k12_school' ? '/screens/ai-lesson-generator' : '/screens/preschool-lesson-generator');
      return;
    }

    const route = ROUTE_MAP[actionId];
    if (route) {
      router.push(route as any);
    } else {
      alert.show(
        t('common.coming_soon', { defaultValue: 'Coming Soon' }),
        t('common.feature_in_development', { defaultValue: 'This feature is coming soon.' }),
        [{ text: t('common.close', { defaultValue: 'Close' }), style: 'cancel' }],
        { type: 'info' },
      );
    }
  };

  return (
    <CollapsibleSection
      title={t('dashboard.quick_actions', { defaultValue: 'Quick Actions' })}
      sectionId="quick-actions"
      icon="⚡"
      hint={t('dashboard.hints.principal_quick_actions', { defaultValue: 'Approve, message, and jump to key workflows.' })}
      visualStyle="glass"
      defaultCollapsed={collapsedSections.has('quick-actions')}
      onToggle={onToggleSection}
    >
      <View style={styles.coreGrid}>
        {coreShortcuts.map((action) => (
          <View key={action.id} style={styles.gridItem}>
            <QuickActionCard
              title={action.title}
              icon={action.icon}
              color={action.color}
              badgeCount={action.badge}
              onPress={() => handleActionPress(action.id)}
              variant="glass"
            />
          </View>
        ))}
      </View>

      <View style={styles.groupTabs}>
        {([
          { id: 'people' as const, label: t('dashboard.qa.people', { defaultValue: 'People' }) },
          { id: 'money' as const, label: t('dashboard.qa.money', { defaultValue: 'Money' }) },
          { id: 'learning' as const, label: t('dashboard.qa.learning', { defaultValue: 'Learning' }) },
          { id: 'more' as const, label: t('dashboard.qa.more', { defaultValue: 'More' }) },
        ]).map((tab) => {
          const active = activeGroup === tab.id;
          return (
            <TouchableOpacity key={tab.id} style={[styles.groupTab, active && styles.groupTabActive]} onPress={() => setActiveGroup(tab.id)} activeOpacity={0.85}>
              <Text style={[styles.groupTabText, active && styles.groupTabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.groupHint}>{groupHint}</Text>

      <View style={styles.actionsGrid}>
        {(actionsByGroup[activeGroup] || []).map((action) => (
          <View key={action.id} style={styles.gridItem}>
            <QuickActionCard
              title={action.title}
              icon={action.icon}
              color={action.color}
              badgeCount={action.badge}
              onPress={() => handleActionPress(action.id)}
              variant="glass"
            />
          </View>
        ))}
      </View>
    </CollapsibleSection>
  );
};

export default PrincipalQuickActions;
