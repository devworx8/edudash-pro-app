/**
 * Streaming TTS Types
 */

export interface TTSOptions {
  language?: string;
  phonicsMode?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface StreamingTTSState {
  isSpeaking: boolean;
  currentText: string;
  queueLength: number;
  latency: number;
}

export interface SpeechChunk {
  id: string;
  text: string;
  priority: number;
}

export interface TTSMetrics {
  startTime: number;
  totalLatency: number;
}
