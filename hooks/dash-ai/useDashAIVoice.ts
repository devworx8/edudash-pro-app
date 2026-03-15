/**
 * useDashAIVoice — Voice I/O management for Dash AI.
 *
 * Encapsulates:
 * - STT (speech-to-text) start/stop via voiceHandlersCore
 * - TTS (text-to-speech) speak/stop via speakDashResponse
 * - Voice budget tracking for free-tier users
 * - Voice auto-send countdown (transcript → delayed send)
 * - TTS/STT access gating
 */

import { useCallback, useRef, useState, useEffect, useMemo } from 'react';

import type { DashMessage } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import type { SpeechChunkProgress } from '@/hooks/dash-assistant/voiceHandlers';
import type { VoiceSession } from '@/lib/voice/unifiedProvider';
import type { VoiceProbeMetrics } from '@/lib/voice/benchmark/types';
import type { LearnerContext } from '@/lib/dash-ai/learnerContext';
import type { AlertState } from './types';

import {
  handleDashVoiceInputPress,
  stopDashVoiceRecording,
  speakDashResponse,
} from '@/hooks/dash-assistant/voiceHandlers';
import { loadVoiceBudget, trackVoiceUsage } from '@/lib/dash-ai/voiceBudget';
import { buildTranscriptModelPrompt } from '@/lib/voice/formatTranscript';
import { resolveVoiceLocale } from '@/hooks/dash-assistant/assistantHelpers';

// ─── Options ────────────────────────────────────────────────

export interface UseDashAIVoiceOptions {
  dashInstance: IDashAIAssistant | null;
  isFreeTier: boolean;
  tier: string | undefined;
  isSpeaking: boolean;
  speakingMessageId: string | null;
  voiceEnabled: boolean;
  learnerContext: LearnerContext | null;
  profile: { preferred_language?: string | null; role?: string } | null;

  // Setters from shared context
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  setSpeakingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setSpeechChunkProgress: React.Dispatch<React.SetStateAction<SpeechChunkProgress | null>>;

  // Alert system
  showAlert: (config: Omit<AlertState, 'visible'>) => void;
  hideAlert: () => void;

  // Input text (for auto-send comparison)
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;

  // Send callback for voice auto-send
  sendMessageRef: React.MutableRefObject<(text?: string) => Promise<void>>;
}

// ─── Return type ────────────────────────────────────────────

export interface UseDashAIVoiceReturn {
  // Recording state
  isRecording: boolean;
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>;
  recordingVoiceActivity: boolean;
  partialTranscript: string;

  // Voice preferences
  voiceAutoSend: boolean;
  setVoiceAutoSend: React.Dispatch<React.SetStateAction<boolean>>;
  voiceAutoSendSilenceMs: number;
  setVoiceAutoSendSilenceMs: React.Dispatch<React.SetStateAction<number>>;
  voiceWhisperFlowEnabled: boolean;
  setVoiceWhisperFlowEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  voiceWhisperFlowSummaryEnabled: boolean;
  setVoiceWhisperFlowSummaryEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  // Auto-send countdown
  voiceAutoSendCountdownActive: boolean;
  voiceAutoSendCountdownMs: number;

  // Budget
  voiceBudgetRemainingMs: number | null;
  refreshVoiceBudget: () => Promise<void>;
  consumeVoiceBudget: (deltaMs: number) => Promise<void>;

  // Access checks
  hasTTSAccess: () => boolean;
  hasSTTAccess: () => boolean;

  // Actions
  handleInputMicPress: () => Promise<void>;
  stopVoiceRecording: () => Promise<void>;
  speakResponse: (message: DashMessage, options?: { preferFastStart?: boolean; forceSpeak?: boolean }) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  cancelVoiceAutoSend: () => void;
  handleVoiceFinalTranscript: (
    transcript: string,
    options: { autoSend: boolean; delayMs: number; probe?: VoiceProbeMetrics },
  ) => void;

  // Next voice turn flag (consumed by sendMessage)
  nextVoiceTurnRef: React.MutableRefObject<boolean>;

  // Refs needed by external callers
  voiceRefs: {
    voiceSessionRef: React.MutableRefObject<VoiceSession | null>;
    voiceProviderRef: React.MutableRefObject<any>;
    voiceInputStartAtRef: React.MutableRefObject<number | null>;
    lastSpeakStartRef: React.MutableRefObject<number>;
    ttsSessionIdRef: React.MutableRefObject<string | null>;
    sttFinalizeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    sttTranscriptBufferRef: React.MutableRefObject<string>;
  };

  // Dictation probe ref for voice metrics
  voiceDictationProbeRef: React.MutableRefObject<VoiceProbeMetrics | null>;
}

// ─── Hook ───────────────────────────────────────────────────

export function useDashAIVoice(options: UseDashAIVoiceOptions): UseDashAIVoiceReturn {
  const {
    dashInstance,
    isFreeTier,
    tier,
    isSpeaking,
    speakingMessageId,
    voiceEnabled,
    learnerContext,
    profile,
    setIsSpeaking,
    setSpeakingMessageId,
    setSpeechChunkProgress,
    showAlert,
    hideAlert,
    inputText,
    setInputText,
    sendMessageRef,
  } = options;

  // ── Local state ─────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingVoiceActivity, setRecordingVoiceActivity] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [voiceAutoSend, setVoiceAutoSend] = useState(false);
  const [voiceAutoSendSilenceMs, setVoiceAutoSendSilenceMs] = useState(900);
  const [voiceWhisperFlowEnabled, setVoiceWhisperFlowEnabled] = useState(true);
  const [voiceWhisperFlowSummaryEnabled, setVoiceWhisperFlowSummaryEnabled] = useState(true);
  const [voiceAutoSendCountdownActive, setVoiceAutoSendCountdownActive] = useState(false);
  const [voiceAutoSendCountdownMs, setVoiceAutoSendCountdownMs] = useState(0);
  const [voiceBudgetRemainingMs, setVoiceBudgetRemainingMs] = useState<number | null>(null);

  // ── Refs ────────────────────────────────────────────────
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const voiceProviderRef = useRef<any>(null);
  const voiceInputStartAtRef = useRef<number | null>(null);
  const lastSpeakStartRef = useRef<number>(0);
  const ttsSessionIdRef = useRef<string | null>(null);
  const sttFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sttTranscriptBufferRef = useRef('');
  const voiceAutoSendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceAutoSendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceAutoSendDeadlineRef = useRef<number | null>(null);
  const voiceAutoSendExpectedTranscriptRef = useRef('');
  const voiceDictationProbeRef = useRef<VoiceProbeMetrics | null>(null);
  const nextVoiceTurnRef = useRef(false);
  const inputTextRef = useRef('');
  const learnerContextRef = useRef<LearnerContext | null>(null);

  // Keep refs synced
  useEffect(() => { inputTextRef.current = inputText; }, [inputText]);
  useEffect(() => { learnerContextRef.current = learnerContext; }, [learnerContext]);
  useEffect(() => {
    if (!isRecording) setRecordingVoiceActivity(false);
  }, [isRecording]);

  // ── Voice refs bundle ───────────────────────────────────
  const voiceRefs = useMemo(() => ({
    voiceSessionRef,
    voiceProviderRef,
    voiceInputStartAtRef,
    lastSpeakStartRef,
    ttsSessionIdRef,
    sttFinalizeTimerRef,
    sttTranscriptBufferRef,
  }), []);

  // ── Budget ──────────────────────────────────────────────
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

  useEffect(() => { refreshVoiceBudget(); }, [refreshVoiceBudget]);

  // ── Access checks ───────────────────────────────────────
  const hasFreeVoiceBudget =
    voiceBudgetRemainingMs === null ? true : voiceBudgetRemainingMs > 0;

  const hasTTSAccess = useCallback(() => {
    if (!isFreeTier) return true;
    return hasFreeVoiceBudget;
  }, [isFreeTier, hasFreeVoiceBudget]);

  const hasSTTAccess = useCallback(() => true, []);

  // ── Cancel voice auto-send ──────────────────────────────
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

  // ── Stop speaking ───────────────────────────────────────
  const stopSpeaking = useCallback(async () => {
    if (!dashInstance) return;
    try {
      ttsSessionIdRef.current = null;
      await dashInstance.stopSpeaking();
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      setSpeechChunkProgress(null);
    } catch {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      setSpeechChunkProgress(null);
    }
  }, [dashInstance, setIsSpeaking, setSpeakingMessageId, setSpeechChunkProgress]);

  // ── Speak response ──────────────────────────────────────
  const speakResponse = useCallback(
    async (
      message: DashMessage,
      opts?: { preferFastStart?: boolean; forceSpeak?: boolean },
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
        voiceRefs,
        setIsSpeaking,
        setSpeakingMessageId,
        showAlert,
        hideAlert,
        setVoiceEnabled: () => {},
        stopSpeaking,
        preferFastStart: opts?.preferFastStart,
        forceSpeak: opts?.forceSpeak,
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
      voiceRefs,
      setSpeechChunkProgress,
      setIsSpeaking,
      setSpeakingMessageId,
    ],
  );

  // ── Voice final transcript + auto-send countdown ────────
  const handleVoiceFinalTranscript = useCallback(
    (
      transcript: string,
      opts: { autoSend: boolean; delayMs: number; probe?: VoiceProbeMetrics },
    ) => {
      cancelVoiceAutoSend();
      if (opts.probe) {
        voiceDictationProbeRef.current = {
          ...opts.probe,
          platform: 'mobile',
          source: opts.probe.source || 'dash_assistant',
        };
      }

      const trimmed = transcript.trim();
      if (!trimmed || !opts.autoSend) return;

      const modelPrompt = buildTranscriptModelPrompt(trimmed, {
        preschoolMode: learnerContextRef.current?.schoolType === 'preschool',
      });
      const outboundPrompt = modelPrompt || trimmed;

      const isPreschool = learnerContextRef.current?.schoolType === 'preschool';
      const defaultDelayMs = isPreschool ? 1500 : 850;
      const minDelayMs = isPreschool ? 1200 : 600;
      const maxDelayMs = isPreschool ? 2600 : 1800;
      const parsedDelay = Number(opts.delayMs);
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
        sendMessageRef.current(outboundPrompt)
          .catch(() => {
            nextVoiceTurnRef.current = false;
          })
          .finally(() => {
            cancelVoiceAutoSend();
          });
      }, delayMs);
    },
    [cancelVoiceAutoSend, sendMessageRef],
  );

  // ── Stop voice recording ────────────────────────────────
  const stopVoiceRecording = useCallback(async () => {
    cancelVoiceAutoSend();
    await stopDashVoiceRecording({
      voiceRefs,
      isFreeTier,
      consumeVoiceBudget,
      setIsRecording,
      setPartialTranscript,
      setInputText,
    });
    setRecordingVoiceActivity(false);
  }, [cancelVoiceAutoSend, consumeVoiceBudget, isFreeTier, setInputText, voiceRefs]);

  // ── Handle mic button press ─────────────────────────────
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
      voiceRefs,
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
    isFreeTier,
    consumeVoiceBudget,
    voiceAutoSend,
    voiceAutoSendSilenceMs,
    voiceWhisperFlowEnabled,
    voiceWhisperFlowSummaryEnabled,
    learnerContext?.schoolType,
    handleVoiceFinalTranscript,
    inputText,
    voiceRefs,
    setInputText,
  ]);

  return {
    isRecording,
    setIsRecording,
    recordingVoiceActivity,
    partialTranscript,
    voiceAutoSend,
    setVoiceAutoSend,
    voiceAutoSendSilenceMs,
    setVoiceAutoSendSilenceMs,
    voiceWhisperFlowEnabled,
    setVoiceWhisperFlowEnabled,
    voiceWhisperFlowSummaryEnabled,
    setVoiceWhisperFlowSummaryEnabled,
    voiceAutoSendCountdownActive,
    voiceAutoSendCountdownMs,
    voiceBudgetRemainingMs,
    refreshVoiceBudget,
    consumeVoiceBudget,
    hasTTSAccess,
    hasSTTAccess,
    handleInputMicPress,
    stopVoiceRecording,
    speakResponse,
    stopSpeaking,
    cancelVoiceAutoSend,
    handleVoiceFinalTranscript,
    nextVoiceTurnRef,
    voiceRefs,
    voiceDictationProbeRef,
  };
}
