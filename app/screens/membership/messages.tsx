/**
 * SOA Messages Screen
 * Thread list for EduPro messaging
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSOAThreads } from '@/hooks/useSOAMessaging';
import { 
  WING_CONFIG, 
  THREAD_TYPE_CONFIG,
  SOAWing,
  SOAThreadType,
  SOAThreadListItem,
} from '@/components/soa-messaging/types';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Filter tabs for thread types
const FILTER_TABS: { key: SOAThreadType | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'chatbubbles' },
  { key: 'broadcast', label: 'Announcements', icon: 'megaphone' },
  { key: 'regional_chat', label: 'Regional', icon: 'location' },
  { key: 'wing_chat', label: 'Wings', icon: 'people' },
  { key: 'direct', label: 'Direct', icon: 'chatbubble' },
];

export default function SOAMessagesScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SOAThreadType | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Get organization ID from profile
  const organizationId = (profile as any)?.organization_id || '';

  // Get threads with filters
  const { threads, isLoading, error, refetch, stats } = useSOAThreads({
    organizationId,
    threadType: activeFilter === 'all' ? undefined : activeFilter,
    search: searchQuery || undefined,
    enabled: !!organizationId,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleThreadPress = (thread: SOAThreadListItem) => {
    router.push({
      pathname: '/screens/membership/chat',
      params: {
        thread_id: thread.id,
        subject: thread.subject || getThreadTitle(thread),
        wing: thread.wing || '',
        thread_type: thread.thread_type,
      },
    });
  };

  const handleNewChat = () => {
    router.push('/screens/membership/new-chat');
  };

  const getThreadTitle = (thread: SOAThreadListItem): string => {
    if (thread.subject) return thread.subject;
    
    if (thread.thread_type === 'broadcast') {
      return 'Announcement';
    }
    
    if (thread.thread_type === 'regional_chat' && thread.region) {
      return `${thread.region.name} Region`;
    }
    
    if (thread.thread_type === 'wing_chat' && thread.wing) {
      return WING_CONFIG[thread.wing].label;
    }
    
    return THREAD_TYPE_CONFIG[thread.thread_type].label;
  };

  const getThreadIcon = (thread: SOAThreadListItem): keyof typeof Ionicons.glyphMap => {
    if (thread.thread_type === 'wing_chat' && thread.wing) {
      return WING_CONFIG[thread.wing].icon as keyof typeof Ionicons.glyphMap;
    }
    return THREAD_TYPE_CONFIG[thread.thread_type].icon as keyof typeof Ionicons.glyphMap;
  };

  const getThreadColor = (thread: SOAThreadListItem): string => {
    if (thread.thread_type === 'wing_chat' && thread.wing) {
      return WING_CONFIG[thread.wing].color;
    }
    return theme.primary;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const renderFilterTab = ({ item }: { item: typeof FILTER_TABS[0] }) => {
    const isActive = activeFilter === item.key;
    return (
      <TouchableOpacity
        style={[
          styles.filterTab,
          isActive && { backgroundColor: theme.primary },
        ]}
        onPress={() => setActiveFilter(item.key)}
      >
        <Ionicons
          name={item.icon as any}
          size={16}
          color={isActive ? '#FFFFFF' : theme.textSecondary}
        />
        <Text
          style={[
            styles.filterTabText,
            { color: isActive ? '#FFFFFF' : theme.textSecondary },
          ]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderThreadItem = ({ item }: { item: SOAThreadListItem }) => {
    const threadColor = getThreadColor(item);
    const hasUnread = item.unread_count > 0;

    return (
      <TouchableOpacity
        style={[styles.threadItem, hasUnread && styles.threadItemUnread]}
        onPress={() => handleThreadPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.threadIcon, { backgroundColor: `${threadColor}20` }]}>
          <Ionicons name={getThreadIcon(item)} size={24} color={threadColor} />
        </View>

        <View style={styles.threadContent}>
          <View style={styles.threadHeader}>
            <Text
              style={[styles.threadTitle, hasUnread && styles.threadTitleUnread]}
              numberOfLines={1}
            >
              {getThreadTitle(item)}
            </Text>
            <Text style={styles.threadTime}>
              {formatTime(item.last_message_at)}
            </Text>
          </View>

          <View style={styles.threadPreview}>
            <Text
              style={[styles.threadMessage, hasUnread && styles.threadMessageUnread]}
              numberOfLines={1}
            >
              {item.last_message_preview || 'No messages yet'}
            </Text>
            
            {hasUnread && (
              <View style={[styles.unreadBadge, { backgroundColor: threadColor }]}>
                <Text style={styles.unreadCount}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
          </View>

          {item.is_muted && (
            <View style={styles.mutedIndicator}>
              <Ionicons name="volume-mute" size={12} color={theme.textSecondary} />
            </View>
          )}
        </View>

        {item.is_pinned && (
          <View style={styles.pinnedIndicator}>
            <Ionicons name="pin" size={16} color={theme.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <View style={styles.listHeader}>
      {/* Stats Summary */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalThreads}</Text>
          <Text style={styles.statLabel}>Chats</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, stats.totalUnread > 0 && { color: theme.primary }]}>
            {stats.totalUnread}
          </Text>
          <Text style={styles.statLabel}>Unread</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <FlatList
        horizontal
        data={FILTER_TABS}
        renderItem={renderFilterTab}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterTabsContainer}
        style={styles.filterTabs}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Messages',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleNewChat}
              style={styles.headerButton}
            >
              <Ionicons name="create-outline" size={24} color={theme.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : error ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Unable to Load Messages"
          description="Please check your connection and try again."
          actionLabel="Retry"
          onActionPress={refetch}
        />
      ) : threads.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No Conversations Yet"
          description={
            activeFilter === 'all'
              ? 'Start a conversation with your region or wing members.'
              : `No ${FILTER_TABS.find(f => f.key === activeFilter)?.label.toLowerCase()} messages yet.`
          }
          actionLabel="Start Chat"
          onActionPress={handleNewChat}
        />
      ) : (
        <FlatList
          data={threads}
          renderItem={renderThreadItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={handleNewChat}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerButton: {
      padding: 8,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      marginHorizontal: 16,
      marginVertical: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: theme.text,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    listHeader: {
      paddingBottom: 8,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 24,
      gap: 24,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text,
    },
    statLabel: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    statDivider: {
      width: 1,
      height: 32,
      backgroundColor: theme.border,
    },
    filterTabs: {
      marginBottom: 8,
    },
    filterTabsContainer: {
      paddingHorizontal: 16,
      gap: 8,
    },
    filterTab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.card,
      gap: 6,
    },
    filterTabText: {
      fontSize: 13,
      fontWeight: '500',
    },
    listContent: {
      paddingBottom: 100,
    },
    threadItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    threadItemUnread: {
      backgroundColor: `${theme.primary}08`,
    },
    threadIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    threadContent: {
      flex: 1,
      marginRight: 8,
    },
    threadHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    threadTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.text,
      flex: 1,
      marginRight: 8,
    },
    threadTitleUnread: {
      fontWeight: '700',
    },
    threadTime: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    threadPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    threadMessage: {
      fontSize: 14,
      color: theme.textSecondary,
      flex: 1,
      marginRight: 8,
    },
    threadMessageUnread: {
      color: theme.text,
    },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    unreadCount: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    mutedIndicator: {
      position: 'absolute',
      right: 0,
      bottom: 0,
    },
    pinnedIndicator: {
      marginLeft: 4,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 30,
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
  });
