import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { createDashboardStyles, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW } from '@/lib/styles/dashboardTheme';
import { LinearGradient } from 'expo-linear-gradient';
import { percentWidth } from '@/lib/progress/clampPercent';

interface MetricCardProps {
  /**
   * Metric value to display
   */
  value: string | number;
  
  /**
   * Metric label
   */
  label: string;
  
  /**
   * Optional icon name from Ionicons
   */
  icon?: keyof typeof Ionicons.glyphMap;
  
  /**
   * Optional icon color
   */
  iconColor?: string;
  
  /**
   * Optional icon background color
   */
  iconBackgroundColor?: string;
  
  /**
   * Optional subtitle or additional info
   */
  subtitle?: string;
  
  /**
   * Optional status badge
   */
  status?: 'success' | 'warning' | 'error' | 'info';
  
  /**
   * Optional status text
   */
  statusText?: string;
  
  /**
   * Optional progress value (0-100)
   */
  progress?: number;
  
  /**
   * Use gradient background
   */
  gradient?: boolean;
  
  /**
   * Gradient colors (requires gradient=true)
   */
  gradientColors?: [string, string];
  
  /**
   * Optional onPress handler
   */
  onPress?: () => void;
  
  /**
   * Optional custom styles
   */
  style?: ViewStyle;
}

/**
 * MetricCard Component
 * 
 * Reusable metric display card with icon, value, label, and status indicators.
 * Supports gradients, progress bars, and touch interactions.
 * 
 * @example
 * ```tsx
 * <MetricCard
 *   value={85}
 *   label="Attendance"
 *   icon="checkmark-circle"
 *   iconColor="#10B981"
 *   iconBackgroundColor="rgba(16, 185, 129, 0.1)"
 *   status="success"
 *   statusText="Great!"
 *   progress={85}
 *   onPress={() => navigation.navigate('Attendance')}
 * />
 * ```
 */
export function MetricCard({
  value,
  label,
  icon,
  iconColor,
  iconBackgroundColor,
  subtitle,
  status,
  statusText,
  progress,
  gradient = false,
  gradientColors,
  onPress,
  style,
}: MetricCardProps) {
  const { theme } = useTheme();
  const dashStyles = createDashboardStyles(theme);

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return theme.success;
      case 'warning':
        return theme.warning;
      case 'error':
        return theme.error;
      case 'info':
      default:
        return theme.primary;
    }
  };

  const content = (
    <>
      {/* Icon */}
      {icon && (
        <View
          style={[
            dashStyles.metricIcon,
            styles.icon,
            iconBackgroundColor && { backgroundColor: iconBackgroundColor },
          ]}
        >
          <Ionicons name={icon} size={20} color={iconColor || theme.primary} />
        </View>
      )}

      {/* Value */}
      <Text style={[dashStyles.metricValue, styles.value]}>{value}</Text>

      {/* Label */}
      <Text style={[dashStyles.metricLabel, styles.label]}>{label}</Text>

      {/* Subtitle */}
      {subtitle && (
        <Text style={[dashStyles.metricSubtext, styles.subtitle]}>{subtitle}</Text>
      )}

      {/* Status Badge */}
      {status && statusText && (
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      )}

      {/* Progress Bar */}
      {progress !== undefined && (
        <View style={styles.progressContainer}>
          <View style={[dashStyles.progressBar, styles.progressBar]}>
            <View
              style={[
                dashStyles.progressBarFill,
                styles.progressFill,
                { width: percentWidth(Math.min(progress, 100)) },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      )}
    </>
  );

  const CardWrapper = onPress ? TouchableOpacity : View;

  if (gradient && gradientColors) {
    return (
      <CardWrapper
        style={[dashStyles.metricCard, styles.card, style]}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientOverlay}
        >
          {content}
        </LinearGradient>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper
      style={[dashStyles.metricCard, styles.card, style]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {content}
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
  },
  icon: {
    marginBottom: SPACING.sm,
  },
  value: {
    lineHeight: 36,
  },
  label: {
    lineHeight: 18,
  },
  subtitle: {
    marginTop: SPACING.xs,
  },
  statusBadge: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: '#FFFFFF',
  },
  progressContainer: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  progressFill: {
    minWidth: 4,
  },
  progressText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: '#666',
    minWidth: 36,
    textAlign: 'right',
  },
  gradientOverlay: {
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
});
