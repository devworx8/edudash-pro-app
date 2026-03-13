/**
 * K-12 Parent Dashboard Screen
 *
 * Thin shell that composes modular dashboard sections.
 * Routes here when: profile.organization_membership.school_type is one of:
 * - k12, k12_school, combined, primary, secondary, community_school
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth, usePermissions } from '@/contexts/AuthContext';
import { K12ThemeOverrideProvider, useNextGenTheme } from '@/contexts/K12NextGenThemeContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAds } from '@/contexts/AdsContext';
import { PLACEMENT_KEYS } from '@/lib/ads/placements';
import AdBannerWithUpgrade from '@/components/ui/AdBannerWithUpgrade';
import SubscriptionAdGate from '@/components/ui/SubscriptionAdGate';
import { useTranslation } from 'react-i18next';
import { track } from '@/lib/analytics';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { trackK12ParentQuickwinsRendered } from '@/lib/ai/trackingEvents';
import { hasCapability, getRequiredTier, type Tier } from '@/lib/ai/capabilities';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { resolveEffectiveTier } from '@/lib/tiers/resolveEffectiveTier';
import { useNotificationBadgeCount } from '@/hooks/useNotificationCount';
import { nextGenK12Parent } from '@/contexts/theme/nextGenK12Parent';

import { styles } from '@/domains/k12/components/K12ParentDashboard.styles';
import { ChildCard } from '@/domains/k12/components/K12ParentChildCard';
import { K12ParentHeroCard } from '@/domains/k12/components/K12ParentHeroCard';
import { K12ParentUrgentBanner } from '@/domains/k12/components/K12ParentUrgentBanner';
import { K12ParentQuickActions } from '@/domains/k12/components/K12ParentQuickActions';
import { K12ParentLearningHub } from '@/domains/k12/components/K12ParentLearningHub';
import { K12ParentActivityFeed } from '@/domains/k12/components/K12ParentActivityFeed';
import { useK12ParentDashboard, toUuidOrUndefined } from '@/domains/k12/hooks/useK12ParentDashboard';
import { MobileNavDrawer } from '@/components/navigation/MobileNavDrawer';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import { PremiumCosmicOrb } from '@/components/dash-orb/PremiumCosmicOrb';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import {
  K12_PARENT_ACTIONS,
  buildK12ParentActionTarget,
  type K12ParentActionId,
} from '@/lib/navigation/k12ParentActionMap';

function K12ParentDashboardContent({ quickWinsEnabled }: { quickWinsEnabled: boolean }) {
  const { profile, user, loading: authLoading, profileLoading } = useAuth();
  const permissions = usePermissions();
  const { theme } = useNextGenTheme();
  const { t } = useTranslation();
  const { tier } = useSubscription();
  const { maybeShowInterstitial } = useAds();
  const { showAlert, alertProps } = useAlertModal();
  const params = useLocalSearchParams<{ schoolType?: string; mode?: string }>();
  const notificationCount = useNotificationBadgeCount();
  const effectiveTier = useMemo(
    () => resolveEffectiveTier({
      role: String(profile?.role || 'parent'),
      profileTier: String((profile as any)?.subscription_tier || '').trim() || null,
      candidates: [tier],
    }).rawTier,
    [profile, tier]
  );

  const [refreshing, setRefreshing] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const userName = profile?.full_name || profile?.email?.split('@')[0] || t('roles.parent', { defaultValue: 'Parent' });
  const p = profile as unknown as Record<string, unknown> | undefined;
  const orgMembership = p?.organization_membership as Record<string, string> | undefined;
  const organizationId: string | undefined =
    orgMembership?.organization_id
    ?? (p?.organization_id as string | undefined)
    ?? (p?.preschool_id as string | undefined);
  const schoolType = params.schoolType
    || orgMembership?.school_type
    || 'k12';

  const canView = permissions?.hasRole ? permissions.hasRole('parent') : true;
  const hasAccess = permissions?.can ? permissions.can('access_mobile_app') : true;

  const {
    children,
    activeChild,
    activeChildIndex,
    switchChild,
    dashboardSummary,
    urgentItems,
    recentUpdates,
    upcomingEvents,
    recentLearningCompletions,
    dataLoading,
    fetchChildrenData,
    hasExamEligibleChild,
    getGradeNumber,
  } = useK12ParentDashboard(profile?.id, user?.id, organizationId);

  const tierBadgeLabel = useMemo(() => {
    const normalizedTier = normalizeTierName(
      String(effectiveTier || 'free'),
    );
    return `Tier: ${normalizedTier.charAt(0).toUpperCase() + normalizedTier.slice(1)}`;
  }, [effectiveTier]);

  const tierForCaps: Tier = getCapabilityTier(normalizeTierName(effectiveTier || 'free'));
  const canShowExamPrep = hasExamEligibleChild;
  const canUseExamPrep = hasCapability(tierForCaps, 'exam.practice') && canShowExamPrep;
  const requiredExamTier = getRequiredTier('exam.practice');

  // ── Effects ──
  useEffect(() => {
    if (canView && hasAccess && user?.id) {
      track('k12.parent.dashboard_view', { user_id: user.id, school_type: schoolType, tier, platform: Platform.OS });
    }
  }, [canView, hasAccess, user?.id, schoolType, tier]);

  useEffect(() => {
    if (quickWinsEnabled) {
      trackK12ParentQuickwinsRendered({ route: '/(k12)/parent/dashboard', userId: user?.id || null });
    }
  }, [quickWinsEnabled, user?.id]);

  // Show interstitial ad after dashboard loads (with delay to not disrupt UX)
  useEffect(() => {
    if (authLoading || profileLoading || !user?.id || !canView || !hasAccess) return;
    const timer = setTimeout(async () => {
      try {
        await maybeShowInterstitial(PLACEMENT_KEYS.INTERSTITIAL_K12_PARENT_DASHBOARD_ENTER);
      } catch { /* rate-limited or not eligible — silent */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [authLoading, profileLoading, user?.id, canView, hasAccess, maybeShowInterstitial]);

  useEffect(() => {
    if (profile?.id && !authLoading && !profileLoading) fetchChildrenData();
  }, [profile?.id, authLoading, profileLoading, fetchChildrenData]);

  const hasRedirectedRef = useRef(false);
  useEffect(() => {
    if (hasRedirectedRef.current) return;
    if (!authLoading && !profileLoading) {
      if (!user?.id) { hasRedirectedRef.current = true; router.replace('/(auth)/sign-in'); return; }
      if (!canView || !hasAccess) { hasRedirectedRef.current = true; router.replace('/profiles-gate' as never); return; }
    }
  }, [authLoading, profileLoading, user?.id, canView, hasAccess]);

  // ── Callbacks ──
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    track('k12.parent.dashboard_refresh', { user_id: user?.id });
    await fetchChildrenData();
    setRefreshing(false);
  }, [user?.id, fetchChildrenData]);

  const pushAction = useCallback(
    (actionId: K12ParentActionId, actionParams?: Record<string, string | number | boolean | undefined>) => {
      router.push(buildK12ParentActionTarget(actionId, actionParams) as never);
    },
    [],
  );

  const handleQuickAction = useCallback((actionId: K12ParentActionId) => {
    track('k12.parent.quick_action_tap', { action: actionId, user_id: user?.id });
    pushAction(actionId);
  }, [pushAction, user?.id]);

  const openTutorSession = useCallback(() => {
    track('k12.parent.tutor_session_open', { user_id: user?.id });
    pushAction('tutor_session');
  }, [pushAction, user?.id]);

  const handleExamBuilderPress = useCallback(() => {
    if (!canShowExamPrep) {
      showAlert({
        title: t('dashboard.parent.k12.exam_prep.not_ready_title', { defaultValue: 'Exam Builder Not Available Yet' }),
        message: t('dashboard.parent.k12.exam_prep.not_ready_message', { defaultValue: 'Exam Builder is available from Grade 4 and up.' }),
        type: 'warning',
        buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'cancel' }],
      });
      return;
    }
    if (!canUseExamPrep) {
      const tierLabel = requiredExamTier
        ? t(`subscription.${requiredExamTier}`, { defaultValue: requiredExamTier.charAt(0).toUpperCase() + requiredExamTier.slice(1) })
        : t('subscription.starter', { defaultValue: 'Starter' });
      showAlert({
        title: t('dashboard.parent.k12.exam_prep.locked_title', { defaultValue: 'Exam Prep Locked' }),
        message: t('dashboard.parent.k12.exam_prep.locked_message', { defaultValue: 'Exam Prep requires {{tier}} plan or higher.', tier: tierLabel }),
        type: 'warning',
        buttons: [
          { text: t('common.not_now', { defaultValue: 'Not now' }), style: 'cancel' },
          { text: t('common.upgrade', { defaultValue: 'Upgrade' }), onPress: () => pushAction('subscription_setup') },
        ],
      });
      return;
    }
    track('k12.parent.exam_builder_open', { user_id: user?.id });
    const gradeNum = activeChild ? getGradeNumber(activeChild.grade) : 0;
    const gradeParam = gradeNum >= 4 ? `grade_${gradeNum}` : '';
    const safeStudentId = toUuidOrUndefined(activeChild?.id);
    const safeClassId = toUuidOrUndefined(activeChild?.classId);
    const safeSchoolId = toUuidOrUndefined(organizationId);
    pushAction('exam_builder', gradeParam ? { grade: gradeParam, childName: activeChild?.name || '', studentId: safeStudentId, classId: safeClassId, schoolId: safeSchoolId } : undefined);
  }, [canShowExamPrep, canUseExamPrep, requiredExamTier, showAlert, t, user?.id, activeChild, pushAction, organizationId, getGradeNumber]);

  const navItems = useMemo(() => [
    { id: 'home', label: t('dashboard.parent.nav.dashboard', { defaultValue: 'Dashboard' }), icon: 'home', route: K12_PARENT_ACTIONS.dashboard_home.route },
    { id: 'calculator', label: t('dashboard.parent.nav.calculator', { defaultValue: 'Calculator' }), icon: 'calculator', route: K12_PARENT_ACTIONS.calculator.route },
    { id: 'children', label: t('dashboard.parent.nav.my_children', { defaultValue: 'My Children' }), icon: 'people', route: K12_PARENT_ACTIONS.children.route },
    { id: 'progress', label: t('dashboard.progress', { defaultValue: 'Progress' }), icon: 'ribbon', route: K12_PARENT_ACTIONS.progress.route },
    { id: 'attendance', label: t('dashboard.parent.nav.attendance', { defaultValue: 'Attendance' }), icon: 'calendar-outline', route: K12_PARENT_ACTIONS.attendance.route },
    { id: 'messages', label: t('navigation.messages', { defaultValue: 'Messages' }), icon: 'chatbubbles', route: K12_PARENT_ACTIONS.messages.route },
    { id: 'payments', label: t('dashboard.parent.nav.payments', { defaultValue: 'Payments' }), icon: 'card', route: K12_PARENT_ACTIONS.payments.route },
    { id: 'announcements', label: t('dashboard.parent.nav.announcements', { defaultValue: 'Announcements' }), icon: 'megaphone', route: K12_PARENT_ACTIONS.announcements.route },
    { id: 'menu', label: t('dashboard.parent.nav.weekly_menu', { defaultValue: 'Weekly Menu' }), icon: 'restaurant-outline', route: K12_PARENT_ACTIONS.weekly_menu.route },
    { id: 'daily_program', label: t('dashboard.parent.nav.daily_routine', { defaultValue: 'Daily Routine' }), icon: 'time', route: K12_PARENT_ACTIONS.daily_program.route },
    { id: 'reports', label: t('dashboard.parent.k12.weekly_reports', { defaultValue: 'Weekly Reports' }), icon: 'stats-chart', route: K12_PARENT_ACTIONS.weekly_report.route },
    { id: 'timetable', label: t('dashboard.parent.nav.timetable', { defaultValue: 'Timetable' }), icon: 'time', route: K12_PARENT_ACTIONS.timetable.route },
    { id: 'exam_history', label: t('dashboard.parent.nav.my_exams', { defaultValue: 'My Exams & Scores' }), icon: 'bar-chart', route: K12_PARENT_ACTIONS.exam_history.route },
    { id: 'groups', label: t('dashboard.parent.nav.groups', { defaultValue: 'Groups' }), icon: 'people-circle', route: K12_PARENT_ACTIONS.groups.route },
    { id: 'documents', label: t('dashboard.parent.nav.documents', { defaultValue: 'Documents' }), icon: 'document-attach', route: K12_PARENT_ACTIONS.documents.route },
    { id: 'account', label: t('navigation.account', { defaultValue: 'Account' }), icon: 'person-circle', route: K12_PARENT_ACTIONS.account.route },
    { id: 'settings', label: t('navigation.settings', { defaultValue: 'Settings' }), icon: 'settings', route: K12_PARENT_ACTIONS.settings.route },
  ], [t]);

  // ── Loading state ──
  if (authLoading || profileLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            {t('dashboard.loading', { defaultValue: 'Loading dashboard...' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Cosmic backdrop (brand identity) */}
      <View pointerEvents="none" style={styles.cosmicBackdrop}>
        <LinearGradient colors={['#070B16', '#0F121E', '#131A2E']} style={styles.cosmicBackdropFill} />
        <View style={[styles.nebulaGlow, styles.nebulaTop]} />
        <View style={[styles.nebulaGlow, styles.nebulaMid]} />
        <View style={[styles.nebulaGlow, styles.nebulaBottom]} />
      </View>

      {/* Fixed Header */}
      <View style={[styles.fixedHeader, { backgroundColor: quickWinsEnabled ? 'rgba(15,18,30,0.82)' : theme.background, borderBottomColor: quickWinsEnabled ? 'rgba(255,255,255,0.08)' : theme.border }]}>
        <View style={styles.headerLeftSection}>
          <Pressable
            style={({ pressed }) => [
              styles.hamburgerButton,
              Platform.OS === 'web' && { cursor: 'pointer' },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setIsDrawerOpen(true)}
            accessibilityLabel={t('dashboard.parent.nav.menu', { defaultValue: 'Menu' })}
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {Platform.OS === 'web' ? (
              <Ionicons name="menu" size={28} color={theme.text} />
            ) : (
              (() => {
                const OrbComponent = tierForCaps === 'premium' || tierForCaps === 'enterprise' 
                  ? PremiumCosmicOrb 
                  : CosmicOrb;
                return <OrbComponent size={30} isProcessing={false} isSpeaking={false} />;
              })()
            )}
          </Pressable>
          <View style={styles.headerTitleWrapper}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>EduDashPro</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.notificationButton} onPress={() => { track('k12.parent.search_tap', { user_id: user?.id }); pushAction('search'); }}>
            <Ionicons name="search-outline" size={22} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.notificationButton} onPress={() => { track('k12.parent.notifications_tap', { user_id: user?.id }); pushAction('notifications'); }}>
            <Ionicons name="notifications-outline" size={24} color={theme.text} />
            {notificationCount > 0 && (
              <View style={[styles.notificationBadge, { backgroundColor: theme.error }]}>
                <Text style={styles.notificationBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileButton} onPress={() => { track('k12.parent.profile_tap', { user_id: user?.id }); pushAction('profile'); }}>
            <LinearGradient colors={quickWinsEnabled ? ['#1B314D', '#305E88'] : ['#F59E0B', '#D97706']} style={styles.profileGradient}>
              <Text style={styles.profileInitial}>{userName.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 0 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <K12ParentHeroCard
          children={children}
          activeChildIndex={activeChildIndex}
          onSwitchChild={switchChild}
          dashboardSummary={dashboardSummary}
          tierBadgeLabel={tierBadgeLabel}
          theme={theme}
        />

        <K12ParentUrgentBanner
          items={urgentItems}
          onPress={(actionRoute) => handleQuickAction(actionRoute as K12ParentActionId)}
          theme={theme}
        />

        {/* Children Cards */}
        <View style={styles.section}>
          {dataLoading ? (
            <EduDashSpinner size="small" color={theme.primary} style={{ marginVertical: 20 }} />
          ) : children.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.surface }]}>
              <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                {t('dashboard.noChildren', { defaultValue: 'No linked children yet' })}
              </Text>
            </View>
          ) : (
            children.map((child) => (
              <ChildCard key={child.id} child={child} colors={theme} onPressChild={(childId) => pushAction('child_detail', { childId })} />
            ))
          )}
        </View>

        <K12ParentQuickActions onActionPress={handleQuickAction} theme={theme} quickWinsEnabled={quickWinsEnabled} />

        {/* Timetable Card */}
        <TouchableOpacity
          style={[styles.section, { marginHorizontal: 16 }]}
          activeOpacity={0.85}
          onPress={() => { track('k12.parent.timetable_tap', { user_id: user?.id }); pushAction('timetable'); }}
        >
          <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="calendar" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('dashboard.parent.timetable', { defaultValue: "Today's Timetable" })}</Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}>{t('dashboard.parent.timetable_hint', { defaultValue: 'View class schedule, subjects & teachers' })}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

        <K12ParentLearningHub
          leadChildName={dashboardSummary.activeChildName}
          onOpenTutor={openTutorSession}
          onExamBuilder={handleExamBuilderPress}
          onExamHistory={() => { track('k12.parent.exam_history_tap', { user_id: user?.id }); pushAction('exam_history'); }}
          onHomework={() => handleQuickAction('homework')}
          canShowExamPrep={canShowExamPrep}
          quickWinsEnabled={quickWinsEnabled}
          theme={theme}
        />

        <K12ParentActivityFeed
          recentUpdates={recentUpdates}
          recentLearningCompletions={recentLearningCompletions}
          upcomingEvents={upcomingEvents}
          onSeeAll={() => { track('k12.parent.see_all_updates_tap', { user_id: user?.id }); pushAction('see_all_activity'); }}
          onEventPress={(eventId, eventDate) => { track('k12.parent.event_tap', { eventId, user_id: user?.id }); pushAction('event_detail', { date: eventDate }); }}
          theme={theme}
          quickWinsEnabled={quickWinsEnabled}
        />

        {/* Banner Ad — free tier users only */}
        <SubscriptionAdGate>
          <AdBannerWithUpgrade
            screen="k12_parent_dashboard"
            showUpgradeCTA={true}
            margin={8}
          />
        </SubscriptionAdGate>
      </ScrollView>

      <AlertModal {...alertProps} />
      <MobileNavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} navItems={navItems} />
    </SafeAreaView>
  );
}

export default function K12ParentDashboardScreen() {
  const flags = getFeatureFlagsSync();
  const quickWinsEnabled = flags.k12_parent_quickwins_v1;

  if (!quickWinsEnabled) {
    return <K12ParentDashboardContent quickWinsEnabled={false} />;
  }

  return (
    <K12ThemeOverrideProvider override={nextGenK12Parent}>
      <K12ParentDashboardContent quickWinsEnabled />
    </K12ThemeOverrideProvider>
  );
}
