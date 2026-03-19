/**
 * VoicePrivacyMode — Controls data retention for voice interactions.
 *
 * When enabled:
 *  - Audio recordings are not persisted after transcription
 *  - Conversation history is session-only (not saved to DB)
 *  - Non-essential telemetry events are suppressed
 *  - Quota / session tracking still functions (operationally required)
 *
 * Controlled by:
 *  - User toggle (stored in AsyncStorage per-user)
 *  - Environment flag EXPO_PUBLIC_VOICE_PRIVACY_DEFAULT
 *
 * @module lib/voice/privacyMode
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'voice_privacy_mode_';

export interface VoicePrivacyState {
  /** Whether privacy mode is currently active. */
  enabled: boolean;
  /** Whether conversation history should be persisted. */
  persistHistory: boolean;
  /** Whether audio should be retained after transcription. */
  retainAudio: boolean;
  /** Whether non-essential telemetry is allowed. */
  allowTelemetry: boolean;
}

/** Derive privacy state from the enabled flag. */
function deriveState(enabled: boolean): VoicePrivacyState {
  return {
    enabled,
    persistHistory: !enabled,
    retainAudio: !enabled,
    allowTelemetry: !enabled,
  };
}

const defaultEnabled =
  typeof process !== 'undefined' &&
  process.env?.EXPO_PUBLIC_VOICE_PRIVACY_DEFAULT === 'true';

/** Load privacy mode preference for a user. */
export async function loadPrivacyMode(userId: string): Promise<VoicePrivacyState> {
  try {
    const stored = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (stored === 'true') return deriveState(true);
    if (stored === 'false') return deriveState(false);
  } catch {
    // Fall through to default
  }
  return deriveState(defaultEnabled);
}

/** Save privacy mode preference for a user. */
export async function savePrivacyMode(userId: string, enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, String(enabled));
  } catch {
    // Non-fatal — preference won't persist across sessions
  }
}

/**
 * Guard for telemetry / analytics calls.
 * Returns true if the event should be suppressed.
 */
export function shouldSuppressTelemetry(
  privacy: VoicePrivacyState,
  eventCategory: 'essential' | 'analytics' | 'diagnostic',
): boolean {
  if (!privacy.enabled) return false;
  // Always allow essential events (quota, errors, session)
  if (eventCategory === 'essential') return false;
  // Suppress analytics and diagnostics in privacy mode
  return true;
}

/**
 * Guard for conversation persistence.
 * Returns true if history should NOT be saved.
 */
export function shouldSkipHistoryPersistence(privacy: VoicePrivacyState): boolean {
  return privacy.enabled && !privacy.persistHistory;
}
