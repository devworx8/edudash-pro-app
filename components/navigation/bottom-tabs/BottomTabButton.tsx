import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AnimatedTabIcon } from './AnimatedTabIcon';
import type { BottomTabBarStyles } from './styles';

interface BottomTabButtonProps {
  label: string;
  icon: string;
  activeIcon: string;
  route: string;
  active: boolean;
  badgeCount: number;
  iconSize: number;
  navActiveColor: string;
  navInactiveColor: string;
  styles: BottomTabBarStyles;
  onPress: (route: string) => void;
}

export function BottomTabButton({
  label,
  icon,
  activeIcon,
  route,
  active,
  badgeCount,
  iconSize,
  navActiveColor,
  navInactiveColor,
  styles,
  onPress,
}: BottomTabButtonProps) {
  return (
    <TouchableOpacity style={styles.tab} onPress={() => onPress(route)} activeOpacity={0.76}>
      {active ? <View style={styles.activeIndicator} /> : null}
      <View style={[styles.iconContainer, styles.badgeWrapper]}>
        <AnimatedTabIcon
          name={active ? activeIcon : icon}
          size={iconSize}
          color={active ? navActiveColor : navInactiveColor}
          active={active}
        />
        {badgeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : String(badgeCount)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
