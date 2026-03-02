import {
  parseFunctionInvokeError,
  toMaterialErrorMessage,
} from '@/components/exam-prep/studyMaterialPipeline.utils';

describe('study material pipeline error mapping', () => {
  it('parses provider rate-limit payloads', async () => {
    const error = {
      context: {
        status: 429,
        text: async () =>
          JSON.stringify({
            error_code: 'provider_rate_limited',
            message: 'Provider busy',
            retry_after_seconds: 30,
          }),
        headers: {
          get: () => null,
        },
      },
    };

    const parsed = await parseFunctionInvokeError(error, 'fallback');
    expect(parsed.rateLimited).toBe(true);
    expect(parsed.quotaExceeded).toBe(false);
    expect(parsed.retryAfterSeconds).toBe(30);
    expect(toMaterialErrorMessage(parsed)).toContain('30 seconds');
  });

  it('maps quota exceeded errors to non-retry quota guidance', async () => {
    const error = {
      context: {
        status: 429,
        text: async () =>
          JSON.stringify({
            error_code: 'quota_exceeded',
            message: 'AI usage quota exceeded for this billing period',
          }),
        headers: {
          get: () => null,
        },
      },
    };

    const parsed = await parseFunctionInvokeError(error, 'fallback');
    expect(parsed.quotaExceeded).toBe(true);
    expect(toMaterialErrorMessage(parsed)).toContain('quota');
  });
});
