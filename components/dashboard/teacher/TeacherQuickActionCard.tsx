/**
 * TeacherQuickActionCard - Reusable quick action card component
 * 
 * Shared by both legacy and new enhanced teacher dashboards.
 * Displays an action button with icon, title, and optional subtitle.
 */

import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import Feedback from '@/lib/feedback';
import { getCardLayoutMetrics } from '@/lib/utils/layoutMetrics';
import { isNextGenTheme } from '@/lib/utils/themeVariant';

interface TeacherQuickActionCardProps {
  title: string;
  icon: string;
  color: string;
  onPress: () => void;
  subtitle?: string;
  disabled?: boolean;
  /** When true, card fills its container (e.g. in a two-column grid row) */
  fillContainer?: boolean;
}

export const TeacherQuickActionCard: React.FC<TeacherQuickActionCardProps> = ({
  title,
  icon,
  color,
  onPress,
  subtitle,
  disabled,
  fillContainer = false,
}) => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getCardLayoutMetrics(width), [width]);
  const isNextGenTeacher = isNextGenTheme(theme);
  const styles = useMemo(() => getStyles(theme, layout), [theme, layout]);

  const handlePress = async () => {
    if (disabled) return;
    try {
      await Feedback.vibrate(10);
      onPress();
    } catch {
      // Silently fail vibration
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.actionCard,
        fillContainer && styles.actionCardFill,
        fillContainer && { width: undefined },
        disabled && styles.actionCardDisabled,
        { borderColor: isNextGenTeacher ? 'rgba(255,255,255,0.10)' : theme.border }
      ]}
      onPress={handlePress}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + '15' }]}>
        <Ionicons
          name={icon as any}
          size={layout.isSmallScreen ? 20 : 24}
          color={disabled ? theme.textSecondary : color}
        />
      </View>
      <Text style={[styles.actionTitle, disabled && styles.actionTitleDisabled]}>
        {title}
      </Text>
      {subtitle && (
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      )}
    </TouchableOpacity>
  );
};

const getStyles = (theme: any, layout: ReturnType<typeof getCardLayoutMetrics>) => {
  const isNextGenTeacher = isNextGenTheme(theme);

  return StyleSheet.create({
    actionCard: {
      width: layout.cardWidth,
      backgroundColor: isNextGenTeacher ? 'rgba(255,255,255,0.05)' : theme.surface,
      borderRadius: isNextGenTeacher ? 18 : 16,
      padding: layout.cardPadding,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: layout.cardGap / 2,
      marginBottom: layout.cardGap,
      minHeight: layout.isTablet ? 120 : layout.isSmallScreen ? 90 : 100,
      borderWidth: isNextGenTeacher ? 1 : 0,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: isNextGenTeacher ? 14 : 2 },
      shadowOpacity: isNextGenTeacher ? 0.35 : 0.1,
      shadowRadius: isNextGenTeacher ? 24 : 8,
      elevation: isNextGenTeacher ? 10 : 4,
    },
    actionCardFill: {
      flex: 1,
      minWidth: 0,
      marginHorizontal: 0,
      marginBottom: 0,
    },
    actionCardDisabled: {
      opacity: 0.5,
    },
    actionIcon: {
      width: layout.isSmallScreen ? 48 : 56,
      height: layout.isSmallScreen ? 48 : 56,
      borderRadius: isNextGenTeacher ? 14 : (layout.isSmallScreen ? 24 : 28),
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
      borderWidth: isNextGenTeacher ? 1 : 0,
      borderColor: isNextGenTeacher ? 'rgba(255,255,255,0.08)' : 'transparent',
    },
    actionTitle: {
      fontSize: layout.isTablet ? 16 : layout.isSmallScreen ? 12 : 14,
      fontWeight: '700',
      color: isNextGenTeacher ? '#EAF0FF' : theme.text,
      textAlign: 'center',
      marginBottom: 4,
    },
    actionTitleDisabled: {
      color: isNextGenTeacher ? 'rgba(234,240,255,0.58)' : theme.textSecondary,
    },
    actionSubtitle: {
      fontSize: layout.isTablet ? 14 : layout.isSmallScreen ? 10 : 12,
      color: isNextGenTeacher ? 'rgba(234,240,255,0.72)' : theme.textSecondary,
      textAlign: 'center',
    },
  });
};
