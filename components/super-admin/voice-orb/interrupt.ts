/** Delay before restarting listening after the user interrupts TTS.
 *  Must be long enough for the TTS stop to propagate through state. */
export const INTERRUPT_RESTART_DELAY_MS = 600;

export interface InterruptRestartState {
  isMuted: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  usingLiveSTT: boolean;
  isSpeaking: boolean;
  ttsIsSpeaking: boolean;
}

export const canAutoRestartAfterInterrupt = (state: InterruptRestartState): boolean => {
  if (state.isMuted) return false;
  return (
    !state.isProcessing &&
    !state.isRecording &&
    !state.usingLiveSTT
  );
};
