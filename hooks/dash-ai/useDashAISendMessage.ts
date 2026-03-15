/**
 * hooks/dash-ai/useDashAISendMessage.ts
 *
 * The core AI send pipeline extracted from useDashAssistantImpl.
 * Orchestrates: route intent → attachments → context → tutor → tool planner →
 * streaming/non-streaming AI call → post-response → persistence → auto-speak.
 *
 * Returns `sendMessageInternal` and `processQueue` for use by the facade.
 */

import { useCallback, useRef, useMemo } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import type { DashMessage, DashConversation, DashAttachment } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import type { DashRouteIntent } from '@/features/dash-assistant/types';
import type { LearnerContext } from '@/lib/dash-ai/learnerContext';
import type { TutorSession } from '@/hooks/dash-assistant/tutorTypes';
import type { AIModelId } from '@/lib/ai/models';
import type { AlertState, PendingDashRequest, ResponseLifecycleTracker } from './types';
import type { SpeechChunkProgress } from '@/hooks/dash-assistant/voiceHandlers';
import type { DashToolOutcome } from '@/services/tools/types';

import { track } from '@/lib/analytics';
import { DASH_TELEMETRY_EVENTS, trackDashTelemetry } from '@/lib/telemetry/events';
import { buildDashTurnTelemetry, createDashTurnId } from '@/lib/dash-ai/turnTelemetry';
import { checkAIQuota } from '@/lib/ai/guards';
import { assertSupabase } from '@/lib/supabase';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { ToolRegistry } from '@/services/AgentTools';
import { formatToolResultMessage } from '@/lib/ai/toolUtils';
import { planToolCall, shouldAttemptToolPlan } from '@/lib/ai/toolPlanner';
import { resolveDashRouteIntent } from '@/features/dash-assistant/types';
import {
  buildConversationContext,
  resolveConversationWindowByTier,
} from '@/hooks/dash-assistant/conversationContext';
import {
  buildAttachmentContextInternal,
  buildDashContextOverride,
  prepareAttachmentsForAI,
  wantsLessonGenerator,
} from '@/hooks/dash-assistant/assistantHelpers';
import {
  mergeAutoToolExecutionIntoResponse,
  type AutoToolExecution,
} from '@/features/dash-assistant/autoToolMerge';
import {
  appendAssistantMessageByTurn,
  normalizeMessagesByTurn,
} from '@/features/dash-assistant/turnOrdering';
import { sanitizeTutorUserContent } from '@/hooks/dash-assistant/assistantHelpers';
import { parseTutorPayload } from '@/hooks/dash-assistant/tutorUtils';
import { shouldCelebrate } from '@/lib/dash-ai/promptBuilder';
import { classifyResponseMode } from '@/lib/dash-ai/responseMode';
import {
  buildLanguageDirectiveForTurn,
  detectLanguageOverrideFromText,
  resolveResponseLocale,
} from '@/lib/dash-ai/languageRouting';
import {
  consumeAutoScanBudget,
} from '@/lib/dash-ai/imageBudget';
import {
  countScannerAttachments,
  isSuccessfulOCRResponse,
} from '@/lib/dash-ai/retakeFlow';
import { getCurrentLanguage } from '@/lib/i18n';
import {
  resolveAutoSpeakPreference,
  shouldAutoSpeak,
} from '@/features/dash-assistant/voiceAutoSpeakPolicy';
import { formatDashToolActivityLabel } from './types';
import { resolveTutorPipeline, processTutorResponse } from './sendMessageTutor';
import { createStreamingSetup, sendWithStreamingFallback } from './sendMessageStreaming';

// ─── Types ──────────────────────────────────────────────────

export interface UseDashAISendMessageDeps {
  // Instances
  dashInstance: IDashAIAssistant | null;

  // State
  messages: DashMessage[];
  conversation: DashConversation | null;
  selectedModel: AIModelId;
  streamingEnabledPref: boolean;

  // Auth/profile
  user: { id: string } | null;
  profile: Record<string, any> | null;
  tier: string | undefined;
  capabilityTier: string;

  // Options
  handoffSource: string | undefined;
  externalTutorMode: string | null | undefined;
  tutorConfig?: { slowLearner?: boolean } | null;
  onAutoScanConsumed?: () => Promise<void> | void;
  autoScanUserId: string | null;
  activeChildId: string | null;

  // Refs
  learnerContextRef: React.MutableRefObject<LearnerContext | null>;
  tutorSessionRef: React.MutableRefObject<TutorSession | null>;
  tutorOverridesRef: React.MutableRefObject<Record<string, string>>;
  activeRequestIdRef: React.MutableRefObject<string | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  responseLifecycleRef: React.MutableRefObject<ResponseLifecycleTracker>;
  activeToolExecutionCountRef: React.MutableRefObject<number>;
  isNearBottomRef: React.MutableRefObject<boolean>;
  nextVoiceTurnRef: React.MutableRefObject<boolean>;

  // Setters
  setMessages: React.Dispatch<React.SetStateAction<DashMessage[]>>;
  setConversation: React.Dispatch<React.SetStateAction<DashConversation | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingStatus: React.Dispatch<React.SetStateAction<'uploading' | 'analyzing' | 'thinking' | 'responding' | null>>;
  setStatusStartTime: React.Dispatch<React.SetStateAction<number>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;
  setActiveToolLabel: React.Dispatch<React.SetStateAction<string | null>>;
  setTutorSession: React.Dispatch<React.SetStateAction<TutorSession | null>>;

  // Actions
  scrollToBottom: (opts: { animated: boolean; delay: number; force?: boolean }) => void;
  showAlert: (config: Omit<AlertState, 'visible'>) => void;
  hideAlert: () => void;
  speakResponse: (msg: DashMessage, opts?: { preferFastStart?: boolean; forceSpeak?: boolean }) => Promise<void>;
  persistConversationSnapshot: (conv?: DashConversation | null) => Promise<void>;
  resolveActiveConversationId: () => string | null;
  beginToolExecution: () => void;
  endToolExecution: () => void;
  setResponseLifecycleState: (id: string, state: string, text?: string) => void;
  logDashTrace: (event: string, payload?: Record<string, unknown>) => void;

  // Capabilities
  capsReady: boolean;
  canInteractiveLessons: boolean;
  voiceEnabled: boolean;
  autoSpeakResponses: boolean;
  aiStreamingEnabled: boolean;

  // DashAttachments
  dashAttachments: {
    selectedAttachments: DashAttachment[];
    uploadAttachments: (attachments: DashAttachment[], convId: string) => Promise<DashAttachment[]>;
  };

  // Tool shortcuts
  autoToolShortcuts: Array<{ name: string; label?: string; description?: string; category?: string }>;
  plannerTools: Array<{ name: string; description: string; parameters?: any }>;

  // Layout
  setLayout: (layout: string) => void;
}

// ─── Hook ───────────────────────────────────────────────────

export function useDashAISendMessage(deps: UseDashAISendMessageDeps) {
  const {
    dashInstance,
    messages,
    conversation,
    selectedModel,
    streamingEnabledPref,
    user,
    profile,
    tier,
    capabilityTier,
    handoffSource,
    externalTutorMode,
    tutorConfig,
    onAutoScanConsumed,
    autoScanUserId,
    learnerContextRef,
    tutorSessionRef,
    tutorOverridesRef,
    activeRequestIdRef,
    abortControllerRef,
    responseLifecycleRef,
    activeToolExecutionCountRef,
    isNearBottomRef,
    nextVoiceTurnRef,
    setMessages,
    setConversation,
    setIsLoading,
    setLoadingStatus,
    setStatusStartTime,
    setStreamingMessageId,
    setStreamingContent,
    setActiveToolLabel,
    setTutorSession,
    scrollToBottom,
    showAlert,
    hideAlert,
    speakResponse,
    persistConversationSnapshot,
    resolveActiveConversationId,
    beginToolExecution,
    endToolExecution,
    setResponseLifecycleState,
    logDashTrace,
    capsReady,
    canInteractiveLessons,
    voiceEnabled,
    autoSpeakResponses,
    aiStreamingEnabled,
    dashAttachments,
    autoToolShortcuts,
    plannerTools,
    setLayout,
  } = deps;

  const requestQueueRef = useRef<PendingDashRequest[]>([]);
  const isProcessingRef = useRef(false);
  const activeRequestSignatureRef = useRef<string | null>(null);

  const sendMessageInternal = useCallback(async (text: string, attachments: DashAttachment[]) => {
    if (!dashInstance) return;
    const requestId = `dash_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    activeRequestIdRef.current = requestId;
    setActiveToolLabel(null);
    responseLifecycleRef.current = { requestId, state: 'idle', committedText: null };
    const isCurrentRequest = () => activeRequestIdRef.current === requestId;
    const isVoiceTurn = nextVoiceTurnRef.current;
    nextVoiceTurnRef.current = false;
    const scannerAttachmentCount = countScannerAttachments(attachments);
    const turnId = createDashTurnId('dash_assistant_turn');
    const turnStartedAt = Date.now();
    const normalizedRole = String(profile?.role || '').toLowerCase();

    // ── Route intent ────────────────────────────────────
    const intentRouterEnabled = getFeatureFlagsSync().dash_intent_router_v1 !== false;
    const routeDecision = intentRouterEnabled
      ? resolveDashRouteIntent({ text, handoffSource, externalTutorMode })
      : { intent: 'tutor' as DashRouteIntent, reason: 'default_tutor' as const };
    const routeIntent: DashRouteIntent = routeDecision.intent;
    const plannerIntentActive = routeIntent !== 'tutor';
    const isTeacherDashboardTutorEntry = handoffSource === 'teacher_dashboard';
    const shouldForceTutorInteractive =
      routeIntent === 'tutor' && (isTeacherDashboardTutorEntry || !!externalTutorMode);
    const disableImplicitTutorInAdvisor =
      handoffSource === 'k12_parent_tab' && !shouldForceTutorInteractive;

    const initialResponseMode = plannerIntentActive
      ? 'direct_writing'
      : classifyResponseMode({
          text,
          hasAttachments: attachments.length > 0,
          hasActiveTutorSession: disableImplicitTutorInAdvisor ? false : !!tutorSessionRef.current?.awaitingAnswer,
          explicitTutorMode: shouldForceTutorInteractive,
        });
    const turnModeHint = initialResponseMode === 'tutor_interactive'
      ? 'tutor'
      : ['teacher', 'principal', 'principal_admin', 'admin', 'super_admin'].includes(normalizedRole)
        ? 'advisor'
        : 'assistant';

    trackDashTelemetry(DASH_TELEMETRY_EVENTS.INTENT_ROUTE_SELECTED, {
      route_intent: routeIntent, route_reason: routeDecision.reason,
      router_enabled: intentRouterEnabled, handoff_source: handoffSource || null,
      role: normalizedRole || null, turn_id: turnId,
    });
    const baseTurnTelemetry = buildDashTurnTelemetry({
      conversationId: resolveActiveConversationId(),
      turnId, mode: turnModeHint, tier: tier || null,
      voiceProvider: isVoiceTurn ? 'assistant_voice' : 'none',
      fallbackReason: 'none', source: 'useDashAssistant.sendMessageInternal',
    });
    track('dash.turn.started', baseTurnTelemetry);

    try {
      setIsLoading(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      if (isNearBottomRef.current) scrollToBottom({ animated: true, delay: 120 });

      // ── Attachment handling ────────────────────────────
      let effectiveAttachments = attachments;
      if (effectiveAttachments.length === 0) {
        const priorMessages = (conversation?.messages || []).slice(-10);
        for (let mi = priorMessages.length - 1; mi >= 0; mi -= 1) {
          const priorImg = priorMessages[mi]?.attachments?.find((a: any) => a.kind === 'image');
          if (priorImg) { effectiveAttachments = [priorImg]; break; }
        }
      }
      setLoadingStatus(effectiveAttachments.length > 0 ? 'uploading' : 'thinking');
      setStatusStartTime(Date.now());

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
          persistConversationSnapshot(createdConversation).catch(() => {});
        }
      }

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
      if (isNearBottomRef.current) scrollToBottom({ animated: true, delay: 120 });

      // ── Context building ──────────────────────────────
      const userText = text || '';
      const languageOverride = detectLanguageOverrideFromText(userText);
      const requestLanguage = resolveResponseLocale({
        explicitOverride: languageOverride,
        responseText: userText,
        fallbackPreference: profile?.preferred_language || getCurrentLanguage?.() || null,
      });
      const languageDirective = buildLanguageDirectiveForTurn({
        locale: requestLanguage.locale, source: requestLanguage.source,
      });

      const learnerContext = learnerContextRef.current;
      const baseContextOverride = buildDashContextOverride({ learner: learnerContext, messages });
      const attachmentContextOverride = buildAttachmentContextInternal(uploadedAttachments);
      const messageHistory = messages.map(msg => ({
        role: msg.type === 'task_result' ? 'assistant' : msg.type,
        content: msg.content || '',
      }));
      const needsCelebration = shouldCelebrate(messageHistory);
      let celebrationHint = '';
      if (needsCelebration && messages.length > 0) {
        celebrationHint = '\n\n[HINT: The learner just showed understanding or made progress. Celebrate this! Use encouraging phrases like "Great job!", "You got it!", "Nice work!"]';
      }

      const intentContextOverride =
        routeIntent === 'lesson_generation'
          ? ['ROUTE INTENT: lesson_generation', 'Return a complete, classroom-ready lesson plan with objectives, materials, timed steps, worked examples, formative checks, and closure.', 'If grade/subject is missing, ask one concise clarifier and continue with a safe default.'].join('\n')
          : routeIntent === 'weekly_theme_plan'
            ? ['ROUTE INTENT: weekly_theme_plan', 'Return a Monday-Friday themed plan with daily focus, objectives, activities, and assessment checkpoints.', 'Use clear headings and teacher-ready structure.'].join('\n')
            : routeIntent === 'daily_routine_plan'
              ? ['ROUTE INTENT: daily_routine_plan', 'Return a practical daily program with time blocks, transitions, activity purpose, and required materials.', 'Keep output structured and directly executable by school staff.'].join('\n')
              : null;

      // ── Tutor pipeline ────────────────────────────────
      const tutorPipeline = resolveTutorPipeline({
        userText,
        routeIntent,
        profile,
        learnerContext,
        activeSession: tutorSessionRef.current,
        externalTutorMode,
        handoffSource,
        attachments,
        tutorConfig,
      });

      if (tutorPipeline.shouldClearSession) setTutorSession(null);
      if (tutorPipeline.newSession) setTutorSession(tutorPipeline.newSession);

      const mergedContextBase = [
        baseContextOverride,
        tutorPipeline.tutorContextOverride,
        attachmentContextOverride,
        intentContextOverride,
        languageDirective,
        celebrationHint,
      ].filter(Boolean).join('\n\n') || null;

      const aiAttachments = await prepareAttachmentsForAI(uploadedAttachments);
      if (!isCurrentRequest()) return;

      const localUserMessage: DashMessage = {
        id: `local_user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'user', content: text || '', timestamp: Date.now(),
        attachments: aiAttachments.length > 0 ? aiAttachments : undefined,
        metadata: { turn_id: turnId },
      };
      setMessages(prev => [...prev, localUserMessage]);

      // ── Auto tool execution ───────────────────────────
      let autoToolContext: string | null = null;
      let autoToolExecution: AutoToolExecution | null = null;
      let autoToolOutcome: DashToolOutcome | null = null;
      let plannerIntent: 'tool' | 'plan_mode' | 'none' = 'none';
      let plannerIntentConfidence: number | null = null;
      const allowAutoToolPlanner = tutorPipeline.responseMode !== 'tutor_interactive';

      if (allowAutoToolPlanner && shouldAttemptToolPlan(userText)) {
        try {
          setActiveToolLabel('Deciding whether a tool can help');
          let supabaseClient: any = null;
          try { supabaseClient = assertSupabase(); } catch {}

          if (supabaseClient) {
            const plan = await planToolCall({
              supabaseClient,
              role: String(profile?.role || 'parent').toLowerCase() || 'parent',
              message: userText,
              tools: plannerTools,
            });
            if (plan?.intent) plannerIntent = plan.intent;
            else if (plan?.tool) plannerIntent = 'tool';
            if (typeof plan?.intent_confidence === 'number') plannerIntentConfidence = plan.intent_confidence;

            if (plan?.tool) {
              const label = autoToolShortcuts.find(t => t.name === plan.tool)?.label || undefined;
              setActiveToolLabel(formatDashToolActivityLabel(plan.tool, label));
              const toolTraceId = `dash_assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              beginToolExecution();
              const execution = await ToolRegistry.execute(plan.tool, plan.parameters || {}, {
                profile, user, supabase: supabaseClient,
                role: String(profile?.role || 'parent').toLowerCase(),
                tier: tier || 'free',
                organizationId: (profile as any)?.organization_id || (profile as any)?.preschool_id || null,
                hasOrganization: Boolean((profile as any)?.organization_id || (profile as any)?.preschool_id),
                isGuest: !user?.id, trace_id: toolTraceId,
                tool_plan: { source: 'useDashAssistant.auto_planner', tool: plan.tool },
              }).finally(() => endToolExecution());
              if (!isCurrentRequest()) return;

              const executionPayload = (execution?.result && typeof execution.result === 'object') ? execution.result as Record<string, unknown> : null;
              const executionSummary = executionPayload
                ? String(executionPayload.summary || executionPayload.message || executionPayload.status_message || '').trim()
                : '';

              if (execution?.success !== false) {
                autoToolOutcome = { status: 'success', source: 'tool_registry' };
                autoToolContext = formatToolResultMessage(label || plan.tool, execution);
                autoToolExecution = { toolName: plan.tool, toolArgs: (plan.parameters || {}) as Record<string, unknown>, execution, summary: executionSummary || undefined };
              } else {
                autoToolOutcome = { status: 'degraded', source: 'tool_registry', errorCode: String(execution?.error || 'tool_execution_failed'), userSafeNote: 'A helper tool failed, but Dash will continue with the current response.', details: { toolName: plan.tool } };
                logDashTrace('auto_tool_failed_skipped_context', { tool: plan.tool, error: execution?.error || 'tool_execution_failed' });
              }
            }
          }
        } catch (toolErr) {
          autoToolOutcome = { status: 'degraded', source: 'tool_registry', errorCode: toolErr instanceof Error ? toolErr.message : 'tool_execution_exception', userSafeNote: 'A helper tool failed, but Dash will continue with the current response.' };
          console.warn('[useDashAssistant] Auto tool failed:', toolErr);
        } finally {
          if (activeToolExecutionCountRef.current === 0) setActiveToolLabel(null);
        }
      }

      const guidedPlanModeActive = plannerIntent === 'plan_mode';
      const mergedContextOverride = [mergedContextBase, autoToolContext ? `TOOL RESULT:\n${autoToolContext}` : null]
        .filter(Boolean).join('\n\n') || null;

      // ── Streaming setup ───────────────────────────────
      const envStreamingEnabled =
        process.env.EXPO_PUBLIC_AI_STREAMING_ENABLED === 'true' ||
        process.env.EXPO_PUBLIC_ENABLE_AI_STREAMING === 'true';
      const streamingEnabled = aiStreamingEnabled && (streamingEnabledPref || envStreamingEnabled);

      const contextWindow = resolveConversationWindowByTier(capabilityTier as import('@/lib/tiers').CapabilityTier);
      const contextSeedMessages: DashMessage[] = [
        ...messages, localUserMessage,
        ...(autoToolContext ? [{ id: `ctx_tool_${Date.now()}`, type: 'assistant' as const, content: autoToolContext, timestamp: Date.now() }] : []),
      ];
      const messagesOverride = buildConversationContext(contextSeedMessages, {
        maxMessages: contextWindow.maxMessages,
        maxTokens: contextWindow.maxTokens,
      });

      const requestMetadata: Record<string, any> = {
        response_mode: tutorPipeline.responseMode as string | undefined,
        dash_route_intent: routeIntent,
        language_source: requestLanguage.source || (languageOverride ? 'explicit_override' : 'preference'),
        detected_language: requestLanguage.locale || undefined,
        tutor_entry_source: isTeacherDashboardTutorEntry ? 'teacher_dashboard' : 'default',
        source: isVoiceTurn ? 'dash_assistant_voice' : 'dash_assistant_chat',
        voice_turn: isVoiceTurn || undefined,
        prefer_streaming_latency: isVoiceTurn || undefined,
        planning_mode: guidedPlanModeActive ? 'guided' : undefined,
        planning_intent: guidedPlanModeActive ? plannerIntent : undefined,
        planning_intent_confidence: plannerIntentConfidence ?? undefined,
        plan_mode_stage: guidedPlanModeActive ? 'discover' : undefined,
      };

      const streamingSetup = streamingEnabled
        ? createStreamingSetup({
            requestId, isCurrentRequest, setResponseLifecycleState,
            setStreamingMessageId, setStreamingContent, setMessages,
            scrollToBottom, isNearBottomRef, responseMode: tutorPipeline.responseMode,
            selectedModel, logDashTrace, userText,
          })
        : null;

      // ── AI call ───────────────────────────────────────
      let response = await sendWithStreamingFallback({
        dashInstance, outgoingText: userText, conversationId: conversationIdForUpload!,
        aiAttachments, contextOverride: mergedContextOverride, selectedModel,
        messagesOverride, metadata: requestMetadata, signal: controller.signal,
        streamingEnabled, streamingSetup, logDashTrace, isCurrentRequest,
      });
      if (!isCurrentRequest()) return;

      // ── Post-response metadata ────────────────────────
      response = mergeAutoToolExecutionIntoResponse(response, autoToolExecution);
      {
        const metadata = { ...((response.metadata || {}) as Record<string, unknown>) };
        metadata.turn_id = turnId;
        metadata.dash_route_intent = routeIntent;
        metadata.response_lifecycle_state = 'committed';
        if (autoToolOutcome) metadata.tool_outcome = autoToolOutcome;
        if (!metadata.tool_origin && metadata.tool_name) metadata.tool_origin = autoToolExecution ? 'auto_planner' : 'server_tool';
        response = { ...response, metadata: metadata as any };
      }

      // ── Tutor post-processing ─────────────────────────
      const tutorPayloadRaw = parseTutorPayload(response?.content || '');
      const tutorResult = processTutorResponse({
        response,
        tutorAction: tutorPipeline.tutorAction,
        tutorPayloadRaw,
        sessionForTutorAction: tutorPipeline.sessionForTutorAction,
        activeSession: tutorSessionRef.current,
        tutorModeForMetadata: tutorPipeline.tutorModeForMetadata,
        userText,
        learnerContext,
        hasLearningAttachment: attachments.some(a => a.kind === 'image' || a.kind === 'document'),
        tutorEntrySource: isTeacherDashboardTutorEntry ? 'teacher_dashboard' : 'default',
      });
      response = tutorResult.response;
      if (tutorResult.displayOverride) tutorOverridesRef.current[response.id] = tutorResult.displayOverride;
      if (tutorResult.shouldLogAttempt && tutorPipeline.sessionForTutorAction && tutorResult.attemptPayload) {
        logTutorAttemptFire(tutorPipeline.sessionForTutorAction, tutorResult.attemptPayload, userText);
      }
      if (tutorResult.sessionUpdate) setTutorSession(tutorResult.sessionUpdate);
      if (tutorResult.summaryMessage) setMessages(prev => [...prev, tutorResult.summaryMessage!]);
      if (!isCurrentRequest()) return;

      // ── Language detection ────────────────────────────
      const existingDetectedLanguage = String((response.metadata as any)?.detected_language || '').trim();
      const resolvedLocale = resolveResponseLocale({
        explicitOverride: languageOverride || existingDetectedLanguage || null,
        responseText: response?.content || '',
        fallbackPreference: profile?.preferred_language || getCurrentLanguage?.() || null,
      });
      if (resolvedLocale.locale || tutorPipeline.responseMode) {
        response = {
          ...response,
          metadata: {
            ...(response.metadata || {}),
            detected_language: resolvedLocale.locale || requestLanguage.locale || existingDetectedLanguage || undefined,
            language_source: resolvedLocale.source || requestLanguage.source || (languageOverride ? 'explicit_override' : 'preference'),
            response_mode: tutorPipeline.responseMode as 'direct_writing' | 'explain_direct' | 'tutor_interactive' | undefined,
            tutor_entry_source: isTeacherDashboardTutorEntry ? 'teacher_dashboard' : 'default',
            source: isVoiceTurn ? 'dash_assistant_voice' : 'dash_assistant_chat',
            voice_turn: isVoiceTurn || undefined,
          },
        };
      }

      // ── Scanner budget ────────────────────────────────
      if (scannerAttachmentCount > 0 && isSuccessfulOCRResponse(response)) {
        const consumeResult = await consumeAutoScanBudget(tier || 'free', scannerAttachmentCount, autoScanUserId);
        if (!isCurrentRequest()) return;
        if (!consumeResult.allowed) logDashTrace('auto_scan_budget_overrun', { scannerAttachmentCount, turnId, tier: tier || 'free' });
        if (typeof onAutoScanConsumed === 'function') { await Promise.resolve(onAutoScanConsumed()); if (!isCurrentRequest()) return; }
      }

      // ── Commit response ───────────────────────────────
      const normalizedResponseText = String(response?.content || '').trim();
      if (normalizedResponseText.length > 0) {
        setResponseLifecycleState(requestId, 'committed', normalizedResponseText);
        trackDashTelemetry(DASH_TELEMETRY_EVENTS.RESPONSE_COMMITTED, {
          turn_id: turnId, route_intent: routeIntent, response_chars: normalizedResponseText.length,
          model: selectedModel, response_mode: tutorPipeline.responseMode as string | undefined,
        });
      }

      logDashTrace('assistant_response', {
        responseId: response.id, model: selectedModel, responseMode: tutorPipeline.responseMode,
        chars: String(response.content || '').length, preview: String(response.content || '').slice(0, 180),
        language: String((response.metadata as any)?.detected_language || requestLanguage.locale || ''),
      });
      setMessages(prev => appendAssistantMessageByTurn(prev, response));
      setLoadingStatus('responding');
      setStatusStartTime(Date.now());
      if (isNearBottomRef.current) scrollToBottom({ animated: true, delay: 120 });

      // ── Dashboard actions ─────────────────────────────
      if (response.metadata?.dashboard_action?.type === 'switch_layout') {
        const newLayout = response.metadata.dashboard_action.layout;
        if (newLayout && (newLayout === 'classic' || newLayout === 'enhanced')) {
          setLayout(newLayout);
          try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
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

      // ── Conversation persistence ──────────────────────
      const updatedConv = await dashInstance.getConversation(dashInstance.getCurrentConversationId()!);
      if (!isCurrentRequest()) return;
      if (updatedConv && Array.isArray(updatedConv.messages) && updatedConv.messages.length > 0) {
        const overrideMap = tutorOverridesRef.current;
        const merged = normalizeMessagesByTurn(updatedConv.messages.map(msg => {
          const override = overrideMap[msg.id];
          if (override) return { ...msg, content: override };
          if (msg.type === 'user') {
            const { content, sanitized } = sanitizeTutorUserContent(msg.content);
            return sanitized ? { ...msg, content } : msg;
          }
          return msg;
        }));
        setMessages(prev => {
          const candidate = merged.length >= prev.length ? merged : prev;
          const committedText = String(responseLifecycleRef.current.committedText || '').trim();
          if (!committedText) return candidate;
          const hasCommittedInCandidate = candidate.some(msg => msg.type === 'assistant' && String(msg.content || '').trim() === committedText);
          return hasCommittedInCandidate ? candidate : prev;
        });
        setConversation(updatedConv);
        setResponseLifecycleState(requestId, 'finalized');
        if (isNearBottomRef.current) scrollToBottom({ animated: true, delay: 150 });
        persistConversationSnapshot(updatedConv).catch(() => {});

        if (updatedConv.messages.length > LOCAL_SNAPSHOT_MAX && user?.id && (profile?.organization_id || profile?.preschool_id)) {
          try {
            const svc = new (await import('@/services/dash-ai/DashConversationService')).DashConversationService(
              user.id, String(profile.organization_id || profile.preschool_id),
            );
            svc.trimConversation(updatedConv.id, LOCAL_SNAPSHOT_MAX).catch(() => {});
          } catch {}
        }
      }

      // ── Lesson generator intent ───────────────────────
      try {
        const intentType = response?.metadata?.user_intent?.primary_intent || '';
        const shouldOpen = intentType === 'create_lesson' || wantsLessonGenerator(userText, response?.content);
        if (shouldOpen) {
          if (!capsReady) { showAlert({ title: 'Please wait', message: 'Loading your subscription details. Try again in a moment.', type: 'info' }); return; }
          if (!canInteractiveLessons) {
            showAlert({ title: 'Upgrade Required', message: 'Interactive lessons and activities are available on Premium or Pro Plus plans.', type: 'warning', buttons: [{ text: 'Cancel', style: 'cancel' }, { text: 'View Plans', onPress: () => router.push('/pricing') }] });
            return;
          }
          if (user?.id) {
            const lessonQuota = await checkAIQuota('lesson_generation', user.id, 1);
            if (!lessonQuota.allowed) {
              showAlert({ title: 'Lesson Generation Limit Reached', message: 'You have used all lesson generation credits for this month.', type: 'warning' });
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

      // ── Auto-speak ────────────────────────────────────
      if (shouldAutoSpeak({ role: profile?.role || null, voiceEnabled, autoSpeakEnabled: autoSpeakResponses, responseText: response?.content })) {
        void speakResponse(response);
      }
      if (responseLifecycleRef.current.state === 'committed') setResponseLifecycleState(requestId, 'finalized');

      track('dash.turn.completed', buildDashTurnTelemetry({
        ...baseTurnTelemetry,
        conversationId: dashInstance.getCurrentConversationId?.() || baseTurnTelemetry.conversation_id,
        mode: tutorPipeline.tutorAction ? 'tutor' : baseTurnTelemetry.mode,
        latencyMs: Date.now() - turnStartedAt,
      }));

    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted')) return;
      if (!isCurrentRequest()) return;
      console.error('Failed to send message:', error);
      logDashTrace('assistant_error', { error: error instanceof Error ? error.message : String(error), model: selectedModel });
      track('dash.turn.failed', {
        ...buildDashTurnTelemetry({ ...baseTurnTelemetry, conversationId: resolveActiveConversationId() || baseTurnTelemetry.conversation_id, latencyMs: Date.now() - turnStartedAt }),
        error: error instanceof Error ? error.message : String(error || 'unknown_error'),
      });
      showAlert({
        title: 'Error',
        message: (error instanceof Error ? error.message : '') || 'Failed to send message. Please try again.',
        type: 'error', icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    } finally {
      if (isCurrentRequest()) {
        activeRequestIdRef.current = null;
        responseLifecycleRef.current = { requestId: null, state: 'idle', committedText: null };
        abortControllerRef.current = null;
        setIsLoading(false);
        setLoadingStatus(null);
      }
    }
  }, [
    dashInstance, conversation, scrollToBottom, setLayout, showAlert, speakResponse,
    autoSpeakResponses, voiceEnabled, streamingEnabledPref, aiStreamingEnabled,
    persistConversationSnapshot, resolveActiveConversationId, logDashTrace,
    capsReady, canInteractiveLessons, selectedModel, user?.id, profile?.role,
    handoffSource, externalTutorMode, tier, capabilityTier, autoScanUserId,
    beginToolExecution, endToolExecution, setResponseLifecycleState,
    messages, onAutoScanConsumed, plannerTools, autoToolShortcuts,
    dashAttachments, tutorConfig, setMessages, setConversation,
    setIsLoading, setLoadingStatus, setStatusStartTime,
    setStreamingMessageId, setStreamingContent, setActiveToolLabel, setTutorSession,
  ]);

  // Fire-and-forget tutor attempt log (avoids bloating sendMessageInternal)
  const logTutorAttemptFire = useCallback(async (session: TutorSession, payload: any, learnerAnswer: string) => {
    if (!user?.id) return;
    try {
      const studentId = profile?.role === 'parent' ? deps.activeChildId || null : null;
      await (assertSupabase() as any).from('dash_ai_tutor_attempts').insert({
        user_id: user.id, student_id: studentId,
        session_id: session.id, mode: session.mode,
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
        metadata: { explanation: payload.explanation || null, misconception: payload.misconception || null },
      });
    } catch (error) {
      console.warn('[useDashAssistant] Failed to log tutor attempt:', error);
    }
  }, [user?.id, profile?.role]);

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
    if (requestQueueRef.current.length > 0) setTimeout(() => processQueue(), 0);
  }, [sendMessageInternal]);

  return {
    sendMessageInternal,
    processQueue,
    requestQueueRef,
    activeRequestSignatureRef,
  };
}

const LOCAL_SNAPSHOT_MAX = 200;
