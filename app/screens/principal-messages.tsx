/**
 * Principal Messages Screen
 * Thread-based messaging list for principals
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  TextInput,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { MessagesListHeader } from '@/components/messaging/MessageHeader';
import { useParentThreads, useMarkAllDelivered, MessageThread, MessageParticipant } from '@/hooks/useParentMessaging';
import { useConversationListTyping } from '@/hooks/useConversationListTyping';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { getMessageDisplayText } from '@/lib/utils/messageContent';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { assertSupabase } from '@/lib/supabase';
import { toast } from '@/components/ui/ToastProvider';

const formatMessageTime = (timestamp: string): string => {
  const now = new Date();
  const messageTime = new Date(timestamp);
  const diffInHours = Math.abs(now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) {
    return 'Just now';
  }
  if (diffInHours < 24) {
    return messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffInHours < 168) {
    return messageTime.toLocaleDateString([], { weekday: 'short' });
  }
  return messageTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const normalizeNameToken = (value?: string | null): string => {
  const token = String(value || '').trim();
  if (!token) return '';
  const lowered = token.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') return '';
  return token;
};

const formatParticipantName = (
  profile?: { first_name?: string | null; last_name?: string | null } | null,
  fallback = 'Contact',
): string => {
  const first = normalizeNameToken(profile?.first_name);
  const last = normalizeNameToken(profile?.last_name);
  const full = `${first} ${last}`.trim();
  return full || fallback;
};

interface ThreadItemProps {
  thread: MessageThread;
  onPress: () => void;
  onLongPress?: () => void;
  currentUserId?: string | null;
  typingText?: string | null;
  selectionMode?: boolean;
  isSelected?: boolean;
}

const ThreadItem: React.FC<ThreadItemProps> = React.memo(({ thread, onPress, onLongPress, currentUserId, typingText, selectionMode = false, isSelected = false }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const otherParticipant = thread.participants?.find((p: MessageParticipant) => p.user_id !== currentUserId);
  const participantName = formatParticipantName(
    otherParticipant?.user_profile,
    t('principal.contactLabel', { defaultValue: 'Contact' }),
  );

  const participantRole = otherParticipant?.user_profile?.role || 'contact';
  const studentName = thread.student
    ? `${thread.student.first_name} ${thread.student.last_name}`.trim()
    : null;

  const hasUnread = (thread.unread_count || 0) > 0;
  const initials = participantName
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'CT';

  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: isSelected ? 2 : 0,
      borderColor: isSelected ? theme.primary : 'transparent',
      ...Platform.select({
        ios: {
          shadowColor: theme.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: hasUnread ? theme.primary : theme.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    avatarText: {
      fontSize: 18,
      fontWeight: '600',
      color: hasUnread ? theme.onPrimary : theme.primary,
    },
    content: {
      flex: 1,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    time: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    subtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 4,
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    messagePreview: {
      fontSize: 13,
      color: theme.textSecondary,
      flex: 1,
      marginRight: 8,
    },
    unreadBadge: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    unreadText: {
      color: theme.onPrimary,
      fontSize: 11,
      fontWeight: '600',
    },
    roleChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: theme.elevated,
      marginTop: 2,
    },
    roleText: {
      fontSize: 11,
      color: theme.textSecondary,
      textTransform: 'capitalize',
    },
    selectedIndicator: {
      width: 24,
      height: 24,
      borderRadius: 12,
      marginLeft: 8,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
    },
  });

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} onLongPress={onLongPress} delayLongPress={220} activeOpacity={0.7}>
      <View style={styles.inner}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>{participantName}</Text>
            {thread.last_message && (
              <Text style={styles.time}>{formatMessageTime(thread.last_message.created_at)}</Text>
            )}
          </View>
          {studentName && (
            <Text style={styles.subtitle} numberOfLines={1}>{studentName}</Text>
          )}
          <View style={styles.messageRow}>
            <Text style={[styles.messagePreview, typingText ? { color: theme.primary, fontStyle: 'italic' } : undefined]} numberOfLines={1}>
              {typingText
                ? typingText
                : thread.last_message
                  ? getMessageDisplayText(thread.last_message.content)
                  : t('principal.noMessagesYet', { defaultValue: 'No messages yet' })}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {thread.unread_count && thread.unread_count > 99 ? '99+' : thread.unread_count}
                </Text>
              </View>
            )}
            {selectionMode && (
              <View
                style={[
                  styles.selectedIndicator,
                  {
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: isSelected ? theme.primary : 'transparent',
                  },
                ]}
              >
                {isSelected && <Ionicons name="checkmark" size={14} color={theme.onPrimary} />}
              </View>
            )}
          </View>
          {!!participantRole && (
            <View style={styles.roleChip}>
              <Text style={styles.roleText}>{participantRole}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function PrincipalMessagesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showAlert, alertProps } = useAlertModal();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);

  const { data: threads, isLoading, error, refetch, isRefetching } = useParentThreads();

  // Mark all incoming messages as delivered when conversation list is viewed
  useMarkAllDelivered(threads);

  // Subscribe to typing indicators across all threads
  const threadIds = useMemo(() => (threads ?? []).map((t) => t.id), [threads]);
  const typingMap = useConversationListTyping(threadIds, user?.id ?? null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedThreadIds([]);
  }, []);

  const toggleThreadSelection = useCallback((threadId: string) => {
    setSelectedThreadIds((prev) =>
      prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId]
    );
  }, []);

  const handleThreadLongPress = useCallback((thread: MessageThread) => {
    setSelectionMode(true);
    setSelectedThreadIds((prev) => (prev.includes(thread.id) ? prev : [...prev, thread.id]));
  }, []);

  const handleBulkDeleteThreads = useCallback(() => {
    if (!user?.id || selectedThreadIds.length === 0) return;
    showAlert({
      title: 'Delete selected chats',
      message: `Remove ${selectedThreadIds.length} selected chat${selectedThreadIds.length > 1 ? 's' : ''} from your list?`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const client = assertSupabase();
              const { error } = await client
                .from('message_participants')
                .delete()
                .eq('user_id', user.id)
                .in('thread_id', selectedThreadIds);
              if (error) throw error;

              clearSelection();
              await refetch();
              queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
              toast.success('Selected chats deleted');
            } catch (err: any) {
              toast.error(err?.message || 'Failed to delete selected chats');
            }
          },
        },
      ],
    });
  }, [clearSelection, queryClient, refetch, selectedThreadIds, showAlert, user?.id]);

  const handleThreadPress = useCallback((thread: MessageThread) => {
    if (selectionMode) {
      toggleThreadSelection(thread.id);
      return;
    }
    const effectiveThreadType = String((thread as any).group_type || thread.type || '');
    const isGroupThread = Boolean(
      thread.is_group ||
      ['class_group', 'parent_group', 'teacher_group', 'announcement'].includes(effectiveThreadType)
    );
    const otherParticipant = thread.participants?.find((p: MessageParticipant) => p.user_id !== user?.id);
    const participantName = formatParticipantName(
      otherParticipant?.user_profile,
      t('principal.contactLabel', { defaultValue: 'Contact' }),
    );
    const groupName = (thread as any).group_name || thread.subject || t('common.group', { defaultValue: 'Group' });

    router.push({
      pathname: '/screens/principal-message-thread',
      params: {
        threadId: thread.id,
        title: isGroupThread ? groupName : participantName,
        isGroup: isGroupThread ? '1' : '0',
        threadType: isGroupThread ? effectiveThreadType : '',
      },
    });
  }, [selectionMode, t, toggleThreadSelection, user?.id]);

  const handleSettings = useCallback(() => {
    router.push('/screens/settings');
  }, []);

  const handleMarkAllRead = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleHeaderSelectionToggle = useCallback(() => {
    if (selectionMode) {
      clearSelection();
      return;
    }
    setSelectionMode(true);
  }, [clearSelection, selectionMode]);

  // Dropdown menu items for the header
  const headerMenuItems = useMemo(() => [
    {
      icon: 'megaphone-outline' as keyof typeof Ionicons.glyphMap,
      label: t('principal.sendAnnouncement', { defaultValue: 'Send Announcement' }),
      onPress: () => router.push('/screens/principal-announcement'),
    },
    {
      icon: 'notifications-outline' as keyof typeof Ionicons.glyphMap,
      label: t('principal.notificationSettings', { defaultValue: 'Notification Settings' }),
      onPress: () => router.push('/screens/settings'),
    },
    {
      icon: 'checkmark-done-outline' as keyof typeof Ionicons.glyphMap,
      label: t('principal.markAllRead', { defaultValue: 'Mark All as Read' }),
      onPress: handleMarkAllRead,
    },
    {
      icon: 'archive-outline' as keyof typeof Ionicons.glyphMap,
      label: t('principal.archivedChats', { defaultValue: 'Archived Chats' }),
      onPress: handleSettings,
    },
  ], [t, handleMarkAllRead, handleSettings]);

  const handleAnnouncements = useCallback(() => {
    router.push('/screens/principal-announcement');
  }, []);

  const handleGroups = useCallback(() => {
    router.push('/screens/create-group');
  }, []);

  const filteredThreads = useMemo(() => {
    if (!threads) return [];
    if (!searchQuery.trim()) return threads;
    const query = searchQuery.toLowerCase();
    return threads.filter((thread) => {
      const otherParticipant = thread.participants?.find((p: MessageParticipant) => p.user_id !== user?.id);
      const participantName = formatParticipantName(otherParticipant?.user_profile, '');
      const studentName = thread.student
        ? `${thread.student.first_name} ${thread.student.last_name}`.trim()
        : '';
      const lastMessage = thread.last_message?.content || '';
      return (
        participantName.toLowerCase().includes(query) ||
        studentName.toLowerCase().includes(query) ||
        lastMessage.toLowerCase().includes(query)
      );
    });
  }, [threads, searchQuery, user?.id]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    loadingContainer: {
      flex: 1,
      padding: 16,
    },
    skeletonItem: {
      marginBottom: 12,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    errorIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.error + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    errorSubtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    listContent: {
      paddingVertical: 12,
      paddingBottom: insets.bottom + 16,
    },
    searchContainer: {
      marginHorizontal: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: theme.text,
    },
    quickActions: {
      flexDirection: 'row',
      gap: 12,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    quickActionCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    quickActionText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      flexShrink: 1,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    emptyButton: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    emptyButtonText: {
      color: theme.onPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    searchClear: {
      padding: 4,
      marginLeft: 4,
    },
    fab: {
      position: 'absolute',
      right: 20,
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    fabPrimary: {
      backgroundColor: theme.primary,
      bottom: insets.bottom + 20,
    },
    fabSecondary: {
      backgroundColor: theme.surface,
      borderWidth: 2,
      borderColor: theme.primary,
      bottom: insets.bottom + 90,
    },
  });

  if (isLoading && !threads) {
    return (
      <View style={styles.container}>
        <MessagesListHeader
          title={t('principal.messages', { defaultValue: 'Messages' })}
          rightActionLabel={selectionMode ? 'Done' : 'Select'}
          onRightActionPress={handleHeaderSelectionToggle}
          menuItems={headerMenuItems}
        />
        <View style={styles.loadingContainer}>
          {[...Array(6)].map((_, i) => (
            <View key={i} style={styles.skeletonItem}>
              <SkeletonLoader height={84} borderRadius={16} />
            </View>
          ))}
        </View>
        {/* FAB visible during loading */}
        <TouchableOpacity
          style={[styles.fab, styles.fabPrimary]}
          onPress={() => router.push('/screens/principal-new-message')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={theme.onPrimary} />
        </TouchableOpacity>
      </View>
    );
  }

  if (error && !threads) {
    return (
      <View style={styles.container}>
        <MessagesListHeader
          title={t('principal.messages', { defaultValue: 'Messages' })}
          rightActionLabel={selectionMode ? 'Done' : 'Select'}
          onRightActionPress={handleHeaderSelectionToggle}
          menuItems={headerMenuItems}
        />
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle-outline" size={40} color={theme.error} />
          </View>
          <Text style={styles.errorTitle}>
            {t('principal.messagesError', { defaultValue: 'Unable to Load Messages' })}
          </Text>
          <Text style={styles.errorSubtitle}>
            {t('principal.messagesErrorDesc', { defaultValue: 'Please check your connection and try again.' })}
          </Text>
        </View>
      </View>
    );
  }

  if (!threads || threads.length === 0) {
    return (
      <View style={styles.container}>
        <MessagesListHeader
          title={t('principal.messages', { defaultValue: 'Messages' })}
          rightActionLabel={selectionMode ? 'Done' : 'Select'}
          onRightActionPress={handleHeaderSelectionToggle}
          menuItems={headerMenuItems}
        />
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {t('principal.noMessagesTitle', { defaultValue: 'No Conversations Yet' })}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t('principal.noMessagesDesc', { defaultValue: 'Messages from parents and staff will appear here.' })}
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push('/screens/principal-new-message')}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.onPrimary} />
            <Text style={styles.emptyButtonText}>
              {t('principal.startMessage', { defaultValue: 'Start message' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (threads.length > 0 && filteredThreads.length === 0 && searchQuery.trim()) {
    return (
      <View style={styles.container}>
        <MessagesListHeader
          title={t('principal.messages', { defaultValue: 'Messages' })}
          subtitle={`${threads.length} ${threads.length === 1 ? 'conversation' : 'conversations'}`}
          rightActionLabel={selectionMode ? 'Done' : 'Select'}
          onRightActionPress={handleHeaderSelectionToggle}
          menuItems={headerMenuItems}
        />
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            placeholder={t('principal.searchMessages', { defaultValue: 'Search messages...' })}
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.searchClear} onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="search" size={48} color={theme.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {t('principal.noSearchResults', { defaultValue: 'No matches found' })}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t('principal.noSearchResultsDesc', { defaultValue: 'Try a different name or keyword.' })}
          </Text>
        </View>
        {/* FAB */}
        <TouchableOpacity
          style={[styles.fab, styles.fabPrimary]}
          onPress={() => router.push('/screens/principal-new-message')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={theme.onPrimary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MessagesListHeader
        title={t('principal.messages', { defaultValue: 'Messages' })}
        subtitle={selectionMode
          ? `${selectedThreadIds.length} selected`
          : `${threads.length} ${threads.length === 1 ? 'conversation' : 'conversations'}`}
        rightActionLabel={selectionMode ? 'Done' : 'Select'}
        onRightActionPress={handleHeaderSelectionToggle}
        menuItems={headerMenuItems}
      />
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={theme.textSecondary} />
        <TextInput
          placeholder={t('principal.searchMessages', { defaultValue: 'Search messages...' })}
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity style={styles.searchClear} onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickActionCard} onPress={handleAnnouncements}>
          <Ionicons name="megaphone" size={18} color={theme.primary} />
          <Text style={styles.quickActionText}>Send Announcement</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionCard} onPress={handleGroups}>
          <Ionicons name="people" size={18} color={theme.primary} />
          <Text style={styles.quickActionText}>Create Groups</Text>
        </TouchableOpacity>
      </View>
      {selectionMode && (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
            {selectedThreadIds.length} selected
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={clearSelection} activeOpacity={0.8}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleBulkDeleteThreads}
              disabled={selectedThreadIds.length === 0}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: selectedThreadIds.length > 0 ? theme.error : theme.elevated,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 10,
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={14} color={theme.onError || '#fff'} />
              <Text style={{ color: theme.onError || '#fff', fontSize: 12, fontWeight: '700' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <FlashList
        data={filteredThreads}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ThreadItem
            thread={item}
            onPress={() => handleThreadPress(item)}
            onLongPress={() => handleThreadLongPress(item)}
            currentUserId={user?.id}
            typingText={typingMap[item.id]}
            selectionMode={selectionMode}
            isSelected={selectedThreadIds.includes(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      />
      
      {/* Floating Action Buttons */}
      <TouchableOpacity
        style={[styles.fab, styles.fabSecondary]}
        onPress={handleGroups}
        activeOpacity={0.8}
      >
        <Ionicons name="people" size={24} color={theme.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.fab, styles.fabPrimary]}
        onPress={() => router.push('/screens/principal-new-message')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={theme.onPrimary} />
      </TouchableOpacity>
      <AlertModal {...alertProps} />
    </View>
  );
}
