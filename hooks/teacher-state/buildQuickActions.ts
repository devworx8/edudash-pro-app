import type { TFunction } from 'i18next';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { isDashboardActionAllowed } from '@/lib/dashboard/dashboardPolicy';
import {
  TEACHER_ROUTES,
  TEACHER_QUICK_ACTIONS,
  getTeacherRouteForSchoolType,
  resolveRouteColor,
} from '@/lib/constants/teacherRoutes';
import type { ResolvedSchoolType } from '@/lib/schoolTypeResolver';
import type { TeacherQuickAction } from './types';

/**
 * Build the ordered quick-actions array for the teacher dashboard.
 */
export const buildQuickActions = (
  t: TFunction,
  theme: any,
  tier: string,
  isPreschool: boolean,
  resolvedSchoolType: ResolvedSchoolType,
  handleQuickAction: (action: string) => void,
): TeacherQuickAction[] => {
  const flags = getFeatureFlagsSync();
  const canLiveLessons = flags.live_lessons_enabled || flags.group_calls_enabled;
  const actionKeys = TEACHER_QUICK_ACTIONS.filter((actionKey) => {
    if (actionKey === 'start_live_lesson' && !canLiveLessons) return false;
    if (actionKey === 'call_parent' && !(flags.voice_calls_enabled || flags.video_calls_enabled)) return false;
    if (actionKey === 'quick_lesson' && !isPreschool) return false;
    if (!isDashboardActionAllowed('teacher', resolvedSchoolType, actionKey)) return false;
    return true;
  });

  return actionKeys
    .map((actionKey): TeacherQuickAction | null => {
      const route = TEACHER_ROUTES[actionKey];
      if (!route) return null;
      const resolvedPath = getTeacherRouteForSchoolType(actionKey, resolvedSchoolType);

      return {
        title: t(route.titleKey, { defaultValue: route.title }),
        icon: route.icon,
        color: resolveRouteColor(route.color, theme),
        path: resolvedPath as string,
        onPress: () => handleQuickAction(actionKey),
        disabled: !!(route.requiresPremium && tier === 'free'),
        category: route.category,
        id: actionKey,
      };
    })
    .filter((a): a is TeacherQuickAction => a !== null);
};
