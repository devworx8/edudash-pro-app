export interface SpeechControlsLayoutInput {
  isSpeaking: boolean;
  hasSpeechMessage: boolean;
  chunkCount: number;
}

export interface SpeechControlsLayoutState {
  showControls: boolean;
}

export function resolveSpeechControlsLayoutState(
  input: SpeechControlsLayoutInput
): SpeechControlsLayoutState {
  const showControls = input.hasSpeechMessage && input.chunkCount > 0;
  return { showControls };
}
