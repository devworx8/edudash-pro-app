/**
 * TeachTodaySuggestion (Optimized) — "What to Teach Today" AI suggestion card
 *
 * Optimized version with:
 * - Better memoization for expensive computations
 * - Improved accessibility with proper ARIA labels
 * - Skeleton loading state
 * - Reduced re-renders with React.memo
 *
 * @module components/dashboard/teacher/TeachTodaySuggestionOptimized
 */

import React, { useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import { track } from '@/lib/analytics';

export interface TeachTodaySuggestionProps {
  todayRoutine?: {
    title?: string;
    nextBlockTitle?: string;
    weekStartDate?: string;
    termId?: string;
    themeId?: string;
    themeName?: string;
  } | null;
  classNames?: string[];
  onOpenTutor: () => void;
  onOpenPlanner: () => void;
  /** Show skeleton loading state */
  isLoading?: boolean;
}

interface SuggestionChip {
  id: string;
  label: string;
  prompt: string;
  icon: string;
}

/**
 * Pre-defined chip configurations to avoid recreation on each render
 */
const CHIP_CONFIGS = {
  withTheme: [
    { id: 'continue', icon: '📖', labelKey: 'teacher.suggestion_continue_theme', promptKey: 'teacher.suggestion_continue_prompt' },
    { id: 'worksheet', icon: '✏️', labelKey: 'teacher.suggestion_worksheet', promptKey: 'teacher.suggestion_worksheet_prompt' },
    { id: 'understanding', icon: '📊', labelKey: 'teacher.suggestion_check_understanding', promptKey: 'teacher.suggestion_check_prompt' },
  ],
  withoutTheme: [
    { id: 'generate', icon: '🚀', labelKey: 'teacher.suggestion_generate_plan', promptKey: 'teacher.suggestion_generate_prompt' },
    { id: 'activity', icon: '📝', labelKey: 'teacher.suggestion_quick_activity', promptKey: 'teacher.suggestion_activity_prompt' },
    { id: 'goals', icon: '🎯', labelKey: 'teacher.suggestion_learning_goals', promptKey: 'teacher.suggestion_goals_prompt' },
  ],
};

/**
 * Build chips with memoization - only recomputes when theme name changes
 */
function useChips(hasRoutine: boolean, themeName: string | undefined): SuggestionChip[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const configs = hasRoutine && themeName ? CHIP_CONFIGS.withTheme : CHIP_CONFIGS.withoutTheme;

    return configs.map(config => ({
      id: config.id,
      icon: config.icon,
      label: hasRoutine && themeName
        ? t(config.labelKey, { defaultValue: config.labelKey, theme: themeName })
        : t(config.labelKey, { defaultValue: config.labelKey }),
      prompt: hasRoutine && themeName
        ? t(config.promptKey, { defaultValue: config.promptKey, theme: themeName })
        : t(config.promptKey, { defaultValue: config.promptKey }),
    }));
  }, [hasRoutine, themeName, t]);
}

/**
 * Single chip component with memoization
 */
const SuggestionChip = memo(function SuggestionChip({
  chip,
  onPress,
}: {
  chip: SuggestionChip;
  onPress: (chip: SuggestionChip) => void;
}) {
  const styles = useChipStyles();

  const handlePress = useCallback(() => {
    onPress(chip);
  }, [chip, onPress]);

  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={chip.label}
      accessibilityHint="Opens Dash AI assistant with this prompt"
    >
      <Text style={styles.chipText}>{chip.label}</Text>
    </TouchableOpacity>
  );
});

function useChipStyles() {
  return React.useMemo(() => StyleSheet.create({
    chip: {
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
    },
    chipText: {
      color: '#EAF0FF',
      fontSize: 13,
      fontWeight: '600',
    },
  }), []);
}

/**
 * Loading skeleton component
 */
function LoadingSkeleton() {
  return (
    <View style={styles.card}>
      <View style={[styles.gradient, { backgroundColor: 'rgba(26, 107, 106, 0.5)' }]}>
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonIcon} />
        </View>
        <View style={styles.skeletonText} />
        <View style={styles.skeletonChipsRow}>
          <View style={styles.skeletonChip} />
          <View style={styles.skeletonChip} />
          <View style={styles.skeletonChip} />
        </View>
      </View>
    </View>
  );
}

function TeachTodaySuggestionImpl({
  todayRoutine,
  classNames,
  onOpenTutor,
  onOpenPlanner,
  isLoading = false,
}: TeachTodaySuggestionProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const hasRoutine = !!todayRoutine;
  const themeName = todayRoutine?.themeName || todayRoutine?.title;
  const chips = useChips(hasRoutine, themeName);

  // Announce changes to screen readers
  React.useEffect(() => {
    if (hasRoutine && themeName) {
      if (Platform.OS !== 'web') {
        AccessibilityInfo.announceForAccessibility(
          t('teacher.teach_today_announce', {
            defaultValue: `Today's theme is ${themeName}`,
            theme: themeName,
          })
        );
      }
    }
  }, [hasRoutine, themeName, t]);

  const handleChipPress = useCallback(
    (chip: SuggestionChip) => {
      track('teacher.dashboard.teach_today_chip', {
        chip_label: chip.label,
        chip_id: chip.id,
        has_routine: hasRoutine,
        theme_name: themeName || 'none',
      });

      router.push({
        pathname: '/screens/dash-assistant',
        params: { initialMessage: chip.prompt },
      } as never);
    },
    [hasRoutine, themeName]
  );

  const classContext = useMemo(() => {
    if (!classNames || classNames.length === 0) return null;
    return classNames.slice(0, 2).join(', ');
  }, [classNames]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <View
      style={styles.card}
      accessibilityRole="region"
      accessibilityLabel={t('teacher.teach_today_accessibility_label', {
        defaultValue: "Today's teaching focus suggestions"
      })}
    >
      <LinearGradient
        colors={['#1A6B6A', '#1E4F8A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {t('teacher.teach_today_title', { defaultValue: '📋 Today\'s Teaching Focus' })}
          </Text>
          <Ionicons name="bulb-outline" size={18} color="rgba(234,240,255,0.72)" />
        </View>

        {hasRoutine && themeName ? (
          <View style={styles.themeRow}>
            <View style={styles.themeBadge}>
              <Text style={styles.themeBadgeText}>
                {t('teacher.teach_today_theme', { defaultValue: 'Theme: {{name}}', name: themeName })}
              </Text>
            </View>
            {todayRoutine?.nextBlockTitle && (
              <Text style={styles.nextBlock}>
                {t('teacher.teach_today_next', {
                  defaultValue: 'Up next: {{block}}',
                  block: todayRoutine.nextBlockTitle,
                })}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.emptyHint}>
            {t('teacher.teach_today_empty', {
              defaultValue: 'No lesson plan for today. Dash AI can help you create one in seconds.',
            })}
          </Text>
        )}

        {classContext && (
          <Text style={styles.classContext}>
            {t('teacher.teach_today_classes', {
              defaultValue: 'For: {{classes}}',
              classes: classContext,
            })}
          </Text>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          accessibilityRole="list"
        >
          {chips.map((chip) => (
            <SuggestionChip
              key={chip.id}
              chip={chip}
              onPress={handleChipPress}
            />
          ))}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  gradient: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#EAF0FF',
    fontSize: 15,
    fontWeight: '700',
  },
  themeRow: {
    gap: 4,
  },
  themeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  themeBadgeText: {
    color: '#EAF0FF',
    fontSize: 13,
    fontWeight: '600',
  },
  nextBlock: {
    color: 'rgba(234,240,255,0.82)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  emptyHint: {
    color: 'rgba(234,240,255,0.82)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  classContext: {
    color: 'rgba(234,240,255,0.60)',
    fontSize: 12,
    fontWeight: '500',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  // Skeleton styles
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonTitle: {
    width: 180,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
  },
  skeletonIcon: {
    width: 18,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 9,
  },
  skeletonText: {
    width: '100%',
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    marginTop: 8,
  },
  skeletonChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  skeletonChip: {
    width: 120,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
  },
});

// Export memoized component
export const TeachTodaySuggestionOptimized = memo(TeachTodaySuggestionImpl);