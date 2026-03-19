/**
 * DashVoiceFlowPreview — Correction flash overlay for Flow Mode.
 *
 * Shows a brief animated indicator when auto-correction transforms the
 * raw transcript (e.g. filler removal, grammar fixes). Disappears
 * automatically after ~1.8s.
 *
 * @module components/dash-voice/DashVoiceFlowPreview
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FlowCorrectionFlash } from '@/hooks/dash-voice/useDashVoiceFlowMode';

interface Props {
  flash: FlowCorrectionFlash | null;
  theme: {
    surface: string;
    text: string;
    primary: string;
    border: string;
  };
}

export function DashVoiceFlowPreview({ flash, theme }: Props) {
  if (!flash) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={14} color={theme.primary} />
        <Text style={[styles.label, { color: theme.primary }]}>Auto-corrected</Text>
      </View>
      <Text style={[styles.corrected, { color: theme.text }]} numberOfLines={2}>
        {flash.corrected}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    opacity: 0.95,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  corrected: {
    fontSize: 14,
    lineHeight: 20,
  },
});
