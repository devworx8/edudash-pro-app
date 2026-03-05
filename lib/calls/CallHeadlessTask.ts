/**
 * HeadlessJS Task for Background Call Handling
 * 
 * Handles incoming call notifications when the app is killed or backgrounded on Android.
 * This is required because Supabase Realtime subscriptions only work when the app is active.
 * 
 * Flow:
 * 1. FCM data message arrives with type: 'incoming_call'
 * 2. Android wakes up the app headlessly (no UI)
 * 3. This task runs and displays:
 *    a. High-priority notification with full-screen intent via Notifee
 *    b. Falls back to expo-notifications if Notifee unavailable
 * 4. User sees call UI and can answer/decline
 * 5. If answered, app opens and CallProvider handles the rest
 */

import { AppRegistry, Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { BadgeCoordinator } from '@/lib/BadgeCoordinator';

/**
 * Detect whether the native binary includes custom call sounds in res/raw/.
 * The withCallSounds config plugin was added in a specific native build.
 * OTA updates run on older native binaries that don't have res/raw/ringtone.mp3.
 * We check the native build version — if it's before the build that added the
 * plugin, fall back to 'default'. After the next native rebuild the custom sound
 * will be present and this will return true.
 *
 * Simple heuristic: The plugin was registered alongside withAndroid15BootFix.
 * If Constants.expoConfig exists (dev client / standalone) we optimistically
 * assume the native binary matches the JS. For Expo Go we always fall back.
 */
function hasCustomCallSounds(): boolean {
  try {
    // In Expo Go the plugin hasn't run so there's no res/raw/ringtone.mp3
    if (Constants.appOwnership === 'expo') return false;
    // Check if native build number is recent enough.
    // After the next `npx expo prebuild && eas build` the file will exist.
    // We use the runtimeVersion as a proxy — if it matches the JS bundle,
    // the native binary was built with the same app.json that includes
    // the withCallSounds plugin.
    const runtimeVersion = Constants.expoConfig?.runtimeVersion;
    const jsRuntimeVersion = Constants.manifest2?.runtimeVersion;
    if (runtimeVersion && jsRuntimeVersion && runtimeVersion === jsRuntimeVersion) {
      return true; // Native binary matches JS — plugin was included
    }
    // Fallback: if update is running on an older native binary, sound file
    // may not exist. Use 'default' to be safe.
    return false;
  } catch {
    return false;
  }
}

// Resolve once at module load
const CALL_SOUND_NOTIFEE = hasCustomCallSounds() ? 'ringtone' : 'default';
const CALL_SOUND_EXPO = hasCustomCallSounds() ? 'ringtone.mp3' : 'default';
const CALL_CHANNEL_ID = hasCustomCallSounds() ? 'incoming-calls-v2' : 'incoming-calls';

// Conditionally import Notifee for better notification control
let notifee: typeof import('@notifee/react-native').default | null = null;
let AndroidImportance: typeof import('@notifee/react-native').AndroidImportance | null = null;
let AndroidCategory: typeof import('@notifee/react-native').AndroidCategory | null = null;
let AndroidVisibility: typeof import('@notifee/react-native').AndroidVisibility | null = null;

try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  AndroidImportance = notifeeModule.AndroidImportance;
  AndroidCategory = notifeeModule.AndroidCategory;
  AndroidVisibility = notifeeModule.AndroidVisibility;
  console.log('[CallHeadlessTask] ✅ Notifee loaded for enhanced notifications');
} catch (error) {
  console.warn('[CallHeadlessTask] Notifee not available, will use expo-notifications:', error);
}

// CallKeep removed - broken with Expo SDK 54+ (duplicate method exports)
// See: https://github.com/react-native-webrtc/react-native-callkeep/issues/866-869
// Incoming calls now handled via push notifications + WhatsAppStyleIncomingCall UI

/**
 * Ensure the Notifee foreground service runner is registered.
 * CRITICAL for killed-app scenario: index.js may not have executed yet,
 * so the runner from registerCallForegroundService() isn't set up.
 * Without it, `asForegroundService: true` silently fails.
 */
let foregroundServiceRegistered = false;
function ensureNotifeeServiceRegistered(): void {
  if (foregroundServiceRegistered) return;
  if (Platform.OS !== 'android' || !notifee) return;
  try {
    notifee.registerForegroundService((notification) => {
      return new Promise(() => {
        console.log('[CallHeadlessTask] Foreground service runner started for:', notification.id);
      });
    });
    foregroundServiceRegistered = true;
    console.log('[CallHeadlessTask] ✅ Foreground service runner registered (headless)');
  } catch (error) {
    console.warn('[CallHeadlessTask] Failed to register foreground service:', error);
  }
}

// Conditionally import Firebase Messaging
let messaging: any = null;
try {
  messaging = require('@react-native-firebase/messaging').default;
} catch (error) {
  // Firebase messaging not available - will use Expo notifications fallback
  console.warn('[CallHeadlessTask] Firebase messaging not available');
}

// Ringtone vibration pattern (mimics phone call)
const RINGTONE_VIBRATION_PATTERN = [0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000];

export interface IncomingCallData {
  type: 'incoming_call';
  call_id: string;
  caller_id: string;
  caller_name: string;
  call_type: 'voice' | 'video';
  meeting_url?: string;
}

/**
 * Storage key for pending call data
 * Used to pass call info from headless task to the main app
 */
const PENDING_CALL_KEY = 'edudash_pending_call';

/**
 * Save pending call data for the main app to pick up
 */
async function savePendingCall(callData: IncomingCallData): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_CALL_KEY, JSON.stringify({
      ...callData,
      timestamp: Date.now(),
    }));
    console.log('[CallHeadlessTask] Saved pending call:', callData.call_id);
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to save pending call:', error);
  }
}

/**
 * Get and clear pending call data
 */
export async function getPendingCall(): Promise<IncomingCallData | null> {
  try {
    const data = await AsyncStorage.getItem(PENDING_CALL_KEY);
    if (!data) return null;
    
    const callData = JSON.parse(data);
    
    // Clear after reading (one-time use)
    await AsyncStorage.removeItem(PENDING_CALL_KEY);
    
    // Ignore stale calls (older than 90 seconds - allows for slow device wake)
    if (Date.now() - callData.timestamp > 90000) {
      console.log('[CallHeadlessTask] Ignoring stale pending call');
      return null;
    }
    
    return callData;
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to get pending call:', error);
    return null;
  }
}

/**
 * Setup CallKeep for headless operation
 * NOTE: CallKeep removed - broken with Expo SDK 54+
 * This function is kept as a stub for backward compatibility
 */
async function setupCallKeepHeadless(): Promise<boolean> {
  // CallKeep has been removed due to Expo SDK 54+ compatibility issues
  // Incoming calls are now handled via push notifications + WhatsAppStyleIncomingCall UI
  console.log('[CallHeadlessTask] CallKeep disabled - using notifications only');
  return false;
}

/**
 * Setup notification channel for incoming calls (Android)
 * Must be called before showing notifications
 */
async function setupIncomingCallChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  
  try {
    // Use custom ringtone when native build has res/raw/ringtone.mp3,
    // otherwise fall back to system default (safe for OTA on older binaries)
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Incoming Calls',
      description: 'Voice and video call notifications with ringtone',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: RINGTONE_VIBRATION_PATTERN,
      lightColor: '#00f5ff',
      sound: CALL_SOUND_EXPO,
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
    
    // Clean up old channel (if using new v2 channel)
    if (CALL_CHANNEL_ID === 'incoming-calls-v2') {
      try {
        await Notifications.deleteNotificationChannelAsync('incoming-calls');
      } catch (_) { /* ignore if channel doesn't exist */ }
    }
    
    // Setup notification category with answer/decline actions
    // These buttons appear when user expands the notification (swipes down)
    await Notifications.setNotificationCategoryAsync('incoming_call', [
      {
        identifier: 'ANSWER',
        buttonTitle: '✓ Answer',
        options: {
          opensAppToForeground: true,
          isAuthenticationRequired: false,
        },
      },
      {
        identifier: 'DECLINE',
        buttonTitle: '✕ Decline',
        options: {
          opensAppToForeground: false,
          isAuthenticationRequired: false,
          isDestructive: true,
        },
      },
    ]);
    
    console.log('[CallHeadlessTask] Incoming call notification channel created');
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to setup incoming call channel:', error);
  }
}

/**
 * Show high-priority notification for incoming call (fallback when CallKeep fails)
 * This notification:
 * - Shows on lock screen with full-screen intent
 * - Uses ringtone/vibration  
 * - Has Answer/Decline action buttons
 * - Bypasses Do Not Disturb
 * - STAYS VISIBLE until answered/declined (sticky)
 * 
 * USES NOTIFEE for better Android notification support:
 * - True sticky notifications
 * - Full-screen intent support
 * - Custom vibration patterns
 * - Lock screen visibility
 */
async function showIncomingCallNotification(callData: IncomingCallData): Promise<void> {
  try {
    const callTypeEmoji = callData.call_type === 'video' ? '📹' : '📞';
    const callTypeText = callData.call_type === 'video' ? 'Video Call' : 'Voice Call';
    const callerName = callData.caller_name || 'Someone';
    
    // Try Notifee first for better notification handling
    if (notifee && AndroidImportance) {
      console.log('[CallHeadlessTask] 📱 Using Notifee for incoming call notification');
      
      // Create/update incoming calls channel — uses custom ringtone if native
      // binary includes it, otherwise system default (OTA-safe)
      await notifee.createChannel({
        id: CALL_CHANNEL_ID,
        name: 'Incoming Calls',
        description: 'Voice and video call notifications with ringtone',
        importance: AndroidImportance.HIGH, // HIGH for heads-up + full-screen intent
        vibration: true,
        vibrationPattern: RINGTONE_VIBRATION_PATTERN,
        lights: true,
        lightColor: '#00f5ff',
        sound: CALL_SOUND_NOTIFEE,
        bypassDnd: true,
      });
      
      // Display notification with full-screen intent and sticky behavior
      await notifee.displayNotification({
        id: `incoming-call-${callData.call_id}`,
        title: `${callTypeEmoji} ${callerName}`,
        body: `Incoming ${callTypeText} • Tap to answer`,
        data: {
          type: 'incoming_call',
          call_id: callData.call_id,
          caller_id: callData.caller_id,
          caller_name: callData.caller_name,
          call_type: callData.call_type,
          meeting_url: callData.meeting_url || '',
        },
        android: {
          channelId: CALL_CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          // CRITICAL: These settings make notification persistent
          ongoing: true, // Cannot be swiped away
          autoCancel: false, // Don't dismiss when tapped
          // Run as foreground service so Android cannot kill it
          asForegroundService: true,
          // Auto-dismiss after 30s to avoid stale notifications
          timeoutAfter: 30000,
          // Full-screen intent shows on lock screen
          fullScreenAction: {
            id: 'default',
            launchActivity: 'default',
          },
          // Action buttons
          actions: [
            {
              title: '✓ Answer',
              pressAction: {
                id: 'answer',
                launchActivity: 'default',
              },
            },
            {
              title: '✕ Decline', 
              pressAction: {
                id: 'decline',
              },
            },
          ],
          // Visual settings
          smallIcon: 'ic_launcher',
          color: '#00f5ff',
          // Show on lock screen
          visibility: AndroidVisibility?.PUBLIC ?? 1,
          // Category for call-like behavior
          ...(AndroidCategory?.CALL && { category: AndroidCategory.CALL }),
          // Vibration
          vibrationPattern: RINGTONE_VIBRATION_PATTERN,
          // Lights
          lights: ['#00f5ff', 300, 600],
          // Sound — custom ringtone or system default (OTA-safe)
          sound: CALL_SOUND_NOTIFEE,
          // Press action - open app
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
        },
      });
      
      console.log('[CallHeadlessTask] ✅ Notifee incoming call notification displayed:', callData.call_id);
    } else {
      // Fallback to expo-notifications
      console.log('[CallHeadlessTask] 📱 Using expo-notifications for incoming call (fallback)');
      await setupIncomingCallChannel();
      
      await Notifications.scheduleNotificationAsync({
        identifier: `incoming-call-${callData.call_id}`,
        content: {
          title: `${callTypeEmoji} ${callerName}`,
          body: `Incoming ${callTypeText} • Tap to answer`,
          subtitle: 'Swipe down for Answer/Decline',
          categoryIdentifier: 'incoming_call',
          data: {
            type: 'incoming_call',
            call_id: callData.call_id,
            caller_id: callData.caller_id,
            caller_name: callData.caller_name,
            call_type: callData.call_type,
            meeting_url: callData.meeting_url,
            forceShow: true,
          },
          sound: CALL_SOUND_EXPO,
          ...(Platform.OS === 'android' && {
            channelId: CALL_CHANNEL_ID,
            priority: 'max',
            sticky: true,
            autoDismiss: false,
            color: '#00f5ff',
            badge: 1,
          }),
          ...(Platform.OS === 'ios' && {
            interruptionLevel: 'critical',
          }),
        },
        trigger: null,
      });
      
      console.log('[CallHeadlessTask] ✅ expo-notifications incoming call notification shown:', callData.call_id);
    }
    
    // Start continuous vibration to simulate ringtone (60 seconds - matches call timeout)
    if (Platform.OS === 'android') {
      Vibration.vibrate(RINGTONE_VIBRATION_PATTERN, true); // true = repeat
      
      // Stop vibration after 60 seconds if not answered (matches call timeout)
      setTimeout(() => {
        Vibration.cancel();
      }, 60000);
    }
    
    // Update badge count
    await BadgeCoordinator.setCategory('incomingCall', 1);
    
    console.log('[CallHeadlessTask] ✅ Incoming call notification shown:', callData.call_id);
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to show incoming call notification:', error);
  }
}

/**
 * Cancel incoming call notification
 */
export async function cancelIncomingCallNotification(callId: string): Promise<void> {
  try {
    // Cancel Notifee notification if available
    if (notifee) {
      try {
        await notifee.cancelNotification(`incoming-call-${callId}`);
        console.log('[CallHeadlessTask] Notifee notification cancelled:', callId);
      } catch (e) {
        console.warn('[CallHeadlessTask] Failed to cancel Notifee notification:', e);
      }
    }
    
    // Also cancel expo-notifications (in case it was used as fallback)
    await Notifications.cancelScheduledNotificationAsync(`incoming-call-${callId}`);
    await Notifications.dismissNotificationAsync(`incoming-call-${callId}`);
    
    Vibration.cancel();
    console.log('[CallHeadlessTask] Incoming call notification cancelled:', callId);
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to cancel incoming call notification:', error);
  }
}

/**
 * HeadlessJS task handler for incoming calls
 * This runs when the app is killed and receives a high-priority FCM data message
 */
async function CallHeadlessTask(remoteMessage: any): Promise<void> {
  console.log('[CallHeadlessTask] Received message:', JSON.stringify(remoteMessage));
  
  const data = remoteMessage?.data;
  
  if (!data || data.type !== 'incoming_call') {
    console.log('[CallHeadlessTask] Not an incoming call message, ignoring');
    return;
  }
  
  const callData: IncomingCallData = {
    type: 'incoming_call',
    call_id: data.call_id,
    caller_id: data.caller_id,
    caller_name: data.caller_name || 'Unknown',
    call_type: data.call_type || 'voice',
    meeting_url: data.meeting_url,
  };
  
  console.log('[CallHeadlessTask] Processing incoming call:', {
    callId: callData.call_id,
    callerName: callData.caller_name,
    callType: callData.call_type,
  });
  
  // CRITICAL: Register the Notifee foreground service runner BEFORE showing
  // the notification. When the app is killed, index.js may not have run yet,
  // so the runner isn't registered. Without it, asForegroundService: true
  // in the notification silently fails and Android can kill the task.
  ensureNotifeeServiceRegistered();
  
  // Save call data for when the app opens
  await savePendingCall(callData);
  
  // Show notification - this is the primary way to handle incoming calls now
  await showIncomingCallNotification(callData);
  
  console.log('[CallHeadlessTask] Call notification shown');
}

/**
 * Register HeadlessJS task for Android background call handling
 * Must be called in index.js before expo-router/entry
 */
export function registerCallHeadlessTask(): void {
  if (Platform.OS !== 'android') {
    console.log('[CallHeadlessTask] Skipping registration on non-Android platform');
    return;
  }
  
  // Register the HeadlessJS task with React Native
  // This allows Android to wake the app in headless mode when FCM message arrives
  AppRegistry.registerHeadlessTask('CallHeadlessTask', () => CallHeadlessTask);
  console.log('[CallHeadlessTask] HeadlessJS task registered');
  
  // Register FCM background message handler if available
  // This is the PRIMARY mechanism for wake-on-call functionality
  if (messaging) {
    messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('[CallHeadlessTask] 📱 FCM background message received:', JSON.stringify(remoteMessage));
      
      if (remoteMessage?.data?.type === 'incoming_call') {
        console.log('[CallHeadlessTask] 📞 Processing incoming call in background');
        await CallHeadlessTask(remoteMessage);
      }
    });
    console.log('[CallHeadlessTask] ✅ FCM background handler registered - wake-on-call enabled');
  } else {
    console.warn('[CallHeadlessTask] ⚠️ FCM not available - wake-on-call will NOT work when app is killed');
  }
}

/**
 * Get the FCM token for this device
 * This token must be sent to your server to send push notifications for incoming calls
 * 
 * @returns The FCM token or null if unavailable
 */
export async function getFCMToken(): Promise<string | null> {
  if (!messaging) {
    console.warn('[CallHeadlessTask] Firebase messaging not available');
    return null;
  }
  
  try {
    // Check if we have permission
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    
    if (!enabled) {
      console.warn('[CallHeadlessTask] Push notification permission denied');
      return null;
    }
    
    // Get the FCM token
    const token = await messaging().getToken();
    console.log('[CallHeadlessTask] FCM token obtained:', token?.substring(0, 20) + '...');
    return token;
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to get FCM token:', error);
    return null;
  }
}

/**
 * Subscribe to FCM token refresh events
 * When the token changes, you must update it on your server
 * 
 * @param onTokenRefresh Callback with the new token
 * @returns Unsubscribe function
 */
export function onFCMTokenRefresh(onTokenRefresh: (token: string) => void): (() => void) | null {
  if (!messaging) {
    return null;
  }
  
  return messaging().onTokenRefresh((token: string) => {
    console.log('[CallHeadlessTask] FCM token refreshed:', token?.substring(0, 20) + '...');
    onTokenRefresh(token);
  });
}

/**
 * Handle foreground FCM messages for calls
 * Call this from CallProvider or App.tsx
 */
export function setupForegroundCallHandler(
  onIncomingCall: (callData: IncomingCallData) => void
): (() => void) | null {
  if (!messaging) {
    console.warn('[CallHeadlessTask] Firebase messaging not available for foreground handler');
    return null;
  }
  
  const unsubscribe = messaging().onMessage(async (remoteMessage: any) => {
    console.log('[CallHeadlessTask] FCM foreground message:', JSON.stringify(remoteMessage));
    
    if (remoteMessage?.data?.type === 'incoming_call') {
      const callData: IncomingCallData = {
        type: 'incoming_call',
        call_id: remoteMessage.data.call_id,
        caller_id: remoteMessage.data.caller_id,
        caller_name: remoteMessage.data.caller_name || 'Unknown',
        call_type: remoteMessage.data.call_type || 'voice',
        meeting_url: remoteMessage.data.meeting_url,
      };
      
      onIncomingCall(callData);
    }
  });
  
  console.log('[CallHeadlessTask] Foreground call handler registered');
  return unsubscribe;
}
