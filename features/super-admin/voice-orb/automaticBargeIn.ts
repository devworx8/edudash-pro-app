interface AutoBargeInStartOptions {
  enableAutomaticBargeInDuringTTS: boolean;
  isMuted: boolean;
  liveTranscriptionEnabled: boolean;
  liveAvailable: boolean;
  isSpeaking: boolean;
  ttsIsSpeaking: boolean;
}

interface AutoBargeInTriggerOptions {
  enableAutomaticBargeInDuringTTS: boolean;
  isMuted: boolean;
  text: string;
  isSpeaking: boolean;
  ttsIsSpeaking: boolean;
  alreadyTriggered: boolean;
  ttsStartedAt: number | null;
  now?: number;
}

const AUTO_BARGE_IN_MIN_TTS_MS = 700;
const AUTO_BARGE_IN_MIN_CHARS = 4;

export function canAutoStartBargeInDuringTTS({
  enableAutomaticBargeInDuringTTS,
  isMuted,
  liveTranscriptionEnabled,
  liveAvailable,
  isSpeaking,
  ttsIsSpeaking,
}: AutoBargeInStartOptions): boolean {
  return (
    enableAutomaticBargeInDuringTTS &&
    !isMuted &&
    liveTranscriptionEnabled &&
    liveAvailable &&
    (isSpeaking || ttsIsSpeaking)
  );
}

export function shouldAutoTriggerBargeIn({
  enableAutomaticBargeInDuringTTS,
  isMuted,
  text,
  isSpeaking,
  ttsIsSpeaking,
  alreadyTriggered,
  ttsStartedAt,
  now = Date.now(),
}: AutoBargeInTriggerOptions): boolean {
  const spoken = String(text || '').trim();
  if (!enableAutomaticBargeInDuringTTS || isMuted || !spoken) return false;
  if (!(isSpeaking || ttsIsSpeaking)) return false;
  if (alreadyTriggered) return false;
  if (ttsStartedAt != null && now - ttsStartedAt < AUTO_BARGE_IN_MIN_TTS_MS) return false;
  return spoken.length >= AUTO_BARGE_IN_MIN_CHARS;
}
