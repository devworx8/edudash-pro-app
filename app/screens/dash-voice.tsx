/**
 * Dash Voice — Full-Screen ORB Experience
 *
 * TODO(refactor): This file is ~1500 lines — over the 500-line guideline.
 * Candidate sub-modules to extract:
 *   - hooks/useDashVoice.ts         (core state, STT/TTS, language switching)
 *   - components/DashVoiceOrb.tsx   (animated orb visual + pulse ring)
 *   - components/DashVoiceChat.tsx  (message list & answer buttons)
 *   - dashVoiceStyles.ts           (StyleSheet.create block)
 * Keep the public screen export intact as a thin composition layer.
 *
 * The primary voice-first interface launched from the FAB.
 * - Voice STT/TTS with dynamic language switching (EN/AF/ZU)
 * - True SSE streaming for realtime text delivery
 * - Interactive answer buttons for preschoolers
 * - Media upload support (images from gallery/camera)
 * - Org/role/age-aware quick-action chips
 * - Language dropdown in header
 *
 * @module app/screens/dash-voice
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Platform,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { buildDashTurnTelemetry, createDashTurnId } from '@/lib/dash-ai/turnTelemetry';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { classifyFullChatIntent } from '@/lib/dash-ai/fullChatIntent';
import { trackTutorFullChatHandoff } from '@/lib/ai/trackingEvents';
import { ToolRegistry } from '@/services/AgentTools';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import { useRealtimeTier } from '@/hooks/useRealtimeTier';
import { CircularQuotaRing } from '@/components/ui/CircularQuotaRing';
import HomeworkScanner, { type HomeworkScanResult } from '@/components/ai/HomeworkScanner';
import { LanguageDropdown, getLanguageLabel } from '@/components/dash-orb/LanguageDropdown';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import { getOrganizationType } from '@/lib/tenant/compat';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { resolveDashPolicy } from '@/lib/dash-ai/DashPolicyResolver';
import { resolveAIProxyScopeFromRole } from '@/lib/ai/aiProxyScope';
import { shouldGreetToday, buildDynamicGreeting } from '@/lib/ai/greetingManager';
import {
  buildSystemPrompt,
  cleanForTTS,
  cleanRawJSON,
  createStreamingRequest,
  shouldEnableVoiceTurnTools,
  getStreamingPlaceholder,
} from '@/lib/dash-voice-utils';

import { shouldUsePhonicsMode, detectPhonicsIntent } from '@/lib/dash-ai/phonicsDetection';
import {
  buildCriteriaHeadingTemplate,
  detectOCRTask,
  extractCriteriaHeadings,
  getCriteriaResponsePrompt,
  isOCRIntent,
  getOCRPromptForTask,
  isShortOrAttachmentOnlyPrompt,
} from '@/lib/dash-ai/ocrPrompts';
import { enforceCriteriaResponseWithSingleRewrite } from '@/features/dash-ai/criteriaEnforcement';
import {
  consumeAutoScanBudget,
  loadAutoScanBudget,
} from '@/lib/dash-ai/imageBudget';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ORB_SIZE = Math.min(SCREEN_WIDTH * 0.78, 320);

const PDF_INTENT_REGEX = /\b(pdf|worksheet|document)\b/i;
const PDF_ACTION_REGEX = /\b(generate|create|make|export|regenerate|rebuild|produce|save)\b/i;

const firstText = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const wantsPdfArtifact = (text: string): boolean => {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  if (PDF_INTENT_REGEX.test(normalized) && PDF_ACTION_REGEX.test(normalized)) return true;
  return /\bcan you generate me a pdf\b/i.test(normalized);
};

const buildPdfTitleFromPrompt = (prompt: string): string => {
  const compact = String(prompt || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
  if (!compact) return 'Dash Voice Document';
  const base = compact.slice(0, 64).trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
};

const isWeb = Platform.OS === 'web';
let VoiceOrb: React.ForwardRefExoticComponent<any> | null = null;
if (!isWeb) {
  const mod = require('@/components/super-admin/voice-orb');
  VoiceOrb = mod.VoiceOrb;
}

type VoiceOrbRef = {
  speakText: (text: string, language?: SupportedLanguage, options?: { phonicsMode?: boolean }) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  stopListening?: () => Promise<void>;
  isSpeaking: boolean;
};

type OrbPdfArtifact = {
  url: string;
  title: string;
  filename?: string | null;
};

type DashVoiceDictationProbe = {
  run_id?: string;
  platform: 'mobile' | 'web';
  source: string;
  stt_start_at?: string;
  first_partial_at?: string;
  final_transcript_at?: string;
  commit_at?: string;
};

export default function DashVoiceScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const autoScanUserId = String(user?.id || profile?.id || '').trim() || null;
  const insets = useSafeAreaInsets();
  const role = String(profile?.role || 'guest').toLowerCase();
  const aiScope = useMemo(() => resolveAIProxyScopeFromRole(role), [role]);
  const orgType = getOrganizationType(profile);
  const dashPolicy = useMemo(
    () =>
      resolveDashPolicy({
        profile: profile || null,
        role,
        orgType,
        learnerContext: {
          ageBand: (profile as any)?.age_group || null,
          grade: (profile as any)?.grade_level || null,
        },
      }),
    [orgType, profile, role]
  );

  // ── State ──────────────────────────────────────────────────────────
  const [lastResponse, setLastResponse] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [restartBlocked, setRestartBlocked] = useState(false);
  const [voiceErrorBanner, setVoiceErrorBanner] = useState<string | null>(null);
  const [preferredLanguage, setPreferredLanguage] = useState<SupportedLanguage>('en-ZA');
  const [attachedImage, setAttachedImage] = useState<{
    uri: string;
    base64: string;
    source: 'scanner' | 'library';
  } | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [remainingScans, setRemainingScans] = useState<number | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [isGreetingLoading, setIsGreetingLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [lastUserTranscript, setLastUserTranscript] = useState('');
  const [latestPdfArtifact, setLatestPdfArtifact] = useState<OrbPdfArtifact | null>(null);

  // Conversation history for context (prevents redundant greetings)
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const conversationHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const conversationIdRef = useRef(`orb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  const voiceOrbRef = useRef<VoiceOrbRef>(null);
  const inputRef = useRef<TextInput>(null);
  const ccScrollRef = useRef<ScrollView>(null);
  const voiceDictationProbeRef = useRef<DashVoiceDictationProbe | null>(null);
  const isSpeakingRef = useRef(false);
  const speechQueueRef = useRef<string[]>([]);
  const speechMutexRef = useRef(false);
  const activeRequestRef = useRef<{ abort: () => void } | null>(null);
  const DASH_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_VOICE_TRACE === 'true';

  // Streaming-to-speech can sound choppy on mobile because each sentence becomes a separate TTS request.
  // Keep it opt-in; default is final-response TTS for smoother playback.
  const STREAMING_TTS_ENABLED = process.env.EXPO_PUBLIC_DASH_VOICE_STREAMING_TTS === 'true';
  const streamedPrefixQueuedRef = useRef('');
  const streamedHasQueuedRef = useRef(false);
  const streamedLastQueuedAtRef = useRef(0);

  const logDashTrace = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!DASH_TRACE_ENABLED) return;
    console.log(`[DashVoiceTrace] ${event}`, payload || {});
  }, [DASH_TRACE_ENABLED]);

  const activeTier = useMemo(
    () =>
      String(
        (profile as any)?.subscription_tier ||
        (profile as any)?.tier ||
        (profile as any)?.current_tier ||
        'free'
      ).toLowerCase(),
    [profile]
  );
  const normalizedToolTier = useMemo(
    () => getCapabilityTier(normalizeTierName(activeTier || 'free')),
    [activeTier]
  );
  const { tierStatus } = useRealtimeTier();

  const refreshAutoScanBudget = useCallback(async () => {
    const budget = await loadAutoScanBudget(activeTier || 'free', autoScanUserId);
    setRemainingScans(budget.remainingCount);
  }, [activeTier, autoScanUserId]);

  useEffect(() => {
    void refreshAutoScanBudget();
  }, [refreshAutoScanBudget]);

  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  // ── Barge-in: auto-stop TTS when user starts speaking ─────────────
  useEffect(() => {
    if (isListening && isSpeaking && voiceOrbRef.current) {
      voiceOrbRef.current.stopSpeaking();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      speechQueueRef.current = [];
    }
  }, [isListening, isSpeaking]);

  // ── Instant greeting: no AI round-trip for ChatGPT-like speed ─────
  // Skip AI greeting upgrade — local greeting is immediate; AI upgrade added latency.
  const hasGreetedRef = useRef(false);
  useEffect(() => {
    if (hasGreetedRef.current) return;
    if (conversationHistoryRef.current.length > 0) return;
    hasGreetedRef.current = true;

    const name = profile?.first_name || profile?.full_name?.split(' ')[0] || '';

    (async () => {
      const shouldGreet = await shouldGreetToday(user?.id);
      const opener = shouldGreet
        ? buildDynamicGreeting({ userName: name || null, role, orgType, language: preferredLanguage })
        : (name ? `Hey ${name}, what can I help with?` : 'What can I help with?');

      const hist = [{ role: 'assistant' as const, content: opener }];
      conversationHistoryRef.current = hist;
      setConversationHistory(hist);
      setLastResponse(opener);
      setIsGreetingLoading(false);
    })();
  }, [orgType, preferredLanguage, profile?.first_name, profile?.full_name, role, user?.id]);

  const quickActions = useMemo(() => dashPolicy.quickActions, [dashPolicy.quickActions]);
  const rawDisplayed = streamingText || lastResponse;
  const displayedText = rawDisplayed && /^\s*data:\s*(\[DONE\])?\s*$/i.test(rawDisplayed)
    ? '' : rawDisplayed;
  const langLabel = useMemo(() => getLanguageLabel(preferredLanguage), [preferredLanguage]);

  // ── TTS Queue ─────────────────────────────────────────────────────
  const speakResponse = useCallback(async (text: string) => {
    if (!voiceOrbRef.current) return;
    // Detect phonics BEFORE cleaning so slash markers are preserved.
    const phonicsMode = shouldUsePhonicsMode(text, { organizationType: orgType });
    const clean = cleanForTTS(text, { phonicsMode });
    if (!clean) return;
    try {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      // FIXED: Always use the user's selected language — never auto-detect from text.
      // Text detection caused voice-switching mid-response when AI used SA loanwords.
      const chunkLang = preferredLanguage || 'en-ZA';
      await voiceOrbRef.current.speakText(clean, chunkLang, { phonicsMode });
    } catch { /* ignore */ } finally {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }
  }, [preferredLanguage, orgType]);

  const processSpeechQueue = useCallback(async () => {
    if (speechMutexRef.current) return;
    speechMutexRef.current = true;
    try {
      const next = speechQueueRef.current.shift();
      if (!next) return;
      await speakResponse(next);
      if (speechQueueRef.current.length > 0) {
        setTimeout(() => processSpeechQueue(), 50);
      }
    } finally {
      speechMutexRef.current = false;
    }
  }, [speakResponse]);

  const enqueueSpeech = useCallback((text: string) => {
    // Push raw text — speakResponse handles phonics detection + cleaning
    if (!text?.trim()) return;
    speechQueueRef.current.push(text.trim());
    processSpeechQueue();
  }, [processSpeechQueue]);

  const longestCommonPrefixLen = useCallback((a: string, b: string) => {
    const max = Math.min(a.length, b.length);
    let i = 0;
    for (; i < max; i += 1) {
      if (a[i] !== b[i]) break;
    }
    return i;
  }, []);

  const findSpeakBoundaryIndex = useCallback((text: string) => {
    if (!text) return -1;
    // Prefer sentence-ending punctuation for "speak-while-streaming".
    const sentence = /[.!?](?=\s|$)/.exec(text);
    if (sentence) return sentence.index;

    // Soft boundaries that are still safe to speak on (faster perceived latency).
    const soft = /[\n;:](?=\s|$)/.exec(text);
    if (soft) return soft.index;

    // Commas are only safe if we already have enough context.
    if (text.length > 50) {
      const comma = /,(?=\s)/.exec(text);
      if (comma) return comma.index;
    }

    // Fallback: if the model streams long clauses without punctuation, speak an early phrase.
    const hardMax = 140;
    if (text.length > hardMax) {
      const slice = text.slice(0, hardMax);
      const lastSpace = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'));
      if (lastSpace > 40) return lastSpace;
      return hardMax;
    }
    return -1;
  }, []);

  const resetStreamingSpeech = useCallback(() => {
    streamedPrefixQueuedRef.current = '';
    streamedHasQueuedRef.current = false;
    streamedLastQueuedAtRef.current = 0;
  }, []);

  const maybeEnqueueStreamingSpeech = useCallback((accumulated: string) => {
    if (!STREAMING_TTS_ENABLED) return;
    if (!accumulated) return;

    const full = accumulated;
    const prev = streamedPrefixQueuedRef.current;

    let delta = '';
    if (!prev) {
      delta = full;
    } else if (full.startsWith(prev)) {
      delta = full.slice(prev.length);
    } else {
      const lcp = longestCommonPrefixLen(full, prev);
      streamedPrefixQueuedRef.current = full.slice(0, lcp);
      delta = full.slice(lcp);
    }

    if (delta.trim().length < 5) return;
    // Only speak on sentence-ending punctuation (. ! ?) during stream to avoid choppy one-chunk-at-a-time TTS.
    const sentenceEnd = /[.!?](?=\s|$)/.exec(delta);
    const boundaryIdx = sentenceEnd ? sentenceEnd.index : -1;
    if (boundaryIdx < 0) return;

    const rawChunk = delta.slice(0, boundaryIdx + 1);
    const speakChunk = rawChunk.trim();
    if (!speakChunk) return;

    // Require a minimum phrase length so we don't queue many tiny utterances (e.g. "Yes." "Okay.").
    const MIN_STREAMING_PHRASE_CHARS = 35;
    if (speakChunk.length < MIN_STREAMING_PHRASE_CHARS) return;

    if (/\/[a-z]*$/i.test(speakChunk) || /^[a-z]*\//i.test(speakChunk)) return;

    // Throttle: avoid queueing another phrase too soon or too short (reduces choppiness on native).
    const now = Date.now();
    const throttleMs = 400;
    const minCharsToBypassThrottle = 60;
    if (now - streamedLastQueuedAtRef.current < throttleMs && speakChunk.length < minCharsToBypassThrottle) return;
    streamedLastQueuedAtRef.current = now;

    streamedHasQueuedRef.current = true;
    streamedPrefixQueuedRef.current = `${streamedPrefixQueuedRef.current}${rawChunk}`;
    enqueueSpeech(speakChunk);
  }, [STREAMING_TTS_ENABLED, enqueueSpeech, longestCommonPrefixLen]);

  const handleVoiceError = useCallback((message: string) => {
    const normalized = String(message || '').toLowerCase();
    if (!normalized) return;
    if (normalized.includes('network_retrying')) {
      setVoiceErrorBanner('I lost connection for a moment. Retrying listening now...');
      return;
    }
    if (normalized.includes('phonics') && normalized.includes('cloud tts')) {
      setVoiceErrorBanner('Phonics voice needs Azure cloud TTS. It is currently unavailable, so letter sounds may fail.');
      return;
    }
    if (normalized.includes('service_unconfigured') || normalized.includes('502')) {
      setVoiceErrorBanner('Azure voice is unavailable right now. Check tts-proxy Azure secrets/config.');
      return;
    }
    if (normalized.includes('network') || normalized.includes('timeout') || normalized.includes('fetch')) {
      setVoiceErrorBanner('Voice recognition needs a stable connection. Check internet and try again.');
      return;
    }
    setVoiceErrorBanner('Voice encountered an error. Please try again.');
  }, []);

  // ── Media Picker ──────────────────────────────────────────────────
  const pickMedia = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, quality: 0.7, base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setAttachedImage({ uri: result.assets[0].uri, base64: result.assets[0].base64, source: 'library' });
      }
    } catch { /* cancelled */ }
  }, []);

  const takePhoto = useCallback(async () => {
    setScannerVisible(true);
  }, []);

  const handleScannerScanned = useCallback((result: HomeworkScanResult) => {
    if (!result?.base64) return;
    setAttachedImage({
      uri: result.uri,
      base64: result.base64,
      source: 'scanner',
    });
    void refreshAutoScanBudget();
    setScannerVisible(false);
  }, [refreshAutoScanBudget]);

  // ── Persist ORB messages to AsyncStorage for handoff to full chat ──
  const persistOrbMessages = useCallback(async (msgs: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    try {
      const userId = user?.id || profile?.id;
      if (!userId) return;
      const key = `dash:orb-session:${userId}`;
      const payload = { conversationId: conversationIdRef.current, messages: msgs, updatedAt: Date.now() };
      await AsyncStorage.setItem(key, JSON.stringify(payload));
    } catch { /* non-critical */ }
  }, [profile?.id, user?.id]);

  const exportPdfFromVoiceResponse = useCallback(async (prompt: string, content: string): Promise<OrbPdfArtifact | null> => {
    const safeContent = String(content || '').trim();
    if (!safeContent) return null;

    try {
      const supabase = assertSupabase();
      const execution = await ToolRegistry.execute(
        'export_pdf',
        {
          title: buildPdfTitleFromPrompt(prompt),
          content: safeContent,
        },
        {
          profile,
          user,
          supabase,
          supabaseClient: supabase,
          role: String(profile?.role || role || 'parent').toLowerCase(),
          tier: normalizedToolTier,
          organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
          hasOrganization: Boolean((profile as any)?.organization_id || (profile as any)?.preschool_id),
          isGuest: !user?.id,
          trace_id: `dash_voice_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tool_plan: {
            source: 'dash_voice.auto_pdf_export',
            intent: 'voice_pdf_request',
          },
        },
      );

      if (!execution?.success) {
        logDashTrace('pdf_export_failed', {
          error: execution?.error || 'unknown_error',
          role,
          tier: normalizedToolTier,
        });
        return null;
      }

      const payload = (execution.result && typeof execution.result === 'object')
        ? execution.result as Record<string, any>
        : {};
      const nested = (payload.result && typeof payload.result === 'object')
        ? payload.result as Record<string, any>
        : {};
      const merged = { ...payload, ...nested };
      const url = firstText(
        merged.downloadUrl,
        merged.download_url,
        merged.signedUrl,
        merged.signed_url,
        merged.publicUrl,
        merged.public_url,
        merged.uri,
        merged.url,
      );
      if (!url) {
        logDashTrace('pdf_export_missing_url', {
          role,
          tier: normalizedToolTier,
        });
        return null;
      }

      const filename = firstText(merged.filename, merged.file_name, merged.name);
      const artifact: OrbPdfArtifact = {
        url,
        title: filename || 'Generated PDF',
        filename,
      };
      setLatestPdfArtifact(artifact);
      logDashTrace('pdf_export_ready', {
        filename: artifact.filename,
        urlPreview: artifact.url.slice(0, 140),
      });
      return artifact;
    } catch (error) {
      logDashTrace('pdf_export_error', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }, [logDashTrace, normalizedToolTier, profile, role, user]);

  // ── Send Message (streaming SSE) ──────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    options?: { dictationProbe?: DashVoiceDictationProbe },
  ) => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;
    const shouldAutoExportPdf = wantsPdfArtifact(trimmed);

    const flags = getFeatureFlagsSync();
    const handoffIntent = flags.dash_tutor_auto_handoff_v1 ? classifyFullChatIntent(trimmed) : null;
    if (handoffIntent) {
      const history = conversationHistoryRef.current;
      await persistOrbMessages(history);
      trackTutorFullChatHandoff({
        intent: handoffIntent,
        source: 'dash_voice',
        role,
      });
      setRestartBlocked(true);
      activeRequestRef.current?.abort();
      voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
      voiceOrbRef.current?.stopListening?.().catch(() => {});
      router.push({
        pathname: '/screens/dash-assistant',
        params: {
          source: 'orb',
          initialMessage: trimmed,
          resumePrompt: trimmed,
          mode: handoffIntent === 'quiz' ? 'tutor' : 'advisor',
          tutorMode: handoffIntent === 'quiz' ? 'quiz' : undefined,
          handoffIntent,
        },
      });
      return;
    }

    const turnId = createDashTurnId('dash_voice_turn');
    const turnStartedAt = Date.now();
    const turnTelemetryBase = buildDashTurnTelemetry({
      conversationId: conversationIdRef.current,
      turnId,
      mode: 'orb',
      tier: String((profile as any)?.subscription_tier || '').trim() || null,
      voiceProvider: 'voice_orb',
      fallbackReason: 'none',
      source: 'dash-voice.sendMessage',
    });
    track('dash.turn.started', turnTelemetryBase);
    logDashTrace('turn_started', {
      turnId,
      role,
      orgType,
      language: preferredLanguage,
      inputChars: trimmed.length,
      inputPreview: trimmed.slice(0, 140),
      hasImage: !!attachedImage?.base64,
      autoPdfIntent: shouldAutoExportPdf,
    });
    activeRequestRef.current?.abort();
    resetStreamingSpeech();
    speechQueueRef.current = [];
    setIsProcessing(true);
    setLastResponse('');
    setStreamingText(getStreamingPlaceholder(trimmed));

    // Add user message to history (use ref to avoid dependency on state)
    const updatedHistory = [...conversationHistoryRef.current, { role: 'user' as const, content: trimmed }];
    conversationHistoryRef.current = updatedHistory;
    setConversationHistory(updatedHistory);

    try {
      const supabase = assertSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in');

      // Only include the full phonics prompt block if the conversation mentions phonics
      const recentText = updatedHistory.slice(-4).map(m => m.content).join(' ');
      const phonicsActive = detectPhonicsIntent(trimmed) || detectPhonicsIntent(recentText);
      const systemPrompt =
        buildSystemPrompt(orgType, role, preferredLanguage, { phonicsActive }) +
        '\n\n' +
        dashPolicy.systemPromptAddendum;
      const hasImage = !!attachedImage?.base64;
      const ocrTask = hasImage ? detectOCRTask(trimmed) : null;
      const ocrMode = hasImage && (
        isOCRIntent(trimmed) ||
        ocrTask !== null ||
        isShortOrAttachmentOnlyPrompt(trimmed)
      );
      const attachedImageSource = attachedImage?.source || null;
      const shouldConsumeScannerQuota = ocrMode && attachedImageSource === 'scanner';
      const imageContext = hasImage
        ? '\n\nIMAGE PROCESSING: The user attached an image. Describe what you see and provide educational insights.'
        : '';
      const criteriaContext = getCriteriaResponsePrompt(trimmed);
      const criteriaContextBlock = criteriaContext ? `\n\n${criteriaContext}` : '';
      const criteriaHeadings = extractCriteriaHeadings(trimmed);
      const criteriaIntent = criteriaHeadings.length > 0;
      const criteriaTemplate = buildCriteriaHeadingTemplate(criteriaHeadings);
      const criteriaTemplateBlock = criteriaTemplate ? `\n\n${criteriaTemplate}` : '';
      const ocrContext = ocrMode
        ? `\n\n${getOCRPromptForTask(ocrTask || 'document')}`
        : '';
      const enableToolsForTurn = shouldEnableVoiceTurnTools(trimmed, {
        hasAttachment: hasImage,
        ocrMode,
        criteriaIntent,
      });
      // Send full conversation history (last 20 turns) so AI has context
      const recentHistory = updatedHistory.slice(-20);
      const payload: Record<string, any> = {
        messages: recentHistory,
        context: systemPrompt + imageContext + criteriaContextBlock + criteriaTemplateBlock + ocrContext,
      };
      if (hasImage) {
        payload.images = [{ data: attachedImage.base64, media_type: 'image/jpeg' }];
      }
      if (ocrMode) {
        payload.ocr_mode = true;
        payload.ocr_task = ocrTask || 'document';
        payload.ocr_response_format = 'json';
      }

      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`;
      const bodyPayload = {
        scope: aiScope,
        service_type: ocrMode ? 'image_analysis' : 'dash_conversation',
        payload,
        stream: !ocrMode,
        enable_tools: enableToolsForTurn,
        metadata: {
          role,
          source: 'dash_voice_orb',
          voice_dictation_probe: options?.dictationProbe,
          org_type: orgType,
          dash_mode: dashPolicy.defaultMode,
          language: preferredLanguage || undefined,
          has_image: hasImage,
          ocr_mode: ocrMode,
          ocr_task: ocrTask || undefined,
          stream_tool_mode: enableToolsForTurn ? 'enabled' : 'deferred',
        },
      };
      const body = JSON.stringify(bodyPayload);
      if (attachedImage) setAttachedImage(null);

      const applyCriteriaGuardrails = async (candidateText: string): Promise<{
        text: string;
        warningCode?: string;
      }> => {
        const enforcement = await enforceCriteriaResponseWithSingleRewrite({
          userInput: trimmed,
          responseContent: candidateText,
          extractedHeadings: criteriaHeadings,
          rewriteAttempt: async (rewritePrompt) => {
            const rewriteBody = JSON.stringify({
              scope: aiScope,
              service_type: ocrMode ? 'image_analysis' : 'dash_conversation',
              payload: {
                messages: [
                  ...recentHistory.slice(-10),
                  { role: 'assistant', content: candidateText },
                  { role: 'user', content: rewritePrompt },
                ],
                context: payload.context,
              },
              stream: false,
              enable_tools: false,
              metadata: {
                role,
                source: 'dash_voice_orb.criteria_rewrite',
                criteria_rewrite_pass: true,
              },
            });
            const rewriteResponse = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: rewriteBody,
            });
            const rewriteData = await rewriteResponse.json().catch(() => ({} as Record<string, any>));
            if (!rewriteResponse.ok) {
              throw new Error(String(rewriteData?.error || rewriteData?.message || `Request failed (${rewriteResponse.status})`));
            }
            return cleanRawJSON(String(rewriteData?.content || ''));
          },
        });

        if (enforcement.outcome === 'failed_after_rewrite') {
          return {
            text: `${String(enforcement.content || candidateText).trim()}\n\nNote: Please verify criterion headings before submission.`,
            warningCode: enforcement.warningCode || 'criteria_mapping_mismatch',
          };
        }

        return {
          text: String(enforcement.content || candidateText).trim(),
          warningCode: enforcement.warningCode || undefined,
        };
      };

      if (ocrMode) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body,
        });
        const data = await response.json().catch(() => ({} as Record<string, any>));
        if (!response.ok) {
          throw new Error(String(data?.error || data?.message || `Request failed (${response.status})`));
        }

        const ocr = data?.ocr;
        const confidence = typeof data?.confidence_score === 'number'
          ? data.confidence_score
          : typeof ocr?.confidence === 'number'
            ? ocr.confidence
            : null;
        const content = typeof data?.content === 'string'
          ? data.content
          : typeof ocr?.analysis === 'string'
            ? ocr.analysis
            : '';
        const cleaned = cleanRawJSON(content);
        const lowConfidenceHint =
          typeof confidence === 'number' && confidence <= 0.75
            ? `\n\nScan clarity: ${Math.round(confidence * 100)}%. For better accuracy, retake with clearer lighting and a flatter page.`
            : '';
        const displayText = (cleaned || 'I analyzed the image but did not find readable text.') + lowConfidenceHint;
        const criteriaGuard = await applyCriteriaGuardrails(displayText);
        const finalDisplayText = criteriaGuard.text || displayText;
        let resolvedDisplayText = finalDisplayText;
        let resolvedSpeechText = finalDisplayText;
        if (shouldAutoExportPdf) {
          const artifact = await exportPdfFromVoiceResponse(trimmed, finalDisplayText);
          if (artifact?.url) {
            resolvedDisplayText = `${finalDisplayText}\n\nPDF generated. Tap "Open latest PDF" below.`;
            resolvedSpeechText = `${finalDisplayText}\n\nYour PDF is ready.`;
          }
        }
        logDashTrace('ocr_response', {
          turnId,
          responseChars: resolvedDisplayText.length,
          responsePreview: resolvedDisplayText.slice(0, 160),
          ocrTask: ocrTask || 'document',
          criteriaWarning: criteriaGuard.warningCode || null,
        });
        setLastResponse(resolvedDisplayText);
        setStreamingText('');
        setIsProcessing(false);
        if (resolvedDisplayText) {
          const withResponse = [...updatedHistory, { role: 'assistant' as const, content: resolvedDisplayText }];
          conversationHistoryRef.current = withResponse;
          setConversationHistory(withResponse);
          persistOrbMessages(withResponse);
          enqueueSpeech(resolvedSpeechText);
        }
        if (shouldConsumeScannerQuota) {
          const consumeResult = await consumeAutoScanBudget(activeTier || 'free', 1, autoScanUserId);
          if (!consumeResult.allowed) {
            logDashTrace('auto_scan_budget_overrun', { turnId, source: attachedImageSource });
          }
          await refreshAutoScanBudget();
        }
        track(
          'dash.turn.completed',
          buildDashTurnTelemetry({
            ...turnTelemetryBase,
            latencyMs: Date.now() - turnStartedAt,
          })
        );
        activeRequestRef.current = null;
        return;
      }

      let firstChunkAt: number | null = null;
      let lastProgressLogAt = 0;
      const req = createStreamingRequest(url, session.access_token, body,
        (accumulated) => {
          if (firstChunkAt === null) {
            firstChunkAt = Date.now();
            logDashTrace('stream_first_chunk', {
              turnId,
              firstTokenLatencyMs: firstChunkAt - turnStartedAt,
            });
          }
          const now = Date.now();
          if (now - lastProgressLogAt > 900) {
            lastProgressLogAt = now;
            logDashTrace('stream_progress', {
              turnId,
              chars: accumulated.length,
              elapsedMs: now - turnStartedAt,
            });
          }
          // Guard: never show raw SSE artifacts in the streaming display
          if (accumulated && !/^\s*data:\s*(\[DONE\])?\s*$/i.test(accumulated)) {
            setStreamingText(accumulated);
            maybeEnqueueStreamingSpeech(accumulated);
          }
        },
        (finalText) => {
          void (async () => {
            const cleaned = cleanRawJSON(finalText);
            // Guard: if nothing meaningful was returned, show a friendly fallback
            const isSseArtifact = !cleaned || /^\s*(data:\s*\[DONE\]|data:\s*$)/i.test(cleaned);
            const displayText = isSseArtifact
              ? 'I couldn\'t get a response. Please try again.'
              : cleaned;
            const criteriaGuard = isSseArtifact
              ? { text: displayText }
              : await applyCriteriaGuardrails(displayText);
            const finalDisplayText = criteriaGuard.text || displayText;
            let resolvedDisplayText = finalDisplayText;
            let resolvedSpeechText = finalDisplayText;
            if (shouldAutoExportPdf && !isSseArtifact) {
              const artifact = await exportPdfFromVoiceResponse(trimmed, finalDisplayText);
              if (artifact?.url) {
                resolvedDisplayText = `${finalDisplayText}\n\nPDF generated. Tap "Open latest PDF" below.`;
                resolvedSpeechText = `${finalDisplayText}\n\nYour PDF is ready.`;
              }
            }
            logDashTrace('stream_done', {
              turnId,
              latencyMs: Date.now() - turnStartedAt,
              chars: resolvedDisplayText.length,
              preview: resolvedDisplayText.slice(0, 160),
              artifact: isSseArtifact,
              criteriaWarning: criteriaGuard.warningCode || null,
            });
            setLastResponse(resolvedDisplayText);
            setStreamingText('');
            setIsProcessing(false);
            // Add assistant response to history + persist
            if (resolvedDisplayText && !isSseArtifact) {
              const withResponse = [...updatedHistory, { role: 'assistant' as const, content: resolvedDisplayText }];
              conversationHistoryRef.current = withResponse;
              setConversationHistory(withResponse);
              persistOrbMessages(withResponse);
              if (STREAMING_TTS_ENABLED) {
                const lcp = longestCommonPrefixLen(resolvedSpeechText, streamedPrefixQueuedRef.current);
                const remaining = resolvedSpeechText.slice(lcp).trim();
                if (remaining) enqueueSpeech(remaining);
              } else {
                enqueueSpeech(resolvedSpeechText);
              }
            }
            track(
              'dash.turn.completed',
              buildDashTurnTelemetry({
                ...turnTelemetryBase,
                latencyMs: Date.now() - turnStartedAt,
              })
            );
            activeRequestRef.current = null;
          })().catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown stream finalization error';
            logDashTrace('stream_error', {
              turnId,
              latencyMs: Date.now() - turnStartedAt,
              message,
            });
            setLastResponse(`Sorry, ${message}. Please try again.`);
            setStreamingText('');
            setIsProcessing(false);
            activeRequestRef.current = null;
          });
        },
        (error) => {
          logDashTrace('stream_error', {
            turnId,
            latencyMs: Date.now() - turnStartedAt,
            message: error.message,
          });
          resetStreamingSpeech();
          setLastResponse(`Sorry, ${error.message}. Please try again.`);
          setStreamingText('');
          setIsProcessing(false);
          track('dash.turn.failed', {
            ...buildDashTurnTelemetry({
              ...turnTelemetryBase,
              latencyMs: Date.now() - turnStartedAt,
            }),
            error: error.message,
          });
          activeRequestRef.current = null;
        },
      );
      activeRequestRef.current = req;
    } catch (error) {
      resetStreamingSpeech();
      const msg = error instanceof Error ? error.message : 'Something went wrong';
      logDashTrace('turn_error', {
        turnId,
        latencyMs: Date.now() - turnStartedAt,
        message: msg,
      });
      setLastResponse(`Sorry, ${msg}. Please try again.`);
      setStreamingText('');
      setIsProcessing(false);
      track('dash.turn.failed', {
        ...buildDashTurnTelemetry({
          ...turnTelemetryBase,
          latencyMs: Date.now() - turnStartedAt,
        }),
        error: msg,
      });
    }
  }, [
    isProcessing,
    orgType,
    role,
    aiScope,
    preferredLanguage,
    attachedImage,
    enqueueSpeech,
    maybeEnqueueStreamingSpeech,
    resetStreamingSpeech,
    longestCommonPrefixLen,
    logDashTrace,
    persistOrbMessages,
    exportPdfFromVoiceResponse,
    profile,
    activeTier,
    autoScanUserId,
    dashPolicy.defaultMode,
    dashPolicy.systemPromptAddendum,
    refreshAutoScanBudget,
    STREAMING_TTS_ENABLED,
  ]);

  // Stop Dash (TTS + request + queue) when leaving screen or on unmount
  const stopDashActivity = useCallback((reason: string = 'manual_stop', blockRestart: boolean = false) => {
    logDashTrace('dash_stop', { reason, blockRestart });
    if (blockRestart) {
      setRestartBlocked(true);
    }
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    speechQueueRef.current = [];
    resetStreamingSpeech();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setIsListening(false);
    setIsProcessing(false);
    setStreamingText('');
    voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
    voiceOrbRef.current?.stopListening?.().catch(() => {});
  }, [logDashTrace, resetStreamingSpeech]);

  useFocusEffect(
    useCallback(() => {
      setRestartBlocked(false);
      return () => {
        stopDashActivity('navigation_blur', true);
      };
    }, [stopDashActivity])
  );

  useEffect(() => () => {
    activeRequestRef.current?.abort();
    stopDashActivity('unmount', true);
  }, [stopDashActivity]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleVoiceInput = useCallback((transcript: string, language?: SupportedLanguage) => {
    // Guard against ORB hearing its own TTS output during brief state races.
    if (isSpeakingRef.current || isSpeaking || isProcessing) {
      logDashTrace('voice_input_ignored', {
        reason: isSpeakingRef.current || isSpeaking ? 'speaking' : 'processing',
        language: language || preferredLanguage,
        preview: String(transcript || '').slice(0, 120),
      });
      return;
    }
    const formatted = formatTranscript(transcript, language, {
      whisperFlow: true,
      summarize: false,
      preschoolMode: orgType === 'preschool',
      maxSummaryWords: orgType === 'preschool' ? 16 : 20,
    });
    logDashTrace('voice_input_received', {
      language: language || preferredLanguage,
      rawChars: String(transcript || '').length,
      cleanChars: formatted.trim().length,
      rawPreview: String(transcript || '').slice(0, 120),
      cleanPreview: formatted.trim().slice(0, 120),
    });
    if (language) setPreferredLanguage(language);
    const cleaned = formatted.trim();
    if (!cleaned) return;
    const nowIso = new Date().toISOString();
    const benchmarkRunId = String(process.env.EXPO_PUBLIC_VOICE_BENCHMARK_RUN_ID || '').trim();
    const dictationProbe: DashVoiceDictationProbe = {
      ...(voiceDictationProbeRef.current || { platform: 'mobile', source: 'dash_voice_orb' }),
      platform: 'mobile',
      source: 'dash_voice_orb',
      final_transcript_at: voiceDictationProbeRef.current?.final_transcript_at || nowIso,
      commit_at: nowIso,
      ...(benchmarkRunId ? { run_id: benchmarkRunId } : {}),
    };
    voiceDictationProbeRef.current = null;
    setLiveUserTranscript('');
    setLastUserTranscript(cleaned);
    sendMessage(cleaned, { dictationProbe });
  }, [isProcessing, isSpeaking, logDashTrace, orgType, preferredLanguage, sendMessage]);

  const handleSubmit = useCallback(() => {
    if (inputText.trim()) { sendMessage(inputText); setInputText(''); }
  }, [inputText, sendMessage]);

  const handleInputFocus = useCallback(() => {
    if (isSpeakingRef.current || isSpeaking) {
      voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
      logDashTrace('dash_stop', { reason: 'input_focus_stop_speaking' });
    }
    if (isListening) {
      voiceOrbRef.current?.stopListening?.().catch(() => {});
      setIsListening(false);
      logDashTrace('dash_stop', { reason: 'input_focus_stop_listening' });
    }
  }, [isListening, isSpeaking, logDashTrace]);

  // ── Derived ───────────────────────────────────────────────────────
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = profile?.first_name || profile?.full_name?.split(' ')[0] || '';
    const tg = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${tg}, ${name}` : tg;
  }, [profile]);

  const statusLabel = isProcessing
    ? (streamingText ? 'Streaming...' : 'Thinking...')
    : isSpeaking ? 'Speaking...'
    : isListening ? 'Always listening'
    : 'Tap the orb or speak';
  const orbRenderSize = showTranscript ? Math.round(ORB_SIZE * 0.56) : ORB_SIZE;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <LanguageDropdown
        visible={showLangMenu}
        onClose={() => setShowLangMenu(false)}
        selectedLanguage={preferredLanguage}
        onSelect={setPreferredLanguage}
        onOpenFullChat={async () => {
          const history = conversationHistoryRef.current;
          await persistOrbMessages(history);
          stopDashActivity('open_full_chat', true);
          router.push({
            pathname: '/screens/dash-assistant',
            params: { source: 'orb' },
          });
        }}
        theme={theme}
      />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={() => {
            stopDashActivity('navigation_back', true);
            router.back();
          }}
          style={s.headerBtn}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.headerTitle, { color: theme.text }]}>Dash</Text>
            {tierStatus && tierStatus.quotaLimit > 0 && (
              <CircularQuotaRing
                used={tierStatus.quotaUsed}
                limit={tierStatus.quotaLimit}
                size={28}
                strokeWidth={3}
                showPercentage
              />
            )}
          </View>
          <Text style={[s.headerSub, { color: theme.textSecondary }]}>{statusLabel}</Text>
        </View>
        <View style={s.headerRight}>
          {(isSpeaking || isProcessing) && (
            <TouchableOpacity
              onPress={() => stopDashActivity('header_stop_button')}
              style={[s.headerIconBtn, { borderColor: theme.error || '#ef4444', backgroundColor: (theme as any).error || '#ef4444' }]}
              accessibilityLabel="Stop Dash speaking"
            >
              <Ionicons name="stop" size={16} color={theme.onError || theme.background || '#fff'} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              stopDashActivity('open_search', true);
              router.push('/screens/app-search?scope=dash&q=dash');
            }}
            style={[s.headerIconBtn, { borderColor: theme.border }]}
            accessibilityLabel="Find Dash features"
          >
            <Ionicons name="search-outline" size={16} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowTranscript((v) => !v)}
            style={[
              s.headerIconBtn,
              {
                borderColor: theme.border,
                backgroundColor: showTranscript ? theme.surface : 'transparent',
              },
            ]}
            accessibilityLabel={showTranscript ? 'Hide transcript' : 'Show transcript'}
          >
            <Ionicons
              name={showTranscript ? 'document-text' : 'document-text-outline'}
              size={16}
              color={showTranscript ? theme.text : theme.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowLangMenu(true)} style={[s.langBtn, { borderColor: theme.border }]}>
            <Ionicons name="language-outline" size={16} color={theme.primary} />
            <Text style={[s.langBtnText, { color: theme.primary }]}>{langLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={s.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 50}>
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={[s.greeting, { color: theme.text }]}>{greeting}</Text>
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>Your AI assistant</Text>

          {/* ORB */}
          <View style={[s.orbContainer, { minHeight: orbRenderSize + 40, marginBottom: showTranscript ? 10 : 16 }]}>
            {VoiceOrb ? (
              <VoiceOrb
                ref={voiceOrbRef}
                isListening={isListening}
                isSpeaking={isSpeaking}
                isParentProcessing={isProcessing}
                onStopListening={() => setIsListening(false)}
                onStartListening={() => {
                  setIsListening(true);
                  if (!voiceDictationProbeRef.current) {
                    voiceDictationProbeRef.current = {
                      platform: 'mobile',
                      source: 'dash_voice_orb',
                      stt_start_at: new Date().toISOString(),
                    };
                  } else if (!voiceDictationProbeRef.current.stt_start_at) {
                    voiceDictationProbeRef.current.stt_start_at = new Date().toISOString();
                  }
                }}
                onPartialTranscript={(text) => {
                  setLiveUserTranscript(text);
                  if (!voiceDictationProbeRef.current) {
                    voiceDictationProbeRef.current = {
                      platform: 'mobile',
                      source: 'dash_voice_orb',
                      stt_start_at: new Date().toISOString(),
                    };
                  }
                  if (!voiceDictationProbeRef.current.first_partial_at && String(text || '').trim()) {
                    voiceDictationProbeRef.current.first_partial_at = new Date().toISOString();
                  }
                }}
                onTranscript={handleVoiceInput}
                onVoiceError={handleVoiceError}
                onTTSStart={() => setIsSpeaking(true)}
                onTTSEnd={() => setIsSpeaking(false)}
                onLanguageChange={(lang: SupportedLanguage) => setPreferredLanguage(lang)}
                language={preferredLanguage}
                size={orbRenderSize}
                autoStartListening
                autoRestartAfterTTS
                restartBlocked={restartBlocked}
                preschoolMode={orgType === 'preschool'}
                showLiveTranscript={false}
              />
            ) : (
              <CosmicOrb
                size={orbRenderSize}
                isProcessing={isProcessing || isListening}
                isSpeaking={isSpeaking}
              />
            )}
          </View>

          {/* Processing */}
          {isProcessing && !streamingText && (
            <View style={s.processingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[s.processingText, { color: theme.textSecondary }]}>Thinking...</Text>
            </View>
          )}

          {voiceErrorBanner ? (
            <View style={{
              marginTop: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${theme.error || '#ef4444'}66`,
              backgroundColor: `${theme.error || '#ef4444'}20`,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
              <Ionicons name="warning-outline" size={16} color={theme.error || '#ef4444'} />
              <Text style={{ color: theme.error || '#ef4444', flex: 1, fontSize: 12, marginLeft: 8, marginRight: 8 }}>
                {voiceErrorBanner}
              </Text>
              <TouchableOpacity onPress={() => setVoiceErrorBanner(null)}>
                <Ionicons name="close" size={14} color={theme.error || '#ef4444'} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Captions (CC): assistant captions + tap-to-correct user transcript */}
          {showTranscript ? (
            <View style={{ width: '100%', marginBottom: 12 }}>
              {(liveUserTranscript.trim() || lastUserTranscript.trim()) ? (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    const text = (liveUserTranscript.trim() || lastUserTranscript.trim());
                    if (!text) return;
                    setInputText(text);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  style={{
                    marginBottom: 10,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                  accessibilityLabel="Edit what Dash heard"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 4 }}>
                      You said (tap to correct)
                    </Text>
                    <Text style={{ color: theme.text, fontSize: 15, lineHeight: 20 }}>
                      {liveUserTranscript.trim() || lastUserTranscript.trim()}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={18} color={theme.primary} />
                </TouchableOpacity>
              ) : null}

              <View style={[
                s.responseCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  maxHeight: 520,
                  minHeight: 260,
                },
              ]}>
                <ScrollView
                  ref={ccScrollRef}
                  style={[s.responseScroll, { maxHeight: 480 }]}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={() => ccScrollRef.current?.scrollToEnd({ animated: true })}
                  contentContainerStyle={{ paddingBottom: 30 }}
                >
                  <Text style={[
                    s.responseText,
                    {
                      color: theme.text,
                      fontSize: 22,
                      lineHeight: 32,
                    },
                  ]}>
                    {displayedText || (isProcessing ? '…' : '')}
                  </Text>
                </ScrollView>
                {streamingText ? (
                  <View style={s.streamingDot}><ActivityIndicator size="small" color={theme.primary} /></View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Quick actions — only show once before first user interaction */}
          {!displayedText && !isProcessing && !isGreetingLoading && conversationHistory.length <= 1 && !conversationHistory.some(m => m.role === 'user') && (
            <View style={s.quickActions}>
              {quickActions.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={[s.quickChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  onPress={() => sendMessage(action.prompt)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={action.icon as any} size={18} color={theme.primary} />
                  <Text style={[s.quickChipText, { color: theme.text }]}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {latestPdfArtifact?.url && (
            <TouchableOpacity
              style={[s.fullChatLink, { borderColor: theme.primary + '44', borderWidth: 1, backgroundColor: theme.primary + '12' }]}
              onPress={() => {
                router.push({
                  pathname: '/screens/pdf-viewer',
                  params: {
                    title: latestPdfArtifact.title || 'Generated PDF',
                    url: latestPdfArtifact.url,
                  },
                } as any);
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open latest generated PDF"
            >
              <Ionicons name="document-text-outline" size={16} color={theme.primary} />
              <Text style={[s.fullChatText, { color: theme.primary }]}>
                Open latest PDF
              </Text>
            </TouchableOpacity>
          )}

          {/* Full chat link */}
          <TouchableOpacity style={s.fullChatLink} onPress={async () => {
            const history = conversationHistoryRef.current;
            await persistOrbMessages(history);
            stopDashActivity('continue_full_chat', true);
            router.push({
              pathname: '/screens/dash-assistant',
              params: { source: 'orb' },
            });
          }}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.primary} />
            <Text style={[s.fullChatText, { color: theme.primary }]}>Continue in full Dash chat</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Attached image */}
        {attachedImage && (
          <View style={[s.attachPreview, { borderTopColor: theme.border }]}>
            <Image source={{ uri: attachedImage.uri }} style={s.attachThumb} />
            <Text style={[s.attachLabel, { color: theme.textSecondary }]} numberOfLines={1}>Image attached</Text>
            <TouchableOpacity onPress={() => setAttachedImage(null)} style={s.attachRemove}>
              <Ionicons name="close-circle" size={20} color={theme.error || '#ef4444'} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
          <View style={[s.composerShell, { backgroundColor: theme.surface }]}>
            <TouchableOpacity onPress={pickMedia} onLongPress={takePhoto} style={s.mediaBtn} activeOpacity={0.7}>
              <Ionicons name="image-outline" size={20} color={theme.primary} />
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              style={[s.textInput, { color: theme.text }]}
              placeholder="Type a message..."
              placeholderTextColor={theme.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              onFocus={handleInputFocus}
              onSubmitEditing={handleSubmit}
              returnKeyType="send"
              editable={!isProcessing}
              multiline={false}
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: inputText.trim() ? theme.primary : 'rgba(255,255,255,0.10)' }]}
              onPress={handleSubmit}
              disabled={!inputText.trim() || isProcessing}
            >
              <Ionicons name="send" size={18} color={inputText.trim() ? '#fff' : theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
    <HomeworkScanner
      visible={scannerVisible}
      onClose={() => setScannerVisible(false)}
      onScanned={handleScannerScanned}
      title="Scan Homework"
      tier={activeTier}
      remainingScans={remainingScans}
      userId={autoScanUserId}
    />
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6, gap: 8 },
  headerBtn: { padding: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },
  langBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  langBtnText: { fontSize: 12, fontWeight: '700' },
  content: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8, flexGrow: 1 },
  greeting: { fontSize: 22, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  subtitle: { fontSize: 14, marginTop: 4, marginBottom: 16, textAlign: 'center' },
  orbContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 16, minHeight: ORB_SIZE + 40 },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  processingText: { fontSize: 14 },
  responseCard: { borderRadius: 16, borderWidth: 1, padding: 16, width: '100%', maxHeight: 200, marginBottom: 12 },
  responseScroll: { maxHeight: 168 },
  responseText: { fontSize: 15, lineHeight: 22 },
  streamingDot: { position: 'absolute', bottom: 8, right: 12 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 12 },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, borderWidth: 1 },
  quickChipText: { fontSize: 14, fontWeight: '600' },
  fullChatLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  fullChatText: { fontSize: 13, fontWeight: '600' },
  attachPreview: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: 1, gap: 8 },
  attachThumb: { width: 40, height: 40, borderRadius: 8 },
  attachLabel: { flex: 1, fontSize: 13 },
  attachRemove: { padding: 4 },
  inputBar: { paddingHorizontal: 16, paddingTop: 10 },
  composerShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  mediaBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, paddingHorizontal: 6, paddingVertical: 8, fontSize: 15, backgroundColor: 'transparent' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
