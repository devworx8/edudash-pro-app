/**
 * Voice Recording Hook
 * WARP.md compliant: ≤150 lines
 * 
 * Handles browser-based voice recording using MediaRecorder API
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface VoiceRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  error: string | null;
  permissionState: 'prompt' | 'granted' | 'denied' | 'unknown';
  probe: VoiceDictationProbe | null;
}

export interface VoiceDictationProbe {
  run_id?: string;
  platform: 'web';
  source: string;
  stt_start_at?: string;
  first_partial_at?: string;
  final_transcript_at?: string;
  commit_at?: string;
}

export interface UseVoiceRecordingReturn {
  state: VoiceRecordingState;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  cancelRecording: () => void;
  isSupported: boolean;
  permissionState: 'prompt' | 'granted' | 'denied' | 'unknown';
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [state, setState] = useState<VoiceRecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
    error: null,
    permissionState: 'unknown',
    probe: null,
  });

  // Initialize isSupported as false to match server render, then update on mount
  const [isSupported, setIsSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check if browser supports audio recording after mount to avoid hydration mismatch
  useEffect(() => {
    const supported = typeof navigator !== 'undefined' && 
                      !!navigator.mediaDevices?.getUserMedia &&
                      typeof MediaRecorder !== 'undefined';
    setIsSupported(supported);
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setState(prev => ({ 
        ...prev, 
        error: 'Voice recording not supported in this browser',
        permissionState: 'denied'
      }));
      return false;
    }

    try {
      // Request microphone access
      setState(prev => ({ ...prev, permissionState: 'prompt' }));
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      streamRef.current = stream;

      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setState((prev) => {
            if (prev.probe?.first_partial_at) return prev;
            if (!prev.probe) return prev;
            return {
              ...prev,
              probe: {
                ...prev.probe,
                first_partial_at: new Date().toISOString(),
              },
            };
          });
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setState(prev => ({ 
          ...prev, 
          audioBlob: blob,
          isRecording: false,
          isPaused: false,
        }));

        // Stop and cleanup stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms

      // Start duration timer
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);

      setState(prev => ({ 
        ...prev, 
        isRecording: true, 
        isPaused: false,
        duration: 0,
        error: null,
        audioBlob: null,
        permissionState: 'granted',
        probe: {
          platform: 'web',
          source: 'dash_chat_web',
          stt_start_at: new Date().toISOString(),
          ...(String(process.env.NEXT_PUBLIC_VOICE_BENCHMARK_RUN_ID || '').trim()
            ? { run_id: String(process.env.NEXT_PUBLIC_VOICE_BENCHMARK_RUN_ID || '').trim() }
            : {}),
        },
      }));
      return true;

    } catch (error: any) {
      console.error('Error starting recording:', error);
      const errorMessage = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? 'Microphone permission denied. Please allow access in your browser.'
        : error.name === 'NotFoundError'
        ? 'No microphone found. Please connect a microphone.'
        : error.message || 'Failed to access microphone';
      
      setState(prev => ({ 
        ...prev, 
        error: errorMessage,
        isRecording: false,
        permissionState: error.name === 'NotAllowedError' ? 'denied' : 'unknown',
        probe: null,
      }));
      return false;
    }
  }, [isSupported]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      
      // Wait for the blob to be ready
      return new Promise((resolve) => {
        const checkBlob = setInterval(() => {
          if (state.audioBlob || !state.isRecording) {
            clearInterval(checkBlob);
            resolve(state.audioBlob);
          }
        }, 100);
      });
    }
    return null;
  }, [state.isRecording, state.audioBlob]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setState(prev => ({ ...prev, isPaused: true }));
    }
  }, [state.isRecording, state.isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && state.isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, [state.isRecording, state.isPaused]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      
      // Stop and cleanup stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      chunksRef.current = [];
      setState({
        isRecording: false,
        isPaused: false,
        duration: 0,
        audioBlob: null,
        error: null,
        permissionState: 'unknown',
        probe: null,
      });
    }
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    isSupported,
    permissionState: state.permissionState,
  };
}

// Helper: Convert Blob to base64
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix (e.g., "data:audio/webm;base64,")
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper: Format duration (seconds -> MM:SS)
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
