import React from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isSuperAdmin } from '@/lib/roleUtils';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useSuperAdminTeamActivity } from '@/hooks/useSuperAdminTeamActivity';
import { ACTIVITY_FILTERS, getActionConfig } from '@/hooks/super-admin-team-activity/types';
import type { PlatformActivity } from '@/hooks/super-admin-team-activity/types';
import { createStyles } from '@/lib/screen-styles/super-admin-team-activity.styles';

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SuperAdminTeamActivityScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    profile, activities, allActivities, loading, refreshing,
    filter, setFilter, stats, onRefresh,
  } = useSuperAdminTeamActivity(showAlert);

  if (!profile || !isSuperAdmin(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Team Activity', headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Team Activity', headerShown: false }} />
      <ThemedStatusBar />

      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="time" size={28} color="#14b8a6" />
            <Text style={styles.title}>Team Activity</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Stats */}
      {stats && (
        <View style={styles.statsBar}>
          <View style={[styles.statCard, { backgroundColor: '#3b82f620' }]}>
            <Text style={styles.statValue}>{stats.today}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#10b98120' }]}>
            <Text style={styles.statValue}>{stats.thisWeek}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#6366f120' }]}>
            <Text style={styles.statValue}>{stats.uniqueActors}</Text>
            <Text style={styles.statLabel}>Active Members</Text>
          </View>
        </View>
      )}

      {/* Filter bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
        {ACTIVITY_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Ionicons
              name={f.icon as any}
              size={14}
              color={filter === f.id ? '#3b82f6' : '#64748b'}
            />
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading activity...</Text>
          </View>
        ) : activities.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={48} color="#64748b" />
            <Text style={styles.emptyText}>
              {allActivities.length === 0 ? 'No activity recorded yet' : 'No matching activity'}
            </Text>
            <Text style={styles.emptySubText}>
              {allActivities.length === 0
                ? 'Team actions will appear here as they happen. Run the migration to create the platform_activity_log table.'
                : 'Try selecting a different filter.'}
            </Text>
          </View>
        ) : (
          activities.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} styles={styles} />
          ))
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}

function ActivityItem({
  activity, styles,
}: {
  activity: PlatformActivity;
  styles: ReturnType<typeof createStyles>;
}) {
  const config = getActionConfig(activity.action);
  const meta = activity.metadata || {};
  const detail = meta.email || meta.entity_name || meta.description || activity.entity_id || '';

  return (
    <View style={styles.activityItem}>
      <View style={[styles.activityIcon, { backgroundColor: config.color + '20' }]}>
        <Ionicons name={config.icon as any} size={18} color={config.color} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityAction}>{config.label}</Text>
        <Text style={styles.activityActor}>
          {activity.actor?.full_name || 'System'}
          {activity.actor?.role ? ` · ${activity.actor.role}` : ''}
        </Text>
        {detail ? (
          <Text style={styles.activityDetail} numberOfLines={1}>
            {String(detail)}
          </Text>
        ) : null}
      </View>
      <Text style={styles.activityTime}>
        {formatRelativeTime(activity.created_at)}
      </Text>
    </View>
  );
}
