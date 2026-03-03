/**
 * Notifications Screen
 * 
 * Displays all notifications for the user including:
 * - Message notifications
 * - Call notifications (missed calls)
 * - System notifications
 * - School announcements
 * 
 * Refactored to comply with WARP.md (≤500 lines for screens)
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Linking,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { useAlert } from '@/components/ui/StyledAlert';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useMarkCallsSeen } from '@/hooks/useMissedCalls';
import { useMarkAnnouncementsSeen } from '@/hooks/useNotificationCount';
import { useNotificationsQuery } from '@/hooks/useNotificationsQuery';
import { extractCallId, extractCallType, extractThreadId } from '@/lib/notifications/payload';
import {
  markNotificationRead,
  markAllNotificationsRead,
  addToClearedNotifications,
  setClearedBeforeDate,
} from '@/hooks/useNotificationStorage';
import {
  NotificationItem,
  NotificationHeader,
  NotificationMenu,
  Notification,
} from '@/components/notifications';

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const alert = useAlert();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const role = profile?.role;
  const isParent = role === 'parent';
  const isTeacher = role === 'teacher';
  const isPrincipal = role === 'principal' || role === 'principal_admin';
  
  const { data: notifications = [], isLoading, refetch } = useNotificationsQuery();
  
  // Hooks to mark categories as seen
  const { mutate: markCallsSeen } = useMarkCallsSeen();
  const { mutate: markAnnouncementsSeen } = useMarkAnnouncementsSeen();
  
  // Mark all notifications as seen when screen mounts
  useEffect(() => {
    markCallsSeen();
    markAnnouncementsSeen();
  }, [markCallsSeen, markAnnouncementsSeen]);
  
  // Unread count
  const unreadCount = useMemo(() => 
    notifications.filter(n => !n.read).length
  , [notifications]);
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // ── Multi-select ──────────────────────────────────────────────────────────
  const handleLongPressSelect = useCallback((notification: Notification) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(notification.id)) {
        next.delete(notification.id);
      } else {
        next.add(notification.id);
      }
      return next;
    });
  }, []);

  const handleCancelSelect = useCallback(() => setSelectedIds(new Set()), []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(notifications.map((n) => n.id)));
  }, [notifications]);

  const handleDeleteSelected = useCallback(async () => {
    if (!user?.id || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    for (const id of ids) {
      await markNotificationRead(user.id, id);
    }
    await addToClearedNotifications(user.id, ids);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
  }, [user?.id, selectedIds, queryClient]);

  // ── Swipe-to-dismiss ──────────────────────────────────────────────────────
  const handleDismiss = useCallback(async (notification: Notification) => {
    if (!user?.id) return;
    await markNotificationRead(user.id, notification.id);
    await addToClearedNotifications(user.id, [notification.id]);
    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
  }, [user?.id, queryClient]);

  // Mark a single notification as read
  const handleMarkRead = useCallback(async (notificationId: string) => {
    if (!user?.id) return;
    await markNotificationRead(user.id, notificationId);
    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
  }, [user?.id, queryClient, isParent, isPrincipal, isTeacher]);
  
  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    if (!user?.id) return;
    const allIds = notifications.map(n => n.id);
    await markAllNotificationsRead(user.id, allIds);
    markCallsSeen();
    markAnnouncementsSeen();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['missed-calls-count'] });
    queryClient.invalidateQueries({ queryKey: ['unread-announcements-count'] });
    queryClient.invalidateQueries({ queryKey: ['parent', 'unread-count'] });
  }, [user?.id, notifications, queryClient, markCallsSeen, markAnnouncementsSeen]);
  
  const navigateSafe = useCallback((path: string, params?: Record<string, string>) => {
    try {
      const { safeRouter } = require('@/lib/navigation/safeRouter');
      if (params) {
        safeRouter.push({ pathname: path, params });
      } else {
        safeRouter.push(path);
      }
    } catch {
      if (params) {
        router.push({ pathname: path, params });
      } else {
        router.push(path);
      }
    }
  }, []);

  const messageThreadPath = isTeacher
    ? '/screens/teacher-message-thread'
    : isPrincipal
      ? '/screens/principal-message-thread'
      : '/screens/parent-message-thread';
  const messageListPath = isTeacher
    ? '/screens/teacher-message-list'
    : isPrincipal
      ? '/screens/principal-messages'
      : '/screens/parent-messages';

  const getString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const extractNotificationPayload = (data?: Record<string, unknown>): Record<string, unknown> => {
    if (!data || typeof data !== 'object') return {};
    const nested = (data as Record<string, unknown>).data;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return {
        ...(data as Record<string, unknown>),
        ...(nested as Record<string, unknown>),
      };
    }
    return data as Record<string, unknown>;
  };

  const extractReceiptUrl = (data?: Record<string, unknown>): string | null => {
    if (!data) return null;
    const candidates = [
      data.receipt_url,
      data.receiptUrl,
      data.receiptURL,
      data.receipt,
      data.url,
    ];
    for (const candidate of candidates) {
      const url = getString(candidate);
      if (url && url.trim()) return url;
    }
    return null;
  };

  const extractPaymentContext = (data?: Record<string, unknown>, fallbackText = ''): string => {
    const parts = [
      getString(data?.payment_context),
      getString(data?.fee_type),
      getString(data?.fee_category),
      getString(data?.payment_purpose),
      getString(data?.paymentPurpose),
      getString(data?.description),
      getString(data?.title),
      getString(data?.payment_reference),
      fallbackText,
    ].filter(Boolean) as string[];
    return parts.join(' ').toLowerCase();
  };

  const isUniformNotification = (data?: Record<string, unknown>, fallbackText = ''): boolean => {
    const context = extractPaymentContext(data, fallbackText);
    if (context.includes('uniform')) return true;
    const feeId = getString(data?.fee_id) || getString(data?.feeId);
    if (feeId && feeId.toLowerCase().startsWith('uniform')) return true;
    return false;
  };

  const resolveChildId = (data?: Record<string, unknown>): string | undefined =>
    getString(data?.student_id) || getString(data?.child_id) || getString(data?.childId);

  const resolveBillingTab = (data?: Record<string, unknown>, fallbackText = ''): 'history' | 'upload' => {
    const type = getString(data?.type)?.toLowerCase() || '';
    const combined = `${type} ${fallbackText}`.toLowerCase();
    if (
      combined.includes('review') ||
      combined.includes('rejected') ||
      combined.includes('needs attention')
    ) {
      return 'upload';
    }
    return 'history';
  };

  // Navigate based on notification type
  const handleNotificationPress = useCallback(async (notification: Notification) => {
    if (user?.id && !notification.read) {
      await markNotificationRead(user.id, notification.id);
      queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
    }

    const payload = extractNotificationPayload(notification.data);
    const receiptUrl = extractReceiptUrl(payload);
    if (receiptUrl) {
      const lowerUrl = receiptUrl.toLowerCase();
      if (lowerUrl.endsWith('.pdf')) {
        navigateSafe('/screens/pdf-viewer', { url: receiptUrl, title: 'Receipt' });
      } else {
        try {
          await Linking.openURL(receiptUrl);
        } catch {
          navigateSafe('/screens/pdf-viewer', { url: receiptUrl, title: 'Receipt' });
        }
      }
      return;
    }

    const fallbackText = `${notification.title} ${notification.body}`.trim();
    const dataType = getString(payload?.type)?.toLowerCase() || '';
    const threadId = extractThreadId(payload);
    const callId = extractCallId(payload);
    const callType = extractCallType(payload);
    const combinedText = `${notification.title} ${notification.body} ${dataType}`.toLowerCase();
    const isCallLike =
      notification.type === 'call' ||
      ['call', 'incoming_call', 'missed_call', 'voice_call', 'video_call'].includes(dataType) ||
      /\b(call|calling|missed call|voice call|video call)\b/.test(combinedText);
    const isMessageLike =
      notification.type === 'message' ||
      ['message', 'chat', 'new_message'].includes(dataType) ||
      (threadId ? true : /\bmessage\b/.test(combinedText));

    if (isCallLike) {
      navigateSafe('/screens/calls', {
        ...(callId ? { callId } : {}),
        ...(callType ? { callType } : {}),
      });
      return;
    }

    if (isMessageLike) {
      if (threadId) {
        navigateSafe(messageThreadPath, { threadId });
      } else {
        navigateSafe(messageListPath);
      }
      return;
    }
    const isPaymentLike = [
      'payment_approved',
      'payment_rejected',
      'payment_receipt',
      'payment_status',
      'payment_confirmed',
      'pop_approved',
      'pop_rejected',
      'pop_submitted',
      'receipt',
    ].includes(dataType);

    if (isUniformNotification(payload, fallbackText)) {
      const childId = resolveChildId(payload);
      if (isParent && isPaymentLike) {
        if (childId) {
          navigateSafe('/screens/parent-uniform-payments', { childId });
        } else {
          navigateSafe('/screens/parent-uniform-payments');
        }
      } else {
        navigateSafe('/screens/parent-dashboard', { focus: 'uniform-sizes' });
      }
      return;
    }

    if (isParent && isPaymentLike) {
      const childId = resolveChildId(payload);
      const tab = resolveBillingTab(payload, fallbackText);
      if (childId) {
        navigateSafe('/screens/parent-payments', { tab, childId });
      } else {
        navigateSafe('/screens/parent-payments', { tab });
      }
      return;
    }
    
    switch (notification.type) {
      case 'message':
        if (threadId) navigateSafe(messageThreadPath, { threadId });
        else navigateSafe(messageListPath);
        break;
      case 'call':
        navigateSafe('/screens/calls');
        break;
      case 'homework':
        if (payload?.assignment_id) {
          navigateSafe('/screens/homework-detail', { assignmentId: payload.assignment_id as string });
        } else {
          navigateSafe('/screens/homework');
        }
        break;
      case 'grade':
        navigateSafe('/screens/grades');
        break;
      case 'announcement':
        if (isTeacher) {
          const feature = getString(payload?.feature) || '';
          const navigateTo = getString(payload?.navigate_to) || getString(payload?.route) || '';
          const looksLikeDailyRoutineShare =
            feature === 'daily_program_share_teachers' ||
            navigateTo === '/screens/teacher-daily-program-planner';
          if (looksLikeDailyRoutineShare) {
            const weekStartDate = getString(payload?.week_start_date);
            const classId = getString(payload?.class_id);
            navigateSafe('/screens/teacher-daily-program-planner', {
              ...(weekStartDate ? { weekStartDate } : {}),
              ...(classId ? { classId } : {}),
            });
          } else {
            navigateSafe('/screens/teacher-message-list');
          }
        } else {
          navigateSafe('/screens/parent-announcements');
        }
        break;
      case 'attendance':
        navigateSafe('/screens/parent-progress');
        break;
      case 'registration':
        if (payload?.registration_id) {
          navigateSafe('/screens/registration-detail', { id: payload.registration_id as string });
        } else {
          navigateSafe('/screens/principal-registrations');
        }
        break;
      case 'billing':
        if (isParent) {
          const childId = resolveChildId(payload);
          const tab = resolveBillingTab(payload, `${notification.title} ${notification.body}`.trim());
          if (childId) {
            navigateSafe('/screens/parent-payments', { tab, childId });
          } else {
            navigateSafe('/screens/parent-payments', { tab });
          }
        } else if (isPrincipal) {
          navigateSafe('/screens/finance-control-center?tab=overview');
        } else if (isTeacher) {
          navigateSafe('/screens/teacher-dashboard');
        } else {
          navigateSafe('/screens/finance-control-center?tab=overview');
        }
        break;
      case 'calendar':
        navigateSafe('/screens/calendar');
        break;
      case 'birthday':
        navigateSafe('/screens/birthday-planner');
        break;
      case 'system':
      default:
        // For system notifications, don't navigate
        break;
    }
  }, [user?.id, queryClient, isParent, isPrincipal, isTeacher, messageListPath, messageThreadPath, navigateSafe]);
  
  // Clear call notifications
  const handleClearCallNotifications = useCallback(() => {
    if (!user?.id) return;

    alert.show(
      t('notifications.clearCallNotifications', { defaultValue: 'Clear Call Notifications' }),
      t('notifications.clearCallNotificationsConfirm', { defaultValue: 'This will remove all call notifications from the list.' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.clear', { defaultValue: 'Clear' }),
          style: 'destructive',
          onPress: async () => {
            const callNotifIds = notifications.filter(n => n.type === 'call').map(n => n.id);
            await addToClearedNotifications(user.id, callNotifIds);
            markCallsSeen();
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['missed-calls-count'] });
          }
        }
      ],
      { type: 'confirm' }
    );
  }, [alert, user?.id, t, queryClient, markCallsSeen, notifications]);
  
  // Clear message notifications
  const handleClearMessageNotifications = useCallback(() => {
    if (!user?.id) return;

    alert.show(
      t('notifications.markMessagesRead', { defaultValue: 'Clear Message Notifications' }),
      t('notifications.markMessagesReadConfirm', { defaultValue: 'This will remove all message notifications from the list.' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.clear', { defaultValue: 'Clear' }),
          style: 'destructive',
          onPress: async () => {
            const msgNotifIds = notifications.filter(n => n.type === 'message').map(n => n.id);
            await addToClearedNotifications(user.id, msgNotifIds);
            
            const client = assertSupabase();
            await client
              .from('message_participants')
              .update({ last_read_at: new Date().toISOString() })
              .eq('user_id', user.id);
            
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
            queryClient.invalidateQueries({ queryKey: ['parent', 'unread-count'] });
          }
        }
      ],
      { type: 'confirm' }
    );
  }, [alert, user?.id, t, queryClient, notifications]);
  
  // Reply to a notification — navigate to the relevant thread
  const handleReply = useCallback((notification: Notification) => {
    const threadId = extractThreadId(notification.data as Record<string, unknown> | undefined);
    if (threadId) {
      navigateSafe(messageThreadPath, { threadId });
    } else {
      navigateSafe(messageListPath);
    }
  }, [messageThreadPath, messageListPath, navigateSafe]);

  // Mute a notification source (thread)
  const handleMute = useCallback(async (notification: Notification) => {
    if (!user?.id) return;
    const threadId = extractThreadId(notification.data as Record<string, unknown> | undefined);
    if (!threadId) return;

    try {
      const client = assertSupabase();
      await client
        .from('message_participants')
        .update({ is_muted: true })
        .eq('thread_id', threadId)
        .eq('user_id', user.id);

      alert.show(
        t('notifications.actions.muted_title', { defaultValue: 'Thread Muted' }),
        t('notifications.actions.muted_desc', { defaultValue: 'You won\'t receive notifications from this conversation.' }),
        [{ text: t('common.ok', { defaultValue: 'OK' }) }],
        { type: 'success' }
      );
    } catch {
      // Silently fail — not critical
    }
  }, [user?.id, alert, t]);

  // Clear all notifications
  const handleClearAll = useCallback(() => {
    alert.showConfirm(
      t('notifications.clearAll', { defaultValue: 'Clear All Notifications' }),
      t('notifications.clearAllConfirm', { defaultValue: 'Are you sure you want to clear all notifications? This cannot be undone.' }),
      async () => {
        if (!user?.id) return;
        
        await setClearedBeforeDate(user.id, new Date());
        markCallsSeen();
        markAnnouncementsSeen();
        
        try {
          const client = assertSupabase();
          await client
            .from('message_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('user_id', user.id);
        } catch (error) {
          console.error('[ClearAll] Error updating messages:', error);
        }
        
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['missed-calls-count'] });
        queryClient.invalidateQueries({ queryKey: ['unread-announcements-count'] });
        queryClient.invalidateQueries({ queryKey: ['parent', 'unread-count'] });
      }
    );
  }, [alert, t, queryClient, user?.id, markCallsSeen, markAnnouncementsSeen]);
  
  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
        <NotificationHeader title={t('notifications.title', { defaultValue: 'Notifications' })} />
        <View style={styles.loadingContainer}>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={styles.skeletonItem}>
              <SkeletonLoader width="100%" height={80} borderRadius={12} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }
  
  // Empty state
  if (notifications.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
        <NotificationHeader title={t('notifications.title', { defaultValue: 'Notifications' })} />
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.primary + '15' }]}>
            <Ionicons name="notifications-off-outline" size={48} color={theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {t('notifications.empty', { defaultValue: 'No Notifications' })}
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            {t('notifications.emptyDesc', { defaultValue: "You're all caught up! Check back later for updates." })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  
  const isSelectMode = selectedIds.size > 0;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      {isSelectMode ? (
        <View style={[styles.selectHeader, { backgroundColor: theme.primary, paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={handleCancelSelect} style={styles.selectHeaderBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.selectHeaderTitle}>
            {selectedIds.size} selected
          </Text>
          <View style={styles.selectHeaderActions}>
            <TouchableOpacity onPress={handleSelectAll} style={styles.selectHeaderBtn}>
              <Text style={styles.selectHeaderAction}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteSelected} style={styles.selectHeaderBtn}>
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <NotificationHeader 
          title={t('notifications.title', { defaultValue: 'Notifications' })}
          subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
          rightAction={{
            icon: 'ellipsis-vertical',
            onPress: () => setMenuVisible(true),
          }}
        />
      )}
      
      <NotificationMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onMarkAllRead={handleMarkAllRead}
        onClearMessages={handleClearMessageNotifications}
        onClearCalls={handleClearCallNotifications}
        onClearAll={handleClearAll}
      />
      
      <FlashList
        data={notifications}
        keyExtractor={(item) => item.id}
        estimatedItemSize={90}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={isSelectMode ? () => handleLongPressSelect(item) : () => handleNotificationPress(item)}
            onMarkRead={() => handleMarkRead(item.id)}
            onReply={!isSelectMode && (item.type === 'message' || item.type === 'call') ? handleReply : undefined}
            onMute={!isSelectMode && (item.type === 'message' || item.type === 'announcement') ? handleMute : undefined}
            selected={isSelectMode ? selectedIds.has(item.id) : undefined}
            onLongPressSelect={handleLongPressSelect}
            onDismiss={!isSelectMode ? handleDismiss : undefined}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      />
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  selectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  selectHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  selectHeaderBtn: {
    padding: 6,
  },
  selectHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectHeaderAction: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 16,
  },
  skeletonItem: {
    marginBottom: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  listContent: {
    padding: 16,
  },
});
