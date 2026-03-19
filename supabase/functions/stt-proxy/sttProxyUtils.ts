export type SttProxySource = 'storage_path' | 'audio_base64' | 'audio_url';

export interface SttProxyNormalizedRequest {
  source: SttProxySource;
  storagePath?: string;
  storageBucket: string;
  audioBase64?: string;
  audioUrl?: string;
  audioContentType?: string;
  language: string;
  prompt?: string;
}

const DEFAULT_STORAGE_BUCKET = 'voice-notes';
const ALLOWED_STORAGE_BUCKETS = new Set(['voice-notes']);
const MAX_CANDIDATE_LANGUAGES = 8;

function sanitizeString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeLanguageToken(value: string): string | null {
  const raw = sanitizeString(value).toLowerCase();
  if (!raw || raw === 'auto') return null;
  if (/^[a-z]{2,3}$/.test(raw)) return raw;

  const base = raw.split('-')[0];
  if (/^[a-z]{2,3}$/.test(base)) return base;

  return null;
}

function normalizeCandidateLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item) => normalizeLanguageToken(String(item || '')))
    .filter((item): item is string => Boolean(item));

  return [...new Set(normalized)].slice(0, MAX_CANDIDATE_LANGUAGES);
}

function buildCandidateLanguagePrompt(candidateLanguages: string[]): string | undefined {
  if (candidateLanguages.length === 0) return undefined;
  return `Likely language candidates: ${candidateLanguages.join(', ')}.`;
}

export function normalizeSttProxyRequest(body: Record<string, unknown>): SttProxyNormalizedRequest {
  const storagePath = sanitizeString(body.storage_path);
  const audioBase64 = sanitizeString(body.audio_base64);
  const audioUrl = sanitizeString(body.audio_url);
  const rawBucket = sanitizeString(body.storage_bucket) || DEFAULT_STORAGE_BUCKET;
  const storageBucket = ALLOWED_STORAGE_BUCKETS.has(rawBucket) ? rawBucket : DEFAULT_STORAGE_BUCKET;
  const audioContentType = sanitizeString(body.audio_content_type) || undefined;
  const autoDetect = body.auto_detect === true;
  const candidateLanguages = normalizeCandidateLanguages(body.candidate_languages);
  const explicitLanguage = normalizeLanguageToken(sanitizeString(body.language));
  const language = autoDetect ? 'auto' : explicitLanguage || candidateLanguages[0] || 'auto';
  const prompt = buildCandidateLanguagePrompt(candidateLanguages);

  if (!storagePath && !audioBase64 && !audioUrl) {
    throw new Error('Provide one of storage_path, audio_base64, or audio_url');
  }

  if (storagePath) {
    return {
      source: 'storage_path',
      storagePath,
      storageBucket,
      audioContentType,
      language,
      prompt,
    };
  }

  if (audioBase64) {
    return {
      source: 'audio_base64',
      audioBase64,
      storageBucket,
      audioContentType,
      language,
      prompt,
    };
  }

  return {
    source: 'audio_url',
    audioUrl,
    storageBucket,
    audioContentType,
    language,
    prompt,
  };
}

export interface SttProxyCompatResponse {
  text: string;
  transcript: string;
  language: string;
  provider: string;
  source: string;
}

export function formatSttProxyResponse(input: {
  text?: unknown;
  language?: unknown;
  provider?: unknown;
  source?: unknown;
}): SttProxyCompatResponse {
  const text = sanitizeString(input.text);
  const language = sanitizeString(input.language) || 'en';
  const provider = sanitizeString(input.provider) || 'whisper-1';
  const source = sanitizeString(input.source) || 'stt-proxy';

  return {
    text,
    transcript: text,
    language,
    provider,
    source,
  };
}

