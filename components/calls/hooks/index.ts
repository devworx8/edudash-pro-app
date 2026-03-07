/**
 * Voice Call Hooks
 * 
 * Modular hooks for voice call functionality.
 */

export { useVoiceCallState } from './useVoiceCallState';
export type { VoiceCallStateOptions, VoiceCallStateReturn } from './useVoiceCallState';

export { useVoiceCallAudio } from './useVoiceCallAudio';
export type { VoiceCallAudioOptions, VoiceCallAudioReturn } from './useVoiceCallAudio';

export { useVoiceCallDaily } from './useVoiceCallDaily';
export type { VoiceCallDailyOptions, VoiceCallDailyReturn } from './useVoiceCallDaily';

export { useVoiceCallTimeout } from './useVoiceCallTimeout';
export type { VoiceCallTimeoutOptions } from './useVoiceCallTimeout';

export { useCallBackgroundHandler, CALL_NOTIFICATION_EVENTS, setupForegroundEventListener } from './useCallBackgroundHandler';
export type { CallBackgroundHandlerOptions, CallBackgroundHandlerReturn } from './useCallBackgroundHandler';
export { useWhatsAppVideoCallControls } from './useWhatsAppVideoCallControls';
export { useWhatsAppVideoCallAudioEffects } from './useWhatsAppVideoCallAudioEffects';
