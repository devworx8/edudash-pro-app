/**
 * Push Notification Setup for Incoming Calls
 * 
 * Gets Expo Push Token and saves to user's profile for incoming call notifications
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFCMToken, onFCMTokenRefresh } from './CallHeadlessTask';
import { upsertPushDeviceViaRPC } from '@/lib/notifications';
import { reactivateUserTokens } from '@/lib/pushTokenUtils';

// Resolve project ID from active EAS runtime config first.
// Avoid hardcoded legacy project fallback to prevent cross-project token drift.
const EXPO_PROJECT_ID =
  Constants.easConfig?.projectId ||
  Constants.expoConfig?.extra?.eas?.projectId ||
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  null;

// Storage key for stable device ID
const DEVICE_ID_STORAGE_KEY = '@edudash_device_id';

/**
 * Get or create a stable device ID that persists across app restarts
 */
async function getStableDeviceId(): Promise<string> {
  try {
    // First try to get from storage
    const storedId = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (storedId) {
      return storedId;
    }
    
    // Generate a new stable ID
    const baseId = Constants.deviceId || Constants.sessionId || `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const deviceId = `device_${baseId}`;
    
    // Store for future use
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    console.log('[PushNotifications] Generated new device ID:', deviceId);
    
    return deviceId;
  } catch (error) {
    // Fallback if storage fails
    console.warn('[PushNotifications] Failed to get/store device ID:', error);
    return `device_${Platform.OS}-${Date.now()}`;
  }
}

/**
 * Get Expo Push Token for this device
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (!EXPO_PROJECT_ID) {
      console.warn('[PushNotifications] Missing Expo project ID; skipping push token registration');
      return null;
    }

    // Check permissions first
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.warn('[PushNotifications] Permission denied');
      return null;
    }

    // Get Expo Push Token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    console.log('[PushNotifications] ✅ Got Expo Push Token:', tokenData.data);
    return tokenData.data;
  } catch (error) {
    console.error('[PushNotifications] Failed to get push token:', error);
    return null;
  }
}

/**
 * Save push token to user's profile AND push_devices table in Supabase
 * This ensures tokens are available for both incoming calls (profiles) and
 * general notifications (push_devices)
 */
export async function savePushTokenToProfile(userId: string): Promise<boolean> {
  try {
    const token = await getExpoPushToken();
    if (!token) {
      console.warn('[PushNotifications] No token to save');
      return false;
    }

    const supabase = assertSupabase();

    // Guard for sign-out races: skip quietly if session is gone or belongs to another user.
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const sessionUserId = sessionData?.session?.user?.id;
      if (sessionError || !sessionUserId || sessionUserId !== userId) {
        console.log('[PushNotifications] Skipping push save: no active session for user');
        return false;
      }
    } catch {
      console.log('[PushNotifications] Skipping push save: session check failed');
      return false;
    }
    
    // Save to BOTH profiles (for call notifications) and push_devices (for general notifications)
    // This ensures compatibility with all Edge Functions that send push notifications
    
    // 1. Update user's profile with push token
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        expo_push_token: token,
        push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[PushNotifications] Failed to save token to profile:', profileError);
      // Continue to try push_devices anyway
    } else {
      console.log('[PushNotifications] ✅ Push token saved to profiles');
    }
    
    // 2. Also save to push_devices table for general notifications
    // This uses upsert with device_id to handle multiple devices per user
    const Device = (await import('expo-device')).default;
    
    // Get a stable device ID that persists across app restarts
    const deviceId = await getStableDeviceId();

    // Get FCM token for data-only push (enables background ringing)
    let fcmToken: string | null = null;
    try {
      fcmToken = await getFCMToken();
    } catch (e) {
      console.warn('[PushNotifications] FCM token retrieval failed:', e);
    }
    
    const rpcResult = await upsertPushDeviceViaRPC(supabase, {
      expoPushToken: token,
      fcmToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      deviceId,
      deviceInstallationId: deviceId,
      deviceMetadata: {
        brand: Device?.brand,
        model: Device?.modelName,
        osVersion: Device?.osVersion,
        appVersion: Constants.expoConfig?.version,
        expo_project_id: EXPO_PROJECT_ID,
        updated_for_calls: true,
      },
    });

    if (rpcResult.usedFallback) {
      console.log('[PushNotifications] Using legacy push_devices fallback path (upsert_push_device RPC not yet deployed)');
    }

    if (!rpcResult.success) {
      console.error('[PushNotifications] Failed to save token to push_devices:', rpcResult.error);
    } else {
      console.log('[PushNotifications] ✅ Push token saved to push_devices');
      try {
        // Ensure this device only has the current account active for push delivery.
        await reactivateUserTokens(userId);
      } catch (activationError) {
        console.warn('[PushNotifications] Token activation normalization failed:', activationError);
      }
    }

    // Incoming calls and dispatcher rely on push_devices; mark ready only if that registration succeeded.
    return rpcResult.success;
  } catch (error) {
    console.error('[PushNotifications] Save token error:', error);
    return false;
  }
}

/**
 * Setup push notifications for incoming calls
 * Call this when user logs in
 */
export async function setupIncomingCallNotifications(userId: string): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[PushNotifications] Skipping on web');
    return;
  }

  console.log('[PushNotifications] Setting up incoming call notifications...');
  
  // Save push token to profile
  const saved = await savePushTokenToProfile(userId);
  
  if (saved) {
    console.log('[PushNotifications] ✅ Ready to receive incoming calls');
  } else {
    console.warn('[PushNotifications] ⚠️ Push notifications may not work');
  }

  // Keep FCM token fresh while session is active.
  const unsubscribe = onFCMTokenRefresh(async () => {
    try {
      await savePushTokenToProfile(userId);
    } catch (error) {
      console.warn('[PushNotifications] Failed to persist refreshed FCM token:', error);
    }
  });

  if (unsubscribe) {
    console.log('[PushNotifications] ✅ FCM token refresh listener attached');
  }
}
