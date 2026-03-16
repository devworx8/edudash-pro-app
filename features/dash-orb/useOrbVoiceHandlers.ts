/**
 * features/dash-orb/useOrbVoiceHandlers.ts
 *
 * Extracted from DashOrbImpl.tsx — wake-word detection, mic press
 * (push-to-talk toggle), stop-all-activity, and whisper-mode
 * auto-restart logic.
 */

import { useCallback, useEffect } from 'react';
import { Animated, Platform } from 'react-native';
import { formatTranscript } from '@/lib/voice/formatTranscript';
import type { ChatMessage } from '@/components/dash-orb/ChatModal';
import { normalizeSupportedLanguage } from './orbTutorHelpers';

// ─── Types ──────────────────────────────────────────────────

export interface OrbVoiceState {
  isExpanded: boolean;
  locked: boolean;
  voiceEnabled: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  isListeningForCommand: boolean;
  whisperModeEnabled: boolean;
  selectedLanguage: 'en-ZA' | 'af-ZA' | 'zu-ZA';
  orgType: string | null;
}

export interface OrbVoiceRefs {
  isListeningForCommandRef: React.MutableRefObject<boolean>;
  whisperModeEnabledRef: React.MutableRefObject<boolean>;
  shouldRestartListeningRef: React.MutableRefObject<boolean>;
  triggerListeningRef: React.MutableRefObject<(() => void) | null>;
  handleSendRef: React.MutableRefObject<(text: string) => Promise<void>>;
  onDeviceTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  ttsSentenceQueueRef: React.MutableRefObject<string[]>;
  isSpeakingSentenceRef: React.MutableRefObject<boolean>;
  upgradeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export interface OrbVoiceHooks {
  onDeviceVoice: {
    isAvailable: boolean;
    isListening: boolean;
    startListening: () => Promise<void>;
    stopListening: () => Promise<void>;
    clearResults: () => void;
  };
  voiceRecorderState: { isRecording: boolean } | null;
  voiceRecorderActions: {
    startRecording: () => Promise<boolean>;
    stopRecording: () => Promise<string | null>;
  } | null;
  voiceSTT: {
    transcribe: (uri: string, lang: string) => Promise<{ text: string; language?: string | null } | null>;
  } | null;
  stopSpeaking: () => Promise<void>;
  cancelStream: (() => void) | undefined;
}

export interface OrbVoiceSetters {
  setIsExpanded: (v: boolean) => void;
  setIsListeningForCommand: (v: boolean) => void;
  setLiveTranscript: (v: string) => void;
  setInputText: (v: string) => void;
  setIsProcessing: (v: boolean) => void;
  setSelectedLanguage: (v: 'en-ZA' | 'af-ZA' | 'zu-ZA') => void;
  setShowUpgradeBubble: (v: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  upgradeAnim: Animated.Value;
}

// ─── Hook ───────────────────────────────────────────────────

export function useOrbVoiceHandlers(
  state: OrbVoiceState,
  refs: OrbVoiceRefs,
  hooks: OrbVoiceHooks,
  setters: OrbVoiceSetters,
) {
  // ---------- handleWakeWordDetected ----------
  const handleWakeWordDetected = useCallback(async () => {
    if (state.locked) {
      if (refs.upgradeTimerRef.current) clearTimeout(refs.upgradeTimerRef.current);
      setters.setShowUpgradeBubble(true);
      Animated.timing(setters.upgradeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      refs.upgradeTimerRef.current = setTimeout(() => {
        Animated.timing(setters.upgradeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
          setters.setShowUpgradeBubble(false),
        );
      }, 3600);
      return;
    }

    // Barge-in
    try {
      const bargeInNeeded =
        state.isSpeaking ||
        refs.isSpeakingSentenceRef.current ||
        refs.ttsSentenceQueueRef.current.length > 0;
      if (bargeInNeeded) {
        refs.ttsSentenceQueueRef.current = [];
        refs.isSpeakingSentenceRef.current = false;
        await Promise.resolve(hooks.stopSpeaking());
      }
      if (state.isProcessing) hooks.cancelStream?.();
    } catch { /* barge-in best-effort */ }

    if (!state.voiceEnabled) return;

    setters.setIsListeningForCommand(true);
    setters.setMessages((prev) => [
      ...prev,
      { id: `listening-${Date.now()}`, role: 'system', content: '🎤 Listening...', timestamp: new Date() },
    ]);

    // On-device path
    const canUseOnDevice = Platform.OS !== 'web' && hooks.onDeviceVoice.isAvailable;
    if (canUseOnDevice) {
      try {
        setters.setLiveTranscript('');
        setters.setInputText('');
        hooks.onDeviceVoice.clearResults();
        await hooks.onDeviceVoice.startListening();

        if (refs.onDeviceTimeoutRef.current) clearTimeout(refs.onDeviceTimeoutRef.current);
        refs.onDeviceTimeoutRef.current = setTimeout(() => {
          hooks.onDeviceVoice.stopListening();
          setters.setLiveTranscript('');
          setters.setInputText('');
          setters.setIsListeningForCommand(false);
          setters.setMessages((prev) => prev.filter((m) => !m.id.startsWith('listening-')));
        }, 10000);
        return;
      } catch { /* fall through to server STT */ }
    }

    // Server STT path
    try {
      if (hooks.voiceRecorderActions && hooks.voiceSTT) {
        const started = await hooks.voiceRecorderActions.startRecording();
        if (!started) {
          setters.setIsListeningForCommand(false);
          setters.setMessages((prev) => prev.filter((m) => !m.id.startsWith('listening-')));
          return;
        }

        const checkRecording = setInterval(async () => {
          if (hooks.voiceRecorderState && !hooks.voiceRecorderState.isRecording) {
            clearInterval(checkRecording);
            const audioUri = await hooks.voiceRecorderActions!.stopRecording();
            if (audioUri) {
              const transcriptResult = await hooks.voiceSTT!.transcribe(audioUri, 'auto');
              if (transcriptResult?.text?.trim()) {
                const normalized = normalizeSupportedLanguage(transcriptResult.language);
                if (normalized) setters.setSelectedLanguage(normalized);
                setters.setMessages((prev) => prev.filter((m) => !m.id.startsWith('listening-')));
                const formatted = formatTranscript(transcriptResult.text, transcriptResult.language || normalized || undefined, {
                  whisperFlow: true,
                  summarize: true,
                  preschoolMode: state.orgType === 'preschool',
                  maxSummaryWords: state.orgType === 'preschool' ? 16 : 20,
                });
                refs.shouldRestartListeningRef.current = refs.whisperModeEnabledRef.current;
                await refs.handleSendRef.current(formatted);
              }
            }
            setters.setIsListeningForCommand(false);
          }
        }, 500);

        setTimeout(() => {
          clearInterval(checkRecording);
          if (hooks.voiceRecorderState?.isRecording) hooks.voiceRecorderActions!.stopRecording();
          setters.setIsListeningForCommand(false);
          setters.setMessages((prev) => prev.filter((m) => !m.id.startsWith('listening-')));
        }, 10000);
      }
    } catch {
      setters.setIsListeningForCommand(false);
      setters.setMessages((prev) => prev.filter((m) => !m.id.startsWith('listening-')));
    }
  }, [
    state.locked, state.isSpeaking, state.isProcessing, state.voiceEnabled, state.orgType,
    hooks,
    refs, setters,
  ]);

  // Keep triggerListeningRef in sync
  useEffect(() => {
    refs.triggerListeningRef.current = () => { void handleWakeWordDetected(); };
  }, [handleWakeWordDetected, refs]);

  // ---------- handleMicPress ----------
  const handleMicPress = useCallback(async () => {
    if (state.isListeningForCommand) {
      refs.shouldRestartListeningRef.current = false;
      if (refs.onDeviceTimeoutRef.current) {
        clearTimeout(refs.onDeviceTimeoutRef.current);
        refs.onDeviceTimeoutRef.current = null;
      }
      if (hooks.onDeviceVoice.isListening) await hooks.onDeviceVoice.stopListening();
      if (hooks.voiceRecorderState?.isRecording) await hooks.voiceRecorderActions?.stopRecording();
      setters.setLiveTranscript('');
      setters.setInputText('');
      setters.setMessages((prev) => prev.filter((m) => !m.id.startsWith('listening-')));
      setters.setIsListeningForCommand(false);
    } else {
      await handleWakeWordDetected();
    }
  }, [state.isListeningForCommand, handleWakeWordDetected, hooks, refs, setters]);

  // ---------- handleStopActivity ----------
  const handleStopActivity = useCallback(async () => {
    refs.shouldRestartListeningRef.current = false;
    if (refs.onDeviceTimeoutRef.current) {
      clearTimeout(refs.onDeviceTimeoutRef.current);
      refs.onDeviceTimeoutRef.current = null;
    }
    refs.ttsSentenceQueueRef.current = [];
    refs.isSpeakingSentenceRef.current = false;

    try { hooks.cancelStream?.(); } catch { /* best-effort */ }
    try { if (hooks.onDeviceVoice.isListening) await hooks.onDeviceVoice.stopListening(); } catch { /* best-effort */ }
    try { if (hooks.voiceRecorderState?.isRecording) await hooks.voiceRecorderActions?.stopRecording(); } catch { /* best-effort */ }
    try { await Promise.resolve(hooks.stopSpeaking()); } catch { /* best-effort */ }

    setters.setIsListeningForCommand(false);
    setters.setIsProcessing(false);
    setters.setLiveTranscript('');
    setters.setMessages((prev) =>
      prev
        .filter((m) => !m.id.startsWith('listening-'))
        .map((m) =>
          m.isLoading || m.isStreaming
            ? { ...m, isLoading: false, isStreaming: false, toolCalls: undefined, content: m.content ? `${m.content}\n\n(Stopped)` : '(Stopped)' }
            : m,
        ),
    );
  }, [hooks, refs, setters]);

  // ---------- whisper mode auto-restart ----------
  useEffect(() => {
    if (!state.whisperModeEnabled) return;
    if (!refs.shouldRestartListeningRef.current) return;
    if (state.isProcessing || state.isSpeaking || state.isListeningForCommand) return;

    const timer = setTimeout(() => {
      if (!refs.whisperModeEnabledRef.current) return;
      if (state.isProcessing || state.isSpeaking || refs.isListeningForCommandRef.current) return;
      if (refs.isSpeakingSentenceRef.current || refs.ttsSentenceQueueRef.current.length > 0) return;
      refs.shouldRestartListeningRef.current = false;
      refs.triggerListeningRef.current?.();
    }, 650);

    return () => clearTimeout(timer);
  }, [state.whisperModeEnabled, state.isProcessing, state.isSpeaking, state.isListeningForCommand, refs]);

  return { handleWakeWordDetected, handleMicPress, handleStopActivity };
}
