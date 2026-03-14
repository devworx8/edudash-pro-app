import { getOpenAIApiKey } from '../auth.ts';
import { DEFAULT_MAX_TOKENS, DEFAULT_OPENAI_ALLOWED_MODELS } from '../config.ts';
import { resolveTemperature } from '../config.ts';
import { parseAllowedModels, pickAllowedModel } from '../models.ts';
import { normalizeOpenAIMessages } from '../message-processing.ts';
import { RETRYABLE_PROVIDER_STATUSES } from '../prompts/system.ts';
import type { JsonRecord, ProviderResponse } from '../types.ts';

/**
 * Call OpenAI with native SSE streaming.
 * Streams token deltas to the client in the same content_block_delta format
 * consumed by the app streaming parser.
 */
export function callOpenAIStreaming(
  messages: Array<JsonRecord>,
  requestedModel: string | null | undefined,
  requestMetadata: Record<string, unknown>,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): { stream: ReadableStream<Uint8Array>; meta: Promise<ProviderResponse> } {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const allowed = parseAllowedModels('OPENAI_ALLOWED_MODELS', DEFAULT_OPENAI_ALLOWED_MODELS);
  const fallbackModel = DEFAULT_OPENAI_ALLOWED_MODELS[0];
  const selection = pickAllowedModel(requestedModel || Deno.env.get('OPENAI_MODEL'), allowed, fallbackModel);
  if (selection.usedFallback) console.warn('[ai-proxy] OpenAI streaming model fallback:', selection.reason);
  const model = selection.model;

  const encoder = new TextEncoder();
  let fullContent = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let modelUsed = model;
  let resolveMetaPromise: (v: ProviderResponse) => void;
  let rejectMetaPromise: (e: Error) => void;
  const metaPromise = new Promise<ProviderResponse>((res, rej) => {
    resolveMetaPromise = res;
    rejectMetaPromise = rej;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const requestBody: JsonRecord = {
          model,
          messages: normalizeOpenAIMessages(messages),
          temperature: resolveTemperature(requestMetadata),
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        };

        const callOpenAIStream = async () => {
          return await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
          });
        };

        let response = await callOpenAIStream();
        if (!response.ok && RETRYABLE_PROVIDER_STATUSES.has(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          response = await callOpenAIStream();
        }

        if (!response.ok || !response.body) {
          const errText = await response.text();
          const userMessage = response.status === 529
            ? 'The AI service is temporarily overloaded. Please try again in a moment.'
            : response.status === 401 || response.status === 403
              ? 'AI service authentication error. Please contact support.'
              : `Sorry, the AI service returned an error (${response.status}). Please try again.`;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errText })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: userMessage } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          rejectMetaPromise!(new Error(`OpenAI streaming error: ${response.status} ${errText}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sawDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (!trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            if (!dataStr) continue;
            if (dataStr === '[DONE]') {
              sawDone = true;
              continue;
            }

            try {
              const event = JSON.parse(dataStr) as JsonRecord;
              const eventModel = event.model;
              if (typeof eventModel === 'string' && eventModel.length > 0) {
                modelUsed = eventModel;
              }

              const usage = event.usage as JsonRecord | undefined;
              if (usage) {
                const promptTokens = usage.prompt_tokens;
                const completionTokens = usage.completion_tokens;
                if (typeof promptTokens === 'number') tokensIn = promptTokens;
                if (typeof completionTokens === 'number') tokensOut = completionTokens;
              }

              const choices = Array.isArray(event.choices) ? event.choices : [];
              const firstChoice = choices[0] as JsonRecord | undefined;
              const delta = firstChoice?.delta as JsonRecord | undefined;
              const text = typeof delta?.content === 'string' ? delta.content : '';
              if (!text) continue;

              fullContent += text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text } })}\n\n`)
              );
            } catch {
              // Skip malformed SSE lines.
            }
          }
        }

        if (!sawDone && buffer.trim().startsWith('data:')) {
          const finalData = buffer.trim().slice(5).trim();
          if (finalData && finalData !== '[DONE]') {
            try {
              const event = JSON.parse(finalData) as JsonRecord;
              const choices = Array.isArray(event.choices) ? event.choices : [];
              const firstChoice = choices[0] as JsonRecord | undefined;
              const delta = firstChoice?.delta as JsonRecord | undefined;
              const text = typeof delta?.content === 'string' ? delta.content : '';
              if (text) {
                fullContent += text;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text } })}\n\n`)
                );
              }
            } catch {
              // Ignore malformed trailing chunk.
            }
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        resolveMetaPromise!({
          content: fullContent,
          model: modelUsed,
          usage: { tokens_in: tokensIn, tokens_out: tokensOut },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        try {
          const userMessage = 'Sorry, something went wrong while processing your request. Please try again.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: userMessage } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          // controller already closed
        }
        rejectMetaPromise!(err instanceof Error ? err : new Error(errMsg));
      }
    },
  });

  return { stream, meta: metaPromise };
}
