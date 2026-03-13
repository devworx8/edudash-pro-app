/**
 * Instant TTS Service
 * 
 * Provides instant, ChatGPT-like TTS response times through:
 * - Pre-buffering first audio chunk while text is being generated
 * - Streaming audio playback for reduced latency
 * - Intelligent chunking for natural speech flow
 */

import { assertSupabase } from '../supabase';

interface TTSChunk {
  id: string;
  text: string;
  audioUrl?: string;
  status: 'pending' | 'loading' | 'ready' | 'playing' | 'completed';
}

interface InstantTTSOptions {
  language?: string;
  onStart?: () => void;
  onChunkReady?: (chunkId: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

const EDGE_FUNCTION_URL = process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/tts-proxy';

const MIN_CHUNK_LENGTH = 30;
const IDEAL_CHUNK_SIZE = 250;
const MAX_CHUNK_SIZE = 400;

/**
 * Split text into speech-friendly chunks aligned with sentence boundaries.
 * Larger chunks reduce Azure round-trips; pre-fetch overlap keeps speech fluent.
 */
export function splitIntoSpeechChunks(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= IDEAL_CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }

    const window = remaining.slice(0, MAX_CHUNK_SIZE);
    const sentenceMatches = [...window.matchAll(/[.!?]+\s*/g)];
    if (sentenceMatches.length > 0) {
      let bestIdx = -1;
      for (const m of sentenceMatches) {
        const endPos = (m.index ?? 0) + m[0].length;
        if (endPos >= MIN_CHUNK_LENGTH && endPos <= MAX_CHUNK_SIZE) {
          bestIdx = endPos;
        }
      }
      if (bestIdx > MIN_CHUNK_LENGTH) {
        chunks.push(remaining.slice(0, bestIdx).trim());
        remaining = remaining.slice(bestIdx).trim();
        continue;
      }
    }

    const clauseMatches = [...window.matchAll(/[,;:]\s+/g)];
    if (clauseMatches.length > 0) {
      let bestIdx = -1;
      for (const m of clauseMatches) {
        const endPos = (m.index ?? 0) + m[0].length;
        if (endPos >= MIN_CHUNK_LENGTH && endPos <= MAX_CHUNK_SIZE) {
          bestIdx = endPos;
        }
      }
      if (bestIdx > MIN_CHUNK_LENGTH) {
        chunks.push(remaining.slice(0, bestIdx).trim());
        remaining = remaining.slice(bestIdx).trim();
        continue;
      }
    }

    const wordBoundary = remaining.slice(0, IDEAL_CHUNK_SIZE).lastIndexOf(' ');
    if (wordBoundary > MIN_CHUNK_LENGTH) {
      chunks.push(remaining.slice(0, wordBoundary).trim());
      remaining = remaining.slice(wordBoundary + 1).trim();
    } else {
      chunks.push(remaining.slice(0, MAX_CHUNK_SIZE).trim());
      remaining = remaining.slice(MAX_CHUNK_SIZE).trim();
    }
  }

  return chunks.filter(c => c.trim().length > 0);
}

/**
 * Pre-synthesize a chunk for instant playback
 */
async function preSynthesizeChunk(
  text: string,
  language: string,
  accessToken: string
): Promise<string> {
  const shortLang = (language.split('-')[0] as 'en' | 'af' | 'zu') ?? 'en';
  
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: 'synthesize',
      text,
      language: shortLang,
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS synthesis failed: ${response.status}`);
  }

  const data = await response.json();
  return data.audio_url || data.audioUrl;
}

/**
 * Instant TTS Player Class
 * Manages pre-buffering and sequential playback
 */
export class InstantTTSPlayer {
  private chunks: TTSChunk[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private isPlaying = false;
  private isStopped = false;
  private language: string;
  private accessToken: string;
  private onStart?: () => void;
  private onChunkReady?: (chunkId: string) => void;
  private onComplete?: () => void;
  private onError?: (error: Error) => void;
  private preBufferQueue: Promise<void>[] = [];

  constructor(accessToken: string, options: InstantTTSOptions = {}) {
    this.accessToken = accessToken;
    this.language = options.language || 'en-ZA';
    this.onStart = options.onStart;
    this.onChunkReady = options.onChunkReady;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  /**
   * Add text to the TTS queue
   * Starts pre-buffering immediately
   */
  async addText(text: string): Promise<void> {
    if (this.isStopped) return;

    const textChunks = splitIntoSpeechChunks(text);
    
    for (const chunkText of textChunks) {
      const chunk: TTSChunk = {
        id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: chunkText,
        status: 'pending',
      };
      this.chunks.push(chunk);

      // Start pre-buffering this chunk
      this.preBufferQueue.push(this.preBufferChunk(chunk));
    }

    // Start playback if not already playing
    if (!this.isPlaying && this.chunks.length > 0) {
      this.playNext();
    }
  }

  /**
   * Pre-buffer a single chunk
   */
  private async preBufferChunk(chunk: TTSChunk): Promise<void> {
    if (this.isStopped) return;

    chunk.status = 'loading';
    try {
      const audioUrl = await preSynthesizeChunk(chunk.text, this.language, this.accessToken);
      chunk.audioUrl = audioUrl;
      chunk.status = 'ready';
      this.onChunkReady?.(chunk.id);
    } catch (error) {
      chunk.status = 'pending';
      this.onError?.(error instanceof Error ? error : new Error('Pre-buffer failed'));
    }
  }

  /**
   * Play the next chunk in queue
   */
  private async playNext(): Promise<void> {
    if (this.isStopped) return;

    // Find the next ready chunk
    const nextChunk = this.chunks.find(c => c.status === 'ready');
    
    if (!nextChunk) {
      // Wait for a chunk to be ready
      if (this.preBufferQueue.length > 0) {
        await Promise.race([
          Promise.any(this.preBufferQueue),
          new Promise(resolve => setTimeout(resolve, 100)),
        ]);
        return this.playNext();
      }
      
      // No more chunks
      this.isPlaying = false;
      this.onComplete?.();
      return;
    }

    this.isPlaying = true;
    this.onStart?.();
    nextChunk.status = 'playing';

    try {
      await this.playAudio(nextChunk.audioUrl!);
      nextChunk.status = 'completed';
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error('Playback failed'));
    }

    // Play next chunk
    if (!this.isStopped) {
      this.playNext();
    }
  }

  /**
   * Play audio from URL
   */
  private async playAudio(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        resolve();
        return;
      }

      const audio = new Audio(url);
      this.currentAudio = audio;

      audio.onended = () => {
        this.currentAudio = null;
        resolve();
      };

      audio.onerror = () => {
        this.currentAudio = null;
        reject(new Error('Audio playback error'));
      };

      audio.play().catch(reject);
    });
  }

  /**
   * Stop playback and clear queue
   */
  stop(): void {
    this.isStopped = true;
    this.isPlaying = false;
    
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    this.chunks = [];
    this.preBufferQueue = [];
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

/**
 * Hook for instant TTS in React components
 */
export function useInstantTTS() {
  const playerRef = useRef<InstantTTSPlayer | null>(null);

  const startInstantTTS = useCallback(async (text: string, options?: InstantTTSOptions) => {
    // Stop any existing playback
    playerRef.current?.stop();

    const supabase = assertSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('Authentication required for TTS');
    }

    playerRef.current = new InstantTTSPlayer(session.access_token, options);
    await playerRef.current.addText(text);
  }, []);

  const stopTTS = useCallback(() => {
    playerRef.current?.stop();
    playerRef.current = null;
  }, []);

  return { startInstantTTS, stopTTS };
}

// Need to import useRef and useCallback for the hook
import { useRef, useCallback } from 'react';