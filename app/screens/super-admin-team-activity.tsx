/**
 * Team Activity — timeline-based audit log for super admins.
 * Glass-effect dark theme, responsive breakpoints, date-grouped timeline.
 *
 * Data: hooks/super-admin-team-activity/
 * Styles: lib/screen-styles/super-admin-team-activity.styles.ts
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isPlatformStaff } from '@/lib/roleUtils';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { createStyles } from '@/lib/screen-styles/super-admin-team-activity.styles';
import { ratioToPercent } from '@/lib/progress/clampPercent';
import {
  useSuperAdminTeamActivity,
  ACTIVITY_FILTERS,
  getActionConfig,
  type PlatformActivity,
  type ActivityGroup,
  type ActivityStats,
} from '@/hooks/super-admin-team-activity';

// ── Helpers ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

// ── Sub-components ──────────────────────────────────────────────────

function StatCard({
  value,
  label,
  icon,
  color,
  styles,
}: {
  value: number;
  label: string;
  icon: string;
  color: string;
  styles: any;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconRow}>
        <View style={[styles.statIconCircle, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon as any} size={16} color={color} />
        </View>
      </View>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActivityPulse({ hourly, styles }: { hourly: number[]; styles: any }) {
  const maxVal = Math.max(...hourly, 1);
  return (
    <View style={styles.pulseRow}>
      <View style={styles.pulseCard}>
        <Text style={styles.pulseTitle}>Activity Pulse (24h)</Text>
        <View style={styles.pulseBarRow}>
          {hourly.map((v, i) => (
            <View
              key={i}
              style={[
                styles.pulseBar,
                {
                  height: Math.max((v / maxVal) * 32, 2),
                  backgroundColor:
                    v > 0
                      ? `rgba(139,92,246,${0.3 + (v / maxVal) * 0.7})`
                      : 'rgba(255,255,255,0.04)',
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.pulseLabels}>
          <Text style={styles.pulseLabel}>12am</Text>
          <Text style={styles.pulseLabel}>6am</Text>
          <Text style={styles.pulseLabel}>12pm</Text>
          <Text style={styles.pulseLabel}>6pm</Text>
          <Text style={styles.pulseLabel}>11pm</Text>
        </View>
      </View>
    </View>
  );
}

function InsightsRow({ stats, styles }: { stats: ActivityStats; styles: any }) {
  const categories = ACTIVITY_FILTERS.filter((f) => f.id !== 'all');
  const maxCat = Math.max(...categories.map((c) => stats.byCategory[c.id] || 0), 1);

  return (
    <View style={styles.insightsRow}>
      {/* Top Actor */}
      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>Most Active</Text>
        {stats.topActor ? (
          <View style={styles.topActorRow}>
            <View style={[styles.topActorAvatar, { backgroundColor: '#8b5cf620' }]}>
              <Ionicons name="person" size={18} color="#8b5cf6" />
            </View>
            <View>
              <Text style={styles.topActorName}>{stats.topActor.name}</Text>
              <Text style={styles.topActorCount}>{stats.topActor.count} actions this week</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.topActorCount}>No activity yet</Text>
        )}
      </View>

      {/* Category Breakdown */}
      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>By Category</Text>
        {categories.map((cat) => {
          const count = stats.byCategory[cat.id] || 0;
          return (
            <View key={cat.id} style={styles.categoryRow}>
              <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              <Text style={styles.categoryValue}>{count}</Text>
              <View style={styles.categoryBarBg}>
                <View
                  style={[
                    styles.categoryBarFill,
                    { width: `${ratioToPercent(count, maxCat)}%`, backgroundColor: cat.color },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FilterBar({
  filter,
  setFilter,
  stats,
  styles,
}: {
  filter: string;
  setFilter: (f: any) => void;
  stats: ActivityStats;
  styles: any;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterScroll}
    >
      {ACTIVITY_FILTERS.map((f) => {
        const isActive = filter === f.id;
        const count = stats.byCategory[f.id] ?? 0;
        return (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, isActive && styles.filterChipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Ionicons name={f.icon as any} size={14} color={isActive ? f.color : '#64748b'} />
            <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{f.label}</Text>
            {count > 0 && (
              <View style={[styles.filterBadge, isActive && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                  {count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function DateGroupHeader({ group, styles }: { group: ActivityGroup; styles: any }) {
  return (
    <View style={styles.dateHeader}>
      <View style={styles.dateHeaderDot} />
      <Text style={styles.dateHeaderText}>{group.title}</Text>
      <Text style={styles.dateHeaderCount}>{group.activities.length} actions</Text>
      <View style={styles.dateHeaderLine} />
    </View>
  );
}

function ActivityTimelineItem({
  activity,
  isLast,
  styles,
}: {
  activity: PlatformActivity;
  isLast: boolean;
  styles: any;
}) {
  const config = getActionConfig(activity.action);
  const meta = activity.metadata || {};
  const detail = (meta.email ||
    meta.entity_name ||
    meta.description ||
    activity.entity_id ||
    '') as string;

  return (
    <View style={styles.activityRow}>
      {/* Timeline connector */}
      <View style={styles.timelineTrack}>
        <View style={styles.timelineLine} />
        <View
          style={[
            styles.timelineNode,
            { borderColor: config.color, backgroundColor: `${config.color}30` },
          ]}
        />
        {!isLast && <View style={styles.timelineLine} />}
      </View>

      {/* Card */}
      <View style={styles.activityCard}>
        <View style={styles.activityCardHeader}>
          <View style={[styles.activityIcon, { backgroundColor: `${config.color}20` }]}>
            <Ionicons name={config.icon as any} size={14} color={config.color} />
          </View>
          <Text style={styles.activityLabel}>{config.label}</Text>
          <Text style={styles.activityTime}>{timeAgo(activity.created_at)}</Text>
        </View>
        <View style={styles.activityMeta}>
          <Text style={styles.activityActor}>{activity.actor?.full_name || 'System'}</Text>
          {activity.actor?.role ? (
            <View style={styles.activityRoleBadge}>
              <Text style={styles.activityRoleText}>{activity.actor.role}</Text>
            </View>
          ) : null}
        </View>
        {detail ? (
          <Text style={styles.activityDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function EmptyState({ hasFilter, styles }: { hasFilter: boolean; styles: any }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={hasFilter ? 'filter-outline' : 'pulse-outline'} size={36} color="#8b5cf6" />
      </View>
      <Text style={styles.emptyText}>{hasFilter ? 'No matching activity' : 'No activity yet'}</Text>
      <Text style={styles.emptySubText}>
        {hasFilter
          ? 'Try selecting a different filter to see more results.'
          : 'Team actions like invites, role changes, and content updates will appear here as they happen.'}
      </Text>
    </View>
  );
}

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

// ── Main Screen ─────────────────────────────────────────────────────

export default function SuperAdminTeamActivityScreen() {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme, screenWidth), [theme, screenWidth]);
  const { showAlert, alertProps } = useAlertModal();

  const {
    profile,
    groups,
    allActivities,
    loading,
    refreshing,
    filter,
    setFilter,
    stats,
    onRefresh,
    activities,
  } = useSuperAdminTeamActivity(showAlert);

  if (!profile || !isPlatformStaff(profile.role)) {
    return (
      <SafeAreaView style={styles.deniedContainer}>
        <Stack.Screen options={{ title: 'Team Activity', headerShown: false }} />
        <ThemedStatusBar />
        <Text style={styles.deniedText}>Access Denied — Super Admin Only</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Team Activity', headerShown: false }} />
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
          <Text style={styles.headerTitle}>Team Activity</Text>
          <Text style={styles.headerSubtitle}>
            {stats.today} today · {stats.uniqueActors} active members · {allActivities.length} total
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size={44} />
          <Text style={styles.loadingText}>Loading activity…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* ── Stat Cards ── */}
          <View style={styles.statsRow}>
            <StatCard
              value={stats.today}
              label="Today"
              icon="flash"
              color="#3b82f6"
              styles={styles}
            />
            <StatCard
              value={stats.thisWeek}
              label="This Week"
              icon="trending-up"
              color="#10b981"
              styles={styles}
            />
            <StatCard
              value={stats.uniqueActors}
              label="Active"
              icon="people"
              color="#8b5cf6"
              styles={styles}
            />
          </View>

          {/* ── Activity Pulse ── */}
          <ActivityPulse hourly={stats.hourlyDistribution} styles={styles} />

          {/* ── Insights ── */}
          <SectionHeader title="Insights" styles={styles} />
          <InsightsRow stats={stats} styles={styles} />

          {/* ── Filter Chips ── */}
          <SectionHeader
            title="Activity Timeline"
            badge={activities.length || undefined}
            styles={styles}
          />
          <FilterBar filter={filter} setFilter={setFilter} stats={stats} styles={styles} />

          {/* ── Timeline ── */}
          {activities.length === 0 ? (
            <EmptyState hasFilter={filter !== 'all'} styles={styles} />
          ) : (
            groups.map((group) => (
              <View key={group.date}>
                <DateGroupHeader group={group} styles={styles} />
                {group.activities.map((a, i) => (
                  <ActivityTimelineItem
                    key={a.id}
                    activity={a}
                    isLast={i === group.activities.length - 1}
                    styles={styles}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
