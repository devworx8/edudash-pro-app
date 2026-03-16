/**
 * Shared CollapsibleSection Component
 * 
 * A reusable collapsible section with animated expand/collapse.
 * Used by Principal, Teacher, and Parent dashboards.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { isNextGenTheme } from '@/lib/utils/themeVariant';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming,
  interpolate
} from 'react-native-reanimated';
import Feedback from '@/lib/feedback';
import { SectionAttentionDot, type AttentionPriority } from './SectionAttentionDot';
import { GlowContainer } from './GlowContainer';

export interface SectionAttention {
  priority: AttentionPriority;
  count: number;
  label?: string;
}

export interface CollapsibleSectionProps {
  title: string;
  sectionId: string;
  icon?: string;
  hint?: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  onToggle?: (sectionId: string, isCollapsed: boolean) => void;
  visualStyle?: 'default' | 'glass';
  /** Optional action button label shown in header */
  actionLabel?: string;
  /** Optional action button press handler */
  onActionPress?: () => void;
  /** Attention indicator — drives glow, dot, and badge */
  attention?: SectionAttention;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
  title, 
  sectionId,
  icon,
  hint,
  children, 
  defaultCollapsed = false,
  onToggle,
  visualStyle = 'default',
  actionLabel,
  onActionPress,
  attention,
}) => {
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const rotation = useSharedValue(defaultCollapsed ? 0 : 1);
  const contentOpacity = useSharedValue(defaultCollapsed ? 0 : 1);

  // Attention visuals only show when section is collapsed (not yet acknowledged)
  const attentionPriority: AttentionPriority = 
    (collapsed && attention?.priority) ? attention.priority : 'none';
  const isElevated = attentionPriority === 'critical';

  const styles = createStyles(theme, visualStyle, windowWidth);

  // Sync with external collapsed state (from parent component)
  useEffect(() => {
    if (defaultCollapsed !== collapsed) {
      setCollapsed(defaultCollapsed);
      rotation.value = withTiming(defaultCollapsed ? 0 : 1, { duration: 200 });
      contentOpacity.value = withTiming(defaultCollapsed ? 0 : 1, { duration: 200 });
    }
  }, [defaultCollapsed]);

  const toggleCollapse = useCallback(() => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    rotation.value = withTiming(newCollapsed ? 0 : 1, { duration: 200 });
    contentOpacity.value = withTiming(newCollapsed ? 0 : 1, { duration: 200 });
    
    try {
      Feedback.vibrate(5);
    } catch {
      // Vibration not supported, ignore
    }
    
    if (onToggle) {
      onToggle(sectionId, newCollapsed);
    }
  }, [collapsed, sectionId, onToggle, rotation, contentOpacity]);

  const animatedChevronStyle = useAnimatedStyle(() => {
    const rotate = interpolate(rotation.value, [0, 1], [0, 90]);
    return {
      transform: [{ rotate: `${rotate}deg` }],
    };
  });

  const animatedContentStyle = useAnimatedStyle(() => {
    return {
      opacity: contentOpacity.value,
    };
  });

  const sectionContent = (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleCollapse}
        activeOpacity={0.7}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
      >
        <View style={styles.headerLeft}>
          {icon && (
            // Check if icon is an Ionicons name (lowercase start) or emoji/text
            typeof icon === 'string' && icon.length > 0 && /^[a-z]/.test(icon) ? (
              <Ionicons name={icon as any} size={18} color={theme.primary} style={{ marginRight: 4 }} />
            ) : (
              <Text style={styles.headerIcon}>{icon}</Text>
            )
          )}
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>{title}</Text>
            {hint ? (
              <Text style={styles.headerHint} numberOfLines={2}>
                {hint}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerRight}>
          {actionLabel && onActionPress && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation?.();
                onActionPress();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.actionText, { color: theme.primary }]}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
          {attentionPriority !== 'none' && (
            <SectionAttentionDot
              priority={attentionPriority}
              count={attention?.count}
            />
          )}
          <Animated.View style={animatedChevronStyle}>
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={theme.textSecondary} 
            />
          </Animated.View>
        </View>
      </TouchableOpacity>
      <Animated.View style={animatedContentStyle}>
        {/* Always render children but control visibility with display/height */}
        <View style={collapsed ? styles.hiddenContent : undefined}>
          {children}
        </View>
      </Animated.View>
    </View>
  );

  // Wrap in GlowContainer when attention is needed
  if (attentionPriority !== 'none') {
    return (
      <GlowContainer urgency={attentionPriority} elevated={isElevated}>
        {sectionContent}
      </GlowContainer>
    );
  }

  return sectionContent;
};

const createStyles = (theme: any, visualStyle: 'default' | 'glass', windowWidth: number) => {
  const isNextGenTeacher = isNextGenTheme(theme);
  const isGlass = visualStyle === 'glass';
  const isTablet = windowWidth > 768;
  const isSmallScreen = windowWidth < 380;

  return StyleSheet.create({
    container: {
      marginBottom: isNextGenTeacher ? 26 : 24,
    },
    hiddenContent: {
      height: 0,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: isNextGenTeacher ? 14 : 12,
      paddingHorizontal: isNextGenTeacher ? 14 : 12,
      borderRadius: isNextGenTeacher ? 18 : 14,
      borderWidth: 1,
      borderColor: isGlass
        ? (isNextGenTeacher ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.72)')
        : (isNextGenTeacher ? 'rgba(255,255,255,0.10)' : theme.border),
      backgroundColor: isGlass
        ? (isNextGenTeacher ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.60)')
        : (isNextGenTeacher ? 'rgba(255,255,255,0.05)' : theme.cardBackground || theme.surface),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: isGlass ? 12 : (isNextGenTeacher ? 14 : 2) },
      shadowOpacity: isGlass ? 0.18 : (isNextGenTeacher ? 0.35 : 0.06),
      shadowRadius: isGlass ? 20 : (isNextGenTeacher ? 24 : 6),
      elevation: isGlass ? 8 : (isNextGenTeacher ? 10 : 2),
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerIcon: {
      fontSize: 18,
      marginRight: 4,
    },
    headerTextBlock: {
      flex: 1,
    },
    headerTitle: {
      fontSize: isTablet ? 20 : isSmallScreen ? 18 : 19,
      fontWeight: '700',
      color: theme.text,
    },
    headerHint: {
      marginTop: 4,
      fontSize: isSmallScreen ? 11 : 12,
      color: isGlass
        ? (isNextGenTeacher ? 'rgba(234,240,255,0.80)' : '#334155')
        : (isNextGenTeacher ? 'rgba(234,240,255,0.72)' : theme.textSecondary),
    },
    actionButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    actionText: {
      fontSize: isSmallScreen ? 12 : 14,
      fontWeight: '600',
    },
  });
};

export default CollapsibleSection;
