/**
 * Unified Voice Provider Abstraction
 *
 * Entry point for all STT in the app. Consumers call:
 *   getSingleUseVoiceProvider(lang)  — mic button, chat input
 *   getStreamingVoiceProvider(lang)  — kept for API compat (delegates to single-use)
 *
 * Platform routing:
 *   MOBILE → expo-speech-recognition (on-device, zero cost)
 *   WEB    → Deepgram + Claude
 *   FALLBACK → NoopProvider (text-input only)
 *
 * For hybrid (on-device partials + cloud finalization) see
 * lib/voice/hybridSTTProvider.ts — it wraps a VoiceProvider from here.
 */

import { createClaudeVoiceSession, type ClaudeVoiceSession } from '@/lib/voice/claudeProvider';
import { expoSpeech } from '@/lib/voice/expoProvider';
import { Platform } from 'react-native';

export type VoicePartialCb = (text: string) => void;
export type VoiceFinalCb = (text: string) => void;

export interface VoiceStartOptions {
  language?: string; // 'en' | 'af' | 'zu' | 'xh' | 'nso'
  onPartial?: VoicePartialCb;
  onFinal?: VoiceFinalCb;
  onError?: (error: string) => void;
}

export interface VoiceSession {
  start(opts: VoiceStartOptions): Promise<boolean>;
  stop(): Promise<void>;
  isActive(): boolean;
  isConnected(): boolean;  // Check if WebSocket/connection is ready
  setMuted(muted: boolean): void;
  updateConfig(cfg: { language?: string }): void;
}

export interface VoiceProvider {
  id: 'expo' | 'claude' | 'azure' | 'noop';
  isAvailable(): Promise<boolean>;
  createSession(): VoiceSession;
}

/**
 * Noop session - graceful fallback when no provider is available
 */
class NoopSession implements VoiceSession {
  async start() {
    if (__DEV__) console.warn('[UnifiedProvider] NoopSession: No voice provider available');
    return false;
  }
  async stop() {}
  isActive() { return false; }
  isConnected() { return false; }
  setMuted() {}
  updateConfig() {}
}

/**
 * Get voice provider for SINGLE-USE input (mic button in chat)
 *
 * MOBILE: Expo Speech Recognition
 * WEB: Deepgram + Claude
 */
export async function getSingleUseVoiceProvider(language?: string): Promise<VoiceProvider> {
  if (__DEV__) {
    console.log('[UnifiedProvider] Getting SINGLE-USE provider:', { language, platform: Platform.OS });
  }

  if (Platform.OS !== 'web') {
    return getMobileProvider(language);
  }
  return getWebProvider(language);
}

/**
 * Get voice provider for STREAMING conversational mode (Interactive Orb)
 *
 * Currently returns the same provider as single-use.
 * Kept for API compatibility — callers importing this continue to work.
 */
export async function getStreamingVoiceProvider(language?: string): Promise<VoiceProvider> {
  if (__DEV__) {
    console.log('[UnifiedProvider] Getting STREAMING provider:', { language, platform: Platform.OS });
  }

  if (Platform.OS !== 'web') {
    return getMobileProvider(language);
  }
  return getWebProvider(language, 'You are Dash, a helpful AI assistant for EduDash Pro. Keep responses concise and friendly for voice conversations (2-3 sentences max).');
}

/**
 * @deprecated Use getSingleUseVoiceProvider() or getStreamingVoiceProvider() instead
 */
export async function getDefaultVoiceProvider(language?: string): Promise<VoiceProvider> {
  return getSingleUseVoiceProvider(language);
}

// ---------------------------------------------------------------------------
// Internal helpers (deduplicated mobile / web paths)
// ---------------------------------------------------------------------------

const NOOP_PROVIDER: VoiceProvider = {
  id: 'noop',
  async isAvailable() { return false; },
  createSession() { return new NoopSession(); },
};

async function getMobileProvider(_language?: string): Promise<VoiceProvider> {
  try {
    const available = await expoSpeech.isAvailable();
    if (available) {
      if (__DEV__) console.log('[UnifiedProvider] ✅ Using Expo Speech Recognition');
      return expoSpeech;
    }
    if (__DEV__) console.warn('[UnifiedProvider] ⚠️ Expo Speech Recognition not available');
  } catch (e) {
    if (__DEV__) console.error('[UnifiedProvider] Expo Speech error:', e);
  }
  return NOOP_PROVIDER;
}

function getWebProvider(_language?: string, systemPrompt = ''): VoiceProvider {
  try {
    if (__DEV__) console.log('[UnifiedProvider] ✅ Using Deepgram (web)');
    return {
      id: 'claude',
      async isAvailable() { return true; },
      createSession() {
        const sess: ClaudeVoiceSession = createClaudeVoiceSession();
        return {
          async start(opts: VoiceStartOptions) {
            return await sess.start({
              language: opts.language,
              onPartialTranscript: opts.onPartial,
              onFinalTranscript: opts.onFinal,
              systemPrompt,
            });
          },
          async stop() { await sess.stop(); },
          isActive() { return sess.isActive(); },
          isConnected() { return sess.isConnected(); },
          setMuted(m) { sess.setMuted(m); },
          updateConfig(cfg) { sess.updateTranscriptionConfig({ language: cfg.language }); },
        };
      },
    };
  } catch (e) {
    if (__DEV__) console.error('[UnifiedProvider] Web provider failed:', e);
    return NOOP_PROVIDER;
  }
}
