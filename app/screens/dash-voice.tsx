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
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getOrganizationType } from '@/lib/tenant/compat';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { resolveDashPolicy } from '@/lib/dash-ai/DashPolicyResolver';
import { resolveAIProxyScopeFromRole } from '@/lib/ai/aiProxyScope';
import { resolveEffectiveTier } from '@/lib/tiers/resolveEffectiveTier';
import { useRealtimeTier } from '@/hooks/useRealtimeTier';
import { useSubscription } from '@/contexts/SubscriptionContext';
import HomeworkScanner from '@/components/ai/HomeworkScanner';
import { LanguageDropdown, getLanguageLabel } from '@/components/dash-orb/LanguageDropdown';
import { DashTutorWhiteboard, type WhiteboardContent } from '@/components/ai/DashTutorWhiteboard';
import { loadAutoScanBudget } from '@/lib/dash-ai/imageBudget';
import { s } from './dash-voice.styles';
import {
  DashVoiceHeader,
  DashVoiceErrorBanner,
  DashVoiceTranscriptPanel,
  DashVoiceComposer,
  DashVoiceOrbSection,
  DashVoiceFlowPreview,
  DashVoiceBottomActions,
} from '@/components/dash-voice';
import type { VoiceOrbRef } from '@/features/super-admin/voice-orb/types';
import type {
  OrbPdfArtifact,
  DashVoiceDictationProbe,
  PendingVoiceTurn,
  ConversationEntry,
} from '@/hooks/dash-voice/types';
import {
  useDashVoiceTTS,
  useDashVoiceSendMessage,
  useDashVoiceMediaPicker,
  useDashVoiceFlowMode,
  useDashVoiceHandlers,
} from '@/hooks/dash-voice';
import {
  VOICE_COMPOSER_GROW_THRESHOLD,
  VOICE_COMPOSER_COMPACT_HEIGHT,
  VOICE_COMPOSER_MAX_HEIGHT,
} from '@/hooks/dash-voice/composerUtils';
import { useDashAIQuota } from '@/hooks/dash-ai/useDashAIQuota';
import type { AIModelId } from '@/lib/ai/models';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ORB_SIZE = Math.min(SCREEN_WIDTH * 0.78, 320);

const isWeb = Platform.OS === 'web';
let VoiceOrb: React.ForwardRefExoticComponent<any> | null = null;
if (!isWeb) {
  const mod = require('@/components/super-admin/voice-orb');
  VoiceOrb = mod.VoiceOrb;
}

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
    [orgType, profile, role],
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
  const [whiteboardContent, setWhiteboardContent] = useState<WhiteboardContent | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);

  const conversationHistoryRef = useRef<ConversationEntry[]>([]);
  const conversationIdRef = useRef(`orb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const voiceOrbRef = useRef<VoiceOrbRef>(null);
  const inputRef = useRef<TextInput>(null);
  const ccScrollRef = useRef<ScrollView>(null);
  const voiceDictationProbeRef = useRef<DashVoiceDictationProbe | null>(null);
  const activeRequestRef = useRef<{ abort: () => void } | null>(null);
  const pendingVoiceTurnRef = useRef<PendingVoiceTurn | null>(null);

  const DASH_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_VOICE_TRACE === 'true';
  const STREAMING_TTS_ENABLED = process.env.EXPO_PUBLIC_DASH_VOICE_STREAMING_TTS !== 'false';

  // ── Flow Mode ─────────────────────────────────────────────────────
  const flowMode = useDashVoiceFlowMode();

  // ── AI Quota Pipeline ─────────────────────────────────────────────
  const [voiceModel, setVoiceModel] = useState<AIModelId>('claude-haiku-4-5-20251001');
  const quota = useDashAIQuota(voiceModel, setVoiceModel);

  const logDashTrace = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      if (!DASH_TRACE_ENABLED) return;
      console.log(`[DashVoiceTrace] ${event}`, payload || {});
    },
    [DASH_TRACE_ENABLED],
  );

  const activeTier = useMemo(
    () =>
      String(
        (profile as any)?.subscription_tier ||
          (profile as any)?.tier ||
          (profile as any)?.current_tier ||
          'free',
      ).toLowerCase(),
    [profile],
  );
  const { tier: subscriptionTier, capabilityTier: subscriptionCapabilityTier } = useSubscription();
  const capabilityTier = useMemo(
    () =>
      resolveEffectiveTier({
        role,
        profileTier: activeTier,
        candidates: [subscriptionTier, subscriptionCapabilityTier],
      }).capabilityTier,
    [activeTier, role, subscriptionCapabilityTier, subscriptionTier],
  );
  const { tierStatus } = useRealtimeTier();

  const refreshAutoScanBudget = useCallback(async () => {
    const budget = await loadAutoScanBudget(activeTier || 'free', autoScanUserId);
    setRemainingScans(budget.remainingCount);
  }, [activeTier, autoScanUserId]);

  useEffect(() => {
    void refreshAutoScanBudget();
  }, [refreshAutoScanBudget]);

  // ── TTS hook ──────────────────────────────────────────────────────
  const {
    isSpeaking,
    setIsSpeaking,
    isSpeakingRef,
    speechQueueRef,
    enqueueSpeech,
    cancelSpeech,
    resetStreamingSpeech,
    maybeEnqueueStreamingSpeech,
    flushStreamingSpeechFinal,
    longestCommonPrefixLen,
    streamedPrefixQueuedRef,
  } = useDashVoiceTTS({
    voiceOrbRef,
    preferredLanguage,
    orgType,
    streamingTTSEnabled: STREAMING_TTS_ENABLED,
  });

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking, isSpeakingRef]);

  // ── Greeting managed by useDashVoiceHandlers ──────────────────────

  // ── Media picker hook ─────────────────────────────────────────────
  const { pickMedia, takePhoto, handleScannerScanned } = useDashVoiceMediaPicker({
    setAttachedImage,
    setScannerVisible,
    refreshAutoScanBudget,
  });

  // ── Send message hook ─────────────────────────────────────────────
  const { sendMessage: _sendMessageRaw, persistOrbMessages } = useDashVoiceSendMessage({
    isProcessing,
    setIsProcessing,
    setLastResponse,
    setStreamingText,
    setWhiteboardContent,
    setConversationHistory,
    setLatestPdfArtifact,
    setRestartBlocked,
    setAttachedImage,
    conversationHistoryRef,
    conversationIdRef,
    activeRequestRef,
    speechQueueRef,
    streamedPrefixQueuedRef,
    attachedImage,
    role,
    orgType,
    aiScope,
    preferredLanguage,
    profile,
    user,
    dashPolicy,
    activeTier,
    autoScanUserId,
    streamingTTSEnabled: STREAMING_TTS_ENABLED,
    enqueueSpeech,
    cancelSpeech,
    maybeEnqueueStreamingSpeech,
    flushStreamingSpeechFinal,
    resetStreamingSpeech,
    longestCommonPrefixLen,
    logDashTrace,
    refreshAutoScanBudget,
    voiceOrbRef,
  });

  // Quota-gated send: blocks when user exhausts AI quota
  const sendMessage = useCallback(
    async (...args: Parameters<typeof _sendMessageRaw>) => {
      const check = await quota.checkQuotaBeforeSend();
      if (!check.allowed) return;
      return _sendMessageRaw(...args);
    },
    [_sendMessageRaw, quota],
  );

  // ── Handlers (delegated to useDashVoiceHandlers) ──────────────────
  const {
    stopDashActivity,
    handleVoiceError,
    handleVoiceInput,
    handleComposerTextChange,
    handleSubmit,
    handleInputFocus,
  } = useDashVoiceHandlers({
    profile,
    user,
    role,
    orgType,
    preferredLanguage,
    setPreferredLanguage,
    isProcessing,
    isSpeaking,
    isListening,
    inputText,
    setIsListening,
    setIsProcessing,
    setStreamingText,
    setRestartBlocked,
    setIsSpeaking,
    setVoiceErrorBanner,
    setInputText,
    setInputHeight,
    setLiveUserTranscript,
    setLastUserTranscript,
    setLastResponse,
    setConversationHistory,
    setIsGreetingLoading,
    voiceOrbRef,
    isSpeakingRef,
    activeRequestRef,
    conversationHistoryRef,
    pendingVoiceTurnRef,
    voiceDictationProbeRef,
    sendMessage,
    cancelSpeech,
    resetStreamingSpeech,
    logDashTrace,
    flowMode,
  });

  // ── Derived ───────────────────────────────────────────────────────
  const quickActions = useMemo(() => dashPolicy.quickActions, [dashPolicy.quickActions]);
  const rawDisplayed = streamingText || lastResponse;
  const displayedText =
    rawDisplayed && /^\s*data:\s*(\[DONE\])?\s*$/i.test(rawDisplayed) ? '' : rawDisplayed;
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
      ? streamingText
        ? 'Streaming...'
        : 'Thinking...'
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
          tierStatus={capabilityTier === 'enterprise' ? null : tierStatus}
          onBack={() => {
            stopDashActivity('navigation_back', true);
            router.back();
          }}
          onStop={() => stopDashActivity('header_stop_button')}
          onSearch={() => {
            stopDashActivity('open_search', true);
            router.push('/screens/app-search?scope=dash&q=dash');
          }}
          onToggleTranscript={() => setShowTranscript((v) => !v)}
          onOpenLangMenu={() => setShowLangMenu(true)}
        />

        <KeyboardAvoidingView
          style={s.content}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 50 : 0}
        >
          <ScrollView
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
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
              onStopListening={() => {
                // Only update listening state — do NOT cancel speech here.
                // This fires for mute, barge-in suspend, and other non-user-initiated
                // stops. TTS should keep playing when the mic is muted.
                setIsListening(false);
              }}
              onStartListening={() => setIsListening(true)}
              onPartialTranscript={(text) => setLiveUserTranscript(text)}
              onTranscript={handleVoiceInput}
              onVoiceError={handleVoiceError}
              onTTSStart={() => {
                setIsListening(false);
              }}
              onTTSEnd={() => {
                /* managed by useDashVoiceTTS queue */
              }}
              onLanguageChange={(lang) => setPreferredLanguage(lang)}
            />

            {voiceErrorBanner ? (
              <DashVoiceErrorBanner
                message={voiceErrorBanner}
                theme={theme}
                onDismiss={() => setVoiceErrorBanner(null)}
              />
            ) : null}

            {flowMode.enabled && flowMode.correctionFlash ? (
              <DashVoiceFlowPreview flash={flowMode.correctionFlash} theme={theme} />
            ) : null}

            {showTranscript ? (
              <DashVoiceTranscriptPanel
                liveUserTranscript={liveUserTranscript}
                lastUserTranscript={lastUserTranscript}
                displayedText={displayedText}
                isProcessing={isProcessing}
                streamingText={streamingText}
                ccScrollRef={ccScrollRef}
                onEditTranscript={(text) => {
                  setInputText(text);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              />
            ) : null}

            <DashVoiceBottomActions
              theme={theme}
              quickActions={quickActions}
              showQuickActions={
                !displayedText &&
                !isProcessing &&
                !isGreetingLoading &&
                conversationHistory.length <= 1 &&
                !conversationHistory.some((m) => m.role === 'user')
              }
              latestPdfArtifact={latestPdfArtifact}
              flowEnabled={flowMode.enabled}
              onQuickAction={(prompt) => sendMessage(prompt)}
              onOpenPdf={() =>
                router.push({
                  pathname: '/screens/pdf-viewer',
                  params: {
                    title: latestPdfArtifact?.title || 'Generated PDF',
                    url: latestPdfArtifact?.url || '',
                  },
                } as any)
              }
              onContinueFullChat={async () => {
                await persistOrbMessages(conversationHistoryRef.current);
                stopDashActivity('continue_full_chat', true);
                router.push({ pathname: '/screens/dash-assistant', params: { source: 'orb' } });
              }}
              onToggleFlowMode={() => flowMode.setEnabled(!flowMode.enabled)}
            />
          </ScrollView>

          {attachedImage && (
            <View style={[s.attachPreview, { borderTopColor: theme.border }]}>
              <Image source={{ uri: attachedImage.uri }} style={s.attachThumb} />
              <Text style={[s.attachLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                Image attached
              </Text>
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
                const nextHeight =
                  measuredHeight <= VOICE_COMPOSER_GROW_THRESHOLD
                    ? VOICE_COMPOSER_COMPACT_HEIGHT
                    : Math.min(measuredHeight, VOICE_COMPOSER_MAX_HEIGHT);
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
      {whiteboardContent && (
        <DashTutorWhiteboard
          content={whiteboardContent}
          onDismiss={() => setWhiteboardContent(null)}
        />
      )}
    </>
  );
}
