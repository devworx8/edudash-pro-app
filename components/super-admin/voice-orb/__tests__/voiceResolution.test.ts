jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null }),
}));
jest.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ tier: 'free' }),
}));

import { resolveEffectiveVoiceId } from '@/components/super-admin/voice-orb/useVoiceTTS';

describe('resolveEffectiveVoiceId', () => {
  it('uses request override first', () => {
    const resolved = resolveEffectiveVoiceId({
      language: 'en-ZA',
      requestOverride: 'en-ZA-LukeNeural',
      preferenceVoiceId: 'en-ZA-LeahNeural',
      aiSettingsVoice: 'female',
    });

    expect(resolved.voiceId).toBe('en-ZA-LukeNeural');
    expect(resolved.source).toBe('request_override');
  });

  it('falls back to voice preference before ai settings', () => {
    const resolved = resolveEffectiveVoiceId({
      language: 'en-ZA',
      preferenceVoiceId: 'en-ZA-LeahNeural',
      aiSettingsVoice: 'male',
    });

    expect(resolved.voiceId).toBe('en-ZA-LeahNeural');
    expect(resolved.source).toBe('voice_preferences');
  });

  it('uses Luke as the deterministic default English voice', () => {
    const resolved = resolveEffectiveVoiceId({
      language: 'en-ZA',
    });

    expect(resolved.voiceId).toBe('en-ZA-LukeNeural');
    expect(resolved.source).toBe('locale_default');
    expect(resolved.fallbackGender).toBe('male');
  });
});
