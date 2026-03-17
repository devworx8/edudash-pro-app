import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSeverityColors } from '@/hooks/platform-monitoring';
import type { ErrorSeverity } from '@/hooks/platform-monitoring';

interface Props {
  severity: ErrorSeverity;
  compact?: boolean;
}

export function ErrorSeverityBadge({ severity, compact = false }: Props) {
  const colors = useSeverityColors();
  const c = colors[severity] || colors.medium;

  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }, compact && styles.compact]}>
      <Text style={[styles.text, { color: c.text }, compact && styles.compactText]}>
        {severity.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  compact: { paddingHorizontal: 5, paddingVertical: 1 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  compactText: { fontSize: 9 },
});
