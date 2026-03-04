/**
 * DashboardSkeleton — full-page loading placeholder matching the dashboard layout.
 *
 * Shows shimmer skeletons for: stat tiles, quick action cards, and content cards.
 * Uses Reanimated-powered SkeletonLoader for 60 fps shimmer on the native thread.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { SkeletonLoader, SkeletonCard, SkeletonStats } from './SkeletonLoader';

interface DashboardSkeletonProps {
  /** Number of stat tiles to show (default 4) */
  statCount?: number;
  /** Number of content cards to show (default 3) */
  cardCount?: number;
  /** Show quick-action row (default true) */
  showActions?: boolean;
}

export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({
  statCount = 4,
  cardCount = 3,
  showActions = true,
}) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      {/* Header skeleton */}
      <View style={styles.header}>
        <SkeletonLoader width={180} height={28} borderRadius={8} />
        <SkeletonLoader width={120} height={16} borderRadius={6} style={{ marginTop: 8 }} />
      </View>

      {/* Stat tiles row */}
      <View style={styles.statsRow}>
        {Array.from({ length: statCount }).map((_, i) => (
          <View key={`stat-${i}`} style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SkeletonLoader width={36} height={36} borderRadius={18} />
            <SkeletonLoader width={48} height={22} borderRadius={6} style={{ marginTop: 10 }} />
            <SkeletonLoader width={64} height={12} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Quick action pills */}
      {showActions && (
        <View style={styles.actionsRow}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={`action-${i}`} style={[styles.actionPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SkeletonLoader width={24} height={24} borderRadius={12} />
              <SkeletonLoader width={80} height={14} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      )}

      {/* Content cards */}
      {Array.from({ length: cardCount }).map((_, i) => (
        <View key={`card-${i}`} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <SkeletonLoader width={140} height={20} borderRadius={6} />
            <SkeletonLoader width={60} height={14} borderRadius={4} />
          </View>
          <SkeletonLoader width="100%" height={14} borderRadius={4} style={{ marginTop: 14 }} />
          <SkeletonLoader width="85%" height={14} borderRadius={4} style={{ marginTop: 8 }} />
          <SkeletonLoader width="60%" height={14} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  header: {
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionPill: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

export default DashboardSkeleton;
