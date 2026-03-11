/**
 * Learning Hub Screen — Preschool guided activities
 * 
 * Shows tier-gated interactive preschool activities with usage tracking,
 * child switching, and step-by-step activity modal.
 * 
 * ≤500 lines — WARP-compliant screen (uses extracted components & hooks).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useParentDashboard } from '@/hooks/useDashboardData';
import { ChildSwitcher } from '@/components/dashboard/parent';
import { getLearningHubUsage, type LearningHubUsage } from '@/lib/learningHubUsage';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { type TierKey, PRESCHOOL_HUB_ACTIVITIES, TIER_LIMITS } from '@/lib/activities/preschoolLearningHub.data';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { LearningHubActivityModal } from '@/components/learning-hub/LearningHubActivityModal';
import { createLearningHubStyles } from '@/components/learning-hub/LearningHub.styles';
import { useLearningHubActivity } from '@/hooks/useLearningHubActivity';
import { percentWidth } from '@/lib/progress/clampPercent';

// ── Helpers ──────────────────────────────────────────────

const calculateUsagePercent = (used: number, limit: number): number => {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
};

const formatLimit = (limit: number): string =>
  Number.isFinite(limit) ? String(limit) : 'Unlimited';

const normalizeTier = (tierRaw?: string | null): TierKey => {
  const capTier = getCapabilityTier(normalizeTierName(tierRaw || 'free'));
  if (capTier === 'premium' || capTier === 'enterprise') return 'plus';
  if (capTier === 'starter') return 'starter';
  return 'free';
};

// ── Screen ───────────────────────────────────────────────

export default function LearningHubScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { tier } = useSubscription();
  const { data, loading, refresh } = useParentDashboard();

  const tierKey = normalizeTier(tier);
  const limits = TIER_LIMITS[tierKey];

  const [usage, setUsage] = useState<LearningHubUsage>({
    date: '',
    lessonsUsed: 0,
    activitiesUsed: 0,
    aiHintsUsed: 0,
  });

  const [activeChildId, setActiveChildId] = useState<string | null>(null);

  const children = useMemo(() => data?.children || [], [data?.children]);
  const activeChild = useMemo(
    () => children.find((child: any) => child.id === activeChildId) || children[0],
    [children, activeChildId],
  );

  useEffect(() => {
    if (!activeChildId && children.length > 0) {
      setActiveChildId(children[0].id);
    }
  }, [activeChildId, children]);

  useEffect(() => {
    let mounted = true;
    getLearningHubUsage(user?.id).then((result) => {
      if (mounted) setUsage(result);
    });
    return () => { mounted = false; };
  }, [user?.id]);

  const styles = useMemo(
    () => createLearningHubStyles(theme, insets.top, insets.bottom),
    [theme, insets.bottom, insets.top],
  );

  const refreshUsage = useCallback(async () => {
    const result = await getLearningHubUsage(user?.id);
    setUsage(result);
  }, [user?.id]);

  // Activity interaction logic (extracted hook)
  const activity = useLearningHubActivity({
    userId: user?.id,
    tierKey,
    usage,
    setUsage,
    activeChildName: activeChild?.firstName,
  });

  // ─── Loading state ─────────────────────────────────────

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading Preschool Learning Hub...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main render ───────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Preschool Learning Hub</Text>
          <Text style={styles.subtitle}>
            {activeChild
              ? `Short guided activities for ${activeChild.firstName}`
              : 'Short guided activities for preschool learners'}
          </Text>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How this works</Text>
          <Text style={styles.infoText}>
            1. Pick an activity.{'\n'}
            2. Complete each step with your child.{'\n'}
            3. Dash gives hints only when needed.{'\n'}
            4. Completion is recorded for daily usage.
          </Text>
        </View>

        {/* Child Switcher */}
        <ChildSwitcher
          children={children.map((child: any) => ({
            id: child.id,
            firstName: child.firstName,
            lastName: child.lastName,
            avatarUrl: child.avatarUrl,
          }))}
          activeChildId={activeChildId}
          onChildChange={setActiveChildId}
        />

        {/* Usage Card */}
        <View style={styles.usageCard}>
          <Text style={styles.sectionTitle}>Daily Usage</Text>

          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Lessons</Text>
            <Text style={styles.usageValue}>{usage.lessonsUsed}/{formatLimit(limits.lessons)}</Text>
          </View>
          <View style={styles.usageBar}>
            <View style={[styles.usageFill, { width: percentWidth(calculateUsagePercent(usage.lessonsUsed, limits.lessons)) }]} />
          </View>

          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Activities</Text>
            <Text style={styles.usageValue}>{usage.activitiesUsed}/{formatLimit(limits.activities)}</Text>
          </View>
          <View style={styles.usageBar}>
            <View style={[styles.usageFill, { width: percentWidth(calculateUsagePercent(usage.activitiesUsed, limits.activities)) }]} />
          </View>

          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>AI Hints</Text>
            <Text style={styles.usageValue}>{usage.aiHintsUsed}/{formatLimit(limits.aiHints)}</Text>
          </View>
          <View style={styles.usageBar}>
            <View style={[styles.usageFill, { width: percentWidth(calculateUsagePercent(usage.aiHintsUsed, limits.aiHints)) }]} />
          </View>
        </View>

        {/* Activity List */}
        <Text style={styles.sectionTitle}>Interactive Preschool Activities</Text>
        {PRESCHOOL_HUB_ACTIVITIES.map((act) => {
          const locked = !activity.checkTierAccess(act.requiresTier);
          return (
            <TouchableOpacity
              key={act.id}
              activeOpacity={0.85}
              onPress={() => activity.handleStartActivity(act)}
              style={styles.activityCard}
            >
              <LinearGradient colors={act.gradient} style={styles.activityGradient}>
                <View style={styles.activityHeader}>
                  <View style={styles.activityTitleBlock}>
                    <Text style={styles.activityTitle}>{act.title}</Text>
                    <Text style={styles.activitySubtitle}>{act.subtitle}</Text>
                  </View>
                  {locked ? (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={13} color="#fff" />
                      <Text style={styles.lockBadgeText}>Locked</Text>
                    </View>
                  ) : (
                    <View style={styles.durationBadge}>
                      <Ionicons name="time-outline" size={13} color="#fff" />
                      <Text style={styles.durationText}>{act.duration}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.tagRow}>
                  {act.tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.startRow}>
                  <Text style={styles.startText}>{act.steps.length} guided steps</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}

        {/* Refresh */}
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={async () => { await refresh(); await refreshUsage(); }}
        >
          <Ionicons name="refresh" size={16} color={theme.primary} />
          <Text style={[styles.refreshText, { color: theme.primary }]}>Refresh data</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Activity Modal */}
      <LearningHubActivityModal
        activity={activity.activeActivity}
        currentStep={activity.currentStep}
        stepIndex={activity.stepIndex}
        selectedOptionId={activity.selectedOptionId}
        selectedOption={activity.selectedOption}
        stepFeedback={activity.stepFeedback}
        isAdvancing={activity.isAdvancing}
        onClose={activity.handleCloseModal}
        onOptionSelect={activity.handleOptionSelect}
        onNextStep={activity.handleNextStep}
        onAiHint={activity.handleAiHint}
      />
    </SafeAreaView>
  );
}
