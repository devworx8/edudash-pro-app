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
  // Only show mini controls while actively speaking — not after speech ends.
  const showMiniControls = hasAnySpeechContent && input.isSpeaking && !showFullControls;

  return {
    showMiniControls,
    showFullControls,
  };
}
