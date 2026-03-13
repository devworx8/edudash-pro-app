import { canAutoRestartAfterInterrupt } from '@/components/super-admin/voice-orb/interrupt';

describe('voice orb interrupt restart behavior', () => {
  it('restarts automatically only when all guardrails are safe', () => {
    expect(canAutoRestartAfterInterrupt({
      isMuted: false,
      isProcessing: false,
      isRecording: false,
      usingLiveSTT: false,
      isSpeaking: false,
      ttsIsSpeaking: false,
    })).toBe(true);
  });

  it('does not treat barge-in mute as a hard stop', () => {
    expect(canAutoRestartAfterInterrupt({
      isMuted: true,
      isProcessing: false,
      isRecording: false,
      usingLiveSTT: false,
      isSpeaking: false,
      ttsIsSpeaking: false,
    })).toBe(true);
  });

  it('blocks restart while speaking, recording, processing, or live stt is active', () => {
    expect(canAutoRestartAfterInterrupt({
      isMuted: false,
      isProcessing: false,
      isRecording: true,
      usingLiveSTT: false,
      isSpeaking: false,
      ttsIsSpeaking: false,
    })).toBe(false);

    expect(canAutoRestartAfterInterrupt({
      isMuted: false,
      isProcessing: false,
      isRecording: false,
      usingLiveSTT: false,
      isSpeaking: true,
      ttsIsSpeaking: false,
    })).toBe(false);

    expect(canAutoRestartAfterInterrupt({
      isMuted: false,
      isProcessing: true,
      isRecording: false,
      usingLiveSTT: false,
      isSpeaking: false,
      ttsIsSpeaking: false,
    })).toBe(false);

    expect(canAutoRestartAfterInterrupt({
      isMuted: false,
      isProcessing: false,
      isRecording: false,
      usingLiveSTT: true,
      isSpeaking: false,
      ttsIsSpeaking: false,
    })).toBe(false);
  });
});
