/**
 * Voice Transcription Utilities
 *
 * Helpers for resolving audio payloads before sending to stt-proxy.
 * Extracted to keep useVoiceTranscription under the 200-line WARP limit.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

/** Extract the storage path from a Supabase storage URL (public or signed). */
export function extractStoragePath(url: string, bucket: string): string | null {
  const pattern = new RegExp(
    `/storage/v1/object/(?:public|sign)/${bucket}/(.+?)(?:\\?|$)`,
  );
  const match = url.match(pattern);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Resolve an audio URL into the optimal payload for stt-proxy.
 * Priority: storage_path (fastest) → base64 (universal) → raw URL (last resort).
 */
export async function resolveAudioPayload(
  audioUrl: string,
): Promise<Record<string, unknown>> {
  // Strategy 1: Extract storage_path from Supabase storage URL
  if (SUPABASE_URL && audioUrl.includes('/storage/v1/object/')) {
    const storagePath = extractStoragePath(audioUrl, 'voice-notes');
    if (storagePath) {
      return {
        storage_path: storagePath,
        storage_bucket: 'voice-notes',
        language: 'auto',
        auto_detect: true,
      };
    }
  }

  // Strategy 2: Fetch audio → convert to base64 (works for file://, blob://, any fetchable URL)
  try {
    const response = await fetch(audioUrl);
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return {
      audio_base64: base64,
      audio_content_type: blob.type || 'audio/m4a',
      language: 'auto',
      auto_detect: true,
    };
  } catch {
    // Strategy 3: Pass the raw URL — stt-proxy may still resolve it
    return {
      audio_url: audioUrl,
      language: 'auto',
      auto_detect: true,
    };
  }
}
