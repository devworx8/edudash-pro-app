import { extractRetryAfterSeconds, mapAiProxyErrorCode } from '@/supabase/functions/ai-proxy/errorContract';

describe('ai-proxy OCR error contract helpers', () => {
  it('maps provider rate limits to provider_rate_limited', () => {
    expect(mapAiProxyErrorCode(429, 'Too many requests')).toBe('provider_rate_limited');
  });

  it('maps quota messages to quota_exceeded', () => {
    expect(mapAiProxyErrorCode(429, 'AI usage quota exceeded for this billing period')).toBe(
      'quota_exceeded',
    );
  });

  it('maps server failures to provider_unavailable', () => {
    expect(mapAiProxyErrorCode(503, 'Provider unavailable')).toBe('provider_unavailable');
  });

  it('extracts retry-after seconds from text payloads', () => {
    expect(extractRetryAfterSeconds('provider busy retry-after: 45')).toBe(45);
    expect(extractRetryAfterSeconds('no delay provided')).toBeUndefined();
  });
});
