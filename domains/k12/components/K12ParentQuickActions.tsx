/**
 * K12ParentQuickActions
 *
 * Reduced quick-action grid with the 6 most-used parent actions:
 * Homework, Messages, My Children, Payments, Attendance, Progress.
 * Ordered by parent priority.
 * Cards that need attention (e.g. payments due) get glow, pulse, and badge.
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { K12ParentActionId } from '@/lib/navigation/k12ParentActionMap';
import { GlassCard } from '@/components/nextgen/GlassCard';
import { styles } from './K12ParentDashboard.styles';

interface K12ParentQuickActionsProps {
  onActionPress: (actionId: K12ParentActionId) => void;
  theme: ThemeColors;
  quickWinsEnabled: boolean;
  /** When true, the Payments card shows glow, pulse, and attention badge */
  paymentsNeedAttention?: boolean;
}

interface QuickAction {
  id: string;
  actionId: K12ParentActionId;
  icon: string;
  label: string;
  color: string;
}

function AttentionCard({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
      ])
    );
    glowLoop.start();
    pulseLoop.start();
    return () => {
      glowLoop.stop();
      pulseLoop.stop();
    };
  }, [glowAnim, pulseAnim]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] });
  const shadowRadius = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 24] });
  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <Animated.View
      style={{
        width: '100%',
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: glowOpacity,
        shadowRadius,
        elevation: 10,
        transform: [{ scale: pulseScale }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function K12ParentQuickActions({
  onActionPress,
  theme,
  quickWinsEnabled,
  paymentsNeedAttention = false,
}: K12ParentQuickActionsProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compactLayout = width < 360;

  const quickActions: QuickAction[] = useMemo(() => [
    { id: 'homework', actionId: 'homework', icon: 'document-text', label: t('dashboard.parent.nav.homework', { defaultValue: 'Homework' }), color: '#06B6D4' },
    { id: 'calculator', actionId: 'calculator', icon: 'calculator', label: t('dashboard.parent.nav.calculator', { defaultValue: 'Calculator' }), color: '#0D9488' },
    { id: 'messages', actionId: 'messages', icon: 'chatbubbles', label: t('navigation.messages', { defaultValue: 'Messages' }), color: '#3B82F6' },
    { id: 'children', actionId: 'children', icon: 'people', label: t('dashboard.parent.nav.my_children', { defaultValue: 'My Children' }), color: '#4F46E5' },
    { id: 'payments', actionId: 'payments', icon: 'card', label: t('dashboard.parent.nav.payments', { defaultValue: 'Payments' }), color: '#8B5CF6' },
    { id: 'attendance', actionId: 'attendance', icon: 'calendar-outline', label: t('dashboard.parent.nav.attendance', { defaultValue: 'Attendance' }), color: '#F59E0B' },
    { id: 'progress', actionId: 'progress', icon: 'ribbon', label: t('dashboard.progress', { defaultValue: 'Progress' }), color: '#10B981' },
  ], [t]);

  return (
    <View style={styles.section}>
      <GlassCard style={styles.sectionHeaderCard} padding={14}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeaderTitle, { color: theme.text }]}>
            {t('dashboard.quick_actions', { defaultValue: 'Quick Actions' })}
          </Text>
        </View>
        <Text style={[styles.sectionHeaderHint, { color: theme.textSecondary }]}>
          {t('dashboard.quick_actions_hint', { defaultValue: 'Quick access to homework, messages, payments, attendance, and progress.' })}
        </Text>
      </GlassCard>
      <View style={styles.quickActionsGrid}>
        {quickActions.map((action) => {
          const needsAttention = action.id === 'payments' && paymentsNeedAttention;
          const cardColor = action.color;
          const cardContent = (
            <TouchableOpacity
              style={[
                styles.quickActionCard,
                compactLayout ? styles.quickActionCardCompact : styles.quickActionCardRegular,
                {
                  backgroundColor: quickWinsEnabled ? 'rgba(255,255,255,0.06)' : theme.surfaceVariant,
                  borderColor: needsAttention ? cardColor + '80' : (quickWinsEnabled ? 'rgba(255,255,255,0.08)' : theme.border),
                  borderWidth: needsAttention ? 1.5 : 1,
                },
              ]}
              onPress={() => onActionPress(action.actionId)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: cardColor + '20' }]}>
                <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={24} color={cardColor} />
                {needsAttention && (
                  <View style={[attentionBadgeStyles.badge, { backgroundColor: theme.warning || '#F59E0B' }]}>
                    <Ionicons name="alert-circle" size={12} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={[styles.quickActionLabel, { color: theme.text }]} numberOfLines={2}>
                {action.label}
              </Text>
            </TouchableOpacity>
          );
          return (
            <View
              key={action.id}
              style={[
                styles.quickActionItem,
                compactLayout ? styles.quickActionItemCompact : styles.quickActionItemRegular,
              ]}
            >
              {needsAttention ? (
                <AttentionCard color={cardColor}>{cardContent}</AttentionCard>
              ) : (
                cardContent
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const attentionBadgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
});
