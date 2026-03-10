/**
 * useVoiceRecorder Hook
 * 
 * Handles audio recording with metering for silence detection.
 * Extracted from VoiceOrb per WARP.md guidelines.
 * 
 * @module components/super-admin/voice-orb/useVoiceRecorder
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  useAudioRecorder, 
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
} from 'expo-audio';

// Silence detection settings (defaults, overridable via options)
// Speech threshold is configurable via env (default -30dB for better sensitivity in quiet environments)
const DEFAULT_SPEECH_THRESHOLD = parseFloat(process.env.EXPO_PUBLIC_VOICE_SPEECH_THRESHOLD || '-30');
const DEFAULT_SILENCE_DURATION_MS = 1200; // Reduced from 1400 for faster auto-send
const MIN_RECORDING_MS = 600; // Reduced from 800 for quicker response
const MAX_RECORDING_MS = 30000;
const METERING_INTERVAL_MS = 100; // Reduced from 150 for faster silence detection

export interface VoiceRecorderOptions {
  /** Override speech threshold dB (default -30). Use -35 for children. */
  speechThreshold?: number;
  /** Override silence duration ms (default 1400). Use 3000+ for children. */
  silenceDuration?: number;
}

export interface VoiceRecorderState {
  isRecording: boolean;
  audioLevel: number;
  hasSpeechStarted: boolean;
  recordingDuration: number;
}

export interface VoiceRecorderActions {
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<string | null>;
}

export function useVoiceRecorder(
  onSilenceDetected?: () => void,
  options?: VoiceRecorderOptions,
): [VoiceRecorderState, VoiceRecorderActions, number | null] {
  const SPEECH_THRESHOLD = options?.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD;
  const SILENCE_DURATION_MS = options?.silenceDuration ?? DEFAULT_SILENCE_DURATION_MS;
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasSpeechStarted, setHasSpeechStarted] = useState(false);
  
  // Recording options with metering enabled
  const recordingOptions = {
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  };
  
  const recorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(recorder, METERING_INTERVAL_MS);
  const preparedRef = useRef(false);
  
  // Refs for silence detection
  const lastSoundTime = useRef<number>(Date.now());
  const recordingStartTime = useRef<number>(Date.now());
  const speechDetected = useRef<boolean>(false);
  const silenceTriggered = useRef<boolean>(false); // Prevent multiple triggers
  const lastUpdateTime = useRef<number>(0);

  // Process metering data in useEffect to avoid render-time side effects
  useEffect(() => {
    if (!recorderState.isRecording || silenceTriggered.current) return;
    
    const metering = recorderState.metering ?? -160;
    const normalizedLevel = Math.max(0, Math.min(1, (metering + 60) / 60));
    const now = Date.now();
    const recordingDuration = now - recordingStartTime.current;
    
    // Throttle state updates to every 200ms
    if (now - lastUpdateTime.current > 200) {
      setAudioLevel(normalizedLevel);
      lastUpdateTime.current = now;
    }
    
    // Detect speech
    if (metering > SPEECH_THRESHOLD) {
      if (!speechDetected.current) {
        speechDetected.current = true;
        setHasSpeechStarted(true);
        console.log('[VoiceRecorder] 🎤 Speech detected!', { metering: metering.toFixed(1) });
      }
      lastSoundTime.current = now;
    }
    
    // Check for silence after speech
    const timeSinceSpeech = now - lastSoundTime.current;
    
    if (speechDetected.current && recordingDuration > MIN_RECORDING_MS) {
      if (timeSinceSpeech > SILENCE_DURATION_MS && !silenceTriggered.current) {
        console.log('[VoiceRecorder] 🔇 Silence detected, triggering callback...');
        silenceTriggered.current = true; // Prevent further triggers
        onSilenceDetected?.();
        return;
      }
    }
    
    // Safety: auto-trigger after max recording time
    if (recordingDuration > MAX_RECORDING_MS && !silenceTriggered.current) {
      console.log('[VoiceRecorder] ⏱️ Max recording time reached');
      silenceTriggered.current = true; // Prevent further triggers
      onSilenceDetected?.();
    }
  }, [recorderState.metering, recorderState.isRecording, onSilenceDetected]);

  // Start recording
  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[VoiceRecorder] Starting recording...');
      
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        console.error('[VoiceRecorder] Recording permission denied');
        return false;
      }

      if (recorderState.isRecording) {
        console.warn('[VoiceRecorder] Recorder already active, skipping prepare');
        return false;
      }
      
      // Reset state
      speechDetected.current = false;
      silenceTriggered.current = false; // Reset trigger flag
      setHasSpeechStarted(false);
      recordingStartTime.current = Date.now();
      lastSoundTime.current = Date.now();
      lastUpdateTime.current = 0;
      
      if (!preparedRef.current) {
        await recorder.prepareToRecordAsync();
        preparedRef.current = true;
      }
      recorder.record();
      
      console.log('[VoiceRecorder] Recording started');
      return true;
    } catch (error) {
      console.error('[VoiceRecorder] Error starting recording:', error);
      const message = String(error);
      if (message.includes('already been prepared')) {
        try {
          preparedRef.current = true;
          recorder.record();
          return true;
        } catch {}
      }
      return false;
    }
  }, [recorder, recorderState.isRecording]);

  // Stop recording
  const stopRecording = useCallback(async (): Promise<string | null> => {
    try {
      // Mark as triggered to stop further processing
      silenceTriggered.current = true;
      
      if (!recorderState.isRecording) {
        return null;
      }
      
      console.log('[VoiceRecorder] Stopping recording...');
      await recorder.stop();
      preparedRef.current = false;
      
      const uri = recorder.uri;
      console.log('[VoiceRecorder] Recording stopped, URI:', uri ? 'obtained' : 'null');
      return uri || null;
    } catch (error) {
      console.error('[VoiceRecorder] Error stopping recording:', error);
      return null;
    }
  }, [recorder, recorderState.isRecording]);

  const state: VoiceRecorderState = {
    isRecording: recorderState.isRecording,
    audioLevel,
    hasSpeechStarted,
    recordingDuration: Date.now() - recordingStartTime.current,
  };

  const actions: VoiceRecorderActions = {
    startRecording,
    stopRecording,
  };

  return [state, actions, recorderState.metering ?? null];
}

export default useVoiceRecorder;
