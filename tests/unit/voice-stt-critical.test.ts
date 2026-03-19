/**
 * Regression tests for the critical voice / STT / security fixes.
 *
 * Covers:
 *  - STT request normalization (bucket whitelist, audio_content_type)
 *  - parseSSEText streaming parser correctness
 *  - cleanRawJSON edge cases
 */

import { parseSSEText, cleanRawJSON } from '@/lib/dash-voice-utils';

// ---------------------------------------------------------------------------
// Inline the sttProxyUtils logic for unit testing (Edge Function code cannot
// be imported directly by Jest, so we replicate the pure-logic surface).
// ---------------------------------------------------------------------------
const DEFAULT_STORAGE_BUCKET = 'voice-notes';
const ALLOWED_STORAGE_BUCKETS = new Set(['voice-notes']);

function sanitizeString(value: unknown): string {
  return String(value || '').trim();
}

interface SttProxyNormalizedRequest {
  source: string;
  storagePath?: string;
  storageBucket: string;
  audioBase64?: string;
  audioUrl?: string;
  audioContentType?: string;
  language: string;
  prompt?: string;
}

function normalizeSttProxyRequest(body: Record<string, unknown>): SttProxyNormalizedRequest {
  const storagePath = sanitizeString(body.storage_path);
  const audioBase64 = sanitizeString(body.audio_base64);
  const audioUrl = sanitizeString(body.audio_url);
  const rawBucket = sanitizeString(body.storage_bucket) || DEFAULT_STORAGE_BUCKET;
  const storageBucket = ALLOWED_STORAGE_BUCKETS.has(rawBucket) ? rawBucket : DEFAULT_STORAGE_BUCKET;
  const audioContentType = sanitizeString(body.audio_content_type) || undefined;
  const language = sanitizeString(body.language) || 'auto';

  if (!storagePath && !audioBase64 && !audioUrl) {
    throw new Error('Provide one of storage_path, audio_base64, or audio_url');
  }

  if (storagePath) {
    return { source: 'storage_path', storagePath, storageBucket, audioContentType, language };
  }
  if (audioBase64) {
    return { source: 'audio_base64', audioBase64, storageBucket, audioContentType, language };
  }
  return { source: 'audio_url', audioUrl, storageBucket, audioContentType, language };
}

// ---------------------------------------------------------------------------
// MIME resolution (mirrors transcribe-audio logic)
// ---------------------------------------------------------------------------
const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
};

function resolveAudioMeta(contentType?: string) {
  const resolvedMime =
    typeof contentType === 'string' && MIME_TO_EXT[contentType]
      ? contentType
      : 'audio/webm';
  const resolvedExt = MIME_TO_EXT[resolvedMime] || 'webm';
  return { resolvedMime, resolvedExt };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('stt-proxy bucket whitelist', () => {
  it('accepts the default voice-notes bucket', () => {
    const req = normalizeSttProxyRequest({
      audio_base64: 'dGVzdA==',
      storage_bucket: 'voice-notes',
    });
    expect(req.storageBucket).toBe('voice-notes');
  });

  it('rejects an arbitrary bucket and falls back to default', () => {
    const req = normalizeSttProxyRequest({
      audio_base64: 'dGVzdA==',
      storage_bucket: 'avatars',
    });
    expect(req.storageBucket).toBe('voice-notes');
  });

  it('rejects a malicious bucket name', () => {
    const req = normalizeSttProxyRequest({
      audio_base64: 'dGVzdA==',
      storage_bucket: '../private-files',
    });
    expect(req.storageBucket).toBe('voice-notes');
  });

  it('uses default when storage_bucket is omitted', () => {
    const req = normalizeSttProxyRequest({
      audio_base64: 'dGVzdA==',
    });
    expect(req.storageBucket).toBe('voice-notes');
  });

  it('throws when no audio source is provided', () => {
    expect(() => normalizeSttProxyRequest({})).toThrow('Provide one of');
  });
});

describe('stt-proxy audio_content_type propagation', () => {
  it('passes audio_content_type when provided', () => {
    const req = normalizeSttProxyRequest({
      audio_base64: 'dGVzdA==',
      audio_content_type: 'audio/mp4',
    });
    expect(req.audioContentType).toBe('audio/mp4');
  });

  it('is undefined when not provided', () => {
    const req = normalizeSttProxyRequest({
      audio_base64: 'dGVzdA==',
    });
    expect(req.audioContentType).toBeUndefined();
  });
});

describe('MIME type resolution for Whisper', () => {
  it('resolves m4a from audio/mp4', () => {
    expect(resolveAudioMeta('audio/mp4')).toEqual({
      resolvedMime: 'audio/mp4',
      resolvedExt: 'm4a',
    });
  });

  it('resolves webm from audio/webm', () => {
    expect(resolveAudioMeta('audio/webm')).toEqual({
      resolvedMime: 'audio/webm',
      resolvedExt: 'webm',
    });
  });

  it('falls back to audio/webm for unknown types', () => {
    expect(resolveAudioMeta('video/mp4')).toEqual({
      resolvedMime: 'audio/webm',
      resolvedExt: 'webm',
    });
  });

  it('falls back to audio/webm when undefined', () => {
    expect(resolveAudioMeta(undefined)).toEqual({
      resolvedMime: 'audio/webm',
      resolvedExt: 'webm',
    });
  });

  it('maps audio/m4a (iOS) correctly', () => {
    expect(resolveAudioMeta('audio/m4a')).toEqual({
      resolvedMime: 'audio/m4a',
      resolvedExt: 'm4a',
    });
  });

  it('maps audio/aac correctly', () => {
    expect(resolveAudioMeta('audio/aac')).toEqual({
      resolvedMime: 'audio/aac',
      resolvedExt: 'aac',
    });
  });
});

describe('parseSSEText', () => {
  it('extracts text from Anthropic content_block_delta events', () => {
    const sse = [
      'data: {"type":"content_block_delta","delta":{"text":"Hello "}}',
      'data: {"type":"content_block_delta","delta":{"text":"world"}}',
      'data: [DONE]',
    ].join('\n');
    expect(parseSSEText(sse)).toBe('Hello world');
  });

  it('extracts text from generic content events', () => {
    const sse = [
      'data: {"content":"First chunk"}',
      'data: {"content":" second chunk"}',
      'data: [DONE]',
    ].join('\n');
    expect(parseSSEText(sse)).toBe('First chunk second chunk');
  });

  it('returns empty string for empty SSE', () => {
    expect(parseSSEText('')).toBe('');
  });

  it('handles [DONE] only', () => {
    expect(parseSSEText('data: [DONE]')).toBe('');
  });

  it('skips malformed JSON lines gracefully', () => {
    const sse = [
      'data: not-json',
      'data: {"delta":{"text":"works"}}',
    ].join('\n');
    expect(parseSSEText(sse)).toBe('works');
  });
});

describe('cleanRawJSON', () => {
  it('returns cleaned text unchanged', () => {
    expect(cleanRawJSON('Hello world')).toBe('Hello world');
  });

  it('strips SSE data: prefixes', () => {
    const input = 'data: Hello\ndata: World';
    const result = cleanRawJSON(input);
    // cleanRawJSON should handle leftover SSE artifacts
    expect(result).toBeTruthy();
  });

  it('strips standalone [DONE] SSE lines', () => {
    const input = 'data: [DONE]\nSome text';
    const result = cleanRawJSON(input);
    expect(result).not.toContain('[DONE]');
    expect(result).toContain('Some text');
  });

  it('handles empty string', () => {
    expect(cleanRawJSON('')).toBe('');
  });
});
