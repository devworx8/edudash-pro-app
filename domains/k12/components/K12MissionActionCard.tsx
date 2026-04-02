import React, { useEffect, useRef } from 'react';
import {
  Animated,
  TouchableOpacity,
  View,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { K12ParentActionId } from '@/lib/navigation/k12ParentActionMap';
import { styles } from './K12ParentDashboard.styles';
import {
  attentionBadgeStyles,
  missionControlStyles,
} from './K12ParentQuickActions.styles';

export interface K12MissionAction {
  id: string;
  actionId: K12ParentActionId;
  icon: string;
  label: string;
  color: string;
  subtitle: string;
}

interface MissionActionCardProps {
  action: K12MissionAction;
  onPress: (actionId: K12ParentActionId) => void;
  theme: ThemeColors;
  quickWinsEnabled: boolean;
  compactLayout: boolean;
  featured?: boolean;
  needsAttention?: boolean;
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
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
      ]),
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

export function K12MissionActionCard({
  action,
  onPress,
  theme,
  quickWinsEnabled,
  compactLayout,
  featured = false,
  needsAttention = false,
}: MissionActionCardProps) {
  const borderColor = needsAttention
    ? `${action.color}88`
    : featured
      ? 'rgba(148, 163, 184, 0.22)'
      : theme.border || 'rgba(255,255,255,0.08)';
  const backgroundColor = featured
    ? (quickWinsEnabled ? 'rgba(9, 18, 38, 0.96)' : (theme.surface || 'rgba(15,18,30,0.92)'))
    : (quickWinsEnabled
      ? 'rgba(255,255,255,0.05)'
      : (theme.surfaceVariant || theme.surface || 'rgba(255,255,255,0.04)'));

  const cardContent = (
    <TouchableOpacity
      style={[
        styles.quickActionCard,
        featured ? missionControlStyles.featuredCard : missionControlStyles.secondaryCard,
        compactLayout ? missionControlStyles.compactCard : null,
        {
          backgroundColor,
          borderColor,
          borderWidth: needsAttention || featured ? 1.5 : 1,
          shadowColor: needsAttention ? action.color : (featured ? action.color : '#000'),
          shadowOpacity: featured ? 0.24 : 0.12,
          shadowRadius: featured ? 18 : 12,
          shadowOffset: { width: 0, height: featured ? 10 : 8 },
          elevation: featured ? 8 : 4,
        },
      ]}
      onPress={() => onPress(action.actionId)}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <LinearGradient
        colors={
          featured
            ? [`${action.color}38`, 'rgba(255,255,255,0.05)']
            : [`${action.color}24`, 'rgba(255,255,255,0.03)']
        }
        style={[
          styles.quickActionIcon,
          featured ? missionControlStyles.featuredIcon : missionControlStyles.secondaryIcon,
          {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: featured ? `${action.color}45` : 'rgba(255,255,255,0.07)',
          },
        ]}
      >
        <Ionicons
          name={action.icon as keyof typeof Ionicons.glyphMap}
          size={featured ? 26 : 22}
          color={action.color}
        />
        {needsAttention ? (
          <View style={[attentionBadgeStyles.badge, { backgroundColor: theme.warning || '#F59E0B' }]}>
            <Ionicons name="alert-circle" size={12} color="#fff" />
          </View>
        ) : null}
      </LinearGradient>
      <Text
        style={[
          styles.quickActionLabel,
          featured ? missionControlStyles.featuredLabel : missionControlStyles.secondaryLabel,
          { color: theme.text },
        ]}
        numberOfLines={featured ? 2 : 1}
      >
        {action.label}
      </Text>
      <Text
        style={[
          missionControlStyles.cardSubtitle,
          { color: theme.textSecondary },
        ]}
        numberOfLines={featured ? 2 : 1}
      >
        {action.subtitle}
      </Text>
    </TouchableOpacity>
  );

  if (!needsAttention) {
    return cardContent;
  }

  return (
    <AttentionCard color={action.color}>
      {cardContent}
    </AttentionCard>
  );
}

export default K12MissionActionCard;
