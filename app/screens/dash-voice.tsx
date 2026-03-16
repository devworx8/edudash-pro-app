/**
 * Dash Voice — Full-Screen ORB Experience
 *
 * The primary voice-first interface launched from the FAB.
 * - Voice STT/TTS with dynamic language switching (EN/AF/ZU)
 * - True SSE streaming for realtime text delivery
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
  TextInput,
  TouchableOpacity,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getOrganizationType } from '@/lib/tenant/compat';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { resolveDashPolicy } from '@/lib/dash-ai/DashPolicyResolver';
import { resolveAIProxyScopeFromRole } from '@/lib/ai/aiProxyScope';
import { shouldGreetToday, buildDynamicGreeting } from '@/lib/ai/greetingManager';
import { resolveEffectiveTier } from '@/lib/tiers/resolveEffectiveTier';
import { useRealtimeTier } from '@/hooks/useRealtimeTier';
import { useSubscription } from '@/contexts/SubscriptionContext';
import HomeworkScanner from '@/components/ai/HomeworkScanner';
import { LanguageDropdown, getLanguageLabel } from '@/components/dash-orb/LanguageDropdown';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import { DashTutorWhiteboard, type WhiteboardContent } from '@/components/ai/DashTutorWhiteboard';
import { loadAutoScanBudget } from '@/lib/dash-ai/imageBudget';
import { s } from './dash-voice.styles';
import {
  DashVoiceHeader,
  DashVoiceErrorBanner,
  DashVoiceTranscriptPanel,
  DashVoiceComposer,
  DashVoiceOrbSection,
} from '@/components/dash-voice';
import type { VoiceOrbRef } from '@/features/super-admin/voice-orb/types';
import {
  useDashVoiceTTS,
  useDashVoiceSendMessage,
  useDashVoiceMediaPicker,
} from '@/hooks/dash-voice';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ORB_SIZE = Math.min(SCREEN_WIDTH * 0.78, 320);
const VOICE_COMPOSER_COMPACT_HEIGHT = 44;
const VOICE_COMPOSER_GROW_THRESHOLD = 60;
const VOICE_COMPOSER_MAX_HEIGHT = 124;
const VOICE_COMPOSER_LINE_HEIGHT = 20;
const VOICE_COMPOSER_WEB_CHARS_PER_LINE = Math.max(22, Math.floor((SCREEN_WIDTH - 152) / 8));

const estimateWrappedLineCount = (text: string, charsPerLine: number): number =>
  String(text || '').replace(/\r/g, '').split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(Math.max(line.length, 1) / charsPerLine)), 0);

const getWebComposerHeight = (text: string): number => {
  const lineCount = estimateWrappedLineCount(text, VOICE_COMPOSER_WEB_CHARS_PER_LINE);
  if (lineCount <= 1) return VOICE_COMPOSER_COMPACT_HEIGHT;
  return Math.min(VOICE_COMPOSER_COMPACT_HEIGHT + (lineCount - 1) * VOICE_COMPOSER_LINE_HEIGHT, VOICE_COMPOSER_MAX_HEIGHT);
};

const isWeb = Platform.OS === 'web';
let VoiceOrb: React.ForwardRefExoticComponent<any> | null = null;
if (!isWeb) {
  const mod = require('@/components/super-admin/voice-orb');
  VoiceOrb = mod.VoiceOrb;
}

type OrbPdfArtifact = { url: string; title: string; filename?: string | null };
type DashVoiceDictationProbe = {
  run_id?: string; platform: 'mobile' | 'web'; source: string;
  stt_start_at?: string; first_partial_at?: string; final_transcript_at?: string; commit_at?: string;
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
    () => resolveDashPolicy({
      profile: profile || null, role, orgType,
      learnerContext: { ageBand: (profile as any)?.age_group || null, grade: (profile as any)?.grade_level || null },
    }),
    [orgType, profile, role]
  );

  // ── State ──────────────────────────────────────────────────────────
  const [lastResponse, setLastResponse] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [inputText, setInputText] = useState('');
  const [inputHeight, setInputHeight] = useState(VOICE_COMPOSER_COMPACT_HEIGHT);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [restartBlocked, setRestartBlocked] = useState(false);
  const [voiceErrorBanner, setVoiceErrorBanner] = useState<string | null>(null);
  const [preferredLanguage, setPreferredLanguage] = useState<SupportedLanguage>('en-ZA');
  const [attachedImage, setAttachedImage] = useState<{ uri: string; base64: string; source: 'scanner' | 'library' } | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [remainingScans, setRemainingScans] = useState<number | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [isGreetingLoading, setIsGreetingLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [lastUserTranscript, setLastUserTranscript] = useState('');
  const [latestPdfArtifact, setLatestPdfArtifact] = useState<OrbPdfArtifact | null>(null);
  const [whiteboardContent, setWhiteboardContent] = useState<WhiteboardContent | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const conversationHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const conversationIdRef = useRef(`orb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const voiceOrbRef = useRef<VoiceOrbRef>(null);
  const inputRef = useRef<TextInput>(null);
  const ccScrollRef = useRef<ScrollView>(null);
  const voiceDictationProbeRef = useRef<DashVoiceDictationProbe | null>(null);
  const activeRequestRef = useRef<{ abort: () => void } | null>(null);
  const pendingVoiceTurnRef = useRef<{
    text: string;
    language?: SupportedLanguage;
    dictationProbe?: DashVoiceDictationProbe;
  } | null>(null);

  const DASH_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_VOICE_TRACE === 'true';
  const STREAMING_TTS_ENABLED = process.env.EXPO_PUBLIC_DASH_VOICE_STREAMING_TTS !== 'false';

  const logDashTrace = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!DASH_TRACE_ENABLED) return;
    console.log(`[DashVoiceTrace] ${event}`, payload || {});
  }, [DASH_TRACE_ENABLED]);

  const activeTier = useMemo(
    () => String((profile as any)?.subscription_tier || (profile as any)?.tier || (profile as any)?.current_tier || 'free').toLowerCase(),
    [profile]
  );
  const { tier: subscriptionTier, capabilityTier: subscriptionCapabilityTier } = useSubscription();
  const capabilityTier = useMemo(
    () => resolveEffectiveTier({
      role,
      profileTier: activeTier,
      candidates: [subscriptionTier, subscriptionCapabilityTier],
    }).capabilityTier,
    [activeTier, role, subscriptionCapabilityTier, subscriptionTier]
  );
  const { tierStatus } = useRealtimeTier();

  const refreshAutoScanBudget = useCallback(async () => {
    const budget = await loadAutoScanBudget(activeTier || 'free', autoScanUserId);
    setRemainingScans(budget.remainingCount);
  }, [activeTier, autoScanUserId]);

  useEffect(() => { void refreshAutoScanBudget(); }, [refreshAutoScanBudget]);

  // ── TTS hook ──────────────────────────────────────────────────────
  const {
    isSpeaking, setIsSpeaking, isSpeakingRef, speechQueueRef,
    enqueueSpeech, resetStreamingSpeech, maybeEnqueueStreamingSpeech,
    flushStreamingSpeechFinal, longestCommonPrefixLen, streamedPrefixQueuedRef,
  } = useDashVoiceTTS({ voiceOrbRef, preferredLanguage, orgType, streamingTTSEnabled: STREAMING_TTS_ENABLED });

  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking, isSpeakingRef]);

  // ── Greeting ──────────────────────────────────────────────────────
  const hasGreetedRef = useRef(false);
  useEffect(() => {
    if (hasGreetedRef.current || conversationHistoryRef.current.length > 0) return;
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

  // ── Media picker hook ─────────────────────────────────────────────
  const { pickMedia, takePhoto, handleScannerScanned } = useDashVoiceMediaPicker({
    setAttachedImage, setScannerVisible, refreshAutoScanBudget,
  });

  // ── Send message hook ─────────────────────────────────────────────
  const { sendMessage, persistOrbMessages } = useDashVoiceSendMessage({
    isProcessing, setIsProcessing, setLastResponse, setStreamingText,
    setWhiteboardContent, setConversationHistory, setLatestPdfArtifact,
    setRestartBlocked, setAttachedImage,
    conversationHistoryRef, conversationIdRef, activeRequestRef,
    speechQueueRef, streamedPrefixQueuedRef,
    attachedImage, role, orgType, aiScope, preferredLanguage, profile, user,
    dashPolicy, activeTier, autoScanUserId,
    streamingTTSEnabled: STREAMING_TTS_ENABLED,
    enqueueSpeech, maybeEnqueueStreamingSpeech, flushStreamingSpeechFinal, resetStreamingSpeech,
    longestCommonPrefixLen, logDashTrace, refreshAutoScanBudget, voiceOrbRef,
  });

  // ── Stop Dash activity ────────────────────────────────────────────
  const stopDashActivity = useCallback((reason = 'manual_stop', blockRestart = false) => {
    logDashTrace('dash_stop', { reason, blockRestart });
    if (blockRestart) setRestartBlocked(true);
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
  }, [logDashTrace, resetStreamingSpeech, isSpeakingRef, setIsSpeaking, speechQueueRef]);

  useFocusEffect(useCallback(() => {
    setRestartBlocked(false);
    return () => { stopDashActivity('navigation_blur', true); };
  }, [stopDashActivity]));

  useEffect(() => () => { activeRequestRef.current?.abort(); stopDashActivity('unmount', true); }, [stopDashActivity]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleVoiceError = useCallback((message: string) => {
    const n = String(message || '').toLowerCase();
    if (!n) return;
    if (n.includes('network_retrying')) return setVoiceErrorBanner('I lost connection for a moment. Retrying listening now...');
    if (n.includes('phonics') && n.includes('cloud tts')) return setVoiceErrorBanner('Phonics voice needs Azure cloud TTS. It is currently unavailable, so letter sounds may fail.');
    if (n.includes('service_unconfigured') || n.includes('502')) return setVoiceErrorBanner('Azure voice is unavailable right now. Check tts-proxy Azure secrets/config.');
    if (n.includes('voice service unavailable') || n.includes('500') || n.includes('503')) return setVoiceErrorBanner('Voice service is temporarily unavailable. Please try again.');
    if (n.includes('not authenticated') || n.includes('401') || n.includes('403')) return setVoiceErrorBanner('Session expired. Please sign in again.');
    if (n.includes('not available') || n.includes('permission denied')) return setVoiceErrorBanner('Microphone or voice recognition not available on this device.');
    // Only classify as network issue for actual connectivity failures
    if (n.includes('network request failed') || n.includes('err_internet') || n.includes('no internet')) return setVoiceErrorBanner('Voice recognition needs a stable connection. Check internet and try again.');
    if (n.includes('timeout')) return setVoiceErrorBanner('Voice request timed out. This usually resolves itself — please try again.');
    setVoiceErrorBanner('Voice encountered an error. Please try again.');
  }, []);

  const handleVoiceInput = useCallback((transcript: string, language?: SupportedLanguage) => {
    const nextLanguage = language || preferredLanguage;
    const formatted = formatTranscript(transcript, language, { whisperFlow: true, summarize: false, preschoolMode: orgType === 'preschool', maxSummaryWords: orgType === 'preschool' ? 16 : 20 });
    logDashTrace('voice_input_received', { language: nextLanguage, rawChars: String(transcript || '').length, cleanChars: formatted.trim().length, rawPreview: String(transcript || '').slice(0, 120), cleanPreview: formatted.trim().slice(0, 120) });
    if (language) setPreferredLanguage(language);
    const cleaned = formatted.trim();
    if (!cleaned) return;
    const nowIso = new Date().toISOString();
    const benchmarkRunId = String(process.env.EXPO_PUBLIC_VOICE_BENCHMARK_RUN_ID || '').trim();
    const dictationProbe: DashVoiceDictationProbe = {
      ...(voiceDictationProbeRef.current || { platform: 'mobile', source: 'dash_voice_orb' }),
      platform: 'mobile', source: 'dash_voice_orb',
      final_transcript_at: voiceDictationProbeRef.current?.final_transcript_at || nowIso,
      commit_at: nowIso,
      ...(benchmarkRunId ? { run_id: benchmarkRunId } : {}),
    };
    voiceDictationProbeRef.current = null;
    setLiveUserTranscript('');
    setLastUserTranscript(cleaned);
    if (isProcessing) {
      pendingVoiceTurnRef.current = {
        text: cleaned,
        language: nextLanguage,
        dictationProbe,
      };
      logDashTrace('voice_input_queued', {
        reason: 'processing',
        language: nextLanguage,
        preview: cleaned.slice(0, 120),
      });
      return;
    }
    sendMessage(cleaned, { dictationProbe });
  }, [isProcessing, logDashTrace, orgType, preferredLanguage, sendMessage]);

  useEffect(() => {
    if (isProcessing) return;
    const pendingTurn = pendingVoiceTurnRef.current;
    if (!pendingTurn) return;
    pendingVoiceTurnRef.current = null;
    if (pendingTurn.language && pendingTurn.language !== preferredLanguage) {
      setPreferredLanguage(pendingTurn.language);
    }
    if (isSpeakingRef.current || isSpeaking) {
      speechQueueRef.current = [];
      resetStreamingSpeech();
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
      logDashTrace('dash_stop', { reason: 'flush_pending_voice_turn' });
    }
    logDashTrace('voice_input_flushed', {
      language: pendingTurn.language || preferredLanguage,
      preview: pendingTurn.text.slice(0, 120),
    });
    sendMessage(
      pendingTurn.text,
      pendingTurn.dictationProbe ? { dictationProbe: pendingTurn.dictationProbe } : undefined,
    );
  }, [
    isProcessing,
    isSpeaking,
    isSpeakingRef,
    logDashTrace,
    preferredLanguage,
    resetStreamingSpeech,
    sendMessage,
    setIsSpeaking,
    speechQueueRef,
  ]);

  const handleComposerTextChange = useCallback((text: string) => {
    setInputText(text);
    if (!text.trim()) { setInputHeight(VOICE_COMPOSER_COMPACT_HEIGHT); return; }
    if (Platform.OS === 'web') setInputHeight(getWebComposerHeight(text));
  }, []);

  const handleSubmit = useCallback(() => {
    if (inputText.trim()) { sendMessage(inputText); setInputText(''); setInputHeight(VOICE_COMPOSER_COMPACT_HEIGHT); }
  }, [inputText, sendMessage]);

  const handleInputFocus = useCallback(() => {
    if (isSpeakingRef.current || isSpeaking) { voiceOrbRef.current?.stopSpeaking?.().catch(() => {}); logDashTrace('dash_stop', { reason: 'input_focus_stop_speaking' }); }
    if (isListening) { voiceOrbRef.current?.stopListening?.().catch(() => {}); setIsListening(false); logDashTrace('dash_stop', { reason: 'input_focus_stop_listening' }); }
  }, [isListening, isSpeaking, isSpeakingRef, logDashTrace]);

  // ── Derived ───────────────────────────────────────────────────────
  const quickActions = useMemo(() => dashPolicy.quickActions, [dashPolicy.quickActions]);
  const rawDisplayed = streamingText || lastResponse;
  const displayedText = rawDisplayed && /^\s*data:\s*(\[DONE\])?\s*$/i.test(rawDisplayed) ? '' : rawDisplayed;
  const langLabel = useMemo(() => getLanguageLabel(preferredLanguage), [preferredLanguage]);
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = profile?.first_name || profile?.full_name?.split(' ')[0] || '';
    const tg = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${tg}, ${name}` : tg;
  }, [profile]);
  const statusLabel = isVoiceMuted
    ? 'Listening muted'
    : isProcessing
      ? (streamingText ? 'Streaming...' : 'Thinking...')
      : isSpeaking
        ? 'Speaking...'
        : 'Always listening';
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
            await persistOrbMessages(conversationHistoryRef.current);
            stopDashActivity('open_full_chat', true);
            router.push({ pathname: '/screens/dash-assistant', params: { source: 'orb' } });
          }}
          theme={theme}
        />

        <DashVoiceHeader
          paddingTop={insets.top + 4}
          theme={theme}
          statusLabel={statusLabel}
          langLabel={langLabel}
          showTranscript={showTranscript}
          isSpeaking={isSpeaking}
          isProcessing={isProcessing}
          tierStatus={tierStatus}
          onBack={() => { stopDashActivity('navigation_back', true); router.back(); }}
          onStop={() => stopDashActivity('header_stop_button')}
          onSearch={() => { stopDashActivity('open_search', true); router.push('/screens/app-search?scope=dash&q=dash'); }}
          onToggleTranscript={() => setShowTranscript((v) => !v)}
          onOpenLangMenu={() => setShowLangMenu(true)}
        />

        <KeyboardAvoidingView style={s.content} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 50 : 0}>
          <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[s.greeting, { color: theme.text }]}>{greeting}</Text>
            <Text style={[s.subtitle, { color: theme.textSecondary }]}>Your AI assistant</Text>

            <DashVoiceOrbSection
              VoiceOrb={VoiceOrb}
              voiceOrbRef={voiceOrbRef}
              voiceDictationProbeRef={voiceDictationProbeRef}
              isListening={isListening}
              isSpeaking={isSpeaking}
              isProcessing={isProcessing}
              streamingText={streamingText}
              restartBlocked={restartBlocked}
              orbRenderSize={orbRenderSize}
              showTranscript={showTranscript}
              orgType={orgType}
              preferredLanguage={preferredLanguage}
              theme={theme}
              orbTier={capabilityTier}
              isMuted={isVoiceMuted}
              onMuteChange={setIsVoiceMuted}
              onStopListening={() => setIsListening(false)}
              onStartListening={() => setIsListening(true)}
              onPartialTranscript={(text) => setLiveUserTranscript(text)}
              onTranscript={handleVoiceInput}
              onVoiceError={handleVoiceError}
              onTTSStart={() => setIsSpeaking(true)}
              onTTSEnd={() => setIsSpeaking(false)}
              onLanguageChange={(lang) => setPreferredLanguage(lang)}
            />

            {voiceErrorBanner ? (
              <DashVoiceErrorBanner message={voiceErrorBanner} theme={theme} onDismiss={() => setVoiceErrorBanner(null)} />
            ) : null}

            {showTranscript ? (
              <DashVoiceTranscriptPanel
                liveUserTranscript={liveUserTranscript}
                lastUserTranscript={lastUserTranscript}
                displayedText={displayedText}
                isProcessing={isProcessing}
                streamingText={streamingText}
                ccScrollRef={ccScrollRef}
                onEditTranscript={(text) => { setInputText(text); requestAnimationFrame(() => inputRef.current?.focus()); }}
              />
            ) : null}

            {!displayedText && !isProcessing && !isGreetingLoading && conversationHistory.length <= 1 && !conversationHistory.some(m => m.role === 'user') && (
              <View style={s.quickActions}>
                {quickActions.map((action) => (
                  <TouchableOpacity key={action.id} style={[s.quickChip, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={() => sendMessage(action.prompt)} activeOpacity={0.7}>
                    <Ionicons name={action.icon as any} size={18} color={theme.primary} />
                    <Text style={[s.quickChipText, { color: theme.text }]}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {latestPdfArtifact?.url && (
              <TouchableOpacity
                style={[s.fullChatLink, { borderColor: theme.primary + '44', borderWidth: 1, backgroundColor: theme.primary + '12' }]}
                onPress={() => router.push({ pathname: '/screens/pdf-viewer', params: { title: latestPdfArtifact!.title || 'Generated PDF', url: latestPdfArtifact!.url } } as any)}
                activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Open latest generated PDF"
              >
                <Ionicons name="document-text-outline" size={16} color={theme.primary} />
                <Text style={[s.fullChatText, { color: theme.primary }]}>Open latest PDF</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={s.fullChatLink} onPress={async () => {
              await persistOrbMessages(conversationHistoryRef.current);
              stopDashActivity('continue_full_chat', true);
              router.push({ pathname: '/screens/dash-assistant', params: { source: 'orb' } });
            }}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.primary} />
              <Text style={[s.fullChatText, { color: theme.primary }]}>Continue in full Dash chat</Text>
            </TouchableOpacity>
          </ScrollView>

          {attachedImage && (
            <View style={[s.attachPreview, { borderTopColor: theme.border }]}>
              <Image source={{ uri: attachedImage.uri }} style={s.attachThumb} />
              <Text style={[s.attachLabel, { color: theme.textSecondary }]} numberOfLines={1}>Image attached</Text>
              <TouchableOpacity onPress={() => setAttachedImage(null)} style={s.attachRemove}>
                <Ionicons name="close-circle" size={20} color={theme.error || '#ef4444'} />
              </TouchableOpacity>
            </View>
          )}

          <DashVoiceComposer
            theme={theme}
            inputText={inputText}
            inputHeight={inputHeight}
            isProcessing={isProcessing}
            paddingBottom={Math.max(insets.bottom, 10) + 6}
            inputRef={inputRef}
            onChangeText={handleComposerTextChange}
            onContentSizeChange={(e) => {
              const height = e?.nativeEvent?.contentSize?.height;
              if (height == null) return;
              setInputHeight((prev) => {
                const measuredHeight = height + 16;
                const nextHeight = measuredHeight <= VOICE_COMPOSER_GROW_THRESHOLD
                  ? VOICE_COMPOSER_COMPACT_HEIGHT : Math.min(measuredHeight, VOICE_COMPOSER_MAX_HEIGHT);
                return prev === nextHeight ? prev : nextHeight;
              });
            }}
            onFocus={handleInputFocus}
            onSubmit={handleSubmit}
            onPickMedia={pickMedia}
            onTakePhoto={takePhoto}
          />
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
      {whiteboardContent && <DashTutorWhiteboard content={whiteboardContent} onDismiss={() => setWhiteboardContent(null)} />}
    </>
  );
}
