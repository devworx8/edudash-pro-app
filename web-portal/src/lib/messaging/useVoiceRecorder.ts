import { useCallback, useRef, useState } from 'react';

// Minimum recording duration in milliseconds (1 second)
const MIN_RECORDING_DURATION_MS = 1000;
// Maximum recording duration in milliseconds (5 minutes)
const MAX_RECORDING_DURATION_MS = 5 * 60 * 1000;

interface UseVoiceRecorderOptions {
  onRecordingComplete: (blob: Blob, durationMs: number) => Promise<void> | void;
}

/**
 * Check if the browser supports the MediaRecorder API and microphone access
 */
const checkMediaRecorderSupport = (): { supported: boolean; errorMessage?: string } => {
  if (typeof window === 'undefined') {
    return { supported: false, errorMessage: 'Voice recording is not available in this environment.' };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return { supported: false, errorMessage: 'Your browser does not support microphone access. Please try a modern browser like Chrome, Firefox, or Safari.' };
  }

  if (typeof MediaRecorder === 'undefined') {
    return { supported: false, errorMessage: 'Voice recording is not supported in your browser. Please try Chrome, Firefox, or Safari.' };
  }

  return { supported: true };
};

/**
 * Get a user-friendly error message from a microphone permission error
 */
const getMicrophoneErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Microphone access was denied. Please allow microphone access in your browser settings and try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone found. Please connect a microphone and try again.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Your microphone is busy or unavailable. Please close other apps using the microphone and try again.';
      case 'OverconstrainedError':
        return 'Could not access microphone with requested settings. Please try again.';
      case 'SecurityError':
        return 'Microphone access is blocked for security reasons. Please ensure this site uses HTTPS.';
      case 'AbortError':
        return 'Microphone access was interrupted. Please try again.';
      default:
        return `Microphone error: ${error.message || error.name}`;
    }
  }

  if (error instanceof Error) {
    return error.message || 'Unable to access microphone. Please check your browser permissions.';
  }

  return 'Unable to access microphone. Please check your browser permissions and try again.';
};

export const useVoiceRecorder = ({ onRecordingComplete }: UseVoiceRecorderOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupRecording = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    setRecordingDuration(0);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanupRecording();
  }, [cleanupRecording]);

  // Cancel recording without sending
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      // Stop all tracks to release microphone
      const stream = mediaRecorderRef.current.stream;
      stream?.getTracks().forEach(track => track.stop());
      
      // Prevent onstop handler from processing the recording
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    chunksRef.current = [];
    cleanupRecording();
    setIsRecording(false);
  }, [cleanupRecording]);

  const toggleRecording = useCallback(async () => {
    // If currently recording, stop
    if (isRecording) {
      stopRecording();
      return;
    }

    // Check browser support
    const support = checkMediaRecorderSupport();
    if (!support.supported) {
      setRecorderError(support.errorMessage || 'Voice recording is not supported.');
      return;
    }

    // Clear any previous errors
    setRecorderError(null);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Determine the best supported MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
      ];
      
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = {};
      if (selectedMimeType) {
        recorderOptions.mimeType = selectedMimeType;
      }

      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      // Update recording duration every 100ms
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setRecordingDuration(Date.now() - startTimeRef.current);
        }
      }, 100);

      // Auto-stop after max duration
      maxDurationTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          setRecorderError('Recording reached maximum duration (5 minutes).');
          stopRecording();
        }
      }, MAX_RECORDING_DURATION_MS);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        console.error('Voice recorder error');
        setRecorderError('Recording failed. Please try again.');
        stopRecording();
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.onstop = async () => {
        cleanupRecording();
        setIsRecording(false);
        
        const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
        
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Validate minimum duration
        if (durationMs < MIN_RECORDING_DURATION_MS) {
          setRecorderError('Recording too short. Please hold for at least 1 second.');
          return;
        }

        // Validate we have data
        if (chunksRef.current.length === 0) {
          setRecorderError('No audio was recorded. Please try again.');
          return;
        }

        // Create blob with proper MIME type
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });

        // Validate blob size
        if (blob.size === 0) {
          setRecorderError('Recording failed - no audio data. Please try again.');
          return;
        }

        try {
          await onRecordingComplete(blob, durationMs);
        } catch (err) {
          console.error('Failed to handle recorded audio', err);
          setRecorderError('Failed to send voice note. Please try again.');
        }
      };

      recorder.start(1000); // Collect data every second for better reliability
      setRecorderError(null);
      setIsRecording(true);
    } catch (error: unknown) {
      console.error('Unable to access microphone', error);
      setRecorderError(getMicrophoneErrorMessage(error));
      setIsRecording(false);
      cleanupRecording();
    }
  }, [isRecording, onRecordingComplete, stopRecording, cleanupRecording]);

  return {
    isRecording,
    toggleRecording,
    cancelRecording,
    recorderError,
    recordingDuration,
  };
};
