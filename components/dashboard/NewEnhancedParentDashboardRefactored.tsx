/**
 * New Enhanced Parent Dashboard — Mission Control Edition
 *
 * Modular, WARP-compliant parent dashboard (≤400 lines).
 * State + effects extracted → hooks/useParentDashboardState.ts
 *
 * Features:
 * - Priority elevation + glow on sections needing attention
 * - "Mission Control 🚀" replaces Quick Actions
 * - Extracted: ChildFocusCard, TodayHighlights, MissionControlSection
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { track } from '@/lib/analytics';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useOnboardingHint } from '@/components/ui/OnboardingHint';
import { useUniformEnabled } from '@/hooks/useUniformEnabled';
import { useStationeryEnabled } from '@/hooks/useStationeryEnabled';

// Shared dashboard components
import { MetricCard, CollapsibleSection, SearchBar, GlowContainer } from './shared';
import { ChildSwitcher } from './parent';
import AdBannerWithUpgrade from '@/components/ui/AdBannerWithUpgrade';
import { OnboardingHint } from '@/components/ui/OnboardingHint';

// Extracted parent dashboard modules
import { ChildFocusCard } from './parent/ChildFocusCard';
import { TodayHighlights } from './parent/TodayHighlights';
import { MissionControlSection } from './parent/MissionControlSection';
import { ParentDashboardHeader } from './parent/ParentDashboardHeader';
import { UpgradeBanner } from './parent/UpgradeBanner';
import { ParentDashboardContentSections } from './parent/ParentDashboardContentSections';
import { useParentQuickActions } from '@/hooks/useParentQuickActions';
import { useParentSectionAttention } from '@/hooks/useParentSectionAttention';
import { useParentDashboardNavigation } from '@/hooks/useParentDashboardNavigation';
import { useParentMetrics } from '@/hooks/useParentMetrics';
import { useParentDashboardState } from '@/hooks/useParentDashboardState';
import { usePublishedRoutineStatus } from '@/hooks/usePublishedRoutineStatus';
import { createParentDashboardStyles, getLayoutMetrics } from './parent/ParentDashboard.styles';
import {
  createTempLessonFromSuggestion,
  type TempLessonSuggestion,
} from '@/lib/services/parentTempLessonService';
import { getFeatureFlagsSync } from '@/lib/featureFlags';

interface NewEnhancedParentDashboardProps {
  refreshTrigger?: number;
  focusSection?: string;
}

export const NewEnhancedParentDashboard: React.FC<NewEnhancedParentDashboardProps> = ({
  refreshTrigger,
  focusSection,
}) => {
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getLayoutMetrics(width), [width]);
  const styles = useMemo(() => createParentDashboardStyles(theme, insets.top, insets.bottom, layout), [theme, insets.top, insets.bottom, layout]);

  // Core state + effects + derived data (extracted hook)
  const ds = useParentDashboardState(focusSection);
  const [creatingTempLessonId, setCreatingTempLessonId] = useState<string | null>(null);
  const flags = getFeatureFlagsSync();
  const { uniformEnabled, uniformSchoolIds } = useUniformEnabled(ds.children);
  const { stationeryEnabled, stationerySchoolIds } = useStationeryEnabled(ds.children);
  const [showQuickActionsHint, dismissQuickActionsHint] = useOnboardingHint('parent_quick_actions');
  const [showLiveClassesHint, dismissLiveClassesHint] = useOnboardingHint('parent_live_classes');

  const overviewMetricCardWidth = useMemo(() => {
    const containerWidth = width - (layout.cardPadding * 2);
    // Subtract 4px buffer per card so 2 cards always fit even inside
    // GlowContainer borders (1.5px each side). flexGrow on MetricCard fills the rest.
    return Math.floor((containerWidth - layout.cardGap) / 2) - 4;
  }, [layout, width]);

  // Navigation routing (extracted hook)
  const { handleQuickAction, handlePaymentsPress } = useParentDashboardNavigation({
    activeChild: ds.activeChild,
    children: ds.children,
    showAlert,
  });

  // Metrics + highlights
  const { metrics, todayHighlights } = useParentMetrics({
    dashboardData: ds.dashboardData,
    unreadMessageCount: ds.unreadMessageCount,
    missedCallsCount: ds.missedCallsCount,
    childrenCount: ds.children.length,
    isFeesDueSoon: ds.isFeesDueSoon,
    feesDueSoon: ds.feesDueSoon,
  });

  // Routine status for glow badge
  const routineStatus = usePublishedRoutineStatus(ds.resolvedOrganizationId);

  // Quick Actions
  const { quickActions, hasLockedActions, missionControlSections, groupedQuickActions } = useParentQuickActions({
    resolvedSchoolType: ds.resolvedSchoolType,
    organizationId: ds.resolvedOrganizationId,
    isEarlyLearner: ds.isEarlyLearner,
    isFeesDueSoon: ds.isFeesDueSoon,
    feesDueSubtitle: ds.feesDueSubtitle,
    isDashOrbUnlocked: ds.isDashOrbUnlocked,
    hasPublishedRoutine: routineStatus.hasPublished,
    isDev: __DEV__,
  });

  // Attention system
  const sectionAttention = useParentSectionAttention({
    dashboardData: ds.dashboardData,
    unreadMessageCount: ds.unreadMessageCount,
    missedCallsCount: ds.missedCallsCount,
    feesDueSoon: ds.feesDueSoon,
    upcomingBirthdaysCount: ds.upcomingBirthdaysCount,
  });

  const handleSearch = (query: string) => {
    ds.setSearchQuery(query);
    const match = ds.searchSuggestions.find(s => s.label.toLowerCase().includes(query.toLowerCase()));
    if (match) handleQuickAction(match.id);
  };

  const handleCreateTempLesson = useCallback(async (suggestion: TempLessonSuggestion) => {
    if (!ds.activeChildId) {
      showAlert({
        title: 'No child selected',
        message: 'Select a child first before creating a temporary lesson.',
        type: 'warning',
      });
      return;
    }

    setCreatingTempLessonId(suggestion.id);
    try {
      const assignmentId = await createTempLessonFromSuggestion({
        childId: ds.activeChildId,
        suggestion,
      });
      track('parent.temp_lesson.created', {
        assignmentId,
        activityId: suggestion.activityId,
        domain: suggestion.domain,
      });
      showAlert({
        title: 'Temporary lesson ready',
        message: 'Dash created a 7-day activity. Opening Dash Playground now.',
        type: 'success',
      });
      router.push('/screens/dash-playground');
    } catch (error: any) {
      showAlert({
        title: 'Could not create lesson',
        message: error?.message || 'Please try again in a moment.',
        type: 'error',
      });
    } finally {
      setCreatingTempLessonId(null);
    }
  }, [ds.activeChildId, showAlert]);

  if (ds.loading && !ds.dashboardData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={ds.refreshing} onRefresh={ds.handleRefresh} colors={[theme.primary]} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <ParentDashboardHeader greeting={ds.getGreeting()} tier={ds.tier} />

        <View style={styles.searchSection}>
          <SearchBar
            placeholder="Search..."
            value={ds.searchQuery}
            onChangeText={ds.setSearchQuery}
            onSubmit={handleSearch}
            suggestions={ds.searchSuggestions}
            onSuggestionPress={(s) => handleQuickAction(s.id)}
          />
        </View>

        <ChildSwitcher children={ds.children} activeChildId={ds.activeChildId} onChildChange={ds.setActiveChildId} />

        {ds.activeChildDisplay && (
          <ChildFocusCard
            child={ds.activeChildDisplay}
            onMessageTeacher={() => handleQuickAction('messages')}
            onViewHomework={() => handleQuickAction('view_homework')}
          />
        )}

        <TodayHighlights highlights={todayHighlights} />
        <UpgradeBanner title={ds.upgradeBannerTitle} tier={ds.tier} visible={hasLockedActions} />
        <AdBannerWithUpgrade screen="parent_dashboard" showUpgradeCTA margin={12} />

        {/* Metrics Grid */}
        <GlowContainer urgency={sectionAttention['overview']?.priority ?? 'none'} elevated={sectionAttention['overview']?.priority === 'critical'}>
          <CollapsibleSection title="Today's Overview" sectionId="overview" icon="📊" hint="Attendance, fees, messages, and highlights at a glance." defaultCollapsed={ds.collapsedSections.has('overview')} onToggle={ds.toggleSection} attention={sectionAttention['overview']}>
            <View style={styles.metricsGrid}>
              {metrics.map((metric, i) => (
                <MetricCard key={i} title={metric.title} value={metric.value} icon={metric.icon} color={metric.color} trend={metric.trend} glow={metric.glow} badge={metric.badge} cardWidth={overviewMetricCardWidth} priority={metric.priority as any} onPress={() => { track('parent.dashboard.metric_clicked', { metric: metric.title }); if (metric.action) handleQuickAction(metric.action); }} />
              ))}
            </View>
          </CollapsibleSection>
        </GlowContainer>

        {/* Mission Control */}
        <GlowContainer urgency={sectionAttention['mission-control']?.priority ?? 'none'} elevated={sectionAttention['mission-control']?.priority === 'critical'}>
          <CollapsibleSection title="Mission Control" sectionId="mission-control" icon="🚀" hint="Shortcuts to homework, messages, fees, and Dash Intelligence." defaultCollapsed={ds.collapsedSections.has('mission-control')} onToggle={ds.toggleSection} attention={sectionAttention['mission-control']}>
            {showQuickActionsHint && <OnboardingHint hintId="parent_quick_actions" message="Tap a card below to jump to homework, messages, fees, or Dash Tutor." icon="sparkles" position="bottom" screen="parent_dashboard" onDismiss={dismissQuickActionsHint} />}
            <MissionControlSection sections={missionControlSections} groupedActions={groupedQuickActions} onAction={handleQuickAction} onUpgrade={() => router.push('/screens/subscription-setup' as any)} />
          </CollapsibleSection>
        </GlowContainer>

        <ParentDashboardContentSections
          activeChildId={ds.activeChildId} children={ds.children}
          uniformEnabled={uniformEnabled} uniformSchoolIds={uniformSchoolIds}
          stationeryEnabled={stationeryEnabled} stationerySchoolIds={stationerySchoolIds}
          hasOrganization={ds.hasOrganization} preschoolId={ds.resolvedOrganizationId}
          dashboardData={ds.dashboardData} collapsedSections={ds.collapsedSections}
          toggleSection={ds.toggleSection} sectionAttention={sectionAttention}
          showLiveClassesHint={showLiveClassesHint} dismissLiveClassesHint={dismissLiveClassesHint}
          showQuickActionsHint={showQuickActionsHint}
          parentInsights={ds.parentInsights} parentAlerts={ds.parentAlerts}
          insightsLoading={ds.insightsLoading} insightsError={ds.insightsError}
          hasUrgentInsights={ds.hasUrgentInsights}
          tempLessonSuggestions={ds.tempLessonSuggestions}
          tempLessonSuggestionsLoading={ds.tempLessonSuggestionsLoading}
          tempLessonSuggestionsError={ds.tempLessonSuggestionsError}
          canUseTempLessons={flags.ENABLE_PARENT_TEMP_LESSONS && ds.canUseTempLessons}
          creatingTempLessonId={creatingTempLessonId}
          onCreateTempLesson={handleCreateTempLesson}
          upcomingBirthdays={ds.upcomingBirthdays} birthdaysLoading={ds.birthdaysLoading}
        />

        <AdBannerWithUpgrade screen="parent_dashboard_bottom" showUpgradeCTA={false} margin={16} />
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
};

export default NewEnhancedParentDashboard;
