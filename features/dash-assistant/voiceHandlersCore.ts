import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { router } from 'expo-router';
import { AudioModule } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import type { DashMessage } from '@/services/dash-ai/types';
import type { VoiceProvider, VoiceSession } from '@/lib/voice/unifiedProvider';
import { getSingleUseVoiceProvider } from '@/lib/voice/unifiedProvider';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import type { VoiceProbeMetrics } from '@/lib/voice/benchmark/types';
import { track } from '@/lib/analytics';
import {
  cleanForTTS,
  splitForTTSWithFastStart,
  TTS_CHUNK_MAX_LEN,
  TTS_FAST_START_FIRST_CHUNK_MAX_LEN,
  getStreamingPlaceholder,
} from '@/lib/dash-voice-utils';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { evaluateDashSpeechContent } from './speechContentPolicy';

type VoiceRefs = {
  voiceSessionRef: React.MutableRefObject<VoiceSession | null>;
  voiceProviderRef: React.MutableRefObject<VoiceProvider | null>;
  voiceInputStartAtRef: React.MutableRefObject<number | null>;
  lastSpeakStartRef: React.MutableRefObject<number | null>;
  ttsSessionIdRef?: React.MutableRefObject<string | null>;
  sttFinalizeTimerRef?: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  sttTranscriptBufferRef?: React.MutableRefObject<string>;
};

const DEFAULT_DASH_VOICE_LOCALE = 'en-ZA';
const TTS_CHUNK_TIMEOUT_MIN_MS = 45_000;
const TTS_CHUNK_TIMEOUT_MAX_MS = 210_000;
const TTS_CHUNK_TIMEOUT_PER_CHAR_MS = 85;
const RAW_URL_REGEX = /https?:\/\/[^\s)]+/gi;
const STT_FINALIZE_MIN_MS = 650;
const STT_FINALIZE_MAX_MS = 5000;
const STT_FINALIZE_DEFAULT_MS = 900;
const STT_FINALIZE_DEFAULT_PRESCHOOL_MS = 1300;
const STT_FINAL_COMMIT_MIN_MS = 180;
const STT_FINAL_COMMIT_MAX_MS = 520;

export type SpeechChunkProgress = {
  messageId: string;
  chunkIndex: number;
  chunkCount: number;
  isPlaying: boolean;
  isComplete: boolean;
};

function resolveChunkTimeoutMs(chunk: string): number {
  const estimate = Math.round(String(chunk || '').length * TTS_CHUNK_TIMEOUT_PER_CHAR_MS + 10_000);
  return Math.max(TTS_CHUNK_TIMEOUT_MIN_MS, Math.min(TTS_CHUNK_TIMEOUT_MAX_MS, estimate));
}

function countMatches(input: string, pattern: RegExp): number {
  return (input.match(pattern) || []).length;
}

function isJsonLikeToolDump(input: string): boolean {
  const value = String(input || '');
  if (!value.trim()) return false;
  const quoteColonPairs = countMatches(value, /"[a-z0-9_]+":/gi);
  const unicodeEscapes = countMatches(value, /\\u[0-9a-f]{4}/gi);
  const jsonBraces = countMatches(value, /[\{\}]/g);
  const looksLikeCapsTool = /"documents"\s*:|"content_preview"\s*:|search_caps_curriculum/i.test(value);
  return looksLikeCapsTool || quoteColonPairs >= 10 || unicodeEscapes >= 4 || jsonBraces >= 16;
}

function stripToolDumpForSpeech(input: string): string {
  const text = String(input || '').trim();
  if (!text) return '';
  const splitMatch = text.match(/\n+\s*[\{\[]/);
  if (splitMatch?.index && splitMatch.index > 0) {
    const lead = text.slice(0, splitMatch.index).trim();
    const tail = text.slice(splitMatch.index).trim();
    if (isJsonLikeToolDump(tail)) return lead;
  }
  return isJsonLikeToolDump(text) ? '' : text;
}

function normalizeUrlHeavyMarkdownForSpeech(input: string): string {
  const value = String(input || '').trim();
  if (!value) return '';
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, '$1')
    .replace(RAW_URL_REGEX, ' link ')
    .replace(/\b(token|sig|expires|signature)=[^\s&]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldUseDetectedLocaleForSpeech(text: string, locale: string, source: string): boolean {
  const normalizedLocale = String(locale || '').toLowerCase();
  if (!normalizedLocale || normalizedLocale === 'en-za') return true;
  // Accept explicit user choice, auto-detected language, and user preference
  const validSources = new Set(['explicit_override', 'auto_detect', 'user_preference']);
  if (!validSources.has(source)) return false;

  const value = String(text || '').toLowerCase();
  const englishMarkers = countMatches(
    value,
    /\b(the|and|you|your|is|are|to|for|with|can|will|please|what|how|when|where|school|lesson|class|student|parent)\b/g
  );
  const afMarkers = countMatches(
    value,
    /\b(afrikaans|asseblief|dankie|baie|goeie|middag|aand|verduidelik|som|antwoord|wiskunde|leerling|onderwyser)\b/g
  );
  const zuMarkers = countMatches(
    value,
    /\b(isizulu|ngiyacela|ngiyabonga|yebo|cha|sawubona|umfundi|uthisha|isikole|isifundo)\b/g
  );

  if (normalizedLocale === 'af-za') {
    return afMarkers >= 2 && afMarkers >= englishMarkers / 2;
  }
  if (normalizedLocale === 'zu-za') {
    return zuMarkers >= 2 && zuMarkers >= englishMarkers / 2;
  }
  return false;
}

function resolveSpeechLocale(message: DashMessage, responseText: string, fallbackLocale: string): string {
  const detectedLocale = String(
    message.metadata?.detected_language ||
    (message.metadata as any)?.language ||
    ''
  ).trim();
  const languageSource = String((message.metadata as any)?.language_source || '').trim().toLowerCase();
  if (!detectedLocale) return fallbackLocale;
  return shouldUseDetectedLocaleForSpeech(responseText, detectedLocale, languageSource)
    ? detectedLocale
    : DEFAULT_DASH_VOICE_LOCALE;
}

function mergeTranscriptFragments(base: string, incoming: string): string {
  const left = String(base || '').trim();
  const right = String(incoming || '').trim();
  if (!left) return right;
  if (!right) return left;

  const leftLower = left.toLowerCase();
  const rightLower = right.toLowerCase();

  if (leftLower === rightLower || leftLower.endsWith(rightLower)) return left;
  if (rightLower.startsWith(leftLower)) return right;

  const leftWords = left.split(/\s+/).filter(Boolean);
  const rightWords = right.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(8, leftWords.length, rightWords.length);

  for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
    const leftTail = leftWords.slice(-overlap).join(' ').toLowerCase();
    const rightHead = rightWords.slice(0, overlap).join(' ').toLowerCase();
    if (leftTail === rightHead) {
      return [...leftWords, ...rightWords.slice(overlap)].join(' ');
    }
  }

  return `${left} ${right}`.replace(/\s+/g, ' ').trim();
}

export async function stopDashVoiceRecording(params: {
  voiceRefs: VoiceRefs;
  isFreeTier: boolean;
  consumeVoiceBudget: (deltaMs: number) => Promise<void>;
  setIsRecording: (value: boolean) => void;
  setPartialTranscript: (value: string) => void;
  setInputText?: (value: string) => void;
}) {
  const {
    voiceRefs,
    isFreeTier,
    consumeVoiceBudget,
    setIsRecording,
    setPartialTranscript,
    setInputText,
  } = params;

  if (voiceRefs.sttFinalizeTimerRef?.current) {
    clearTimeout(voiceRefs.sttFinalizeTimerRef.current);
    voiceRefs.sttFinalizeTimerRef.current = null;
  }

  const bufferedTranscript = String(voiceRefs.sttTranscriptBufferRef?.current || '').trim();
  if (bufferedTranscript) {
    setInputText?.(bufferedTranscript);
  }
  if (voiceRefs.sttTranscriptBufferRef) {
    voiceRefs.sttTranscriptBufferRef.current = '';
  }

  if (!voiceRefs.voiceSessionRef.current) {
    setIsRecording(false);
    return;
  }

  try {
    await voiceRefs.voiceSessionRef.current.stop();
  } catch (error) {
    console.error('[useDashAssistant] Failed to stop voice session:', error);
  }

  if (isFreeTier && voiceRefs.voiceInputStartAtRef.current) {
    const deltaMs = Math.max(0, Date.now() - voiceRefs.voiceInputStartAtRef.current);
    await consumeVoiceBudget(deltaMs);
    voiceRefs.voiceInputStartAtRef.current = null;
  }

  setIsRecording(false);
  setPartialTranscript('');
  voiceRefs.voiceSessionRef.current = null;
}

export async function speakDashResponse(params: {
  message: DashMessage;
  dashInstance: any;
  voiceEnabled: boolean;
  hasTTSAccess: () => boolean;
  isFreeTier: boolean;
  consumeVoiceBudget: (ms: number) => Promise<void>;
  isSpeaking: boolean;
  speakingMessageId: string | null;
  voiceRefs: VoiceRefs;
  setIsSpeaking: (value: boolean) => void;
  setSpeakingMessageId: (value: string | null) => void;
  showAlert: (alert: any) => void;
  hideAlert: () => void;
  setVoiceEnabled: (value: boolean) => void;
  stopSpeaking: () => Promise<void>;
  preferFastStart?: boolean;
  forceSpeak?: boolean;
  onSpeechChunkProgress?: (progress: SpeechChunkProgress) => void;
}) {
  const {
    message,
    dashInstance,
    voiceEnabled,
    hasTTSAccess,
    isFreeTier,
    consumeVoiceBudget,
    isSpeaking,
    speakingMessageId,
    voiceRefs,
    setIsSpeaking,
    setSpeakingMessageId,
    showAlert,
    hideAlert,
    setVoiceEnabled,
    stopSpeaking,
    preferFastStart = false,
    forceSpeak = false,
    onSpeechChunkProgress,
  } = params;

  if (!dashInstance || message.type !== 'assistant') return;

  if (!voiceEnabled) {
    showAlert({
      title: 'Voice Responses Disabled',
      message: 'Enable Voice Responses in Dash AI Settings to hear spoken replies.',
      type: 'info',
      icon: 'volume-mute-outline',
      buttons: [{ text: 'OK', style: 'default' }],
    });
    return;
  }

  if (!hasTTSAccess()) {
    setVoiceEnabled(false);
    showAlert({
      title: '',
      message: isFreeTier
        ? "Daily voice limit reached. Text responses still work! 💬"
        : 'Voice is a premium feature. Text responses still work perfectly! 💬',
      type: 'info',
      icon: 'chatbubble-ellipses-outline',
      autoDismissMs: 4000,
      bannerMode: true,
    });
    return;
  }

  const now = Date.now();
  const sinceLastStart = now - (voiceRefs.lastSpeakStartRef.current || 0);

  if (speakingMessageId === message.id) {
    if (sinceLastStart < 600) return;
    await stopSpeaking();
    return;
  }

  if (isSpeaking && speakingMessageId) {
    if (sinceLastStart < 600) return;
    await stopSpeaking();
  }

  try {
    if (isFreeTier && message.content && process.env.NODE_ENV !== 'development') {
      const estimatedMs = Math.max(1500, Math.round((message.content.length / 12.5) * 1000));
      void consumeVoiceBudget(estimatedMs).catch((budgetError) => {
        console.warn('[useDashAssistant] Voice budget update failed, continuing with playback:', budgetError);
      });
    }
    const rawSpeechInput = stripToolDumpForSpeech(message.content || '');
    // Skip speaking if the content is a streaming placeholder, not an actual response.
    // getStreamingPlaceholder returns a known set of placeholder strings — if the entire
    // message content matches one, it is not a real AI response and should not be spoken.
    const trimmedRaw = rawSpeechInput.trim();
    if (trimmedRaw && trimmedRaw === getStreamingPlaceholder(trimmedRaw)) {
      return;
    }
    const normalizedSpeechInput = normalizeUrlHeavyMarkdownForSpeech(rawSpeechInput || '');
    const speechPolicy = evaluateDashSpeechContent(normalizedSpeechInput || rawSpeechInput || '');
    if (!forceSpeak && speechPolicy.shouldSuppress) {
      onSpeechChunkProgress?.({
        messageId: message.id,
        chunkIndex: 0,
        chunkCount: 0,
        isPlaying: false,
        isComplete: true,
      });
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      return;
    }
    const isPhonics = shouldUsePhonicsMode(rawSpeechInput || '');
    const cleaned = cleanForTTS(normalizedSpeechInput || '', { phonicsMode: isPhonics });
    const chunks = splitForTTSWithFastStart(cleaned, {
      enabled: preferFastStart,
      maxLen: TTS_CHUNK_MAX_LEN,
      firstChunkMaxLen: TTS_FAST_START_FIRST_CHUNK_MAX_LEN,
    });
    if (chunks.length === 0) {
      onSpeechChunkProgress?.({
        messageId: message.id,
        chunkIndex: 0,
        chunkCount: 0,
        isPlaying: false,
        isComplete: true,
      });
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      return;
    }
    const preferredVoiceLocale = resolveSpeechLocale(
      message,
      rawSpeechInput,
      String(dashInstance?.getPersonality?.()?.voice_settings?.language || DEFAULT_DASH_VOICE_LOCALE)
    );
    const stableLocale = preferredVoiceLocale.includes('-')
      ? preferredVoiceLocale
      : `${preferredVoiceLocale}-ZA`;

    const sessionId = `${message.id}:${now}`;
    if (voiceRefs.ttsSessionIdRef) {
      voiceRefs.ttsSessionIdRef.current = sessionId;
    }
    let fallbackNotified = false;

    setIsSpeaking(true);
    setSpeakingMessageId(message.id);
    voiceRefs.lastSpeakStartRef.current = now;

    const throwSpeechError = (error: unknown) => {
      const errorMessage = typeof error === 'string'
        ? error
        : (error as any)?.message || '';
      const errorCode = (error as any)?.code || '';
      const normalized = `${errorCode} ${errorMessage}`.toLowerCase();

      console.error('Speech error:', error);

      let title = 'Voice Playback Error';
      let messageText = 'We had trouble speaking that response. Try again or disable voice.';

      if (normalized.includes('tts_free_tier_blocked')) {
        setVoiceEnabled(false);
        showAlert({
          title: '',
          message: 'Voice is a premium feature. Text responses still work perfectly! 💬',
          type: 'info',
          icon: 'chatbubble-ellipses-outline',
          autoDismissMs: 4000,
          bannerMode: true,
        });
        return;
      } else if (
        normalized.includes('auth_required') ||
        normalized.includes('unauthorized') ||
        normalized.includes('invalid token')
      ) {
        title = 'Voice Needs Login';
        messageText = 'Voice playback requires an active session. Please sign in again.';
      } else if (
        normalized.includes('azure speech not configured') ||
        normalized.includes('device_fallback') ||
        normalized.includes('tts unavailable')
      ) {
        title = 'Voice Service Offline';
        messageText = 'Azure TTS is not available right now. Check the Supabase `tts-proxy` function secrets (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION) and redeploy.';
      } else if (normalized.includes('network') || normalized.includes('fetch')) {
        title = 'Voice Network Error';
        messageText = "Dash couldn't reach the voice service. Check your connection and try again.";
      }

      showAlert({
        title,
        message: messageText,
        type: 'warning',
        icon: 'volume-mute-outline',
        buttons: [
          { text: 'OK', style: 'default' },
          {
            text: 'Disable Voice',
            onPress: () => {
              hideAlert();
              setVoiceEnabled(false);
            },
          },
        ],
      });
    };

    for (let idx = 0; idx < chunks.length; idx += 1) {
      if (voiceRefs.ttsSessionIdRef && voiceRefs.ttsSessionIdRef.current !== sessionId) {
        onSpeechChunkProgress?.({
          messageId: message.id,
          chunkIndex: idx,
          chunkCount: chunks.length,
          isPlaying: false,
          isComplete: false,
        });
        break;
      }

      const chunk = chunks[idx];
      const chunkStartedAt = Date.now();
      onSpeechChunkProgress?.({
        messageId: message.id,
        chunkIndex: idx,
        chunkCount: chunks.length,
        isPlaying: true,
        isComplete: false,
      });
      const chunkMessage: DashMessage = {
        ...message,
        content: chunk,
        metadata: {
          ...(message.metadata || {}),
          detected_language: stableLocale,
        },
      };

      let chunkFailed = false;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };

        const timeoutMs = resolveChunkTimeoutMs(chunk);
        const timeout = setTimeout(() => {
          console.warn('[DashVoice] TTS chunk timed out waiting for completion callback', {
            index: idx + 1,
            total: chunks.length,
            chars: chunk.length,
            timeoutMs,
          });
          settle(resolve);
        }, timeoutMs);
        const clear = () => clearTimeout(timeout);

        void dashInstance.speakResponse(chunkMessage, {
          onStart: () => {},
          onDone: () => {
            clear();
            settle(resolve);
          },
          onStopped: () => {
            clear();
            settle(resolve);
          },
          onError: (error: unknown) => {
            clear();
            settle(() => reject(error));
          },
          onLanguageFallback: (requested: string, actual: string) => {
            if (fallbackNotified) return;
            fallbackNotified = true;
            const langNames: Record<string, string> = {
              en: 'English', af: 'Afrikaans', zu: 'isiZulu', xh: 'isiXhosa',
              nso: 'Sepedi', st: 'Sesotho', fr: 'French', pt: 'Portuguese',
              es: 'Spanish', de: 'German',
            };
            const from = langNames[requested] || requested;
            const to = langNames[actual] || actual;
            showAlert({
              title: 'Voice Language Notice',
              message: `${from} voice is not yet available. Playing in ${to} instead.`,
              type: 'info',
              icon: 'language-outline',
              buttons: [{ text: 'OK', style: 'default' }],
            });
          },
        });
      }).catch((error) => {
        chunkFailed = true;
        throwSpeechError(error);
      });
      // Abort if session was invalidated while the chunk was playing (e.g. user pressed stop)
      if (voiceRefs.ttsSessionIdRef && voiceRefs.ttsSessionIdRef.current !== sessionId) {
        onSpeechChunkProgress?.({
          messageId: message.id,
          chunkIndex: idx,
          chunkCount: chunks.length,
          isPlaying: false,
          isComplete: false,
        });
        break;
      }
      if (__DEV__ && !chunkFailed) {
        console.log('[DashVoice] TTS chunk playback completed', {
          index: idx + 1,
          total: chunks.length,
          chars: chunk.length,
          duration_ms: Date.now() - chunkStartedAt,
        });
      }
      if (chunkFailed) {
        onSpeechChunkProgress?.({
          messageId: message.id,
          chunkIndex: idx,
          chunkCount: chunks.length,
          isPlaying: false,
          isComplete: false,
        });
        break;
      }
    }

    if (!voiceRefs.ttsSessionIdRef || voiceRefs.ttsSessionIdRef.current === sessionId) {
      if (voiceRefs.ttsSessionIdRef) {
        voiceRefs.ttsSessionIdRef.current = null;
      }
      onSpeechChunkProgress?.({
        messageId: message.id,
        chunkIndex: Math.max(0, chunks.length - 1),
        chunkCount: chunks.length,
        isPlaying: false,
        isComplete: true,
      });
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    }
  } catch (error) {
    console.error('Failed to speak response:', error);
    if (voiceRefs.ttsSessionIdRef) {
      voiceRefs.ttsSessionIdRef.current = null;
    }
    onSpeechChunkProgress?.({
      messageId: message.id,
      chunkIndex: 0,
      chunkCount: 0,
      isPlaying: false,
      isComplete: false,
    });
    setIsSpeaking(false);
    setSpeakingMessageId(null);
  }
}

export async function handleDashVoiceInputPress(params: {
  hasTTSAccess: () => boolean;
  hasSTTAccess?: () => boolean;
  isRecording: boolean;
  stopVoiceRecording: () => Promise<void>;
  tier: string | undefined;
  showAlert: (alert: any) => void;
  hideAlert: () => void;
  dashInstance: any;
  preferredLanguage: string | null | undefined;
  resolveVoiceLocale: (value?: string | null) => string;
  isFreeTier: boolean;
  consumeVoiceBudget: (deltaMs: number) => Promise<void>;
  setIsRecording: (value: boolean) => void;
  setPartialTranscript: (value: string) => void;
  setInputText: (value: string) => void;
  existingInputText?: string;
  voiceAutoSend?: boolean;
  voiceAutoSendSilenceMs?: number;
  voiceWhisperFlowEnabled?: boolean;
  voiceWhisperFlowSummaryEnabled?: boolean;
  isPreschoolMode?: boolean;
  onFinalTranscript?: (
    text: string,
    options: { autoSend: boolean; delayMs: number; probe?: VoiceProbeMetrics },
  ) => void | Promise<void>;
  onVoiceActivity?: (active: boolean) => void;
  voiceRefs: VoiceRefs;
}) {
  const {
    hasTTSAccess,
    hasSTTAccess,
    isRecording,
    stopVoiceRecording,
    tier,
    showAlert,
    hideAlert,
    dashInstance,
    preferredLanguage,
    resolveVoiceLocale,
    isFreeTier,
    consumeVoiceBudget,
    setIsRecording,
    setPartialTranscript,
    setInputText,
    existingInputText = '',
    voiceAutoSend = false,
    voiceAutoSendSilenceMs = STT_FINALIZE_DEFAULT_MS,
    voiceWhisperFlowEnabled = true,
    voiceWhisperFlowSummaryEnabled = true,
    isPreschoolMode = false,
    onFinalTranscript,
    onVoiceActivity,
    voiceRefs,
  } = params;

  // STT (voice input) uses its own access check, NOT the TTS budget check.
  // If hasSTTAccess is provided and returns true, skip the TTS budget gate.
  const sttAllowed = hasSTTAccess ? hasSTTAccess() : hasTTSAccess();
  if (!sttAllowed) {
    showAlert({
      title: isFreeTier ? 'Daily Voice Limit Reached' : 'Voice Features - Premium',
      message: isFreeTier
        ? "You've used today's 10 minutes of voice. Upgrade for unlimited voice input and playback."
        : 'Voice input and text-to-speech are premium features available on Starter and Plus plans.\n\nUpgrade to unlock:\n• Voice input (speak to Dash)\n• Text-to-speech (Dash reads responses)\n• Voice commands',
      type: 'info',
      icon: 'mic-outline',
      buttons: [
        { text: 'Maybe Later', style: 'cancel' },
        {
          text: 'Upgrade Now',
          onPress: () => {
            hideAlert();
            router.push('/screens/subscription-setup' as any);
          },
        },
      ],
    });
    return;
  }

  if (isRecording) {
    await stopVoiceRecording();
    return;
  }

  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const dictationProbe: VoiceProbeMetrics = {
      platform: 'mobile',
      source: 'dash_assistant',
    };
    const nowIso = () => new Date().toISOString();

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'Dash AI needs access to your microphone for voice input.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showAlert({
            title: 'Microphone Permission Required',
            message: 'Please grant microphone permission to use voice input with Dash.',
            type: 'warning',
            icon: 'mic-off-outline',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { hideAlert(); Linking.openSettings(); } },
            ],
          });
          return;
        }
      } catch (permErr) {
        console.error('[useDashAssistant] Permission request error:', permErr);
      }
    } else if (Platform.OS === 'ios') {
      try {
        const { status } = await AudioModule.requestPermissionsAsync();
        if (status !== 'granted') {
          showAlert({
            title: 'Microphone Permission Required',
            message: 'Please grant microphone permission to use voice input with Dash.',
            type: 'warning',
            icon: 'mic-off-outline',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { hideAlert(); Linking.openSettings(); } },
            ],
          });
          return;
        }
      } catch (permErr) {
        console.error('[useDashAssistant] iOS permission request error:', permErr);
      }
    }

    // Always get a fresh provider — never cache a noop provider that permanently blocks voice
    const voiceLocale = resolveVoiceLocale(preferredLanguage || dashInstance?.getPersonality?.()?.voice_settings?.language || null);
    const freshProvider = await getSingleUseVoiceProvider(voiceLocale);
    voiceRefs.voiceProviderRef.current = freshProvider;

    const provider = voiceRefs.voiceProviderRef.current;
    const available = await provider.isAvailable();
    console.log('[VoiceHandlers] Provider availability:', { id: provider.id, available, locale: voiceLocale });

    if (!available) {
      const androidMessage = `Speech recognition is not available on this device.\n\nTo enable voice input:\n1. Install or update the Google app from Play Store\n2. Go to Settings → Apps → Google → Permissions → Microphone\n3. Enable \"Offline speech recognition\" in Google Settings\n4. Restart EduDash Pro\n\nAlternatively, you can use text input to chat with Dash.`;

      const iosMessage = `Speech recognition is not available.\n\nTo enable voice input:\n1. Go to Settings → Privacy → Speech Recognition\n2. Enable speech recognition for EduDash Pro\n3. Restart the app\n\nYou can also use text input to chat with Dash.`;

      showAlert({
        title: 'Voice Input Unavailable',
        message: Platform.OS === 'android' ? androidMessage : iosMessage,
        type: 'warning',
        icon: 'mic-off-outline',
        buttons: [
          { text: 'Use Text Input', style: 'default' },
          Platform.OS === 'android'
            ? { text: 'Open Play Store', onPress: () => { hideAlert(); Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.googlequicksearchbox'); } }
            : { text: 'Open Settings', onPress: () => { hideAlert(); Linking.openSettings(); } },
        ],
      });
      return;
    }

    const session = provider.createSession();
    voiceRefs.voiceSessionRef.current = session;
    if (voiceRefs.sttFinalizeTimerRef?.current) {
      clearTimeout(voiceRefs.sttFinalizeTimerRef.current);
      voiceRefs.sttFinalizeTimerRef.current = null;
    }
    const transcriptSeed = String(existingInputText || '').trim();
    if (voiceRefs.sttTranscriptBufferRef) {
      voiceRefs.sttTranscriptBufferRef.current = transcriptSeed;
    }
    const defaultFinalizeDelayMs = isPreschoolMode
      ? STT_FINALIZE_DEFAULT_PRESCHOOL_MS
      : STT_FINALIZE_DEFAULT_MS;
    const minFinalizeDelayMs = isPreschoolMode
      ? Math.max(STT_FINALIZE_MIN_MS, 900)
      : STT_FINALIZE_MIN_MS;
    const maxFinalizeDelayMs = isPreschoolMode
      ? Math.min(STT_FINALIZE_MAX_MS, 3600)
      : Math.min(STT_FINALIZE_MAX_MS, 2200);
    const parsedFinalizeDelay = Number(voiceAutoSendSilenceMs);
    const finalizeDelayMs = Number.isFinite(parsedFinalizeDelay)
      ? Math.max(minFinalizeDelayMs, Math.min(maxFinalizeDelayMs, parsedFinalizeDelay))
      : defaultFinalizeDelayMs;
    const finalCommitDelayMs = Math.max(
      STT_FINAL_COMMIT_MIN_MS,
      Math.min(STT_FINAL_COMMIT_MAX_MS, Math.round(finalizeDelayMs * 0.45)),
    );
    let voiceActivityTimeout: ReturnType<typeof setTimeout> | null = null;

    const setVoiceActivity = (active: boolean) => {
      onVoiceActivity?.(active);
    };

    const clearVoiceActivityTimeout = () => {
      if (voiceActivityTimeout) {
        clearTimeout(voiceActivityTimeout);
        voiceActivityTimeout = null;
      }
    };

    const pulseVoiceActivity = () => {
      setVoiceActivity(true);
      clearVoiceActivityTimeout();
      voiceActivityTimeout = setTimeout(() => {
        setVoiceActivity(false);
      }, 900);
    };

    const clearFinalizeTimer = () => {
      if (voiceRefs.sttFinalizeTimerRef?.current) {
        clearTimeout(voiceRefs.sttFinalizeTimerRef.current);
        voiceRefs.sttFinalizeTimerRef.current = null;
      }
    };

    const commitTranscriptAndStop = async () => {
      clearFinalizeTimer();
      clearVoiceActivityTimeout();
      setVoiceActivity(false);
      const bufferedTranscript = String(voiceRefs.sttTranscriptBufferRef?.current || '').trim();
      if (bufferedTranscript) {
        setInputText(bufferedTranscript);
      }
      setPartialTranscript('');

      if (voiceRefs.voiceSessionRef.current?.isActive?.()) {
        await voiceRefs.voiceSessionRef.current.stop().catch(() => {});
      }
      voiceRefs.voiceSessionRef.current = null;
      setIsRecording(false);

      if (isFreeTier && voiceRefs.voiceInputStartAtRef.current) {
        const deltaMs = Math.max(0, Date.now() - voiceRefs.voiceInputStartAtRef.current);
        void consumeVoiceBudget(deltaMs).catch(() => {});
        voiceRefs.voiceInputStartAtRef.current = null;
      }

      if (bufferedTranscript) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        track('edudash.voice.input_completed', {
          transcript_length: bufferedTranscript.length,
          user_tier: tier || 'free',
        });
        if (!dictationProbe.final_transcript_at) {
          dictationProbe.final_transcript_at = nowIso();
        }
        dictationProbe.commit_at = nowIso();
        onFinalTranscript?.(bufferedTranscript, {
          autoSend: !!voiceAutoSend,
          delayMs: finalizeDelayMs,
          probe: { ...dictationProbe },
        });
      }

      if (voiceRefs.sttTranscriptBufferRef) {
        voiceRefs.sttTranscriptBufferRef.current = '';
      }
    };

    const scheduleFinalize = (source: 'partial' | 'final') => {
      clearFinalizeTimer();
      const delayMs = source === 'final'
        ? finalCommitDelayMs
        : finalizeDelayMs;
      const finalizeTimer = setTimeout(() => {
        void commitTranscriptAndStop();
      }, delayMs);
      if (voiceRefs.sttFinalizeTimerRef) {
        voiceRefs.sttFinalizeTimerRef.current = finalizeTimer;
      }
    };

    const started = await session.start({
      language: voiceLocale,
      onPartial: (text: string) => {
        clearFinalizeTimer();
        const partial = String(text || '').trim();
        if (!partial) {
          return;
        }
        if (!dictationProbe.first_partial_at) {
          dictationProbe.first_partial_at = nowIso();
        }
        pulseVoiceActivity();
        const buffered = String(voiceRefs.sttTranscriptBufferRef?.current || '').trim();
        const merged = mergeTranscriptFragments(buffered, partial);
        if (voiceRefs.sttTranscriptBufferRef) {
          voiceRefs.sttTranscriptBufferRef.current = merged;
        }
        setPartialTranscript(partial);
        setInputText(merged);
        // Speculative commit path: when partials go stable, finalize quickly
        // instead of waiting indefinitely for a final transcript event.
        scheduleFinalize('partial');
      },
      onFinal: (text: string) => {
        const formatted = formatTranscript(text, voiceLocale, {
          whisperFlow: voiceWhisperFlowEnabled,
          summarize: voiceWhisperFlowSummaryEnabled,
          preschoolMode: isPreschoolMode,
          maxSummaryWords: isPreschoolMode ? 16 : 20,
        });
        const chunk = String(formatted || '').trim();
        if (!chunk) {
          scheduleFinalize('partial');
          return;
        }
        if (!dictationProbe.final_transcript_at) {
          dictationProbe.final_transcript_at = nowIso();
        }
        pulseVoiceActivity();
        const buffered = String(voiceRefs.sttTranscriptBufferRef?.current || '').trim();
        const merged = mergeTranscriptFragments(buffered, chunk);
        if (voiceRefs.sttTranscriptBufferRef) {
          voiceRefs.sttTranscriptBufferRef.current = merged;
        }
        setInputText(merged);
        setPartialTranscript('');
        // Final transcript means turn-end is known; commit sooner than partial path.
        scheduleFinalize('final');
      },
      onError: (error: string) => {
        const msg = String(error || '');
        if (/network_retrying/i.test(msg)) {
          setPartialTranscript('I lost connection, retrying...');
          return;
        }
        clearFinalizeTimer();
        clearVoiceActivityTimeout();
        setVoiceActivity(false);
        const isNetwork = /network|internet|offline|timeout|connection/i.test(msg);
        setIsRecording(false);
        setPartialTranscript('');
        if (voiceRefs.voiceSessionRef.current?.isActive?.()) {
          voiceRefs.voiceSessionRef.current.stop().catch(() => {});
        }
        voiceRefs.voiceSessionRef.current = null;
        if (voiceRefs.sttTranscriptBufferRef) {
          voiceRefs.sttTranscriptBufferRef.current = '';
        }
        if (isFreeTier && voiceRefs.voiceInputStartAtRef.current) {
          const deltaMs = Math.max(0, Date.now() - voiceRefs.voiceInputStartAtRef.current);
          void consumeVoiceBudget(deltaMs).catch(() => {});
          voiceRefs.voiceInputStartAtRef.current = null;
        }
        showAlert({
          title: 'Voice Recognition Error',
          message: isNetwork
            ? 'Voice recognition needs a stable internet connection on this device. Please check your connection or use text input.'
            : 'Voice recognition failed. Please try again or use text input.',
          type: 'warning',
          icon: 'mic-off-outline',
          buttons: [{ text: 'OK', style: 'default' }],
        });
      },
    });

    if (started) {
      setIsRecording(true);
      setPartialTranscript('');
      setVoiceActivity(false);
      if (voiceRefs.sttTranscriptBufferRef) {
        voiceRefs.sttTranscriptBufferRef.current = transcriptSeed;
      }
      voiceRefs.voiceInputStartAtRef.current = Date.now();
      dictationProbe.stt_start_at = nowIso();

      track('edudash.voice.input_started', {
        user_tier: tier || 'free',
      });
    } else {
      clearFinalizeTimer();
      clearVoiceActivityTimeout();
      setVoiceActivity(false);
      if (voiceRefs.sttTranscriptBufferRef) {
        voiceRefs.sttTranscriptBufferRef.current = '';
      }
      showAlert({
        title: 'Voice Error',
        message: 'Failed to start voice recognition. Please check microphone permissions and try again.',
        type: 'error',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    }
  } catch (error) {
    console.error('[useDashAssistant] Voice recognition error:', error);
    if (voiceRefs.sttFinalizeTimerRef?.current) {
      clearTimeout(voiceRefs.sttFinalizeTimerRef.current);
      voiceRefs.sttFinalizeTimerRef.current = null;
    }
    if (voiceRefs.sttTranscriptBufferRef) {
      voiceRefs.sttTranscriptBufferRef.current = '';
    }
    onVoiceActivity?.(false);
    setIsRecording(false);
    setPartialTranscript('');

    showAlert({
      title: 'Voice Error',
      message: 'An error occurred with voice recognition. Please try again.',
      type: 'error',
      icon: 'alert-circle-outline',
      buttons: [{ text: 'OK', style: 'default' }],
    });
  }
}
