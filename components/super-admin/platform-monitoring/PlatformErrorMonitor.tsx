import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  usePlatformErrors,
  usePlatformIncidents,
  usePlatformErrorStats,
  usePlatformErrorActions,
} from '@/hooks/platform-monitoring';
import type { ErrorMonitorFilters, PlatformError, PlatformIncident } from '@/hooks/platform-monitoring';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { ErrorStatsCards } from './ErrorStatsCards';
import { ErrorListItem } from './ErrorListItem';
import { IncidentCard } from './IncidentCard';

interface Props {
  theme: { colors: ThemeColors };
  onErrorPress?: (error: PlatformError) => void;
  onIncidentPress?: (incident: PlatformIncident) => void;
}

type TabKey = 'overview' | 'errors' | 'incidents';
type TimeRange = ErrorMonitorFilters['time_range'];

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: 'last_hour', label: '1h' },
  { key: 'last_6h', label: '6h' },
  { key: 'last_24h', label: '24h' },
  { key: 'last_7d', label: '7d' },
];

export function PlatformErrorMonitor({ theme, onErrorPress, onIncidentPress }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('last_24h');
  const [filters] = useState<ErrorMonitorFilters>({});

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = usePlatformErrorStats();
  const { data: errors, isLoading: errorsLoading, refetch: refetchErrors } = usePlatformErrors({
    ...filters,
    time_range: timeRange,
  });
  const { data: incidents, isLoading: incidentsLoading, refetch: refetchIncidents } = usePlatformIncidents();
  const { triggerScan } = usePlatformErrorActions();

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchErrors(), refetchIncidents()]);
    setRefreshing(false);
  }, [refetchStats, refetchErrors, refetchIncidents]);

  const handleTriggerScan = useCallback(() => {
    triggerScan.mutate({});
  }, [triggerScan]);

  const tc = theme.colors;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: tc.text || '#F3F4F6' }]}>Error Monitor</Text>
          <Text style={[styles.subtitle, { color: tc.textSecondary || '#9CA3AF' }]}>
            3-tier AI-powered error detection
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.scanBtn, triggerScan.isPending && styles.scanBtnDisabled]}
          onPress={handleTriggerScan}
          disabled={triggerScan.isPending}
        >
          {triggerScan.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="search-outline" size={16} color="#fff" />
          )}
          <Text style={styles.scanBtnText}>
            {triggerScan.isPending ? 'Scanning...' : 'Scan Now'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['overview', 'errors', 'incidents'] as TabKey[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'overview' ? 'Overview' : tab === 'errors' ? `Errors${errors?.length ? ` (${errors.length})` : ''}` : `Incidents${incidents?.length ? ` (${incidents.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Time range selector */}
      {activeTab !== 'overview' && (
        <View style={styles.timeRow}>
          {TIME_RANGES.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.timeBtn, timeRange === key && styles.timeBtnActive]}
              onPress={() => setTimeRange(key)}
            >
              <Text style={[styles.timeBtnText, timeRange === key && styles.timeBtnTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {activeTab === 'overview' && (
        <View style={styles.overviewContent}>
          {statsLoading ? (
            <ActivityIndicator color={tc.primary || '#3B82F6'} />
          ) : stats ? (
            <>
              <ErrorStatsCards stats={stats} theme={theme} />

              {/* Category breakdown */}
              <Text style={[styles.sectionTitle, { color: tc.text || '#E5E7EB' }]}>By Category</Text>
              <View style={styles.breakdownRow}>
                {Object.entries(stats.by_category).map(([cat, count]) => (
                  <View key={cat} style={[styles.breakdownItem, { backgroundColor: tc.surface || '#1F2937' }]}>
                    <Text style={[styles.breakdownCount, { color: tc.text || '#E5E7EB' }]}>{count}</Text>
                    <Text style={[styles.breakdownLabel, { color: tc.textSecondary || '#9CA3AF' }]}>{cat}</Text>
                  </View>
                ))}
              </View>

              {/* Team breakdown */}
              <Text style={[styles.sectionTitle, { color: tc.text || '#E5E7EB' }]}>By Team</Text>
              <View style={styles.breakdownRow}>
                {Object.entries(stats.by_team).map(([team, count]) => (
                  <View key={team} style={[styles.breakdownItem, { backgroundColor: tc.surface || '#1F2937' }]}>
                    <Text style={[styles.breakdownCount, { color: tc.text || '#E5E7EB' }]}>{count}</Text>
                    <Text style={[styles.breakdownLabel, { color: tc.textSecondary || '#9CA3AF' }]}>{team}</Text>
                  </View>
                ))}
              </View>

              {/* Recent incidents */}
              {incidents?.length ? (
                <>
                  <Text style={[styles.sectionTitle, { color: tc.text || '#E5E7EB' }]}>Open Incidents</Text>
                  {incidents.slice(0, 3).map((inc) => (
                    <IncidentCard key={inc.id} incident={inc} theme={theme} onPress={onIncidentPress} />
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <Text style={[styles.emptyText, { color: tc.textSecondary || '#6B7280' }]}>
              No monitoring data yet. Run a scan to start.
            </Text>
          )}
        </View>
      )}

      {activeTab === 'errors' && (
        <FlatList
          data={errors || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ErrorListItem error={item} theme={theme} onPress={onErrorPress} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={tc.primary || '#3B82F6'} />
          }
          ListEmptyComponent={
            errorsLoading ? (
              <ActivityIndicator color={tc.primary || '#3B82F6'} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="checkmark-circle-outline" size={48} color="#22C55E" />
                <Text style={[styles.emptyTitle, { color: tc.text || '#E5E7EB' }]}>All Clear</Text>
                <Text style={[styles.emptyText, { color: tc.textSecondary || '#6B7280' }]}>
                  No errors detected in this time range.
                </Text>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {activeTab === 'incidents' && (
        <FlatList
          data={incidents || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <IncidentCard incident={item} theme={theme} onPress={onIncidentPress} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={tc.primary || '#3B82F6'} />
          }
          ListEmptyComponent={
            incidentsLoading ? (
              <ActivityIndicator color={tc.primary || '#3B82F6'} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="shield-checkmark-outline" size={48} color="#22C55E" />
                <Text style={[styles.emptyTitle, { color: tc.text || '#E5E7EB' }]}>No Open Incidents</Text>
                <Text style={[styles.emptyText, { color: tc.textSecondary || '#6B7280' }]}>
                  All incidents have been resolved.
                </Text>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanBtnDisabled: { opacity: 0.6 },
  scanBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tabRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#374151',
  },
  tabActive: { backgroundColor: '#3B82F6' },
  tabText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  timeRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
  },
  timeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#1F2937',
  },
  timeBtnActive: { backgroundColor: '#4B5563' },
  timeBtnText: { color: '#6B7280', fontSize: 12, fontWeight: '500' },
  timeBtnTextActive: { color: '#E5E7EB' },
  overviewContent: { paddingBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  breakdownItem: {
    borderRadius: 8,
    padding: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  breakdownCount: { fontSize: 18, fontWeight: '700' },
  breakdownLabel: { fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  listContent: { paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center' },
});
