import { useCallback, useEffect, useState } from 'react';
import { Platform, Linking } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { fetchDashboardData } from './fetchDashboardData';
import { useAIControl } from './useAIControl';
import type {
  DashboardStats, RecentAlert, SystemStatus, FeatureFlag, QuickAction,
  ShowAlertFn, UseSuperAdminDashboardReturn, AlertSeverity,
} from './types';

export type { UseSuperAdminDashboardReturn, ShowAlertFn, AlertSeverity };
export type { PasswordModalState, DashboardStats, RecentAlert, SystemStatus, FeatureFlag, QuickAction } from './types';

const SENTRY_ISSUES_URL = process.env.EXPO_PUBLIC_SENTRY_ISSUES_URL || 'https://sentry.io';

/** Build the quick-actions list (badges depend on live stats) */
function buildQuickActions(stats: DashboardStats | null): QuickAction[] {
  return [
    { id: 'platform-command-center', title: 'Platform Command Center', description: 'KPI metrics, error heatmap, incidents & health', icon: 'grid', route: '/screens/super-admin-platform-command-center', color: '#8b5cf6', badge: stats?.pending_issues || 0 },
    { id: 'sentry-errors', title: 'Sentry / Errors', description: 'View runtime errors and fix priorities', icon: 'bug', route: '/screens/super-admin-dashboard', color: '#ef4444', badge: stats?.pending_issues || 0, externalUrl: SENTRY_ISSUES_URL },
    { id: 'ai-command-center', title: 'Dash AI Command Center', description: 'Admin controls for agentic AI operations', icon: 'flash', route: '/screens/super-admin-ai-command-center', color: '#00f5ff', badge: 0 },
    { id: 'voice-orb', title: 'Voice Orb', description: 'Hands-free voice commands (full screen)', icon: 'mic', route: '/screens/dash-voice?mode=ops', color: '#8b5cf6', badge: 0 },
    { id: 'organizations', title: 'Organizations', description: 'View & manage all registered organizations', icon: 'business', route: '/screens/super-admin-organizations', color: '#10b981', badge: stats?.total_organizations || 0 },
    { id: 'school-onboarding', title: 'School Onboarding', description: 'Create and onboard new schools', icon: 'school', route: '/screens/super-admin/school-onboarding-wizard', color: '#00f5ff', badge: 0 },
    { id: 'users', title: 'User Management', description: 'Manage users, roles, and permissions', icon: 'people', route: '/screens/super-admin-users', color: '#3b82f6', badge: stats?.pending_issues || 0 },
    { id: 'admin-management', title: 'Admin Management', description: 'Create and manage admin users', icon: 'people-circle', route: '/screens/super-admin-admin-management', color: '#6366f1' },
    { id: 'ai-quotas', title: 'Dash AI Quota Management', description: 'Monitor and manage Dash AI usage quotas', icon: 'hardware-chip', route: '/screens/super-admin-ai-quotas', color: '#10b981' },
    { id: 'ai-usage', title: 'AI Usage', description: 'Monthly chat + daily image usage', icon: 'stats-chart', route: '/screens/super-admin-ai-usage', color: '#f59e0b' },
    { id: 'content-moderation', title: 'Content Moderation', description: 'Review and moderate user content', icon: 'shield-checkmark', route: '/screens/super-admin-moderation', color: '#f59e0b' },
    { id: 'announcements', title: 'Announcements', description: 'Broadcast messages to all schools', icon: 'megaphone', route: '/screens/super-admin-announcements', color: '#ec4899' },
    { id: 'whatsapp-integration', title: 'WhatsApp Hub', description: 'Manage WhatsApp communications', icon: 'logo-whatsapp', route: '/screens/super-admin-whatsapp', color: '#25d366' },
    { id: 'system-monitoring', title: 'System Monitoring', description: 'View system health and performance', icon: 'analytics', route: '/screens/super-admin-system-monitoring', color: '#f59e0b' },
    { id: 'devops', title: 'DevOps & Integrations', description: 'GitHub, EAS, Vercel, Claude & Campaigns', icon: 'git-branch', route: '/screens/super-admin-devops', color: '#059669' },
    { id: 'team-chat', title: 'Team Chat', description: 'Internal team messaging & channels', icon: 'chatbubbles', route: '/screens/super-admin-team-chat', color: '#6366f1' },
    { id: 'content-studio', title: 'Content Studio', description: 'Create social posts, emails & campaigns', icon: 'create', route: '/screens/super-admin-content-studio', color: '#ec4899' },
    { id: 'team-activity', title: 'Team Activity', description: 'Platform team actions & audit log', icon: 'time', route: '/screens/super-admin-team-activity', color: '#14b8a6' },
    { id: 'system-test', title: 'System Tests', description: 'Run comprehensive system validation', icon: 'checkmark-circle', route: '/screens/super-admin-system-test', color: '#8b5cf6' },
  ];
}

export function getAlertColor(severity: AlertSeverity): string {
  const colors: Record<AlertSeverity, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
  return colors[severity] ?? '#6b7280';
}

export function formatAlertTime(timestamp: string): string {
  const diffMins = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hr ago`;
  return `${Math.floor(diffMins / 1440)} day ago`;
}

export function useSuperAdminDashboard(showAlert: ShowAlertFn): UseSuperAdminDashboardReturn {
  const { user, profile, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<RecentAlert[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);

  const ai = useAIControl({ userId: user?.id, userEmail: user?.email, role: profile?.role, showAlert });

  const loadDashboard = useCallback(async () => {
    if (!isSuperAdmin(profile?.role)) return;
    try {
      setLoading(true);
      const result = await fetchDashboardData();
      setDashboardStats(result.stats);
      setSystemStatus(result.systemStatus);
      setRecentAlerts(result.alerts);
      setFeatureFlags(result.featureFlags);
    } catch (error) {
      logger.error('[SuperAdminDashboard] Failed to fetch dashboard data:', error);
      setDashboardStats({
        total_users: 0, active_users: 0, total_organizations: 0,
        active_seats: 0, monthly_revenue: 0, ai_usage_cost: 0,
        system_health: 'degraded', pending_issues: 1,
      });
      setRecentAlerts([{
        id: 'error', message: 'Failed to load dashboard data - check connection',
        severity: 'high', timestamp: new Date().toISOString(),
      }]);
      showAlert({
        title: 'Dashboard Error',
        message: 'Unable to load dashboard data. Please check your connection and try again.',
        type: 'error',
        buttons: [
          { text: 'Retry', onPress: () => { loadDashboard(); } },
          { text: 'Cancel', style: 'cancel' },
        ],
      });
    } finally {
      setLoading(false);
    }
  }, [profile?.role, showAlert]);

  useEffect(() => {
    loadDashboard();
    ai.loadAIControl(true);
    if (user?.id) {
      track('edudash.superadmin.dashboard_opened', { user_id: user.id, platform: Platform.OS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDashboard, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDashboard(), ai.loadAIControl(true)]);
    setRefreshing(false);
  }, [loadDashboard, ai.loadAIControl]);

  const handleQuickAction = useCallback((action: QuickAction) => {
    track('edudash.superadmin.quick_action', { user_id: user?.id, action_id: action.id, route: action.route });
    if (action.externalUrl) {
      Linking.openURL(action.externalUrl).catch(() => {});
      return;
    }
    router.push(action.route as any);
  }, [user?.id]);

  const quickActions = buildQuickActions(dashboardStats);

  return {
    user, profile, authLoading, profileLoading,
    loading, refreshing, dashboardStats, systemStatus, recentAlerts, featureFlags, quickActions,
    ...ai,
    onRefresh, handleQuickAction,
    getAlertColor, formatAlertTime,
  };
}
