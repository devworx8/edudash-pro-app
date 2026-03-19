import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { STATUS_CONFIG, type SubmissionStatus } from './types';

interface StatusBadgeProps {
  status: SubmissionStatus;
  size?: 'small' | 'medium';
}

export function StatusBadge({ status, size = 'medium' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const isSmall = size === 'small';

  return (
    <View style={[styles.badge, { backgroundColor: config.bgColor }, isSmall && styles.badgeSmall]}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.label, { color: config.color }, isSmall && styles.labelSmall]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  badgeSmall: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  labelSmall: {
    fontSize: 10,
  },
});
