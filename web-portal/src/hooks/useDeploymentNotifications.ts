'use client';

import { useEffect } from 'react';

/**
 * Subscribe to deployment update notifications
 * Uses Web Push API to receive notifications when new versions are deployed
 */
export function useDeploymentNotifications() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const subscribeToUpdates = async () => {
      try {
        // Wait for service worker to be ready
        const registration = await navigator.serviceWorker.ready;

        // Check if already subscribed
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          // Request notification permission
          const permission = await Notification.requestPermission();
          
          if (permission !== 'granted') {
            console.log('📵 [Notifications] Permission denied');
            return;
          }

          // Subscribe to push notifications
          const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BLXiYIECWZGIlbDkQKKPhl3t86tGQRQDAHnNq5JHMg9btdbjiVgt3rLDeGhz5LveRarHS-9vY84aFkQrfApmNpE';

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });

          console.log('✅ [Notifications] Subscribed to push notifications');
        }

        // Subscribe to 'updates' topic for deployment notifications
        const subJSON = subscription.toJSON();
        
        const response = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include cookies for authentication
          body: JSON.stringify({
            subscription: {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subJSON.keys?.p256dh || '',
                auth: subJSON.keys?.auth || '',
              }
            },
            topics: ['updates'],
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.warn('📵 [Notifications] Failed to subscribe to updates:', error);
          return;
        }

        console.log('📢 [Notifications] Subscribed to deployment updates');
      } catch (error) {
        console.error('❌ [Notifications] Subscription failed:', error);
      }
    };

    // Subscribe after a short delay to avoid blocking initial page load
    const timeoutId = setTimeout(subscribeToUpdates, 2000);

    return () => clearTimeout(timeoutId);
  }, []);
}

/**
 * Helper function to convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}
