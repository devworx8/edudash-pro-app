export type FallbackPolicy = 'provider_outage_only' | 'always' | 'never';
export type QualityMode = 'strict' | 'standard';
export type FallbackReason =
  | 'provider_unavailable'
  | 'freemium_limit'
  | 'parse_failed'
  | 'quality_guardrail';

export function toBooleanFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function normalizeFallbackPolicy(value: unknown): FallbackPolicy {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'never') return 'never';
  if (raw === 'always') return 'always';
  return 'provider_outage_only';
}

export function normalizeQualityMode(value: unknown): QualityMode {
  return String(value || '').trim().toLowerCase() === 'standard' ? 'standard' : 'strict';
}

export function canFallbackForReason(policy: FallbackPolicy, reason: FallbackReason): boolean {
  if (policy === 'never') return false;
  if (policy === 'always') return true;
  return reason === 'provider_unavailable';
}

export function mapUnhandledError(message: string): {
  status: number;
  error: string;
  message: string;
  retryable: boolean;
} {
  const normalized = String(message || '').toLowerCase();

  if (normalized.includes('ai service is busy')) {
    return {
      status: 429,
      error: 'provider_rate_limited',
      message: 'AI provider is temporarily rate-limited. Please retry shortly.',
      retryable: true,
    };
  }

  if (
    normalized.includes('organization membership required') ||
    normalized.includes('school membership required') ||
    normalized.includes('outside staff access') ||
    normalized.includes('outside staff school scope') ||
    normalized.includes('parent can only generate exams for linked children') ||
    normalized.includes('student can only generate for self') ||
    normalized.includes('staff can only access students in their own school scope')
  ) {
    return {
      status: 403,
      error: 'forbidden_scope',
      message,
      retryable: false,
    };
  }

  if (
    normalized.includes('requested student record was not found') ||
    normalized.includes('requested class was not found')
  ) {
    return {
      status: 404,
      error: 'scope_not_found',
      message,
      retryable: false,
    };
  }

  if (normalized.includes('linked learner is required')) {
    return {
      status: 400,
      error: 'missing_linked_learner',
      message,
      retryable: false,
    };
  }

  return {
    status: 500,
    error: 'internal_server_error',
    message,
    retryable: true,
  };
}
