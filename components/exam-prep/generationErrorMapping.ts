export type InvokeErrorDetails = {
  message: string;
  code?: string;
  status?: number;
  retryAfterSeconds?: number;
};

function coercePositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.max(1, Math.round(parsed));
}

export async function extractInvokeErrorDetails(
  error: unknown,
  fallbackData?: unknown,
): Promise<InvokeErrorDetails> {
  const err = (error || {}) as Record<string, unknown>;
  const baseMessage =
    typeof err.message === 'string' && err.message.trim().length > 0
      ? err.message.trim()
      : 'Generation failed. Please retry.';

  let payload: Record<string, unknown> | null = (fallbackData && typeof fallbackData === 'object')
    ? (fallbackData as Record<string, unknown>)
    : null;
  let status: number | undefined;
  let retryAfterSeconds: number | undefined;

  const context = (err.context || null) as
    | {
        status?: number;
        headers?: { get?: (name: string) => string | null };
        text?: () => Promise<string>;
        json?: () => Promise<unknown>;
      }
    | null;

  if (context && typeof context === 'object' && typeof context.text === 'function') {
    try {
      status = Number.isFinite(Number(context.status)) ? Number(context.status) : undefined;
      const retryAfterHeader =
        context.headers?.get?.('retry-after') || context.headers?.get?.('Retry-After');
      retryAfterSeconds = coercePositiveInteger(retryAfterHeader);

      const contentType = String(context.headers?.get?.('content-type') || '').toLowerCase();
      if (contentType.includes('application/json') && typeof context.json === 'function') {
        const parsed = await context.json();
        if (parsed && typeof parsed === 'object') {
          payload = parsed as Record<string, unknown>;
        }
      } else {
        const raw = await context.text();
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            payload = parsed;
          } catch {
            payload = { message: raw };
          }
        }
      }
    } catch {
      // Keep fallback message when response parsing fails.
    }
  }

  const code =
    typeof payload?.code === 'string'
      ? payload.code
      : typeof payload?.error_code === 'string'
      ? payload.error_code
      : typeof payload?.error === 'string'
      ? payload.error
      : undefined;
  const serverMessage =
    typeof payload?.message === 'string'
      ? payload.message
      : typeof payload?.error_description === 'string'
      ? payload.error_description
      : undefined;
  const issues = Array.isArray(payload?.issues)
    ? payload.issues.filter((item): item is string => typeof item === 'string').slice(0, 2)
    : [];

  if (code === 'generation_quality_guardrail_failed') {
    return {
      code,
      status,
      retryAfterSeconds,
      message:
        issues.length > 0
          ? `Draft failed quality checks: ${issues.join(' ')}`
          : 'Draft failed language/comprehension quality checks. Tap Retry to regenerate.',
    };
  }

  if (code === 'ai_provider_unavailable' || code === 'provider_unavailable') {
    return {
      code,
      status,
      retryAfterSeconds,
      message:
        retryAfterSeconds && retryAfterSeconds > 0
          ? `AI provider is busy right now. Retry in about ${retryAfterSeconds} seconds.`
          : 'AI provider is temporarily busy. Retry in about a minute.',
    };
  }

  if (code === 'premium_exam_limit_reached') {
    return {
      code,
      status,
      retryAfterSeconds,
      message: serverMessage || 'Premium exam generation limit reached for this cycle.',
    };
  }

  if (code === 'generation_parse_failed') {
    return {
      code,
      status,
      retryAfterSeconds,
      message: 'Exam draft came back malformed. Tap Retry to regenerate.',
    };
  }

  if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
    return {
      code,
      status,
      retryAfterSeconds,
      message: serverMessage.trim(),
    };
  }

  if (status === 429 || status === 503) {
    return {
      code,
      status,
      retryAfterSeconds,
      message:
        retryAfterSeconds && retryAfterSeconds > 0
          ? `Service is rate-limited. Retry in about ${retryAfterSeconds} seconds.`
          : 'Service is temporarily rate-limited. Retry in about a minute.',
    };
  }

  return {
    code,
    status,
    retryAfterSeconds,
    message: baseMessage,
  };
}
