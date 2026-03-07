'use client';

import { createClient } from '@/lib/supabase/client';

// VAPID key for browser push
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BLXiYIECWZGIlbDkQKKPhl3t86tGQRQDAHnNq5JHMg9btdbjiVgt3rLDeGhz5LveRarHS-9vY84aFkQrfApmNpE';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type NotificationType = 'call' | 'message' | 'announcement' | 'homework' | 'general' | 'live-lesson' | 'scheduled-lesson';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  type?: NotificationType;
  data?: {
    url?: string;
    type?: NotificationType;
    [key: string]: any;
  };
  requireInteraction?: boolean;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 
    'Notification' in window && 
    'serviceWorker' in navigator && 
    'PushManager' in window;
}

/**
 * Check if device is iOS (special handling needed)
 */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Check if running as installed PWA
 */
export function isInstalledPWA(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

/**
 * Get current push subscription status
 */
export async function getPushSubscriptionStatus(): Promise<{
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  isIOS: boolean;
  isPWA: boolean;
}> {
  if (!isPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false, isIOS: isIOSDevice(), isPWA: isInstalledPWA() };
  }

  const permission = Notification.permission;
  let subscribed = false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    subscribed = !!subscription;
  } catch (e) {
    console.error('[Push] Failed to check subscription:', e);
  }

  return { 
    supported: true, 
    permission, 
    subscribed,
    isIOS: isIOSDevice(),
    isPWA: isInstalledPWA()
  };
}

/**
 * Request notification permission and subscribe to push
 */
export async function subscribeToPush(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications not supported on this device' };
  }

  // Special handling for iOS
  if (isIOSDevice() && !isInstalledPWA()) {
    return { 
      success: false, 
      error: 'On iOS, please install the app first: tap Share → Add to Home Screen, then enable notifications' 
    };
  }

  try {
    // Request permission
    console.log('[Push] Requesting permission...');
    const permission = await Notification.requestPermission();
    console.log('[Push] Permission result:', permission);
    
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission denied' };
    }

    // Ensure service worker is registered and active
    const registration = await navigator.serviceWorker.ready;
    console.log('[Push] Service worker ready:', registration.active?.state);

    // Subscribe to push manager with retry
    let subscription: PushSubscription | null = null;
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    
    // Try up to 3 times
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Check for existing subscription first
        subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
          console.log(`[Push] Creating new subscription (attempt ${attempt})...`);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
          });
        }
        
        if (subscription) break;
      } catch (err) {
        console.error(`[Push] Subscription attempt ${attempt} failed:`, err);
        if (attempt === 3) throw err;
        await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
      }
    }

    if (!subscription) {
      return { success: false, error: 'Failed to create push subscription after 3 attempts' };
    }

    console.log('[Push] Subscription created:', subscription.endpoint);

    // Save to Supabase
    const supabase = createClient();
    
    // Get user's preschool_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('preschool_id, role')
      .eq('id', userId)
      .maybeSingle();

    const subscriptionJson = subscription.toJSON();
    
    // Upsert subscription (handles existing subscriptions)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        preschool_id: profile?.preschool_id || null,
        endpoint: subscriptionJson.endpoint!,
        p256dh: subscriptionJson.keys!.p256dh!,
        auth: subscriptionJson.keys!.auth!,
        user_agent: navigator.userAgent,
        topics: getDefaultTopics(profile?.role),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'endpoint',
      });

    if (error) {
      console.error('[Push] Failed to save subscription:', error);
      return { success: false, error: 'Failed to save subscription to server' };
    }

    console.log('[Push] Subscription saved successfully');
    return { success: true };
  } catch (e: any) {
    console.error('[Push] Subscribe error:', e);
    return { success: false, error: e?.message || 'Subscription failed' };
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications not supported' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();

      // Remove from database
      const supabase = createClient();
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint);
    }

    return { success: true };
  } catch (e: any) {
    console.error('[Push] Unsubscribe error:', e);
    return { success: false, error: e?.message || 'Unsubscribe failed' };
  }
}

/**
 * Show a local notification (when user is in app)
 * This bypasses the service worker for immediate in-app notifications
 */
export async function showLocalNotification(payload: PushPayload): Promise<boolean> {
  if (!isPushSupported()) {
    console.log('[Push] Local notification skipped - push not supported');
    return false;
  }
  
  if (Notification.permission !== 'granted') {
    console.log('[Push] Local notification skipped - permission not granted');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Determine vibration pattern based on type
    const vibrate = payload.type === 'call' || payload.data?.type === 'call' 
      ? [200, 100, 200, 100, 200] 
      : [200, 100, 200];
    
    // Determine actions based on type
    let actions: { action: string; title: string }[] | undefined;
    if (payload.type === 'call' || payload.data?.type === 'call' || payload.type === 'live-lesson') {
      actions = [
        { action: 'join', title: '📹 Join Now' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    } else if (payload.type === 'message' || payload.data?.type === 'message') {
      actions = [
        { action: 'view', title: '💬 View' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    }

    await registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/icon-192.png',
      tag: payload.tag || `local-${Date.now()}`,
      data: {
        ...payload.data,
        type: payload.type,
      },
      requireInteraction: payload.requireInteraction || false,
      silent: false,
      vibrate,
      actions,
    } as NotificationOptions);
    
    console.log('[Push] Local notification shown:', payload.title);
    return true;
  } catch (e) {
    console.error('[Push] Failed to show local notification:', e);
    return false;
  }
}

/**
 * Send a push notification via the API (server-side delivery)
 * Use this for notifications that need to reach users even when the app is closed
 */
export async function sendPushNotification(
  recipientUserId: string,
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        userId: recipientUserId,
        title: payload.title,
        body: payload.body,
        icon: payload.icon,
        tag: payload.tag,
        type: payload.type || payload.data?.type || 'general',
        requireInteraction: payload.requireInteraction,
        data: payload.data,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send notification');
    }

    const result = await response.json();
    console.log('[Push] Server notification sent:', result);
    return { success: true };
  } catch (e: any) {
    console.error('[Push] Failed to send server notification:', e);
    return { success: false, error: e?.message || 'Failed to send notification' };
  }
}

/**
 * Listen for service worker messages (e.g., notification clicks)
 * Call this once on app initialization
 */
export function setupServiceWorkerMessageListener(
  onNotificationClick?: (url: string, type?: string) => void
): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  const handler = (event: MessageEvent) => {
    console.log('[Push] Service worker message:', event.data);
    
    if (event.data?.type === 'NOTIFICATION_CLICK') {
      const { url, notificationType } = event.data;
      if (onNotificationClick) {
        onNotificationClick(url, notificationType);
      } else if (url && typeof window !== 'undefined') {
        // Default behavior: navigate to the URL
        window.location.href = url;
      }
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);
  
  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}

/**
 * Get default notification topics based on user role
 */
function getDefaultTopics(role?: string): string[] {
  const baseTopics = ['general', 'announcements'];
  
  switch (role) {
    case 'parent':
      return [...baseTopics, 'homework', 'messages', 'calls'];
    case 'teacher':
      return [...baseTopics, 'messages', 'calls', 'attendance'];
    case 'principal':
      return [...baseTopics, 'messages', 'calls', 'registrations', 'reports'];
    default:
      return baseTopics;
  }
}

// ============================================
// Notification Trigger Functions (client-side)
// ============================================

/**
 * Trigger notification when receiving a new message
 */
export async function notifyNewMessage(
  senderName: string,
  messagePreview: string,
  threadId: string,
  recipientRole: 'parent' | 'teacher'
): Promise<void> {
  const dashboardPath = recipientRole === 'parent' 
    ? '/dashboard/parent/messages' 
    : '/dashboard/teacher/messages';

  await showLocalNotification({
    title: `New message from ${senderName}`,
    body: messagePreview.length > 50 ? messagePreview.slice(0, 50) + '...' : messagePreview,
    tag: `message-${threadId}`,
    data: {
      url: `${dashboardPath}?thread=${threadId}`,
      type: 'message',
      threadId,
    },
    requireInteraction: false,
  });
}

/**
 * Trigger notification for incoming call
 */
export async function notifyIncomingCall(
  callerName: string,
  callType: 'voice' | 'video',
  callId: string
): Promise<void> {
  await showLocalNotification({
    title: `Incoming ${callType} call`,
    body: `${callerName} is calling...`,
    tag: `call-${callId}`,
    icon: '/icon-192.png',
    data: {
      url: '/dashboard/parent/messages',
      type: 'call',
      callId,
      callType,
    },
    requireInteraction: true, // Keep visible until dismissed
  });
}

/**
 * Trigger notification for new announcement
 */
export async function notifyNewAnnouncement(
  title: string,
  preview: string,
  announcementId: string
): Promise<void> {
  await showLocalNotification({
    title: `📢 ${title}`,
    body: preview.length > 80 ? preview.slice(0, 80) + '...' : preview,
    tag: `announcement-${announcementId}`,
    data: {
      url: '/dashboard/parent/announcements',
      type: 'announcement',
      announcementId,
    },
    requireInteraction: false,
  });
}

/**
 * Trigger notification for new homework (parent)
 */
export async function notifyNewHomework(
  studentName: string,
  subject: string,
  homeworkId: string,
  dueDate?: string
): Promise<void> {
  const duePart = dueDate ? ` - Due: ${dueDate}` : '';
  await showLocalNotification({
    title: `📚 New homework for ${studentName}`,
    body: `${subject}${duePart}`,
    tag: `homework-${homeworkId}`,
    data: {
      url: `/dashboard/parent/homework/${homeworkId}`,
      type: 'homework',
      homeworkId,
      studentName,
    },
    requireInteraction: false,
  });
}

/**
 * Trigger notification for homework due soon
 */
export async function notifyHomeworkDueSoon(
  studentName: string,
  subject: string,
  homeworkId: string,
  hoursRemaining: number
): Promise<void> {
  await showLocalNotification({
    title: `⏰ Homework due soon`,
    body: `${studentName}'s ${subject} homework is due in ${hoursRemaining} hours`,
    tag: `homework-reminder-${homeworkId}`,
    data: {
      url: `/dashboard/parent/homework/${homeworkId}`,
      type: 'homework',
      homeworkId,
    },
    requireInteraction: true,
  });
}
