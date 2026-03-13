/**
 * Instant TTS Service
 *
 * Provides fluent, pause-free TTS through a prefetch pipeline:
 * 1. Text is split into sentence-boundary-aware chunks
 * 2. Multiple chunks are synthesized in parallel (prefetch depth = 2)
 * 3. Playback of chunk N overlaps with synthesis of chunk N+1 and N+2
 * 4. No gap between chunks — the next audio starts immediately
 *
 * Used by web TTS paths and as a shared chunking utility.
 */

import { useRef, useCallback } from 'react';
import { assertSupabase } from '../supabase';

interface TTSChunk {
  id: string;
  text: string;
  audioUrl?: string;
  status: 'pending' | 'loading' | 'ready' | 'playing' | 'completed' | 'failed';
}

interface InstantTTSOptions {
  language?: string;
  onStart?: () => void;
  onChunkReady?: (chunkId: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

const EDGE_FUNCTION_URL = process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/tts-proxy';

const MIN_CHUNK_LENGTH = 20;
const FIRST_CHUNK_SIZE = 120;
const FOLLOW_UP_CHUNK_SIZE = 300;
const PREFETCH_DEPTH = 2;
const SYNTHESIS_TIMEOUT_MS = 10000;

/**
 * Split text into natural speech chunks optimized for prefetch pipeline.
 * First chunk is small for fast time-to-first-audio; subsequent chunks are larger.
 */
export function splitIntoSpeechChunks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= FIRST_CHUNK_SIZE) return [trimmed];

  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [trimmed];

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const isFirstChunk = chunks.length === 0;
    const maxSize = isFirstChunk ? FIRST_CHUNK_SIZE : FOLLOW_UP_CHUNK_SIZE;
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length <= maxSize) {
      current = candidate;
      continue;
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    if (sentence.length <= FOLLOW_UP_CHUNK_SIZE) {
      current = sentence;
      continue;
    }

    // Long sentence — split by phrase or word boundaries
    const words = sentence.split(' ');
    current = '';
    for (const word of words) {
      const wordCandidate = current ? `${current} ${word}` : word;
      if (wordCandidate.length <= FOLLOW_UP_CHUNK_SIZE) {
        current = wordCandidate;
      } else {
        if (current.trim()) chunks.push(current.trim());
        current = word;
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  if (chunks.length === 0) return trimmed.length > 0 ? [trimmed] : [];

  // Merge any trailing short chunk into the previous one instead of dropping it
  if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN_CHUNK_LENGTH) {
    const short = chunks.pop()!;
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${short}`;
  }

  return chunks;
}

async function preSynthesizeChunk(
  text: string,
  language: string,
  accessToken: string,
): Promise<string> {
  const shortLang = (language.split('-')[0] as 'en' | 'af' | 'zu') ?? 'en';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SYNTHESIS_TIMEOUT_MS);

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: 'synthesize',
        text,
        language: shortLang,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TTS synthesis failed: ${response.status}`);
    }

    const data = await response.json();
    return data.audio_url || data.audioUrl;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Instant TTS Player — manages a prefetch pipeline for seamless audio playback.
 * Synthesizes chunks ahead of playback so there's zero gap between segments.
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
  private synthesisPromises = new Map<string, Promise<void>>();

  constructor(accessToken: string, options: InstantTTSOptions = {}) {
    this.accessToken = accessToken;
    this.language = options.language || 'en-ZA';
    this.onStart = options.onStart;
    this.onChunkReady = options.onChunkReady;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  async addText(text: string): Promise<void> {
    if (this.isStopped) return;

    const textChunks = splitIntoSpeechChunks(text);
    for (const chunkText of textChunks) {
      this.chunks.push({
        id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: chunkText,
        status: 'pending',
      });
    }

    // Kick off prefetch for the first N chunks
    for (let i = 0; i < Math.min(PREFETCH_DEPTH, this.chunks.length); i++) {
      this.startSynthesis(this.chunks[i]);
    }

    if (!this.isPlaying && this.chunks.length > 0) {
      await this.playSequence();
    }
  }

  private startSynthesis(chunk: TTSChunk): void {
    if (this.isStopped || chunk.status !== 'pending') return;
    chunk.status = 'loading';

    const promise = preSynthesizeChunk(chunk.text, this.language, this.accessToken)
      .then((audioUrl) => {
        chunk.audioUrl = audioUrl;
        chunk.status = 'ready';
        this.onChunkReady?.(chunk.id);
      })
      .catch((error) => {
        chunk.status = 'failed';
        this.onError?.(error instanceof Error ? error : new Error('Synthesis failed'));
      });

    this.synthesisPromises.set(chunk.id, promise);
  }

  private async playSequence(): Promise<void> {
    this.isPlaying = true;
    this.onStart?.();

    for (let i = 0; i < this.chunks.length; i++) {
      if (this.isStopped) break;

      const chunk = this.chunks[i];

      // Wait for this chunk's synthesis to complete
      const synthesisPromise = this.synthesisPromises.get(chunk.id);
      if (synthesisPromise) await synthesisPromise;

      if (this.isStopped) break;

      // Prefetch the next chunk before playing this one
      const nextPrefetchIdx = i + PREFETCH_DEPTH;
      if (nextPrefetchIdx < this.chunks.length) {
        this.startSynthesis(this.chunks[nextPrefetchIdx]);
      }

      if (chunk.status === 'ready' && chunk.audioUrl) {
        chunk.status = 'playing';
        try {
          await this.playAudio(chunk.audioUrl);
          chunk.status = 'completed';
        } catch (error) {
          chunk.status = 'failed';
          this.onError?.(error instanceof Error ? error : new Error('Playback failed'));
        }
      }
    }

    this.isPlaying = false;
    if (!this.isStopped) this.onComplete?.();
  }

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

  stop(): void {
    this.isStopped = true;
    this.isPlaying = false;

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    this.chunks = [];
    this.synthesisPromises.clear();
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export function useInstantTTS() {
  const playerRef = useRef<InstantTTSPlayer | null>(null);

  const startInstantTTS = useCallback(async (text: string, options?: InstantTTSOptions) => {
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
