import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import { clampPercent, percentWidth } from '@/lib/progress/clampPercent';
import { track } from '@/lib/analytics';

export type FeatureQuotaBarProps = {
  feature: string;
  used: number;
  limit: number;
  remaining: number;
  periodLabel: string;
  refreshKey?: number | string;
  onRefresh?: () => Promise<void> | void;
};

function getStatusColor(percentage: number): string {
  if (percentage >= 100) return '#EF4444';
  if (percentage >= 80) return '#F59E0B';
  return '#10B981';
}

export function FeatureQuotaBar({
  feature,
  used,
  limit,
  remaining,
  periodLabel,
  refreshKey,
  onRefresh,
}: FeatureQuotaBarProps) {
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const safeLimit = Number.isFinite(limit) ? Number(limit) : 0;
  const isUnlimited = safeLimit < 0;
  const safeRemaining = Number.isFinite(remaining) ? Number(remaining) : 0;

  useEffect(() => {
    if (!onRefresh) return;
    let cancelled = false;
    const run = async () => {
      try {
        setRefreshing(true);
        await onRefresh();
      } catch (error) {
        track('quota.refresh_failed', {
          source: 'components/ai/FeatureQuotaBar',
          feature,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, onRefresh, feature]);

  const percent = useMemo(() => {
    if (isUnlimited || safeLimit <= 0) return 0;
    return clampPercent((safeUsed / safeLimit) * 100, {
      source: `FeatureQuotaBar.${feature}`,
    });
  }, [safeUsed, safeLimit, feature, isUnlimited]);

  const color = getStatusColor(percent);
  const usedLabel = isUnlimited ? `${safeUsed}/∞ used` : `${safeUsed}/${Math.max(0, safeLimit)} used`;
  const remainingLabel = isUnlimited
    ? `Unlimited this ${periodLabel}`
    : `${Math.max(0, safeRemaining)} remaining this ${periodLabel}`;

  return (
    <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.headerRow}>
        <View style={styles.labelWrap}>
          <Ionicons name="flash-outline" size={14} color={color} />
          <Text style={[styles.label, { color: theme.text }]}>{feature}</Text>
        </View>
        {onRefresh && (
          <TouchableOpacity
            onPress={() => {
              if (!onRefresh) return;
              setRefreshing(true);
              Promise.resolve(onRefresh())
                .catch((error) => {
                  track('quota.refresh_failed', {
                    source: 'components/ai/FeatureQuotaBar.manual',
                    feature,
                    error: error instanceof Error ? error.message : String(error),
                  });
                })
                .finally(() => setRefreshing(false));
            }}
            accessibilityRole="button"
            accessibilityLabel={`Refresh ${feature} quota`}
            style={styles.refreshBtn}
          >
            <Ionicons name="refresh" size={14} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View
        style={[styles.track, { backgroundColor: theme.border }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      >
        <View style={[styles.fill, { width: percentWidth(percent), backgroundColor: color }]} />
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
          {usedLabel}
        </Text>
        <Text style={[styles.metaText, { color }]}>
          {remainingLabel}
          {refreshing ? ' • refreshing…' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  refreshBtn: {
    padding: 2,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaText: {
    fontSize: 11,
  },
});

export default FeatureQuotaBar;
