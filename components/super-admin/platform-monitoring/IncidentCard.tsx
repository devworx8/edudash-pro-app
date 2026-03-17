import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ErrorSeverityBadge } from './ErrorSeverityBadge';
import type { PlatformIncident } from '@/hooks/platform-monitoring';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface Props {
  incident: PlatformIncident;
  theme: { colors: ThemeColors };
  onPress?: (incident: PlatformIncident) => void;
}

function getIncidentStatusColor(status: string): string {
  switch (status) {
    case 'open': return '#EF4444';
    case 'investigating': return '#F59E0B';
    case 'mitigating': return '#3B82F6';
    case 'resolved': return '#22C55E';
    case 'postmortem': return '#8B5CF6';
    default: return '#6B7280';
  }
}

export function IncidentCard({ incident, theme, onPress }: Props) {
  const handlePress = useCallback(() => onPress?.(incident), [incident, onPress]);
  const statusColor = getIncidentStatusColor(incident.status);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface || '#1F2937', borderLeftColor: statusColor }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <ErrorSeverityBadge severity={incident.severity} compact />
        <Text style={[styles.title, { color: theme.colors.text || '#E5E7EB' }]} numberOfLines={1}>
          {incident.title}
        </Text>
      </View>

      {incident.description ? (
        <Text style={[styles.desc, { color: theme.colors.textSecondary || '#9CA3AF' }]} numberOfLines={2}>
          {incident.description}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.metaRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {incident.status.charAt(0).toUpperCase() + incident.status.slice(1)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="bug-outline" size={12} color="#9CA3AF" />
          <Text style={[styles.metaText, { color: theme.colors.textSecondary || '#9CA3AF' }]}>
            {incident.error_count} errors
          </Text>
          <Ionicons name="people-outline" size={12} color="#9CA3AF" />
          <Text style={[styles.metaText, { color: theme.colors.textSecondary || '#9CA3AF' }]}>
            {incident.affected_users} users
          </Text>
        </View>
      </View>

      {incident.ai_recommended_fix ? (
        <View style={styles.fixRow}>
          <Ionicons name="flash-outline" size={12} color="#8B5CF6" />
          <Text style={[styles.fixText, { color: '#C4B5FD' }]} numberOfLines={1}>
            {incident.ai_recommended_fix}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: { fontSize: 13, fontWeight: '700', flex: 1 },
  desc: { fontSize: 12, lineHeight: 16, marginBottom: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  metaText: { fontSize: 11 },
  fixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  fixText: { fontSize: 11, flex: 1 },
});
