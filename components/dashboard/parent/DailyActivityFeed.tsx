/**
 * DailyActivityFeed Component
 *
 * Dashboard widget showing today's classroom activities posted by teachers.
 * Reads from `student_activity_feed` (the same table teachers post to).
 *
 * Features:
 * - Real-time updates via Supabase subscription
 * - Activity timeline with type icons and colors
 * - Expandable activity details with media preview
 * - "See all" link to full activity feed screen
 * - Empty state for days with no activities
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import {
  useChildActivityFeed,
  useActivityFeedRealtime,
  type ActivityItem,
} from '@/hooks/useActivityFeed';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

interface DailyActivityFeedProps {
  classId?: string;
  studentId?: string;
  date?: Date;
  maxItems?: number;
  showHeader?: boolean;
  onActivityPress?: (activity: any) => void;
}

// Activity type → icon & colour (matches teacher-post-activity.tsx)
const ACTIVITY_META: Record<string, { icon: string; color: string }> = {
  learning: { icon: 'school', color: '#3B82F6' },
  play: { icon: 'game-controller', color: '#10B981' },
  meal: { icon: 'restaurant', color: '#EF4444' },
  rest: { icon: 'moon', color: '#6366F1' },
  art: { icon: 'color-palette', color: '#EC4899' },
  music: { icon: 'musical-notes', color: '#8B5CF6' },
  story: { icon: 'book', color: '#0EA5E9' },
  outdoor: { icon: 'sunny', color: '#F59E0B' },
  special: { icon: 'star', color: '#F97316' },
  milestone: { icon: 'trophy', color: '#EAB308' },
  social: { icon: 'people', color: '#06B6D4' },
};

function getMeta(type: string) {
  return ACTIVITY_META[type] || { icon: 'star', color: '#F59E0B' };
}

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

export function DailyActivityFeed({
  classId,
  studentId,
  date = new Date(),
  maxItems = 10,
  showHeader = true,
  onActivityPress,
}: DailyActivityFeedProps) {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(theme), [theme]);

  const dateString = date.toISOString().split('T')[0];

  // ── Data: reads from student_activity_feed ───────
  const {
    data: allActivities = [],
    isLoading,
  } = useChildActivityFeed(studentId, { date: dateString, limit: maxItems });

  // ── Real-time ────────────────────────────────────
  useActivityFeedRealtime(studentId);

  // Filter to class if classId is provided (student_activity_feed has class_id)
  const activities = useMemo(() => {
    if (!classId) return allActivities;
    return allActivities.filter((a) => a.class_id === classId);
  }, [allActivities, classId]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderActivity = ({ item, index }: { item: ActivityItem; index: number }) => {
    const { icon, color } = getMeta(item.activity_type);
    const isExpanded = expandedId === item.id;
    const isLast = index === activities.length - 1;
    const teacherName = item.teacher
      ? `${item.teacher.first_name || ''} ${item.teacher.last_name || ''}`.trim()
      : '';
    const mediaUrls = (item.media_urls || []) as string[];

    return (
      <TouchableOpacity
        style={styles.activityItem}
        onPress={() => {
          toggleExpand(item.id);
          onActivityPress?.(item);
        }}
        activeOpacity={0.7}
      >
        {/* Timeline connector */}
        <View style={styles.timelineContainer}>
          <View style={[styles.timelineDot, { backgroundColor: color }]}>
            <Ionicons name={icon as any} size={14} color="#FFF" />
          </View>
          {!isLast && <View style={[styles.timelineLine, { backgroundColor: theme.border }]} />}
        </View>

        {/* Activity content */}
        <View style={styles.activityContent}>
          <View style={styles.activityHeader}>
            <Text style={[styles.activityName, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.activityTime, { color: theme.textSecondary }]}>
              {formatActivityTime(item.activity_at)}
            </Text>
          </View>

          {item.description && (
            <Text
              style={[styles.activityDescription, { color: theme.textSecondary }]}
              numberOfLines={isExpanded ? undefined : 2}
            >
              {item.description}
            </Text>
          )}

          {/* Media thumbnail row (compact) */}
          {mediaUrls.length > 0 && (
            <View style={styles.mediaRow}>
              {mediaUrls.slice(0, 3).map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.mediaMini} resizeMode="cover" />
              ))}
              {mediaUrls.length > 3 && (
                <View style={[styles.mediaMini, styles.moreMedia]}>
                  <Text style={styles.moreMediaText}>+{mediaUrls.length - 3}</Text>
                </View>
              )}
            </View>
          )}

          {/* Expanded details */}
          {isExpanded && (
            <View style={styles.expandedDetails}>
              {item.duration_minutes ? (
                <View style={styles.detailRow}>
                  <Ionicons name="time-outline" size={13} color={theme.textSecondary} />
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>
                    {item.duration_minutes} min
                  </Text>
                </View>
              ) : null}

              {/* Reaction counts */}
              {(item.activity_reactions || []).length > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailText}>
                    {(item.activity_reactions || []).map((r) => r.emoji).join(' ')}
                  </Text>
                </View>
              )}

              {teacherName ? (
                <Text style={[styles.teacherName, { color: theme.textTertiary }]}>
                  {t('dashboard.parent.daily_activity.labels.added_by', { defaultValue: 'Added by {{name}}', name: teacherName })}
                </Text>
              ) : null}
            </View>
          )}

          {/* Expand indicator */}
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.textSecondary}
            style={styles.expandIcon}
          />
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <EduDashSpinner size="small" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.card }]}>
      {showHeader && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="sunny" size={20} color="#F59E0B" />
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {t('dashboard.parent.daily_activity.title', { defaultValue: "Today's Activities" })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.seeAllBtn}
            onPress={() => router.push('/screens/parent-activity-feed' as any)}
            activeOpacity={0.7}
          >
            <Text style={[styles.seeAllText, { color: theme.primary }]}>
              {t('common.see_all', { defaultValue: 'See all' })}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.primary} />
          </TouchableOpacity>
        </View>
      )}

      {activities.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {t('dashboard.parent.daily_activity.empty.title', { defaultValue: 'No activities logged yet today' })}
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>
            {t('dashboard.parent.daily_activity.empty.description', { defaultValue: "Check back later for updates from your child's teacher" })}
          </Text>
        </View>
      ) : (
        <View>
          {activities.map((item, index) => (
            <React.Fragment key={item.id}>
              {renderActivity({ item, index })}
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    loadingContainer: {
      padding: 40,
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
    },
    seeAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    seeAllText: {
      fontSize: 13,
      fontWeight: '600',
    },
    activityItem: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    timelineContainer: {
      width: 32,
      alignItems: 'center',
    },
    timelineDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    timelineLine: {
      width: 2,
      flex: 1,
      marginTop: 4,
    },
    activityContent: {
      flex: 1,
      marginLeft: 12,
      paddingBottom: 12,
    },
    activityHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    activityName: {
      fontSize: 16,
      fontWeight: '600',
      flex: 1,
    },
    activityTime: {
      fontSize: 12,
      marginLeft: 8,
    },
    activityDescription: {
      fontSize: 14,
      lineHeight: 20,
    },
    mediaRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 8,
    },
    mediaMini: {
      width: 48,
      height: 48,
      borderRadius: 8,
      backgroundColor: '#1e293b',
    },
    moreMedia: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(148,163,184,0.15)',
    },
    moreMediaText: {
      color: '#94a3b8',
      fontSize: 12,
      fontWeight: '700',
    },
    expandedDetails: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: 'rgba(128, 128, 128, 0.2)',
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    detailText: {
      fontSize: 13,
      lineHeight: 18,
    },
    teacherName: {
      fontSize: 11,
      marginTop: 4,
      fontStyle: 'italic',
    },
    expandIcon: {
      position: 'absolute',
      right: 0,
      top: 0,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 30,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '500',
      marginTop: 12,
    },
    emptySubtext: {
      fontSize: 13,
      marginTop: 4,
      textAlign: 'center',
    },
  });

export default DailyActivityFeed;
