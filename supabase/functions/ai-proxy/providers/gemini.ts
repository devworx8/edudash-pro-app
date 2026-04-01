import { getEnv } from '../auth.ts';
import { DEFAULT_MAX_TOKENS } from '../config.ts';
import { resolveTemperature } from '../config.ts';
import type { JsonRecord, ProviderResponse } from '../types.ts';
import { normalizeOpenAIMessages } from '../message-processing.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

export function getGeminiApiKey(): string | null {
  return getEnv('GOOGLE_GEMINI_API_KEY') || getEnv('GOOGLE_AI_API_KEY') || getEnv('GEMINI_API_KEY');
}

export async function callGemini(
  messages: Array<JsonRecord>,
  requestedModel?: string | null,
  requestMetadata: Record<string, unknown> = {},
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<ProviderResponse> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY is not configured.');
  }

  const model = requestedModel || DEFAULT_GEMINI_MODEL;

  // Transform OpenAI-format messages to Gemini format
  const { systemInstruction, contents } = toGeminiFormat(messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: resolveTemperature(requestMetadata),
      maxOutputTokens: maxTokens,
      responseMimeType: 'text/plain',
    },
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429 || response.status >= 500) {
      await new Promise((r) => setTimeout(r, 800));
      const retry = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!retry.ok) {
        const retryText = await retry.text();
        throw new Error(`Gemini error: ${retry.status} ${retryText}`);
      }
      const retryData = await retry.json();
      return parseGeminiResponse(retryData, model);
    }
    throw new Error(`Gemini error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return parseGeminiResponse(data, model);
}

function toGeminiFormat(messages: Array<JsonRecord>): {
  systemInstruction: Record<string, unknown> | null;
  contents: Array<Record<string, unknown>>;
} {
  let systemInstruction: Record<string, unknown> | null = null;
  const contents: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const role = String(msg.role || '');
    const content = String(msg.content || '');

    if (role === 'system') {
      systemInstruction = {
        parts: [{ text: content }],
      };
      continue;
    }

    contents.push({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text: content }],
    });
  }

  // Gemini requires at least one content entry
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: '' }] });
  }

  return { systemInstruction, contents };
}

function parseGeminiResponse(data: any, model: string): ProviderResponse {
  const candidate = data.candidates?.[0];
  const content = candidate?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  const usage = data.usageMetadata;

  return {
    content,
    usage: {
      tokens_in: usage?.promptTokenCount || 0,
      tokens_out: usage?.candidatesTokenCount || 0,
    },
    model,
    provider: 'google' as any,
  };
}
