/**
 * Parent Announcements Screen
 *
 * Displays school announcements for parents, matching web functionality.
 * Shows announcements from all preschools where the parent has children enrolled.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SubPageHeader } from '@/components/SubPageHeader';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { useQuery } from '@tanstack/react-query';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import {
  type Announcement, type PriorityFilter,
  getPriorityColor, getPriorityLabel, formatAnnouncementDate,
  createAnnouncementStyles,
} from '@/lib/screen-styles/parent-announcements.styles';

export default function ParentAnnouncementsScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const styles = useMemo(() => createAnnouncementStyles(theme), [theme]);

  // Resolve the correct parent ID (profile.id may differ from auth user.id)
  const parentId = (profile as any)?.id || user?.id;

  // Fetch announcements
  const { data: announcements = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['parent-announcements', parentId],
    queryFn: async () => {
      if (!parentId) return [];

      const supabase = assertSupabase();

      // Get user's children to find their preschools (check parent_id AND guardian_id)
      const parentFilters = [`parent_id.eq.${parentId}`, `guardian_id.eq.${parentId}`];
      if (user?.id && user.id !== parentId) {
        parentFilters.push(`parent_id.eq.${user.id}`, `guardian_id.eq.${user.id}`);
      }
      
      const { data: children } = await supabase
        .from('students')
        .select('preschool_id')
        .or(parentFilters.join(','));

      if (!children || children.length === 0) return [];

      const preschoolIds = [...new Set(children.map((c: any) => c.preschool_id).filter(Boolean))];
      if (preschoolIds.length === 0) return [];

      // Get announcements for these preschools
      const { data, error } = await supabase
        .from('announcements')
        .select(`*, preschool:preschools(name)`)
        .in('preschool_id', preschoolIds)
        .in('target_audience', ['all', 'parents'])
        .eq('is_published', true)
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .order('priority', { ascending: false })
        .order('published_at', { ascending: false });

      if (error) {
        logger.error('ParentAnnouncements', 'Error fetching announcements', error);
        return [];
      }

      return (data || []) as Announcement[];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const filteredAnnouncements = announcements.filter((a) => {
    if (priorityFilter === 'all') return true;
    return a.priority === priorityFilter;
  });

  const urgentCount = announcements.filter((a) => a.priority === 'urgent').length;
  const highCount = announcements.filter((a) => a.priority === 'high').length;
  const mediumCount = announcements.filter((a) => a.priority === 'medium').length;
  const lowCount = announcements.filter((a) => a.priority === 'low').length;

  const renderAnnouncement = ({ item }: { item: Announcement }) => {
    const priorityColor = getPriorityColor(item.priority, theme);

    return (
      <View
        style={[
          styles.announcementCard,
          { backgroundColor: theme.surface, borderLeftColor: priorityColor, borderLeftWidth: 4 },
        ]}
      >
        {/* Header */}
        <View style={styles.announcementHeader}>
          <View style={styles.headerLeft}>
            <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
              <Text style={styles.priorityBadgeText}>{getPriorityLabel(item.priority)}</Text>
            </View>
            {item.preschool && (
              <Text style={[styles.preschoolName, { color: theme.textSecondary }]}>
                {item.preschool.name}
              </Text>
            )}
          </View>
          <Ionicons name="megaphone" size={24} color={priorityColor} />
        </View>

        {/* Title */}
        <Text style={[styles.announcementTitle, { color: theme.text }]}>{item.title}</Text>

        {/* Content */}
        <Text style={[styles.announcementContent, { color: theme.textSecondary }]} numberOfLines={4}>
          {item.content}
        </Text>

        {/* Footer */}
        <View style={[styles.announcementFooter, { borderTopColor: theme.border }]}>
          <View style={styles.footerLeft}>
            <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              {formatAnnouncementDate(item.published_at)}
            </Text>
          </View>
          {item.expires_at && (
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              Expires: {new Date(item.expires_at).toLocaleDateString('en-ZA')}
            </Text>
          )}
        </View>
      </View>
    );
  };

  // Helper to render a priority filter button
  const renderFilterBtn = (
    key: PriorityFilter,
    label: string,
    count: number,
    color: string,
  ) => {
    if (key !== 'all' && count === 0) return null;
    const active = priorityFilter === key;
    return (
      <TouchableOpacity
        key={key}
        style={[
          styles.filterButton,
          { backgroundColor: active ? color : 'transparent', borderColor: active ? color : theme.border },
          active && styles.filterButtonActive,
        ]}
        onPress={() => setPriorityFilter(key)}
      >
        <Text style={[styles.filterButtonText, { color: active ? '#FFFFFF' : theme.text }]}>
          {label} ({key === 'all' ? announcements.length : count})
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <SubPageHeader
          title="School Announcements"
          subtitle="Important updates and news from your child's school"
          onBack={() => router.back()}
        />

        {/* Priority Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
          style={styles.filtersContainer}
        >
          {renderFilterBtn('all', 'All', announcements.length, theme.primary)}
          {renderFilterBtn('urgent', 'Urgent', urgentCount, theme.error)}
          {renderFilterBtn('high', 'High', highCount, theme.warning)}
          {renderFilterBtn('medium', 'Medium', mediumCount, theme.primary)}
          {renderFilterBtn('low', 'Low', lowCount, theme.textSecondary)}
        </ScrollView>

        {/* List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={styles.loadingText}>Loading announcements...</Text>
          </View>
        ) : filteredAnnouncements.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="megaphone-outline" size={64} color={theme.textSecondary} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No announcements</Text>
            <Text style={styles.emptyText}>
              {priorityFilter === 'all'
                ? 'There are no announcements from your school at this time.'
                : `No ${priorityFilter} priority announcements found.`}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isFetching && !isLoading}
                onRefresh={() => refetch()}
                tintColor={theme.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {filteredAnnouncements.map((item) => (
              <React.Fragment key={item.id}>
                {renderAnnouncement({ item })}
              </React.Fragment>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
