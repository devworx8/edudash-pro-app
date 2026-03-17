/**
 * useParentQuickActions — Quick action definitions + grouping
 * 
 * Extracts the action list, category mapping, and sub-section
 * definitions from the parent dashboard for WARP compliance.
 * 
 * ≤200 lines — WARP-compliant hook.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { isNextGenDashPolicyEnabled } from '@/lib/featureFlags';
import { filterActionsByDashboardPolicy } from '@/lib/dashboard/dashboardPolicy';
import type { ResolvedSchoolType } from '@/lib/schoolTypeResolver';
export type ParentQuickAction = {
  id: string;
  title: string;
  icon: string;
  color: string;
  disabled?: boolean;
  subtitle?: string;
  glow?: boolean;
};
export type ActionSection = {
  id: string;
  title: string;
  icon: string;
};
interface UseParentQuickActionsOptions {
  resolvedSchoolType: ResolvedSchoolType;
  organizationId?: string | null;
  isEarlyLearner: boolean;
  isFeesDueSoon: boolean;
  feesDueSubtitle?: string;
  isDashOrbUnlocked: boolean;
  hasPublishedRoutine?: boolean;
  isDev?: boolean;
}
export function useParentQuickActions(options: UseParentQuickActionsOptions) {
  const { resolvedSchoolType, organizationId, isEarlyLearner, isFeesDueSoon, feesDueSubtitle, isDashOrbUnlocked, hasPublishedRoutine, isDev } = options;
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isK12School = resolvedSchoolType === 'k12_school';
  const applyNextGenPolicy = isNextGenDashPolicyEnabled({
    organizationId,
    resolvedSchoolType,
  });
  const quickActions = useMemo<ParentQuickAction[]>(() => {
    const dashTutorSubtitle = isDashOrbUnlocked
      ? t('parent.dash_tutor_subtitle', { defaultValue: 'Homework help, practice, and explanations.' })
      : t('parent.dash_tutor_locked', { defaultValue: 'Upgrade to unlock Dash Tutor.' });
    const actions: ParentQuickAction[] = [
      { id: 'view_homework', title: t('parent.view_homework', { defaultValue: "My Child's Homework" }), icon: 'book', color: theme.primary },
      { id: 'daily_program', title: t('parent.daily_program', { defaultValue: 'Daily Program' }), icon: 'time-outline', color: '#06B6D4', subtitle: t('parent.daily_program_subtitle', { defaultValue: 'View today\'s school routine and timings' }), glow: hasPublishedRoutine },
      { id: 'weekly_menu', title: t('parent.weekly_menu', { defaultValue: 'Weekly Menu' }), icon: 'restaurant-outline', color: '#F59E0B', subtitle: t('parent.weekly_menu_subtitle', { defaultValue: 'See breakfast, lunch, and snack plans.' }) },
      { id: 'stationery', title: t('parent.stationery', { defaultValue: 'Stationery Checklist' }), icon: 'checkbox-outline', color: '#14B8A6', subtitle: t('parent.stationery_subtitle', { defaultValue: 'Track bought items and what is still needed.' }) },
      { id: 'assigned_lessons', title: t('parent.assigned_lessons', { defaultValue: 'Assigned Lessons' }), icon: 'library', color: '#10B981' },
      { id: 'check_attendance', title: t('parent.check_attendance', { defaultValue: "Today's Attendance" }), icon: 'calendar', color: theme.success },
      { id: 'activity_feed', title: t('parent.activity_feed', { defaultValue: 'Activity Feed' }), icon: 'newspaper', color: '#0EA5E9', subtitle: t('parent.activity_feed_subtitle', { defaultValue: "See today's classroom activities & photos" }) },
      { id: 'family_activity', title: t('parent.family_activity', { defaultValue: 'Family Activity with Dash' }), icon: 'sparkles-outline', color: '#EC4899', subtitle: t('parent.family_activity_subtitle', { defaultValue: 'Get a fun guided home activity.' }) },
      { id: 'upload_progress', title: t('parent.upload_progress', { defaultValue: 'Upload Activity Evidence' }), icon: 'camera-outline', color: '#0EA5E9' },
      { id: 'dash_grade_test', title: t('parent.dash_grade_test', { defaultValue: 'Dash Grade Test Run' }), icon: 'checkmark-done-outline', color: '#8B5CF6' },
      { id: 'view_grades', title: t('parent.view_grades', { defaultValue: 'View Progress' }), icon: 'school', color: theme.secondary },
      { id: 'messages', title: t('parent.messages', { defaultValue: 'Message Teacher' }), icon: 'chatbubbles', color: theme.info },
      { id: 'announcements', title: t('parent.announcements', { defaultValue: 'School Announcements' }), icon: 'megaphone', color: '#F59E0B', subtitle: t('parent.announcements_subtitle', { defaultValue: 'Daily routines, menus & school updates' }) },
      { id: 'events', title: t('parent.events', { defaultValue: 'School Events' }), icon: 'calendar-outline', color: theme.warning },
      { id: 'calls', title: t('parent.calls', { defaultValue: 'Call Teacher' }), icon: 'call', color: '#10B981' },
      { id: 'homework_history', title: t('parent.homework_history', { defaultValue: 'Homework History' }), icon: 'time', color: '#6366F1' },
      { id: 'ai_help', title: t('parent.ai_help', { defaultValue: 'AI Help Hub' }), icon: 'sparkles', color: '#8B5CF6' },
      { id: 'calculator', title: t('parent.calculator', { defaultValue: 'Calculator' }), icon: 'calculator-outline', color: '#0D9488', subtitle: t('parent.calculator_subtitle', { defaultValue: 'Scientific calculator for maths' }) },
      { id: 'generate_image', title: t('parent.generate_image', { defaultValue: 'Generate Image' }), icon: 'image-outline', color: '#2563EB', subtitle: t('parent.generate_image_subtitle', { defaultValue: 'Create learning visuals with Dash.' }) },
      { id: 'my_exams', title: t('parent.my_exams', { defaultValue: 'My Exams' }), icon: 'school', color: '#F59E0B' },
      { id: 'upgrade', title: t('parent.upgrade', { defaultValue: 'Upgrade Plan' }), icon: 'arrow-up-circle', color: '#10B981', subtitle: t('parent.upgrade_subtitle', { defaultValue: 'Unlock premium features' }) },
      { id: 'payments', title: t('parent.payments', { defaultValue: 'Fees & Payments' }), icon: 'card', color: isFeesDueSoon ? theme.warning : '#059669', subtitle: feesDueSubtitle, glow: isFeesDueSoon },
    ];
    if (isDev) {
      actions.push({
        id: 'dev_notifications',
        title: 'Dev Notification Tester',
        icon: 'notifications-outline',
        color: '#06b6d4',
        subtitle: 'Test push + badge',
      });
    }
    if (!isDashOrbUnlocked) {
      actions.push({
        id: 'dash_tutor',
        title: t('parent.dash_tutor', { defaultValue: 'Dash Tutor' }),
        icon: 'sparkles',
        color: '#8B5CF6',
        subtitle: dashTutorSubtitle,
        disabled: true,
      });
    }
    const shouldShowLearningHub = !isK12School || isEarlyLearner;
    if (shouldShowLearningHub) {
      actions.splice(3, 0, {
        id: 'learning_hub',
        title: t('parent.learning_hub', { defaultValue: 'Learning Hub' }),
        icon: 'rocket',
        color: '#0EA5E9',
      });
      actions.splice(4, 0, {
        id: 'dash_playground',
        title: t('parent.dash_playground', { defaultValue: 'Dash Playground' }),
        icon: 'game-controller',
        color: '#8B5CF6',
        subtitle: t('parent.dash_playground_subtitle', { defaultValue: 'Fun activities with counting, letters, shapes & more!' }),
        glow: true,
      });
    }
    let scopedActions = actions;
    if (isEarlyLearner) {
      const hiddenForPreschool = new Set(['view_grades', 'my_exams', 'homework_history']);
      scopedActions = actions.filter((action) => !hiddenForPreschool.has(action.id));
    }
    if (!applyNextGenPolicy) {
      return scopedActions;
    }
    return filterActionsByDashboardPolicy(scopedActions, 'parent', resolvedSchoolType);
  }, [
    applyNextGenPolicy,
    t,
    theme,
    isK12School,
    isEarlyLearner,
    isFeesDueSoon,
    feesDueSubtitle,
    isDashOrbUnlocked,
    hasPublishedRoutine,
    isDev,
    organizationId,
    resolvedSchoolType,
  ]);
  const hasLockedActions = useMemo(() => quickActions.some((a) => a.disabled), [quickActions]);
  // ─── Sub-section headings (Mission Control groups) ─────
  const missionControlSections = useMemo<ActionSection[]>(
    () => [
      { id: 'learning', title: t('parent.actions_missions', { defaultValue: 'Missions' }), icon: 'book-outline' },
      { id: 'communication', title: t('parent.actions_comms', { defaultValue: 'Comms' }), icon: 'chatbubbles-outline' },
      { id: 'payments', title: t('parent.actions_payments', { defaultValue: 'Payments' }), icon: 'card-outline' },
      { id: 'ai', title: t('parent.actions_ai', { defaultValue: 'Dash Intelligence' }), icon: 'sparkles-outline' },
    ],
    [t],
  );
  // ─── Group actions into sections ────────────────────────
  const groupedQuickActions = useMemo(() => {
    const groupMap: Record<string, ParentQuickAction[]> = {
      learning: [],
      communication: [],
      payments: [],
      ai: [],
    };
    const categoryById: Record<string, keyof typeof groupMap> = {
      // ── Missions (Learning) ──────────────────────────────
      view_homework: 'learning',
      daily_program: 'learning',
      weekly_menu: 'learning',
      stationery: 'learning',
      assigned_lessons: 'learning',
      check_attendance: 'learning',
      view_grades: 'learning',
      calculator: 'learning',
      learning_hub: 'learning',
      dash_playground: 'learning',
      family_activity: 'learning',
      upload_progress: 'learning',
      homework_history: 'learning',
      my_exams: 'learning',
      // ── Comms ───────────────────────────────────────────
      messages: 'communication',
      calls: 'communication',
      events: 'communication',
      announcements: 'communication',
      activity_feed: 'communication',
      dev_notifications: 'communication',
      // ── Payments ────────────────────────────────────────
      payments: 'payments',
      upgrade: 'payments',
      // ── Dash Intelligence ───────────────────────────────
      ai_help: 'ai',
      ai_homework_help: 'ai',
      dash_grade_test: 'ai',
      dash_tutor: 'ai',
      generate_image: 'ai',
      ask_dash: 'ai',
      dash_explain: 'ai',
      dash_quiz: 'ai',
      dash_study_plan: 'ai',
    };
    quickActions.forEach((action) => {
      const groupKey = categoryById[action.id] || 'learning';
      groupMap[groupKey].push(action);
    });
    return groupMap;
  }, [quickActions]);
  return {
    quickActions,
    hasLockedActions,
    missionControlSections,
    groupedQuickActions,
  };
}
export default useParentQuickActions;
