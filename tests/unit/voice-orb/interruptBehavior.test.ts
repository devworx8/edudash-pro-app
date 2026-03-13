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

  it('blocks restart when muted', () => {
    expect(canAutoRestartAfterInterrupt({
      isMuted: true,
      isProcessing: false,
      isRecording: false,
      usingLiveSTT: false,
      isSpeaking: false,
      ttsIsSpeaking: false,
    })).toBe(false);
  });

  it('blocks restart while recording, processing, or live stt is active', () => {
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

  it('allows restart even if isSpeaking/ttsIsSpeaking passed as true (caller gates these)', () => {
    expect(canAutoRestartAfterInterrupt({
      isMuted: false,
      isProcessing: false,
      isRecording: false,
      usingLiveSTT: false,
      isSpeaking: true,
      ttsIsSpeaking: false,
    })).toBe(true);

    expect(canAutoRestartAfterInterrupt({
      isMuted: false,
      isProcessing: false,
      isRecording: false,
      usingLiveSTT: false,
      isSpeaking: false,
      ttsIsSpeaking: true,
    })).toBe(true);
  });
});
