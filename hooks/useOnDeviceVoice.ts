/**
 * useOnDeviceVoice Hook
 * 
 * On-device speech recognition using expo-speech-recognition (via unified provider)
 * Perfect for short text input (chat messages, search, etc.)
 * 
 * Benefits:
 * - Fast (no network latency)
 * - Free (no API costs)
 * - Real-time partial results
 * - Works offline
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { getSingleUseVoiceProvider, type VoiceSession, type VoiceProvider } from '@/lib/voice/unifiedProvider';

export interface OnDeviceVoiceOptions {
  language?: string; // e.g., 'en-ZA', 'af-ZA', 'zu-ZA'
  /** When true, auto-restarts listening after final result / session end (whisper-flow) */
  continuous?: boolean;
  /** Delay (ms) before auto-restart in continuous mode. Default 400 */
  continuousRestartDelayMs?: number;
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (error: string) => void;
}

export interface OnDeviceVoiceState {
  isListening: boolean;
  isAvailable: boolean;
  partialText: string;
  finalText: string;
  error: string | null;
}

export function useOnDeviceVoice(options: OnDeviceVoiceOptions = {}) {
  const {
    language = 'en-ZA',
    continuous = false,
    continuousRestartDelayMs = 400,
    onPartialResult,
    onFinalResult,
    onError,
  } = options;

  const [state, setState] = useState<OnDeviceVoiceState>({
    isListening: false,
    isAvailable: true,
    partialText: '',
    finalText: '',
    error: null,
  });

  const isListeningRef = useRef(false);
  const sessionRef = useRef<VoiceSession | null>(null);
  const providerRef = useRef<VoiceProvider | null>(null);
  /** Prevents auto-restart when user explicitly called stopListening */
  const explicitStopRef = useRef(false);
  /** Timer for whisper-flow continuous restart */
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize provider availability
  useEffect(() => {
    let mounted = true;
    const initProvider = async () => {
      try {
        const provider = await getSingleUseVoiceProvider(language);
        providerRef.current = provider;
        const available = await provider.isAvailable();
        if (!mounted) return;
        setState(prev => ({ ...prev, isAvailable: available }));
        if (!available) {
          console.warn('[useOnDeviceVoice] Speech recognition not available');
        }
      } catch (initError) {
        console.error('[useOnDeviceVoice] Voice initialization error:', initError);
        if (mounted) setState(prev => ({ ...prev, isAvailable: false }));
      }
    };

    initProvider();

    return () => {
      mounted = false;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      sessionRef.current?.stop?.().catch(() => { /* Intentional: cleanup best-effort */ });
      sessionRef.current = null;
    };
  }, [language]);

  const startListening = useCallback(async () => {
    if (!state.isAvailable) {
      console.error('[useOnDeviceVoice] Voice not available');
      onError?.('Speech recognition not available on this device');
      return;
    }

    if (isListeningRef.current) {
      console.warn('[useOnDeviceVoice] Already listening');
      return;
    }

    explicitStopRef.current = false;

    try {
      console.log('[useOnDeviceVoice] Starting speech recognition with language:', language, continuous ? '(continuous/whisper-flow)' : '');

      const provider = providerRef.current ?? await getSingleUseVoiceProvider(language);
      providerRef.current = provider;

      const session = provider.createSession();
      sessionRef.current = session;

      const ok = await session.start({
        language,
        onPartial: (text) => {
          setState(prev => ({ ...prev, partialText: text }));
          onPartialResult?.(text);
        },
        onFinal: (text) => {
          setState(prev => ({ ...prev, finalText: text, partialText: '' }));
          onFinalResult?.(text);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { /* Intentional: error handled */ });

          // Whisper-flow: schedule restart after final result if continuous mode
          if (continuous && !explicitStopRef.current) {
            scheduleRestart();
          }
        },
        onError: (errorMsg) => {
          isListeningRef.current = false;
          setState(prev => ({ ...prev, isListening: false, error: errorMsg }));
          onError?.(errorMsg);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { /* Intentional: error handled */ });
        },
      });

      if (!ok) {
        throw new Error('Speech recognition not available');
      }

      isListeningRef.current = true;
      setState(prev => ({ 
        ...prev, 
        isListening: true, 
        error: null,
        partialText: '',
        finalText: '' 
      }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { /* Intentional: error handled */ });
      console.log('[useOnDeviceVoice] ✅ Speech recognition started');
    } catch (error) {
      console.error('[useOnDeviceVoice] Failed to start:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to start speech recognition';
      setState(prev => ({ ...prev, error: errorMsg }));
      onError?.(errorMsg);
    }
  }, [state.isAvailable, language, continuous, onPartialResult, onFinalResult, onError]);

  /** Whisper-flow: schedule a restart of listening after a short delay */
  const scheduleRestart = useCallback(() => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(async () => {
      if (explicitStopRef.current || !state.isAvailable) return;
      console.log('[useOnDeviceVoice] 🔄 Whisper-flow: auto-restart listening');
      isListeningRef.current = false; // Allow startListening to proceed
      try {
        await sessionRef.current?.stop?.();
      } catch { /* best-effort cleanup */ }
      sessionRef.current = null;
      // Re-invoke startListening
      // Note: We re-create provider + session to avoid stale listener state
      const provider = providerRef.current ?? await getSingleUseVoiceProvider(language);
      providerRef.current = provider;
      const session = provider.createSession();
      sessionRef.current = session;
      const ok = await session.start({
        language,
        onPartial: (text) => {
          setState(prev => ({ ...prev, partialText: text }));
          onPartialResult?.(text);
        },
        onFinal: (text) => {
          setState(prev => ({ ...prev, finalText: text, partialText: '' }));
          onFinalResult?.(text);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (!explicitStopRef.current) scheduleRestart();
        },
        onError: (errorMsg) => {
          isListeningRef.current = false;
          setState(prev => ({ ...prev, isListening: false, error: errorMsg }));
          onError?.(errorMsg);
        },
      });
      if (ok) {
        isListeningRef.current = true;
        setState(prev => ({ ...prev, isListening: true }));
      }
    }, continuousRestartDelayMs);
  }, [language, state.isAvailable, continuousRestartDelayMs, onPartialResult, onFinalResult, onError]);

  const stopListening = useCallback(async () => {
    explicitStopRef.current = true;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    // Always attempt to stop the session even if isListeningRef is false.
    // The ref can desync from the actual session state (e.g. after an error
    // callback sets it to false while the recognizer is still running).
    try {
      if (sessionRef.current) {
        console.log('[useOnDeviceVoice] Stopping speech recognition');
        await sessionRef.current.stop();
        console.log('[useOnDeviceVoice] ✅ Speech recognition stopped');
      }
    } catch (error) {
      console.error('[useOnDeviceVoice] Failed to stop:', error);
    } finally {
      isListeningRef.current = false;
      setState(prev => ({ ...prev, isListening: false }));
    }
  }, []);

  const cancelListening = useCallback(async () => {
    explicitStopRef.current = true;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    // Always attempt to stop — do not early-return based on isListeningRef.
    // The ref can be out of sync while the underlying session is still active,
    // which causes the "Listening muted" label to show while the recognizer
    // keeps running in the background.
    try {
      if (sessionRef.current) {
        console.log('[useOnDeviceVoice] Canceling speech recognition');
        await sessionRef.current.stop();
        console.log('[useOnDeviceVoice] ✅ Speech recognition canceled');
      }
    } catch (error) {
      console.error('[useOnDeviceVoice] Failed to cancel:', error);
    } finally {
      isListeningRef.current = false;
      setState(prev => ({
        ...prev,
        isListening: false,
        partialText: '',
        finalText: '',
      }));
    }
  }, []);

  const clearResults = useCallback(() => {
    setState(prev => ({ ...prev, partialText: '', finalText: '', error: null }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    cancelListening,
    clearResults,
  };
}
