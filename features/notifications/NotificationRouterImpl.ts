/**
 * NotificationRouter - Smart notification routing for multi-account support
 * 
 * Handles notifications for shared devices where multiple users may be registered.
 * When a notification arrives, it checks if it's for the currently logged-in user
 * and provides options to switch accounts if needed.
 */

import * as Notifications from 'expo-notifications';
import { Alert, Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { assertSupabase } from '@/lib/supabase';
import { signOutAndRedirect } from '@/lib/authActions';
import {
  deactivateCurrentUserTokens as deactivateTokens,
  reactivateUserTokens as reactivateTokens,
} from '@/lib/pushTokenUtils';
import { EnhancedBiometricAuth } from '@/services/EnhancedBiometricAuth';
import { clearAllNavigationLocks } from '@/lib/routeAfterLogin';
import { registerPushDevice } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { extractCallId, extractCallType, extractThreadId } from '@/lib/notifications/payload';

// Re-export for backwards compatibility
export { 
  deactivateTokens as deactivateCurrentUserTokens,
  reactivateTokens as reactivateUserTokens 
};

export interface NotificationPayload {
  user_id?: string;
  recipient_id?: string;
  target_user_id?: string;
  type?: string;
  title?: string;
  body?: string;
  [key: string]: any;
}

/**
 * Get currently logged-in user ID
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await assertSupabase().auth.getSession();
    return session?.user?.id || null;
  } catch (error) {
    console.error('[NotificationRouter] Failed to get current user:', error);
    return null;
  }
}

/**
 * Get currently logged-in user's role (e.g. 'parent', 'teacher', 'principal')
 */
async function getCurrentUserRole(): Promise<string | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const { data } = await assertSupabase()
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    return (data?.role as string) || null;
  } catch {
    return null;
  }
}

/**
 * Get user's name/email for display
 */
async function getUserDisplayName(userId: string): Promise<string> {
  try {
    const { data } = await assertSupabase()
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .maybeSingle();
    
    if (data?.first_name) {
      return `${data.first_name} ${data.last_name || ''}`.trim();
    }
    return data?.email || 'Another user';
  } catch {
    return 'Another user';
  }
}

/**
 * Handle account switch request.
 * Tries to restore from stored sessions first (no sign-out); falls back to sign-out + redirect.
 */
async function handleAccountSwitch(targetUserId: string): Promise<void> {
  try {
    const accounts = await EnhancedBiometricAuth.getBiometricAccounts();
    const targetInStored = accounts.some((a) => a.userId === targetUserId);

    if (targetInStored) {
      const currentUserId = await getCurrentUserId();
      if (currentUserId) {
        await deactivateTokens(currentUserId);
      }
      const result = await EnhancedBiometricAuth.restoreSessionForUser(targetUserId);
      if (result.success && result.sessionRestored) {
        clearAllNavigationLocks();
        try {
          const targetAccount = accounts.find((a) => a.userId === targetUserId);
          if (targetAccount) {
            await reactivateTokens(targetUserId);
            await registerPushDevice(assertSupabase(), {
              id: targetUserId,
              email: targetAccount.email,
            });
          }
        } catch (pushErr) {
          logger.debug('NotificationRouter', 'Push token reactivation failed (non-fatal):', pushErr);
        }
        logger.debug('NotificationRouter', 'Account switched via stored session, auth pipeline will handle routing');
        return;
      }
    }

    // Fallback: target not in stored accounts or restore failed — sign out and redirect
    await signOutAndRedirect({
      redirectTo: '/(auth)/sign-in',
      clearBiometrics: false,
    });
    await assertSupabase()
      .from('app_state')
      .upsert({
        key: 'pending_account_switch',
        value: { target_user_id: targetUserId, timestamp: Date.now() },
      });
  } catch (error) {
    console.error('[NotificationRouter] Account switch failed:', error);
    Alert.alert(
      'Switch Failed',
      'Unable to switch accounts. Please sign in manually.',
      [{ text: 'OK' }],
    );
  }
}

/**
 * Route notification based on target user
 * Returns true if notification should be shown, false if handled differently
 */
export async function routeNotification(
  notification: Notifications.Notification
): Promise<boolean> {
  try {
    const data = notification.request.content.data as NotificationPayload;
    
    // Extract target user ID (check multiple possible fields)
    const targetUserId = data.user_id || data.recipient_id || data.target_user_id;
    
    if (!targetUserId) {
      // No user targeting - show to current user
      logger.debug('NotificationRouter', 'No target user, showing notification');
      return true;
    }
    
    // Get currently logged-in user
    const currentUserId = await getCurrentUserId();
    
    if (!currentUserId) {
      // No user logged in - show notification with prompt to sign in
      logger.debug('NotificationRouter', 'No user logged in, showing notification');
      return true;
    }
    
    if (targetUserId === currentUserId) {
      // Notification is for current user - show it
      logger.debug('NotificationRouter', 'Notification for current user, showing');
      return true;
    }
    
    // Notification is for a different user
    logger.debug('NotificationRouter', 'Notification for different user:', {
      target: targetUserId,
      current: currentUserId
    });
    
    // Get target user's display name
    const targetUserName = await getUserDisplayName(targetUserId);
    
    // Show alert with option to switch accounts
    Alert.alert(
      'Message for Another User',
      `This ${data.type || 'notification'} is for ${targetUserName}. Would you like to switch accounts?`,
      [
        {
          text: 'Ignore',
          style: 'cancel',
          onPress: () => {
            logger.debug('NotificationRouter', 'User chose to ignore notification');
          }
        },
        {
          text: 'Switch Account',
          onPress: async () => {
            logger.debug('NotificationRouter', 'User chose to switch accounts');
            await handleAccountSwitch(targetUserId);
          }
        }
      ],
      { cancelable: true }
    );
    
    // Don't show the original notification
    return false;
    
  } catch (error) {
    console.error('[NotificationRouter] Error routing notification:', error);
    // On error, show the notification to avoid silent failures
    return true;
  }
}

/**
 * Setup notification router listener
 * Call this during app initialization
 */
export function setupNotificationRouter(): () => void {
  logger.debug('NotificationRouter', 'Setting up notification router');
  
  // Listen for notifications received while app is in foreground
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    async (notification) => {
      logger.debug('NotificationRouter', 'Foreground notification received');
      const data = notification.request.content.data as NotificationPayload;
      
      // IMPORTANT: Let CallProvider handle incoming_call notifications
      // Don't interfere with the call system
      if (data?.type === 'incoming_call') {
        logger.debug('NotificationRouter', 'Incoming call notification - letting CallProvider handle it');
        return;
      }
      
      // Mark message as delivered when notification is received (WhatsApp-style)
      // This happens even if app is backgrounded - the notification delivery means message reached device
      if (data?.type === 'message' || data?.type === 'chat') {
        const currentUserId = await getCurrentUserId();
        const threadId = extractThreadId(data);
        if (currentUserId && threadId) {
          try {
            await assertSupabase().rpc('mark_messages_delivered', {
              p_thread_id: threadId,
              p_user_id: currentUserId,
            });
            logger.debug('NotificationRouter', '✅ Marked messages as delivered for thread:', threadId);
          } catch (err) {
            logger.warn('NotificationRouter', 'Failed to mark messages as delivered:', err);
          }
        }
      }
      
      // For message notifications, always show banner (WhatsApp-style)
      // The routeNotification check is for account switching, not for suppressing notifications
      if (data?.type === 'message' || data?.type === 'chat') {
        // Message notifications should always show as banners
        logger.debug('NotificationRouter', 'Message notification - will show banner');
        // The notification handler in lib/notifications.ts will show it
        // We just mark as delivered and check for account switching
        await routeNotification(notification);
        return; // Don't suppress message notifications
      }
      
      const shouldShow = await routeNotification(notification);
      
      if (!shouldShow) {
        // Notification was handled (wrong user), don't show it
        logger.debug('NotificationRouter', 'Notification suppressed (wrong user)');
      }
    }
  );
  
  // Listen for notification interactions (user tapped notification)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    async (response) => {
      logger.debug('NotificationRouter', 'Notification interaction received');
      const notification = response.notification;
      const data = notification.request.content.data as NotificationPayload;
      
      // Mark message as delivered when notification is tapped (if not already delivered)
      // This handles the case where app was killed and notification wakes it
      if (data?.type === 'message' || data?.type === 'chat') {
        const currentUserId = await getCurrentUserId();
        const threadId = extractThreadId(data);
        if (currentUserId && threadId) {
          try {
            await assertSupabase().rpc('mark_messages_delivered', {
              p_thread_id: threadId,
              p_user_id: currentUserId,
            });
            logger.debug('NotificationRouter', '✅ Marked messages as delivered (from notification tap)');
          } catch (err) {
            logger.warn('NotificationRouter', 'Failed to mark messages as delivered:', err);
          }
        }
      }
      
      // Extract target user ID
      const targetUserId = data.user_id || data.recipient_id || data.target_user_id;
      const currentUserId = await getCurrentUserId();
      
      if (targetUserId && targetUserId !== currentUserId) {
        // User tapped notification for different account
        const targetUserName = await getUserDisplayName(targetUserId);
        
        Alert.alert(
          'Switch Account?',
          `This message is for ${targetUserName}. Switch to their account?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Switch',
              onPress: async () => {
                await handleAccountSwitch(targetUserId);
              }
            }
          ]
        );
      } else {
        // Notification is for current user - handle normally
        await handleNotificationInteraction(data);
      }
    }
  );
  
  // Return cleanup function
  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
    logger.debug('NotificationRouter', 'Notification router cleaned up');
  };
}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const extractReceiptUrl = (data: NotificationPayload): string | null => {
  const candidates = [
    (data as any)?.receipt_url,
    (data as any)?.receiptUrl,
    (data as any)?.receiptURL,
    (data as any)?.receipt,
    (data as any)?.url,
  ];
  for (const candidate of candidates) {
    const url = getString(candidate);
    if (url && url.trim()) return url;
  }
  return null;
};

const extractPaymentContext = (data: NotificationPayload): string => {
  const parts = [
    getString((data as any)?.payment_context),
    getString((data as any)?.fee_type),
    getString((data as any)?.fee_category),
    getString((data as any)?.payment_purpose),
    getString((data as any)?.paymentPurpose),
    getString((data as any)?.description),
    getString((data as any)?.title),
    getString((data as any)?.payment_reference),
  ].filter(Boolean) as string[];
  return parts.join(' ').toLowerCase();
};

const isUniformNotification = (data: NotificationPayload): boolean => {
  const context = extractPaymentContext(data);
  if (context.includes('uniform')) return true;
  const feeId = getString((data as any)?.fee_id) || getString((data as any)?.feeId);
  if (feeId && feeId.toLowerCase().startsWith('uniform')) return true;
  return false;
};

const resolveChildId = (data: NotificationPayload): string | undefined =>
  getString((data as any)?.student_id) || getString((data as any)?.child_id) || getString((data as any)?.childId);

const resolveBillingTab = (data: NotificationPayload): 'history' | 'upload' => {
  const type = getString(data.type)?.toLowerCase() || '';
  const combined = `${type} ${getString(data.title) || ''} ${getString(data.body) || ''}`.toLowerCase();
  if (combined.includes('review') || combined.includes('rejected') || combined.includes('needs attention')) {
    return 'upload';
  }
  return 'history';
};

const openReceipt = async (receiptUrl: string): Promise<void> => {
  const isPdf = /\.pdf(\?|$)/i.test(receiptUrl);
  if (isPdf) {
    router.push({ pathname: '/screens/pdf-viewer', params: { url: receiptUrl, title: 'Receipt' } } as any);
    return;
  }
  try {
    await Linking.openURL(receiptUrl);
  } catch {
    router.push({ pathname: '/screens/pdf-viewer', params: { url: receiptUrl, title: 'Receipt' } } as any);
  }
};

const resolveBuildStoreUrl = (data: NotificationPayload): string | null => {
  const directStoreUrl =
    getString((data as any)?.store_url) ||
    getString((data as any)?.storeUrl) ||
    getString((data as any)?.url);

  if (directStoreUrl) return directStoreUrl;

  const packageId =
    getString((data as any)?.package_id) ||
    getString((data as any)?.packageId) ||
    Constants?.expoConfig?.android?.package;

  if (!packageId) return null;

  if (Platform.OS === 'android') {
    return `market://details?id=${packageId}`;
  }

  return `https://play.google.com/store/apps/details?id=${packageId}`;
};

const openBuildUpdateStore = async (data: NotificationPayload): Promise<void> => {
  const primaryUrl = resolveBuildStoreUrl(data);
  if (!primaryUrl) {
    return;
  }

  try {
    await Linking.openURL(primaryUrl);
  } catch {
    const packageId =
      getString((data as any)?.package_id) ||
      getString((data as any)?.packageId) ||
      Constants?.expoConfig?.android?.package;
    if (!packageId) return;

    if (Platform.OS === 'android') {
      const webFallback = `https://play.google.com/store/apps/details?id=${packageId}`;
      try {
        await Linking.openURL(webFallback);
      } catch {
        // Best effort fallback only.
      }
    }
  }
};

/**
 * Handle notification interaction (user tapped notification)
 */
async function handleNotificationInteraction(data: NotificationPayload): Promise<void> {
  const receiptUrl = extractReceiptUrl(data);
  if (receiptUrl) {
    void openReceipt(receiptUrl);
    return;
  }

  const dataType = getString(data.type)?.toLowerCase() || '';
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

  if (isUniformNotification(data)) {
    const childId = resolveChildId(data);
    if (isPaymentLike) {
      const params = childId ? { childId } : undefined;
      router.push({ pathname: '/screens/parent-uniform-payments', params } as any);
    } else {
      router.push({ pathname: '/screens/parent-dashboard', params: { focus: 'uniform-sizes' } } as any);
    }
    return;
  }
  if (isPaymentLike) {
    const childId = resolveChildId(data);
    const tab = resolveBillingTab(data);
    const params = childId ? { tab, childId } : { tab };
    router.push({ pathname: '/screens/parent-payments', params } as any);
    return;
  }

  // Route to appropriate screen based on notification type
  const callId = extractCallId(data);
  const callType = extractCallType(data);
  switch (data.type) {
    case 'message':
    case 'chat':
      {
        const threadId = extractThreadId(data);
        if (threadId) {
        router.push({ pathname: '/screens/parent-message-thread', params: { threadId } } as any);
        } else {
          router.push('/screens/parent-messages' as any);
        }
      }
      break;
      
    case 'incoming_call':
    case 'missed_call':
    case 'call':
    case 'video_call':
    case 'voice_call':
      router.push({
        pathname: '/screens/calls',
        params: {
          ...(callId ? { callId } : {}),
          ...(callType ? { callType } : {}),
        },
      } as any);
      break;
      
    case 'announcement': {
      const role = await getCurrentUserRole();
      if (role === 'principal' || role === 'principal_admin') {
        router.push('/screens/principal-announcement' as any);
      } else if (role === 'teacher') {
        const feature = getString((data as any)?.feature) || '';
        const navigateTo = getString((data as any)?.navigate_to) || getString((data as any)?.route) || '';
        const looksLikeDailyRoutineShare =
          feature === 'daily_program_share_teachers' ||
          navigateTo === '/screens/teacher-daily-program-planner';

        if (looksLikeDailyRoutineShare) {
          const weekStartDate = getString((data as any)?.week_start_date);
          const classId = getString((data as any)?.class_id);
          router.push({
            pathname: '/screens/teacher-daily-program-planner',
            params: {
              ...(weekStartDate ? { weekStartDate } : {}),
              ...(classId ? { classId } : {}),
            },
          } as any);
        } else {
          // Teachers see general announcements in their messages/communications list
          router.push('/screens/teacher-message-list' as any);
        }
      } else {
        router.push('/screens/parent-announcements' as any);
      }
      break;
    }
      
    case 'homework':
    case 'assignment':
      router.push('/screens/homework' as any);
      break;
      
    case 'payment_approved':
    case 'pop_approved':
    case 'payment_status':
      // Navigate to fees & payments screen when payment is approved
      router.push('/screens/parent-payments' as any);
      break;

    case 'build_update_available':
      void openBuildUpdateStore(data);
      break;
      
    default:
      // Unknown type - go to main dashboard
      router.push('/screens/parent-dashboard' as any);
  }
}
