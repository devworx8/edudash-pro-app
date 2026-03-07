import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { usePrincipalHub } from '@/hooks/usePrincipalHub';
import { useRecentStudents } from '@/hooks/useRecentStudents';
import { useBirthdayPlanner } from '@/hooks/useBirthdayPlanner';
import { usePrincipalDashboardSections } from '@/hooks/principal/usePrincipalDashboardSections';
import { useFinancePrivacyMode } from '@/hooks/useFinancePrivacyMode';
import { normalizePersonName } from '@/lib/utils/nameUtils';
import { resolveSchoolTypeFromProfile } from '@/lib/schoolTypeResolver';
import { CollapsibleSection } from '@/components/dashboard/shared';
import {
  PrincipalDoNowInbox,
  PrincipalGettingStartedCard,
  PrincipalQuickActions,
  PrincipalSchoolPulse,
  PrincipalDailyOps,
  PrincipalAdmissionsCashflow,
  PrincipalLearnersSection,
} from '@/components/dashboard/principal';
import {
  isPrincipalSectionId,
  type PrincipalSectionConfig,
  type PrincipalSectionId,
} from '@/components/dashboard/principal/sectionTypes';
import type { AttentionPriority } from '@/components/dashboard/shared/SectionAttentionDot';
import TierBadge from '@/components/ui/TierBadge';
import { getApprovalStats } from '@/lib/services/teacherApprovalService';
import { createStyles } from '@/components/dashboard/principal/PrincipalDashboardV2.styles';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';

interface PrincipalDashboardV2Props {
  refreshTrigger?: number;
}

const getAttentionPriority = (
  count: number,
  criticalThreshold = 8,
  importantThreshold = 1
): AttentionPriority => {
  if (count >= criticalThreshold) return 'critical';
  if (count >= importantThreshold) return 'important';
  return 'none';
};

const toAttention = (config: PrincipalSectionConfig) => {
  if (config.attentionPriority === 'none') return undefined;
  return {
    priority: config.attentionPriority,
    count: config.attentionCount,
  };
};

export const PrincipalDashboardV2: React.FC<PrincipalDashboardV2Props> = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const { ready: subscriptionReady } = useSubscription();
  const insets = useSafeAreaInsets();
  const resolvedSchoolType = resolveSchoolTypeFromProfile(profile);

  const { data, loading, refresh } = usePrincipalHub();
  const { hideFeesOnDashboards } = useFinancePrivacyMode();
  const organizationId = profile?.organization_id || profile?.preschool_id || null;

  const {
    students: recentStudents,
    loading: studentsLoading,
    refresh: refreshStudents,
  } = useRecentStudents({ organizationId, limit: 4 });

  const {
    birthdays,
    loading: birthdaysLoading,
    refresh: refreshBirthdays,
  } = useBirthdayPlanner({ preschoolId: organizationId || undefined, daysAhead: 45 });

  const [refreshing, setRefreshing] = useState(false);
  const [pendingTeacherApprovals, setPendingTeacherApprovals] = useState(0);

  const stats = data.stats;

  useEffect(() => {
    if (!organizationId) return;
    getApprovalStats(organizationId)
      .then((s) => setPendingTeacherApprovals(s.pending))
      .catch(() => {});
  }, [organizationId, refreshing]);

  // --- Derived counts ---
  const totalStudents = stats?.students?.total ?? 0;
  const totalTeachers = stats?.staff?.total ?? 0;
  const attendanceRate = stats?.attendanceRate?.percentage ?? 0;
  const attendancePresent = totalStudents > 0
    ? Math.round((attendanceRate / 100) * totalStudents)
    : 0;

  const pendingApplications = stats?.pendingApplications?.total ?? 0;
  const pendingRegistrations = stats?.pendingRegistrations?.total ?? 0;
  const pendingPaymentsRaw = stats?.pendingPayments?.total ?? 0;
  const pendingPaymentsAmountRaw = stats?.pendingPayments?.amount ?? 0;
  const pendingPaymentsOverdueAmountRaw = stats?.pendingPayments?.overdueAmount ?? 0;
  const pendingPOPsRaw = stats?.pendingPOPUploads?.total ?? 0;
  const pendingPayments = hideFeesOnDashboards ? 0 : pendingPaymentsRaw;
  const pendingPaymentsAmount = hideFeesOnDashboards ? 0 : pendingPaymentsAmountRaw;
  const pendingPaymentsOverdueAmount = hideFeesOnDashboards ? 0 : pendingPaymentsOverdueAmountRaw;
  const pendingPOPs = hideFeesOnDashboards ? 0 : pendingPOPsRaw;
  const pendingReports = data.pendingReportApprovals ?? 0;
  const pendingActivities = data.pendingActivityApprovals ?? 0;
  const pendingHomework = data.pendingHomeworkApprovals ?? 0;
  const pendingApprovalsTotal = pendingReports + pendingActivities + pendingHomework;

  const urgentCount = pendingPayments + pendingPOPs + pendingApprovalsTotal;
  const urgentQueueCount = pendingRegistrations + pendingPayments + pendingPOPs + pendingApprovalsTotal;
  const admissionsQueueCount = pendingApplications + pendingRegistrations + pendingPayments + pendingPOPs;
  const upcomingBirthdaysCount =
    (birthdays?.today?.length || 0) +
    (birthdays?.thisWeek?.length || 0) +
    (birthdays?.thisMonth?.length || 0);

  const capacity = data.capacityMetrics?.capacity ?? 0;
  const utilization = data.capacityMetrics?.utilization_percentage ?? (capacity > 0 ? Math.round((totalStudents / capacity) * 100) : 0);

  const uniformSummary = data.uniformPayments;
  const schoolName = profile?.organization_name || data.schoolName || t('dashboard.your_school', { defaultValue: 'Your School' });
  const isYoungEagles = (schoolName || '').toLowerCase().includes('young eagles');
  const showUniformSection = Boolean(
    uniformSummary &&
    (
      uniformSummary.totalStudents > 0 ||
      uniformSummary.paidCount > 0 ||
      uniformSummary.pendingCount > 0 ||
      uniformSummary.pendingUploads > 0 ||
      isYoungEagles
    )
  );

  const openUniformHub = useCallback(() => {
    router.push('/screens/principal-uniforms');
  }, []);

  const messageUnpaidUniformParents = useCallback(() => {
    router.push({ pathname: '/screens/principal-uniforms', params: { autoAction: 'unpaid' } } as any);
  }, []);

  const messageNoOrderParents = useCallback(() => {
    router.push({ pathname: '/screens/principal-uniforms', params: { autoAction: 'no_order' } } as any);
  }, []);

  const {
    collapsedSections,
    toggleSection,
    expandAll,
    collapseAll,
    isHydrated,
  } = usePrincipalDashboardSections({
    userId: user?.id ?? null,
    orgId: organizationId,
    pendingRegistrations,
    pendingPayments,
    pendingPOPs,
    pendingApprovals: pendingApprovalsTotal,
  });

  const lastUpdatedAt = useMemo(() => {
    return stats?.timestamp ? new Date(stats.timestamp) : new Date();
  }, [stats?.timestamp]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.good_morning', { defaultValue: 'Good morning' });
    if (hour < 18) return t('dashboard.good_afternoon', { defaultValue: 'Good afternoon' });
    return t('dashboard.good_evening', { defaultValue: 'Good evening' });
  }, [t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshBirthdays(), refreshStudents()]);
    setRefreshing(false);
  }, [refresh, refreshBirthdays, refreshStudents]);

  const normalizedName = normalizePersonName({
    first: profile?.first_name || user?.user_metadata?.first_name,
    last: profile?.last_name || user?.user_metadata?.last_name,
    full: profile?.full_name || user?.user_metadata?.full_name,
  });
  const userName = normalizedName.fullName || normalizedName.shortName || t('dashboard.principal', { defaultValue: 'Principal' });

  // --- Section configs ---
  const sectionConfigs = useMemo<Record<PrincipalSectionId, PrincipalSectionConfig>>(
    () => ({
      'start-here': {
        id: 'start-here',
        title: t('dashboard.section.start_here.title', { defaultValue: 'Start Here' }),
        hint: t('dashboard.section.start_here.hint', { defaultValue: 'School pulse and setup guidance in one place.' }),
        icon: 'sparkles',
        defaultCollapsed: collapsedSections.has('start-here'),
        attentionPriority: 'none',
        attentionCount: 0,
      },
      'urgent-queue': {
        id: 'urgent-queue',
        title: t('dashboard.section.urgent_queue.title', { defaultValue: 'Urgent Queue' }),
        hint: t('dashboard.section.urgent_queue.hint', { defaultValue: 'Handle priority items first: POPs, unpaid fees, and approvals.' }),
        icon: 'warning-outline',
        defaultCollapsed: collapsedSections.has('urgent-queue'),
        attentionPriority: getAttentionPriority(urgentQueueCount, 10, 1),
        attentionCount: urgentQueueCount,
      },
      'daily-ops': {
        id: 'daily-ops',
        title: t('dashboard.section.daily_ops.title', { defaultValue: 'Daily Ops & Compliance' }),
        hint: t('dashboard.section.daily_ops.hint', { defaultValue: 'Attendance, staffing, and safety checks for today.' }),
        icon: 'shield-checkmark-outline',
        defaultCollapsed: collapsedSections.has('daily-ops'),
        attentionPriority: pendingReports > 0 ? 'action' : 'none',
        attentionCount: pendingReports,
      },
      'admissions-cashflow': {
        id: 'admissions-cashflow',
        title: t('dashboard.section.admissions_cashflow.title', { defaultValue: 'Admissions & Cashflow' }),
        hint: hideFeesOnDashboards
          ? t('dashboard.section.admissions_cashflow.hint_private', { defaultValue: 'Track applications and registrations while fees stay private.' })
          : t('dashboard.section.admissions_cashflow.hint', { defaultValue: 'Track applications, registrations, fees, POPs, and collections.' }),
        icon: 'wallet-outline',
        defaultCollapsed: collapsedSections.has('admissions-cashflow'),
        attentionPriority: getAttentionPriority(admissionsQueueCount, 8, 1),
        attentionCount: admissionsQueueCount,
      },
      'learners-families': {
        id: 'learners-families',
        title: t('dashboard.section.learners_families.title', { defaultValue: 'Learners & Families' }),
        hint: t('dashboard.section.learners_families.hint', { defaultValue: 'Students in focus, birthdays, and parent link requests.' }),
        icon: 'people-outline',
        defaultCollapsed: collapsedSections.has('learners-families'),
        attentionPriority: upcomingBirthdaysCount > 0 ? 'info' : 'none',
        attentionCount: upcomingBirthdaysCount,
      },
      'quick-actions': {
        id: 'quick-actions',
        title: t('dashboard.quick_actions', { defaultValue: 'Quick Actions' }),
        hint: t('dashboard.qa.money_hint', { defaultValue: 'Open common workflows fast.' }),
        icon: 'flash-outline',
        defaultCollapsed: collapsedSections.has('quick-actions'),
        attentionPriority: urgentQueueCount > 0 ? 'action' : 'none',
        attentionCount: urgentQueueCount,
      },
    }),
    [admissionsQueueCount, collapsedSections, hideFeesOnDashboards, pendingReports, t, upcomingBirthdaysCount, urgentQueueCount]
  );

  const handleSectionToggle = useCallback(
    (sectionId: string, isCollapsed: boolean) => {
      if (!isPrincipalSectionId(sectionId)) return;
      toggleSection(sectionId, isCollapsed);
    },
    [toggleSection]
  );

  const handleQuickActionsToggle = useCallback(
    (sectionId: string) => {
      if (!isPrincipalSectionId(sectionId)) return;
      toggleSection(sectionId);
    },
    [toggleSection]
  );

  const styles = useMemo(() => createStyles(theme, insets.top, insets.bottom), [theme, insets.top, insets.bottom]);

  const renderSection = (id: PrincipalSectionId, children: React.ReactNode) => {
    const cfg = sectionConfigs[id];
    return (
      <View style={styles.sectionBlock} key={id}>
        <CollapsibleSection
          title={cfg.title}
          sectionId={cfg.id}
          icon={cfg.icon}
          hint={cfg.hint}
          visualStyle="glass"
          defaultCollapsed={cfg.defaultCollapsed}
          onToggle={handleSectionToggle}
          attention={toAttention(cfg)}
        >
          {children}
        </CollapsibleSection>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.primary + '26', theme.info + '14', theme.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      />
      <View pointerEvents="none" style={styles.backgroundOrbOne} />
      <View pointerEvents="none" style={styles.backgroundOrbTwo} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerTopRow}>
              <Text style={styles.greeting} numberOfLines={1}>
                {greeting}, {userName}
              </Text>
            </View>
            <View style={styles.headerMetaRow}>
              <Text style={styles.schoolName} numberOfLines={1}>{schoolName}</Text>
              {subscriptionReady ? <TierBadge size="sm" showManageButton={false} /> : null}
              {subscriptionReady ? (
                <TouchableOpacity
                  style={styles.manageButton}
                  onPress={() => navigateToUpgrade({ source: 'principal_dashboard_manage' })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.manageButtonText}>{t('common.manage', { defaultValue: 'Manage' })}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.updatedAt} numberOfLines={1}>
              {t('dashboard.updated_at', { defaultValue: 'Updated' })}{' '}
              {lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>

        {/* Layout Controls */}
        <View style={styles.layoutControlsWrap}>
          <Text style={styles.layoutControlsTitle}>
            {t('dashboard.layout_controls', { defaultValue: 'Dashboard layout' })}
          </Text>
          <View style={styles.layoutControlsRow}>
            <TouchableOpacity
              style={[styles.layoutControlButton, !isHydrated && styles.layoutControlButtonDisabled]}
              onPress={expandAll}
              disabled={!isHydrated}
              activeOpacity={0.85}
            >
              <Text style={styles.layoutControlButtonText}>
                {t('dashboard.expand_all', { defaultValue: 'Expand all' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.layoutControlButton, !isHydrated && styles.layoutControlButtonDisabled]}
              onPress={collapseAll}
              disabled={!isHydrated}
              activeOpacity={0.85}
            >
              <Text style={styles.layoutControlButtonText}>
                {t('dashboard.collapse_all_except_urgent', { defaultValue: 'Collapse all (except urgent)' })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Start Here */}
        {renderSection('start-here', (
          <View style={styles.sectionBody}>
            <PrincipalSchoolPulse stats={stats} hideFinanceTiles={hideFeesOnDashboards} />
            <PrincipalGettingStartedCard stats={stats} />
          </View>
        ))}

        {/* Urgent Queue */}
        {renderSection('urgent-queue', (
          <View style={styles.sectionBody}>
            <PrincipalDoNowInbox
              counts={{
                pendingRegistrations,
                pendingPaymentProofs: pendingPOPs,
                pendingUnpaidFees: pendingPayments,
                pendingApprovals: pendingApprovalsTotal,
              }}
              hideFinanceItems={hideFeesOnDashboards}
            />
          </View>
        ))}

        {/* Daily Ops & Compliance */}
        {renderSection('daily-ops', (
          <PrincipalDailyOps
            attendancePresent={attendancePresent}
            totalStudents={totalStudents}
            attendanceRate={attendanceRate}
            totalTeachers={totalTeachers}
            urgentCount={urgentCount}
            pendingPayments={pendingPayments}
            pendingPOPs={pendingPOPs}
            pendingApprovalsTotal={pendingApprovalsTotal}
            pendingReports={pendingReports}
          />
        ))}

        {/* Admissions & Cashflow */}
        {renderSection('admissions-cashflow', (
          <PrincipalAdmissionsCashflow
            pendingApplications={pendingApplications}
            pendingRegistrations={pendingRegistrations}
            pendingPayments={pendingPayments}
            pendingPaymentsAmount={pendingPaymentsAmount}
            pendingPaymentsOverdueAmount={pendingPaymentsOverdueAmount}
            pendingPOPs={pendingPOPs}
            pendingApprovalsTotal={pendingApprovalsTotal}
            monthlyRevenue={stats?.monthlyRevenue?.total}
            utilization={utilization}
            uniformSummary={uniformSummary}
            showUniformSection={showUniformSection}
            isYoungEagles={isYoungEagles}
            onOpenUniforms={openUniformHub}
            onMessageUnpaid={messageUnpaidUniformParents}
            onMessageNoOrder={messageNoOrderParents}
            hideFinancialData={hideFeesOnDashboards}
          />
        ))}

        {/* Learners & Families */}
        {renderSection('learners-families', (
          <PrincipalLearnersSection
            recentStudents={recentStudents}
            studentsLoading={studentsLoading}
            birthdays={birthdays}
            birthdaysLoading={birthdaysLoading}
            organizationId={organizationId}
          />
        ))}

        {/* Quick Actions */}
        <View style={styles.sectionBlock}>
          <PrincipalQuickActions
            stats={data.stats}
            pendingRegistrationsCount={pendingRegistrations}
            pendingPaymentsCount={pendingPayments}
            pendingPOPUploadsCount={pendingPOPs}
            pendingTeacherApprovalsCount={pendingTeacherApprovals}
            collapsedSections={collapsedSections as Set<string>}
            onToggleSection={handleQuickActionsToggle}
            resolvedSchoolType={resolvedSchoolType}
            organizationId={organizationId}
            hideFinancialActions={hideFeesOnDashboards}
          />
        </View>

        {loading && (
          <Text style={styles.loadingText}>
            {t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

export default PrincipalDashboardV2;
