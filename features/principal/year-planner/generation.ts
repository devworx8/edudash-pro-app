// Year Plan Generation — AI proxy call and JSON parsing
// Extracted from useAIYearPlannerImpl.ts for modularity

import { assertSupabase } from '@/lib/supabase';
import { assertQuotaForService } from '@/lib/ai/guards';
import { YEAR_PLAN_SYSTEM_PROMPT, buildYearPlanUserPrompt } from '@/lib/utils/ai-year-plan-prompts';
import type { YearPlanConfig } from '@/components/principal/ai-planner/types';

// ── Auth error detection ───────────────────────────────────────────────────

export function isAuthRelatedErrorMessage(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('bad_jwt') ||
    normalized.includes('invalid jwt') ||
    normalized.includes('auth token') ||
    normalized.includes('session')
  );
}

// ── JSON extraction helpers ────────────────────────────────────────────────

/**
 * Find the index of the closing brace matching the first `{` in `str`
 * starting at `start`, ignoring braces inside double-quoted strings.
 */
export function findMatchingBrace(str: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = '"';
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (!inString) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return i;
      } else if (c === '"' || c === "'") {
        inString = true;
        quote = c;
      }
      continue;
    }
    if (c === quote) inString = false;
  }
  return -1;
}

/**
 * Attempt to repair a truncated JSON string by closing any in-progress
 * string and unclosed brackets in reverse order.
 */
export function tryRepairTruncatedYearPlanJson(
  text: string,
): Record<string, unknown> | null {
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (inString) {
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') stack.push('{');
    else if (c === '[') stack.push('[');
    else if (c === '}') stack.pop();
    else if (c === ']') stack.pop();
  }

  if (stack.length === 0 && !inString) return null;

  let repaired = text;
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, '');
  repaired += stack
    .slice()
    .reverse()
    .map((c) => (c === '{' ? '}' : ']'))
    .join('');

  const attempts = [repaired, repaired.replace(/,\s*([}\]])/g, '$1')];

  for (const attempt of attempts) {
    try {
      const result = JSON.parse(attempt);
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return result as Record<string, unknown>;
      }
    } catch {
      // try next attempt
    }
  }

  return null;
}

export function extractJsonObject(content: string): Record<string, unknown> | null {
  const text = String(content || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? text).trim();

  const start = candidate.indexOf('{');
  if (start < 0) {
    __DEV__ &&
      console.warn(
        '[AI Year Planner] No JSON object found in response; sample:',
        text.slice(0, 400),
      );
    return null;
  }

  const end = findMatchingBrace(candidate, start);
  const slice = end >= 0 ? candidate.slice(start, end + 1) : candidate.slice(start);

  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch (e) {
    if (__DEV__) {
      console.warn('[AI Year Planner] Failed to parse AI response as JSON:', e);
      console.warn(
        '[AI Year Planner] Response sample (first 800 chars):',
        text.slice(0, 800),
      );
    }
    const repaired = tryRepairTruncatedYearPlanJson(slice);
    if (repaired) {
      if (__DEV__) {
        console.log('[AI Year Planner] Repaired truncated JSON successfully');
      }
      return repaired;
    }
    return null;
  }
}

// ── AI proxy generation call ───────────────────────────────────────────────

export interface GenerateYearPlanResult {
  parsed: Record<string, unknown>;
  rawTermCount: number;
}

export async function generateYearPlanViaAI(params: {
  config: YearPlanConfig;
  organizationId?: string;
}): Promise<GenerateYearPlanResult> {
  const { config, organizationId } = params;
  const supabase = assertSupabase();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) {
    throw new Error('Session expired. Please sign in again.');
  }

  const prompt = [
    buildYearPlanUserPrompt(config),
    '',
    `CRITICAL OUTPUT RULES:`,
    `- Return ONLY a single JSON object. No markdown code fences, no explanation before or after.`,
    `- Return exactly ${config.numberOfTerms} terms in the \"terms\" array.`,
    `- Term numbers must be 1..${config.numberOfTerms} with no gaps.`,
    `- Use only valid YYYY-MM-DD dates.`,
    `- Keep responses COMPACT to avoid truncation: max 3 activities per weekly theme (single short phrases only), max 2 excursions per term, max 2 meetings per term. Prefer brevity over detail in every string value.`,
    `- Do NOT include markdown, prose, or any text outside the JSON object.`,
  ].join('\n');

  // §3.1: Quota pre-check before AI call
  const quota = await assertQuotaForService('lesson_generation');
  if (!quota.allowed) throw new Error('AI quota exceeded — please upgrade or try again later.');

  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      scope: 'principal',
      service_type: 'lesson_generation',
      payload: {
        prompt,
        context: YEAR_PLAN_SYSTEM_PROMPT,
      },
      stream: false,
      enable_tools: false,
      metadata: {
        source: 'principal_ai_year_planner',
        planner_version: 'native_v2',
        strict_json: true,
        response_format: 'json',
        requested_terms: config.numberOfTerms,
        organization_id: organizationId || null,
      },
    },
  });

  if (error) {
    const invokeStatus = Number((error as any)?.context?.status) || null;
    const invokeMessage = error.message || 'Failed to generate plan';
    if (__DEV__) {
      console.warn('[AI Year Planner] ai-proxy invoke error:', {
        message: invokeMessage,
        name: (error as any)?.name || null,
        context: (error as any)?.context || null,
      });
    }
    if (
      invokeStatus === 401 ||
      invokeStatus === 403 ||
      isAuthRelatedErrorMessage(invokeMessage)
    ) {
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(invokeMessage);
  }

  const content =
    typeof data?.content === 'string'
      ? data.content
      : typeof data?.response === 'string'
        ? data.response
        : JSON.stringify(data || {});

  const parsed = extractJsonObject(content);
  if (!parsed) {
    if (__DEV__) {
      console.warn('[AI Year Planner] Raw response length:', content.length, 'chars');
    }
    throw new Error(
      'Could not parse AI response. The plan may be in an unexpected format—please try again.',
    );
  }

  const rawTermCount = Array.isArray((parsed as any).terms)
    ? (parsed as any).terms.length
    : 0;

  return { parsed, rawTermCount };
}
