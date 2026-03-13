export const INTERRUPT_RESTART_DELAY_MS = 260;

export interface InterruptRestartState {
  isMuted: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  usingLiveSTT: boolean;
  isSpeaking: boolean;
  ttsIsSpeaking: boolean;
}

export const canAutoRestartAfterInterrupt = (state: InterruptRestartState): boolean => {
  return (
    !state.isProcessing &&
    !state.isRecording &&
    !state.usingLiveSTT &&
    !state.isSpeaking &&
    !state.ttsIsSpeaking
  );
};
