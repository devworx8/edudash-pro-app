import {
  buildExamModelProfile,
  isFallbackModel,
  isHighEndStarterModel,
} from '@/supabase/functions/generate-exam/modelProfile';

describe('buildExamModelProfile', () => {
  it('returns starter premium profile for high-end parent-starter runs', () => {
    const profile = buildExamModelProfile({
      modelUsed: 'claude-sonnet-4-20250514',
      isParentStarterTier: true,
      premiumUsed: 3,
      premiumWindow: 5,
    });

    expect(profile.code).toBe('starter_premium');
    expect(profile.label).toBe('Sonnet Boost');
    expect(profile.colorKey).toBe('success');
    expect(profile.usage).toEqual({ used: 3, limit: 5, remaining: 2 });
  });

  it('returns starter standard profile once using Haiku', () => {
    const profile = buildExamModelProfile({
      modelUsed: 'claude-3-5-haiku-20241022',
      isParentStarterTier: true,
      premiumUsed: 5,
      premiumWindow: 5,
    });

    expect(profile.code).toBe('starter_standard');
    expect(profile.label).toBe('Haiku 4x');
    expect(profile.colorKey).toBe('info');
    expect(profile.usage).toEqual({ used: 5, limit: 5, remaining: 0 });
  });

  it('returns fallback profile for fallback generation', () => {
    const profile = buildExamModelProfile({
      modelUsed: 'fallback:provider_unavailable',
      isParentStarterTier: true,
      premiumUsed: 2,
      premiumWindow: 5,
    });

    expect(profile).toEqual({
      code: 'fallback',
      label: 'Fallback generation',
      colorKey: 'warning',
    });
  });

  it('returns default profile for non parent-starter tiers', () => {
    const profile = buildExamModelProfile({
      modelUsed: 'claude-sonnet-4-20250514',
      isParentStarterTier: false,
      premiumUsed: 0,
      premiumWindow: 5,
    });

    expect(profile).toEqual({
      code: 'default',
      label: 'Standard model',
      colorKey: 'info',
    });
  });
});

describe('model profile helpers', () => {
  it('detects fallback model names', () => {
    expect(isFallbackModel('fallback:timeout')).toBe(true);
    expect(isFallbackModel('claude-3-5-haiku-20241022')).toBe(false);
  });

  it('detects high-end starter model names', () => {
    expect(isHighEndStarterModel('claude-sonnet-4-20250514')).toBe(true);
    expect(isHighEndStarterModel('claude-3-5-haiku-20241022')).toBe(false);
    expect(isHighEndStarterModel('fallback:provider_unavailable')).toBe(false);
  });
});

