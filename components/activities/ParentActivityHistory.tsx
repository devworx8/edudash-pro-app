/**
 * ParentActivityHistory
 *
 * Shows list of activities the child has completed in playground mode.
 * Each row displays: activity name, domain icon, stars earned, date, and time spent.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useParentActivityHistory, CompletedActivity } from '@/hooks/activities/useParentActivityHistory';

interface ParentActivityHistoryProps {
  childId: string | null;
  theme: {
    text: string;
    textSecondary: string;
    surface: string;
    background: string;
    border: string;
    primary: string;
    warning?: string;
  };
}

const DOMAIN_ICONS: Record<string, { icon: string; color: string }> = {
  literacy: { icon: 'book-outline', color: '#6366f1' },
  numeracy: { icon: 'calculator-outline', color: '#f59e0b' },
  science: { icon: 'flask-outline', color: '#10b981' },
  'life_skills': { icon: 'heart-outline', color: '#ec4899' },
  creative: { icon: 'color-palette-outline', color: '#8b5cf6' },
  physical: { icon: 'football-outline', color: '#ef4444' },
  general: { icon: 'shapes-outline', color: '#64748b' },
};

function getDomainIcon(domain: string): { icon: string; color: string } {
  const key = domain.toLowerCase().replace(/\s+/g, '_');
  return DOMAIN_ICONS[key] || DOMAIN_ICONS.general;
}

function formatDate(dateString: string): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimeSpent(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function renderStars(count: number, color: string): React.ReactNode {
  const stars = [];
  for (let i = 0; i < 3; i++) {
    stars.push(
      <Ionicons
        key={`star-${i}`}
        name={i < count ? 'star' : 'star-outline'}
        size={14}
        color={i < count ? (color || '#f59e0b') : '#d1d5db'}
      />
    );
  }
  return <View style={styles.starsRow}>{stars}</View>;
}

export function ParentActivityHistory({ childId, theme }: ParentActivityHistoryProps) {
  const { activities, loading, refresh } = useParentActivityHistory(childId);

  const renderItem = ({ item }: { item: CompletedActivity }) => {
    const domainInfo = getDomainIcon(item.domain);

    return (
      <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.domainBadge, { backgroundColor: domainInfo.color + '1a' }]}>
          <Ionicons name={domainInfo.icon as any} size={20} color={domainInfo.color} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.activityName, { color: theme.text }]} numberOfLines={1}>
            {item.activityName}
          </Text>
          <View style={styles.rowMeta}>
            {renderStars(item.starsEarned, theme.warning || '#f59e0b')}
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              {formatDate(item.completedAt)}
            </Text>
            {item.timeSpentMinutes !== null && (
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {formatTimeSpent(item.timeSpentMinutes)}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading && activities.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!loading && activities.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="game-controller-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No completed activities yet</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Explore the playground to get started!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Activity History</Text>
        <TouchableOpacity onPress={refresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="refresh-outline" size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>
      <FlashList
        data={activities}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={80}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  domainBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    gap: 4,
  },
  activityName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  metaText: {
    fontSize: 12,
  },
  centeredContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
  },
});
