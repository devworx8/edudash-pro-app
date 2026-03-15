/**
 * hooks/dash-ai/sendMessageTutor.ts
 *
 * Pure functions extracted from sendMessageInternal that handle
 * the tutor pipeline: intent detection, session creation, payload
 * evaluation, display content, adaptive difficulty, phonics stages.
 *
 * No React hooks — all functions take explicit params and return results.
 */

import type { DashMessage, DashAttachment } from '@/services/dash-ai/types';
import type { TutorMode, TutorPayload, TutorSession } from '@/hooks/dash-assistant/tutorTypes';
import type { LearnerContext } from '@/lib/dash-ai/learnerContext';
import type { DashRouteIntent } from '@/features/dash-assistant/types';
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
import { classifyResponseMode } from '@/lib/dash-ai/responseMode';
import { createTutorSessionId } from '@/lib/dash-ai/tutorSessionService';

// ─── Types ──────────────────────────────────────────────────

export interface TutorPipelineInput {
  userText: string;
  routeIntent: DashRouteIntent;
  profile: { role?: string } | null;
  learnerContext: LearnerContext | null;
  activeSession: TutorSession | null;
  externalTutorMode: string | null | undefined;
  handoffSource: string | undefined;
  attachments: DashAttachment[];
  tutorConfig?: { slowLearner?: boolean } | null;
}

export interface TutorPipelineResult {
  tutorAction: 'start' | 'evaluate' | null;
  tutorModeForMetadata: TutorMode | null;
  tutorContextOverride: string | null;
  sessionForTutorAction: TutorSession | null;
  newSession: TutorSession | null;
  shouldClearSession: boolean;
  responseMode: string;
}

export interface TutorResponseInput {
  response: DashMessage;
  tutorAction: 'start' | 'evaluate' | null;
  tutorPayloadRaw: TutorPayload | null;
  sessionForTutorAction: TutorSession | null;
  activeSession: TutorSession | null;
  tutorModeForMetadata: TutorMode | null;
  userText: string;
  learnerContext: LearnerContext | null;
  hasLearningAttachment: boolean;
  tutorEntrySource: 'teacher_dashboard' | 'default';
}

export interface TutorResponseResult {
  response: DashMessage;
  displayOverride: string | null;
  sessionUpdate: ((prev: TutorSession | null) => TutorSession | null) | null;
  summaryMessage: DashMessage | null;
  shouldLogAttempt: boolean;
  attemptPayload: TutorPayload | null;
}

const GENERIC_ACK_PATTERN = /^(ok(?:ay)?|sure|got it|let me|working on|one moment|please wait)\b/i;

// ─── Pipeline: Resolve tutor action before AI call ──────────

export function resolveTutorPipeline(input: TutorPipelineInput): TutorPipelineResult {
  const {
    userText,
    routeIntent,
    profile,
    learnerContext,
    activeSession,
    externalTutorMode,
    handoffSource,
    attachments,
    tutorConfig,
  } = input;

  const normalizedRole = String(profile?.role || '').toLowerCase();
  const isTeacherDashboardTutorEntry = handoffSource === 'teacher_dashboard';
  const isK12ParentDashEntry = handoffSource === 'k12_parent_tab';

  const shouldForceTutorInteractive =
    routeIntent === 'tutor' && (isTeacherDashboardTutorEntry || !!externalTutorMode);
  const disableImplicitTutorInAdvisor = isK12ParentDashEntry && !shouldForceTutorInteractive;
  const tutorEntrySource: 'teacher_dashboard' | 'default' = isTeacherDashboardTutorEntry
    ? 'teacher_dashboard'
    : 'default';

  const rawResponseMode = classifyResponseMode({
    text: userText,
    hasAttachments: attachments.some(a => a.kind === 'image' || a.kind === 'document'),
    hasActiveTutorSession: disableImplicitTutorInAdvisor ? false : !!activeSession?.awaitingAnswer,
    explicitTutorMode: shouldForceTutorInteractive,
  });
  const responseMode = routeIntent === 'tutor' ? rawResponseMode : 'direct_writing';

  const stopTutor = isTutorStopIntent(userText);
  const leaveTutorMode = activeSession && (routeIntent !== 'tutor' || responseMode !== 'tutor_interactive');
  const shouldClearSession = !!(
    (stopTutor && activeSession) ||
    (disableImplicitTutorInAdvisor && activeSession) ||
    (leaveTutorMode && !disableImplicitTutorInAdvisor)
  );

  const isLearnerRole = ['parent', 'student', 'learner'].includes(normalizedRole);
  const canRunTutorPipeline =
    routeIntent === 'tutor' &&
    (isLearnerRole || shouldForceTutorInteractive) &&
    !disableImplicitTutorInAdvisor;

  const phonicsRequested = isLearnerRole && detectPhonicsTutorRequest(userText);
  const hasLearningAttachment = attachments.some(a => a.kind === 'image' || a.kind === 'document');

  let tutorIntent = (canRunTutorPipeline && responseMode === 'tutor_interactive')
    ? detectTutorIntent(userText)
    : null;

  if (!tutorIntent && isLearnerRole && hasLearningAttachment && responseMode === 'tutor_interactive') {
    const homeworkCheckPattern = /\b(check|mark|correct|grade|right|wrong|mistake|help|explain|review|look at|did I|show me|what is)\b/i;
    if (homeworkCheckPattern.test(userText)) {
      tutorIntent = 'explain';
    }
  }
  if (!tutorIntent && shouldForceTutorInteractive && !stopTutor) {
    tutorIntent = (externalTutorMode as TutorMode) || activeSession?.mode || 'diagnostic';
  }

  let tutorAction: 'start' | 'evaluate' | null = null;
  let tutorModeForMetadata: TutorMode | null = null;
  let tutorContextOverride: string | null = null;
  let sessionForTutorAction: TutorSession | null = null;
  let newSession: TutorSession | null = null;

  if (!disableImplicitTutorInAdvisor && activeSession?.awaitingAnswer && !stopTutor) {
    tutorAction = 'evaluate';
    tutorModeForMetadata = activeSession.mode;
    sessionForTutorAction = activeSession;
    tutorContextOverride = buildTutorSystemContext(activeSession, {
      phase: 'evaluate',
      learnerContext,
      tutorEntrySource,
    });
  } else if (tutorIntent && !stopTutor) {
    const context = extractLearningContext(userText, learnerContext);
    const enforcedSlowLearnerMode = tutorConfig?.slowLearner === true;
    newSession = {
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
      maxQuestions: getMaxQuestions(tutorIntent, learnerContext, {
        difficulty: 1,
        phonicsMode: phonicsRequested,
      }),
      difficulty: 1,
      incorrectStreak: 0,
      correctStreak: 0,
      attemptsOnQuestion: 0,
      phonicsMode: phonicsRequested,
      phonicsStage: phonicsRequested ? getInitialPhonicsStage(userText) : null,
      phonicsMastered: [],
    };
    tutorAction = 'start';
    tutorModeForMetadata = newSession.mode;
    sessionForTutorAction = newSession;
    tutorContextOverride = buildTutorSystemContext(newSession, {
      phase: 'start',
      learnerContext,
      tutorEntrySource,
    });
  }

  return {
    tutorAction,
    tutorModeForMetadata,
    tutorContextOverride,
    sessionForTutorAction,
    newSession,
    shouldClearSession,
    responseMode,
  };
}

// ─── Post-response: Process tutor payload and update session ──

export function processTutorResponse(input: TutorResponseInput): TutorResponseResult {
  const {
    response: inputResponse,
    tutorAction,
    tutorPayloadRaw,
    sessionForTutorAction,
    activeSession,
    tutorModeForMetadata,
    userText,
    learnerContext,
    hasLearningAttachment,
    tutorEntrySource,
  } = input;

  let response = { ...inputResponse };
  let displayOverride: string | null = null;
  let sessionUpdate: ((prev: TutorSession | null) => TutorSession | null) | null = null;
  let summaryMessage: DashMessage | null = null;
  let shouldLogAttempt = false;
  let attemptPayload: TutorPayload | null = null;

  if (!tutorAction || !response?.content) {
    return { response, displayOverride, sessionUpdate, summaryMessage, shouldLogAttempt, attemptPayload };
  }

  // Check for prompt leak
  const promptLeak = /return only json|tutor_payload|you are dash, an interactive tutor|tutor mode override/i.test(response.content);
  if (promptLeak && !parseTutorPayload(response.content)) {
    response = {
      ...response,
      content: 'I had a hiccup setting up the tutor. Please try again or tell me the topic and grade.',
    };
  }

  const hasTutorQuestion = !!tutorPayloadRaw?.question;
  const hasTutorEvaluation = typeof tutorPayloadRaw?.is_correct === 'boolean' ||
    !!tutorPayloadRaw?.feedback ||
    !!tutorPayloadRaw?.follow_up_question;

  let tutorPayload = (tutorAction === 'start' && !hasTutorQuestion) ||
    (tutorAction === 'evaluate' && !hasTutorEvaluation)
    ? null
    : tutorPayloadRaw;

  if (!tutorPayload && tutorAction === 'evaluate' && sessionForTutorAction) {
    tutorPayload = buildFallbackTutorEvaluation(sessionForTutorAction, userText, response.content || '');
  }

  if (tutorPayload && tutorAction === 'start' && tutorPayload.question) {
    const displayContent = buildTutorDisplayContent(tutorPayload, true);
    if (displayContent) {
      displayOverride = displayContent;
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

    const startPayload = tutorPayload;
    sessionUpdate = (prev: TutorSession | null) => {
      if (!prev) return prev;
      const needsContext = startPayload.next_step === 'need_context';
      return {
        ...prev,
        subject: startPayload.subject || prev.subject,
        grade: startPayload.grade || prev.grade,
        topic: startPayload.topic || prev.topic,
        difficulty: typeof startPayload.difficulty === 'number' ? startPayload.difficulty : prev.difficulty,
        awaitingAnswer: true,
        currentQuestion: startPayload.question || prev.currentQuestion,
        expectedAnswer: startPayload.expected_answer || prev.expectedAnswer,
        questionIndex: needsContext ? prev.questionIndex : prev.questionIndex + 1,
      };
    };
  } else if (tutorPayload && tutorAction === 'evaluate') {
    const result = processEvaluateTutor({
      tutorPayload,
      activeSession,
      userText,
      learnerContext,
      tutorModeForMetadata,
      response,
    });
    response = result.response;
    displayOverride = result.displayOverride;
    sessionUpdate = result.sessionUpdate;
    summaryMessage = result.summaryMessage;
    shouldLogAttempt = true;
    attemptPayload = result.adjustedPayload;
  } else if (!tutorPayload && sessionForTutorAction) {
    const result = processFallbackTutor({
      response,
      sessionForTutorAction,
      tutorModeForMetadata,
      tutorAction,
      hasLearningAttachment,
    });
    response = result.response;
    displayOverride = result.displayOverride;
    sessionUpdate = result.sessionUpdate;
  }

  return { response, displayOverride, sessionUpdate, summaryMessage, shouldLogAttempt, attemptPayload };
}

// ─── Internal: Evaluate tutor response ──────────────────────

interface EvaluateTutorInput {
  tutorPayload: TutorPayload;
  activeSession: TutorSession | null;
  userText: string;
  learnerContext: LearnerContext | null;
  tutorModeForMetadata: TutorMode | null;
  response: DashMessage;
}

function processEvaluateTutor(input: EvaluateTutorInput) {
  const { tutorPayload, activeSession, userText, learnerContext, tutorModeForMetadata, response: inputResponse } = input;

  let response = { ...inputResponse };
  let displayOverride: string | null = null;
  let summaryMessage: DashMessage | null = null;

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
    displayOverride = displayContent;
    response = {
      ...response,
      content: displayContent,
      metadata: {
        ...(response.metadata || {}),
        tutor_phase: tutorModeForMetadata
          ? getTutorPhaseLabel(tutorModeForMetadata)
          : getTutorPhaseLabel('practice'),
        tutor_question: !!adjustedPayload.follow_up_question,
        tutor_question_text: adjustedPayload.follow_up_question || undefined,
      },
    };
  }

  const evalPayload = adjustedPayload;
  const sessionUpdate = (prev: TutorSession | null): TutorSession | null => {
    if (!prev) return prev;
    const totalQuestions = prev.totalQuestions + 1;
    const correctCount = prev.correctCount + (evalPayload.is_correct ? 1 : 0);
    const followUp = evalPayload.follow_up_question || null;
    const followExpected = evalPayload.next_expected_answer || null;

    let nextDifficulty = prev.difficulty || 1;
    if (prev.slowLearner) {
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
      getMaxQuestions(prev.mode, learnerContext, {
        difficulty: nextDifficulty,
        phonicsMode: prev.phonicsMode,
      }),
    );

    const currentPhonicsStage = prev.phonicsStage || 'letter_sounds';
    const advancedPhonicsStage =
      prev.phonicsMode && isCorrect && nextCorrectStreak >= 2
        ? nextPhonicsStage(currentPhonicsStage)
        : currentPhonicsStage;

    const masteredTokenSource = evalPayload.correct_answer || prev.expectedAnswer || '';
    const masteredToken = String(masteredTokenSource || '').trim().toLowerCase();
    const updatedMastered = prev.phonicsMode && isCorrect && masteredToken
      ? Array.from(new Set([...(prev.phonicsMastered || []), masteredToken])).slice(-24)
      : prev.phonicsMastered;

    if (totalQuestions >= adaptiveMaxQuestions && !followUp) {
      summaryMessage = {
        id: `tutor_summary_${Date.now()}`,
        type: 'assistant',
        content: `Session complete! Score: ${correctCount}/${totalQuestions}.\nI logged your performance so we can track progress over time.`,
        timestamp: Date.now(),
      };
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
  };

  return { response, displayOverride, sessionUpdate, summaryMessage, adjustedPayload };
}

// ─── Internal: Fallback tutor (no valid payload) ────────────

interface FallbackTutorInput {
  response: DashMessage;
  sessionForTutorAction: TutorSession;
  tutorModeForMetadata: TutorMode | null;
  tutorAction: 'start' | 'evaluate';
  hasLearningAttachment: boolean;
}

function processFallbackTutor(input: FallbackTutorInput) {
  const { response: inputResponse, sessionForTutorAction, tutorModeForMetadata, tutorAction, hasLearningAttachment } = input;

  let response = { ...inputResponse };
  let displayOverride: string | null = null;

  const rawResponseText = String(response.content || '').trim();
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
    const sessionUpdate = (prev: TutorSession | null): TutorSession | null => {
      if (!prev) return prev;
      return {
        ...prev,
        awaitingAnswer: !!extractedQuestion,
        currentQuestion: extractedQuestion || prev.currentQuestion,
        expectedAnswer: null,
      };
    };
    return { response, displayOverride, sessionUpdate };
  }

  const fallbackFromResponse = extractedQuestion;
  const fallbackQuestion = fallbackFromResponse || (() => {
    if (hasLearningAttachment) {
      return response.content || 'I can see your work! Let me take a closer look — which question would you like me to check?';
    }
    if (!sessionForTutorAction.grade) return 'What grade are you in?';
    if (!sessionForTutorAction.subject) return 'Which subject is this?';
    return 'What exact question do you need help with?';
  })();

  displayOverride = fallbackQuestion;
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

  const sessionUpdate = (prev: TutorSession | null): TutorSession | null => {
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
  };

  return { response, displayOverride, sessionUpdate };
}
