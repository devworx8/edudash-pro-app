import { AppRegistry, Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { BadgeCoordinator } from '@/lib/BadgeCoordinator';
function hasCustomCallSounds(): boolean {
  try {
    if (Constants.appOwnership === 'expo') return false;
    const runtimeVersion = Constants.expoConfig?.runtimeVersion;
    const jsRuntimeVersion = Constants.manifest2?.runtimeVersion;
    if (runtimeVersion && jsRuntimeVersion && runtimeVersion === jsRuntimeVersion) {
      return true; // Native binary matches JS — plugin was included
    }
    return false;
  } catch {
    return false;
  }
}
const CALL_SOUND_NOTIFEE = hasCustomCallSounds() ? 'ringtone' : 'default';
const CALL_SOUND_EXPO = hasCustomCallSounds() ? 'ringtone.mp3' : 'default';
const CALL_CHANNEL_ID = hasCustomCallSounds() ? 'incoming-calls-v2' : 'incoming-calls';
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
let messaging: any = null;
try {
  messaging = require('@react-native-firebase/messaging').default;
} catch (error) {
  console.warn('[CallHeadlessTask] Firebase messaging not available');
}
const RINGTONE_VIBRATION_PATTERN = [0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000];
export interface IncomingCallData {
  type: 'incoming_call';
  call_id: string;
  callee_id?: string;
  caller_id: string;
  caller_name: string;
  call_type: 'voice' | 'video';
  meeting_url?: string;
}
const PENDING_CALL_KEY = 'edudash_pending_call';
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
export async function getPendingCall(): Promise<IncomingCallData | null> {
  try {
    const data = await AsyncStorage.getItem(PENDING_CALL_KEY);
    if (!data) return null;
    const callData = JSON.parse(data);
    await AsyncStorage.removeItem(PENDING_CALL_KEY);
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
async function setupCallKeepHeadless(): Promise<boolean> {
  console.log('[CallHeadlessTask] CallKeep disabled - using notifications only');
  return false;
}
async function setupIncomingCallChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
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
    if (CALL_CHANNEL_ID === 'incoming-calls-v2') {
      try {
        await Notifications.deleteNotificationChannelAsync('incoming-calls');
      } catch (_) { /* ignore if channel doesn't exist */ }
    }
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
async function showIncomingCallNotification(callData: IncomingCallData): Promise<void> {
  try {
    const callTypeEmoji = callData.call_type === 'video' ? '📹' : '📞';
    const callTypeText = callData.call_type === 'video' ? 'Video Call' : 'Voice Call';
    const callerName = callData.caller_name || 'Someone';
    if (notifee && AndroidImportance) {
      console.log('[CallHeadlessTask] 📱 Using Notifee for incoming call notification');
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
      await notifee.displayNotification({
        id: `incoming-call-${callData.call_id}`,
        title: `${callTypeEmoji} ${callerName}`,
        body: `Incoming ${callTypeText} • Tap to answer`,
        data: {
          type: 'incoming_call',
          call_id: callData.call_id,
          callee_id: callData.callee_id || '',
          caller_id: callData.caller_id,
          caller_name: callData.caller_name,
          call_type: callData.call_type,
          meeting_url: callData.meeting_url || '',
        },
        android: {
          channelId: CALL_CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          ongoing: true, // Cannot be swiped away
          autoCancel: false, // Don't dismiss when tapped
          asForegroundService: true,
          timeoutAfter: 30000,
          fullScreenAction: {
            id: 'default',
            launchActivity: 'default',
          },
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
          smallIcon: 'ic_launcher',
          color: '#00f5ff',
          visibility: AndroidVisibility?.PUBLIC ?? 1,
          ...(AndroidCategory?.CALL && { category: AndroidCategory.CALL }),
          vibrationPattern: RINGTONE_VIBRATION_PATTERN,
          lights: ['#00f5ff', 300, 600],
          sound: CALL_SOUND_NOTIFEE,
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
        },
      });
      console.log('[CallHeadlessTask] ✅ Notifee incoming call notification displayed:', callData.call_id);
    } else {
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
            callee_id: callData.callee_id || '',
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
    if (Platform.OS === 'android') {
      Vibration.vibrate(RINGTONE_VIBRATION_PATTERN, true); // true = repeat
      setTimeout(() => {
        Vibration.cancel();
      }, 60000);
    }
    await BadgeCoordinator.setCategory('incomingCall', 1);
    console.log('[CallHeadlessTask] ✅ Incoming call notification shown:', callData.call_id);
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to show incoming call notification:', error);
  }
}
export async function cancelIncomingCallNotification(callId: string): Promise<void> {
  try {
    if (notifee) {
      try {
        await notifee.cancelNotification(`incoming-call-${callId}`);
        console.log('[CallHeadlessTask] Notifee notification cancelled:', callId);
      } catch (e) {
        console.warn('[CallHeadlessTask] Failed to cancel Notifee notification:', e);
      }
    }
    await Notifications.cancelScheduledNotificationAsync(`incoming-call-${callId}`);
    await Notifications.dismissNotificationAsync(`incoming-call-${callId}`);
    Vibration.cancel();
    console.log('[CallHeadlessTask] Incoming call notification cancelled:', callId);
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to cancel incoming call notification:', error);
  }
}
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
    callee_id: data.callee_id || undefined,
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
  ensureNotifeeServiceRegistered();
  await savePendingCall(callData);
  await showIncomingCallNotification(callData);
  console.log('[CallHeadlessTask] Call notification shown');
}
export function registerCallHeadlessTask(): void {
  if (Platform.OS !== 'android') {
    console.log('[CallHeadlessTask] Skipping registration on non-Android platform');
    return;
  }
  AppRegistry.registerHeadlessTask('CallHeadlessTask', () => CallHeadlessTask);
  console.log('[CallHeadlessTask] HeadlessJS task registered');
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
export async function getFCMToken(): Promise<string | null> {
  if (!messaging) {
    console.warn('[CallHeadlessTask] Firebase messaging not available');
    return null;
  }
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) {
      console.warn('[CallHeadlessTask] Push notification permission denied');
      return null;
    }
    const token = await messaging().getToken();
    console.log('[CallHeadlessTask] FCM token obtained:', token?.substring(0, 20) + '...');
    return token;
  } catch (error) {
    console.error('[CallHeadlessTask] Failed to get FCM token:', error);
    return null;
  }
}
export function onFCMTokenRefresh(onTokenRefresh: (token: string) => void): (() => void) | null {
  if (!messaging) {
    return null;
  }
  return messaging().onTokenRefresh((token: string) => {
    console.log('[CallHeadlessTask] FCM token refreshed:', token?.substring(0, 20) + '...');
    onTokenRefresh(token);
  });
}
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
        callee_id: remoteMessage.data.callee_id || undefined,
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
