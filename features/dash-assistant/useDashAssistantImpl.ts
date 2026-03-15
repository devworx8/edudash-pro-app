/**
 * useDashAssistant Hook — Thin Façade
 *
 * Composes modular hooks from hooks/dash-ai/ into the public
 * `useDashAssistant()` API consumed by DashAssistantImpl.tsx.
 *
 * Previous: ~3,500 lines. Now: ~480 lines (orchestration only).
 *
 * Sub-modules:
 *   hooks/dash-ai/useDashAIPrefs.ts          — chat/voice/streaming preferences
 *   hooks/dash-ai/useDashAILearnerContext.ts  — parent/student/staff context resolution
 *   hooks/dash-ai/useDashAISendMessage.ts     — core AI send pipeline
 *   hooks/dash-ai/useDashAIInit.ts            — lazy init, conversation load, ORB handoff
 *   hooks/dash-ai/sendMessageTutor.ts         — tutor pipeline (pure functions)
 *   hooks/dash-ai/sendMessageStreaming.ts      — streaming setup + rAF chunk handler
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';

import type { DashMessage, DashConversation, DashAttachment } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import type { AIModelId, AIModelInfo } from '@/lib/ai/models';
import type { TutorSession } from '@/hooks/dash-assistant/tutorTypes';
import type { LearnerContext } from '@/lib/dash-ai/learnerContext';
import type { VoiceSession, VoiceProvider } from '@/lib/voice/unifiedProvider';
import type { SpeechChunkProgress } from '@/hooks/dash-assistant/voiceHandlers';
import type { AttachmentProgress } from '@/hooks/useDashAttachments';
import type { AIQuotaFeature } from '@/lib/ai/limits';
import type { DashToolOutcome } from '@/services/tools/types';
import type { VoiceProbeMetrics } from '@/lib/voice/benchmark/types';
import type { ResponseLifecycleTracker } from '@/hooks/dash-ai/types';

import { useDashboardPreferences } from '@/contexts/DashboardPreferencesContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAds } from '@/contexts/AdsContext';
import { useCapability } from '@/hooks/useCapability';
import { useDashAttachments } from '@/hooks/useDashAttachments';
import { useDashChatModelPreference } from '@/hooks/useDashChatModelPreference';
import { useDashTutorSessionPersistence } from '@/hooks/dash-assistant/useDashTutorSessionPersistence';
import { track } from '@/lib/analytics';
import { checkAIQuota, showQuotaExceededAlert } from '@/lib/ai/guards';
import {
  getQuotaFallbackActions, shouldAutoDowngrade, getFallbackModel,
  isRewardedAdAvailable, QUOTA_EXTENSION_FEATURE_KEY, QUOTA_EXTENSION_DURATION_MS, QUOTA_AD_TAG,
} from '@/lib/ai/quotaFallback';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { ToolRegistry } from '@/services/AgentTools';
import { formatToolResultMessage } from '@/lib/ai/toolUtils';
import { getDashToolShortcutsForRole } from '@/lib/ai/toolCatalog';
import { assertSupabase } from '@/lib/supabase';
import { loadVoiceBudget, trackVoiceUsage } from '@/lib/dash-ai/voiceBudget';
import { buildTranscriptModelPrompt } from '@/lib/voice/formatTranscript';
import {
  getConversationSnapshot, saveConversationSnapshot,
  getLastActiveConversationId, setLastActiveConversationId,
} from '@/services/conversationPersistence';
import {
  handleDashVoiceInputPress, speakDashResponse, stopDashVoiceRecording,
} from '@/hooks/dash-assistant/voiceHandlers';
import { shouldAutoSpeak } from '@/features/dash-assistant/voiceAutoSpeakPolicy';
import {
  extractFollowUps, wantsLessonGenerator, resolveVoiceLocale, sanitizeTutorUserContent,
} from '@/hooks/dash-assistant/assistantHelpers';
import { normalizeMessagesByTurn } from '@/features/dash-assistant/turnOrdering';
import { formatDashToolActivityLabel, DASH_AI_SERVICE_TYPE, LOCAL_SNAPSHOT_LIMIT, LOCAL_SNAPSHOT_MAX, DUPLICATE_SEND_WINDOW_MS } from '@/hooks/dash-ai/types';
import { useDashAIPrefs } from '@/hooks/dash-ai/useDashAIPrefs';
import { useDashAILearnerContext } from '@/hooks/dash-ai/useDashAILearnerContext';
import { useDashAISendMessage } from '@/hooks/dash-ai/useDashAISendMessage';
import { useDashAIInit } from '@/hooks/dash-ai/useDashAIInit';

// ─── Options / Return types (unchanged) ─────────────────────

interface UseDashAssistantOptions {
  conversationId?: string;
  initialMessage?: string;
  handoffSource?: string;
  onClose?: () => void;
  onAutoScanConsumed?: () => Promise<void> | void;
  externalTutorMode?: 'quiz' | 'practice' | 'diagnostic' | 'play' | 'explain' | null;
  tutorConfig?: { subject?: string; grade?: string; topic?: string; difficulty?: 1 | 2 | 3 | 4 | 5; slowLearner?: boolean };
}

interface AlertState {
  visible: boolean;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  icon?: string;
  buttons?: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }>;
  autoDismissMs?: number;
  bannerMode?: boolean;
}

// (UseDashAssistantReturn kept inline — unchanged from original)

// ─── Facade Hook ────────────────────────────────────────────

export function useDashAssistant(options: UseDashAssistantOptions) {
  const { conversationId, initialMessage, handoffSource, onClose, onAutoScanConsumed, externalTutorMode, tutorConfig } = options;

  // ── Foundation hooks ──────────────────────────────────
  const { setLayout } = useDashboardPreferences();
  const { tier, ready: subReady, refresh: refreshTier } = useSubscription();
  const { offerRewarded, unlockFeature, isFeatureUnlocked, canShowBanner } = useAds();
  const { user, profile } = useAuth();
  const { can, ready: capsReady } = useCapability();
  const { availableModels, selectedModel, setSelectedModel } = useDashChatModelPreference();
  const autoScanUserId = String(user?.id || profile?.id || '').trim() || null;

  const capabilityTier = useMemo(
    () => getCapabilityTier(normalizeTierName(String(tier || 'free'))),
    [tier],
  );
  const isFreeTier = subReady ? capabilityTier === 'free' : false;
  const canInteractiveLessons = capsReady ? can('lessons.interactive') : false;
  const aiStreamingEnabled = useMemo(() => getFeatureFlagsSync().ai_streaming_enabled !== false, []);
  const tutorSessionsV1Enabled = useMemo(() => getFeatureFlagsSync().dash_tutor_sessions_v1, []);

  const DASH_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_CHAT_TRACE === 'true';
  const logDashTrace = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!DASH_TRACE_ENABLED) return;
    console.log(`[DashChatTrace] ${event}`, payload || {});
  }, [DASH_TRACE_ENABLED]);

  // ── Core state ────────────────────────────────────────
  const [messages, setMessages] = useState<DashMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<'uploading' | 'analyzing' | 'thinking' | 'responding' | null>(null);
  const [, setStatusStartTime] = useState<number>(0);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [conversation, setConversation] = useState<DashConversation | null>(null);
  const [dashInstance, setDashInstance] = useState<IDashAIAssistant | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechChunkProgress, setSpeechChunkProgress] = useState<SpeechChunkProgress | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingVoiceActivity, setRecordingVoiceActivity] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [voiceAutoSendCountdownActive, setVoiceAutoSendCountdownActive] = useState(false);
  const [voiceAutoSendCountdownMs, setVoiceAutoSendCountdownMs] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bottomScrollRequestId, setBottomScrollRequestId] = useState(0);
  const [tutorSession, setTutorSession] = useState<TutorSession | null>(null);
  const [hasActiveToolExecution, setHasActiveToolExecution] = useState(false);
  const [voiceBudgetRemainingMs, setVoiceBudgetRemainingMs] = useState<number | null>(null);
  const [alertState, setAlertState] = useState<AlertState>({ visible: false, title: '', message: '' });

  // ── Alert helpers ─────────────────────────────────────
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideAlert = useCallback(() => {
    setAlertState(prev => ({ ...prev, visible: false }));
    if (autoDismissTimerRef.current) { clearTimeout(autoDismissTimerRef.current); autoDismissTimerRef.current = null; }
  }, []);
  const showAlert = useCallback((config: Omit<AlertState, 'visible'>) => {
    if (autoDismissTimerRef.current) { clearTimeout(autoDismissTimerRef.current); autoDismissTimerRef.current = null; }
    setAlertState({ ...config, visible: true });
    if (config.autoDismissMs && config.autoDismissMs > 0) {
      autoDismissTimerRef.current = setTimeout(() => { setAlertState(prev => ({ ...prev, visible: false })); autoDismissTimerRef.current = null; }, config.autoDismissMs);
    }
  }, []);

  // ── Refs ──────────────────────────────────────────────
  const flashListRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const webScrollNodeRef = useRef<any>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const voiceProviderRef = useRef<VoiceProvider | null>(null);
  const voiceInputStartAtRef = useRef<number | null>(null);
  const lastSpeakStartRef = useRef<number>(0);
  const ttsSessionIdRef = useRef<string | null>(null);
  const sttFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sttTranscriptBufferRef = useRef('');
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFollowUpTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const lastAutoScrollAtRef = useRef<number>(0);
  const forcedBottomUntilRef = useRef<number>(0);
  const prevLengthRef = useRef<number>(0);
  const messagesLengthRef = useRef<number>(0);
  const isNearBottomRef = useRef<boolean>(true);
  const initialConversationScrollRef = useRef<string | null>(null);
  const wasTypingActiveRef = useRef<boolean>(false);
  const tutorOverridesRef = useRef<Record<string, string>>({});
  const learnerContextRef = useRef<LearnerContext | null>(null);
  const inputTextRef = useRef('');
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef('');
  const sendMessageRef = useRef<(text?: string) => Promise<void>>(async () => {});
  const voiceAutoSendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceAutoSendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceAutoSendDeadlineRef = useRef<number | null>(null);
  const voiceAutoSendExpectedTranscriptRef = useRef('');
  const voiceDictationProbeRef = useRef<VoiceProbeMetrics | null>(null);
  const nextVoiceTurnRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeToolExecutionCountRef = useRef<number>(0);
  const responseLifecycleRef = useRef<ResponseLifecycleTracker>({ requestId: null, state: 'idle', committedText: null });
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Ref syncs ─────────────────────────────────────────
  useEffect(() => { inputTextRef.current = inputText; }, [inputText]);
  useEffect(() => { streamingMessageIdRef.current = streamingMessageId; }, [streamingMessageId]);
  useEffect(() => { streamingContentRef.current = streamingContent; }, [streamingContent]);
  useEffect(() => { messagesLengthRef.current = messages.length; }, [messages.length]);
  useEffect(() => { isNearBottomRef.current = isNearBottom; }, [isNearBottom]);
  useEffect(() => { if (!isRecording) setRecordingVoiceActivity(false); }, [isRecording]);

  // ── Composed hooks ────────────────────────────────────
  const prefs = useDashAIPrefs(profile?.role);
  const { learnerContext, setLearnerContext, parentChildren, activeChildId, setActiveChildId } =
    useDashAILearnerContext({ dashInstance, user, profile, tier, capabilityTier });

  useEffect(() => { learnerContextRef.current = learnerContext; }, [learnerContext]);

  const { tutorSessionRef } = useDashTutorSessionPersistence({
    userId: user?.id, profileRole: profile?.role,
    organizationId: profile?.organization_id, preschoolId: profile?.preschool_id,
    activeChildId, conversationId: conversation?.id,
    tutorSession, setTutorSession,
    remoteSyncEnabled: tutorSessionsV1Enabled,
  });

  // ── Tool shortcuts ────────────────────────────────────
  const toolShortcuts = useMemo(() => {
    const shortcuts = getDashToolShortcutsForRole(profile?.role || null);
    return shortcuts.filter(tool => ToolRegistry.hasTool(tool.name));
  }, [profile?.role]);
  const autoToolShortcuts = useMemo(() => {
    const role = String(profile?.role || '').toLowerCase();
    const capsAllowedForRole = !['parent', 'student'].includes(role);
    return toolShortcuts.filter(tool =>
      (tool.category === 'caps' && capsAllowedForRole) ||
      tool.category === 'data' || tool.category === 'navigation' ||
      (tool.category === 'communication' && (tool.name === 'export_pdf' || tool.name === 'generate_pdf_from_prompt')),
    );
  }, [toolShortcuts, profile?.role]);
  const plannerTools = useMemo(() => autoToolShortcuts.map(tool => {
    const registryTool = ToolRegistry.getTool(tool.name);
    return { name: tool.name, description: tool.description || registryTool?.description || tool.label, parameters: registryTool?.parameters };
  }).filter(t => !!t.name), [autoToolShortcuts]);

  // ── Voice budget ──────────────────────────────────────
  const refreshVoiceBudget = useCallback(async () => {
    if (!isFreeTier) { setVoiceBudgetRemainingMs(null); return; }
    const budget = await loadVoiceBudget();
    setVoiceBudgetRemainingMs(budget.remainingMs);
  }, [isFreeTier]);
  const consumeVoiceBudget = useCallback(async (deltaMs: number) => {
    if (!isFreeTier || deltaMs <= 0) return;
    await trackVoiceUsage(deltaMs);
    await refreshVoiceBudget();
  }, [isFreeTier, refreshVoiceBudget]);
  useEffect(() => { refreshVoiceBudget(); }, [refreshVoiceBudget]);
  const hasFreeVoiceBudget = voiceBudgetRemainingMs === null ? true : voiceBudgetRemainingMs > 0;
  const hasTTSAccess = useCallback(() => !isFreeTier ? true : hasFreeVoiceBudget, [isFreeTier, hasFreeVoiceBudget]);
  const hasSTTAccess = useCallback(() => true, []);

  // ── Tool execution tracking ───────────────────────────
  const beginToolExecution = useCallback(() => {
    activeToolExecutionCountRef.current += 1;
    setHasActiveToolExecution(true);
  }, []);
  const endToolExecution = useCallback(() => {
    activeToolExecutionCountRef.current = Math.max(0, activeToolExecutionCountRef.current - 1);
    if (activeToolExecutionCountRef.current === 0) setHasActiveToolExecution(false);
  }, []);
  const setResponseLifecycleState = useCallback((id: string, state: string, text?: string) => {
    responseLifecycleRef.current = { requestId: id, state: state as any, committedText: text ?? responseLifecycleRef.current.committedText };
  }, []);

  // ── Scroll ────────────────────────────────────────────
  const scrollToBottom = useCallback((opts?: { animated?: boolean; delay?: number; force?: boolean }) => {
    const delay = opts?.delay ?? 120;
    const animated = opts?.animated ?? true;
    const force = opts?.force ?? false;
    const now = Date.now();
    if (!force && !isNearBottomRef.current && now > forcedBottomUntilRef.current) return;
    if (!force && now - lastAutoScrollAtRef.current < 250) return;
    lastAutoScrollAtRef.current = now;
    if (force) forcedBottomUntilRef.current = now + 1500;
    const doScroll = () => {
      if (Platform.OS === 'web') {
        const node = webScrollNodeRef.current;
        if (node && typeof node.scrollTo === 'function') { node.scrollTo({ top: node.scrollHeight, behavior: animated ? 'smooth' : 'auto' }); }
      } else if (flashListRef.current) {
        try { flashListRef.current.scrollToEnd?.({ animated }); } catch {}
      }
      setBottomScrollRequestId(prev => prev + 1);
    };
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(doScroll, delay);
  }, []);

  // ── Persistence helpers ───────────────────────────────
  const normalizeConversationMessages = useCallback((msgs: DashMessage[]) => normalizeMessagesByTurn(msgs), []);
  const mapToPersistedMessages = useCallback((msgs: DashMessage[]) => msgs.map(msg => {
    const meta: Record<string, unknown> = {};
    if ((msg.metadata as any)?.tool_name) meta.tool_name = (msg.metadata as any).tool_name;
    if ((msg.metadata as any)?.tutor_phase) meta.tutor_phase = (msg.metadata as any).tutor_phase;
    return { id: msg.id, type: msg.type === 'task_result' ? 'assistant' : msg.type, content: msg.content, timestamp: msg.timestamp, meta: Object.keys(meta).length > 0 ? meta : undefined };
  }), []);
  const persistConversationSnapshot = useCallback(async (conv?: DashConversation | null) => {
    if (!user?.id || !conv?.id) return;
    const msgs = mapToPersistedMessages(conv.messages || []);
    await saveConversationSnapshot(user.id, conv.id, msgs, LOCAL_SNAPSHOT_MAX);
    await setLastActiveConversationId(user.id, conv.id);
  }, [mapToPersistedMessages, user?.id]);
  const hydrateFromSnapshot = useCallback(async (convId: string) => {
    if (!user?.id) return null;
    const snapshot = await getConversationSnapshot(user.id, convId, LOCAL_SNAPSHOT_LIMIT);
    if (!snapshot?.messages?.length) return null;
    const msgs: DashMessage[] = snapshot.messages.map((m: any) => ({ id: m.id, type: m.type, content: m.content, timestamp: m.timestamp, ...(m.meta ? { metadata: { ...(m.meta as any) } } : {}) }));
    const createdAt = msgs.length > 0 ? Math.min(...msgs.map(m => m.timestamp)) : snapshot.updatedAt;
    const updatedAt = snapshot.updatedAt || (msgs.length > 0 ? Math.max(...msgs.map(m => m.timestamp)) : Date.now());
    return { conversation: { id: convId, title: 'Dash AI Chat', messages: msgs, created_at: createdAt, updated_at: updatedAt } as DashConversation, messages: msgs };
  }, [user?.id]);
  const resolveActiveConversationId = useCallback(() => conversation?.id || dashInstance?.getCurrentConversationId?.() || null, [conversation?.id, dashInstance]);

  // ── Attachments ───────────────────────────────────────
  const canUseImages = capsReady ? can('multimodal.vision') : true;
  const canUseDocuments = capsReady ? can('multimodal.documents') : true;
  const dashAttachments = useDashAttachments({
    conversation,
    getConversationId: resolveActiveConversationId,
    onShowAlert: showAlert,
    canUseImages,
    canUseDocuments,
    isFreeTier,
  });

  // ── Attachment helper ─────────────────────────────────
  const addAttachments = useCallback((attachments: DashAttachment[]) => {
    if (!Array.isArray(attachments) || attachments.length === 0) return;
    dashAttachments.setSelectedAttachments(prev => [...prev, ...attachments]);
  }, [dashAttachments]);

  // ── Voice: speak / stop ───────────────────────────────
  const stopSpeaking = useCallback(async () => {
    if (!dashInstance) return;
    try { ttsSessionIdRef.current = null; await dashInstance.stopSpeaking(); } catch (error) { console.error('Failed to stop speaking:', error); }
    setIsSpeaking(false); setSpeakingMessageId(null); setSpeechChunkProgress(null);
  }, [dashInstance]);
  const speakResponse = useCallback(async (message: DashMessage, opts?: { preferFastStart?: boolean; forceSpeak?: boolean }) => {
    setSpeechChunkProgress(null);
    await speakDashResponse({
      message, dashInstance, voiceEnabled: prefs.voiceEnabled, hasTTSAccess, isFreeTier, consumeVoiceBudget,
      isSpeaking, speakingMessageId,
      voiceRefs: { voiceSessionRef, voiceProviderRef, voiceInputStartAtRef, lastSpeakStartRef, ttsSessionIdRef, sttFinalizeTimerRef, sttTranscriptBufferRef },
      setIsSpeaking, setSpeakingMessageId, showAlert, hideAlert, setVoiceEnabled: prefs.setVoiceEnabled, stopSpeaking,
      preferFastStart: opts?.preferFastStart, forceSpeak: opts?.forceSpeak, onSpeechChunkProgress: setSpeechChunkProgress,
    });
  }, [dashInstance, speakingMessageId, isSpeaking, hasTTSAccess, showAlert, hideAlert, prefs.voiceEnabled, stopSpeaking, isFreeTier, consumeVoiceBudget]);

  // ── Send message pipeline ─────────────────────────────
  const { sendMessageInternal, processQueue, requestQueueRef, activeRequestSignatureRef } = useDashAISendMessage({
    dashInstance, messages, conversation, selectedModel, streamingEnabledPref: prefs.streamingEnabledPref,
    user, profile, tier, capabilityTier,
    handoffSource, externalTutorMode, tutorConfig, onAutoScanConsumed, autoScanUserId,
    activeChildId,
    learnerContextRef, tutorSessionRef, tutorOverridesRef,
    activeRequestIdRef, abortControllerRef, responseLifecycleRef, activeToolExecutionCountRef,
    isNearBottomRef, nextVoiceTurnRef,
    setMessages, setConversation, setIsLoading, setLoadingStatus, setStatusStartTime,
    setStreamingMessageId, setStreamingContent, setActiveToolLabel, setTutorSession,
    scrollToBottom, showAlert, hideAlert, speakResponse, persistConversationSnapshot,
    resolveActiveConversationId, beginToolExecution, endToolExecution, setResponseLifecycleState, logDashTrace,
    capsReady, canInteractiveLessons, voiceEnabled: prefs.voiceEnabled, autoSpeakResponses: prefs.autoSpeakResponses,
    aiStreamingEnabled, dashAttachments, autoToolShortcuts, plannerTools, setLayout,
  });

  // ── Voice auto-send ───────────────────────────────────
  const cancelVoiceAutoSend = useCallback(() => {
    if (voiceAutoSendTimeoutRef.current) { clearTimeout(voiceAutoSendTimeoutRef.current); voiceAutoSendTimeoutRef.current = null; }
    if (voiceAutoSendIntervalRef.current) { clearInterval(voiceAutoSendIntervalRef.current); voiceAutoSendIntervalRef.current = null; }
    setVoiceAutoSendCountdownActive(false);
    setVoiceAutoSendCountdownMs(0);
    voiceAutoSendDeadlineRef.current = null;
    voiceAutoSendExpectedTranscriptRef.current = '';
  }, []);

  const handleVoiceFinalTranscript = useCallback((transcript: string, opts: { autoSend: boolean; delayMs: number; probe?: VoiceProbeMetrics }) => {
    cancelVoiceAutoSend();
    if (opts.probe) voiceDictationProbeRef.current = { ...opts.probe, platform: 'mobile', source: opts.probe.source || 'dash_assistant' };
    const trimmed = transcript.trim();
    if (!trimmed || !opts.autoSend) return;
    const modelPrompt = buildTranscriptModelPrompt(trimmed, { preschoolMode: learnerContextRef.current?.schoolType === 'preschool' });
    const outboundPrompt = modelPrompt || trimmed;
    const isPreschool = learnerContextRef.current?.schoolType === 'preschool';
    const defaultDelayMs = isPreschool ? 1500 : 850;
    const minDelayMs = isPreschool ? 1200 : 600;
    const maxDelayMs = isPreschool ? 2600 : 1800;
    const parsedDelay = Number(opts.delayMs);
    const delayMs = Number.isFinite(parsedDelay) ? Math.max(minDelayMs, Math.min(maxDelayMs, parsedDelay)) : defaultDelayMs;
    voiceAutoSendExpectedTranscriptRef.current = trimmed;
    voiceAutoSendDeadlineRef.current = Date.now() + delayMs;
    setVoiceAutoSendCountdownActive(true);
    setVoiceAutoSendCountdownMs(delayMs);
    voiceAutoSendIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, (voiceAutoSendDeadlineRef.current || 0) - Date.now());
      setVoiceAutoSendCountdownMs(remaining);
      if (remaining <= 0 && voiceAutoSendIntervalRef.current) { clearInterval(voiceAutoSendIntervalRef.current); voiceAutoSendIntervalRef.current = null; }
    }, 120);
    voiceAutoSendTimeoutRef.current = setTimeout(() => {
      const expected = voiceAutoSendExpectedTranscriptRef.current.trim();
      const latestInput = inputTextRef.current.trim();
      if (!latestInput || !expected || latestInput !== expected) { cancelVoiceAutoSend(); return; }
      nextVoiceTurnRef.current = true;
      sendMessageRef.current(outboundPrompt).catch(() => { nextVoiceTurnRef.current = false; }).finally(() => cancelVoiceAutoSend());
    }, delayMs);
  }, [cancelVoiceAutoSend]);

  const stopVoiceRecording = useCallback(async () => {
    cancelVoiceAutoSend();
    await stopDashVoiceRecording({
      voiceRefs: { voiceSessionRef, voiceProviderRef, voiceInputStartAtRef, lastSpeakStartRef, ttsSessionIdRef, sttFinalizeTimerRef, sttTranscriptBufferRef },
      isFreeTier, consumeVoiceBudget, setIsRecording, setPartialTranscript, setInputText,
    });
    setRecordingVoiceActivity(false);
  }, [cancelVoiceAutoSend, consumeVoiceBudget, isFreeTier, setInputText]);

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    const activeStreamingId = streamingMessageIdRef.current;
    const activeStreamingContent = streamingContentRef.current;
    if (activeStreamingId && activeStreamingContent) {
      setMessages(prev => prev.map(msg => msg.id === activeStreamingId ? { ...msg, content: activeStreamingContent + '\n\n*(Generation stopped)*' } : msg));
    }
    setIsLoading(false); setLoadingStatus(null); setStreamingMessageId(null); setStreamingContent('');
  }, []);

  const stopAllActivity = useCallback(async (reason: string = 'user_interrupt') => {
    cancelVoiceAutoSend();
    if (isRecording) await stopVoiceRecording();
    cancelGeneration();
    await stopSpeaking();
  }, [cancelVoiceAutoSend, cancelGeneration, isRecording, stopSpeaking, stopVoiceRecording]);

  // ── Public sendMessage (quota check + queue) ──────────
  const sendMessage = useCallback(async (text: string = inputText.trim(), overrideAttachments?: any[]) => {
    cancelVoiceAutoSend();
    if (isRecording) await stopVoiceRecording();
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const requestAttachments = overrideAttachments ?? [...dashAttachments.selectedAttachments];
    if ((!normalizedText && requestAttachments.length === 0) || !dashInstance) return;

    if (user?.id) {
      try {
        if (isFeatureUnlocked(QUOTA_EXTENSION_FEATURE_KEY)) { /* ad extension active */ }
        else {
          const quotaCheck = await checkAIQuota(DASH_AI_SERVICE_TYPE, user.id, 1);
          if (!quotaCheck.allowed) {
            const userTier = (capabilityTier || 'free') as import('@/lib/ai/models').SubscriptionTier;
            if (shouldAutoDowngrade(userTier, selectedModel)) {
              const fallback = getFallbackModel();
              track('edudash.ai.quota.auto_downgrade', { service_type: DASH_AI_SERVICE_TYPE, from_model: selectedModel, to_model: fallback, user_tier: userTier });
              setSelectedModel(fallback);
            } else {
              const fallbackActions = getQuotaFallbackActions({
                tier: userTier, currentModel: selectedModel,
                canShowRewardedAd: canShowBanner && isRewardedAdAvailable(userTier), hasActiveExtension: false,
              });
              track('edudash.ai.quota.blocked', { service_type: DASH_AI_SERVICE_TYPE, quota_used: quotaCheck.quotaInfo?.used, quota_limit: quotaCheck.quotaInfo?.limit, user_tier: userTier, upgrade_shown: fallbackActions.some(a => a.type === 'upgrade'), fallback_options: fallbackActions.map(a => a.type) } as any);
              showQuotaExceededAlert(DASH_AI_SERVICE_TYPE, quotaCheck.quotaInfo, {
                customMessages: { title: 'AI Chat Limit Reached' },
                fallbackActions,
                onModelDowngrade: (targetModel) => setSelectedModel(targetModel),
                onRewardedAd: async () => {
                  const result = await offerRewarded(QUOTA_AD_TAG);
                  if (result.rewarded) { unlockFeature(QUOTA_EXTENSION_FEATURE_KEY, QUOTA_EXTENSION_DURATION_MS); track('edudash.ai.quota.ad_extension_granted', { service_type: DASH_AI_SERVICE_TYPE, user_tier: userTier }); }
                },
              });
              return;
            }
          }
        }
      } catch (quotaError) { console.warn('[useDashAssistant] Quota check failed:', quotaError); }
    }

    if (user?.id && normalizedText) {
      try {
        if (wantsLessonGenerator(normalizedText)) {
          const lessonQuota = await checkAIQuota('lesson_generation', user.id, 1);
          if (!lessonQuota.allowed) { showQuotaExceededAlert('lesson_generation', lessonQuota.quotaInfo, { customMessages: { title: 'Lesson Generation Limit Reached', message: 'You have used all lesson generation credits for this month.' } }); return; }
        }
      } catch (e) { console.warn('[useDashAssistant] Lesson quota check failed:', e); }
    }

    const normalizeDashRequestText = (v: string) => v.trim().replace(/\s+/g, ' ');
    const buildSig = (t: string, atts: DashAttachment[]) => {
      const attSig = atts.map(a => [a.kind, a.name, a.mimeType, a.size, a.storagePath, a.previewUri, a.uri].join(':')).sort().join('|');
      return `${normalizeDashRequestText(t)}::${attSig}`;
    };
    const requestSignature = buildSig(normalizedText, requestAttachments);
    const now = Date.now();
    const isQueuedDup = requestQueueRef.current.some(r => r.signature === requestSignature);
    const isActiveDup = activeRequestSignatureRef.current === requestSignature;
    if (isQueuedDup || isActiveDup) return;

    requestQueueRef.current.push({ text: normalizedText, attachments: requestAttachments, signature: requestSignature, queuedAt: now });
    setInputText('');
    dashAttachments.setSelectedAttachments([]);
    processQueue();
  }, [cancelVoiceAutoSend, inputText, dashAttachments, dashInstance, user?.id, tier, processQueue, isRecording, stopVoiceRecording, capabilityTier, selectedModel, setSelectedModel, canShowBanner, offerRewarded, unlockFeature, isFeatureUnlocked, showAlert]);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  const sendTutorAnswer = useCallback(async (answer: string) => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    if (tutorSessionRef.current) track('edudash.ai.tutor.answer', { session_id: tutorSessionRef.current.id, mode: tutorSessionRef.current.mode });
    await sendMessage(trimmed);
  }, [sendMessage]);

  // ── Voice mic press ───────────────────────────────────
  const handleInputMicPress = useCallback(async () => {
    cancelVoiceAutoSend();
    if (isSpeaking) { await stopSpeaking(); return; }
    await handleDashVoiceInputPress({
      hasTTSAccess, hasSTTAccess, isRecording, stopVoiceRecording, tier, showAlert, hideAlert,
      dashInstance, preferredLanguage: profile?.preferred_language || null, resolveVoiceLocale,
      isFreeTier, consumeVoiceBudget, setIsRecording, setPartialTranscript, setInputText,
      existingInputText: inputText, voiceAutoSend: prefs.voiceAutoSend,
      voiceAutoSendSilenceMs: prefs.voiceAutoSendSilenceMs,
      voiceWhisperFlowEnabled: prefs.voiceWhisperFlowEnabled,
      voiceWhisperFlowSummaryEnabled: prefs.voiceWhisperFlowSummaryEnabled,
      isPreschoolMode: learnerContext?.schoolType === 'preschool',
      onFinalTranscript: handleVoiceFinalTranscript, onVoiceActivity: setRecordingVoiceActivity,
      voiceRefs: { voiceSessionRef, voiceProviderRef, voiceInputStartAtRef, lastSpeakStartRef, ttsSessionIdRef, sttFinalizeTimerRef, sttTranscriptBufferRef },
    });
  }, [cancelVoiceAutoSend, isSpeaking, stopSpeaking, hasTTSAccess, hasSTTAccess, isRecording, stopVoiceRecording, tier, showAlert, hideAlert, dashInstance, profile?.preferred_language, isFreeTier, consumeVoiceBudget, prefs.voiceAutoSend, prefs.voiceAutoSendSilenceMs, prefs.voiceWhisperFlowEnabled, prefs.voiceWhisperFlowSummaryEnabled, learnerContext?.schoolType, handleVoiceFinalTranscript, inputText]);

  // ── New conversation ──────────────────────────────────
  const startNewConversation = useCallback(async () => {
    if (!dashInstance) return;
    try {
      const newConvId = await dashInstance.startNewConversation('Chat with Dash');
      const newConv = await dashInstance.getConversation(newConvId);
      if (newConv) {
        setConversation(newConv); persistConversationSnapshot(newConv).catch(() => {});
        setMessages([]); setInputText(''); dashAttachments.setSelectedAttachments([]);
        setStreamingMessageId(null); setStreamingContent(''); setUnreadCount(0);
        setTutorSession(null); tutorOverridesRef.current = {};
        if (isRecording) await stopVoiceRecording();
        setMessages([{ id: `greeting_${Date.now()}`, type: 'assistant', content: dashInstance.getPersonality().greeting, timestamp: Date.now() }]);
      }
    } catch (error) {
      console.error('Failed to start new conversation:', error);
      showAlert({ title: 'Error', message: 'Failed to start new conversation.', type: 'error', icon: 'alert-circle-outline', buttons: [{ text: 'OK', style: 'default' }] });
    }
  }, [dashInstance, dashAttachments, isRecording, showAlert, stopVoiceRecording, persistConversationSnapshot]);

  // ── Run tool ──────────────────────────────────────────
  const runTool = useCallback(async (toolName: string, params: Record<string, any>) => {
    const tool = ToolRegistry.getTool(toolName);
    if (!tool) { showAlert({ title: 'Tool Not Found', message: `The tool "${toolName}" is not available right now.`, type: 'warning', icon: 'alert-circle-outline', buttons: [{ text: 'OK', style: 'default' }] }); return; }
    let supabaseClient: any = null;
    try { supabaseClient = assertSupabase(); } catch {}
    const context = { profile, user, supabase: supabaseClient, role: String(profile?.role || 'parent').toLowerCase(), tier: tier || 'free', organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null, hasOrganization: Boolean((profile as any)?.organization_id || (profile as any)?.preschool_id), isGuest: !user?.id, trace_id: `dash_assistant_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, tool_plan: { source: 'useDashAssistant.runTool', tool: toolName } };
    setActiveToolLabel(formatDashToolActivityLabel(toolName, tool.name || toolName));
    beginToolExecution();
    const execution = await ToolRegistry.execute(toolName, params, context).finally(() => endToolExecution());
    const content = formatToolResultMessage(tool.name || toolName, execution);
    const toolMessage: DashMessage = { id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'assistant', content, timestamp: Date.now(), metadata: { tool_name: toolName, tool_result: execution, tool_args: params || {}, tool_origin: 'manual_tool', tool_outcome: execution?.success === false ? { status: 'failed', source: 'tool_registry', errorCode: String(execution?.error || 'manual_tool_failed') } : { status: 'success', source: 'tool_registry' } } };
    setMessages(prev => [...prev, toolMessage]);
    const convId = dashInstance?.getCurrentConversationId?.();
    if (dashInstance && convId) { try { await dashInstance.addMessageToConversation(convId, toolMessage); } catch {} }
  }, [dashInstance, profile, user, showAlert, tier, beginToolExecution, endToolExecution]);

  // ── Initialization ────────────────────────────────────
  useDashAIInit(
    { conversationId, initialMessage, handoffSource, externalTutorMode, tutorConfig },
    {
      user, profile, setDashInstance, setConversation, setMessages, setIsInitialized, setInputText,
      normalizeConversationMessages, hydrateFromSnapshot, persistConversationSnapshot,
      loadChatPrefs: prefs.loadChatPrefs, sendMessage, getLastActiveConversationId,
    },
  );

  // ── Effects: auto-scroll, focus, cleanup ──────────────
  useEffect(() => {
    if (!isInitialized || messages.length === 0 || !flashListRef.current) return;
    const activeConvId = conversation?.id || conversationId || '__dash_default__';
    if (initialConversationScrollRef.current === activeConvId) return;
    initialConversationScrollRef.current = activeConvId;
    scrollToBottom({ animated: false, delay: 0, force: true });
    const t = setTimeout(() => scrollToBottom({ animated: false, delay: 0, force: true }), 180);
    return () => clearTimeout(t);
  }, [conversation?.id, conversationId, isInitialized, messages.length, scrollToBottom]);

  useEffect(() => {
    const isTypingActive = isLoading || !!loadingStatus;
    const becameActive = isTypingActive && !wasTypingActiveRef.current;
    if (becameActive && isNearBottomRef.current && flashListRef.current) scrollToBottom({ animated: false, delay: 0 });
    wasTypingActiveRef.current = isTypingActive;
  }, [isLoading, loadingStatus, scrollToBottom]);

  useEffect(() => {
    if (!isInitialized) return;
    const prevLen = prevLengthRef.current || 0;
    const currLen = messages.length;
    if (currLen > prevLen) { if (isNearBottom) setUnreadCount(0); else setUnreadCount(c => Math.min(999, c + (currLen - prevLen))); }
    prevLengthRef.current = currLen;
  }, [messages.length, isNearBottom, isInitialized]);

  useFocusEffect(useCallback(() => {
    prefs.loadChatPrefs();
    let active = true;
    const focusTimers = [90, 240, 480].map(ms => setTimeout(() => { if (active && messagesLengthRef.current > 0) scrollToBottom({ animated: false, delay: 0, force: true }); }, ms));
    if (dashInstance && conversation?.id) {
      dashInstance.getConversation(conversation.id).then((updatedConv: any) => {
        if (!active) return;
        if (updatedConv && updatedConv.messages.length !== messagesLengthRef.current) {
          setMessages(normalizeConversationMessages(updatedConv.messages));
          setConversation(updatedConv);
          persistConversationSnapshot(updatedConv).catch(() => {});
          [70, 210].forEach(ms => focusTimers.push(setTimeout(() => { if (active) scrollToBottom({ animated: false, delay: 0, force: true }); }, ms)));
        }
      }).catch(() => {});
    }
    return () => { active = false; initialConversationScrollRef.current = null; focusTimers.forEach(t => clearTimeout(t)); stopAllActivity().catch(() => {}); };
  }, [dashInstance, conversation?.id, prefs.loadChatPrefs, stopAllActivity, normalizeConversationMessages, persistConversationSnapshot, scrollToBottom]));

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollFollowUpTimersRef.current.forEach(t => clearTimeout(t));
      scrollFollowUpTimersRef.current = [];
      cancelVoiceAutoSend();
      if (sttFinalizeTimerRef.current) { clearTimeout(sttFinalizeTimerRef.current); sttFinalizeTimerRef.current = null; }
      sttTranscriptBufferRef.current = '';
      setRecordingVoiceActivity(false);
      if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
      if (voiceSessionRef.current) { voiceSessionRef.current.stop().catch(() => {}); voiceSessionRef.current = null; }
      voiceProviderRef.current = null;
      if (dashInstance) { stopSpeaking().catch(() => {}); dashInstance.cleanup(); }
    };
  }, [cancelVoiceAutoSend, dashInstance, stopSpeaking]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => { if (dashInstance && isSpeaking) stopSpeaking().catch(() => {}); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dashInstance, isSpeaking, stopSpeaking]);

  // ── Return (unchanged public API) ─────────────────────
  return {
    messages, inputText, setInputText, isLoading, hasActiveToolExecution, activeToolLabel,
    loadingStatus, streamingMessageId, streamingContent, isSpeaking, speakingMessageId,
    conversation, dashInstance, isInitialized,
    enterToSend: prefs.enterToSend, setEnterToSend: prefs.setEnterToSend,
    voiceEnabled: prefs.voiceEnabled, showTypingIndicator: prefs.showTypingIndicator,
    autoSuggestQuestions: prefs.autoSuggestQuestions, contextualHelp: prefs.contextualHelp,
    selectedAttachments: dashAttachments.selectedAttachments,
    isUploading: dashAttachments.isUploading,
    attachmentProgress: dashAttachments.attachmentProgress,
    isNearBottom, setIsNearBottom, unreadCount, setUnreadCount, bottomScrollRequestId,
    availableModels, selectedModel, setSelectedModel,
    isRecording, recordingVoiceActivity, partialTranscript, speechChunkProgress,
    voiceAutoSendCountdownActive, voiceAutoSendCountdownMs,
    alertState, hideAlert, learnerContext, tutorSession,
    parentChildren, activeChildId, setActiveChildId,
    flashListRef, inputRef, webScrollNodeRef,
    sendMessage, sendTutorAnswer, cancelGeneration, stopAllActivity,
    speakResponse, stopSpeaking, scrollToBottom,
    handleAttachFile: dashAttachments.handleAttachFile, handlePickDocuments: dashAttachments.handlePickDocuments,
    handlePickImages: dashAttachments.handlePickImages, handleTakePhoto: dashAttachments.handleTakePhoto,
    handleRemoveAttachment: dashAttachments.handleRemoveAttachment,
    updateAttachmentUri: dashAttachments.updateAttachmentUri, addAttachments,
    handleInputMicPress, stopVoiceRecording, cancelVoiceAutoSend,
    startNewConversation, runTool,
    extractFollowUps, wantsLessonGenerator,
    tier, subReady, refreshTier,
  };
}
