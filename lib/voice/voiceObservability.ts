/**
 * Voice Observability — structured logging, timing, and error classification
 * for STT / TTS / AI-streaming paths.
 *
 * Usage:
 *   import { voiceTimer, classifyVoiceError, voiceLog } from '@/lib/voice/voiceObservability';
 *
 *   const timer = voiceTimer('stt');
 *   try {
 *     const result = await transcribe(audio);
 *     timer.success({ chars: result.length });
 *   } catch (e) {
 *     timer.fail(e);
 *   }
 *
 * Privacy: Never logs audio blobs, base64 data, or file URIs.
 * Production: Errors always go to Sentry via lib/logger; timing only in __DEV__.
 */

import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type VoiceErrorCategory =
  | 'network'        // Fetch / WebSocket failure, DNS, timeout
  | 'permission'     // Mic / audio permission denied
  | 'quota'          // AI usage limit reached
  | 'auth'           // Not authenticated / session expired
  | 'provider'       // STT/TTS provider unavailable or crashed
  | 'format'         // Unsupported audio format, encoding error
  | 'timeout'        // Operation exceeded time budget
  | 'cancelled'      // User or system cancelled the operation
  | 'unknown';

export interface ClassifiedError {
  category: VoiceErrorCategory;
  message: string;
  retryable: boolean;
}

/**
 * Classify an error from any voice path into a structured category.
 * Safe to call with any unknown error shape.
 */
export function classifyVoiceError(error: unknown): ClassifiedError {
  const msg = extractMessage(error);
  const lower = msg.toLowerCase();

  if (lower.includes('cancel') || lower.includes('abort')) {
    return { category: 'cancelled', message: msg, retryable: false };
  }
  if (lower.includes('permission') || lower.includes('denied') || lower.includes('not granted')) {
    return { category: 'permission', message: msg, retryable: false };
  }
  if (lower.includes('quota') || lower.includes('usage limit') || lower.includes('429')) {
    return { category: 'quota', message: msg, retryable: false };
  }
  if (lower.includes('not authenticated') || lower.includes('401') || lower.includes('session expired')) {
    return { category: 'auth', message: msg, retryable: true };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline')) {
    return { category: 'timeout', message: msg, retryable: true };
  }
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('dns') ||
    lower.includes('econnrefused') ||
    lower.includes('503') ||
    lower.includes('502')
  ) {
    return { category: 'network', message: msg, retryable: true };
  }
  if (lower.includes('format') || lower.includes('mime') || lower.includes('encoding') || lower.includes('unsupported')) {
    return { category: 'format', message: msg, retryable: false };
  }
  if (lower.includes('provider') || lower.includes('unavailable') || lower.includes('not available')) {
    return { category: 'provider', message: msg, retryable: true };
  }

  return { category: 'unknown', message: msg, retryable: false };
}

// ---------------------------------------------------------------------------
// Structured timer
// ---------------------------------------------------------------------------

export type VoicePath = 'stt' | 'tts' | 'ai_stream' | 'recording' | 'hybrid_cloud';

interface TimerResult {
  path: VoicePath;
  durationMs: number;
  success: boolean;
  error?: ClassifiedError;
  meta?: Record<string, unknown>;
}

export interface VoiceTimer {
  /** Mark the operation as successful. Optional metadata (keep privacy-safe). */
  success(meta?: Record<string, unknown>): TimerResult;
  /** Mark the operation as failed. Logs the error. */
  fail(error: unknown, meta?: Record<string, unknown>): TimerResult;
  /** Elapsed time since timer creation (ms). */
  elapsed(): number;
}

const TAG = 'VoiceObs';

/**
 * Start a timer for a voice operation path.
 *
 * ```ts
 * const t = voiceTimer('stt');
 * // ... do work ...
 * t.success({ chars: 42 });
 * ```
 */
export function voiceTimer(path: VoicePath): VoiceTimer {
  const start = Date.now();

  return {
    elapsed() {
      return Date.now() - start;
    },

    success(meta) {
      const durationMs = Date.now() - start;
      const result: TimerResult = { path, durationMs, success: true, meta };
      logger.debug(TAG, `${path} OK`, `${durationMs}ms`, meta ?? '');
      return result;
    },

    fail(error, meta) {
      const durationMs = Date.now() - start;
      const classified = classifyVoiceError(error);
      const result: TimerResult = { path, durationMs, success: false, error: classified, meta };

      // Always log voice errors (production Sentry + dev console)
      logger.error(TAG, `${path} FAIL [${classified.category}]`, classified.message, `${durationMs}ms`);

      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// Scoped logger (convenience wrapper around lib/logger)
// ---------------------------------------------------------------------------

/**
 * Log a voice-scoped message. Avoids raw console.log in voice code.
 * In production: only errors reach Sentry. Debug/info are __DEV__ only.
 */
export const voiceLog = {
  debug: (msg: string, ...args: unknown[]) => logger.debug(TAG, msg, ...args),
  info: (msg: string, ...args: unknown[]) => logger.info(TAG, msg, ...args),
  warn: (msg: string, ...args: unknown[]) => logger.warn(TAG, msg, ...args),
  error: (msg: string, ...args: unknown[]) => logger.error(TAG, msg, ...args),
};

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
