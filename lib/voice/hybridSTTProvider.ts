/**
 * Hybrid STT Provider — Architecture Layer
 *
 * Separates on-device (live partials) from cloud (accuracy finalization)
 * so consumers get responsive UI feedback AND high-accuracy final text.
 *
 * Design:
 *   ┌──────────┐   partials    ┌──────────┐
 *   │ On-Device ├──────────────►│ Consumer │  (fast, free, offline-capable)
 *   │  (Expo)   │              │  (hook)  │
 *   └──────────┘              └────┬─────┘
 *                                   │ final audio blob
 *                              ┌────▼─────┐
 *                              │  Cloud    │  (accurate, quota-gated)
 *                              │ (Whisper) │
 *                              └──────────┘
 *
 * Modes:
 *  - 'on-device'   — Expo only (default, zero cost)
 *  - 'cloud-only'  — Whisper only (expensive, no partials)
 *  - 'hybrid'      — Expo partials + Whisper finalization
 *
 * Consumers keep using VoiceSession from unifiedProvider — this module
 * layers on top without changing external contracts.
 */

import type { VoiceProvider, VoiceSession, VoiceStartOptions } from './unifiedProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type STTMode = 'on-device' | 'cloud-only' | 'hybrid';

export interface HybridSTTConfig {
  /** Which STT pipeline to use. Default: 'on-device'. */
  mode: STTMode;
  /** Language code (e.g. 'en', 'af', 'zu'). */
  language?: string;
  /**
   * In hybrid mode, minimum transcript length (chars) before requesting
   * cloud finalization. Avoids burning quota on very short utterances.
   */
  cloudMinChars?: number;
  /**
   * In hybrid mode, callback fired when cloud finalization replaces
   * the on-device transcript.
   */
  onCloudFinalized?: (text: string) => void;
}

export interface HybridSTTResult {
  /** The on-device (fast) transcript. May be empty in cloud-only mode. */
  deviceTranscript: string;
  /** The cloud-finalized transcript. Null until cloud returns. */
  cloudTranscript: string | null;
  /** Best available transcript (cloud if available, else device). */
  bestTranscript: string;
  /** Which provider produced bestTranscript. */
  source: 'device' | 'cloud';
}

// ---------------------------------------------------------------------------
// Provider capability probe
// ---------------------------------------------------------------------------

/** Checks if a VoiceProvider is a real (non-noop) provider. */
export function isRealProvider(provider: VoiceProvider): boolean {
  return provider.id !== 'noop';
}

// ---------------------------------------------------------------------------
// Hybrid orchestrator
// ---------------------------------------------------------------------------

const DEFAULT_CLOUD_MIN_CHARS = 10;

/**
 * Creates a hybrid STT session that wraps an on-device VoiceSession
 * and optionally triggers cloud finalization.
 *
 * Usage:
 * ```ts
 * const hybrid = createHybridSession(deviceProvider, {
 *   mode: 'hybrid',
 *   language: 'en',
 *   onCloudFinalized: (text) => updateUI(text),
 * });
 * await hybrid.start({ onPartial, onFinal, onError });
 * // ... user speaks ...
 * await hybrid.stop();
 * const result = hybrid.getResult();
 * ```
 */
export function createHybridSession(
  deviceProvider: VoiceProvider,
  config: HybridSTTConfig,
): HybridVoiceSession {
  return new HybridVoiceSession(deviceProvider, config);
}

export class HybridVoiceSession {
  private deviceSession: VoiceSession | null = null;
  private deviceTranscript = '';
  private cloudTranscript: string | null = null;
  private config: HybridSTTConfig;
  private deviceProvider: VoiceProvider;
  private active = false;
  private cloudPending = false;

  constructor(deviceProvider: VoiceProvider, config: HybridSTTConfig) {
    this.deviceProvider = deviceProvider;
    this.config = {
      cloudMinChars: DEFAULT_CLOUD_MIN_CHARS,
      ...config,
    };
  }

  /** Start the hybrid session. In on-device/hybrid mode, starts device STT. */
  async start(opts: VoiceStartOptions): Promise<boolean> {
    this.active = true;
    this.deviceTranscript = '';
    this.cloudTranscript = null;

    if (this.config.mode === 'cloud-only') {
      // Cloud-only: no device STT, consumer must supply audio blob separately
      return true;
    }

    // on-device or hybrid: start the device provider
    this.deviceSession = this.deviceProvider.createSession();
    const started = await this.deviceSession.start({
      language: opts.language ?? this.config.language,
      onPartial: (text) => {
        this.deviceTranscript = text;
        opts.onPartial?.(text);
      },
      onFinal: (text) => {
        this.deviceTranscript = text;
        opts.onFinal?.(text);

        // In hybrid mode, trigger cloud finalization if transcript is long enough
        if (
          this.config.mode === 'hybrid' &&
          text.length >= (this.config.cloudMinChars ?? DEFAULT_CLOUD_MIN_CHARS)
        ) {
          this.requestCloudFinalization(text);
        }
      },
      onError: opts.onError,
    });

    if (!started) {
      this.active = false;
    }
    return started;
  }

  async stop(): Promise<void> {
    this.active = false;
    if (this.deviceSession) {
      await this.deviceSession.stop();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  isCloudPending(): boolean {
    return this.cloudPending;
  }

  getResult(): HybridSTTResult {
    const cloud = this.cloudTranscript;
    return {
      deviceTranscript: this.deviceTranscript,
      cloudTranscript: cloud,
      bestTranscript: cloud ?? this.deviceTranscript,
      source: cloud != null ? 'cloud' : 'device',
    };
  }

  /**
   * Submit audio for cloud-only transcription.
   * Used when mode is 'cloud-only' or for explicit re-transcription.
   *
   * @param audioUri - Supabase storage path or local URI
   * @param supabaseClient - Authenticated Supabase client for RPC call
   */
  async submitToCloud(
    audioUri: string,
    supabaseClient: { functions: { invoke: (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: unknown }> } },
  ): Promise<string | null> {
    this.cloudPending = true;
    try {
      const { data, error } = await supabaseClient.functions.invoke('transcribe-audio', {
        body: {
          audio_url: audioUri,
          language: this.config.language ?? 'en',
        },
      });
      if (error) {
        if (__DEV__) console.warn('[HybridSTT] Cloud transcription error:', error);
        return null;
      }
      const text = (data as { text?: string })?.text ?? '';
      this.cloudTranscript = text;
      this.config.onCloudFinalized?.(text);
      return text;
    } finally {
      this.cloudPending = false;
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /**
   * Placeholder for hybrid-mode cloud finalization.
   * In the current release this is a no-op — cloud finalization requires
   * audio blob capture which will be wired in a follow-up.
   * The architecture is ready: callers just need to call submitToCloud()
   * with the recorded audio after device STT completes.
   */
  private requestCloudFinalization(_deviceText: string): void {
    if (__DEV__) {
      console.log(
        '[HybridSTT] Cloud finalization eligible (len=%d). ' +
          'Wire submitToCloud() with audio blob to enable.',
        _deviceText.length,
      );
    }
  }
}
