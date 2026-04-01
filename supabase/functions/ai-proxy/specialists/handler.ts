// ── Specialist Handler ──────────────────────────────────────────────────────
// Executes a specialist route: builds the prompt, calls the right provider,
// and returns a ProviderResponse. Called from the main index.ts when a
// specialist route is resolved.
// ────────────────────────────────────────────────────────────────────────────

import type { JsonRecord, ProviderResponse } from '../types.ts';
import { callOpenAI } from '../providers/openai.ts';
import { callDeepSeek } from '../providers/deepseek.ts';
import { callGemini } from '../providers/gemini.ts';
import { callAnthropic } from '../providers/anthropic.ts';
import { buildSpecialistSystemPrompt } from './prompts.ts';
import type { SpecialistRoute } from './router.ts';

/**
 * Execute a specialist route — calls the right provider with the specialist
 * system prompt injected.
 */
export async function executeSpecialist(
  route: SpecialistRoute,
  userMessages: Array<JsonRecord>,
  additionalContext?: string,
  supabase?: any,
  requestMetadata: Record<string, unknown> = {},
): Promise<ProviderResponse & { specialist_id: string; routed_provider: string }> {
  // Build specialist system prompt
  const systemPrompt = buildSpecialistSystemPrompt(route.specialistId, additionalContext);
  if (!systemPrompt) {
    throw new Error(`No specialist prompt found for: ${route.specialistId}`);
  }

  // Build messages with specialist system prompt
  const messages: Array<JsonRecord> = [
    { role: 'system', content: systemPrompt },
    ...userMessages.filter((m) => m.role !== 'system'),
  ];

  // Apply temperature override
  const metadata = { ...requestMetadata };
  if (route.temperature != null) {
    metadata._specialist_temperature = route.temperature;
  }

  let response: ProviderResponse;

  switch (route.provider) {
    case 'deepseek':
      response = await callDeepSeek(messages, route.model, metadata, route.maxTokens);
      break;

    case 'gemini':
      response = await callGemini(messages, route.model, metadata, route.maxTokens);
      break;

    case 'openai':
      response = await callOpenAI(
        supabase,
        messages,
        false, // no tools for specialists
        route.model,
        metadata,
        route.maxTokens,
      );
      break;

    case 'anthropic':
      response = await callAnthropic(
        supabase,
        messages,
        false, // no tools
        route.model,
        undefined,
        false,
        metadata,
        route.maxTokens,
      );
      break;

    default:
      throw new Error(`Unknown specialist provider: ${route.provider}`);
  }

  return {
    ...response,
    specialist_id: route.specialistId,
    routed_provider: route.provider,
  };
}
