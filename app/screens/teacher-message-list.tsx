/**
 * Teacher Messages Screen
 * WhatsApp-style messaging list for teachers to communicate with parents
 * Matches PWA layout at /dashboard/teacher/messages
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { MessagesListHeader } from '@/components/messaging/MessageHeader';
import { useTeacherThreads, useTeacherThreadsRealtime, MessageThread } from '@/hooks/useTeacherMessaging';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { getDashAIRoleCopy } from '@/lib/ai/dashRoleCopy';
import ThreadItem from '@/components/teacher-messaging/ThreadItem';
import DashAIItem from '@/components/teacher-messaging/DashAIItem';
import { createStyles } from '@/features/teacher-messaging/teacher-message-list.styles';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { assertSupabase } from '@/lib/supabase';
import { toast } from '@/components/ui/ToastProvider';

export default function TeacherMessageListScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const dashCopy = getDashAIRoleCopy(profile?.role);
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { showAlert, alertProps } = useAlertModal();

  const organizationId =
    (profile as any)?.organization_membership?.organization_id ||
    (profile as any)?.organization_id ||
    (profile as any)?.preschool_id;

  const { data: threads, isLoading, error, refetch, isRefetching } = useTeacherThreads();

  // Subscribe to real-time thread updates (new messages update list without full reload)
  useTeacherThreadsRealtime(organizationId);

  // Refetch threads when screen gains focus to update unread badges
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleThreadPress = useCallback((thread: MessageThread) => {
    if (selectionMode) {
      setSelectedThreadIds((prev) =>
        prev.includes(thread.id) ? prev.filter((id) => id !== thread.id) : [...prev, thread.id]
      );
      return;
    }
    const isGroupThread = Boolean(
      thread.is_group ||
      ['class_group', 'parent_group', 'teacher_group', 'announcement', 'custom'].includes(String(thread.type || thread.group_type || ''))
    );
    const otherParticipant =
      thread.participants?.find((p: any) => p.role !== 'teacher') ||
      thread.participants?.find((p: any) => p.role === 'teacher');
    const participantName = isGroupThread
      ? (thread.group_name || thread.subject || 'Group')
      : (otherParticipant?.user_profile
        ? `${otherParticipant.user_profile.first_name} ${otherParticipant.user_profile.last_name}`.trim()
        : thread.subject || 'Contact');

    router.push({
      pathname: '/screens/teacher-message-thread',
      params: {
        threadId: thread.id,
        title: participantName,
        parentId: isGroupThread ? '' : (otherParticipant?.user_id || ''),
        parentName: participantName,
        isGroup: isGroupThread ? '1' : '0',
        threadType: (thread.type || thread.group_type || '') as string,
      },
    });
  }, [selectionMode]);

  const handleThreadLongPress = useCallback((thread: MessageThread) => {
    setSelectionMode(true);
    setSelectedThreadIds((prev) => (prev.includes(thread.id) ? prev : [...prev, thread.id]));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedThreadIds([]);
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
              queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
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

  const handleStartNewMessage = useCallback(() => {
    router.push('/screens/teacher-new-message');
  }, []);

  const handleOpenDashAI = useCallback(() => {
    router.push('/screens/dash-assistant');
  }, []);

  const handleHeaderSelectionToggle = useCallback(() => {
    if (selectionMode) {
      clearSelection();
      return;
    }
    setSelectionMode(true);
  }, [clearSelection, selectionMode]);

  const handleSettings = useCallback(() => {
    router.push('/screens/settings');
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────────

  const filteredThreads = useMemo(() => {
    if (!threads || !searchQuery.trim()) return threads || [];

    const query = searchQuery.toLowerCase();
    return threads.filter((thread) => {
      const otherParticipant = thread.participants?.find((p: any) => p.role === 'parent');
      const name = otherParticipant?.user_profile
        ? `${otherParticipant.user_profile.first_name} ${otherParticipant.user_profile.last_name}`
        : '';
      const studentNameStr = thread.student
        ? `${thread.student.first_name} ${thread.student.last_name}`
        : '';
      const lastMessage = thread.last_message?.content || '';

      return (
        name.toLowerCase().includes(query) ||
        studentNameStr.toLowerCase().includes(query) ||
        lastMessage.toLowerCase().includes(query)
      );
    });
  }, [threads, searchQuery]);

  const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

  // ── Shared header props ───────────────────────────────────────────────────────

  const headerProps = {
    title: t('teacher.messages', { defaultValue: 'Messages' }),
    onNewMessage: handleStartNewMessage,
    onSettings: handleSettings,
    rightActionLabel: selectionMode ? 'Done' : 'Select',
    onRightActionPress: handleHeaderSelectionToggle,
  };

  const dashAIProps = {
    onPress: handleOpenDashAI,
    title: dashCopy.navLabel,
    subtitle: t('teacher.aiAssistantSubtitle', { defaultValue: dashCopy.messageSubtitle }),
    description: t('teacher.aiAssistantDesc', { defaultValue: dashCopy.messageDescription }),
  };

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (isLoading && !threads) {
    return (
      <View style={styles.container}>
        <MessagesListHeader {...headerProps} />
        <View style={styles.loadingContainer}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonItem}>
              <SkeletonLoader width="100%" height={90} borderRadius={16} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────────

  if (error && !threads) {
    return (
      <View style={styles.container}>
        <MessagesListHeader {...headerProps} />
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Ionicons name="cloud-offline-outline" size={40} color={theme.error} />
          </View>
          <Text style={styles.errorTitle}>
            {t('teacher.messagesError', { defaultValue: 'Unable to Load Messages' })}
          </Text>
          <Text style={styles.errorText}>
            {t('teacher.messagesErrorDesc', { defaultValue: 'We couldn\'t load your messages. Please check your connection and try again.' })}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>
              {t('common.retry', { defaultValue: 'Try Again' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Empty state (still shows Dash AI + FABs) ───────────────────────────────────

  if (!filteredThreads || filteredThreads.length === 0) {
    return (
      <View style={styles.container}>
        <MessagesListHeader {...headerProps} />
        <View style={{ paddingTop: 8 }}>
          <DashAIItem {...dashAIProps} />
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {t('teacher.noMessagesTitle', { defaultValue: 'No Messages Yet' })}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t('teacher.noMessagesDesc', { defaultValue: 'Parent and staff conversations will appear here once messages start.' })}
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleStartNewMessage}>
            <Ionicons name="chatbubble-outline" size={20} color={theme.onPrimary} />
            <Text style={styles.emptyButtonText}>
              {t('teacher.startNewMessage', { defaultValue: 'Start New Message' })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Create Group FAB - visible in empty state too */}
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 90 }]}
          onPress={() => router.push('/screens/create-group')}
          activeOpacity={0.8}
        >
          <Ionicons name="people-circle" size={24} color={theme.onPrimary} />
        </TouchableOpacity>

        {/* Compose FAB */}
        <TouchableOpacity style={styles.fab} onPress={handleStartNewMessage} activeOpacity={0.8}>
          <Ionicons name="create" size={24} color={theme.onPrimary} />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Thread list ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <MessagesListHeader
        {...headerProps}
        subtitle={selectionMode
          ? `${selectedThreadIds.length} selected`
          : `${filteredThreads.length} ${filteredThreads.length === 1 ? 'conversation' : 'conversations'}`}
      />
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
          <ThreadItem
            thread={item}
            onPress={() => handleThreadPress(item)}
            onLongPress={() => handleThreadLongPress(item)}
            selectionMode={selectionMode}
            isSelected={selectedThreadIds.includes(item.id)}
          />
        )}
        ListHeaderComponent={<DashAIItem {...dashAIProps} />}
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

      {/* Group FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 90 }]}
        onPress={() => router.push('/screens/create-group')}
        activeOpacity={0.8}
      >
        <Ionicons name="people-circle" size={24} color={theme.onPrimary} />
      </TouchableOpacity>

      {/* Compose FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleStartNewMessage} activeOpacity={0.8}>
        <Ionicons name="create" size={24} color={theme.onPrimary} />
      </TouchableOpacity>
      <AlertModal {...alertProps} />
    </View>
  );
}
