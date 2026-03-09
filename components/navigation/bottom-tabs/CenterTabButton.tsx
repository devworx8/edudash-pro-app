import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import type { BottomTabBarStyles } from './styles';

interface CenterTabButtonProps {
  label: string;
  route: string;
  active: boolean;
  orbSize: number;
  styles: BottomTabBarStyles;
  onPress: (route: string) => void;
  onLongPress: () => void;
}

export function CenterTabButton({
  label,
  route,
  active,
  orbSize,
  styles,
  onPress,
  onLongPress,
}: CenterTabButtonProps) {
  return (
    <TouchableOpacity
      style={styles.centerTab}
      onPress={() => onPress(route)}
      onLongPress={onLongPress}
      delayLongPress={260}
      activeOpacity={0.82}
    >
      <View style={[styles.centerOrbWrapper, active && styles.centerOrbWrapperActive]}>
        <CosmicOrb size={orbSize} isProcessing={false} isSpeaking={false} />
      </View>
      <Text style={[styles.centerLabel, active && styles.centerLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
