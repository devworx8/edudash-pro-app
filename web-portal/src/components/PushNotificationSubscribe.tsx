'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, BellOff, Settings, AlertCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';

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
  return outputArray as Uint8Array;
}

/**
 * Detects the user's browser for settings instructions
 */
function getBrowserName(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  // Check Edge first as it includes both 'chrome' and 'edge'
  if (userAgent.includes('edg')) return 'Edge';
  // Check Samsung Internet before Chrome as it may include 'chrome'
  if (userAgent.includes('samsungbrowser')) return 'Samsung Internet';
  // Check Chrome before Safari as Chrome on iOS includes 'safari'
  if (userAgent.includes('chrome')) return 'Chrome';
  // Check Firefox
  if (userAgent.includes('firefox')) return 'Firefox';
  // Safari is last - it has 'safari' but not 'chrome' or any other browser identifier
  if (userAgent.includes('safari')) return 'Safari';
  return 'your browser';
}

/**
 * Gets browser-specific instructions for enabling notifications
 */
function getSettingsInstructions(): string {
  const browser = getBrowserName();
  switch (browser) {
    case 'Chrome':
      return 'Click the lock/tune icon in the address bar → Site settings → Notifications → Allow';
    case 'Firefox':
      return 'Click the shield icon → Connection secure → More information → Permissions → Allow notifications';
    case 'Safari':
      return 'Safari menu → Settings → Websites → Notifications → Allow for this site';
    case 'Edge':
      return 'Click the lock icon → Permissions for this site → Notifications → Allow';
    case 'Samsung Internet':
      return 'Menu → Settings → Sites and downloads → Notifications → Allow';
    default:
      return 'Check your browser settings to enable notifications for this website';
  }
}

export function PushNotificationSubscribe() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [userId, setUserId] = useState<string>();
  const [isSupported, setIsSupported] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const supabase = createClient();
  const pathname = usePathname();
  const routeKnown = typeof pathname === 'string' && pathname.length > 0;
  const isDisplayRoute = !routeKnown || pathname.startsWith('/display');

  useEffect(() => {
    if (isDisplayRoute) return;
    const init = async () => {
      // Check if notifications are supported
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setIsSupported(false);
        return;
      }

      setPermission(Notification.permission);

      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserId(session.user.id);
      }

      // Check if already subscribed
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    };

    init();
  }, [isDisplayRoute, supabase]);

  const handleSubscribe = async () => {
    if (!userId) return;

    try {
      setIsLoading(true);

      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        if (perm === 'denied') {
          setShowInstructions(true);
        }
        return;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      // Get user's preschool_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('preschool_id')
        .eq('id', userId)
        .maybeSingle();

      // Save subscription to database
      const subscriptionJson = subscription.toJSON();
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          preschool_id: profile?.preschool_id || null,
          endpoint: subscriptionJson.endpoint!,
          p256dh: subscriptionJson.keys!.p256dh!,
          auth: subscriptionJson.keys!.auth!,
          user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'endpoint',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('[Push] Failed to save subscription:', error);
        throw new Error('Failed to save notification subscription');
      }

      console.log('[Push] Subscription saved successfully for user:', userId);

      setIsSubscribed(true);
    } catch (error) {
      // Handle error silently - user will see the button state
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!userId) return;

    try {
      setIsLoading(true);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Remove from database
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', subscription.endpoint);
      }

      setIsSubscribed(false);
    } catch (error) {
      // Handle error silently
    } finally {
      setIsLoading(false);
    }
  };

  if (isDisplayRoute) {
    return null;
  }

  // Don't show if notifications not supported
  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-400 rounded-lg">
        <AlertCircle size={18} />
        <span className="text-sm">Push notifications not supported in this browser</span>
      </div>
    );
  }

  // Don't show if not logged in
  if (!userId) {
    return null;
  }

  // Show denied state with instructions
  if (permission === 'denied') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-900/50 hover:bg-amber-900/70 text-amber-200 rounded-lg transition-colors border border-amber-700/50"
            title="Notifications are blocked - click for help"
          >
            <BellOff size={18} />
            <span className="text-sm font-medium">Notifications Blocked</span>
            <Settings size={14} className="ml-1" />
          </button>
        </div>
        {showInstructions && (
          <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-sm text-amber-200">
            <p className="font-medium mb-1">To enable notifications in {getBrowserName()}:</p>
            <p className="text-amber-300/80">{getSettingsInstructions()}</p>
            <p className="mt-2 text-xs text-amber-400/60">After enabling, refresh this page.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isSubscribed ? (
        <button
          onClick={handleUnsubscribe}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg transition-colors"
          title="Disable push notifications"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <BellOff size={18} />
          )}
          <span className="text-sm font-medium">Disable Notifications</span>
        </button>
      ) : (
        <button
          onClick={handleSubscribe}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          title="Enable push notifications"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Bell size={18} />
          )}
          <span className="text-sm font-medium">Enable Notifications</span>
        </button>
      )}
    </div>
  );
}
