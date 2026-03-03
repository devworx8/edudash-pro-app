import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { assertSupabase } from '@/lib/supabase';

export const MAX_MATERIAL_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_MATERIAL_SIZE_MB = Math.round(MAX_MATERIAL_SIZE_BYTES / (1024 * 1024));
export const MATERIAL_QUEUE_MAX_ATTEMPTS = 8;

export type FunctionInvokeErrorInfo = {
  status?: number;
  code?: string;
  message: string;
  rateLimited: boolean;
  quotaExceeded: boolean;
  retryAfterSeconds?: number;
};

export function formatSizeMB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0';
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stripStudyLinePrefix(line: string): string {
  return line.replace(/^\(?\d+\)?[.)\-:\s]+/, '').trim();
}

function isStudyMetaLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed === '---') return true;
  if (/^\d{6,}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(trimmed)) return true;
  if (/^source:\s*/i.test(trimmed)) return true;
  if (/^page\s+\d+$/i.test(trimmed)) return true;
  const normalized = stripStudyLinePrefix(trimmed).toLowerCase();
  return [
    'topics to revise',
    'key facts/formulas',
    'common mistakes',
    'suggested question angles',
  ].includes(normalized);
}

export function sanitizeMaterialSummary(rawSummary: string): string {
  const lines = String(rawSummary || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) =>
      line
        .replace(/\((?:teacher|class|translation|english)\s*:[^)]*\)/gi, '')
        .replace(/\[(?:teacher|class|translation|english)\s*:[^\]]*\]/gi, '')
        .trim(),
    )
    .map((line) => stripStudyLinePrefix(line))
    .map((line) => line.replace(/^[-*•]\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isStudyMetaLine(line));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (key.length < 4 || seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }

  return deduped.join('\n').slice(0, 2400).trim();
}

export async function parseFunctionInvokeError(error: unknown, fallbackMessage: string): Promise<FunctionInvokeErrorInfo> {
  const err = (error || {}) as Record<string, unknown>;
  const context = (err.context || null) as
    | {
        status?: number;
        headers?: { get?: (name: string) => string | null };
        text?: () => Promise<string>;
      }
    | null;

  const rawStatus = err.status || context?.status;
  const status = Number.isFinite(Number(rawStatus)) ? Number(rawStatus) : undefined;
  let payloadCode: string | undefined;
  let payloadMessage: string | undefined;
  let retryAfterSeconds: number | undefined;

  if (context?.headers?.get) {
    const retryAfterHeader = context.headers.get('retry-after') || context.headers.get('Retry-After');
    const parsed = Number.parseInt(String(retryAfterHeader || ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) retryAfterSeconds = parsed;
  }

  if (context && typeof context.text === 'function') {
    try {
      const rawText = await context.text();
      if (rawText) {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        if (typeof parsed.code === 'string') payloadCode = parsed.code;
        if (typeof parsed.error === 'string') payloadCode = parsed.error;
        if (typeof parsed.error_code === 'string') payloadCode = parsed.error_code;
        if (typeof parsed.message === 'string') payloadMessage = parsed.message;
        if (Number.isFinite(Number(parsed.retry_after_seconds))) {
          retryAfterSeconds = Number(parsed.retry_after_seconds);
        }
      }
    } catch {
      // ignore
    }
  }

  const message =
    payloadMessage ||
    (typeof err.message === 'string' ? err.message : '') ||
    fallbackMessage;
  const code =
    payloadCode ||
    (typeof err.code === 'string' ? err.code : undefined);
  const normalized = `${code || ''} ${message}`.toLowerCase();

  return {
    status,
    code,
    message,
    rateLimited:
      status === 429 ||
      code === 'rate_limited' ||
      code === 'provider_rate_limited' ||
      normalized.includes('rate limit') ||
      normalized.includes('too many requests'),
    quotaExceeded:
      code === 'quota_exceeded' ||
      normalized.includes('quota exceeded') ||
      normalized.includes('billing period'),
    retryAfterSeconds,
  };
}

export function toMaterialErrorMessage(info: FunctionInvokeErrorInfo): string {
  if (info.quotaExceeded) {
    return 'AI usage quota reached for this billing period. Please upgrade or wait for quota reset before analyzing more study material.';
  }
  if (info.rateLimited) {
    if (info.retryAfterSeconds && info.retryAfterSeconds > 0) {
      return `AI provider is busy right now (not your account quota). Retry in about ${info.retryAfterSeconds} seconds.`;
    }
    return 'AI provider is temporarily rate-limited (not your account quota). Retry in about a minute.';
  }
  if (info.message.includes('Edge Function returned a non-2xx')) {
    return 'Study material analysis failed. Please retry in a moment.';
  }
  return info.message || 'Could not analyze study material.';
}

export async function summarizeStudyMaterial(payload: {
  base64: string;
  mimeType: string;
  fileName: string;
  selectedLanguageName: string;
}): Promise<string> {
  const supabase = assertSupabase();
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      scope: 'student',
      service_type: 'image_analysis',
      payload: {
        prompt: `Extract exam-prep context from ${payload.fileName}. Provide concise bullet points under: (1) Topics to revise, (2) Key facts/formulas, (3) Common mistakes, (4) Suggested question angles. Keep terms in the source language and add short clarifiers in ${payload.selectedLanguageName} only when required for meaning.`,
        context:
          'You process learner study material for CAPS exam prep. Return plain text bullet points only. Keep it concise and practical.',
        images: [{ data: payload.base64, media_type: payload.mimeType }],
        ocr_mode: true,
        ocr_task: 'document',
        ocr_response_format: 'text',
      },
      stream: false,
      enable_tools: false,
      provider_preference: 'auto',
      metadata: {
        source: 'exam_prep.wizard.material_ocr',
        file_name: payload.fileName,
      },
    },
  });

  if (error) {
    throw error;
  }

  const rawSummary =
    typeof data === 'string'
      ? data.trim()
      : String((data as Record<string, unknown> | null)?.content || (data as any)?.ocr?.analysis || '').trim();
  const summary = sanitizeMaterialSummary(rawSummary);
  if (!summary) {
    throw new Error('No readable content detected in the selected file.');
  }
  return summary;
}

export async function readFileAsBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    if (uri.startsWith('data:')) {
      const base64Marker = 'base64,';
      const markerIndex = uri.indexOf(base64Marker);
      if (markerIndex >= 0) return uri.slice(markerIndex + base64Marker.length);
    }

    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Could not read selected file (${response.status}).`);
    }
    const blob = await response.blob();

    const readerCtor = (globalThis as any).FileReader;
    if (!readerCtor) {
      throw new Error('Web file reader is not available in this browser.');
    }

    const base64DataUrl: string = await new Promise((resolve, reject) => {
      const reader = new readerCtor();
      reader.onerror = () => reject(new Error('Failed to read selected file.'));
      reader.onloadend = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Invalid file data.'));
          return;
        }
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });

    const marker = base64DataUrl.indexOf('base64,');
    if (marker >= 0) return base64DataUrl.slice(marker + 7);
    return base64DataUrl;
  }

  return await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
