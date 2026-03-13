import {
  canAutoStartBargeInDuringTTS,
  shouldAutoTriggerBargeIn,
} from '@/features/super-admin/voice-orb/automaticBargeIn';

describe('automaticBargeIn', () => {
  it('blocks automatic barge-in start when disabled for the surface', () => {
    expect(
      canAutoStartBargeInDuringTTS({
        enableAutomaticBargeInDuringTTS: false,
        isMuted: false,
        liveTranscriptionEnabled: true,
        liveAvailable: true,
        isSpeaking: false,
        ttsIsSpeaking: true,
      })
    ).toBe(false);
  });

  it('allows automatic barge-in start only when live monitoring is available during TTS', () => {
    expect(
      canAutoStartBargeInDuringTTS({
        enableAutomaticBargeInDuringTTS: true,
        isMuted: false,
        liveTranscriptionEnabled: true,
        liveAvailable: true,
        isSpeaking: false,
        ttsIsSpeaking: true,
      })
    ).toBe(true);

    expect(
      canAutoStartBargeInDuringTTS({
        enableAutomaticBargeInDuringTTS: true,
        isMuted: true,
        liveTranscriptionEnabled: true,
        liveAvailable: true,
        isSpeaking: false,
        ttsIsSpeaking: true,
      })
    ).toBe(false);
  });

  it('prevents self-interruption when automatic barge-in is disabled', () => {
    expect(
      shouldAutoTriggerBargeIn({
        enableAutomaticBargeInDuringTTS: false,
        isMuted: false,
        text: 'hello there',
        isSpeaking: false,
        ttsIsSpeaking: true,
        alreadyTriggered: false,
        ttsStartedAt: 1_000,
        now: 2_000,
      })
    ).toBe(false);
  });

  it('requires enough spoken text and elapsed TTS time before auto barge-in', () => {
    expect(
      shouldAutoTriggerBargeIn({
        enableAutomaticBargeInDuringTTS: true,
        isMuted: false,
        text: 'hey',
        isSpeaking: false,
        ttsIsSpeaking: true,
        alreadyTriggered: false,
        ttsStartedAt: 1_000,
        now: 2_000,
      })
    ).toBe(false);

    expect(
      shouldAutoTriggerBargeIn({
        enableAutomaticBargeInDuringTTS: true,
        isMuted: false,
        text: 'hello there',
        isSpeaking: false,
        ttsIsSpeaking: true,
        alreadyTriggered: false,
        ttsStartedAt: 1_500,
        now: 2_000,
      })
    ).toBe(false);

    expect(
      shouldAutoTriggerBargeIn({
        enableAutomaticBargeInDuringTTS: true,
        isMuted: false,
        text: 'hello there',
        isSpeaking: false,
        ttsIsSpeaking: true,
        alreadyTriggered: false,
        ttsStartedAt: 1_000,
        now: 2_000,
      })
    ).toBe(true);
  });
});
