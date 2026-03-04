import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { getDashboardRouteForRole } from '@/lib/dashboard/routeMatrix';
import { resolveExplicitSchoolTypeFromProfile, type ResolvedSchoolType } from '@/lib/schoolTypeResolver';
import { useAdminDashboardPack } from '@/hooks/useAdminDashboardPack';
import { useAdminDashboardData } from '@/hooks/useAdminDashboardData';
import { useAdminOperationalSnapshot } from '@/hooks/useAdminOperationalSnapshot';
import { useFinancePrivacyMode } from '@/hooks/useFinancePrivacyMode';
import { AdminWorkflowService } from '@/services/AdminWorkflowService';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import {
  AdminActivityFeed,
  AdminDashboardShell,
  AdminEscalationPanel,
  AdminOperationalSnapshot,
  AdminOperationalInbox,
  AdminTaskPackGrid,
  AdminWorkflowLanes,
} from '@/components/dashboard/admin';
import type { AdminInboxItem, AdminTaskDefinition, AdminWorkflowItem } from '@/lib/dashboard/admin/types';
import { EMPTY_ADMIN_COUNTERS } from '@/lib/dashboard/admin/types';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

function formatOrgTypeLabel(value: string | null): string {
  if (!value) return 'Organization';
  if (value === 'k12_school') return 'K-12';
  if (value === 'preschool') return 'Preschool';
  return value;
}

function getFallbackRouteForRole(
  role?: string | null,
  schoolType?: ResolvedSchoolType | null
): string {
  const normalized = String(role || '').toLowerCase().trim();
  if (schoolType) {
    if (normalized === 'admin') return '/screens/principal-dashboard';
    return (
      getDashboardRouteForRole({
        role: normalized,
        resolvedSchoolType: schoolType,
        hasOrganization: true,
        traceContext: 'AdminDashboard.fallback',
      }) || '/screens/principal-dashboard'
    );
  }
  if (normalized === 'principal' || normalized === 'principal_admin') return '/screens/principal-dashboard';
  if (normalized === 'super_admin' || normalized === 'superadmin') return '/screens/super-admin-dashboard';
  return '/screens/org-admin-dashboard';
}

export default function AdaptiveAdminDashboardScreen() {
  const { user, profile, profileLoading, loading } = useAuth();
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { hideFeesOnDashboards } = useFinancePrivacyMode();

  const [screeningRequestId, setScreeningRequestId] = useState<string | null>(null);

  const navigationAttempted = useRef(false);
  const dataFallbackAttempted = useRef(false);

  const orgId = extractOrganizationId(profile);
  const role = String(profile?.role || '').toLowerCase();
  const isAdminRole = role === 'admin';
  const isStillLoading = loading || profileLoading;
  const explicitSchoolType = resolveExplicitSchoolTypeFromProfile(profile);

  const featureFlags = getFeatureFlagsSync();
  const adaptiveDashboardEnabled = featureFlags.adaptive_admin_dashboard_mobile_v1 !== false;

  const {
    loading: packLoading,
    orgType,
    isSupportedOrgType,
    organizationName,
    pack,
  } = useAdminDashboardPack();
  const safeFallbackRoute = getFallbackRouteForRole(profile?.role, explicitSchoolType || orgType);

  const {
    data: bundle,
    isLoading: bundleLoading,
    isRefetching,
    error: bundleError,
    refetch,
  } = useAdminDashboardData({
    orgId,
    orgType,
    enabled:
      !!orgId &&
      !isStillLoading &&
      isAdminRole &&
      adaptiveDashboardEnabled &&
      isSupportedOrgType &&
      !!pack,
  });

  const {
    data: operationalSnapshot,
    isLoading: operationalSnapshotLoading,
  } = useAdminOperationalSnapshot({
    orgId,
    enabled:
      !!orgId &&
      !isStillLoading &&
      isAdminRole &&
      adaptiveDashboardEnabled &&
      isSupportedOrgType &&
      !!pack,
  });

  useFocusEffect(
    useCallback(() => {
      navigationAttempted.current = false;
      dataFallbackAttempted.current = false;
    }, [])
  );

  useEffect(() => {
    if (isStillLoading || packLoading) return;
    if (navigationAttempted.current) return;

    if (!user) {
      navigationAttempted.current = true;
      try {
        router.replace('/(auth)/sign-in');
      } catch {
        router.replace('/sign-in');
      }
      return;
    }

    if (!orgId) {
      navigationAttempted.current = true;
      router.replace('/screens/org-onboarding');
      return;
    }

    if (!isAdminRole || !adaptiveDashboardEnabled || !isSupportedOrgType || !pack) {
      navigationAttempted.current = true;
      router.replace(safeFallbackRoute as any);
    }
  }, [
    adaptiveDashboardEnabled,
    safeFallbackRoute,
    isAdminRole,
    isStillLoading,
    isSupportedOrgType,
    orgId,
    pack,
    packLoading,
    profile?.role,
    user,
  ]);

  useEffect(() => {
    if (!bundleError || bundleLoading || dataFallbackAttempted.current) return;
    dataFallbackAttempted.current = true;
    router.replace(safeFallbackRoute as any);
  }, [bundleError, bundleLoading, safeFallbackRoute]);

  const handleOpenTask = useCallback((task: AdminTaskDefinition) => {
    router.push(task.route as any);
  }, []);

  const handleOpenLane = useCallback(
    (lane: 'hiring' | 'admissions' | 'finance_ops') => {
      const route = pack?.laneRoutes[lane] || safeFallbackRoute;
      router.push(route as any);
    },
    [pack, safeFallbackRoute]
  );

  const handleOpenWorkflowItem = useCallback((item: AdminWorkflowItem) => {
    if (item.request_type && item.request_id) {
      router.push('/screens/admin/manage-join-requests' as any);
      return;
    }
    router.push(safeFallbackRoute as any);
  }, [safeFallbackRoute]);

  const handleOpenInboxItem = useCallback((item: AdminInboxItem) => {
    if (item.request_type && item.request_id) {
      router.push('/screens/admin/manage-join-requests' as any);
      return;
    }
    router.push(safeFallbackRoute as any);
  }, [safeFallbackRoute]);

  const handleScreenAction = useCallback(
    async (
      item: AdminWorkflowItem,
      status: 'recommended' | 'hold' | 'reject_recommended'
    ) => {
      if (!item.request_id) return;
      setScreeningRequestId(item.request_id);

      const result = await AdminWorkflowService.screenRequest({
        requestId: item.request_id,
        screeningStatus: status,
        notes:
          status === 'recommended'
            ? 'Screened by admin and recommended for principal final decision.'
            : status === 'hold'
            ? 'Screened by admin and put on hold for additional checks.'
            : 'Screened by admin with recommendation to reject.',
        checklist: {
          reviewed_at: new Date().toISOString(),
          source: 'adaptive_admin_dashboard_mobile_v1',
        },
      });

      if (!result.success) {
        showAlert({
          title: 'Screening Failed',
          message: result.error || 'Could not update screening status.',
          type: 'error',
        });
      } else {
        showAlert({
          title: 'Screening Updated',
          message: 'Item routed with your screening recommendation.',
          type: 'success',
        });
        await refetch();
      }

      setScreeningRequestId(null);
    },
    [refetch, showAlert]
  );

  if (isStillLoading || packLoading || (bundleLoading && !bundle)) {
    return (
      <SafeAreaView style={styles.centered}>
        <Stack.Screen options={{ title: 'Admin Dashboard' }} />
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading adaptive admin dashboard...</Text>
      </SafeAreaView>
    );
  }

  if (!bundle || !pack || !orgId || !isAdminRole) {
    return (
      <SafeAreaView style={styles.centered}>
        <Stack.Screen options={{ title: 'Admin Dashboard' }} />
        <Text style={styles.loadingText}>Preparing dashboard...</Text>
        <TouchableOpacity
          style={styles.fallbackButton}
          onPress={() => router.replace(safeFallbackRoute as any)}
        >
          <Text style={styles.fallbackButtonText}>Open Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const visibleTasks = hideFeesOnDashboards
    ? pack.tasks.filter((task) => task.category !== 'finance')
    : pack.tasks;
  const visibleWorkflows = hideFeesOnDashboards
    ? { ...bundle.workflows, finance_ops: [] }
    : bundle.workflows;
  const containsFinanceSignal = (value: string | undefined | null) =>
    /payment|fee|pop|finance|cash|invoice/i.test(String(value || ''));
  const visibleInbox = hideFeesOnDashboards
    ? bundle.inbox.filter((item) => !(
        containsFinanceSignal(item.request_type) ||
        containsFinanceSignal(item.title) ||
        containsFinanceSignal(item.subtitle)
      ))
    : bundle.inbox;
  const visibleEscalations = hideFeesOnDashboards
    ? bundle.escalations.filter((item) => !(
        containsFinanceSignal(item.request_type) ||
        containsFinanceSignal(item.title) ||
        containsFinanceSignal(item.subtitle)
      ))
    : bundle.escalations;
  const visibleActivity = hideFeesOnDashboards
    ? bundle.activity.filter((item) => !(
        containsFinanceSignal(item.request_type) ||
        containsFinanceSignal(item.summary)
      ))
    : bundle.activity;
  const visibleCounters = hideFeesOnDashboards
    ? {
        ...bundle.counters,
        pending_finance: 0,
      }
    : bundle.counters;

  return (
    <>
      <Stack.Screen options={{ title: 'Adaptive Admin Dashboard', headerShown: false }} />
      {/* School admins reuse principal mobile chrome (hamburger, notifications, avatar). */}
      <DesktopLayout role="principal" title={organizationName}>
        <View style={styles.container}>
          <AdminDashboardShell
            orgName={organizationName}
            orgTypeLabel={formatOrgTypeLabel(orgType)}
            counters={visibleCounters || EMPTY_ADMIN_COUNTERS}
            onRefresh={() => {
              refetch();
            }}
            refreshing={isRefetching}
          >
            <View style={styles.birthdayReminderCard}>
              <View style={styles.birthdayReminderTextWrap}>
                <Text style={styles.birthdayReminderTitle}>Birthday Reminders</Text>
                <Text style={styles.birthdayReminderSubtitle}>
                  Open the birthday reminder center and notify parents who still need to contribute.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.birthdayReminderButton}
                onPress={() => router.push('/screens/birthday-donation-reminders' as any)}
              >
                <Text style={styles.birthdayReminderButtonText}>Open</Text>
              </TouchableOpacity>
            </View>
            <AdminOperationalSnapshot
              metrics={operationalSnapshot}
              loading={operationalSnapshotLoading}
              hideFinancialMetrics={hideFeesOnDashboards}
            />
            <AdminOperationalInbox items={visibleInbox} onOpenItem={handleOpenInboxItem} />
            <AdminWorkflowLanes
              workflows={visibleWorkflows}
              laneRoutes={pack.laneRoutes}
              hiddenLanes={hideFeesOnDashboards ? ['finance_ops'] : []}
              screeningRequestId={screeningRequestId}
              onOpenLaneRoute={handleOpenLane}
              onOpenWorkflowItem={handleOpenWorkflowItem}
              onScreenAction={handleScreenAction}
            />
            <AdminTaskPackGrid tasks={visibleTasks} counters={visibleCounters} onOpenTask={handleOpenTask} />
            <AdminEscalationPanel items={visibleEscalations} onOpenItem={handleOpenWorkflowItem} />
            <AdminActivityFeed items={visibleActivity} />
          </AdminDashboardShell>
        </View>
      </DesktopLayout>
      <AlertModal {...alertProps} />
    </>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      paddingHorizontal: 24,
    },
    loadingText: {
      marginTop: 10,
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    fallbackButton: {
      marginTop: 14,
      borderRadius: 10,
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    fallbackButtonText: {
      color: theme.onPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    birthdayReminderCard: {
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    birthdayReminderTextWrap: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    birthdayReminderTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
    },
    birthdayReminderSubtitle: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    birthdayReminderButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    birthdayReminderButtonText: {
      color: theme.onPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
  });
