import { resolveSpeechControlsLayoutState } from '@/features/dash-ai/speechControls';

describe('speechControlsLayout', () => {
  it('shows controls when speech message exists with chunks', () => {
    const state = resolveSpeechControlsLayoutState({
      isSpeaking: false,
      hasSpeechMessage: true,
      chunkCount: 6,
    });

    expect(state.showControls).toBe(true);
  });

  it('shows controls while speaking', () => {
    const state = resolveSpeechControlsLayoutState({
      isSpeaking: true,
      hasSpeechMessage: true,
      chunkCount: 6,
    });

    expect(state.showControls).toBe(true);
  });

  it('hides controls when no speech message', () => {
    const state = resolveSpeechControlsLayoutState({
      isSpeaking: false,
      hasSpeechMessage: false,
      chunkCount: 0,
    });

    expect(state.showControls).toBe(false);
  });
});