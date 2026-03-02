export function extractRetryAfterSeconds(value: string): number | undefined {
  const normalized = String(value || '');
  const retryAfterMatch = normalized.match(/retry(?:\s|-|_)?after(?:\s|-|_)?[:=]?\s*(\d{1,4})/i);
  if (retryAfterMatch?.[1]) {
    const parsed = Number.parseInt(retryAfterMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export function mapAiProxyErrorCode(
  status: number,
  message: string,
): 'provider_rate_limited' | 'quota_exceeded' | 'provider_unavailable' | 'invalid_request' {
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('quota') || normalized.includes('billing period')) {
    return 'quota_exceeded';
  }
  if (status === 429) {
    return 'provider_rate_limited';
  }
  if (status >= 500) {
    return 'provider_unavailable';
  }
  return 'invalid_request';
}
