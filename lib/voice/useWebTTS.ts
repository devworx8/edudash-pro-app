/**
 * useWebTTS
 *
 * Web-platform TTS fallback for DashTutorVoiceChatImpl.
 * Uses voiceService.synthesize() → HTML5 Audio for playback.
 * Falls back to window.speechSynthesis if the voice service fails.
 */

import { useCallback, useRef } from 'react';
import { voiceService } from '@/lib/voice/client';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';

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
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speakText = useCallback(async (
    text: string,
    language?: SupportedLanguage,
    _options?: { phonicsMode?: boolean },
  ): Promise<void> => {
    stoppedRef.current = false;
    const lang = language ?? 'en-ZA';

    // ── 1. Try voiceService (our server-side TTS) ─────────────────────
    try {
      const shortLang = (lang.split('-')[0] as 'en' | 'af' | 'zu') ?? 'en';
      const ttsResponse = await voiceService.synthesize({ text, language: shortLang } as any);
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
    } catch {
      // fall through to browser TTS
    }

    // ── 2. Fallback: Web Speech API ───────────────────────────────────
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (stoppedRef.current) return;

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.9;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  return { speakText, stopSpeaking };
}
