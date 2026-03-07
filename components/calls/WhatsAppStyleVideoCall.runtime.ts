export const VIDEO_CALL_KEEP_AWAKE_TAG = 'active-video-call';

let inCallManager: any = null;
try {
  inCallManager = require('react-native-incall-manager').default;
} catch (error) {
  console.warn('[VideoCall] InCallManager not available:', error);
}
export const InCallManager = inCallManager;

let ringbackSound: any = null;
try {
  ringbackSound = require('@/assets/sounds/ringback.mp3');
  console.log('[VideoCall] ✅ Ringback sound loaded at module level');
} catch (error) {
  console.warn('[VideoCall] ❌ Failed to load ringback sound:', error);
  try {
    ringbackSound = require('@/assets/sounds/notification.wav');
    console.log('[VideoCall] ✅ Using notification.wav as ringback fallback');
  } catch (fallbackError) {
    console.error('[VideoCall] ❌ Fallback sound also failed:', fallbackError);
  }
}
export const RINGBACK_SOUND = ringbackSound;

let daily: any = null;
let dailyMediaView: any = null;
try {
  const dailyModule = require('@daily-co/react-native-daily-js');
  daily = dailyModule.default;
  dailyMediaView = dailyModule.DailyMediaView;
} catch (error) {
  console.warn('[VideoCall] Daily.co SDK not available:', error);
}
export const Daily = daily;
export const DailyMediaView = dailyMediaView;
