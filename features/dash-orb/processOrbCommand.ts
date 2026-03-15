/**
 * features/dash-orb/processOrbCommand.ts
 *
 * Extracted from DashOrbImpl.tsx — the core send pipeline that sanitises
 * input, rate-limits, adds user message, forks streaming / non-streaming,
 * drives sentence-level TTS, and tracks image budget.
 */

import { Platform } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import { sanitizeInput, validateCommand, type RateLimiter } from '@/lib/security/validators';
import { calculateAge } from '@/lib/date-utils';
import { detectLanguageOverrideFromText, resolveResponseLocale } from '@/lib/dash-ai/languageRouting';
import { classifyResponseMode } from '@/lib/dash-ai/responseMode';
import { getCriteriaResponsePrompt } from '@/lib/dash-ai/ocrPrompts';
import { shouldUsePhonicsMode } from '@/lib/dash-ai/phonicsDetection';
import { resolveAIProxyScopeFromRole } from '@/lib/ai/aiProxyScope';
import { shouldEnableVoiceTurnTools } from '@/lib/dash-voice-utils';
import { consumeAutoScanBudget, trackImageUsage } from '@/lib/dash-ai/imageBudget';
import { countScannerAttachments } from '@/lib/dash-ai/retakeFlow';
import { logger } from '@/lib/logger';
import type { ChatMessage } from '@/components/dash-orb/ChatModal';
import type { DashAttachment } from '@/services/dash-ai/types';
import type { ExecuteCommandResult } from './executeOrbCommand';
import { detectToolsNeeded, type AutoToolResult } from './orbToolExecution';
import { normalizeSupportedLanguage } from './orbTutorHelpers';

// ─── Types ──────────────────────────────────────────────────

export interface ProcessCommandOptions {
  baseMessages?: ChatMessage[];
  historyOverride?: Array<{ role: string; content: string }>;
  skipUserMessage?: boolean;
  attachments?: DashAttachment[];
}

export interface ProcessCommandDeps {
  // Context values
  normalizedRole: string;
  selectedLanguage: 'en-ZA' | 'af-ZA' | 'zu-ZA';
  selectedModel: string;
  memorySnapshot: string;
  learnerAgeYears: number | null;
  learnerGrade: string | null;
  learnerName: string | null;
  learnerSchoolType: string | null;
  dashPolicyDefaultMode: string;
  dashPolicySystemPromptAddendum: string | null;
  isFreeImageBudgetTier: boolean;
  tierLabel: string;
  autoScanUserId: string | null;
  voiceEnabled: boolean;
  profile: Record<string, any> | null;

  // State
  messages: ChatMessage[];
  rateLimiter: RateLimiter;

  // Setters
  setInputText: (v: string) => void;
  setIsProcessing: (v: boolean) => void;
  setShowQuickActions: (v: boolean) => void;
  setSelectedLanguage: (v: 'en-ZA' | 'af-ZA' | 'zu-ZA') => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;

  // Refs
  ttsSentenceQueueRef: React.MutableRefObject<string[]>;
  isSpeakingSentenceRef: React.MutableRefObject<boolean>;

  // Functions
  executeCommand: (cmd: string, history: Array<{ role: string; content: string }>, attachments: DashAttachment[]) => Promise<ExecuteCommandResult>;
  streamResponseToMessage: (messageId: string, fullText: string) => Promise<void>;
  runAutoToolIfNeeded: (text: string) => Promise<AutoToolResult | null>;
  refreshAutoScanBudget: () => Promise<void>;
  onCommandExecuted?: (command: string, result: unknown) => void;

  // Voice
  speak: (text: string, lang: string, opts?: { phonicsMode?: boolean }) => Promise<void>;

  // Streaming
  streamResponse: (
    config: { endpoint: string; body: Record<string, unknown>; accessToken: string; phonicsMode?: boolean },
    callbacks: {
      onTextChunk: (chunk: string, accumulated: string) => void;
      onSentenceReady: (sentence: string) => void;
      onVisemeEvent: (evt: { visemeId: number }) => void;
      onComplete: (fullText: string) => void;
      onError: (err: Error) => void;
    },
  ) => void;
}

// ─── Main ───────────────────────────────────────────────────

export async function processOrbCommand(
  command: string,
  displayOverride: string | undefined,
  options: ProcessCommandOptions | undefined,
  deps: ProcessCommandDeps,
): Promise<void> {
  const sanitized = sanitizeInput(command, 2000);
  const explicitLanguage = detectLanguageOverrideFromText(sanitized);
  const responseMode = classifyResponseMode({ text: sanitized, hasAttachments: (options?.attachments?.length || 0) > 0 });
  const requestLanguage = resolveResponseLocale({
    explicitOverride: explicitLanguage, responseText: sanitized, fallbackPreference: deps.selectedLanguage,
  });
  const languageSource = requestLanguage.source || (explicitLanguage ? 'explicit_override' : 'preference');

  const validation = validateCommand(sanitized);
  if (!validation.valid) {
    deps.setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: 'assistant', content: `⚠️ Invalid command: ${validation.error}`, timestamp: new Date() }]);
    return;
  }
  if (!deps.rateLimiter.isAllowed('dashOrb')) {
    const remaining = deps.rateLimiter.getRemaining('dashOrb');
    deps.setMessages((prev) => [...prev, { id: `rate-limit-${Date.now()}`, role: 'assistant', content: `⏱️ Rate limit exceeded. Please wait a moment before trying again. (${remaining} requests remaining)`, timestamp: new Date() }]);
    return;
  }

  const userMessage: ChatMessage = {
    id: `user-${Date.now()}`, role: 'user',
    content: displayOverride ? sanitizeInput(displayOverride, 2000) : sanitized,
    timestamp: new Date(),
    attachments: options?.attachments?.length ? options.attachments : undefined,
  };

  deps.setInputText('');
  deps.setIsProcessing(true);
  deps.setShowQuickActions(false);

  deps.setMessages((prev) => {
    const base = options?.baseMessages ?? prev;
    const next = [...base];
    if (!options?.skipUserMessage) next.push(userMessage);
    return next;
  });

  let toolContextEntry: { role: 'assistant'; content: string } | null = null;
  if (!options?.skipUserMessage) {
    const autoTool = await deps.runAutoToolIfNeeded(sanitized);
    if (autoTool?.toolChatMessage?.content) {
      toolContextEntry = { role: 'assistant', content: autoTool.toolChatMessage.content };
    }
  }

  const thinkingId = `thinking-${Date.now()}`;
  deps.setMessages((prev) => [...prev, {
    id: thinkingId, role: 'assistant', content: '', timestamp: new Date(), isLoading: true, toolCalls: detectToolsNeeded(command),
  }]);

  try {
    const baseHistory = options?.historyOverride ?? (options?.baseMessages ?? deps.messages)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));
    const history = toolContextEntry ? [...baseHistory, toolContextEntry] : baseHistory;
    const attachmentsForTurn = options?.attachments || [];
    const forceNonStreaming = attachmentsForTurn.length > 0;

    if (forceNonStreaming) {
      await processNonStreaming(command, thinkingId, history, attachmentsForTurn, requestLanguage, deps);
    } else {
      await processStreaming(command, thinkingId, history, requestLanguage, responseMode, languageSource, deps);
    }

    if (deps.isFreeImageBudgetTier && (options?.attachments?.length || 0) > 0) {
      const usedImages = (options?.attachments || []).filter((a) => a.kind === 'image').length;
      if (usedImages > 0) await trackImageUsage(usedImages).catch((e) => console.warn('[DashOrb] Failed to track free image usage:', e));
    }
  } catch (error) {
    deps.setMessages((prev) => prev.map((msg) =>
      msg.id === thinkingId
        ? { ...msg, content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, isLoading: false }
        : msg,
    ));
  } finally {
    deps.setIsProcessing(false);
  }
}

// ─── Non-streaming (attachments) ────────────────────────────

async function processNonStreaming(
  command: string,
  thinkingId: string,
  history: Array<{ role: string; content: string }>,
  attachments: DashAttachment[],
  requestLanguage: { locale: string | null; source?: string },
  deps: ProcessCommandDeps,
) {
  const result = await deps.executeCommand(command, history, attachments);
  await deps.streamResponseToMessage(thinkingId, result.text);
  deps.setMessages((prev) => prev.map((msg) => msg.id === thinkingId ? { ...msg, toolCalls: undefined } : msg));

  const scannedCount = countScannerAttachments(attachments);
  if (scannedCount > 0 && result.ok && result.ocrMode) {
    const consumeResult = await consumeAutoScanBudget(deps.tierLabel || 'free', scannedCount, deps.autoScanUserId);
    if (!consumeResult.allowed) logger.info('DashOrb.autoScanBudgetRaceDetected', { scannedAttachmentCount: scannedCount, tier: deps.tierLabel || 'free', source: 'processCommand' });
    await deps.refreshAutoScanBudget();
  }

  if (deps.voiceEnabled && Platform.OS !== 'web') {
    const resolvedTTSLocale = resolveResponseLocale({ explicitOverride: requestLanguage.locale, responseText: result.text, fallbackPreference: deps.selectedLanguage }).locale;
    const ttsLanguage = normalizeSupportedLanguage(resolvedTTSLocale) || deps.selectedLanguage;
    if (ttsLanguage !== deps.selectedLanguage) deps.setSelectedLanguage(ttsLanguage);
    try {
      const phonicsMode = shouldUsePhonicsMode(result.text, { ageYears: deps.learnerAgeYears, gradeLevel: deps.learnerGrade || null, schoolType: deps.learnerSchoolType, organizationType: deps.learnerSchoolType });
      await deps.speak(result.text, ttsLanguage, { phonicsMode });
    } catch (e) { console.warn('[DashOrb] TTS error (non-fatal):', e); }
  }
  deps.onCommandExecuted?.(command, result.text);
}

// ─── Streaming (no attachments) ─────────────────────────────

async function processStreaming(
  command: string,
  thinkingId: string,
  history: Array<{ role: string; content: string }>,
  requestLanguage: { locale: string | null; source?: string },
  responseMode: string,
  languageSource: string,
  deps: ProcessCommandDeps,
) {
  const supabase = assertSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated.');

  const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-proxy`;
  const isLearnerRole = ['student', 'learner'].includes(deps.normalizedRole);
  const ageYears = isLearnerRole
    ? (deps.profile?.date_of_birth ? calculateAge(deps.profile.date_of_birth) : null)
    : (deps.normalizedRole === 'parent' ? deps.learnerAgeYears : null);

  const streamPhonicsMode = shouldUsePhonicsMode(command, {
    ageYears: deps.learnerAgeYears, gradeLevel: deps.learnerGrade || null,
    schoolType: deps.learnerSchoolType, organizationType: deps.learnerSchoolType,
  });
  const aiScope = resolveAIProxyScopeFromRole(deps.normalizedRole);
  const streamCriteriaIntent = Boolean(getCriteriaResponsePrompt(command));
  const enableTools = shouldEnableVoiceTurnTools(command, { hasAttachment: false, ocrMode: false, criteriaIntent: streamCriteriaIntent });
  const traceId = `dash_orb_stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const streamBody: Record<string, unknown> = {
    scope: aiScope, service_type: 'dash_conversation',
    payload: {
      prompt: command, model: deps.selectedModel,
      context: [
        history.length > 0 ? history.map((h) => `${h.role}: ${h.content}`).join('\n') : null,
        deps.memorySnapshot ? `Conversation memory snapshot: ${deps.memorySnapshot}` : null,
        deps.learnerName ? `Learner name: ${deps.learnerName}.` : null,
        deps.learnerGrade ? `Learner grade: ${deps.learnerGrade}.` : null,
        ageYears ? `Learner age: ${ageYears}. Provide age-appropriate, child-safe guidance.` : null,
        deps.normalizedRole ? `Role: ${deps.normalizedRole}.` : null,
        deps.dashPolicySystemPromptAddendum,
      ].filter(Boolean).join('\n\n') || undefined,
    },
    stream: true, enable_tools: enableTools,
    metadata: {
      role: deps.normalizedRole, model: deps.selectedModel, source: 'dash_orb_stream',
      dash_mode: deps.dashPolicyDefaultMode, response_mode: responseMode,
      language_source: languageSource, detected_language: requestLanguage.locale || undefined,
      stream_tool_mode: enableTools ? 'enabled' : 'deferred', trace_id: traceId,
    },
  };

  const MAX_TTS_BATCH_SENTENCES = 3;
  const MAX_TTS_BATCH_CHARS = 420;

  const processTTSQueue = async () => {
    if (deps.isSpeakingSentenceRef.current) return;
    const queue = deps.ttsSentenceQueueRef.current;
    const batch: string[] = [];
    while (queue.length > 0 && batch.length < MAX_TTS_BATCH_SENTENCES) {
      const candidate = queue[0] ?? '';
      const ifAdded = batch.length === 0 ? candidate : `${batch.join(' ')} ${candidate}`;
      if (ifAdded.length > MAX_TTS_BATCH_CHARS) break;
      batch.push(queue.shift()!);
    }
    if (batch.length === 0) return;
    const textToSpeak = batch.join(' ').trim();
    if (!textToSpeak) { if (queue.length > 0) processTTSQueue(); return; }
    deps.isSpeakingSentenceRef.current = true;
    try {
      const resolvedLocale = resolveResponseLocale({ explicitOverride: requestLanguage.locale, responseText: textToSpeak, fallbackPreference: deps.selectedLanguage }).locale;
      const ttsLang = normalizeSupportedLanguage(resolvedLocale) || deps.selectedLanguage;
      const pm = shouldUsePhonicsMode(textToSpeak, { ageYears: deps.learnerAgeYears, gradeLevel: deps.learnerGrade || null, schoolType: deps.learnerSchoolType, organizationType: deps.learnerSchoolType });
      await deps.speak(textToSpeak, ttsLang, { phonicsMode: pm });
    } catch (e) { console.warn('[DashOrb] Sentence TTS error:', e); }
    finally {
      deps.isSpeakingSentenceRef.current = false;
      if (deps.ttsSentenceQueueRef.current.length > 0) processTTSQueue();
    }
  };

  deps.ttsSentenceQueueRef.current = [];
  deps.isSpeakingSentenceRef.current = false;

  await new Promise<void>((resolve, reject) => {
    deps.streamResponse(
      { endpoint, body: streamBody, accessToken: session.access_token, phonicsMode: streamPhonicsMode },
      {
        onTextChunk: (_chunk, accumulated) => {
          deps.setMessages((prev) => prev.map((msg) =>
            msg.id === thinkingId ? { ...msg, content: accumulated, isLoading: false, isStreaming: true } : msg,
          ));
        },
        onSentenceReady: (sentence) => {
          if (deps.voiceEnabled && Platform.OS !== 'web') {
            deps.ttsSentenceQueueRef.current.push(sentence);
            const sentenceLocale = resolveResponseLocale({ explicitOverride: requestLanguage.locale, responseText: sentence, fallbackPreference: deps.selectedLanguage }).locale;
            const normalized = normalizeSupportedLanguage(sentenceLocale);
            if (normalized && normalized !== deps.selectedLanguage) deps.setSelectedLanguage(normalized);
            processTTSQueue();
          }
        },
        onVisemeEvent: () => {}, // viseme handled externally
        onComplete: (fullText) => {
          deps.setMessages((prev) => prev.map((msg) =>
            msg.id === thinkingId ? { ...msg, content: fullText, isStreaming: false, toolCalls: undefined } : msg,
          ));
          deps.onCommandExecuted?.(command, fullText);
          resolve();
        },
        onError: reject,
      },
    );
  });
}
