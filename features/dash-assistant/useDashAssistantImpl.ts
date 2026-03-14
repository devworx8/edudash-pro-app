/**
 * useDashAssistant Hook
 * 
 * Custom hook that extracts business logic from DashAssistant component.
 * Handles message state, conversation management, attachments, and AI interactions.
 * Voice input enabled for paid tiers and a limited free daily budget.
 *
 * TODO(refactor): This file is ~3200 lines — well over the 500-line guideline.
 * Candidate sub-modules to extract:
 *   - useMessageState.ts           (message list, pagination, optimistic updates)
 *   - useConversationManager.ts    (thread CRUD, title generation, switching)
 *   - useAttachments.ts            (image/doc picker, upload, preview)
 *   - useAIStream.ts               (SSE streaming, tool-call handling, retry logic)
 *   - useVoiceInput.ts             (STT recording, budget tracking)
 *   - dashAssistantPrompts.ts      (system-prompt builders)
 * Keep the public hook signature (`useDashAssistant`) intact as a façade.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import type { DashMessage, DashConversation, DashAttachment } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import type { DashRouteIntent } from '@/features/dash-assistant/types';
import { useDashboardPreferences } from '@/contexts/DashboardPreferencesContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { track } from '@/lib/analytics';
import { DASH_TELEMETRY_EVENTS, trackDashTelemetry } from '@/lib/telemetry/events';
import { buildDashTurnTelemetry, createDashTurnId } from '@/lib/dash-ai/turnTelemetry';
import { checkAIQuota, showQuotaExceededAlert } from '@/lib/ai/guards';
import type { AIQuotaFeature } from '@/lib/ai/limits';
import {
  getQuotaFallbackActions,
  shouldAutoDowngrade,
  getFallbackModel,
  isRewardedAdAvailable,
  QUOTA_EXTENSION_FEATURE_KEY,
  QUOTA_EXTENSION_DURATION_MS,
  QUOTA_AD_TAG,
} from '@/lib/ai/quotaFallback';
import { useAds } from '@/contexts/AdsContext';
import { type VoiceSession, type VoiceProvider } from '@/lib/voice/unifiedProvider';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import {
  getChatUIPrefs,
  getVoiceChatPrefs,
  getVoiceInputPrefs,
  initAndMigrate,
  normalizeLanguageCode,
} from '@/lib/ai/dashSettings';
import { assertSupabase } from '@/lib/supabase';
import { calculateAge } from '@/lib/date-utils';
import { fetchParentChildren } from '@/lib/parent-children';
import { getCurrentLanguage } from '@/lib/i18n';
import { useCapability } from '@/hooks/useCapability';
import type { AIModelId, AIModelInfo } from '@/lib/ai/models';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { useDashAttachments, type AttachmentProgress } from '@/hooks/useDashAttachments';
import {
  buildConversationContext,
  resolveConversationWindowByTier,
} from '@/hooks/dash-assistant/conversationContext';
import {
  getConversationSnapshot,
  saveConversationSnapshot,
  getLastActiveConversationId,
  setLastActiveConversationId,
} from '@/services/conversationPersistence';
import { ToolRegistry } from '@/services/AgentTools';
import { formatToolResultMessage } from '@/lib/ai/toolUtils';
import { getDashToolShortcutsForRole } from '@/lib/ai/toolCatalog';
import {
  createTutorSessionId,
} from '@/lib/dash-ai/tutorSessionService';
import { useDashTutorSessionPersistence } from '@/hooks/dash-assistant/useDashTutorSessionPersistence';
import { planToolCall, shouldAttemptToolPlan } from '@/lib/ai/toolPlanner';
import {
  handleDashVoiceInputPress,
  speakDashResponse,
  stopDashVoiceRecording,
  type SpeechChunkProgress,
} from '@/hooks/dash-assistant/voiceHandlers';
import { getStreamingPlaceholder } from '@/lib/dash-voice-utils';
import {
  resolveAutoSpeakPreference,
  shouldAutoSpeak,
} from '@/features/dash-assistant/voiceAutoSpeakPolicy';
import {
  buildAttachmentContextInternal,
  buildDashContextOverride,
  extractFollowUps,
  prepareAttachmentsForAI,
  resolveVoiceLocale,
  sanitizeTutorUserContent,
  wantsLessonGenerator,
} from '@/hooks/dash-assistant/assistantHelpers';
import { resolveDashRouteIntent } from '@/features/dash-assistant/types';
import type { TutorMode, TutorPayload, TutorSession } from '@/hooks/dash-assistant/tutorTypes';
import {
  mergeAutoToolExecutionIntoResponse,
  type AutoToolExecution,
} from '@/features/dash-assistant/autoToolMerge';
import {
  appendAssistantMessageByTurn,
  normalizeMessagesByTurn,
} from '@/features/dash-assistant/turnOrdering';
import {
  applyTutorHints,
  buildFallbackTutorEvaluation,
  buildTutorDisplayContent,
  buildTutorSystemContext,
  detectPhonicsTutorRequest,
  detectTutorIntent,
  extractLearningContext,
  extractTutorQuestionFromText,
  getInitialPhonicsStage,
  getMaxQuestions,
  getTutorPhaseLabel,
  isTutorStopIntent,
  nextPhonicsStage,
  parseTutorPayload,
  reconcileTutorEvaluation,
} from '@/hooks/dash-assistant/tutorUtils';

// Extracted utilities
import {
  resolveAgeBand, 
  type LearnerContext,
} from '@/lib/dash-ai/learnerContext';
import { resolveSchoolTypeFromProfile } from '@/lib/schoolTypeResolver';
import {
  shouldCelebrate,
} from '@/lib/dash-ai/promptBuilder';
import { classifyResponseMode } from '@/lib/dash-ai/responseMode';
import {
  buildLanguageDirectiveForTurn,
  detectLanguageOverrideFromText,
  resolveResponseLocale,
} from '@/lib/dash-ai/languageRouting';
import {
  loadVoiceBudget,
  trackVoiceUsage,
} from '@/lib/dash-ai/voiceBudget';
import { buildTranscriptModelPrompt } from '@/lib/voice/formatTranscript';
import type { VoiceProbeMetrics } from '@/lib/voice/benchmark/types';
import { consumeAutoScanBudget } from '@/lib/dash-ai/imageBudget';
import {
  countScannerAttachments,
  isSuccessfulOCRResponse,
} from '@/lib/dash-ai/retakeFlow';
import { useDashChatModelPreference } from '@/hooks/useDashChatModelPreference';
import type { DashToolOutcome } from '@/services/tools/types';

interface UseDashAssistantOptions {
  conversationId?: string;
  initialMessage?: string;
  handoffSource?: string;
  onClose?: () => void;
  onAutoScanConsumed?: () => Promise<void> | void;
  /** Pre-configured tutor mode — bypasses intent detection */
  externalTutorMode?: 'quiz' | 'practice' | 'diagnostic' | 'play' | 'explain' | null;
  /** Tutor session config for programmatic start */
  tutorConfig?: {
    subject?: string;
    grade?: string;
    topic?: string;
    difficulty?: 1 | 2 | 3 | 4 | 5;
    slowLearner?: boolean;
  };
}

interface AlertState {
  visible: boolean;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  icon?: string;
  buttons?: Array<{
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }>;
  autoDismissMs?: number;
  bannerMode?: boolean;
}

type PendingDashRequest = {
  text: string;
  attachments: DashAttachment[];
  signature: string;
  queuedAt: number;
};

const TOOL_ACTIVITY_LABELS: Record<string, string> = {
  export_pdf: 'Generating PDF',
  generate_pdf_from_prompt: 'Generating PDF',
  search_caps_curriculum: 'Searching CAPS',
  get_caps_documents: 'Opening CAPS documents',
  get_assignments: 'Checking assignments',
  get_schedule: 'Checking your schedule',
  support_check_user_context: 'Checking support context',
  support_create_ticket: 'Creating support ticket',
};

function formatDashToolActivityLabel(toolName: string, fallbackLabel?: string): string {
  const normalized = String(toolName || '').trim().toLowerCase();
  if (fallbackLabel) return fallbackLabel;
  if (normalized && TOOL_ACTIVITY_LABELS[normalized]) {
    return TOOL_ACTIVITY_LABELS[normalized];
  }
  return normalized
    ? `Using ${normalized.replace(/_/g, ' ')}`
    : 'Using a helper tool';
}

interface UseDashAssistantReturn {
  // State
  messages: DashMessage[];
  inputText: string;
  setInputText: (text: string) => void;
  isLoading: boolean;
  hasActiveToolExecution: boolean;
  activeToolLabel: string | null;
  loadingStatus: 'uploading' | 'analyzing' | 'thinking' | 'responding' | null;
  streamingMessageId: string | null;
  streamingContent: string;
  isSpeaking: boolean;
  speakingMessageId: string | null;
  conversation: DashConversation | null;
  dashInstance: IDashAIAssistant | null;
  isInitialized: boolean;
  enterToSend: boolean;
  setEnterToSend: (value: boolean) => void;
  voiceEnabled: boolean;
  showTypingIndicator: boolean;
  autoSuggestQuestions: boolean;
  contextualHelp: boolean;
  selectedAttachments: DashAttachment[];
  isUploading: boolean;
  attachmentProgress: Map<string, AttachmentProgress>;
  isNearBottom: boolean;
  setIsNearBottom: (value: boolean) => void;
  unreadCount: number;
  setUnreadCount: (value: number | ((prev: number) => number)) => void;
  bottomScrollRequestId: number;

  // Model selection
  availableModels: AIModelInfo[];
  selectedModel: AIModelId;
  setSelectedModel: (modelId: AIModelId) => void;
  
  // Voice input state
  isRecording: boolean;
  recordingVoiceActivity: boolean;
  partialTranscript: string;
  speechChunkProgress: SpeechChunkProgress | null;
  voiceAutoSendCountdownActive: boolean;
  voiceAutoSendCountdownMs: number;
  
  // Alert state for premium modals
  alertState: AlertState;
  hideAlert: () => void;
  learnerContext: LearnerContext | null;
  tutorSession: TutorSession | null;
  
  // Parent child management
  parentChildren: any[];
  activeChildId: string | null;
  setActiveChildId: (id: string | null) => void;
  
  // Refs
  flashListRef: React.RefObject<any>;
  inputRef: React.RefObject<any>;
  webScrollNodeRef: { current: any };
  
  // Actions
  sendMessage: (text?: string, overrideAttachments?: any[]) => Promise<void>;
  sendTutorAnswer: (answer: string, sourceMessageId?: string) => Promise<void>;
  cancelGeneration: () => void;
  stopAllActivity: (reason?: string) => Promise<void>;
  speakResponse: (
    message: DashMessage,
    options?: { preferFastStart?: boolean; forceSpeak?: boolean }
  ) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  scrollToBottom: (opts?: { animated?: boolean; delay?: number; force?: boolean }) => void;
  handleAttachFile: () => Promise<void>;
  handlePickDocuments: () => Promise<void>;
  handlePickImages: () => Promise<void>;
  handleTakePhoto: () => Promise<void>;
  handleRemoveAttachment: (attachmentId: string) => Promise<void>;
  addAttachments: (attachments: DashAttachment[]) => void;
  handleInputMicPress: () => Promise<void>;
  stopVoiceRecording: () => Promise<void>;
  cancelVoiceAutoSend: () => void;
  startNewConversation: () => Promise<void>;
  runTool: (toolName: string, params: Record<string, any>) => Promise<void>;
  
  // Helpers
  extractFollowUps: (text: string) => string[];
  wantsLessonGenerator: (t: string, assistantText?: string) => boolean;
  
  // Subscription info
  tier: string | undefined;
  subReady: boolean;
  refreshTier: () => void;
}

const DASH_AI_SERVICE_TYPE: AIQuotaFeature = 'homework_help';

const LOCAL_SNAPSHOT_LIMIT = 200;
const LOCAL_SNAPSHOT_MAX = 200;
const GENERIC_ACK_PATTERN = /^(ok(?:ay)?|sure|got it|let me|working on|one moment|please wait)\b/i;
const DUPLICATE_SEND_WINDOW_MS = 1200;

type ResponseLifecycleState = 'idle' | 'draft_streaming' | 'committed' | 'finalized';

interface ResponseLifecycleTracker {
  requestId: string | null;
  state: ResponseLifecycleState;
  committedText: string | null;
}

const normalizeDashRequestText = (value: string) => value.trim().replace(/\s+/g, ' ');

const buildDashRequestSignature = (text: string, attachments: DashAttachment[]) => {
  const attachmentSignature = attachments
    .map((attachment) => [
      attachment.kind,
      attachment.name,
      attachment.mimeType,
      attachment.size,
      attachment.storagePath,
      attachment.previewUri,
      attachment.uri,
    ].join(':'))
    .sort()
    .join('|');

  return `${normalizeDashRequestText(text)}::${attachmentSignature}`;
};

const buildTutorKickoffPrompt = (
  mode: NonNullable<UseDashAssistantOptions['externalTutorMode']>,
  config?: UseDashAssistantOptions['tutorConfig']
) => {
  const modeLabel = String(mode || 'diagnostic').toLowerCase();
  const contextParts = [
    config?.grade ? `Grade: ${config.grade}` : null,
    config?.subject ? `Subject: ${config.subject}` : null,
    config?.topic ? `Topic: ${config.topic}` : null,
  ].filter(Boolean);
  const contextBlock = contextParts.length > 0 ? `\n${contextParts.join('\n')}` : '';
  return [
    `Start a ${modeLabel} tutor session for me.${contextBlock}`,
    config?.slowLearner
      ? 'Use slow-learner supportive pacing: one concept at a time, one question at a time, with worked examples and confidence checks.'
      : null,
    'Use Diagnose → Teach → Practice flow.',
    'Ask one question at a time and adapt based on my answer.',
  ].filter(Boolean).join('\n');
};

export function useDashAssistant(options: UseDashAssistantOptions): UseDashAssistantReturn {
  const { conversationId, initialMessage, handoffSource, onClose, onAutoScanConsumed, externalTutorMode, tutorConfig } = options;
  const { setLayout } = useDashboardPreferences();
  const { tier, ready: subReady, refresh: refreshTier } = useSubscription();
  const { offerRewarded, unlockFeature, isFeatureUnlocked, canShowBanner } = useAds();
  const { user, profile } = useAuth();
  const autoScanUserId = String(user?.id || profile?.id || '').trim() || null;
  const { can, ready: capsReady } = useCapability();
  const tutorSessionsV1Enabled = useMemo(
    () => getFeatureFlagsSync().dash_tutor_sessions_v1,
    []
  );
  const aiStreamingEnabled = useMemo(
    () => getFeatureFlagsSync().ai_streaming_enabled !== false,
    []
  );
  const DASH_TRACE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DASH_CHAT_TRACE === 'true';
  const logDashTrace = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (!DASH_TRACE_ENABLED) return;
    console.log(`[DashChatTrace] ${event}`, payload || {});
  }, [DASH_TRACE_ENABLED]);

  const toolShortcuts = useMemo(() => {
    const shortcuts = getDashToolShortcutsForRole(profile?.role || null);
    return shortcuts.filter((tool) => ToolRegistry.hasTool(tool.name));
  }, [profile?.role]);

  const autoToolShortcuts = useMemo(() => {
    const role = String(profile?.role || '').toLowerCase();
    const capsAllowedForRole = !['parent', 'student'].includes(role);
    return toolShortcuts.filter((tool) =>
      (tool.category === 'caps' && capsAllowedForRole) ||
      tool.category === 'data' ||
      tool.category === 'navigation' ||
      (tool.category === 'communication' &&
        (tool.name === 'export_pdf' || tool.name === 'generate_pdf_from_prompt'))
    );
  }, [toolShortcuts, profile?.role]);

  const plannerTools = useMemo(() => {
    return autoToolShortcuts
      .map((tool) => {
        const registryTool = ToolRegistry.getTool(tool.name);
        return {
          name: tool.name,
          description: tool.description || registryTool?.description || tool.label,
          parameters: registryTool?.parameters,
        };
      })
      .filter((tool) => !!tool.name);
  }, [autoToolShortcuts]);
  
  // State
  const [messages, setMessages] = useState<DashMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<'uploading' | 'analyzing' | 'thinking' | 'responding' | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [, setStatusStartTime] = useState<number>(0);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [conversation, setConversation] = useState<DashConversation | null>(null);
  const [dashInstance, setDashInstance] = useState<IDashAIAssistant | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [enterToSend, setEnterToSend] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeakResponses, setAutoSpeakResponses] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechChunkProgress, setSpeechChunkProgress] = useState<SpeechChunkProgress | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingVoiceActivity, setRecordingVoiceActivity] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [voiceAutoSendCountdownActive, setVoiceAutoSendCountdownActive] = useState(false);
  const [voiceAutoSendCountdownMs, setVoiceAutoSendCountdownMs] = useState(0);
  const [voiceAutoSend, setVoiceAutoSend] = useState(false);
  const [voiceAutoSendSilenceMs, setVoiceAutoSendSilenceMs] = useState(900);
  const [voiceWhisperFlowEnabled, setVoiceWhisperFlowEnabled] = useState(true);
  const [voiceWhisperFlowSummaryEnabled, setVoiceWhisperFlowSummaryEnabled] = useState(true);
  const [showTypingIndicator, setShowTypingIndicator] = useState(true);
  const [autoSuggestQuestions, setAutoSuggestQuestions] = useState(true);
  const [contextualHelp, setContextualHelp] = useState(true);
  const [streamingEnabledPref, setStreamingEnabledPref] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bottomScrollRequestId, setBottomScrollRequestId] = useState(0);
  const [tutorSession, setTutorSession] = useState<TutorSession | null>(null);
  const { availableModels, selectedModel, setSelectedModel } = useDashChatModelPreference();

  useEffect(() => {
    if (!isRecording) {
      setRecordingVoiceActivity(false);
    }
  }, [isRecording]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [learnerContext, setLearnerContext] = useState<LearnerContext | null>(null);
  const [parentChildren, setParentChildren] = useState<any[]>([]);
  const [voiceBudgetRemainingMs, setVoiceBudgetRemainingMs] = useState<number | null>(null);
  const externalTutorKickoffSentRef = useRef(false);
  const initialMessageSentRef = useRef<string | null>(null);
  
  // Alert state for premium modals (replaces native Alert.alert)
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
  });
  
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideAlert = useCallback(() => {
    setAlertState(prev => ({ ...prev, visible: false }));
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, []);

  const showAlert = useCallback((config: Omit<AlertState, 'visible'>) => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setAlertState({ ...config, visible: true });
    if (config.autoDismissMs && config.autoDismissMs > 0) {
      autoDismissTimerRef.current = setTimeout(() => {
        setAlertState(prev => ({ ...prev, visible: false }));
        autoDismissTimerRef.current = null;
      }, config.autoDismissMs);
    }
  }, []);
  
  // Refs
  const flashListRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  // Caches the actual DOM scroll container on web (populated by DashAssistantMessages onScroll)
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
  const requestQueueRef = useRef<PendingDashRequest[]>([]);
  const isProcessingRef = useRef(false);
  const prevLengthRef = useRef<number>(0);
  const messagesLengthRef = useRef<number>(0);
  const isNearBottomRef = useRef<boolean>(true);
  const initialConversationScrollRef = useRef<string | null>(null);
  const lastQueuedRequestRef = useRef<{ signature: string; queuedAt: number } | null>(null);
  const activeRequestSignatureRef = useRef<string | null>(null);
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
  const responseLifecycleRef = useRef<ResponseLifecycleTracker>({
    requestId: null,
    state: 'idle',
    committedText: null,
  });
  const [hasActiveToolExecution, setHasActiveToolExecution] = useState(false);

  const { tutorSessionRef } = useDashTutorSessionPersistence({
    userId: user?.id,
    profileRole: profile?.role,
    organizationId: profile?.organization_id,
    preschoolId: profile?.preschool_id,
    activeChildId,
    conversationId: conversation?.id,
    tutorSession,
    setTutorSession,
    remoteSyncEnabled: tutorSessionsV1Enabled,
  });

  useEffect(() => {
    learnerContextRef.current = learnerContext;
  }, [learnerContext]);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    streamingMessageIdRef.current = streamingMessageId;
  }, [streamingMessageId]);

  useEffect(() => {
    streamingContentRef.current = streamingContent;
  }, [streamingContent]);

  const cancelVoiceAutoSend = useCallback(() => {
    if (voiceAutoSendTimeoutRef.current) {
      clearTimeout(voiceAutoSendTimeoutRef.current);
      voiceAutoSendTimeoutRef.current = null;
    }
    if (voiceAutoSendIntervalRef.current) {
      clearInterval(voiceAutoSendIntervalRef.current);
      voiceAutoSendIntervalRef.current = null;
    }
    voiceAutoSendDeadlineRef.current = null;
    voiceAutoSendExpectedTranscriptRef.current = '';
    setVoiceAutoSendCountdownActive(false);
    setVoiceAutoSendCountdownMs(0);
  }, []);

  useEffect(() => {
    if (!voiceAutoSendCountdownActive) return;
    const currentInput = inputTextRef.current.trim();
    const expected = voiceAutoSendExpectedTranscriptRef.current.trim();
    if (!currentInput || !expected) return;
    if (currentInput !== expected) {
      cancelVoiceAutoSend();
    }
  }, [inputText, voiceAutoSendCountdownActive, cancelVoiceAutoSend]);

  useEffect(() => {
    messagesLengthRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    isNearBottomRef.current = isNearBottom;
  }, [isNearBottom]);

  const beginToolExecution = useCallback(() => {
    activeToolExecutionCountRef.current += 1;
    if (activeToolExecutionCountRef.current === 1) {
      setHasActiveToolExecution(true);
    }
  }, []);

  const endToolExecution = useCallback(() => {
    activeToolExecutionCountRef.current = Math.max(0, activeToolExecutionCountRef.current - 1);
    if (activeToolExecutionCountRef.current === 0) {
      setHasActiveToolExecution(false);
      setActiveToolLabel(null);
    }
  }, []);

  const setResponseLifecycleState = useCallback(
    (requestId: string, state: ResponseLifecycleState, committedText?: string | null) => {
      if (activeRequestIdRef.current !== requestId) return;
      responseLifecycleRef.current = {
        requestId,
        state,
        committedText: committedText ?? responseLifecycleRef.current.committedText,
      };
    },
    []
  );

  // Save conversation ID whenever it changes for persistence
  useEffect(() => {
    if (conversation?.id) {
      AsyncStorage.setItem('@dash_ai_current_conversation_id', conversation.id).catch(err => {
        console.error('[useDashAssistant] Failed to save conversation ID:', err);
      });
    }
  }, [conversation?.id]);

  const capabilityTier = useMemo(
    () => getCapabilityTier(normalizeTierName(String(tier || 'free'))),
    [tier],
  );
  const isFreeTier = subReady ? capabilityTier === 'free' : false;
  const canInteractiveLessons = capsReady ? can('lessons.interactive') : false;
  const canUseImages = capsReady ? can('multimodal.vision') : true;
  const canUseDocuments = capsReady ? can('multimodal.documents') : true;

  const resolveActiveConversationId = useCallback((): string | null => {
    if (conversation?.id) return conversation.id;
    try {
      const current = dashInstance?.getCurrentConversationId?.();
      if (typeof current === 'string' && current.trim().length > 0) {
        return current;
      }
    } catch {}
    return null;
  }, [conversation?.id, dashInstance]);

  // Initialize attachments hook
  const dashAttachments = useDashAttachments({
    conversation,
    getConversationId: resolveActiveConversationId,
    onShowAlert: showAlert,
    canUseImages,
    canUseDocuments,
    isFreeTier,
  });

  const addAttachments = useCallback((attachments: DashAttachment[]) => {
    if (!Array.isArray(attachments) || attachments.length === 0) return;
    dashAttachments.setSelectedAttachments((prev) => [...prev, ...attachments]);
  }, [dashAttachments]);

  // Load voice budget on mount and when tier changes
  const refreshVoiceBudget = useCallback(async () => {
    if (!isFreeTier) {
      setVoiceBudgetRemainingMs(null);
      return;
    }
    const budget = await loadVoiceBudget();
    setVoiceBudgetRemainingMs(budget.remainingMs);
  }, [isFreeTier]);

  const consumeVoiceBudget = useCallback(async (deltaMs: number) => {
    if (!isFreeTier || deltaMs <= 0) return;
    await trackVoiceUsage(deltaMs);
    await refreshVoiceBudget();
  }, [isFreeTier, refreshVoiceBudget]);

  useEffect(() => {
    refreshVoiceBudget();
  }, [refreshVoiceBudget]);

  useEffect(() => {
    let mounted = true;
    const loadActiveChild = async () => {
      try {
        const stored = await AsyncStorage.getItem('@edudash_active_child_id');
        if (mounted) {
          setActiveChildId(stored || null);
        }
      } catch {
        if (mounted) setActiveChildId(null);
      }
    };
    loadActiveChild();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!dashInstance || !user?.id) return;
    let cancelled = false;

    const applyLearnerContext = async () => {
      const profileAny = profile as any;
      const role = profile?.role || '';
      
      // Resolve canonical type so K-12 aliases (combined/primary/secondary/etc.) do not fall back to preschool.
      const schoolType = resolveSchoolTypeFromProfile(profileAny);

      const setDefaultAgeBand = async (band: string | null) => {
        if (!band) return;
        try {
          const stored = await AsyncStorage.getItem('@dash_ai_age_band');
          if (!stored || stored === 'auto') {
            await AsyncStorage.setItem('@dash_ai_age_band', band);
          }
        } catch {}
      };

      const toLocale = (lang?: string | null): 'en-ZA' | 'af-ZA' | 'zu-ZA' => {
        const base = normalizeLanguageCode(lang || getCurrentLanguage?.());
        if (base === 'af') return 'af-ZA';
        if (base === 'zu') return 'zu-ZA';
        return 'en-ZA';
      };

      const personality = dashInstance.getPersonality?.();
      const uiLocale = toLocale(getCurrentLanguage?.());
      const targetLocale = personality?.response_language
        ? toLocale(personality.response_language)
        : toLocale(personality?.voice_settings?.language || profileAny?.preferred_language || uiLocale);
      const shouldForceStrict = role === 'parent' || role === 'student' || role === 'learner';

      const needsLanguageUpdate =
        personality?.response_language !== targetLocale ||
        personality?.voice_settings?.language !== targetLocale ||
        (shouldForceStrict && personality?.strict_language_mode !== true);

      if (needsLanguageUpdate) {
        try {
          await dashInstance.savePersonality({
            response_language: targetLocale,
            strict_language_mode: shouldForceStrict ? true : personality?.strict_language_mode,
            voice_settings: {
              ...(personality?.voice_settings || {}),
              language: targetLocale,
            },
          });
        } catch (langErr) {
          console.warn('[useDashAssistant] Failed to enforce language settings:', langErr);
        }
      }

      if (role === 'parent') {
        const schoolId = profile?.organization_id || profile?.preschool_id;
        const children = await fetchParentChildren(user.id, { includeInactive: false, schoolId });
        if (!cancelled) setParentChildren(children);
        const activeChild = children.find(child => child.id === activeChildId) || children[0];
        if (!activeChild) {
          const parentName = profile?.full_name || profile?.first_name || null;
          if (!cancelled) setLearnerContext({
            learnerName: parentName,
            grade: null,
            ageYears: null,
            ageBand: null,
            schoolType,
            role: 'parent',
          });
          dashInstance.updateUserContext({
            age_group: null,
            grade_levels: null,
            organization_type: schoolType || null,
            preferred_language: targetLocale,
            user_role: 'parent',
            subscription_tier: tier || null,
            capability_tier: capabilityTier,
          }).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
          return;
        }

        const classData = Array.isArray(activeChild.classes) ? activeChild.classes[0] : activeChild.classes;
        const grade = activeChild.grade_level || activeChild.grade || classData?.grade_level || null;
        const ageYears = calculateAge(activeChild.date_of_birth);
        const ageBand = resolveAgeBand(ageYears, grade);
        const learnerName = `${activeChild.first_name} ${activeChild.last_name}`.trim() || null;

        if (!cancelled) setLearnerContext({
          learnerName,
          grade,
          ageYears,
          ageBand,
          schoolType,
          role: 'student',
        });

        if (!activeChildId || activeChildId !== activeChild.id) {
          setActiveChildId(activeChild.id);
          try {
            await AsyncStorage.setItem('@edudash_active_child_id', activeChild.id);
          } catch {}
        }

        const ageGroup = ageBand === 'adult'
          ? 'adult'
          : ageBand === '13-15' || ageBand === '16-18'
            ? 'teen'
            : ageBand
              ? 'child'
              : null;

        dashInstance.updateUserContext({
          age_group: ageGroup,
          grade_levels: grade ? [String(grade)] : null,
          organization_type: schoolType || null,
          preferred_language: targetLocale,
          student_id: activeChild.id,
          student_name: learnerName,
          subscription_tier: tier || null,
          capability_tier: capabilityTier,
        }).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });

        await setDefaultAgeBand(ageBand);
        return;
      }

      if (role === 'student' || role === 'learner') {
        const grade = profileAny?.grade_level || null;
        const ageYears = calculateAge(profile?.date_of_birth);
        const ageBand = resolveAgeBand(ageYears, grade);
        const learnerName = profile?.full_name || profile?.first_name || null;

        if (!cancelled) setLearnerContext({
          learnerName,
          grade,
          ageYears,
          ageBand,
          schoolType,
          role,
        });

        const ageGroup = ageBand === 'adult'
          ? 'adult'
          : ageBand === '13-15' || ageBand === '16-18'
            ? 'teen'
            : ageBand
              ? 'child'
              : null;

        dashInstance.updateUserContext({
          age_group: ageGroup,
          grade_levels: grade ? [String(grade)] : null,
          organization_type: schoolType || null,
          preferred_language: targetLocale,
          subscription_tier: tier || null,
          capability_tier: capabilityTier,
        }).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });

        await setDefaultAgeBand(ageBand);
        return;
      }

      const staffName = profile?.full_name || profile?.first_name || null;
      if (!cancelled) setLearnerContext({
        learnerName: staffName,
        grade: null,
        ageYears: null,
        ageBand: null,
        schoolType,
        role,
      });

      dashInstance.updateUserContext({
        age_group: null,
        grade_levels: null,
        organization_type: schoolType || null,
        preferred_language: targetLocale,
        user_role: role || null,
        subscription_tier: tier || null,
        capability_tier: capabilityTier,
      }).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
    };

    applyLearnerContext();
    return () => {
      cancelled = true;
    };
  }, [
    dashInstance,
    user?.id,
    profile?.role,
    profile?.organization_id,
    profile?.preschool_id,
    (profile as any)?.organization_membership?.school_type,
    (profile as any)?.organization_type,
    (profile as any)?.school_type,
    (profile as any)?.usage_type,
    tier,
    capabilityTier,
    profile?.full_name,
    profile?.first_name,
    profile?.date_of_birth,
    activeChildId,
  ]);

  // Scroll utility
  const scrollToBottom = useCallback((opts?: { animated?: boolean; delay?: number; force?: boolean }) => {
    const delay = opts?.delay ?? 120;
    const animated = opts?.animated ?? true;
    const force = opts?.force ?? false;
    const now = Date.now();

    if (force) {
      forcedBottomUntilRef.current = now + 1800;
      setBottomScrollRequestId((prev) => prev + 1);
    }

    // Prevent competing scroll loops while still allowing explicit user-triggered jumps.
    if (!force && now - lastAutoScrollAtRef.current < (animated ? 180 : 120)) {
      return;
    }

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    if (scrollFollowUpTimersRef.current.length > 0) {
      scrollFollowUpTimersRef.current.forEach((timer) => clearTimeout(timer));
      scrollFollowUpTimersRef.current = [];
    }

    const performScroll = (animatedPass: boolean) => {
      const list = flashListRef.current;
      if (!list) return;
      const lastIndex = Math.max(0, (messagesLengthRef.current || 1) - 1);
      let didScroll = false;

      if (Platform.OS === 'web') {
        try {
          // Priority 1: cached DOM scroll node captured from onScroll event
          const scrollNode: any =
            webScrollNodeRef.current ??
            list.getScrollableNode?.() ??
            list.getNativeScrollRef?.() ??
            (list as any)._listRef?.getScrollableNode?.() ??
            (list as any)._listRef?.current?.getScrollableNode?.() ??
            (list as any).rlvRef?.current?._scrollComponent?.getScrollableNode?.() ??
            (list as any).rlvRef?.current?.scrollComponent?.getScrollableNode?.();

          if (scrollNode) {
            // Cache it for future calls
            if (!webScrollNodeRef.current) webScrollNodeRef.current = scrollNode;
            if (typeof scrollNode.scrollTo === 'function') {
              scrollNode.scrollTo({
                top: (scrollNode.scrollHeight ?? 0) + 9999,
                behavior: animatedPass ? 'smooth' : 'auto',
              });
              didScroll = true;
            } else if (typeof scrollNode.scrollTop === 'number') {
              scrollNode.scrollTop = (scrollNode.scrollHeight ?? 0) + 9999;
              didScroll = true;
            }
          }

          // Sentinel-based fallback: scroll a known element at the bottom into view
          if (!didScroll) {
            const sentinel =
              typeof document !== 'undefined'
                ? document.getElementById('dash-scroll-sentinel')
                : null;
            if (sentinel) {
              sentinel.scrollIntoView({ behavior: animatedPass ? 'smooth' : 'auto', block: 'end' });
              didScroll = true;
            }
          }
        } catch (e) {
          console.debug('[useDashAssistant] web DOM scroll failed:', e);
        }

        // Last resort: FlashList scrollToEnd (capped at estimated height, better than nothing)
        if (!didScroll) {
          try { list.scrollToEnd?.({ animated: animatedPass }); didScroll = true; } catch {}
        }

        if (didScroll) lastAutoScrollAtRef.current = Date.now();
        return;
      }

      try {
        if (typeof list.scrollToEnd === 'function') {
          list.scrollToEnd({ animated: animatedPass });
          didScroll = true;
        }
      } catch (e) {
        console.debug('[useDashAssistant] scrollToEnd failed:', e);
      }
      try {
        if (typeof list.scrollToOffset === 'function') {
          list.scrollToOffset({ offset: 999999, animated: false });
          didScroll = true;
        }
      } catch (e) {
        console.debug('[useDashAssistant] scrollToOffset failed:', e);
      }
      try {
        if (typeof list.scrollToIndex === 'function') {
          list.scrollToIndex({ index: lastIndex, animated: false, viewPosition: 1 });
          didScroll = true;
        }
      } catch (e) {
        console.debug('[useDashAssistant] scrollToIndex failed:', e);
      }

      if (didScroll) {
        lastAutoScrollAtRef.current = Date.now();
      }
    };

    const queueFollowUpScroll = (timeoutMs: number) => {
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          performScroll(false);
        });
      }, timeoutMs);
      scrollFollowUpTimersRef.current.push(timer);
    };

    if (delay <= 0 || force) {
      requestAnimationFrame(() => {
        performScroll(animated);
      });
      queueFollowUpScroll(force ? 90 : 140);
      queueFollowUpScroll(force ? 240 : 320);
      if (force) {
        queueFollowUpScroll(520);
        queueFollowUpScroll(900);
      }
      return;
    }

    scrollTimeoutRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        performScroll(animated);
      });
      queueFollowUpScroll(animated ? 180 : 110);
      queueFollowUpScroll(animated ? 360 : 240);
    }, delay);
  }, []);

  const normalizeConversationMessages = useCallback((items: DashMessage[]) => {
    const normalized = items.map((msg) => {
      if (msg.type !== 'user') return msg;
      const { content, sanitized } = sanitizeTutorUserContent(msg.content);
      return sanitized ? { ...msg, content } : msg;
    });
    return normalizeMessagesByTurn(normalized);
  }, []);

  const mapToPersistedMessages = useCallback((items: DashMessage[]) => {
    return items.map((msg) => {
      const meta: any = {};
      if (msg.metadata && typeof msg.metadata === 'object') {
        if ('tts' in msg.metadata) meta.tts = (msg.metadata as any).tts;
        if ('ackType' in msg.metadata) meta.ackType = (msg.metadata as any).ackType;
        if ('turn_id' in msg.metadata) meta.turn_id = (msg.metadata as any).turn_id;
      }
      return {
        id: msg.id,
        type: msg.type === 'task_result' ? 'assistant' : msg.type,
        content: msg.content,
        timestamp: msg.timestamp,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      };
    });
  }, []);

  const persistConversationSnapshot = useCallback(async (conv?: DashConversation | null) => {
    if (!user?.id || !conv?.id) return;
    const messages = mapToPersistedMessages(conv.messages || []);
    await saveConversationSnapshot(user.id, conv.id, messages, LOCAL_SNAPSHOT_MAX);
    await setLastActiveConversationId(user.id, conv.id);
  }, [mapToPersistedMessages, user?.id]);

  const hydrateFromSnapshot = useCallback(async (convId: string) => {
    if (!user?.id) return null;
    const snapshot = await getConversationSnapshot(user.id, convId, LOCAL_SNAPSHOT_LIMIT);
    if (!snapshot?.messages?.length) return null;
    const messages: DashMessage[] = snapshot.messages.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      timestamp: m.timestamp,
      ...(m.meta ? { metadata: { ...(m.meta as any) } } : {}),
    }));
    const createdAt = messages.length > 0 ? Math.min(...messages.map(m => m.timestamp)) : snapshot.updatedAt;
    const updatedAt = snapshot.updatedAt || (messages.length > 0 ? Math.max(...messages.map(m => m.timestamp)) : Date.now());
    const conversation: DashConversation = {
      id: convId,
      title: 'Dash AI Chat',
      messages,
      created_at: createdAt,
      updated_at: updatedAt,
    };
    return { conversation, messages };
  }, [user?.id]);

  const logTutorAttempt = useCallback(async (session: TutorSession, payload: TutorPayload, learnerAnswer: string) => {
    if (!user?.id) return;
    try {
      const studentId = profile?.role === 'parent' ? activeChildId : null;
      const insertPayload = {
        user_id: user.id,
        student_id: studentId,
        session_id: session.id,
        mode: session.mode,
        subject: payload.subject || session.subject || null,
        grade: payload.grade || session.grade || null,
        topic: payload.topic || session.topic || null,
        question: session.currentQuestion || null,
        expected_answer: session.expectedAnswer || null,
        learner_answer: learnerAnswer,
        is_correct: payload.is_correct ?? null,
        score: typeof payload.score === 'number' ? payload.score : null,
        feedback: payload.feedback || null,
        correct_answer: payload.correct_answer || null,
        metadata: {
          explanation: payload.explanation || null,
          misconception: payload.misconception || null,
        },
      };

      await (assertSupabase() as any)
        .from('dash_ai_tutor_attempts')
        .insert(insertPayload);
    } catch (error) {
      console.warn('[useDashAssistant] Failed to log tutor attempt:', error);
    }
  }, [user?.id, profile?.role, activeChildId]);

  const loadChatPrefs = useCallback(async () => {
    try {
      try {
        await initAndMigrate();
      } catch (e) {
        if (__DEV__) console.warn('[useDashAssistant] migration warn', e);
      }
      const [voiceChatPrefs, chatUiPrefs, voiceInputPrefs, rawVoicePrefs] = await Promise.all([
        getVoiceChatPrefs(),
        getChatUIPrefs(),
        getVoiceInputPrefs(profile?.role || null),
        AsyncStorage.getItem('@dash_voice_prefs'),
      ]);
      let explicitAutoSpeak: boolean | null = null;
      if (rawVoicePrefs) {
        try {
          const parsedPrefs = JSON.parse(rawVoicePrefs) as { autoSpeak?: unknown };
          if (typeof parsedPrefs?.autoSpeak === 'boolean') {
            explicitAutoSpeak = parsedPrefs.autoSpeak;
          }
        } catch {
          // Intentionally ignore parse failures and use role defaults.
        }
      }
      setVoiceEnabled(voiceChatPrefs.voiceEnabled ?? true);
      setAutoSpeakResponses(
        resolveAutoSpeakPreference({
          role: profile?.role || null,
          explicitAutoSpeak,
          hasExplicitPreference: typeof explicitAutoSpeak === 'boolean',
        })
      );
      setShowTypingIndicator(chatUiPrefs.showTypingIndicator ?? true);
      setAutoSuggestQuestions(chatUiPrefs.autoSuggestQuestions ?? true);
      setContextualHelp(chatUiPrefs.contextualHelp ?? true);
      setVoiceAutoSend(voiceInputPrefs.autoSend);
      setVoiceAutoSendSilenceMs(voiceInputPrefs.autoSendSilenceMs);
      setVoiceWhisperFlowEnabled(voiceInputPrefs.whisperFlowEnabled ?? true);
      setVoiceWhisperFlowSummaryEnabled(voiceInputPrefs.whisperFlowSummaryEnabled ?? true);
      if (typeof chatUiPrefs.enterToSend === 'boolean') {
        setEnterToSend(chatUiPrefs.enterToSend);
      }
      try {
        const [streamingPref, streamingPrefUserSet] = await Promise.all([
          AsyncStorage.getItem('@dash_streaming_enabled'),
          AsyncStorage.getItem('@dash_streaming_pref_user_set'),
        ]);
        if (streamingPrefUserSet === 'true') {
          setStreamingEnabledPref(streamingPref !== 'false');
        } else {
          // Migration: older builds defaulted this preference to false.
          setStreamingEnabledPref(true);
          void AsyncStorage.multiSet([
            ['@dash_streaming_enabled', 'true'],
            ['@dash_streaming_pref_user_set', 'false'],
          ]);
        }
      } catch {
        setStreamingEnabledPref(true);
      }
    } catch {
      try {
        const enterToSendSetting = await AsyncStorage.getItem('@dash_ai_enter_to_send');
        if (enterToSendSetting !== null) {
          setEnterToSend(enterToSendSetting === 'true');
        }
      } catch {}
    }
  }, [profile?.role]);

  // hasFreeVoiceBudget check - used by TTS gating and quota checks
  const hasFreeVoiceBudget = voiceBudgetRemainingMs === null
    ? true
    : voiceBudgetRemainingMs > 0;

  // Check if user has TTS (text-to-speech) features
  // Note: Free tier gets a limited daily voice budget for TTS only
  const hasTTSAccess = useCallback(() => {
    if (!isFreeTier) return true;
    return hasFreeVoiceBudget;
  }, [isFreeTier, hasFreeVoiceBudget]);

  // STT (speech-to-text / voice input) is always allowed if permissions are granted.
  // Voice INPUT should never be blocked by TTS budget — they are separate features.
  const hasSTTAccess = useCallback(() => {
    return true; // STT gating is handled by provider availability + permissions, not budget
  }, []);

  const stopSpeaking = useCallback(async () => {
    if (!dashInstance) return;
    
    try {
      ttsSessionIdRef.current = null;
      await dashInstance.stopSpeaking();
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      setSpeechChunkProgress(null);
    } catch (error) {
      console.error('Failed to stop speaking:', error);
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      setSpeechChunkProgress(null);
    }
  }, [dashInstance]);

  // Speech functions
  const speakResponse = useCallback(
    async (
      message: DashMessage,
      options?: { preferFastStart?: boolean; forceSpeak?: boolean }
    ) => {
    setSpeechChunkProgress(null);
    await speakDashResponse({
      message,
      dashInstance,
      voiceEnabled,
      hasTTSAccess,
      isFreeTier,
      consumeVoiceBudget,
      isSpeaking,
      speakingMessageId,
      voiceRefs: {
        voiceSessionRef,
        voiceProviderRef,
        voiceInputStartAtRef,
        lastSpeakStartRef,
        ttsSessionIdRef,
        sttFinalizeTimerRef,
        sttTranscriptBufferRef,
      },
      setIsSpeaking,
      setSpeakingMessageId,
      showAlert,
      hideAlert,
      setVoiceEnabled,
      stopSpeaking,
      preferFastStart: options?.preferFastStart,
      forceSpeak: options?.forceSpeak,
      onSpeechChunkProgress: setSpeechChunkProgress,
    });
    },
    [
      dashInstance,
      speakingMessageId,
      isSpeaking,
      hasTTSAccess,
      showAlert,
      hideAlert,
      voiceEnabled,
      stopSpeaking,
      isFreeTier,
      consumeVoiceBudget,
      sttFinalizeTimerRef,
      sttTranscriptBufferRef,
      setSpeechChunkProgress,
    ]
  );

  // Voice and speaking functions (custom gating + alerts)

  // Internal message sender
  const sendMessageInternal = useCallback(async (text: string, attachments: DashAttachment[]) => {
    if (!dashInstance) return;
    const requestId = `dash_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    activeRequestIdRef.current = requestId;
    setActiveToolLabel(null);
    responseLifecycleRef.current = {
      requestId,
      state: 'idle',
      committedText: null,
    };
    const isCurrentRequest = () => activeRequestIdRef.current === requestId;
    const isVoiceTurn = nextVoiceTurnRef.current;
    nextVoiceTurnRef.current = false;
    const scannerAttachmentCount = countScannerAttachments(attachments);
    const turnId = createDashTurnId('dash_assistant_turn');
    const turnStartedAt = Date.now();
    const normalizedRole = String(profile?.role || '').toLowerCase();
    const isTeacherDashboardTutorEntry = handoffSource === 'teacher_dashboard';
    const isK12ParentDashEntry = handoffSource === 'k12_parent_tab';
    const intentRouterEnabled = getFeatureFlagsSync().dash_intent_router_v1 !== false;
    const routeDecision = intentRouterEnabled
      ? resolveDashRouteIntent({
          text,
          handoffSource,
          externalTutorMode,
        })
      : { intent: 'tutor' as DashRouteIntent, reason: 'default_tutor' as const };
    const routeIntent: DashRouteIntent = routeDecision.intent;
    const plannerIntentActive = routeIntent !== 'tutor';
    const shouldForceTutorInteractive =
      routeIntent === 'tutor' && (isTeacherDashboardTutorEntry || !!externalTutorMode);
    const disableImplicitTutorInAdvisor = isK12ParentDashEntry && !shouldForceTutorInteractive;
    const tutorEntrySource: 'teacher_dashboard' | 'default' = isTeacherDashboardTutorEntry
      ? 'teacher_dashboard'
      : 'default';
    const initialResponseMode = plannerIntentActive
      ? 'direct_writing'
      : classifyResponseMode({
          text,
          hasAttachments: attachments.length > 0,
          hasActiveTutorSession: disableImplicitTutorInAdvisor
            ? false
            : !!tutorSessionRef.current?.awaitingAnswer,
          explicitTutorMode: shouldForceTutorInteractive,
        });
    const turnModeHint = initialResponseMode === 'tutor_interactive'
      ? 'tutor'
      : ['teacher', 'principal', 'principal_admin', 'admin', 'super_admin'].includes(normalizedRole)
        ? 'advisor'
        : 'assistant';
    trackDashTelemetry(DASH_TELEMETRY_EVENTS.INTENT_ROUTE_SELECTED, {
      route_intent: routeIntent,
      route_reason: routeDecision.reason,
      router_enabled: intentRouterEnabled,
      handoff_source: handoffSource || null,
      role: normalizedRole || null,
      turn_id: turnId,
    });
    const baseTurnTelemetry = buildDashTurnTelemetry({
      conversationId: resolveActiveConversationId(),
      turnId,
      mode: turnModeHint,
      tier: tier || null,
      voiceProvider: isVoiceTurn ? 'assistant_voice' : 'none',
      fallbackReason: 'none',
      source: 'useDashAssistant.sendMessageInternal',
    });
    track('dash.turn.started', baseTurnTelemetry);

    try {
      setIsLoading(true);
      // Create AbortController so cancelGeneration can abort in-flight requests
      const controller = new AbortController();
      abortControllerRef.current = controller;
      if (isNearBottomRef.current) {
        scrollToBottom({ animated: true, delay: 120 });
      }
      
      // If no attachments on this turn, re-use the most recent image from the conversation
      // (within last 10 messages). This preserves vision context for follow-up questions
      // like "try again", "explain it", "what does it say" without requiring re-upload.
      let effectiveAttachments = attachments;
      if (effectiveAttachments.length === 0) {
        const priorMessages = (conversation?.messages || []).slice(-10);
        for (let mi = priorMessages.length - 1; mi >= 0; mi -= 1) {
          const priorImg = priorMessages[mi]?.attachments?.find((a: any) => a.kind === 'image');
          if (priorImg) {
            effectiveAttachments = [priorImg];
            break;
          }
        }
      }

      if (effectiveAttachments.length > 0) {
        setLoadingStatus('uploading');
        setStatusStartTime(Date.now());
      } else {
        setLoadingStatus('thinking');
        setStatusStartTime(Date.now());
      }

      let conversationIdForUpload = resolveActiveConversationId();
      if (!conversationIdForUpload) {
        const createdId = await dashInstance.startNewConversation('Chat with Dash');
        if (!isCurrentRequest()) return;
        dashInstance.setCurrentConversationId?.(createdId);
        conversationIdForUpload = createdId;
        const createdConversation = await dashInstance.getConversation(createdId);
        if (!isCurrentRequest()) return;
        if (createdConversation) {
          setConversation(createdConversation);
          persistConversationSnapshot(createdConversation).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
        }
      }

      // Upload attachments (skip already-uploaded ones from prior messages re-used for context)
      const attachmentsNeedingUpload = effectiveAttachments.filter((a: any) => a.status !== 'uploaded');
      const alreadyUploaded = effectiveAttachments.filter((a: any) => a.status === 'uploaded');
      const freshUploaded = attachmentsNeedingUpload.length > 0
        ? await dashAttachments.uploadAttachments(attachmentsNeedingUpload, conversationIdForUpload)
        : [];
      if (!isCurrentRequest()) return;
      if (attachmentsNeedingUpload.length > 0 && freshUploaded.length === 0) {
        throw new Error('All selected attachments failed to upload. Please retry; Dash can auto-compress JPG/PNG images.');
      }
      const uploadedAttachments = [...alreadyUploaded, ...freshUploaded];
      const hasAttachmentPayload = uploadedAttachments.length > 0;
      setLoadingStatus(hasAttachmentPayload ? 'analyzing' : 'thinking');
      setStatusStartTime(Date.now());
      if (isNearBottomRef.current) {
        scrollToBottom({ animated: true, delay: 120 });
      }

      // Empty text is fine when the user sends only an image — Dash infers from the attachment.
      const userText = text || '';
      let outgoingText = userText;
      let displayText = userText;
      const languageOverride = detectLanguageOverrideFromText(userText);
      const requestLanguage = resolveResponseLocale({
        explicitOverride: languageOverride,
        responseText: userText,
        fallbackPreference: profile?.preferred_language || getCurrentLanguage?.() || null,
      });
      const languageDirective = buildLanguageDirectiveForTurn({
        locale: requestLanguage.locale,
        source: requestLanguage.source,
      });
      let tutorAction: 'start' | 'evaluate' | null = null;
      let tutorModeForMetadata: TutorMode | null = null;
      let tutorContextOverride: string | null = null;
      let sessionForTutorAction: TutorSession | null = null;
      
      // Build intelligent context with learning style adaptation
      const baseContextOverride = buildDashContextOverride({
        learner: learnerContextRef.current || learnerContext,
        messages,
      });
      const attachmentContextOverride = buildAttachmentContextInternal(uploadedAttachments);
      
      // Check if we should add celebration or greeting
      const messageHistory = messages.map(msg => ({
        role: msg.type === 'task_result' ? 'assistant' : msg.type,
        content: msg.content || '',
      }));
      const needsCelebration = shouldCelebrate(messageHistory);
      const isFirstMessage = messages.length === 0;
      
      // Add celebration hint if detected understanding/progress
      let celebrationHint = '';
      if (needsCelebration && !isFirstMessage) {
        celebrationHint = '\n\n[HINT: The learner just showed understanding or made progress. Celebrate this! Use encouraging phrases like "Great job!", "You got it!", "Nice work!"]';
      }

      const intentContextOverride =
        routeIntent === 'lesson_generation'
          ? [
              'ROUTE INTENT: lesson_generation',
              'Return a complete, classroom-ready lesson plan with objectives, materials, timed steps, worked examples, formative checks, and closure.',
              'If grade/subject is missing, ask one concise clarifier and continue with a safe default.',
            ].join('\n')
          : routeIntent === 'weekly_theme_plan'
            ? [
                'ROUTE INTENT: weekly_theme_plan',
                'Return a Monday-Friday themed plan with daily focus, objectives, activities, and assessment checkpoints.',
                'Use clear headings and teacher-ready structure.',
              ].join('\n')
            : routeIntent === 'daily_routine_plan'
              ? [
                  'ROUTE INTENT: daily_routine_plan',
                  'Return a practical daily program with time blocks, transitions, activity purpose, and required materials.',
                  'Keep output structured and directly executable by school staff.',
                ].join('\n')
              : null;

      const activeSession = tutorSessionRef.current;
      const roleForTutor = String(profile?.role || '').toLowerCase();
      const isLearnerRole = ['parent', 'student', 'learner'].includes(roleForTutor);
      const canRunTutorPipeline =
        routeIntent === 'tutor' &&
        (isLearnerRole || shouldForceTutorInteractive) &&
        !disableImplicitTutorInAdvisor;
      const phonicsRequested = isLearnerRole && detectPhonicsTutorRequest(userText);
      const hasLearningAttachment = attachments.some(
        (attachment) => attachment.kind === 'image' || attachment.kind === 'document'
      );
      const rawResponseMode = classifyResponseMode({
        text: userText,
        hasAttachments: hasLearningAttachment,
        hasActiveTutorSession: disableImplicitTutorInAdvisor ? false : !!activeSession?.awaitingAnswer,
        explicitTutorMode: shouldForceTutorInteractive,
      });
      const responseMode = routeIntent === 'tutor' ? rawResponseMode : 'direct_writing';
      const stopTutor = isTutorStopIntent(userText);
      const leaveTutorMode = activeSession && (routeIntent !== 'tutor' || responseMode !== 'tutor_interactive');
      if ((stopTutor || disableImplicitTutorInAdvisor) && activeSession) {
        setTutorSession(null);
      }
      if (leaveTutorMode && !disableImplicitTutorInAdvisor) {
        setTutorSession(null);
      }

      let tutorIntent = (canRunTutorPipeline && responseMode === 'tutor_interactive')
        ? detectTutorIntent(userText)
        : null;
      if (!tutorIntent && isLearnerRole && hasLearningAttachment && responseMode === 'tutor_interactive') {
        // If user text implies checking/reviewing their work, use explain mode
        // (structured homework help). Otherwise leave null → normal chat handles
        // the image without the rigid <TUTOR_PAYLOAD> JSON constraint.
        const homeworkCheckPattern = /\b(check|mark|correct|grade|right|wrong|mistake|help|explain|review|look at|did I|show me|what is)\b/i;
        if (homeworkCheckPattern.test(userText)) {
          tutorIntent = 'explain';
        }
        // bare image with no homework-check words → normal chat path
      }
      if (!tutorIntent && shouldForceTutorInteractive && !stopTutor) {
        tutorIntent = externalTutorMode || activeSession?.mode || 'diagnostic';
      }
      if (!disableImplicitTutorInAdvisor && activeSession?.awaitingAnswer && !stopTutor) {
        tutorAction = 'evaluate';
        tutorModeForMetadata = activeSession.mode;
        sessionForTutorAction = activeSession;
        tutorContextOverride = buildTutorSystemContext(activeSession, {
          phase: 'evaluate',
          learnerContext: learnerContextRef.current || learnerContext,
          tutorEntrySource: tutorEntrySource,
        });
      } else if (tutorIntent && !stopTutor) {
        const context = extractLearningContext(userText, learnerContextRef.current || learnerContext);
        const phonicsMode = phonicsRequested;
        const enforcedSlowLearnerMode = tutorConfig?.slowLearner === true;
        const newSession: TutorSession = {
          id: createTutorSessionId(),
          mode: tutorIntent,
          slowLearner: enforcedSlowLearnerMode,
          subject: context.subject,
          grade: context.grade,
          topic: context.topic,
          awaitingAnswer: false,
          currentQuestion: null,
          expectedAnswer: null,
          questionIndex: 0,
          totalQuestions: 0,
          correctCount: 0,
          maxQuestions: getMaxQuestions(tutorIntent, learnerContextRef.current || learnerContext, {
            difficulty: 1,
            phonicsMode,
          }),
          difficulty: 1,
          incorrectStreak: 0,
          correctStreak: 0,
          attemptsOnQuestion: 0,
          phonicsMode,
          phonicsStage: phonicsMode ? getInitialPhonicsStage(userText) : null,
          phonicsMastered: [],
        };
        setTutorSession(newSession);
        tutorAction = 'start';
        tutorModeForMetadata = newSession.mode;
        sessionForTutorAction = newSession;
        tutorContextOverride = buildTutorSystemContext(newSession, {
          phase: 'start',
          learnerContext: learnerContextRef.current || learnerContext,
          tutorEntrySource: tutorEntrySource,
        });
      }
      const mergedContextBase = [
        baseContextOverride,
        tutorContextOverride,
        attachmentContextOverride,
        intentContextOverride,
        languageDirective,
        celebrationHint,
      ]
        .filter(Boolean)
        .join('\n\n') || null;

      const aiAttachments = await prepareAttachmentsForAI(uploadedAttachments);
      if (!isCurrentRequest()) return;
      const localUserMessage: DashMessage = {
        id: `local_user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'user',
        content: displayText,
        timestamp: Date.now(),
        // Use aiAttachments so image_base64/previewUri data-URI are stored on the message
        // (enables retry and follow-up re-use without re-uploading)
        attachments: aiAttachments.length > 0 ? aiAttachments : undefined,
        metadata: {
          turn_id: turnId,
        },
      };
      setMessages(prev => [...prev, localUserMessage]);

      // Auto tool execution for low-risk tools (CAPS/data/navigation/PDF).
      // Skip this in tutor-interactive flow to avoid tool-noise overwriting
      // pedagogical responses and to reduce hard-fallback churn.
      let autoToolContext: string | null = null;
      let autoToolExecution: AutoToolExecution | null = null;
      let autoToolOutcome: DashToolOutcome | null = null;
      let plannerIntent: 'tool' | 'plan_mode' | 'none' = 'none';
      let plannerIntentConfidence: number | null = null;
      const allowAutoToolPlanner = responseMode !== 'tutor_interactive';
      if (allowAutoToolPlanner && shouldAttemptToolPlan(outgoingText)) {
        try {
          setActiveToolLabel('Deciding whether a tool can help');
          let supabaseClient: any = null;
          try {
            supabaseClient = assertSupabase();
          } catch {}

          if (supabaseClient) {
            const plan = await planToolCall({
              supabaseClient,
              role: String(profile?.role || 'parent').toLowerCase() || 'parent',
              message: outgoingText,
              tools: plannerTools,
            });

            if (plan?.intent) {
              plannerIntent = plan.intent;
            } else if (plan?.tool) {
              plannerIntent = 'tool';
            }
            if (typeof plan?.intent_confidence === 'number') {
              plannerIntentConfidence = plan.intent_confidence;
            }

            if (plan?.tool) {
              const label =
                autoToolShortcuts.find((tool) => tool.name === plan.tool)?.label || undefined;
              setActiveToolLabel(formatDashToolActivityLabel(plan.tool, label));
              const toolTraceId = `dash_assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              beginToolExecution();
              const execution = await ToolRegistry.execute(plan.tool, plan.parameters || {}, {
                profile,
                user,
                supabase: supabaseClient,
                role: String(profile?.role || 'parent').toLowerCase(),
                tier: tier || 'free',
                organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
                hasOrganization: Boolean((profile as any)?.organization_id || (profile as any)?.preschool_id),
                isGuest: !user?.id,
                trace_id: toolTraceId,
                tool_plan: {
                  source: 'useDashAssistant.auto_planner',
                  tool: plan.tool,
                },
              }).finally(() => {
                endToolExecution();
              });
              if (!isCurrentRequest()) return;
              const executionPayload = (execution?.result && typeof execution.result === 'object')
                ? execution.result as Record<string, unknown>
                : null;
              const executionSummary = executionPayload
                ? String(
                    executionPayload.summary
                    || executionPayload.message
                    || executionPayload.status_message
                    || ''
                  ).trim()
                : '';
              if (execution?.success !== false) {
                autoToolOutcome = {
                  status: 'success',
                  source: 'tool_registry',
                };
                const toolMessageContent = formatToolResultMessage(label || plan.tool, execution);
                autoToolContext = toolMessageContent;
                autoToolExecution = {
                  toolName: plan.tool,
                  toolArgs: (plan.parameters || {}) as Record<string, unknown>,
                  execution,
                  summary: executionSummary || undefined,
                };
              } else {
                autoToolOutcome = {
                  status: 'degraded',
                  source: 'tool_registry',
                  errorCode: String(execution?.error || 'tool_execution_failed'),
                  userSafeNote: 'A helper tool failed, but Dash will continue with the current response.',
                  details: {
                    toolName: plan.tool,
                  },
                };
                logDashTrace('auto_tool_failed_skipped_context', {
                  tool: plan.tool,
                  error: execution?.error || 'tool_execution_failed',
                });
              }
            }
          }
        } catch (toolErr) {
          autoToolOutcome = {
            status: 'degraded',
            source: 'tool_registry',
            errorCode: toolErr instanceof Error ? toolErr.message : 'tool_execution_exception',
            userSafeNote: 'A helper tool failed, but Dash will continue with the current response.',
          };
          console.warn('[useDashAssistant] Auto tool failed:', toolErr);
        } finally {
          if (activeToolExecutionCountRef.current === 0) {
            setActiveToolLabel(null);
          }
        }
      }

      const guidedPlanModeActive = plannerIntent === 'plan_mode';
      if (guidedPlanModeActive) {
        console.info('dash.plan_mode.detected', {
          intent: plannerIntent,
          confidence: plannerIntentConfidence,
          turnId,
          role: String(profile?.role || 'parent').toLowerCase(),
        });
      }

      const mergedContextOverride = [mergedContextBase, autoToolContext ? `TOOL RESULT:\n${autoToolContext}` : null]
        .filter(Boolean)
        .join('\n\n') || null;
      const envStreamingEnabled = 
        process.env.EXPO_PUBLIC_AI_STREAMING_ENABLED === 'true' || 
        process.env.EXPO_PUBLIC_ENABLE_AI_STREAMING === 'true';
      // Streaming works on both web (ReadableStream) and mobile (XHR progressive loading).
      const streamingEnabled = aiStreamingEnabled && (streamingEnabledPref || envStreamingEnabled);
      
      let response: DashMessage;
      const contextWindow = resolveConversationWindowByTier(capabilityTier);
      const contextSeedMessages: DashMessage[] = [
        ...messages,
        localUserMessage,
        ...(autoToolContext
          ? [{
              id: `ctx_tool_${Date.now()}`,
              type: 'assistant' as const,
              content: autoToolContext,
              timestamp: Date.now(),
            }]
          : []),
      ];
      const messagesOverride = buildConversationContext(contextSeedMessages, {
        maxMessages: contextWindow.maxMessages,
        maxTokens: contextWindow.maxTokens,
      });
      const benchmarkRunId = String(process.env.EXPO_PUBLIC_VOICE_BENCHMARK_RUN_ID || '').trim();
      const voiceDictationProbe = voiceDictationProbeRef.current
        ? {
            ...voiceDictationProbeRef.current,
            platform: 'mobile' as const,
            source: 'dash_assistant',
            ...(benchmarkRunId ? { run_id: benchmarkRunId } : {}),
          }
        : undefined;
      if (voiceDictationProbe) {
        voiceDictationProbeRef.current = null;
      }

      const requestMetadata = {
        response_mode: responseMode,
        dash_route_intent: routeIntent,
        language_source: requestLanguage.source || (languageOverride ? 'explicit_override' : 'preference'),
        detected_language: requestLanguage.locale || undefined,
        tutor_entry_source: tutorEntrySource,
        source: isVoiceTurn ? 'dash_assistant_voice' : 'dash_assistant_chat',
        voice_turn: isVoiceTurn || undefined,
        voice_dictation_probe: voiceDictationProbe,
        prefer_streaming_latency: isVoiceTurn || undefined,
        planning_mode: guidedPlanModeActive ? 'guided' : undefined,
        planning_intent: guidedPlanModeActive ? plannerIntent : undefined,
        planning_intent_confidence: plannerIntentConfidence ?? undefined,
        plan_mode_stage: guidedPlanModeActive ? 'discover' : undefined,
      };
      
      if (streamingEnabled) {
        const tempStreamingMsgId = `streaming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const streamStartAt = Date.now();
        let firstChunkAt: number | null = null;
        let lastStreamLogAt = 0;
        let hasReceivedFirstChunk = false;
        let streamTextDraft = '';
        let streamPaintFrame: number | null = null;
        let lastStreamAutoScrollAt = 0;
        const instantPlaceholder = getStreamingPlaceholder(text);
        setResponseLifecycleState(requestId, 'draft_streaming', instantPlaceholder);
        setStreamingMessageId(tempStreamingMsgId);
        setStreamingContent(instantPlaceholder);
        
        const tempStreamingMessage: DashMessage = {
          id: tempStreamingMsgId,
          type: 'assistant',
          content: instantPlaceholder,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, tempStreamingMessage]);
        
        const sendOptions = {
          contextOverride: mergedContextOverride,
          modelOverride: selectedModel,
          messagesOverride,
          metadata: requestMetadata,
          signal: controller.signal,
        } as const;

        const flushStreamDraft = () => {
          if (!isCurrentRequest()) return;
          const currentDraft = streamTextDraft;
          setStreamingContent(currentDraft);
          setMessages((prevMessages) => {
            let changed = false;
            const next = prevMessages.map((msg) => {
              if (msg.id !== tempStreamingMsgId) return msg;
              if (msg.content === currentDraft) return msg;
              changed = true;
              return { ...msg, content: currentDraft };
            });
            return changed ? next : prevMessages;
          });
        };

        const handleStreamChunk = (chunk: string) => {
          if (!isCurrentRequest()) return;
          if (firstChunkAt === null) {
            firstChunkAt = Date.now();
            if (__DEV__) {
              console.log('[useDashAssistant] Streaming first token latency (ms):', firstChunkAt - streamStartAt);
            }
            logDashTrace('stream_first_chunk', {
              latencyMs: firstChunkAt - streamStartAt,
              messageId: tempStreamingMsgId,
              model: selectedModel,
              responseMode,
            });
            if (isNearBottomRef.current) {
              scrollToBottom({ animated: false, delay: 0 });
            }
          }
          const now = Date.now();
          if (now - lastStreamLogAt > 900) {
            lastStreamLogAt = now;
            logDashTrace('stream_progress', {
              elapsedMs: now - streamStartAt,
              chunkChars: chunk.length,
              chunkPreview: chunk.slice(0, 80),
            });
          }
          streamTextDraft = hasReceivedFirstChunk ? `${streamTextDraft}${chunk}` : chunk;
          hasReceivedFirstChunk = true;
          if (streamPaintFrame === null) {
            streamPaintFrame = requestAnimationFrame(() => {
              streamPaintFrame = null;
              flushStreamDraft();
            });
          }
          if (isNearBottomRef.current && now - lastStreamAutoScrollAt > 700) {
            lastStreamAutoScrollAt = now;
            scrollToBottom({ animated: false, delay: 0 });
          }
        };

        try {
          response = await dashInstance.sendMessage(
            outgoingText,
            conversationIdForUpload || undefined,
            aiAttachments.length > 0 ? aiAttachments : undefined,
            handleStreamChunk,
            sendOptions
          );
          if (!isCurrentRequest()) return;
        } catch (streamError) {
          const aborted = streamError instanceof Error
            && (streamError.name === 'AbortError' || streamError.message === 'Aborted');
          if (aborted) {
            throw streamError;
          }
          console.warn('[useDashAssistant] Streaming failed, retrying without stream:', streamError);
          logDashTrace('stream_retry_non_stream', {
            error: streamError instanceof Error ? streamError.message : String(streamError),
            model: selectedModel,
            responseMode,
          });
          response = await dashInstance.sendMessage(
            outgoingText,
            conversationIdForUpload || undefined,
            aiAttachments.length > 0 ? aiAttachments : undefined,
            undefined,
            sendOptions
          );
          if (!isCurrentRequest()) return;
        } finally {
          if (__DEV__) {
            const totalMs = Date.now() - streamStartAt;
            console.log('[useDashAssistant] Streaming request completed (ms):', totalMs);
          }
          logDashTrace('stream_done', {
            totalMs: Date.now() - streamStartAt,
            firstTokenLatencyMs: firstChunkAt ? firstChunkAt - streamStartAt : null,
            model: selectedModel,
            responseMode,
          });
          if (streamPaintFrame !== null) {
            cancelAnimationFrame(streamPaintFrame);
            streamPaintFrame = null;
          }
          if (isCurrentRequest()) {
            setStreamingMessageId(null);
            setStreamingContent('');
          }
          setMessages(prev => prev.filter(msg => msg.id !== tempStreamingMsgId));
        }
      } else {
        response = await dashInstance.sendMessage(
          outgoingText, 
          conversationIdForUpload || undefined, 
          aiAttachments.length > 0 ? aiAttachments : undefined,
          undefined,
          {
            contextOverride: mergedContextOverride,
            modelOverride: selectedModel,
            messagesOverride,
            metadata: requestMetadata,
            signal: controller.signal,
          }
        );
        if (!isCurrentRequest()) return;
      }

      response = mergeAutoToolExecutionIntoResponse(response, autoToolExecution);
      {
        const metadata = { ...((response.metadata || {}) as Record<string, unknown>) };
        metadata.turn_id = turnId;
        metadata.dash_route_intent = routeIntent;
        metadata.response_lifecycle_state = 'committed';
        if (autoToolOutcome) {
          metadata.tool_outcome = autoToolOutcome;
        }
        if (!metadata.tool_origin && metadata.tool_name) {
          metadata.tool_origin = autoToolExecution ? 'auto_planner' : 'server_tool';
        }
        response = {
          ...response,
          metadata: metadata as any,
        };
      }

      if (tutorAction && response?.content) {
        const promptLeak = /return only json|tutor_payload|you are dash, an interactive tutor|tutor mode override/i.test(response.content);
        if (promptLeak && !parseTutorPayload(response.content)) {
          response = {
            ...response,
            content: 'I had a hiccup setting up the tutor. Please try again or tell me the topic and grade.'
          };
        }
      }

      const existingDetectedLanguage = String((response.metadata as any)?.detected_language || '').trim();
      const resolvedLocale = resolveResponseLocale({
        explicitOverride: languageOverride || existingDetectedLanguage || null,
        responseText: response?.content || '',
        fallbackPreference: profile?.preferred_language || getCurrentLanguage?.() || null,
      });
      if (resolvedLocale.locale || responseMode) {
        response = {
          ...response,
          metadata: {
            ...(response.metadata || {}),
            detected_language:
              resolvedLocale.locale || requestLanguage.locale || existingDetectedLanguage || undefined,
            language_source:
              resolvedLocale.source || requestLanguage.source || (languageOverride ? 'explicit_override' : 'preference'),
            response_mode: responseMode,
            tutor_entry_source: tutorEntrySource,
            source: isVoiceTurn ? 'dash_assistant_voice' : 'dash_assistant_chat',
            voice_turn: isVoiceTurn || undefined,
          },
        };
      }

      if (scannerAttachmentCount > 0 && isSuccessfulOCRResponse(response)) {
        const consumeResult = await consumeAutoScanBudget(
          tier || 'free',
          scannerAttachmentCount,
          autoScanUserId
        );
        if (!isCurrentRequest()) return;
        if (!consumeResult.allowed) {
          logDashTrace('auto_scan_budget_overrun', {
            scannerAttachmentCount,
            turnId,
            tier: tier || 'free',
          });
        }
        if (typeof onAutoScanConsumed === 'function') {
          await Promise.resolve(onAutoScanConsumed());
          if (!isCurrentRequest()) return;
        }
      }

      const rawTutorPayload = parseTutorPayload(response?.content || '');
      const hasTutorQuestion = !!rawTutorPayload?.question;
      const hasTutorEvaluation = typeof rawTutorPayload?.is_correct === 'boolean' ||
        !!rawTutorPayload?.feedback ||
        !!rawTutorPayload?.follow_up_question;
      let tutorPayload = (tutorAction === 'start' && !hasTutorQuestion) ||
        (tutorAction === 'evaluate' && !hasTutorEvaluation)
        ? null
        : rawTutorPayload;
      if (!tutorPayload && tutorAction === 'evaluate' && sessionForTutorAction) {
        tutorPayload = buildFallbackTutorEvaluation(sessionForTutorAction, userText, response?.content || '');
      }

      if (tutorPayload && tutorAction === 'start' && tutorPayload.question) {
        const displayContent = buildTutorDisplayContent(tutorPayload, true);
        if (displayContent) {
          tutorOverridesRef.current[response.id] = displayContent;
          response = {
            ...response,
            content: displayContent,
            metadata: {
              ...(response.metadata || {}),
              tutor_phase: tutorModeForMetadata ? getTutorPhaseLabel(tutorModeForMetadata) : getTutorPhaseLabel('diagnostic'),
              tutor_question: true,
              tutor_question_text: tutorPayload.question,
            },
          };
        }

        setTutorSession(prev => {
          if (!prev) return prev;
          const needsContext = tutorPayload.next_step === 'need_context';
          return {
            ...prev,
            subject: tutorPayload.subject || prev.subject,
            grade: tutorPayload.grade || prev.grade,
            topic: tutorPayload.topic || prev.topic,
            difficulty: typeof tutorPayload.difficulty === 'number' ? tutorPayload.difficulty : prev.difficulty,
            awaitingAnswer: true,
            currentQuestion: tutorPayload.question || prev.currentQuestion,
            expectedAnswer: tutorPayload.expected_answer || prev.expectedAnswer,
            questionIndex: needsContext ? prev.questionIndex : prev.questionIndex + 1,
          };
        });
      } else if (tutorPayload && tutorAction === 'evaluate') {
        const basePayload = activeSession
          ? reconcileTutorEvaluation(tutorPayload, userText, activeSession)
          : tutorPayload;
        const isCorrect = basePayload.is_correct === true;
        const nextIncorrectStreak = isCorrect ? 0 : (activeSession?.incorrectStreak || 0) + 1;
        const nextCorrectStreak = isCorrect ? (activeSession?.correctStreak || 0) + 1 : 0;
        const attemptsOnQuestion = isCorrect ? 0 : (activeSession?.attemptsOnQuestion || 0) + 1;
        const adjustedPayload = !isCorrect
          ? applyTutorHints(basePayload, { session: activeSession, incorrectStreak: nextIncorrectStreak })
          : basePayload;
        const displayContent = buildTutorDisplayContent(adjustedPayload, false);
        if (displayContent) {
          tutorOverridesRef.current[response.id] = displayContent;
          response = {
            ...response,
            content: displayContent,
            metadata: {
              ...(response.metadata || {}),
              tutor_phase: tutorModeForMetadata ? getTutorPhaseLabel(tutorModeForMetadata) : getTutorPhaseLabel('practice'),
              tutor_question: !!adjustedPayload.follow_up_question,
              tutor_question_text: adjustedPayload.follow_up_question || undefined,
            },
          };
        }

        if (activeSession) {
          await logTutorAttempt(activeSession, adjustedPayload, userText);
          setTutorSession(prev => {
            if (!prev) return prev;
            const totalQuestions = prev.totalQuestions + 1;
            const correctCount = prev.correctCount + (adjustedPayload.is_correct ? 1 : 0);
            const followUp = adjustedPayload.follow_up_question || null;
            const followExpected = adjustedPayload.next_expected_answer || null;
            let nextDifficulty = prev.difficulty || 1;
            if (prev.slowLearner) {
              // In slow learner mode keep challenge intentionally gentle.
              if (!isCorrect && nextIncorrectStreak >= 1) {
                nextDifficulty = 1;
              } else if (isCorrect && nextCorrectStreak >= 3) {
                nextDifficulty = Math.min(2, nextDifficulty + 1);
              } else {
                nextDifficulty = Math.min(2, nextDifficulty);
              }
            } else if (!isCorrect && nextIncorrectStreak >= 2) {
              nextDifficulty = Math.max(1, nextDifficulty - 1);
            } else if (isCorrect && nextCorrectStreak >= 2) {
              nextDifficulty = Math.min(3, nextDifficulty + 1);
            }
            const adaptiveMaxQuestions = Math.max(
              totalQuestions,
              getMaxQuestions(prev.mode, learnerContextRef.current || learnerContext, {
                difficulty: nextDifficulty,
                phonicsMode: prev.phonicsMode,
              }),
            );
            const currentPhonicsStage = prev.phonicsStage || 'letter_sounds';
            const advancedPhonicsStage =
              prev.phonicsMode && isCorrect && nextCorrectStreak >= 2
                ? nextPhonicsStage(currentPhonicsStage)
                : currentPhonicsStage;
            const masteredTokenSource = adjustedPayload.correct_answer || prev.expectedAnswer || '';
            const masteredToken = String(masteredTokenSource || '').trim().toLowerCase();
            const updatedMastered = prev.phonicsMode && isCorrect && masteredToken
              ? Array.from(new Set([...(prev.phonicsMastered || []), masteredToken])).slice(-24)
              : prev.phonicsMastered;
            if (totalQuestions >= adaptiveMaxQuestions && !followUp) {
              const summary: DashMessage = {
                id: `tutor_summary_${Date.now()}`,
                type: 'assistant',
                content: `Session complete! Score: ${correctCount}/${totalQuestions}.\nI logged your performance so we can track progress over time.`,
                timestamp: Date.now(),
              };
              setMessages(messages => [...messages, summary]);
              return null;
            }

            return {
              ...prev,
              totalQuestions,
              correctCount,
              awaitingAnswer: !!followUp,
              currentQuestion: followUp,
              expectedAnswer: followExpected,
              incorrectStreak: nextIncorrectStreak,
              correctStreak: nextCorrectStreak,
              attemptsOnQuestion,
              difficulty: nextDifficulty,
              maxQuestions: adaptiveMaxQuestions,
              phonicsStage: prev.phonicsMode ? advancedPhonicsStage : prev.phonicsStage,
              phonicsMastered: updatedMastered,
            };
          });
        }
      } else if (!tutorPayload && tutorAction && sessionForTutorAction) {
        const rawResponseText = String(response?.content || '').trim();
        const extractedQuestion = extractTutorQuestionFromText(rawResponseText);
        const looksLikeAckOnly = GENERIC_ACK_PATTERN.test(rawResponseText);
        const hasUsefulResponse =
          rawResponseText.length >= 24 ||
          /[.!?]/.test(rawResponseText) ||
          rawResponseText.includes('\n');
        const preserveModelResponse =
          hasUsefulResponse ||
          (!!extractedQuestion && rawResponseText.length >= 12);

        if (preserveModelResponse && !looksLikeAckOnly) {
          setTutorSession(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              awaitingAnswer: !!extractedQuestion,
              currentQuestion: extractedQuestion || prev.currentQuestion,
              expectedAnswer: null,
            };
          });
        } else {
          const fallbackFromResponse = extractedQuestion;
          const fallbackQuestion = fallbackFromResponse || (() => {
            // If the learner sent an image, use whatever Claude said (it likely
            // analysed the image). Only fall back to grade/subject questions
            // when there is genuinely no attachment to look at.
            if (hasLearningAttachment) {
              return response?.content || 'I can see your work! Let me take a closer look — which question would you like me to check?';
            }
            if (!sessionForTutorAction.grade) return 'What grade are you in?';
            if (!sessionForTutorAction.subject) return 'Which subject is this?';
            return 'What exact question do you need help with?';
          })();

          tutorOverridesRef.current[response.id] = fallbackQuestion;
          response = {
            ...response,
            content: fallbackQuestion,
            metadata: {
              ...(response.metadata || {}),
              tutor_phase: tutorModeForMetadata
                ? getTutorPhaseLabel(tutorModeForMetadata)
                : getTutorPhaseLabel(sessionForTutorAction.mode),
              tutor_question: true,
              tutor_question_text: fallbackQuestion,
            },
          };

          setTutorSession(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              subject: prev.subject,
              grade: prev.grade,
              topic: prev.topic,
              awaitingAnswer: true,
              currentQuestion: fallbackQuestion,
              expectedAnswer: null,
              questionIndex: tutorAction === 'start' ? prev.questionIndex + 1 : prev.questionIndex,
            };
          });
        }
      }

      if (!isCurrentRequest()) return;

      const normalizedResponseText = String(response?.content || '').trim();
      if (normalizedResponseText.length > 0) {
        setResponseLifecycleState(requestId, 'committed', normalizedResponseText);
        trackDashTelemetry(DASH_TELEMETRY_EVENTS.RESPONSE_COMMITTED, {
          turn_id: turnId,
          route_intent: routeIntent,
          response_chars: normalizedResponseText.length,
          model: selectedModel,
          response_mode: responseMode,
        });
        if (autoToolOutcome?.status === 'degraded') {
          trackDashTelemetry(DASH_TELEMETRY_EVENTS.RESPONSE_PRESERVED_AFTER_TOOL_ERROR, {
            turn_id: turnId,
            route_intent: routeIntent,
            tool_source: autoToolOutcome.source,
            tool_error_code: autoToolOutcome.errorCode || null,
          });
        }
      }

      // Add assistant message locally for immediate UI feedback
      logDashTrace('assistant_response', {
        responseId: response.id,
        model: selectedModel,
        responseMode,
        chars: String(response.content || '').length,
        preview: String(response.content || '').slice(0, 180),
        language: String((response.metadata as any)?.detected_language || requestLanguage.locale || ''),
      });
      setMessages(prev => appendAssistantMessageByTurn(prev, response));
      
      setLoadingStatus('responding');
      setStatusStartTime(Date.now());
      if (isNearBottomRef.current) {
        scrollToBottom({ animated: true, delay: 120 });
      }
      
      // Handle dashboard actions
      if (response.metadata?.dashboard_action?.type === 'switch_layout') {
        const newLayout = response.metadata.dashboard_action.layout;
        if (newLayout && (newLayout === 'classic' || newLayout === 'enhanced')) {
          setLayout(newLayout);
          try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch {}
        }
      } else if (response.metadata?.dashboard_action?.type === 'open_screen') {
        const { route, params } = response.metadata.dashboard_action as any;
        if (typeof route === 'string' && route.includes('/screens/ai-lesson-generator')) {
          showAlert({
            title: 'Open Lesson Generator?',
            message: 'Dash suggests opening the AI Lesson Generator with prefilled details.',
            type: 'info',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open', onPress: () => { try { router.push({ pathname: route, params } as any); } catch {} } },
            ],
          });
        } else {
          try { router.push({ pathname: route, params } as any); } catch {}
        }
      }
      
      // Update messages
      const updatedConv = await dashInstance.getConversation(dashInstance.getCurrentConversationId()!);
      if (!isCurrentRequest()) return;
      if (updatedConv && Array.isArray(updatedConv.messages) && updatedConv.messages.length > 0) {
        const overrideMap = tutorOverridesRef.current;
        const merged = normalizeMessagesByTurn(updatedConv.messages.map(msg => {
          const override = overrideMap[msg.id];
          if (override) {
            return { ...msg, content: override };
          }
          if (msg.type === 'user') {
            const { content, sanitized } = sanitizeTutorUserContent(msg.content);
            return sanitized ? { ...msg, content } : msg;
          }
          return msg;
        }));
        setMessages(prev => {
          const candidate = merged.length >= prev.length ? merged : prev;
          const committedText = String(responseLifecycleRef.current.committedText || '').trim();
          if (!committedText) {
            return candidate;
          }
          const hasCommittedInCandidate = candidate.some(
            (msg) => msg.type === 'assistant' && String(msg.content || '').trim() === committedText
          );
          return hasCommittedInCandidate ? candidate : prev;
        });
        setConversation(updatedConv);
        setResponseLifecycleState(requestId, 'finalized');
        if (isNearBottomRef.current) {
          scrollToBottom({ animated: true, delay: 150 });
        }
        persistConversationSnapshot(updatedConv).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });

        // Server-side conversation trim to prevent unbounded DB row growth
        if (
          updatedConv.messages.length > LOCAL_SNAPSHOT_MAX &&
          user?.id &&
          (profile?.organization_id || profile?.preschool_id)
        ) {
          try {
            const svc = new (await import('@/services/dash-ai/DashConversationService')).DashConversationService(
              user.id,
              String(profile.organization_id || profile.preschool_id),
            );
            svc.trimConversation(updatedConv.id, LOCAL_SNAPSHOT_MAX).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
          } catch {}
        }
      }

      // Check for lesson generator intent
      try {
        const intentType = response?.metadata?.user_intent?.primary_intent || '';
        const shouldOpen = intentType === 'create_lesson' || wantsLessonGenerator(userText, response?.content);
        if (shouldOpen) {
          if (!capsReady) {
            showAlert({ title: 'Please wait', message: 'Loading your subscription details. Try again in a moment.', type: 'info' });
            return;
          }
          if (!canInteractiveLessons) {
            showAlert({
              title: 'Upgrade Required',
              message: 'Interactive lessons and activities are available on Premium or Pro Plus plans.',
              type: 'warning',
              buttons: [
                { text: 'Cancel', style: 'cancel' },
                { text: 'View Plans', onPress: () => router.push('/pricing') },
              ],
            });
            return;
          }
          if (user?.id) {
            const lessonQuota = await checkAIQuota('lesson_generation', user.id, 1);
            if (!lessonQuota.allowed) {
              showQuotaExceededAlert('lesson_generation', lessonQuota.quotaInfo, {
                customMessages: {
                  title: 'Lesson Generation Limit Reached',
                  message: 'You have used all lesson generation credits for this month.',
                },
              });
              return;
            }
          }
          showAlert({
            title: 'Open Lesson Generator?',
            message: 'I can open the AI Lesson Generator with the details we discussed.',
            type: 'info',
            buttons: [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open', onPress: () => dashInstance.openLessonGeneratorFromContext(userText, response?.content || '') },
            ],
          });
        }
      } catch {}

      // Auto-speak if enabled
      if (
        shouldAutoSpeak({
          role: profile?.role || null,
          voiceEnabled,
          autoSpeakEnabled: autoSpeakResponses,
          responseText: response?.content,
        })
      ) {
        void speakResponse(response);
      }

      if (responseLifecycleRef.current.state === 'committed') {
        setResponseLifecycleState(requestId, 'finalized');
      }

      track(
        'dash.turn.completed',
        buildDashTurnTelemetry({
          ...baseTurnTelemetry,
          conversationId: dashInstance.getCurrentConversationId?.() || baseTurnTelemetry.conversation_id,
          mode: tutorAction ? 'tutor' : baseTurnTelemetry.mode,
          latencyMs: Date.now() - turnStartedAt,
        })
      );

    } catch (error) {
      // Ignore AbortError — user intentionally cancelled
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted')) {
        return;
      }
      if (!isCurrentRequest()) return;
      console.error('Failed to send message:', error);
      logDashTrace('assistant_error', {
        error: error instanceof Error ? error.message : String(error),
        model: selectedModel,
      });
      track(
        'dash.turn.failed',
        {
          ...buildDashTurnTelemetry({
            ...baseTurnTelemetry,
            conversationId: resolveActiveConversationId() || baseTurnTelemetry.conversation_id,
            latencyMs: Date.now() - turnStartedAt,
          }),
          error: error instanceof Error ? error.message : String(error || 'unknown_error'),
        }
      );
      const errorMessage = error instanceof Error ? error.message : '';
      showAlert({
        title: 'Error',
        message: errorMessage || 'Failed to send message. Please try again.',
        type: 'error',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', style: 'default' }]
      });
    } finally {
      if (isCurrentRequest()) {
        activeRequestIdRef.current = null;
        responseLifecycleRef.current = {
          requestId: null,
          state: 'idle',
          committedText: null,
        };
        abortControllerRef.current = null;
        setIsLoading(false);
        setLoadingStatus(null);
      }
    }
  }, [
    dashInstance,
    conversation,
    scrollToBottom,
    setLayout,
    wantsLessonGenerator,
    showAlert,
    speakResponse,
    autoSpeakResponses,
    voiceEnabled,
    streamingEnabledPref,
    aiStreamingEnabled,
    detectTutorIntent,
    detectPhonicsTutorRequest,
    isTutorStopIntent,
    extractLearningContext,
    buildDashContextOverride,
    prepareAttachmentsForAI,
    getMaxQuestions,
    buildTutorSystemContext,
    parseTutorPayload,
    buildFallbackTutorEvaluation,
    reconcileTutorEvaluation,
    applyTutorHints,
    buildTutorDisplayContent,
    extractTutorQuestionFromText,
    sanitizeTutorUserContent,
    logTutorAttempt,
    getTutorPhaseLabel,
    persistConversationSnapshot,
    resolveActiveConversationId,
    logDashTrace,
    learnerContext,
    capsReady,
    canInteractiveLessons,
    selectedModel,
    user?.id,
    profile?.role,
    handoffSource,
    externalTutorMode,
    onAutoScanConsumed,
    tier,
    capabilityTier,
    autoScanUserId,
    beginToolExecution,
    endToolExecution,
    setResponseLifecycleState,
  ]);

  // Process queue
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || requestQueueRef.current.length === 0) return;
    
    isProcessingRef.current = true;
    const request = requestQueueRef.current.shift();
    
    try {
      if (request) {
        activeRequestSignatureRef.current = request.signature;
        await sendMessageInternal(request.text, request.attachments);
      }
    } finally {
      activeRequestSignatureRef.current = null;
      isProcessingRef.current = false;
    }
    
    if (requestQueueRef.current.length > 0) {
      setTimeout(() => processQueue(), 0);
    }
  }, [sendMessageInternal]);

  const handleVoiceFinalTranscript = useCallback(
    (transcript: string, options: { autoSend: boolean; delayMs: number; probe?: VoiceProbeMetrics }) => {
      cancelVoiceAutoSend();
      if (options.probe) {
        voiceDictationProbeRef.current = {
          ...options.probe,
          platform: 'mobile',
          source: options.probe.source || 'dash_assistant',
        };
      }

      const trimmed = transcript.trim();
      if (!trimmed || !options.autoSend) return;
      const modelPrompt = buildTranscriptModelPrompt(trimmed, {
        preschoolMode: learnerContextRef.current?.schoolType === 'preschool',
      });
      const outboundPrompt = modelPrompt || trimmed;

      const isPreschool = learnerContextRef.current?.schoolType === 'preschool';
      const defaultDelayMs = isPreschool ? 1500 : 850;
      const minDelayMs = isPreschool ? 1200 : 600;
      const maxDelayMs = isPreschool ? 2600 : 1800;
      const parsedDelay = Number(options.delayMs);
      const delayMs = Number.isFinite(parsedDelay)
        ? Math.max(minDelayMs, Math.min(maxDelayMs, parsedDelay))
        : defaultDelayMs;
      voiceAutoSendExpectedTranscriptRef.current = trimmed;
      const deadline = Date.now() + delayMs;
      voiceAutoSendDeadlineRef.current = deadline;
      setVoiceAutoSendCountdownActive(true);
      setVoiceAutoSendCountdownMs(delayMs);

      voiceAutoSendIntervalRef.current = setInterval(() => {
        const remaining = Math.max(
          0,
          (voiceAutoSendDeadlineRef.current || 0) - Date.now(),
        );
        setVoiceAutoSendCountdownMs(remaining);
        if (remaining <= 0 && voiceAutoSendIntervalRef.current) {
          clearInterval(voiceAutoSendIntervalRef.current);
          voiceAutoSendIntervalRef.current = null;
        }
      }, 120);

      voiceAutoSendTimeoutRef.current = setTimeout(() => {
        const expected = voiceAutoSendExpectedTranscriptRef.current.trim();
        const latestInput = inputTextRef.current.trim();
        if (!latestInput || !expected || latestInput !== expected) {
          cancelVoiceAutoSend();
          return;
        }
        nextVoiceTurnRef.current = true;
        sendMessageRef.current(outboundPrompt).catch((error) => {
          console.warn('[useDashAssistant] Voice auto-send failed:', error);
          nextVoiceTurnRef.current = false;
        }).finally(() => {
          cancelVoiceAutoSend();
        });
      }, delayMs);
    },
    [cancelVoiceAutoSend]
  );

  const stopVoiceRecording = useCallback(async () => {
    cancelVoiceAutoSend();
    await stopDashVoiceRecording({
      voiceRefs: {
        voiceSessionRef,
        voiceProviderRef,
        voiceInputStartAtRef,
        lastSpeakStartRef,
        ttsSessionIdRef,
        sttFinalizeTimerRef,
        sttTranscriptBufferRef,
      },
      isFreeTier,
      consumeVoiceBudget,
      setIsRecording,
      setPartialTranscript,
      setInputText,
    });
    setRecordingVoiceActivity(false);
  }, [cancelVoiceAutoSend, consumeVoiceBudget, isFreeTier, setInputText]);

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Keep partial streaming content visible as the final message
    const activeStreamingId = streamingMessageIdRef.current;
    const activeStreamingContent = streamingContentRef.current;
    if (activeStreamingId && activeStreamingContent) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === activeStreamingId
            ? { ...msg, content: activeStreamingContent + '\n\n*(Generation stopped)*' }
            : msg
        )
      );
    }
    setIsLoading(false);
    setLoadingStatus(null);
    setStreamingMessageId(null);
    setStreamingContent('');
  }, []);

  const stopAllActivity = useCallback(async (reason: string = 'user_interrupt') => {
    console.log('[DashVoice] Stop all activity', { reason });
    cancelVoiceAutoSend();
    if (isRecording) {
      await stopVoiceRecording();
    }
    cancelGeneration();
    await stopSpeaking();
  }, [cancelVoiceAutoSend, cancelGeneration, isRecording, stopSpeaking, stopVoiceRecording]);

  // Public send message
  const sendMessage = useCallback(async (text: string = inputText.trim(), overrideAttachments?: any[]) => {
    cancelVoiceAutoSend();
    // If voice capture is active, stop listening before sending.
    if (isRecording) {
      await stopVoiceRecording();
    }

    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const requestAttachments = overrideAttachments ?? [...dashAttachments.selectedAttachments];
    if ((!normalizedText && requestAttachments.length === 0) || !dashInstance) return;
    
    if (user?.id) {
      try {
        // Check for active ad-based quota extension first
        if (isFeatureUnlocked(QUOTA_EXTENSION_FEATURE_KEY)) {
          // Ad-based extension is active — skip quota check, proceed
        } else {
          const quotaCheck = await checkAIQuota(DASH_AI_SERVICE_TYPE, user.id, 1);

          if (!quotaCheck.allowed) {
            const userTier = (capabilityTier || 'free') as import('@/lib/ai/models').SubscriptionTier;

            // Fallback 1: Auto-downgrade for paid tiers on a non-Swift model
            if (shouldAutoDowngrade(userTier, selectedModel)) {
              const fallback = getFallbackModel();
              track('edudash.ai.quota.auto_downgrade', {
                service_type: DASH_AI_SERVICE_TYPE,
                from_model: selectedModel,
                to_model: fallback,
                user_tier: userTier,
              });
              setSelectedModel(fallback);
              // Don't return — let the message send with the downgraded model.
              // The server-side ai-proxy will still enforce its own quota, but
              // Swift messages cost fewer weighted units so they're more likely to pass.
            } else {
              // Fallback 2 & 3: Show alert with rewarded ad / upgrade options
              const fallbackActions = getQuotaFallbackActions({
                tier: userTier,
                currentModel: selectedModel,
                canShowRewardedAd: canShowBanner && isRewardedAdAvailable(userTier),
                hasActiveExtension: false,
              });

              track('edudash.ai.quota.blocked', {
                service_type: DASH_AI_SERVICE_TYPE,
                quota_used: quotaCheck.quotaInfo?.used,
                quota_limit: quotaCheck.quotaInfo?.limit,
                user_tier: userTier,
                fallback_options: fallbackActions.map(a => a.type),
              });

              showQuotaExceededAlert(DASH_AI_SERVICE_TYPE, quotaCheck.quotaInfo, {
                customMessages: {
                  title: 'AI Chat Limit Reached',
                },
                fallbackActions,
                onModelDowngrade: (targetModel) => {
                  setSelectedModel(targetModel);
                },
                onRewardedAd: async () => {
                  const result = await offerRewarded(QUOTA_AD_TAG);
                  if (result.rewarded) {
                    unlockFeature(QUOTA_EXTENSION_FEATURE_KEY, QUOTA_EXTENSION_DURATION_MS);
                    track('edudash.ai.quota.ad_extension_granted', {
                      service_type: DASH_AI_SERVICE_TYPE,
                      user_tier: userTier,
                    });
                  }
                },
              });
              return;
            }
          }
        }
      } catch (quotaError) {
        console.warn('[useDashAssistant] Quota check failed:', quotaError);
      }
    }

    if (user?.id && normalizedText) {
      try {
        const wantsLesson = wantsLessonGenerator(normalizedText);
        if (wantsLesson) {
          const lessonQuota = await checkAIQuota('lesson_generation', user.id, 1);
          if (!lessonQuota.allowed) {
            showQuotaExceededAlert('lesson_generation', lessonQuota.quotaInfo, {
              customMessages: {
                title: 'Lesson Generation Limit Reached',
                message: 'You have used all lesson generation credits for this month.',
              },
            });
            return;
          }
        }
      } catch (lessonQuotaError) {
        console.warn('[useDashAssistant] Lesson quota check failed:', lessonQuotaError);
      }
    }

    const requestSignature = buildDashRequestSignature(normalizedText, requestAttachments);
    const now = Date.now();
    const isQueuedDuplicate = requestQueueRef.current.some(
      (request) => request.signature === requestSignature
    );
    const isActiveDuplicate = activeRequestSignatureRef.current === requestSignature;
    const isRecentDuplicate =
      lastQueuedRequestRef.current?.signature === requestSignature &&
      now - (lastQueuedRequestRef.current?.queuedAt || 0) <= DUPLICATE_SEND_WINDOW_MS;

    if (isQueuedDuplicate || isActiveDuplicate || isRecentDuplicate) {
      if (__DEV__) {
        console.debug('[useDashAssistant] Suppressed duplicate Dash send', {
          requestSignature,
          isQueuedDuplicate,
          isActiveDuplicate,
          isRecentDuplicate,
        });
      }
      return;
    }
    
    requestQueueRef.current.push({
      text: normalizedText,
      attachments: requestAttachments,
      signature: requestSignature,
      queuedAt: now,
    });
    lastQueuedRequestRef.current = {
      signature: requestSignature,
      queuedAt: now,
    };

    setInputText('');
    dashAttachments.setSelectedAttachments([]);
    processQueue();
  }, [cancelVoiceAutoSend, inputText, dashAttachments, dashInstance, user?.id, tier, processQueue, wantsLessonGenerator, isRecording, stopVoiceRecording, capabilityTier, selectedModel, setSelectedModel, canShowBanner, offerRewarded, unlockFeature, isFeatureUnlocked]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const sendTutorAnswer = useCallback(async (answer: string, sourceMessageId?: string) => {
    const trimmed = answer.trim();
    if (!trimmed) return;

    const activeSession = tutorSessionRef.current;
    if (activeSession) {
      track('edudash.ai.tutor.answer', {
        session_id: activeSession.id,
        mode: activeSession.mode,
        source_message_id: sourceMessageId,
      });
    }

    await sendMessage(trimmed);
  }, [sendMessage]);

  // Attachment handlers
  // Attachment functions delegated to dashAttachments hook

  // Handle voice input mic press - START/STOP toggle
  const handleInputMicPress = useCallback(async () => {
    cancelVoiceAutoSend();
    if (isSpeaking) {
      await stopSpeaking();
      return;
    }
    await handleDashVoiceInputPress({
      hasTTSAccess,
      hasSTTAccess,
      isRecording,
      stopVoiceRecording,
      tier,
      showAlert,
      hideAlert,
      dashInstance,
      preferredLanguage: profile?.preferred_language || null,
      resolveVoiceLocale,
      isFreeTier,
      consumeVoiceBudget,
      setIsRecording,
      setPartialTranscript,
      setInputText,
      existingInputText: inputText,
      voiceAutoSend,
      voiceAutoSendSilenceMs,
      voiceWhisperFlowEnabled,
      voiceWhisperFlowSummaryEnabled,
      isPreschoolMode: learnerContext?.schoolType === 'preschool',
      onFinalTranscript: handleVoiceFinalTranscript,
      onVoiceActivity: setRecordingVoiceActivity,
      voiceRefs: {
        voiceSessionRef,
        voiceProviderRef,
        voiceInputStartAtRef,
        lastSpeakStartRef,
        ttsSessionIdRef,
        sttFinalizeTimerRef,
        sttTranscriptBufferRef,
      },
    });
  }, [
    cancelVoiceAutoSend,
    isSpeaking,
    stopSpeaking,
    hasTTSAccess,
    hasSTTAccess,
    isRecording,
    stopVoiceRecording,
    tier,
    showAlert,
    hideAlert,
    dashInstance,
    profile?.preferred_language,
    resolveVoiceLocale,
    isFreeTier,
    consumeVoiceBudget,
    voiceAutoSend,
    voiceAutoSendSilenceMs,
    voiceWhisperFlowEnabled,
    voiceWhisperFlowSummaryEnabled,
    learnerContext?.schoolType,
    handleVoiceFinalTranscript,
    inputText,
    setRecordingVoiceActivity,
    sttFinalizeTimerRef,
    sttTranscriptBufferRef,
  ]);

  // Voice session cleanup handled locally

  const startNewConversation = useCallback(async () => {
    if (!dashInstance) return;
    
    try {
      const newConvId = await dashInstance.startNewConversation('Chat with Dash');
      const newConv = await dashInstance.getConversation(newConvId);
      if (newConv) {
        setConversation(newConv);
        persistConversationSnapshot(newConv).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
        setMessages([]);
        setInputText('');
        dashAttachments.setSelectedAttachments([]);
        setStreamingMessageId(null);
        setStreamingContent('');
        setUnreadCount(0);
        setTutorSession(null);
        tutorOverridesRef.current = {};
        
        // Clear voice state
        if (isRecording) {
          await stopVoiceRecording();
        }
        
        const greeting: DashMessage = {
          id: `greeting_${Date.now()}`,
          type: 'assistant',
          content: dashInstance.getPersonality().greeting,
          timestamp: Date.now(),
        };
        setMessages([greeting]);
      }
    } catch (error) {
      console.error('Failed to start new conversation:', error);
      showAlert({
        title: 'Error',
        message: 'Failed to start new conversation.',
        type: 'error',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', style: 'default' }]
      });
    }
  }, [dashInstance, dashAttachments, isRecording, showAlert, stopVoiceRecording, persistConversationSnapshot]);

  const runTool = useCallback(
    async (toolName: string, params: Record<string, any>) => {
      const tool = ToolRegistry.getTool(toolName);
      const label = tool?.name || toolName;

      if (!tool) {
        showAlert({
          title: 'Tool Not Found',
          message: `The tool "${toolName}" is not available right now.`,
          type: 'warning',
          icon: 'alert-circle-outline',
          buttons: [{ text: 'OK', style: 'default' }],
        });
        return;
      }

      let supabaseClient: any = null;
      try {
        supabaseClient = assertSupabase();
      } catch {}

      const context = {
        profile,
        user,
        supabase: supabaseClient,
        role: String(profile?.role || 'parent').toLowerCase(),
        tier: tier || 'free',
        organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
        hasOrganization: Boolean((profile as any)?.organization_id || (profile as any)?.preschool_id),
        isGuest: !user?.id,
        trace_id: `dash_assistant_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tool_plan: {
          source: 'useDashAssistant.runTool',
          tool: toolName,
        },
      };

      setActiveToolLabel(formatDashToolActivityLabel(toolName, label));
      beginToolExecution();
      const execution = await ToolRegistry.execute(toolName, params, context).finally(() => {
        endToolExecution();
      });
      const content = formatToolResultMessage(label, execution);

      const toolMessage: DashMessage = {
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'assistant',
        content,
        timestamp: Date.now(),
        metadata: {
          tool_name: toolName,
          tool_result: execution,
          tool_args: params || {},
          tool_origin: 'manual_tool',
          tool_outcome: execution?.success === false
            ? {
                status: 'failed',
                source: 'tool_registry',
                errorCode: String(execution?.error || 'manual_tool_failed'),
              }
            : {
                status: 'success',
                source: 'tool_registry',
              },
        },
      };

      setMessages((prev) => [...prev, toolMessage]);

      const convId = dashInstance?.getCurrentConversationId?.();
      if (dashInstance && convId) {
        try {
          await dashInstance.addMessageToConversation(convId, toolMessage);
        } catch (error) {
          console.warn('[useDashAssistant] Failed to persist tool message:', error);
        }
      }
    },
    [dashInstance, profile, user, showAlert, tier, beginToolExecution, endToolExecution]
  );

  // Initialize Dash AI
  const INIT_TIMEOUT_MS = 25_000; // Prevent permanent hang if init/hydrate stalls (raised from 10s for slow networks/devices)
  useEffect(() => {
    const initializeDash = async () => {
      const initBody = async () => {
        const module = await import('@/services/dash-ai/DashAICompat');
        const DashClass = (module as any).DashAIAssistant || (module as any).default;
        const dash: IDashAIAssistant | null = DashClass?.getInstance?.() || null;
        if (!dash) throw new Error('DashAIAssistant unavailable');
        await dash.initialize();
        setDashInstance(dash);
        // NOTE: setIsInitialized(true) is deferred to AFTER all messages load
        // to prevent a flash of the empty state before orb/conversation data arrives

        const preferOrbHandoff = handoffSource === 'orb' || handoffSource === 'dash_voice_orb';
        let hasExistingMessages = false;

        if (conversationId) {
          const snapshot = await hydrateFromSnapshot(conversationId);
          const hasSnapshot = !!snapshot;
          if (hasSnapshot) {
            hasExistingMessages = snapshot.messages.length > 0;
            setConversation(snapshot.conversation);
            setMessages(normalizeConversationMessages(snapshot.messages));
            dash.setCurrentConversationId(conversationId);
          }
          const existingConv = await dash.getConversation(conversationId);
          if (existingConv) {
            hasExistingMessages = (existingConv.messages?.length || 0) > 0;
            setConversation(existingConv);
            setMessages(normalizeConversationMessages(existingConv.messages || []));
            dash.setCurrentConversationId(conversationId);
            persistConversationSnapshot(existingConv).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
          } else if (hasSnapshot) {
            dash.setCurrentConversationId(conversationId);
          }
        } else {
          const savedConvId = await AsyncStorage.getItem('@dash_ai_current_conversation_id');
          const lastActiveId = user?.id ? await getLastActiveConversationId(user.id) : null;
          let newConvId = savedConvId || lastActiveId || null;
          
          if (newConvId) {
            const snapshot = await hydrateFromSnapshot(newConvId);
            const hasSnapshot = !!snapshot;
            if (hasSnapshot) {
              hasExistingMessages = snapshot.messages.length > 0;
              setConversation(snapshot.conversation);
              setMessages(normalizeConversationMessages(snapshot.messages));
              dash.setCurrentConversationId(newConvId);
            }
            const existingConv = await dash.getConversation(newConvId);
            if (existingConv) {
              hasExistingMessages = (existingConv.messages?.length || 0) > 0;
              setConversation(existingConv);
              setMessages(normalizeConversationMessages(existingConv.messages || []));
              dash.setCurrentConversationId(newConvId);
              persistConversationSnapshot(existingConv).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
            } else if (!hasSnapshot) {
              newConvId = null;
            } else {
              dash.setCurrentConversationId(newConvId);
            }
          }
          
          if (!newConvId) {
            try {
              const convs = await dash.getAllConversations();
              if (Array.isArray(convs) && convs.length > 0) {
                const latest = convs.reduce((a: any, b: any) => (a.updated_at > b.updated_at ? a : b));
                hasExistingMessages = (latest.messages?.length || 0) > 0;
                setConversation(latest);
                setMessages(normalizeConversationMessages(latest.messages || []));
                dash.setCurrentConversationId(latest.id);
                persistConversationSnapshot(latest).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
              } else {
                const createdId = await dash.startNewConversation('Chat with Dash');
                const newConv = await dash.getConversation(createdId);
                if (newConv) {
                  setConversation(newConv);
                  persistConversationSnapshot(newConv).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
                }
              }
            } catch {
              const createdId = await dash.startNewConversation('Chat with Dash');
              const newConv = await dash.getConversation(createdId);
              if (newConv) {
                setConversation(newConv);
                persistConversationSnapshot(newConv).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
              }
            }
          }
        }

        // Load chat/voice preferences
        await loadChatPrefs();

        // Check for ORB session messages to carry over
        // Supports both voice orb format ({conversationId, messages, updatedAt})
        // and text orb format (plain array of ChatMessage objects)
        let orbMessagesLoaded = false;
        if ((preferOrbHandoff || !hasExistingMessages) && user?.id) {
          try {
            const legacyProfileId = profile?.id && profile.id !== user.id ? profile.id : null;
            // Check voice orb keys first, then text orb keys as fallback
            const candidateKeys = [
              `dash:orb-session:${user.id}`,
              legacyProfileId ? `dash:orb-session:${legacyProfileId}` : null,
              `@dash_orb_chat_${user.id}`,
              legacyProfileId ? `@dash_orb_chat_${legacyProfileId}` : null,
            ].filter((key): key is string => Boolean(key));

            let orbData: any = null;
            const consumedKeys: string[] = [];
            // Allow 2-hour window (was 30 min) — parents may take a while before continuing
            const ORB_EXPIRY_MS = 2 * 60 * 60 * 1000;
            for (const key of candidateKeys) {
              const raw = await AsyncStorage.getItem(key);
              if (!raw) continue;
              consumedKeys.push(key);
              try {
                const parsed = JSON.parse(raw);
                // Voice orb format: { messages: [...], updatedAt, conversationId }
                if (parsed?.messages?.length > 0 && (Date.now() - (parsed.updatedAt || 0)) < ORB_EXPIRY_MS) {
                  orbData = parsed;
                  break;
                }
                // Text orb format: plain array of ChatMessage objects
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const filtered = parsed.filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content);
                  if (filtered.length > 0) {
                    // Check expiry using last message timestamp
                    const lastTs = filtered[filtered.length - 1]?.timestamp;
                    const lastTime = lastTs ? new Date(lastTs).getTime() : 0;
                    if (lastTime > 0 && (Date.now() - lastTime) < ORB_EXPIRY_MS) {
                      orbData = { messages: filtered.map((m: any) => ({ role: m.role, content: m.content })), updatedAt: lastTime };
                      break;
                    }
                  }
                }
              } catch {
                // ignore malformed orb payloads
              }
            }

            if (orbData?.messages?.length > 0) {
              const orbMessages: DashMessage[] = orbData.messages.map((m: any, i: number) => ({
                id: `orb_${orbData.conversationId || 'handoff'}_${i}`,
                type: m.role === 'user' ? 'user' : 'assistant',
                content: String(m.content || ''),
                timestamp: (orbData.updatedAt || Date.now()) - ((orbData.messages.length - i) * 1000),
              }));

              if (preferOrbHandoff) {
                try {
                  const handoffConversationId = await dash.startNewConversation('Dash Orb Chat');
                  dash.setCurrentConversationId?.(handoffConversationId);
                  let seededViaSyntheticConversation = false;

                  const addMessage = (dash as any).addMessageToConversation;
                  if (typeof addMessage === 'function') {
                    for (const message of orbMessages) {
                      await addMessage.call(dash, handoffConversationId, message);
                    }
                  } else {
                    const nowTs = Date.now();
                    const synthesizedConversation: DashConversation = {
                      id: handoffConversationId,
                      title: 'Dash Orb Chat',
                      messages: orbMessages,
                      created_at: nowTs,
                      updated_at: nowTs,
                    };
                    setConversation(synthesizedConversation);
                    setMessages(normalizeConversationMessages(orbMessages));
                    persistConversationSnapshot(synthesizedConversation).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
                    hasExistingMessages = orbMessages.length > 0;
                    seededViaSyntheticConversation = true;
                  }

                  if (!seededViaSyntheticConversation) {
                    const handoffConversation = await dash.getConversation(handoffConversationId);
                    if (handoffConversation) {
                      setConversation(handoffConversation);
                      setMessages(normalizeConversationMessages(handoffConversation.messages || []));
                      persistConversationSnapshot(handoffConversation).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
                      hasExistingMessages = (handoffConversation.messages?.length || 0) > 0;
                    } else {
                      setMessages(orbMessages);
                      hasExistingMessages = orbMessages.length > 0;
                    }
                  }
                } catch (handoffErr) {
                  console.warn('[useDashAssistant] Orb handoff conversation bootstrap failed:', handoffErr);
                  setMessages(orbMessages);
                  hasExistingMessages = orbMessages.length > 0;
                }
              } else {
                setMessages(orbMessages);
                hasExistingMessages = orbMessages.length > 0;
              }

              orbMessagesLoaded = true;
              for (const key of consumedKeys) {
                await AsyncStorage.removeItem(key);
              }
            }
          } catch (orbErr) {
            console.warn('[useDashAssistant] Failed to load ORB session:', orbErr);
          }
        }

        // Send initial message or add greeting
        const trimmedInitialMessage = String(initialMessage || '').trim();
        if (trimmedInitialMessage) {
          if (initialMessageSentRef.current !== trimmedInitialMessage) {
            initialMessageSentRef.current = trimmedInitialMessage;
            sendMessage(trimmedInitialMessage);
          }
        } else if (!hasExistingMessages && !orbMessagesLoaded && externalTutorMode && !externalTutorKickoffSentRef.current) {
          externalTutorKickoffSentRef.current = true;
          sendMessage(buildTutorKickoffPrompt(externalTutorMode, tutorConfig));
        } else if (!hasExistingMessages && !orbMessagesLoaded) {
          const greeting: DashMessage = {
            id: `greeting_${Date.now()}`,
            type: 'assistant',
            content: dash.getPersonality().greeting,
            timestamp: Date.now(),
          };
          setMessages([greeting]);
        }

        // Mark initialized AFTER all data is loaded — prevents flash of empty state
        setIsInitialized(true);
      };

      try {
        await Promise.race([
          initBody(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Dash initialization timed out')), INIT_TIMEOUT_MS)
          ),
        ]);
      } catch (error) {
        console.error('Failed to initialize Dash:', error);
        // CRITICAL: Always mark initialized to prevent permanent hang
        setIsInitialized(true);
        // Show a greeting message even on error
        setMessages([
          {
            id: `error_greeting_${Date.now()}`,
            type: 'assistant',
            content:
              "Hi! I'm having trouble connecting right now. Try sending a message and I'll do my best to help.",
            timestamp: Date.now(),
          },
        ]);
      }
    };

    initializeDash();
  }, [
    conversationId,
    initialMessage,
    handoffSource,
    externalTutorMode,
    tutorConfig,
    loadChatPrefs,
    normalizeConversationMessages,
    hydrateFromSnapshot,
    persistConversationSnapshot,
    profile?.id,
    user?.id,
  ]);

  // Auto-scroll effects
  useEffect(() => {
    if (!isInitialized || messages.length === 0 || !flashListRef.current) return;
    const activeConversationId = conversation?.id || conversationId || '__dash_default__';
    if (initialConversationScrollRef.current === activeConversationId) return;
    initialConversationScrollRef.current = activeConversationId;

    scrollToBottom({ animated: false, delay: 0, force: true });
    const settleTimer = setTimeout(() => {
      scrollToBottom({ animated: false, delay: 0, force: true });
    }, 180);

    return () => {
      clearTimeout(settleTimer);
    };
  }, [conversation?.id, conversationId, isInitialized, messages.length, scrollToBottom]);

  useEffect(() => {
    const isTypingActive = isLoading || !!loadingStatus;
    const becameActive = isTypingActive && !wasTypingActiveRef.current;
    if (becameActive && isNearBottomRef.current && flashListRef.current) {
      scrollToBottom({ animated: false, delay: 0 });
    }
    wasTypingActiveRef.current = isTypingActive;
  }, [isLoading, loadingStatus, scrollToBottom]);

  // Unread count tracking
  useEffect(() => {
    if (!isInitialized) return;
    const prevLen = prevLengthRef.current || 0;
    const currLen = messages.length;
    if (currLen > prevLen) {
      if (isNearBottom) {
        setUnreadCount(0);
      } else {
        setUnreadCount((c) => Math.min(999, c + (currLen - prevLen)));
      }
    }
    prevLengthRef.current = currLen;
  }, [messages.length, isNearBottom, isInitialized]);

  // Focus effect for conversation refresh
  useFocusEffect(
    useCallback(() => {
      loadChatPrefs();
      let active = true;
      const focusScrollTimers = [90, 240, 480].map((timeoutMs) => (
        setTimeout(() => {
          if (!active || messagesLengthRef.current === 0) return;
          scrollToBottom({ animated: false, delay: 0, force: true });
        }, timeoutMs)
      ));

      if (dashInstance && conversation?.id) {
        dashInstance.getConversation(conversation.id).then((updatedConv: any) => {
          if (!active) return;
          const currentLength = messagesLengthRef.current;
          if (updatedConv && updatedConv.messages.length !== currentLength) {
            setMessages(normalizeConversationMessages(updatedConv.messages));
            setConversation(updatedConv);
            persistConversationSnapshot(updatedConv).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
            [70, 210].forEach((timeoutMs) => {
              const refreshScrollTimer = setTimeout(() => {
                if (!active) return;
                scrollToBottom({ animated: false, delay: 0, force: true });
              }, timeoutMs);
              focusScrollTimers.push(refreshScrollTimer);
            });
          }
        }).catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
      }

      return () => {
        active = false;
        initialConversationScrollRef.current = null;
        focusScrollTimers.forEach((timer) => clearTimeout(timer));
        stopAllActivity().catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
      };
    }, [
      dashInstance,
      conversation?.id,
      loadChatPrefs,
      stopAllActivity,
      normalizeConversationMessages,
      persistConversationSnapshot,
      scrollToBottom,
    ])
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (scrollFollowUpTimersRef.current.length > 0) {
        scrollFollowUpTimersRef.current.forEach((timer) => clearTimeout(timer));
        scrollFollowUpTimersRef.current = [];
      }
      cancelVoiceAutoSend();
      if (sttFinalizeTimerRef.current) {
        clearTimeout(sttFinalizeTimerRef.current);
        sttFinalizeTimerRef.current = null;
      }
      sttTranscriptBufferRef.current = '';
      setRecordingVoiceActivity(false);
      // Abort any in-flight AI request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Stop active voice recording to release microphone
      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop().catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
        voiceSessionRef.current = null;
      }
      voiceProviderRef.current = null;
      if (dashInstance) {
        stopSpeaking().catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
        dashInstance.cleanup();
      }
    };
  }, [cancelVoiceAutoSend, dashInstance, stopSpeaking]);

  // Web beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (dashInstance && isSpeaking) {
        stopSpeaking().catch((e: unknown) => { if (__DEV__) console.warn('[DashAssistant] Suppressed:', (e as Error)?.message); });
      }
    };

    if (
      Platform.OS === 'web' && 
      typeof window !== 'undefined' && 
      typeof window.addEventListener === 'function'
    ) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
    return undefined;
  }, [dashInstance, isSpeaking, stopSpeaking]);

  return {
    // State
    messages,
    inputText,
    setInputText,
    isLoading,
    hasActiveToolExecution,
    activeToolLabel,
    loadingStatus,
    streamingMessageId,
    streamingContent,
    isSpeaking,
    speakingMessageId,
    conversation,
    dashInstance,
    isInitialized,
    enterToSend,
    setEnterToSend,
    voiceEnabled,
    showTypingIndicator,
    autoSuggestQuestions,
    contextualHelp,
    selectedAttachments: dashAttachments.selectedAttachments,
    isUploading: dashAttachments.isUploading,
    attachmentProgress: dashAttachments.attachmentProgress,
    isNearBottom,
    setIsNearBottom,
    unreadCount,
    setUnreadCount,
    bottomScrollRequestId,
    availableModels,
    selectedModel,
    setSelectedModel,
    
    // Voice input state
    isRecording,
    recordingVoiceActivity,
    partialTranscript,
    speechChunkProgress,
    voiceAutoSendCountdownActive,
    voiceAutoSendCountdownMs,
    
    // Alert state for premium modals
    alertState,
    hideAlert,
    learnerContext,
    tutorSession,
    
    // Parent child management
    parentChildren,
    activeChildId,
    setActiveChildId,
    
    // Refs
    flashListRef,
    inputRef,
    webScrollNodeRef,
    
    // Actions
    sendMessage,
    sendTutorAnswer,
    cancelGeneration,
    stopAllActivity,
    speakResponse,
    stopSpeaking,
    scrollToBottom,
    handleAttachFile: dashAttachments.handleAttachFile,
    handlePickDocuments: dashAttachments.handlePickDocuments,
    handlePickImages: dashAttachments.handlePickImages,
    handleTakePhoto: dashAttachments.handleTakePhoto,
    handleRemoveAttachment: dashAttachments.handleRemoveAttachment,
    addAttachments,
    handleInputMicPress,
    stopVoiceRecording,
    cancelVoiceAutoSend,
    startNewConversation,
    runTool,
    
    // Helpers
    extractFollowUps,
    wantsLessonGenerator,
    
    // Subscription
    tier,
    subReady,
    refreshTier,
  };
}
