/**
 * useWebTTS
 *
 * Web-platform TTS for DashTutorVoiceChat.
 * Uses voiceService.synthesize() → HTML5 Audio for playback.
 * Retries Azure TTS on transient errors. Browser speechSynthesis is NOT
 * used as a fallback — the robotic device voice degrades the experience.
 */

import { useCallback, useRef } from 'react';
import { voiceService } from '@/lib/voice/client';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';

const AZURE_VOICES: Record<string, string> = {
  'en': 'en-ZA-LukeNeural',
  'en-ZA': 'en-ZA-LukeNeural',
  'af': 'af-ZA-AdriNeural',
  'af-ZA': 'af-ZA-AdriNeural',
  'zu': 'zu-ZA-ThandoNeural',
  'zu-ZA': 'zu-ZA-ThandoNeural',
  'xh': 'xh-ZA-YaandeNeural',
  'xh-ZA': 'xh-ZA-YaandeNeural',
  'nso': 'en-ZA-LukeNeural',
};

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 400;

const isRetryableError = (err: unknown): boolean => {
  const msg = String(err instanceof Error ? err.message : err || '').toLowerCase();
  return msg.includes('429') || msg.includes('network') || msg.includes('timeout') ||
    msg.includes('503') || msg.includes('502') || msg.includes('504');
};

export function useWebTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stoppedRef = useRef(false);

  const stopSpeaking = useCallback(async () => {
    stoppedRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const speakText = useCallback(async (
    text: string,
    language?: SupportedLanguage,
    _options?: { phonicsMode?: boolean },
  ): Promise<void> => {
    stoppedRef.current = false;
    const lang = language ?? 'en-ZA';
    const shortLang = (lang.split('-')[0] as 'en' | 'af' | 'zu' | 'xh' | 'nso') ?? 'en';

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      if (stoppedRef.current) return;
      try {
        const voiceId = AZURE_VOICES[lang] || AZURE_VOICES[shortLang];
        const ttsResponse = await voiceService.synthesize({
          text,
          language: shortLang,
          voice_id: voiceId,
        } as any);

        if (ttsResponse?.audio_url && !stoppedRef.current) {
          await new Promise<void>((resolve, reject) => {
            const audio = new Audio(ttsResponse.audio_url);
            audioRef.current = audio;
            audio.onended = () => { audioRef.current = null; resolve(); };
            audio.onerror = () => { audioRef.current = null; reject(new Error('audio playback error')); };
            audio.play().catch(reject);
          });
          return;
        }
      } catch (err) {
        lastError = err;
        if (!isRetryableError(err) || attempt === MAX_RETRIES) break;
        await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(1.5, attempt)));
      }
    }

    if (lastError) {
      console.error('[useWebTTS] Azure TTS failed after retries:', lastError);
    }
  }, []);

  return { speakText, stopSpeaking };
}