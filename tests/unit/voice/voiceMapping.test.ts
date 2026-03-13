import { resolveSelectedVoiceId } from '@/lib/voice/voiceMapping';

describe('resolveSelectedVoiceId', () => {
  it('prefers the saved provider voice over a stale requested voice', () => {
    const voiceId = resolveSelectedVoiceId({
      language: 'en',
      requestedVoiceId: 'en-ZA-LeahNeural',
      preferenceVoiceId: 'en-ZA-LukeNeural',
      preferenceLanguage: 'en-ZA',
    });

    expect(voiceId).toBe('en-ZA-LukeNeural');
  });
});
