/**
 * Reusable Screen Header Component
 * 
 * Provides consistent header with back button, title, and optional actions
 * Use this for screens that don't use RoleBasedHeader
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/Colors';
import { navigateBack } from '@/lib/navigation';
import { useTheme } from '@/contexts/ThemeContext';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightAction?: React.ReactNode;
  backgroundColor?: string;
  textColor?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  showBackButton = true,
  onBackPress,
  rightAction,
  backgroundColor,
  textColor,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigateBack();
    }
  };

  const headerBgColor = backgroundColor || theme.headerBackground;
  const headerTextColor = textColor || theme.headerText;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : headerBgColor,
        },
      ]}
    >
      {/* Glass blur backdrop on iOS */}
      {Platform.OS === 'ios' && isDark && (
        <BlurView
          intensity={30}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />
      )}

      <View style={styles.content}>
        {/* Left Section - Back Button */}
        <View style={styles.leftSection}>
          {showBackButton && (
            <TouchableOpacity
              onPress={handleBackPress}
              style={[styles.backButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons
                name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                size={22}
                color={headerTextColor}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: headerTextColor }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[styles.subtitle, { color: theme.textSecondary || Colors.light.tabIconDefault }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right Section - Actions */}
        <View style={styles.rightSection}>{rightAction}</View>
      </View>

      {/* Bottom gradient fade — soft transition instead of hard border */}
      {isDark && (
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
          style={styles.bottomFade}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 16,
    zIndex: 2,
  },
  leftSection: {
    width: 44,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  titleSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.7,
  },
  rightSection: {
    width: 44,
    alignItems: 'flex-end',
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});

/**
 * Simple header with just back button and title
 */
export function SimpleHeader({ title, onBackPress }: { title: string; onBackPress?: () => void }) {
  return <ScreenHeader title={title} showBackButton={true} onBackPress={onBackPress} />;
}