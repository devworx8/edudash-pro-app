import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_CONFIG, type SubmissionCategory } from './types';

interface CategoryIconProps {
  category: SubmissionCategory;
  size?: number;
}

export function CategoryIcon({ category, size = 20 }: CategoryIconProps) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.theme_suggestion;

  return (
    <View style={[styles.container, { backgroundColor: config.color + '20' }]}>
      <Ionicons name={config.icon as any} size={size} color={config.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
