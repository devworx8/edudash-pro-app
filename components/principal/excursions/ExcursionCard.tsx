// Excursion Card Component
// Displays individual excursion in a list

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { Excursion } from './types';
import { STATUS_COLORS, STATUS_LABELS, isPreflightComplete } from './types';

interface ExcursionCardProps {
  excursion: Excursion;
  onPress: (excursion: Excursion) => void;
  onApprove?: (excursion: Excursion) => void;
  onDelete: (excursion: Excursion) => void;
}

export function ExcursionCard({ excursion, onPress, onApprove, onDelete }: ExcursionCardProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(excursion)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{excursion.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[excursion.status] + '20' }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[excursion.status] }]}>
              {STATUS_LABELS[excursion.status]}
            </Text>
          </View>
        </View>
        <View style={styles.cardMeta}>
          <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
          <Text style={styles.cardMetaText}>{excursion.destination}</Text>
        </View>
        <View style={styles.cardMeta}>
          <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
          <Text style={styles.cardMetaText}>
            {new Date(excursion.excursion_date).toLocaleDateString('en-ZA', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        {(excursion.departure_time || excursion.return_time) && (
          <View style={styles.cardMeta}>
            <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
            <Text style={styles.cardMetaText}>
              {excursion.departure_time ? `Depart ${excursion.departure_time}` : ''}
              {excursion.departure_time && excursion.return_time ? ' — ' : ''}
              {excursion.return_time ? `Return ${excursion.return_time}` : ''}
            </Text>
          </View>
        )}
        {excursion.estimated_cost_per_child > 0 && (
          <View style={styles.cardMeta}>
            <Ionicons name="cash-outline" size={16} color={theme.textSecondary} />
            <Text style={styles.cardMetaText}>
              R{excursion.estimated_cost_per_child.toFixed(2)} per child
            </Text>
          </View>
        )}
        {Array.isArray(excursion.age_groups) && excursion.age_groups.length > 0 && (
          <View style={styles.cardMeta}>
            <Ionicons name="people-outline" size={16} color={theme.textSecondary} />
            <Text style={styles.cardMetaText}>
              Ages: {excursion.age_groups.join(', ')}
            </Text>
          </View>
        )}
      </View>

      {excursion.learning_objectives && excursion.learning_objectives.length > 0 && (
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionTitle}>Learning Objectives:</Text>
          <Text style={styles.cardSectionText}>
            {excursion.learning_objectives.join(' • ')}
          </Text>
        </View>
      )}

      <View style={styles.cardActions}>
        {excursion.status === 'draft' && onApprove && (
          <>
            {!isPreflightComplete(excursion.preflight_checks) && (
              <Text style={styles.preflightHint}>Complete preflight checklist to approve</Text>
            )}
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: isPreflightComplete(excursion.preflight_checks) ? '#10b98120' : '#6b728020',
                },
              ]}
              onPress={() => onApprove(excursion)}
              disabled={!isPreflightComplete(excursion.preflight_checks)}
            >
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={isPreflightComplete(excursion.preflight_checks) ? '#10b981' : '#6b7280'}
              />
              <Text
                style={[
                  styles.actionButtonText,
                  { color: isPreflightComplete(excursion.preflight_checks) ? '#10b981' : '#6b7280' },
                ]}
              >
                Approve
              </Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#ef444420' }]}
          onPress={() => onDelete(excursion)}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={[styles.actionButtonText, { color: '#ef4444' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    cardHeader: {
      marginBottom: 12,
    },
    cardTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      flex: 1,
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
    },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    cardMetaText: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    cardSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    cardSectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
      marginBottom: 4,
    },
    cardSectionText: {
      fontSize: 14,
      color: theme.text,
    },
    cardActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 16,
      gap: 8,
    },
    preflightHint: {
      fontSize: 12,
      color: theme.textSecondary,
      flex: 1,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      gap: 6,
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: '500',
    },
  });
