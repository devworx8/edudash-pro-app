import {
  canFallbackForReason,
  normalizeFallbackPolicy,
  normalizeQualityMode,
} from '@/supabase/functions/generate-exam/fallbackPolicy';

describe('generate-exam fallback policy', () => {
  it('defaults to provider_outage_only', () => {
    expect(normalizeFallbackPolicy(undefined)).toBe('provider_outage_only');
    expect(normalizeFallbackPolicy('')).toBe('provider_outage_only');
  });

  it('allows fallback only for provider outages in outage-only mode', () => {
    expect(canFallbackForReason('provider_outage_only', 'provider_unavailable')).toBe(true);
    expect(canFallbackForReason('provider_outage_only', 'quality_guardrail')).toBe(false);
    expect(canFallbackForReason('provider_outage_only', 'parse_failed')).toBe(false);
  });

  it('supports strict and standard quality modes', () => {
    expect(normalizeQualityMode('strict')).toBe('strict');
    expect(normalizeQualityMode('standard')).toBe('standard');
    expect(normalizeQualityMode('unknown')).toBe('standard');
  });
});
