/**
 * useNewEnhancedTeacherState — State management hook for the Teacher Dashboard.
 * Modular subfolder: types, greetingUtils, buildMetrics, buildQuickActions.
 */

import { useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlert } from '@/components/ui/StyledAlert';
import Feedback from '@/lib/feedback';
import { track } from '@/lib/analytics';
import { normalizePersonName } from '@/lib/utils/nameUtils';
import { resolveSchoolTypeFromProfile } from '@/lib/schoolTypeResolver';
import { TEACHER_ROUTES, getTeacherRoute, getTeacherRouteForSchoolType } from '@/lib/constants/teacherRoutes';

import type { TeacherQuickAction } from './types';
import { getGreeting, getContextualSubtitle } from './greetingUtils';
import { buildMetrics } from './buildMetrics';
import { buildQuickActions } from './buildQuickActions';

export type { TeacherQuickAction } from './types';

export const useNewEnhancedTeacherState = () => {
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const alert = useAlert();
  const { tier } = useSubscription();
  const [refreshing, setRefreshing] = useState(false);

  const normalizedName = normalizePersonName({
    first: profile?.first_name || user?.user_metadata?.first_name,
    last: profile?.last_name || user?.user_metadata?.last_name,
    full: profile?.full_name || user?.user_metadata?.full_name,
  });
  const teacherName = normalizedName.shortName || 'Teacher';

  const resolvedSchoolType = resolveSchoolTypeFromProfile(profile);
  const isPreschool = resolvedSchoolType === 'preschool';

  const handleRefresh = async (refresh: () => Promise<void>) => {
    setRefreshing(true);
    try {
      await refresh();
      await Feedback.vibrate(10);
    } catch (error) {
      if (__DEV__) console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleQuickAction = (action: string) => {
    track('teacher.dashboard.quick_action', { action, layout: 'enhanced', isPreschool, resolvedSchoolType });

    const routeConfig = TEACHER_ROUTES[action as keyof typeof TEACHER_ROUTES];

    if (!routeConfig) {
      alert.show(
        t('common.coming_soon', { defaultValue: 'Coming Soon' }),
        t('dashboard.feature_coming_soon', { defaultValue: 'This feature is coming soon.' }),
        [{ text: t('common.close', { defaultValue: 'Close' }), style: 'cancel' }],
        { type: 'info' },
      );
      return;
    }

    if (routeConfig.requiresPremium && tier === 'free') {
      alert.show(
        t('subscription.premium_required', { defaultValue: 'Premium Required' }),
        t('subscription.upgrade_for_feature', { defaultValue: 'Upgrade your plan to access this feature.' }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { text: t('subscription.upgrade', { defaultValue: 'Upgrade' }), onPress: () => router.push('/pricing') },
        ],
        { type: 'warning' },
      );
      return;
    }

    const routePath = getTeacherRouteForSchoolType(action as keyof typeof TEACHER_ROUTES, resolvedSchoolType);
    router.push(routePath);
  };

  return {
    user,
    profile,
    theme,
    tier,
    refreshing,
    isPreschool,
    resolvedSchoolType,
    getGreeting: () => getGreeting(t, teacherName),
    getContextualSubtitle: (dashboardData: any) => getContextualSubtitle(t, dashboardData),
    handleRefresh,
    handleQuickAction,
    buildMetrics: (dashboardData: any) => buildMetrics(t, theme, dashboardData),
    buildQuickActions: () => buildQuickActions(t, theme, tier, isPreschool, resolvedSchoolType, handleQuickAction),
    routes: TEACHER_ROUTES,
    getRoute: getTeacherRoute,
  };
};
