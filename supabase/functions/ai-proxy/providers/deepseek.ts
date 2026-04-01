import { getEnv } from '../auth.ts';
import { DEFAULT_MAX_TOKENS } from '../config.ts';
import { resolveTemperature } from '../config.ts';
import type { JsonRecord, ProviderResponse } from '../types.ts';
import { normalizeOpenAIMessages } from '../message-processing.ts';

const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'; // DeepSeek-V3

export function getDeepSeekApiKey(): string | null {
  return getEnv('DEEPSEEK_API_KEY') || getEnv('SERVER_DEEPSEEK_API_KEY');
}

export async function callDeepSeek(
  messages: Array<JsonRecord>,
  requestedModel?: string | null,
  requestMetadata: Record<string, unknown> = {},
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<ProviderResponse> {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  const model = requestedModel || DEFAULT_DEEPSEEK_MODEL;

  const body: JsonRecord = {
    model,
    messages: normalizeOpenAIMessages(messages),
    temperature: resolveTemperature(requestMetadata),
    max_tokens: maxTokens,
  };

  const response = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    // One retry for rate limits / server errors
    if (response.status === 429 || response.status >= 500) {
      await new Promise((r) => setTimeout(r, 800));
      const retry = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!retry.ok) {
        const retryText = await retry.text();
        throw new Error(`DeepSeek error: ${retry.status} ${retryText}`);
      }
      const retryData = await retry.json();
      return parseDeepSeekResponse(retryData, model);
    }
    throw new Error(`DeepSeek error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return parseDeepSeekResponse(data, model);
}

function parseDeepSeekResponse(data: any, model: string): ProviderResponse {
  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';
  return {
    content,
    usage: {
      tokens_in: data.usage?.prompt_tokens || 0,
      tokens_out: data.usage?.completion_tokens || 0,
    },
    model,
    provider: 'deepseek' as any,
  };
}
