import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { TTSOptions } from '@/components/super-admin/voice-orb/useVoiceTTS';
export type { TTSOptions } from '@/components/super-admin/voice-orb/useVoiceTTS';

export interface VoiceOrbRef {
  /** Speak text using TTS */
  speakText: (text: string, language?: SupportedLanguage, options?: TTSOptions) => Promise<void>;
  /** Stop TTS playback */
  stopSpeaking: () => Promise<void>;
  /** Toggle barge-in protection while Dash is speaking */
  setMuted: (muted: boolean) => Promise<void>;
  /** Start a new listening session if idle */
  startListening: () => Promise<void>;
  /** Stop any active listening/recording session */
  stopListening: () => Promise<void>;
  /** Execute the primary orb action (start or stop/transcribe) */
  toggleListening: () => Promise<void>;
  /** Get current speaking state */
  isSpeaking: boolean;
  /** Get current barge-in protection state */
  isMuted: boolean;
}

export interface VoiceTranscriptMeta {
  source: 'live' | 'recorded';
  capturedAt: number;
  audioBase64?: string;
  audioContentType?: string;
}

export interface VoiceOrbProps {
  isListening: boolean;
  isSpeaking: boolean;
  /** Whether the parent screen is processing (waiting for AI response). Used for auto-restart. */
  isParentProcessing?: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  /** Live partial transcript updates (best-effort) from on-device STT. */
  onPartialTranscript?: (text: string, language?: SupportedLanguage) => void;
  onTranscript: (text: string, language?: SupportedLanguage, meta?: VoiceTranscriptMeta) => void;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  /** Called when TTS starts */
  onTTSStart?: () => void;
  /** Called when TTS ends */
  onTTSEnd?: () => void;
  /** Called when voice capture/transcription fails */
  onVoiceError?: (message: string) => void;
  /** Called when barge-in protection / listening mute state changes */
  onMuteChange?: (muted: boolean) => void;
  /** Called when user changes language */
  onLanguageChange?: (lang: SupportedLanguage) => void;
  /** Externally set language (from parent language dropdown) */
  language?: SupportedLanguage;
  /** Optional orb size override for compact layouts */
  size?: number;
  /** Auto-start listening when component mounts (default: true) */
  autoStartListening?: boolean;
  /** Auto-restart listening after TTS ends (default: true) */
  autoRestartAfterTTS?: boolean;
  /** Block auto-restart while parent screen is navigating/interrupted */
  restartBlocked?: boolean;
  /** Preschool mode: longer silence timeout, lower speech threshold for children */
  preschoolMode?: boolean;
  /** Show the live transcription bubble while listening (default: true). */
  showLiveTranscript?: boolean;
}
