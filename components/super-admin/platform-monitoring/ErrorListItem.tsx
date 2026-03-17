import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ErrorSeverityBadge } from './ErrorSeverityBadge';
import { useStatusLabels } from '@/hooks/platform-monitoring';
import type { PlatformError } from '@/hooks/platform-monitoring';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface Props {
  error: PlatformError;
  theme: { colors: ThemeColors };
  onPress?: (error: PlatformError) => void;
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getStatusIcon(status: string): { name: string; color: string } {
  switch (status) {
    case 'auto_resolved': return { name: 'checkmark-circle', color: '#22C55E' };
    case 'resolved': return { name: 'checkmark-done-circle', color: '#22C55E' };
    case 'escalated': return { name: 'warning', color: '#F59E0B' };
    case 'diagnosing': return { name: 'search', color: '#8B5CF6' };
    case 'classifying': return { name: 'hourglass', color: '#3B82F6' };
    case 'acknowledged': return { name: 'person-circle', color: '#06B6D4' };
    case 'ignored': return { name: 'eye-off', color: '#6B7280' };
    default: return { name: 'alert-circle', color: '#EF4444' };
  }
}

export function ErrorListItem({ error, theme, onPress }: Props) {
  const statusLabels = useStatusLabels();
  const statusIcon = getStatusIcon(error.status);

  const handlePress = useCallback(() => onPress?.(error), [error, onPress]);

  const pathDisplay = error.request_path
    ? error.request_path.replace('/rest/v1/', '').replace('/functions/v1/', 'fn/')
    : 'unknown';

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: theme.colors.surface || '#1F2937' }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ErrorSeverityBadge severity={error.severity} compact />
          <Text style={[styles.method, { color: theme.colors.text || '#E5E7EB' }]}>
            {error.http_method || '???'} {error.http_status}
          </Text>
          <Text style={[styles.path, { color: theme.colors.textSecondary || '#9CA3AF' }]} numberOfLines={1}>
            {pathDisplay}
          </Text>
        </View>
        <Text style={[styles.time, { color: theme.colors.textSecondary || '#9CA3AF' }]}>
          {getTimeAgo(error.occurred_at)}
        </Text>
      </View>

      {error.ai_diagnosis ? (
        <Text style={[styles.diagnosis, { color: theme.colors.text || '#D1D5DB' }]} numberOfLines={2}>
          {error.ai_diagnosis}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.statusRow}>
          <Ionicons name={statusIcon.name as any} size={14} color={statusIcon.color} />
          <Text style={[styles.statusText, { color: statusIcon.color }]}>
            {statusLabels[error.status] || error.status}
          </Text>
        </View>

        <View style={styles.metaRow}>
          {error.assigned_team ? (
            <Text style={[styles.teamBadge, { color: '#93C5FD' }]}>
              {error.assigned_team}
            </Text>
          ) : null}
          {error.ai_confidence != null ? (
            <Text style={[styles.confidence, { color: theme.colors.textSecondary || '#6B7280' }]}>
              {Math.round(error.ai_confidence * 100)}% conf
            </Text>
          ) : null}
          {error.auto_fix_applied ? (
            <Ionicons name="flash" size={12} color="#22C55E" />
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  method: { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  path: { fontSize: 12, flex: 1 },
  time: { fontSize: 11 },
  diagnosis: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamBadge: { fontSize: 11, fontWeight: '500' },
  confidence: { fontSize: 10 },
});
