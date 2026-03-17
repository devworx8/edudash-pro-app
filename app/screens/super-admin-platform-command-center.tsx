/**
 * Platform Command Center — Google/OpenAI-grade operations dashboard.
 * KPI grid → Error heatmap → Live incidents → Health + Distribution → AI Usage → Activity feed.
 *
 * All data logic in hooks/super-admin-command-center/.
 * Styles in lib/screen-styles/super-admin-command-center.styles.ts.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { createStyles } from '@/lib/screen-styles/super-admin-command-center.styles';
import {
  useCommandCenter, SEVERITY_COLORS,
  type KPICard, type ErrorHeatmapEntry, type LiveIncident,
  type PlatformHealthMetric, type RecentActivity,
} from '@/hooks/super-admin-command-center';

// ── Helpers ─────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

// ── Sub-components ──────────────────────────────────────────────────

function KPICardView({ kpi, styles }: { kpi: KPICard; styles: any }) {
  const maxSpark = Math.max(...(kpi.sparkline || [1]), 1);
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiIconRow}>
        <View style={[styles.kpiIconCircle, { backgroundColor: `${kpi.color}20` }]}>
          <Ionicons name={kpi.icon as any} size={16} color={kpi.color} />
        </View>
        {kpi.change !== undefined && (
          <View style={[styles.kpiChange, { backgroundColor: kpi.change >= 0 ? '#ef444418' : '#22c55e18' }]}>
            <Ionicons name={kpi.change >= 0 ? 'trending-up' : 'trending-down'} size={10} color={kpi.change >= 0 ? '#ef4444' : '#22c55e'} />
            <Text style={[styles.kpiChangeText, { color: kpi.change >= 0 ? '#ef4444' : '#22c55e' }]}>
              {Math.abs(kpi.change)}%
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.kpiValue}>{typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}</Text>
      <Text style={styles.kpiLabel}>{kpi.label}</Text>
      {kpi.sparkline && kpi.sparkline.length > 0 && (
        <View style={styles.kpiSparkline}>
          {kpi.sparkline.map((v, i) => (
            <View key={i} style={[styles.kpiSparkBar, { height: Math.max((v / maxSpark) * 18, 2), backgroundColor: `${kpi.color}${i === kpi.sparkline!.length - 1 ? 'CC' : '55'}` }]} />
          ))}
        </View>
      )}
    </View>
  );
}

function HeatmapCellView({ entry, styles }: { entry: ErrorHeatmapEntry; styles: any }) {
  return (
    <View style={styles.heatmapCell}>
      <View style={[styles.heatmapIconWrap, { backgroundColor: `${entry.color}20` }]}>
        <Ionicons name="alert-circle" size={18} color={entry.color} />
      </View>
      <View style={styles.heatmapInfo}>
        <Text style={styles.heatmapCategory}>{entry.category}</Text>
        <Text style={styles.heatmapCount}>{entry.count}</Text>
        <View style={styles.heatmapTrend}>
          <Ionicons name={entry.trend === 'up' ? 'arrow-up' : 'arrow-down'} size={10} color={entry.trend === 'up' ? '#ef4444' : '#22c55e'} />
          <Text style={[styles.heatmapTrendText, { color: entry.trend === 'up' ? '#ef4444' : '#22c55e' }]}>
            {entry.trend === 'up' ? 'Rising' : 'Falling'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function IncidentCard({ inc, styles }: { inc: LiveIncident; styles: any }) {
  const sevColor = SEVERITY_COLORS[inc.severity] ?? '#64748b';
  return (
    <View style={styles.incidentCard}>
      <View style={styles.incidentHeader}>
        <Text style={styles.incidentTitle} numberOfLines={1}>{inc.title}</Text>
        <View style={[styles.incidentSeverity, { backgroundColor: `${sevColor}30` }]}>
          <Text style={[styles.incidentSeverityText, { color: sevColor }]}>{inc.severity}</Text>
        </View>
      </View>
      <View style={styles.incidentMeta}>
        <View style={styles.incidentMetaItem}>
          <Ionicons name="bug" size={12} color="#94a3b8" />
          <Text style={styles.incidentMetaText}>{inc.errorCount} errors</Text>
        </View>
        <View style={styles.incidentMetaItem}>
          <Ionicons name="people" size={12} color="#94a3b8" />
          <Text style={styles.incidentMetaText}>{inc.affectedUsers} users</Text>
        </View>
        <Text style={styles.incidentStatus}>{inc.status}</Text>
        <Text style={styles.incidentMetaText}>{timeAgo(inc.lastSeen)}</Text>
      </View>
    </View>
  );
}

function HealthTile({ h, styles }: { h: PlatformHealthMetric; styles: any }) {
  return (
    <View style={styles.healthCard}>
      <Ionicons name={h.icon as any} size={20} color={h.color} />
      <View style={[styles.healthDot, { backgroundColor: h.color }]} />
      <Text style={styles.healthName}>{h.name}</Text>
      <Text style={styles.healthStatus}>{h.status}</Text>
    </View>
  );
}

function ActivityRow({ a, styles }: { a: RecentActivity; styles: any }) {
  return (
    <View style={styles.activityItem}>
      <View style={[styles.activityIcon, { backgroundColor: `${a.color}20` }]}>
        <Ionicons name={a.icon as any} size={14} color={a.color} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityAction}>{a.actionLabel}</Text>
        <Text style={styles.activityActor}>{a.actorName} · {a.actorRole}</Text>
        {!!a.detail && <Text style={styles.activityDetail}>{a.detail}</Text>}
      </View>
      <Text style={styles.activityTime}>{timeAgo(a.timestamp)}</Text>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default function PlatformCommandCenterScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { data, isLoading, isRefreshing, error, refetch, onRefresh } = useCommandCenter();

  if (!isSuperAdmin(profile?.role)) {
    return (
      <SafeAreaView style={styles.deniedContainer}>
        <ThemedStatusBar />
        <Text style={styles.deniedText}>Access Denied</Text>
      </SafeAreaView>
    );
  }

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.container}>
        <ThemedStatusBar />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size={44} />
          <Text style={styles.loadingText}>Loading Command Center…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.container}>
        <ThemedStatusBar />
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline" size={40} color="#ef4444" />
          <Text style={styles.errorText}>Failed to load data</Text>
          <Text style={styles.errorSubText}>{error.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const d = data!;

  return (
    <SafeAreaView style={styles.container}>
      <ThemedStatusBar />
      {/* Background blobs */}
      <View style={styles.bgLayer} pointerEvents="none">
        <View style={styles.bgBlobA} />
        <View style={styles.bgBlobB} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Platform Command Center</Text>
          <Text style={styles.headerSubtitle}>
            {d.onlineNow} online · {d.totalErrors24h} errors (24h) · {d.autoResolved24h} auto-fixed
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── KPI Cards ── */}
        <SectionHeader title="Key Metrics" styles={styles} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
          {d.kpis.map(k => <KPICardView key={k.id} kpi={k} styles={styles} />)}
        </ScrollView>

        {/* ── Error Heatmap ── */}
        {d.errorHeatmap.length > 0 && (
          <>
            <SectionHeader title="Error Heatmap (24h)" badge={d.totalErrors24h} styles={styles} />
            <View style={styles.heatmapGrid}>
              {d.errorHeatmap.map((e, i) => <HeatmapCellView key={i} entry={e} styles={styles} />)}
            </View>
          </>
        )}

        {/* ── Live Incidents ── */}
        <SectionHeader title="Live Incidents" badge={d.liveIncidents.length || undefined} styles={styles} />
        {d.liveIncidents.length === 0 ? (
          <View style={styles.noIncidents}>
            <Ionicons name="checkmark-circle" size={28} color="#22c55e" />
            <Text style={styles.noIncidentsText}>All clear — no active incidents</Text>
          </View>
        ) : (
          d.liveIncidents.map(inc => <IncidentCard key={inc.id} inc={inc} styles={styles} />)
        )}

        {/* ── Platform Health ── */}
        <SectionHeader title="Platform Health" styles={styles} />
        <View style={styles.healthGrid}>
          {d.health.map((h, i) => <HealthTile key={i} h={h} styles={styles} />)}
        </View>

        {/* ── Role & Tier Distribution (side by side) ── */}
        <SectionHeader title="User Distribution" styles={styles} />
        <View style={styles.distRow}>
          <View style={styles.distCard}>
            <Text style={styles.distTitle}>By Role</Text>
            {d.roleDistribution.slice(0, 6).map(r => (
              <View key={r.role} style={styles.distItem}>
                <View style={[styles.distDot, { backgroundColor: r.color }]} />
                <Text style={styles.distLabel}>{r.role}</Text>
                <Text style={styles.distValue}>{r.count}</Text>
              </View>
            ))}
          </View>
          <View style={styles.distCard}>
            <Text style={styles.distTitle}>By Tier</Text>
            {d.tierDistribution.slice(0, 6).map(t => (
              <View key={t.tier} style={styles.distItem}>
                <View style={[styles.distDot, { backgroundColor: t.color }]} />
                <Text style={styles.distLabel}>{t.tier}</Text>
                <Text style={styles.distValue}>{t.count}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── AI Usage Meters ── */}
        <SectionHeader title="AI Usage" styles={styles} />
        <View style={styles.aiUsageRow}>
          {d.aiUsage.map((ai, i) => (
            <View key={i} style={styles.aiUsageCard}>
              <Text style={styles.aiUsageLabel}>{ai.label}</Text>
              <Text style={styles.aiUsageValue}>{ai.value.toLocaleString()}</Text>
              <View style={styles.aiProgressBar}>
                <View style={[styles.aiProgressFill, { width: `${Math.min((ai.value / ai.limit) * 100, 100)}%`, backgroundColor: ai.color }]} />
              </View>
            </View>
          ))}
        </View>

        {/* ── Recent Activity Feed ── */}
        <SectionHeader title="Recent Activity" styles={styles} />
        {d.recentActivity.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={28} color="#64748b" />
            <Text style={styles.emptyText}>No recent activity</Text>
          </View>
        ) : (
          d.recentActivity.map(a => <ActivityRow key={a.id} a={a} styles={styles} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Section Header ──────────────────────────────────────────────────

function SectionHeader({ title, badge, styles }: { title: string; badge?: number; styles: any }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {badge !== undefined && badge > 0 && (
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{badge}</Text>
        </View>
      )}
    </View>
  );
}
