export interface SpeechControlsLayoutInput {
  isSpeaking: boolean;
  hasSpeechMessage: boolean;
  chunkCount: number;
  expanded: boolean;
}

export interface SpeechControlsLayoutState {
  showMiniControls: boolean;
  showFullControls: boolean;
}

export function resolveSpeechControlsLayoutState(
  input: SpeechControlsLayoutInput
): SpeechControlsLayoutState {
  const hasAnySpeechContent = input.hasSpeechMessage && input.chunkCount > 0;
  const showFullControls = hasAnySpeechContent && (input.isSpeaking || input.expanded);
  // Keep a compact playback affordance visible after speech ends unless the
  // full controls are actively expanded or currently speaking.
  const showMiniControls = hasAnySpeechContent && !showFullControls;

  return {
    showMiniControls,
    showFullControls,
  };
}
