'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  isPushSupported, 
  getPushSubscriptionStatus, 
  subscribeToPush 
} from '@/lib/services/pushNotificationService';

interface UsePushNotificationsOptions {
  autoSubscribe?: boolean;
}

interface PushNotificationState {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to manage push notification subscription
 * Automatically subscribes when permission is granted
 */
export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const { autoSubscribe = true } = options;
  const [state, setState] = useState<PushNotificationState>({
    supported: false,
    permission: 'unsupported',
    subscribed: false,
    loading: true,
    error: null,
  });
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  // Check initial state
  useEffect(() => {
    const init = async () => {
      // Get user ID
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserId(session.user.id);
      }

      // Check push status
      const status = await getPushSubscriptionStatus();
      setState(prev => ({
        ...prev,
        supported: status.supported,
        permission: status.permission,
        subscribed: status.subscribed,
        loading: false,
      }));

      // Auto-subscribe if permission already granted but not subscribed
      if (autoSubscribe && status.supported && status.permission === 'granted' && !status.subscribed && session) {
        const result = await subscribeToPush(session.user.id);
        if (result.success) {
          setState(prev => ({ ...prev, subscribed: true }));
        }
      }
    };

    init();
  }, [supabase, autoSubscribe]);

  // Subscribe function
  const subscribe = async () => {
    if (!userId) {
      setState(prev => ({ ...prev, error: 'Not logged in' }));
      return false;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const result = await subscribeToPush(userId);
    
    setState(prev => ({
      ...prev,
      subscribed: result.success,
      permission: result.success ? 'granted' : prev.permission,
      loading: false,
      error: result.error || null,
    }));

    return result.success;
  };

  // Request permission (without subscribing)
  const requestPermission = async (): Promise<NotificationPermission> => {
    if (!isPushSupported()) return 'denied';
    
    const perm = await Notification.requestPermission();
    setState(prev => ({ ...prev, permission: perm }));
    return perm;
  };

  return {
    ...state,
    subscribe,
    requestPermission,
  };
}
