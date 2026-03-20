import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { usePlatformAdminDashboard, ROLE_CONFIGS } from '@/hooks/platform-admin-dashboard';
import { createStyles } from '@/lib/screen-styles/platform-admin-dashboard.styles';
import type { StatCard, QuickAction, ActivityItem } from '@/hooks/platform-admin-dashboard';

export default function PlatformAdminDashboardScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme, width), [theme, width]);

  const {
    profile,
    authLoading,
    profileLoading,
    adminRole,
    roleConfig,
    loading,
    refreshing,
    data,
    onRefresh,
    handleQuickAction,
  } = usePlatformAdminDashboard();

  if (authLoading || profileLoading) {
    return (
      <View style={styles.container}>
        <ThemedStatusBar />
        <SafeAreaView style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </SafeAreaView>
      </View>
    );
  }

  if (!adminRole || !roleConfig) {
    return (
      <View style={styles.container}>
        <ThemedStatusBar />
        <SafeAreaView style={styles.deniedContainer}>
          <Ionicons name="shield-checkmark" size={64} color="#ef4444" />
          <Text style={styles.deniedTitle}>Access Denied</Text>
          <Text style={styles.deniedSubtext}>Platform admin privileges required</Text>
          <Text style={styles.deniedRole}>Current role: {profile?.role || 'undefined'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const accentColor = roleConfig.color;

  return (
    <View style={styles.container}>
      <ThemedStatusBar />
      {/* Glass backdrop */}
      <LinearGradient
        pointerEvents="none"
        colors={['#0B1020', '#10162B', '#0B1020']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgLayer}
      />
      <View
        pointerEvents="none"
        style={[styles.bgBlobA, { backgroundColor: `${accentColor}22` }]}
      />
      <View pointerEvents="none" style={[styles.bgBlobB, { backgroundColor: '#22c55e14' }]} />

      {/* Role Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View
            style={[
              styles.roleBadge,
              { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}60` },
            ]}
          >
            <Ionicons name={roleConfig.icon as any} size={16} color={accentColor} />
            <Text style={[styles.roleBadgeText, { color: accentColor }]}>{roleConfig.label}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Platform Operations</Text>
            <Text style={styles.headerSubtitle}>{roleConfig.department}</Text>
          </View>
          <View style={[styles.onlineDot, { backgroundColor: '#22c55e' }]} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      >
        {loading ? (
          <View style={styles.loadingSection}>
            <EduDashSpinner size="large" color={accentColor} />
          </View>
        ) : (
          <>
            {/* Stats Grid */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Overview</Text>
            </View>
            <View style={styles.statsGrid}>
              {data?.stats.map((stat) => (
                <StatCardWidget key={stat.id} stat={stat} styles={styles} />
              ))}
            </View>

            {/* Quick Actions */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <Text style={styles.sectionCount}>{data?.quickActions.length ?? 0}</Text>
            </View>
            <View style={styles.actionsGrid}>
              {data?.quickActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onPress={handleQuickAction}
                  styles={styles}
                />
              ))}
            </View>

            {/* Shared Team Section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Team</Text>
            </View>
            <View style={styles.actionsGrid}>
              {data?.sharedActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onPress={handleQuickAction}
                  styles={styles}
                />
              ))}
            </View>

            {/* Recent Activity */}
            {(data?.recentActivity?.length ?? 0) > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent Activity</Text>
                </View>
                <View style={styles.activityList}>
                  {data!.recentActivity.map((item) => (
                    <ActivityRow key={item.id} item={item} styles={styles} />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ──────────────────────────────

function StatCardWidget({ stat, styles }: { stat: StatCard; styles: any }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconRow}>
        <View style={[styles.statIconCircle, { backgroundColor: `${stat.color}20` }]}>
          <Ionicons name={stat.icon as any} size={18} color={stat.color} />
        </View>
        {stat.change && (
          <View
            style={[
              styles.statChange,
              { backgroundColor: stat.change.direction === 'up' ? '#22c55e18' : '#ef444418' },
            ]}
          >
            <Ionicons
              name={stat.change.direction === 'up' ? 'trending-up' : 'trending-down'}
              size={10}
              color={stat.change.direction === 'up' ? '#22c55e' : '#ef4444'}
            />
            <Text
              style={[
                styles.statChangeText,
                { color: stat.change.direction === 'up' ? '#22c55e' : '#ef4444' },
              ]}
            >
              {stat.change.value}%
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.statValue}>{stat.value}</Text>
      <Text style={styles.statLabel}>{stat.label}</Text>
    </View>
  );
}

function ActionCard({
  action,
  onPress,
  styles,
}: {
  action: QuickAction;
  onPress: (a: QuickAction) => void;
  styles: any;
}) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={() => onPress(action)} activeOpacity={0.7}>
      <View style={styles.actionContent}>
        <View style={[styles.actionIconCircle, { backgroundColor: `${action.color}20` }]}>
          <Ionicons name={action.icon as any} size={20} color={action.color} />
        </View>
        <View style={styles.actionText}>
          <Text style={styles.actionTitle} numberOfLines={1}>
            {action.title}
          </Text>
          <Text style={styles.actionDesc} numberOfLines={1}>
            {action.description}
          </Text>
        </View>
      </View>
      {(action.badge ?? 0) > 0 && (
        <View style={[styles.actionBadge, { backgroundColor: action.color }]}>
          <Text style={styles.actionBadgeText}>{action.badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function ActivityRow({ item, styles }: { item: ActivityItem; styles: any }) {
  const diffMin = Math.floor((Date.now() - new Date(item.timestamp).getTime()) / 60_000);
  const timeStr =
    diffMin < 1
      ? 'Just now'
      : diffMin < 60
        ? `${diffMin}m ago`
        : diffMin < 1440
          ? `${Math.floor(diffMin / 60)}h ago`
          : `${Math.floor(diffMin / 1440)}d ago`;

  return (
    <View style={styles.activityRow}>
      <View style={styles.activityDot} />
      <View style={styles.activityInfo}>
        <Text style={styles.activityAction} numberOfLines={1}>
          {item.action.replace(/_/g, ' ')}
        </Text>
        <Text style={styles.activityMeta}>
          {item.actor_name} · {timeStr}
        </Text>
      </View>
    </View>
  );
}
