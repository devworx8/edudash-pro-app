/**
 * Maps raw voice error messages to user-friendly banner text.
 * Pure function — no hooks or side effects.
 */
export function mapVoiceError(message: string): string | null {
  const n = String(message || '').toLowerCase();
  if (!n) return null;
  if (n.includes('network_retrying'))
    return 'I lost connection for a moment. Retrying listening now...';
  if (n.includes('phonics') && n.includes('cloud tts'))
    return 'Phonics voice needs Azure cloud TTS. It is currently unavailable, so letter sounds may fail.';
  if (n.includes('service_unconfigured') || n.includes('502'))
    return 'Azure voice is unavailable right now. Check tts-proxy Azure secrets/config.';
  if (n.includes('voice service unavailable') || n.includes('500') || n.includes('503'))
    return 'Voice service is temporarily unavailable. Please try again.';
  if (n.includes('not authenticated') || n.includes('401') || n.includes('403'))
    return 'Session expired. Please sign in again.';
  if (n.includes('not available') || n.includes('permission denied'))
    return 'Microphone or voice recognition not available on this device.';
  if (
    n.includes('network request failed') ||
    n.includes('err_internet') ||
    n.includes('no internet')
  )
    return 'Voice recognition needs a stable connection. Check internet and try again.';
  if (n.includes('timeout'))
    return 'Voice request timed out. This usually resolves itself — please try again.';
  return 'Voice encountered an error. Please try again.';
}
