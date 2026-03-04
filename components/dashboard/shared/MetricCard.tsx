/**
 * Shared MetricCard Component
 * 
 * A reusable metric display card for dashboards.
 * Used by Principal, Teacher, and Parent dashboards.
 * Supports glow animation for attention-needing items and badge counters.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';

const { width } = Dimensions.get('window');
const isTablet = width > 768;
const isSmallScreen = width < 380;

export interface MetricCardProps {
  title: string;
  /** Optional subtitle/hint text below the title */
  subtitle?: string;
  value: string | number;
  icon: string;
  color: string;
  trend?: 'up' | 'down' | 'stable' | 'good' | 'excellent' | 'warning' | 'attention' | 'needs_attention' | 'low' | 'high';
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  valueColor?: string;
  cardWidth?: number;
  /** Show glow animation (e.g., for unread messages, missed calls) */
  glow?: boolean;
  /** Optional badge count (shown on icon) */
  badge?: number;
  /** Show attention badge icon (!) when card needs attention (e.g. due soon) */
  attentionBadge?: boolean;
  /** Priority level for visual indicator - 🔴 urgent, 🟡 important, 🟢 informational */
  priority?: 'urgent' | 'important' | 'informational';
}

export const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  subtitle,
  value, 
  icon, 
  color, 
  trend, 
  onPress,
  size = 'medium',
  valueColor,
  cardWidth: customCardWidth,
  glow = false,
  badge,
  attentionBadge = false,
  priority,
}) => {
  const { theme } = useTheme();
  const styles = createStyles(theme, customCardWidth);

  // Glow: shadow/opacity (useNativeDriver: false)
  const glowAnim = useRef(new Animated.Value(0)).current;
  // Pulse: scale (useNativeDriver: true)
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (glow) {
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: false,
          }),
        ])
      );
      glowLoop.start();
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      );
      pulseLoop.start();
      return () => {
        glowLoop.stop();
        pulseLoop.stop();
      };
    } else {
      glowAnim.setValue(0);
      pulseAnim.setValue(0);
    }
  }, [glow, glowAnim, pulseAnim]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.5],
  });
  const shadowRadius = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 24],
  });
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.03],
  });

  const getTrendColor = (trendType: string) => {
    switch (trendType) {
      case 'up': case 'good': case 'excellent': case 'stable': 
        return { color: theme.success };
      case 'warning': case 'attention': case 'high': 
        return { color: theme.warning };
      case 'down': case 'low': case 'needs_attention': 
        return { color: theme.error };
      default: 
        return { color: theme.textSecondary };
    }
  };

  const getTrendIcon = (trendType: string): string => {
    switch (trendType) {
      case 'up': case 'good': case 'excellent': return '↗️';
      case 'down': case 'low': return '↘️';
      case 'warning': case 'attention': case 'needs_attention': return '⚠️';
      default: return '➡️';
    }
  };

  const getTrendText = (trendType: string): string => {
    const trendLabels: Record<string, string> = {
      up: 'Up',
      down: 'Down',
      good: 'Good',
      excellent: 'Excellent',
      warning: 'Warning',
      attention: 'Attention',
      needs_attention: 'Needs attention',
      low: 'Low',
      stable: 'Stable',
      high: 'High',
    };
    return trendLabels[trendType] || trendType;
  };

  // Priority indicator colors and labels
  const getPriorityInfo = (priorityLevel?: 'urgent' | 'important' | 'informational') => {
    switch (priorityLevel) {
      case 'urgent':
        return { color: '#DC2626', label: 'Urgent', icon: '🔴' };
      case 'important':
        return { color: '#F59E0B', label: 'Important', icon: '🟡' };
      case 'informational':
        return { color: '#10B981', label: 'Info', icon: '🟢' };
      default:
        return null;
    }
  };

  const priorityInfo = getPriorityInfo(priority);

  const showBadge = (badge !== undefined && badge > 0) || attentionBadge;

  return (
    <Animated.View
      style={[
        customCardWidth
          ? { flexBasis: customCardWidth, flexGrow: 1, flexShrink: 0 }
          : undefined,
        glow && {
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: glowOpacity,
          shadowRadius: shadowRadius,
          elevation: 10,
        },
        glow && { transform: [{ scale: pulseScale }] },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.metricCard,
          size === 'large' && styles.metricCardLarge,
          size === 'small' && styles.metricCardSmall,
          glow && { borderWidth: 1.5, borderColor: color + '60' },
          priorityInfo && { borderLeftWidth: 3, borderLeftColor: priorityInfo.color },
        ]}
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.7}
      >
        <View style={styles.metricContent}>
          {/* Priority indicator pill */}
          {priorityInfo && (
            <View style={[styles.priorityPill, { backgroundColor: priorityInfo.color + '15' }]}>
              <Text style={[styles.priorityText, { color: priorityInfo.color }]}>
                {priorityInfo.icon} {priorityInfo.label}
              </Text>
            </View>
          )}
          <View style={[styles.metricHeader]}>
            <View style={[styles.iconContainer]}>
              <LinearGradient
                colors={[color + '22', color + '08']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Ionicons 
                name={icon as any} 
                size={isSmallScreen ? (size === 'large' ? 24 : 20) : (size === 'large' ? 28 : 24)} 
                color={color} 
              />
              {/* Badge: count or attention icon */}
              {showBadge && (
                <View style={[styles.badge, { backgroundColor: attentionBadge ? theme.warning : color }]}>
                  {attentionBadge ? (
                    <Ionicons name="alert-circle" size={isSmallScreen ? 10 : 12} color="#fff" />
                  ) : (
                    <Text style={styles.badgeText}>
                      {(badge ?? 0) > 99 ? '99+' : (badge ?? 0)}
                    </Text>
                  )}
                </View>
              )}
            </View>
            {trend && (
              <View style={styles.trendContainer}>
                <Text style={[styles.trendText, getTrendColor(trend)]}>
                  {getTrendIcon(trend)} {getTrendText(trend)}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.metricValue, valueColor && { color: valueColor }]}>
            {value}
          </Text>
          <Text style={styles.metricTitle}>{title}</Text>
          {subtitle && (
            <Text style={styles.metricSubtitle}>{subtitle}</Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const isDarkHex = (hex: string): boolean => {
  const match = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return false;
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.55;
};

const createStyles = (theme: any, customCardWidth?: number) => {
  const isDark = isDarkHex(theme?.background);
  const cardPadding = isTablet ? 20 : isSmallScreen ? 10 : 14;
  const cardGap = isTablet ? 12 : isSmallScreen ? 6 : 8;
  const horizontalCardMargin = customCardWidth ? 0 : cardGap / 2;
  const containerWidth = width - (cardPadding * 2);
  const defaultCardWidth = isTablet ? (containerWidth - (cardGap * 3)) / 4 : (containerWidth - cardGap) / 2;
  const cardWidth = customCardWidth || defaultCardWidth;

  // Fixed 3-column layout for small cards (Quick Actions)
  // Calculate to ensure exactly 3 cards fit per row with proper spacing
  // For 3 columns, we need: (totalWidth - horizontalPadding - 2 gaps) / 3
  const smallCardWidth = isTablet 
    ? (width - 80) / 5 
    : Math.floor((width - (cardPadding * 2) - (cardGap * 2)) / 3);

  return StyleSheet.create({
    metricCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.cardBackground,
      borderRadius: isSmallScreen ? 14 : 18,
      padding: isSmallScreen ? 14 : 18,
      width: customCardWidth ? '100%' : cardWidth,
      marginHorizontal: horizontalCardMargin,
      marginBottom: customCardWidth ? 0 : cardGap,
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'transparent',
      shadowColor: isDark ? '#000' : theme.shadow,
      shadowOffset: { width: 0, height: isDark ? 8 : 2 },
      shadowOpacity: isDark ? 0.2 : 0.08,
      shadowRadius: isDark ? 16 : 8,
      elevation: isDark ? 8 : 3,
      minHeight: isSmallScreen ? 110 : 130,
      overflow: 'hidden' as const,
    },
    metricCardLarge: {
      width: isTablet ? (width - 60) / 2 : width - (cardPadding * 2),
    },
    metricCardSmall: {
      width: smallCardWidth,
      padding: isSmallScreen ? 8 : 12,
      minHeight: isSmallScreen ? 80 : 100,
    },
    metricContent: {
      alignItems: 'flex-start',
      flex: 1,
    },
    metricHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      width: '100%',
      marginBottom: isSmallScreen ? 10 : 14,
    },
    iconContainer: {
      width: isSmallScreen ? 44 : 52,
      height: isSmallScreen ? 44 : 52,
      borderRadius: isSmallScreen ? 13 : 16,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden' as const,
    },
    badge: {
      position: 'absolute',
      top: -6,
      right: -6,
      minWidth: isSmallScreen ? 18 : 20,
      height: isSmallScreen ? 18 : 20,
      borderRadius: isSmallScreen ? 9 : 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderWidth: 2,
      borderColor: theme.cardBackground,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: isSmallScreen ? 10 : 11,
      fontWeight: '700',
    },
    priorityPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: isSmallScreen ? 6 : 8,
      paddingVertical: isSmallScreen ? 2 : 3,
      borderRadius: 4,
      marginBottom: 8,
    },
    priorityText: {
      fontSize: isSmallScreen ? 9 : 10,
      fontWeight: '600',
    },
    trendContainer: {
      backgroundColor: theme.surface,
      paddingHorizontal: isSmallScreen ? 6 : 8,
      paddingVertical: isSmallScreen ? 3 : 4,
      borderRadius: 6,
      maxWidth: '100%',
    },
    trendText: {
      fontSize: isSmallScreen ? 10 : 11,
      fontWeight: '600',
      lineHeight: isSmallScreen ? 12 : 14,
    },
    metricValue: {
      fontSize: isSmallScreen ? 24 : isTablet ? 36 : 32,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 6,
      lineHeight: isSmallScreen ? 28 : isTablet ? 40 : 36,
      letterSpacing: -0.3,
    },
    metricTitle: {
      fontSize: isSmallScreen ? 13 : isTablet ? 16 : 15,
      color: theme.textSecondary,
      fontWeight: '500',
      lineHeight: isSmallScreen ? 18 : isTablet ? 22 : 20,
      textAlign: 'left',
    },
    metricSubtitle: {
      fontSize: isSmallScreen ? 11 : isTablet ? 13 : 12,
      color: theme.textTertiary || theme.textSecondary,
      fontWeight: '400',
      lineHeight: isSmallScreen ? 14 : isTablet ? 18 : 16,
      textAlign: 'left',
      marginTop: 2,
      opacity: 0.7,
    },
  });
};

export default MetricCard;
