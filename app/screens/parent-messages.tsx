/**
 * Parent Messages Screen
 * Modern messaging list with thread search, Dash AI entry, and FABs.
 *
 * Sub-components extracted → components/messaging/ParentThreadItem, DashAIItem
 * Styles extracted → parent-messages.styles.ts
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { MessagesListHeader } from '@/components/messaging/MessageHeader';
import { ParentThreadItem } from '@/components/messaging/ParentThreadItem';
import { DashAIItem } from '@/components/messaging/DashAIItem';
import { useParentThreads, useMarkAllDelivered, MessageThread } from '@/hooks/useParentMessaging';
import { useConversationListTyping } from '@/hooks/useConversationListTyping';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getDashAIRoleCopy } from '@/lib/ai/dashRoleCopy';
import { createParentMessagesStyles } from '@/lib/screen-styles/parent-messages.styles';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { assertSupabase } from '@/lib/supabase';
import { toast } from '@/components/ui/ToastProvider';

export default function ParentMessagesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const { tier } = useSubscription();
  const dashCopy = getDashAIRoleCopy(profile?.role);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showAlert, alertProps } = useAlertModal();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const styles = useMemo(() => createParentMessagesStyles(theme, insets), [theme, insets]);

  const tierLower = String(tier || 'free').toLowerCase();
  const isDashOrbUnlocked = [
    'parent_plus', 'premium', 'pro', 'enterprise',
    'school_premium', 'school_pro', 'school_enterprise',
  ].includes(tierLower);

  const { data: threads, isLoading, error, refetch, isRefetching } = useParentThreads();
  useMarkAllDelivered(threads);

  const threadIds = useMemo(() => (threads ?? []).map((t) => t.id), [threads]);
  const typingMap = useConversationListTyping(threadIds, profile?.id ?? null);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

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
              queryClient.invalidateQueries({ queryKey: ['parent', 'unread-count'] });
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
    const isGroupThread = Boolean(
      thread.is_group ||
      ['class_group', 'parent_group', 'teacher_group', 'announcement'].includes(String(thread.type || ''))
    );
    const otherParticipant = thread.participants?.find((p: any) => p.role !== 'parent');
    const participantName = otherParticipant?.user_profile
      ? `${otherParticipant.user_profile.first_name} ${otherParticipant.user_profile.last_name}`.trim()
      : 'Teacher';
    const groupName = (thread as any).group_name || thread.subject || 'Group';
    router.push({
      pathname: '/screens/parent-message-thread',
      params: {
        threadId: thread.id,
        title: isGroupThread ? groupName : participantName,
        teacherId: otherParticipant?.user_id || '',
        recipientId: otherParticipant?.user_id || '',
        teacherName: participantName,
        isGroup: isGroupThread ? '1' : '0',
        threadType: String((thread as any).group_type || thread.type || ''),
      },
    });
  }, [selectionMode, toggleThreadSelection]);

  const handleStartNewMessage = useCallback(() => router.push('/screens/parent-new-message'), []);
  const handleOpenDashAI = useCallback(() => router.push('/screens/dash-assistant'), []);
  const handleMarkAllRead = useCallback(() => { refetch(); }, [refetch]);
  const handleHeaderSelectionToggle = useCallback(() => {
    if (selectionMode) {
      clearSelection();
      return;
    }
    setSelectionMode(true);
  }, [clearSelection, selectionMode]);

  const headerMenuItems = useMemo(() => [
    { icon: 'notifications-outline' as const, label: t('parent.notificationSettings', { defaultValue: 'Notification Settings' }), onPress: () => router.push('/screens/settings') },
    { icon: 'checkmark-done-outline' as const, label: t('parent.markAllRead', { defaultValue: 'Mark All as Read' }), onPress: handleMarkAllRead },
    { icon: 'archive-outline' as const, label: t('parent.archivedChats', { defaultValue: 'Archived Chats' }), onPress: () => router.push('/screens/settings') },
    { icon: 'star-outline' as const, label: t('parent.starredMessages', { defaultValue: 'Starred Messages' }), onPress: () => router.push('/screens/settings') },
  ], [t, handleMarkAllRead]);

  const filteredThreads = useMemo(() => {
    if (!threads || !searchQuery.trim()) return threads || [];
    const query = searchQuery.toLowerCase();
    return threads.filter(thread => {
      const other = thread.participants?.find((p: any) => p.role !== 'parent');
      const name = other?.user_profile ? `${other.user_profile.first_name} ${other.user_profile.last_name}` : '';
      const student = thread.student ? `${thread.student.first_name} ${thread.student.last_name}` : '';
      const lastMsg = thread.last_message?.content || '';
      return name.toLowerCase().includes(query) || student.toLowerCase().includes(query) || lastMsg.toLowerCase().includes(query);
    });
  }, [threads, searchQuery]);

  // --- Loading ---
  if (isLoading && !threads) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <MessagesListHeader
          title={t('parent.messages', { defaultValue: 'Messages' })}
          rightActionLabel={selectionMode ? 'Done' : 'Select'}
          onRightActionPress={handleHeaderSelectionToggle}
          menuItems={headerMenuItems}
        />
        <View style={styles.loadingContainer}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={styles.skeletonItem}><SkeletonLoader width="100%" height={90} borderRadius={16} /></View>
          ))}
        </View>
        <TouchableOpacity style={[styles.fab, styles.fabPrimary]} onPress={handleStartNewMessage} activeOpacity={0.8}>
          <Ionicons name="add" size={28} color={theme.onPrimary} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (error && !threads) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <MessagesListHeader
          title={t('parent.messages', { defaultValue: 'Messages' })}
          rightActionLabel={selectionMode ? 'Done' : 'Select'}
          onRightActionPress={handleHeaderSelectionToggle}
          menuItems={headerMenuItems}
        />
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}><Ionicons name="cloud-offline-outline" size={40} color={theme.error} /></View>
          <Text style={styles.errorTitle}>{t('parent.messagesError', { defaultValue: 'Failed to Load Messages' })}</Text>
          <Text style={styles.errorText}>{t('parent.messagesErrorDesc', { defaultValue: 'Unable to load your messages. Please check your connection and try again.' })}</Text>
          {__DEV__ && errorMessage && (
            <Text style={[styles.errorText, { fontSize: 12, color: theme.textSecondary, marginTop: 8 }]}>Debug: {errorMessage}</Text>
          )}
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>{t('common.retry', { defaultValue: 'Retry' })}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- Empty ---
  if (!filteredThreads || filteredThreads.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <MessagesListHeader
          title={t('parent.messages', { defaultValue: 'Messages' })}
          rightActionLabel={selectionMode ? 'Done' : 'Select'}
          onRightActionPress={handleHeaderSelectionToggle}
          menuItems={headerMenuItems}
        />
        {!isDashOrbUnlocked && (
          <View style={{ paddingTop: 8 }}>
            <DashAIItem onPress={handleOpenDashAI} title={dashCopy.navLabel}
              subtitle={t('parent.aiAssistantSubtitle', { defaultValue: dashCopy.messageSubtitle })}
              description={t('parent.aiAssistantDesc', { defaultValue: dashCopy.messageDescription })} />
          </View>
        )}
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={48} color={theme.primary} /></View>
          <Text style={styles.emptyTitle}>{t('parent.noMessagesTitle', { defaultValue: 'No Messages Yet' })}</Text>
          <Text style={styles.emptySubtitle}>{t('parent.noMessagesDesc', { defaultValue: "Start a conversation with your child's teacher to stay connected and informed." })}</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleStartNewMessage}>
            <Ionicons name="chatbubble-outline" size={20} color={theme.onPrimary} />
            <Text style={styles.emptyButtonText}>{t('parent.startNewMessage', { defaultValue: 'Start a Conversation' })}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- Thread list ---
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <MessagesListHeader
        title={t('parent.messages', { defaultValue: 'Messages' })}
        subtitle={`${filteredThreads.length} ${filteredThreads.length === 1 ? 'conversation' : 'conversations'}`}
        rightActionLabel={selectionMode ? 'Done' : 'Select'}
        onRightActionPress={handleHeaderSelectionToggle}
        menuItems={headerMenuItems}
      />
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={theme.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('parent.searchMessages', { defaultValue: 'Search conversations...' })}
            placeholderTextColor={theme.textSecondary}
            value={searchQuery} onChangeText={setSearchQuery} returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.searchClear} onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {selectionMode && (
        <View style={[styles.searchContainer, { marginTop: -4, marginBottom: 8, justifyContent: 'space-between' }]}>
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
                backgroundColor: selectedThreadIds.length > 0 ? theme.error : theme.surfaceVariant,
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
        estimatedItemSize={80}
        renderItem={({ item }) => (
          <ParentThreadItem
            thread={item}
            onPress={() => handleThreadPress(item)}
            onLongPress={() => handleThreadLongPress(item)}
            typingText={typingMap[item.id]}
            selectionMode={selectionMode}
            isSelected={selectedThreadIds.includes(item.id)}
          />
        )}
        ListHeaderComponent={
          !isDashOrbUnlocked ? (
            <DashAIItem onPress={handleOpenDashAI} title={dashCopy.navLabel}
              subtitle={t('parent.aiAssistantSubtitle', { defaultValue: dashCopy.messageSubtitle })}
              description={t('parent.aiAssistantDesc', { defaultValue: dashCopy.messageDescription })} />
          ) : null
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} colors={[theme.primary]} />}
      />
      <TouchableOpacity style={[styles.fab, styles.fabSecondary]} onPress={() => router.push('/screens/create-group')} activeOpacity={0.8}>
        <Ionicons name="people" size={24} color={theme.primary} />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.fab, styles.fabPrimary]} onPress={handleStartNewMessage} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color={theme.onPrimary} />
      </TouchableOpacity>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
