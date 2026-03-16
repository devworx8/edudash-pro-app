/**
 * TeacherMetricsCard - Reusable metric display component
 * 
 * Shared by both legacy and new enhanced teacher dashboards.
 * Displays a metric with icon, value, title, and optional trend indicator.
 * 
 * Features:
 * - Improved accessibility with proper ARIA labels
 * - Better color contrast for trend indicators
 * - Skeleton loading state
 * - Optimized re-renders with React.memo
 */

import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, AccessibilityInfo, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { getCardLayoutMetrics } from '@/lib/utils/layoutMetrics';
import { isNextGenTheme } from '@/lib/utils/themeVariant';

interface TeacherMetricsCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  trend?: string;
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  /** When true, card fills its container (e.g. in a two-column grid row) */
  fillContainer?: boolean;
  /** Show skeleton loading state */
  isLoading?: boolean;
  /** Accessibility hint for screen readers */
  accessibilityHint?: string;
}

export const TeacherMetricsCard: React.FC<TeacherMetricsCardProps> = memo(function TeacherMetricsCard({
  title,
  value,
  icon,
  color,
  trend,
  onPress,
  size = 'medium',
  fillContainer = false,
  isLoading = false,
  accessibilityHint,
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const layout = getCardLayoutMetrics(width || 0);
  const styles = getStyles(theme, layout);

  // Memoize accessibility label
  const accessibilityLabel = useMemo(() => {
    const trendText = trend ? `, ${getTrendText(trend, t)}` : '';
    return `${title}: ${value}${trendText}`;
  }, [title, value, trend, t]);

  // Announce value changes to screen readers
  React.useEffect(() => {
    if (Platform.OS !== 'web' && value !== undefined) {
      AccessibilityInfo.announceForAccessibility(`${title} is now ${value}`);
    }
  }, [title, value]);

  // Loading skeleton
  if (isLoading) {
    return (
      <View
        style={[
          styles.metricCard,
          size === 'large' && styles.metricCardLarge,
          size === 'small' && styles.metricCardSmall,
          fillContainer && styles.metricCardFill,
          fillContainer && { width: undefined },
          !fillContainer && { marginHorizontal: layout.cardGap / 2, marginBottom: layout.cardGap },
          styles.skeletonCard,
        ]}
      >
        <View style={styles.metricContent}>
          <View style={[styles.skeletonIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <View style={[styles.skeletonValue, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <View style={[styles.skeletonTitle, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.metricCard,
        size === 'large' && styles.metricCardLarge,
        size === 'small' && styles.metricCardSmall,
        fillContainer && styles.metricCardFill,
        fillContainer && { width: undefined },
        !fillContainer && { marginHorizontal: layout.cardGap / 2, marginBottom: layout.cardGap },
      ]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessible={true}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.metricContent}>
        <View style={styles.metricHeader}>
          <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
            <Ionicons
              name={icon as any}
              size={layout.isSmallScreen ? (size === 'large' ? 24 : 20) : (size === 'large' ? 28 : 24)}
              color={color}
            />
          </View>
          {trend && (
            <View style={styles.trendContainer} accessibilityRole="text" accessibilityLabel={`Trend: ${getTrendText(trend, t)}`}>
              <Text style={[styles.trendText, getTrendColor(trend, theme)]}>
                {getTrendIcon(trend)} {getTrendText(trend, t)}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.metricValue} accessibilityRole="text">{value}</Text>
        <Text style={styles.metricTitle}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
});

// Trend helper functions
export const getTrendColor = (trend: string, theme: any) => {
  switch (trend) {
    case 'up': case 'good': case 'excellent': case 'stable': return { color: theme.success };
    case 'warning': case 'attention': case 'high': return { color: theme.warning };
    case 'down': case 'low': case 'needs_attention': return { color: theme.error };
    default: return { color: theme.textSecondary };
  }
};

export const getTrendIcon = (trend: string): string => {
  switch (trend) {
    case 'up': case 'good': case 'excellent': return '↗️';
    case 'down': case 'low': return '↘️';
    case 'warning': case 'attention': case 'needs_attention': return '⚠️';
    default: return '➡️';
  }
};

export const getTrendText = (trend: string, t: any): string => {
  switch (trend) {
    case 'up': return t('trends.up', { defaultValue: 'Up' });
    case 'down': return t('trends.down', { defaultValue: 'Down' });
    case 'good': return t('trends.good', { defaultValue: 'Good' });
    case 'excellent': return t('trends.excellent', { defaultValue: 'Excellent' });
    case 'warning': return t('trends.warning', { defaultValue: 'Warning' });
    case 'attention': return t('trends.attention', { defaultValue: 'Attention' });
    case 'needs_attention': return t('trends.needs_attention', { defaultValue: 'Needs attention' });
    case 'low': return t('trends.low', { defaultValue: 'Low' });
    case 'stable': return t('trends.stable', { defaultValue: 'Stable' });
    case 'high': return t('trends.high', { defaultValue: 'High' });
    default: return trend;
  }
};

const getStyles = (theme: any, layout: ReturnType<typeof getCardLayoutMetrics>) => {
  const isNextGenTeacher = isNextGenTheme(theme);

  return StyleSheet.create({
    metricCard: {
      width: layout.cardWidth,
      backgroundColor: isNextGenTeacher ? 'rgba(255,255,255,0.05)' : theme.surface,
      borderRadius: isNextGenTeacher ? 18 : 16,
      padding: layout.cardPadding,
      borderWidth: isNextGenTeacher ? 1 : 0,
      borderColor: isNextGenTeacher ? 'rgba(255,255,255,0.10)' : 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: isNextGenTeacher ? 14 : 2 },
      shadowOpacity: isNextGenTeacher ? 0.35 : 0.1,
      shadowRadius: isNextGenTeacher ? 24 : 8,
      elevation: isNextGenTeacher ? 10 : 4,
    },
    metricCardLarge: {
      width: layout.containerWidth,
    },
    metricCardSmall: {
      width: (layout.containerWidth - layout.cardGap) / 3,
    },
    metricCardFill: {
      flex: 1,
      minWidth: 0,
      marginHorizontal: 0,
      marginBottom: 0,
    },
    metricContent: {
      flex: 1,
    },
    metricHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    iconContainer: {
      width: layout.isSmallScreen ? 40 : 48,
      height: layout.isSmallScreen ? 40 : 48,
      borderRadius: isNextGenTeacher ? (layout.isSmallScreen ? 12 : 14) : (layout.isSmallScreen ? 20 : 24),
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: isNextGenTeacher ? 1 : 0,
      borderColor: isNextGenTeacher ? 'rgba(255,255,255,0.08)' : 'transparent',
    },
    trendContainer: {
      flexShrink: 1,
    },
    trendText: {
      fontSize: 11,
      fontWeight: '700',
    },
    metricValue: {
      fontSize: layout.isTablet ? 32 : layout.isSmallScreen ? 24 : 28,
      fontWeight: '700',
      color: isNextGenTeacher ? '#EAF0FF' : theme.text,
      marginBottom: 4,
    },
    metricTitle: {
      fontSize: layout.isTablet ? 16 : layout.isSmallScreen ? 12 : 13,
      color: isNextGenTeacher ? 'rgba(234,240,255,0.72)' : theme.textSecondary,
      fontWeight: '600',
      lineHeight: layout.isTablet ? 22 : layout.isSmallScreen ? 16 : 18,
    },
    // Skeleton loading styles
    skeletonCard: {
      opacity: 0.7,
    },
    skeletonIcon: {
      width: layout.isSmallScreen ? 40 : 48,
      height: layout.isSmallScreen ? 40 : 48,
      borderRadius: isNextGenTeacher ? (layout.isSmallScreen ? 12 : 14) : (layout.isSmallScreen ? 20 : 24),
      marginBottom: 12,
    },
    skeletonValue: {
      width: '60%',
      height: layout.isTablet ? 32 : layout.isSmallScreen ? 24 : 28,
      borderRadius: 4,
      marginBottom: 8,
    },
    skeletonTitle: {
      width: '80%',
      height: layout.isTablet ? 16 : layout.isSmallScreen ? 12 : 13,
      borderRadius: 4,
    },
  });
};
