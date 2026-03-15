/**
 * TTS Latency Optimization - Instant Response Like ChatGPT
 *
 * Implements techniques to minimize TTS latency:
 * - Pre-buffering audio chunks
 * - Streaming synthesis
 * - Predictive caching
 * - Sentence-level chunking for immediate playback
 */

import { Platform } from 'react-native';

// =============================================================================
// Configuration
// =============================================================================

export const TTS_CONFIG = {
  // Chunk settings for streaming
  MIN_CHUNK_SIZE: 20, // Minimum characters before synthesis
  MAX_CHUNK_SIZE: 150, // Maximum characters per chunk
  SENTENCE_END_PATTERNS: /[.!?。！？]\s*/,

  // Pre-buffer settings
  PRE_BUFFER_MS: 100, // Start synthesis early for smooth playback
  MAX_QUEUE_SIZE: 5, // Maximum chunks to pre-buffer

  // Latency targets
  TARGET_FIRST_BYTE_MS: 200, // Target time to first audio byte
  TARGET_INTER_CHUNK_MS: 50, // Target gap between chunks
};

// =============================================================================
// Sentence Chunker - Split text for immediate TTS
// =============================================================================

interface TextChunk {
  id: string;
  text: string;
  isComplete: boolean; // Is this a complete sentence?
  priority: number; // Higher = play sooner
}

export class SentenceChunker {
  private buffer: string = '';
  private chunks: TextChunk[] = [];
  private chunkId: number = 0;

  /**
   * Add text to the buffer and extract complete sentences
   */
  addText(text: string): TextChunk[] {
    this.buffer += text;
    const newChunks: TextChunk[] = [];

    // Try to find sentence boundaries
    const sentences = this.extractSentences();

    for (const sentence of sentences) {
      if (sentence.length >= TTS_CONFIG.MIN_CHUNK_SIZE) {
        const chunk: TextChunk = {
          id: `chunk-${this.chunkId++}`,
          text: sentence,
          isComplete: true,
          priority: this.chunks.length,
        };
        this.chunks.push(chunk);
        newChunks.push(chunk);
      }
    }

    return newChunks;
  }

  /**
   * Flush remaining buffer as final chunk
   */
  flush(): TextChunk | null {
    const remaining = this.buffer.trim();
    if (remaining.length === 0) return null;

    const chunk: TextChunk = {
      id: `chunk-${this.chunkId++}`,
      text: remaining,
      isComplete: true,
      priority: this.chunks.length,
    };
    this.chunks.push(chunk);
    this.buffer = '';
    return chunk;
  }

  /**
   * Get current partial buffer (for live preview)
   */
  getPartial(): string {
    return this.buffer;
  }

  /**
   * Clear all state
   */
  reset(): void {
    this.buffer = '';
    this.chunks = [];
    this.chunkId = 0;
  }

  private extractSentences(): string[] {
    const sentences: string[] = [];
    let match;

    while ((match = TTS_CONFIG.SENTENCE_END_PATTERNS.exec(this.buffer)) !== null) {
      const endIndex = match.index + match[0].length;
      const sentence = this.buffer.substring(0, endIndex).trim();

      if (sentence.length > 0) {
        sentences.push(sentence);
        this.buffer = this.buffer.substring(endIndex);
      }
    }

    return sentences;
  }
}

// =============================================================================
// Audio Pre-Buffer - Cache synthesized audio for instant playback
// =============================================================================

interface CachedAudio {
  chunkId: string;
  audioUrl: string;
  duration: number;
  timestamp: number;
}

export class AudioPreBuffer {
  private cache: Map<string, CachedAudio> = new Map();
  private queue: string[] = [];
  private maxSize: number = TTS_CONFIG.MAX_QUEUE_SIZE;

  /**
   * Add audio to the pre-buffer
   */
  add(chunkId: string, audioUrl: string, duration: number): void {
    // Remove oldest if at capacity
    if (this.queue.length >= this.maxSize) {
      const oldest = this.queue.shift();
      if (oldest) {
        const cached = this.cache.get(oldest);
        if (cached) {
          URL.revokeObjectURL?.(cached.audioUrl);
          this.cache.delete(oldest);
        }
      }
    }

    this.cache.set(chunkId, {
      chunkId,
      audioUrl,
      duration,
      timestamp: Date.now(),
    });
    this.queue.push(chunkId);
  }

  /**
   * Get audio from buffer
   */
  get(chunkId: string): CachedAudio | undefined {
    return this.cache.get(chunkId);
  }

  /**
   * Check if chunk is ready
   */
  isReady(chunkId: string): boolean {
    return this.cache.has(chunkId);
  }

  /**
   * Get next chunk in queue
   */
  getNext(): CachedAudio | undefined {
    const nextId = this.queue[0];
    return nextId ? this.cache.get(nextId) : undefined;
  }

  /**
   * Remove chunk from buffer after playback
   */
  consume(chunkId: string): CachedAudio | undefined {
    const cached = this.cache.get(chunkId);
    if (cached) {
      this.cache.delete(chunkId);
      this.queue = this.queue.filter((id) => id !== chunkId);
    }
    return cached;
  }

  /**
   * Clear all cached audio
   */
  clear(): void {
    for (const cached of this.cache.values()) {
      try {
        URL.revokeObjectURL?.(cached.audioUrl);
      } catch {}
    }
    this.cache.clear();
    this.queue = [];
  }
}

// =============================================================================
// Predictive Synthesizer - Start synthesis before text is complete
// =============================================================================

export class PredictiveSynthesizer {
  private chunker: SentenceChunker;
  private preBuffer: AudioPreBuffer;
  private synthesizeFn: (text: string) => Promise<{ audioUrl: string; duration: number }>;
  private isProcessing: boolean = false;
  private pendingSynthesis: Set<string> = new Set();

  constructor(synthesizeFn: (text: string) => Promise<{ audioUrl: string; duration: number }>) {
    this.chunker = new SentenceChunker();
    this.preBuffer = new AudioPreBuffer();
    this.synthesizeFn = synthesizeFn;
  }

  /**
   * Add streaming text and trigger synthesis
   */
  async addText(text: string): Promise<TextChunk[]> {
    const chunks = this.chunker.addText(text);

    // Start synthesis for each new chunk
    for (const chunk of chunks) {
      if (!this.pendingSynthesis.has(chunk.id)) {
        this.pendingSynthesis.add(chunk.id);
        this.synthesizeChunk(chunk);
      }
    }

    return chunks;
  }

  /**
   * Flush remaining text and wait for synthesis
   */
  async flushAndSynthesize(): Promise<TextChunk | null> {
    const chunk = this.chunker.flush();
    if (chunk) {
      await this.synthesizeChunk(chunk);
    }
    return chunk;
  }

  /**
   * Get synthesized audio for a chunk
   */
  getAudio(chunkId: string): CachedAudio | undefined {
    return this.preBuffer.get(chunkId);
  }

  /**
   * Check if audio is ready
   */
  isAudioReady(chunkId: string): boolean {
    return this.preBuffer.isReady(chunkId);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.chunker.reset();
    this.preBuffer.clear();
    this.pendingSynthesis.clear();
    this.isProcessing = false;
  }

  private async synthesizeChunk(chunk: TextChunk): Promise<void> {
    try {
      const result = await this.synthesizeFn(chunk.text);
      this.preBuffer.add(chunk.id, result.audioUrl, result.duration);
    } catch (error) {
      console.error('[PredictiveSynthesizer] Synthesis failed:', error);
    } finally {
      this.pendingSynthesis.delete(chunk.id);
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Clean text for TTS - remove markdown, code blocks, etc.
 */
export function cleanTextForTTS(text: string): string {
  let cleaned = text;

  // Remove code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`]+`/g, '');

  // Remove markdown formatting
  cleaned = cleaned.replace(/[*_~#`]/g, '');

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Split long text into TTS-friendly chunks
 */
export function splitIntoTTSChunks(
  text: string,
  maxSize: number = TTS_CONFIG.MAX_CHUNK_SIZE,
): string[] {
  const chunks: string[] = [];
  const sentences = text.split(TTS_CONFIG.SENTENCE_END_PATTERNS);

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length + 1 <= maxSize) {
      currentChunk += (currentChunk ? ' ' : '') + trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = trimmed;
    }
  }

  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}

/**
 * Measure TTS latency
 */
export async function measureTTSLatency(
  synthesizeFn: () => Promise<string>,
): Promise<{ timeToFirstByte: number; totalTime: number }> {
  const startTime = Date.now();

  const audioUrl = await synthesizeFn();

  const totalTime = Date.now() - startTime;

  return {
    timeToFirstByte: totalTime, // Simplified - actual TTFB would need stream support
    totalTime,
  };
}
