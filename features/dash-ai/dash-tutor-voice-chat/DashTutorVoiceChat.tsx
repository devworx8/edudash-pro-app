/**
 * DashTutorVoiceChat — Voice-first AI tutor chat
 *
 * Refactored per WARP.md: logic split into helper modules,
 * styles in DashTutorVoiceChat.styles.ts,
 * AI fetch in dashTutorAIService.ts,
 * PhonicsPracticeCard extracted.
 */

/* eslint-disable i18next/no-literal-string */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Platform, Animated, Dimensions,
  KeyboardAvoidingView, TextInput, ScrollView, Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { CosmicOrb } from '@/components/dash-orb/CosmicOrb';
import { NebulaSphereOrb } from '@/components/dash-orb/NebulaSphereOrb';
import { PremiumCosmicOrb } from '@/components/dash-orb/PremiumCosmicOrb';
import { assertSupabase } from '@/lib/supabase';
import { getWelcomeMessage } from '@/lib/ai/constants';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import { useWebTTS } from '@/lib/voice/useWebTTS';
import { getOrganizationType } from '@/lib/tenant/compat';
import { assessPhonicsAttempt } from '@/lib/dash-ai/phonicsAssessmentClient';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { classifyFullChatIntent } from '@/lib/dash-ai/fullChatIntent';
import { trackTutorFullChatHandoff, trackTutorPhonicsContractApplied } from '@/lib/ai/trackingEvents';
import { resolveAIProxyScopeFromRole } from '@/lib/ai/aiProxyScope';
import { detectPhonicsIntent, shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { styles } from '@/components/super-admin/dash-ai-chat/DashAIChat.styles';
import { ChatMessage, ChatMessageData } from '@/components/super-admin/dash-ai-chat/ChatMessage';
import { DashTutorWhiteboard, type WhiteboardContent } from '@/components/ai/DashTutorWhiteboard';
import { ChatInput } from '@/components/super-admin/dash-ai-chat/ChatInput';
import { cleanForTTS, splitForTTS, TTS_CHUNK_MAX_LEN } from '@/lib/dash-voice-utils';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';
import { SUPPORTED_LANGUAGES } from '@/components/super-admin/voice-orb/useVoiceSTT';
import type { VoiceTranscriptMeta } from '@/components/super-admin/voice-orb';
import { resolveEffectiveTier } from '@/lib/tiers/resolveEffectiveTier';

import {
  PHONICS_TARGET_STALE_MS, CHAT_HISTORY_KEY, MAX_STORED_MESSAGES,
  extractPhonicsTarget, extractOrbCardContent, type PendingPhonicsTarget,
} from './phonicsUtils';
import { buildTutorContext } from './buildTutorContext';
import { orbStyles } from './DashTutorVoiceChat.styles';
import { PhonicsPracticeCard } from './PhonicsPracticeCard';
import { regularAI, streamAI, stripWhiteboardFromDisplay } from './dashTutorAIService';

// ── Platform VoiceOrb ─────────────────────────────────────────────────────────

const isWeb = Platform.OS === 'web';
let VoiceOrb: React.ForwardRefExoticComponent<any> | null = null;
if (!isWeb) {
  const m = require('@/components/super-admin/voice-orb');
  VoiceOrb = m.VoiceOrb;
}

type VoiceOrbRefType = {
  speakText: (text: string, language?: SupportedLanguage, options?: { phonicsMode?: boolean }) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  isSpeaking: boolean;
};

const findLanguageName = (code: SupportedLanguage | null) =>
  code ? (SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name ?? code) : null;

const ORB_SIZE = Math.min(Dimensions.get('window').width * 0.68, 300);

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashTutorVoiceChat() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const {
    tier: subscriptionTier,
    capabilityTier: subscriptionCapabilityTier,
  } = useSubscription();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const normalizedRole = String(profile?.role || 'parent').toLowerCase();
  const isStudent = ['student', 'learner'].includes(normalizedRole);
  const effectiveCapabilityTier = useMemo(
    () => resolveEffectiveTier({
      role: normalizedRole,
      profileTier: String((profile as any)?.subscription_tier || '').trim() || null,
      candidates: [subscriptionTier, subscriptionCapabilityTier],
    }).capabilityTier,
    [normalizedRole, profile, subscriptionCapabilityTier, subscriptionTier]
  );
  // Tier-based orb: students always get at least starter orb UI
  const effectiveOrbTier = isStudent && effectiveCapabilityTier === 'free'
    ? 'starter'
    : effectiveCapabilityTier;
  // Check if user should see premium orb (premium, pro, or enterprise)
  const isPremiumOrb = ['premium', 'enterprise'].includes(effectiveOrbTier);
  const isEnhancedOrb = effectiveOrbTier !== 'free';
  const aiScope = useMemo(() => resolveAIProxyScopeFromRole(normalizedRole), [normalizedRole]);
  const orgType = getOrganizationType(profile);

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<SupportedLanguage | null>(null);
  const [voiceErrorBanner, setVoiceErrorBanner] = useState<string | null>(null);
  const [whiteboardContent, setWhiteboardContent] = useState<WhiteboardContent | null>(null);
  const [phonicsPracticeTarget, setPhonicsPracticeTarget] = useState<PendingPhonicsTarget | null>(null);
  const [phonicsPracticeResult, setPhonicsPracticeResult] = useState<{ accuracy: number; encouragement: string } | null>(null);
  const practiceGlowAnim = useRef(new Animated.Value(0)).current;

  const listRef = useRef<FlashListRef<ChatMessageData>>(null);
  const voiceOrbRef = useRef<VoiceOrbRefType>(null);
  const webTTS = useWebTTS();
  const isVoiceModeRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const speechQueueRef = useRef<string[]>([]);
  const ttsSessionRef = useRef<string | null>(null);
  const phonicsTargetRef = useRef<PendingPhonicsTarget | null>(null);
  const lastLowAccuracyPhonemeRef = useRef<{ targetPhoneme: string; updatedAt: number } | null>(null);

  const welcomeMessage: ChatMessageData = useMemo(() => ({
    id: 'welcome', role: 'assistant', content: getWelcomeMessage(normalizedRole), timestamp: new Date(),
  }), [normalizedRole]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => { isVoiceModeRef.current = isVoiceMode; }, [isVoiceMode]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  useEffect(() => {
    if (!phonicsPracticeTarget) return;
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(practiceGlowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(practiceGlowAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [phonicsPracticeTarget, practiceGlowAnim]);

  const languageLabel = useMemo(() => findLanguageName(preferredLanguage), [preferredLanguage]);

  // ── History ───────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(CHAT_HISTORY_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = (JSON.parse(stored) as ChatMessageData[]).map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
          setMessages(parsed.length > 0 ? parsed : [welcomeMessage]);
        } else setMessages([welcomeMessage]);
      })
      .catch(() => setMessages([welcomeMessage]))
      .finally(() => setIsLoaded(true));
  }, [welcomeMessage]);

  useEffect(() => {
    if (!isLoaded || messages.length === 0) return;
    AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES))).catch(() => {});
  }, [messages, isLoaded]);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 999999, animated: false }), animated ? 300 : 0);
    }), 50);
  }, []);

  useEffect(() => { scrollToBottom(true); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!isVoiceMode) {
      speechQueueRef.current = []; ttsSessionRef.current = null; isSpeakingRef.current = false;
      setIsSpeaking(false); voiceOrbRef.current?.stopSpeaking?.().catch(() => {});
    }
  }, [isVoiceMode]);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speakResponse = useCallback(async (text: string) => {
    if (!isVoiceModeRef.current) return;
    const ttsTarget = voiceOrbRef.current ?? (isWeb ? webTTS : null);
    if (!ttsTarget) return;
    const cleanText = cleanForTTS(text);
    if (!cleanText) return;
    const chunks = splitForTTS(cleanText, TTS_CHUNK_MAX_LEN);
    if (chunks.length === 0) return;
    const sessionId = `dtvc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    ttsSessionRef.current = sessionId;
    try {
      setIsSpeaking(true); isSpeakingRef.current = true;
      const phonicsMode = Boolean(phonicsTargetRef.current) || shouldUsePhonicsMode(cleanText);
      const lang = preferredLanguage || 'en-ZA';
      for (let i = 0; i < chunks.length; i++) {
        if (ttsSessionRef.current !== sessionId || !isSpeakingRef.current) break;
        await ttsTarget.speakText(chunks[i], lang, { phonicsMode });
      }
    } catch (e) { console.error('[DashTutorVoiceChat] TTS error:', e); }
    finally {
      if (ttsSessionRef.current === sessionId) ttsSessionRef.current = null;
      isSpeakingRef.current = false; setIsSpeaking(false);
    }
  }, [preferredLanguage, webTTS]);

  const processSpeechQueue = useCallback(async () => {
    if (!isVoiceModeRef.current || isSpeakingRef.current) return;
    const next = speechQueueRef.current.shift();
    if (!next) return;
    await speakResponse(next);
    if (speechQueueRef.current.length > 0) processSpeechQueue();
  }, [speakResponse]);

  const enqueueSpeech = useCallback((text: string) => {
    const clean = cleanForTTS(text); if (!clean) return;
    speechQueueRef.current.push(clean); processSpeechQueue();
  }, [processSpeechQueue]);

  // ── Phonics ───────────────────────────────────────────────────────────────
  const updatePhonicsTarget = useCallback((assistantText: string) => {
    const extracted = extractPhonicsTarget(assistantText, 'assistant');
    if (extracted) { phonicsTargetRef.current = extracted; setPhonicsPracticeTarget(extracted); setPhonicsPracticeResult(null); }
  }, []);

  const submitPhonicsAssessment = useCallback(async (transcript: string, language?: SupportedLanguage, meta?: VoiceTranscriptMeta) => {
    if (!meta?.audioBase64) return;
    const normalized = String(transcript || '').trim();
    const active = phonicsTargetRef.current;
    const fresh = !!active && (Date.now() - active.updatedAt) < PHONICS_TARGET_STALE_MS;
    const learnerTarget = normalized ? extractPhonicsTarget(normalized, 'learner') : null;
    if (!learnerTarget && !fresh) return;
    const resolved = fresh ? active : learnerTarget;
    const refText = resolved?.referenceText || normalized || resolved?.targetPhoneme || '';
    if (!refText) return;
    try {
      const result = await assessPhonicsAttempt({ referenceText: refText, targetPhoneme: resolved?.targetPhoneme || null, targetLanguage: language || preferredLanguage || 'en-ZA', audioBase64: meta.audioBase64, audioContentType: meta.audioContentType });
      if (result?.assessment) {
        const accuracy = result.assessment.target_phoneme_accuracy ?? result.assessment.accuracy_score ?? 0;
        const phoneme = result.assessment.target_phoneme || resolved?.targetPhoneme;
        const score = Math.round(accuracy);
        const encouragement = score >= 80 ? 'Great job! 🌟' : score >= 60 ? 'Good try! Keep going!' : "Try again — you've got this!";
        setPhonicsPracticeResult({ accuracy: score, encouragement });
        if (accuracy < 60 && phoneme) lastLowAccuracyPhonemeRef.current = { targetPhoneme: phoneme, updatedAt: Date.now() };
      }
    } catch (e) { console.warn('[DashTutorVoiceChat] Phonics assessment failed:', e); }
  }, [preferredLanguage]);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const clearChat = useCallback(async () => {
    try { await AsyncStorage.removeItem(CHAT_HISTORY_KEY); setMessages([welcomeMessage]); }
    catch (e) { console.error('[DashTutorVoiceChat] Failed to clear chat history:', e); }
  }, [welcomeMessage]);

  const mapVoiceErrorToBanner = useCallback((msg: string): string => {
    const n = String(msg || '').toLowerCase();
    if (!n) return 'Voice recognition failed. Tap the mic and try again.';
    if (n.includes('not authenticated') || n.includes('token')) return 'Voice recognition needs an active login. Please sign in again.';
    if (n.includes('permission')) return 'Microphone permission is required. Enable mic access and try again.';
    if (n.includes('network') || n.includes('fetch') || n.includes('timeout')) return 'Voice recognition needs a stable internet connection.';
    return 'Voice recognition failed. Please try again or use text input.';
  }, []);

  const handleVoiceRecognitionError = useCallback((errorMessage: string) => {
    setVoiceErrorBanner(mapVoiceErrorToBanner(errorMessage));
  }, [mapVoiceErrorToBanner]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isProcessing) return;
    const trimmed = text.trim();
    const flags = getFeatureFlagsSync();
    const handoffIntent = flags.dash_tutor_auto_handoff_v1 ? classifyFullChatIntent(trimmed) : null;
    if (handoffIntent) {
      trackTutorFullChatHandoff({ intent: handoffIntent, source: 'dash_tutor_voice_chat', role: normalizedRole });
      router.push({ pathname: '/screens/dash-assistant', params: { source: 'dash_tutor_voice_chat', initialMessage: trimmed, resumePrompt: trimmed, mode: handoffIntent === 'quiz' ? 'tutor' : 'advisor', handoffIntent } } as any);
      return;
    }
    if (flags.dash_tutor_phonics_strict_v1 && detectPhonicsIntent(trimmed)) {
      trackTutorPhonicsContractApplied({ source: 'dash_tutor_voice_chat', role: normalizedRole });
    }
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: trimmed, timestamp: new Date() }]);
    setInputText('');
    setIsProcessing(true);
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '⏳ Thinking...', timestamp: new Date(), isStreaming: true }]);
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-8);
    try {
      const supabase = assertSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in to continue');
      const payloadBase = {
        scope: aiScope, service_type: 'dash_conversation',
        payload: {
          messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: trimmed }],
          context: buildTutorContext(profile, preferredLanguage, lastLowAccuracyPhonemeRef.current),
        },
        enable_tools: true,
        metadata: { role: normalizedRole, source: 'dash_voice_orb', org_type: orgType, language: preferredLanguage || undefined },
      };
      const cbs = {
        setMessages, setWhiteboardContent, updatePhonicsTarget,
        clearLowAccuracy: () => { lastLowAccuracyPhonemeRef.current = null; },
        enqueueSpeech, isVoiceModeRef,
      };
      if (isVoiceModeRef.current) await streamAI(payloadBase, session.access_token, assistantId, cbs);
      else await regularAI(payloadBase, session.access_token, assistantId, cbs);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Something went wrong';
      const friendly = msg.includes('log in')
        ? '❌ Please log in to continue chatting with Dash.'
        : msg.includes('network') || msg.includes('fetch')
          ? '❌ Connection issue. Please check your internet and try again.'
          : `❌ Oops! ${msg}\n\nPlease try asking again.`;
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: friendly, isStreaming: false } : m));
    } finally { setIsProcessing(false); }
  }, [
    aiScope,
    enqueueSpeech,
    isProcessing,
    messages,
    normalizedRole,
    orgType,
    preferredLanguage,
    profile,
    updatePhonicsTarget,
  ]);

  const handleVoiceInput = useCallback((transcript: string, language?: SupportedLanguage, meta?: VoiceTranscriptMeta) => {
    const formatted = formatTranscript(transcript, language, { whisperFlow: true, summarize: true, preschoolMode: orgType === 'preschool', maxSummaryWords: orgType === 'preschool' ? 16 : 20 });
    if (language) setPreferredLanguage(language);
    if (voiceErrorBanner) setVoiceErrorBanner(null);
    const hasFreshTarget = !!phonicsTargetRef.current && (Date.now() - phonicsTargetRef.current.updatedAt) < PHONICS_TARGET_STALE_MS;
    if (meta?.audioBase64 && hasFreshTarget) void submitPhonicsAssessment(formatted, language, meta);
    if (formatted.trim()) {
      if (!meta?.audioBase64 || !hasFreshTarget) void submitPhonicsAssessment(formatted, language, meta);
      sendMessage(formatted);
    }
  }, [sendMessage, submitPhonicsAssessment, voiceErrorBanner, orgType]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const statusLabel = isProcessing ? 'Thinking...' : isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready';
  const statusDotColor = isProcessing ? '#f59e0b' : isListening ? '#22d3ee' : isSpeaking ? '#a78bfa' : '#22c55e';
  const latestMsg = useMemo(() => { const all = messages.filter(m => m.role === 'assistant'); return all[all.length - 1] ?? null; }, [messages]);
  const orbCardContent = useMemo(() => latestMsg ? extractOrbCardContent(stripWhiteboardFromDisplay(latestMsg.content)) : null, [latestMsg]);

  const voiceOrbSharedProps = {
    ref: voiceOrbRef, isListening, isSpeaking, isParentProcessing: isProcessing,
    onStartListening: () => setIsListening(true), onStopListening: () => setIsListening(false),
    onTranscript: handleVoiceInput, onVoiceError: handleVoiceRecognitionError,
    autoStartListening: true, autoRestartAfterTTS: true,
  };

  const phonicsCardProps = {
    target: phonicsPracticeTarget!, result: phonicsPracticeResult, glowAnim: practiceGlowAnim,
    onDismiss: () => { setPhonicsPracticeTarget(null); setPhonicsPracticeResult(null); },
  };

  // ── Enhanced Orb UI (starter/premium/enterprise) ──────────────────────────
  if (isEnhancedOrb) {
    // PremiumCosmicOrb for premium/pro/enterprise tiers with enhanced visual styling
    const OrbVisual = isPremiumOrb
      ? PremiumCosmicOrb 
      : effectiveOrbTier === 'starter' 
        ? NebulaSphereOrb 
        : CosmicOrb;
    return (
      <View style={[orbStyles.safeArea, { paddingTop: insets.top }]}>
        {!isWeb && VoiceOrb && <View style={orbStyles.hiddenOrb}><VoiceOrb {...voiceOrbSharedProps} size={100} /></View>}
        <View style={orbStyles.header}>
          <TouchableOpacity onPress={() => router.back()} style={orbStyles.headerBtn}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={orbStyles.headerTitleRow}>
            <Text style={orbStyles.headerTitle}>Dash AI</Text>
            <View style={[orbStyles.statusDot, { backgroundColor: statusDotColor }]} />
          </View>
          <TouchableOpacity onPress={clearChat} style={orbStyles.headerBtn}>
            <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        </View>
        {whiteboardContent && <DashTutorWhiteboard content={whiteboardContent} onDismiss={() => setWhiteboardContent(null)} />}
        <View style={orbStyles.body}>
          <View style={orbStyles.orbSection}>
            <OrbVisual size={ORB_SIZE} isProcessing={isProcessing} isSpeaking={isSpeaking} />
            <Text style={orbStyles.statusLabel}>{languageLabel ? `${statusLabel} · ${languageLabel}` : statusLabel}</Text>
          </View>
          <ScrollView style={orbStyles.cardScroll} contentContainerStyle={orbStyles.cardScrollContent} showsVerticalScrollIndicator={false}>
            <View style={orbStyles.responseCard}>
              {orbCardContent?.title && <Text style={orbStyles.cardTitle}>{orbCardContent.title}</Text>}
              <Text style={orbCardContent ? orbStyles.cardBody : orbStyles.cardHint}>
                {orbCardContent?.body ?? 'Ask me anything — tap the mic or type below'}
              </Text>
            </View>
            {phonicsPracticeTarget && <PhonicsPracticeCard {...phonicsCardProps} dark />}
          </ScrollView>
          {voiceErrorBanner && (
            <View style={orbStyles.errorBanner}>
              <Ionicons name="warning-outline" size={15} color="#fbbf24" />
              <Text style={orbStyles.errorText}>{voiceErrorBanner}</Text>
              <TouchableOpacity onPress={() => setVoiceErrorBanner(null)}><Ionicons name="close" size={14} color="#fbbf24" /></TouchableOpacity>
            </View>
          )}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[orbStyles.inputRow, !keyboardVisible && { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TextInput
              style={orbStyles.textInput} placeholder="Ask me anything..." placeholderTextColor="rgba(255,255,255,0.35)"
              value={inputText} onChangeText={setInputText} onSubmitEditing={() => sendMessage(inputText)}
              returnKeyType="send" editable={!isProcessing} multiline={false}
            />
            <TouchableOpacity
              style={[orbStyles.sendBtn, { opacity: inputText.trim() && !isProcessing ? 1 : 0.4 }]}
              onPress={() => sendMessage(inputText)} disabled={!inputText.trim() || isProcessing}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Standard UI ───────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={clearChat} style={styles.headerButton}>
          <Ionicons name="refresh" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.headerIcon, { backgroundColor: theme.primary }]}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Voice Chat</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {languageLabel ? `${statusLabel} • ${languageLabel}` : statusLabel}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={() => setIsVoiceMode((p) => !p)}>
          <Ionicons name={isVoiceMode ? 'mic' : 'chatbubbles-outline'} size={22} color={isVoiceMode ? theme.primary : theme.textSecondary} />
        </TouchableOpacity>
      </View>
      {whiteboardContent && <DashTutorWhiteboard content={whiteboardContent} onDismiss={() => setWhiteboardContent(null)} />}
      <FlashList
        ref={listRef} data={messages} keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatMessage message={{ ...item, content: item.role === 'assistant' ? stripWhiteboardFromDisplay(item.content) : item.content }} />
        )}
        style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollToBottom(true)} ListFooterComponent={<View style={{ height: 20 }} />}
      />
      {voiceErrorBanner && (
        <View style={[styles.voiceErrorBanner, { backgroundColor: theme.error + '20', borderColor: theme.error + '55' }]}>
          <Ionicons name="warning-outline" size={16} color={theme.error} />
          <Text style={[styles.voiceErrorText, { color: theme.error }]}>{voiceErrorBanner}</Text>
          <TouchableOpacity onPress={() => setVoiceErrorBanner(null)} style={styles.voiceErrorDismiss}>
            <Ionicons name="close" size={14} color={theme.error} />
          </TouchableOpacity>
        </View>
      )}
      {phonicsPracticeTarget && (
        <PhonicsPracticeCard {...phonicsCardProps} cardBg={theme.surface} textColor={theme.text} subtleColor={theme.textSecondary} />
      )}
      {isVoiceMode && VoiceOrb && (
        <View style={[styles.voiceDock, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <View style={styles.voiceDockHeader}>
            <Text style={[styles.voiceDockTitle, { color: theme.text }]}>Voice Mode</Text>
            <TouchableOpacity style={styles.voiceDockCloseButton} onPress={() => setIsVoiceMode(false)}>
              <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
              <Text style={[styles.voiceDockCloseText, { color: theme.textSecondary }]}>Minimize</Text>
            </TouchableOpacity>
          </View>
          <VoiceOrb {...voiceOrbSharedProps} size={118} />
        </View>
      )}
      <View style={!keyboardVisible ? { paddingBottom: insets.bottom } : undefined}>
        <ChatInput inputText={inputText} setInputText={setInputText} onSend={() => sendMessage(inputText)} isProcessing={isProcessing} isVoiceMode={isVoiceMode} onToggleVoiceMode={() => setIsVoiceMode(!isVoiceMode)} />
      </View>
    </View>
  );
}
