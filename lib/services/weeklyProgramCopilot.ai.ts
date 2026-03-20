import { extractJson, type WeeklyProgramAIResponse } from './weeklyProgramCopilot.parsing';

export type AIFunctionInvokeResult = {
  data: unknown;
  error: unknown;
};

export type SupabaseFunctionsClient = {
  functions: {
    invoke: (name: string, args: { body: Record<string, unknown> }) => Promise<AIFunctionInvokeResult>;
  };
};

export const extractFunctionErrorMessage = async (error: unknown): Promise<string | null> => {
  const maybeError = error as { context?: unknown; message?: string };
  const context = maybeError?.context as
    | {
        status?: number;
        clone?: () => {
          json?: () => Promise<unknown>;
          text?: () => Promise<string>;
        };
        json?: () => Promise<unknown>;
        text?: () => Promise<string>;
      }
    | undefined;

  if (!context) {
    return maybeError?.message || null;
  }

  const status = typeof context.status === 'number' ? context.status : null;
  const response = typeof context.clone === 'function' ? context.clone() : context;

  try {
    if (typeof response.json === 'function') {
      const payload = await response.json();
      if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const message =
          typeof record.message === 'string'
            ? record.message
            : typeof record.error === 'string'
              ? record.error
              : null;
        if (message) {
          return status ? `${message} (HTTP ${status})` : message;
        }
      }
    }
  } catch {
    // ignore JSON parsing issues and try plain text fallback
  }

  try {
    if (typeof response.text === 'function') {
      const text = (await response.text()).trim();
      if (text) {
        return status ? `${text} (HTTP ${status})` : text;
      }
    }
  } catch {
    // ignore fallback parsing errors
  }

  return maybeError?.message || null;
};

export const normalizeWeeklyProgramErrorMessage = (message: string | null | undefined): string | null => {
  const raw = String(message || '').trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  if (
    normalized.includes('workspace api usage limits') ||
    normalized.includes('api usage limits') ||
    normalized.includes('will regain access on')
  ) {
    const regain = raw.match(/regain access on ([0-9-]{10}(?: at)? [0-9:]{4,8} UTC)/i)?.[1];
    return regain
      ? `AI provider usage limit reached. Retry after ${regain}, or switch to another configured provider.`
      : 'AI provider usage limit reached. Please retry later or switch to another configured provider.';
  }

  if (normalized.includes('insufficient_quota') || normalized.includes('rate limit') || normalized.includes('http 429')) {
    return 'AI provider rate/quota limit reached. Please retry shortly.';
  }

  return raw;
};

export const extractAIContent = (data: unknown): string => {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return JSON.stringify(data || {});

  const record = data as Record<string, unknown>;
  const primaryKeys = ['content', 'response', 'result', 'text', 'message'] as const;

  for (const key of primaryKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (!Array.isArray(value)) continue;
    const combined = value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          return String((part as Record<string, unknown>).text);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
    if (combined) return combined;
  }

  return JSON.stringify(data || {});
};

const buildRepairSourceExcerpt = (sourceText: string): string => {
  const source = String(sourceText || '').trim();
  if (!source) return '';
  if (source.length <= 12000) return source;

  const head = source.slice(0, 8500);
  const tail = source.slice(-3000);
  const omitted = Math.max(0, source.length - head.length - tail.length);
  return `${head}\n\n[TRUNCATED ${omitted} CHARS]\n\n${tail}`;
};

export const repairWeeklyProgramJson = async (
  supabase: SupabaseFunctionsClient,
  sourceText: string,
): Promise<WeeklyProgramAIResponse | null> => {
  const source = buildRepairSourceExcerpt(sourceText);
  if (!source) return null;

  const repairPrompt = [
    'You are a JSON normalizer.',
    'Convert the SOURCE into STRICT JSON only (no markdown fences, no extra text).',
    'SOURCE may be partially truncated. If so, infer missing structure conservatively.',
    'Return COMPACT JSON (single-line/minified) to avoid token truncation.',
    'Schema:',
    '{',
    '  "title": "string",',
    '  "summary": "string",',
    '  "days": [',
    '    {',
    '      "day_of_week": 1,',
    '      "blocks": [',
    '        {',
    '          "block_order": 1,',
    '          "block_type": "circle_time|learning|movement|outdoor|meal|nap|assessment|transition|other",',
    '          "title": "string",',
    '          "start_time": "HH:MM|null",',
    '          "end_time": "HH:MM|null",',
    '          "objectives": ["string"],',
    '          "materials": ["string"],',
    '          "transition_cue": "string|null",',
    '          "notes": "string|null"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    'Rules: map weekday names to day_of_week 1..7; preserve details; use null when unknown.',
    'Rules: keep Monday-Friday (1..5) and max 6 blocks/day.',
    'Rules: do not include parent tips or home activity advice.',
    '',
    'SOURCE:',
    source,
  ].join('\n');

  try {
    // §3.1: Quota pre-check before AI call
    const { assertQuotaForService } = await import('@/lib/ai/guards');
    const repairQuota = await assertQuotaForService('lesson_generation');
    if (!repairQuota.allowed) return null;

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        service_type: 'lesson_generation',
        payload: { prompt: repairPrompt },
        // Prefer OpenAI first for recovery flows to avoid hard-stop when
        // Anthropic workspace caps are temporarily exhausted.
        prefer_openai: true,
        stream: false,
        enable_tools: false,
        metadata: { source: 'weekly_program_copilot_repair' },
      },
    });
    if (error) return null;
    return extractJson(extractAIContent(data));
  } catch {
    return null;
  }
};
