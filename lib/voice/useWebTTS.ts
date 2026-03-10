/**
 * useWebTTS
 *
 * Web-platform TTS for DashTutorVoiceChat.
 * Uses voiceService.synthesize() → HTML5 Audio for playback.
 * Falls back to window.speechSynthesis with proper language voice selection.
 */

import { useCallback, useRef, useEffect } from 'react';
import { voiceService } from '@/lib/voice/client';
import type { SupportedLanguage } from '@/components/super-admin/voice-orb/useVoiceSTT';

// Language to locale mapping for proper TTS
const LANG_TO_LOCALE: Record<string, string> = {
  'en': 'en-ZA',
  'en-ZA': 'en-ZA',
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  'af': 'af-ZA',
  'af-ZA': 'af-ZA',
  'zu': 'zu-ZA',
  'zu-ZA': 'zu-ZA',
  'xh': 'xh-ZA',
  'xh-ZA': 'xh-ZA',
  'nso': 'nso-ZA',
};

// Azure voice mapping for each language
const AZURE_VOICES: Record<string, string> = {
  'en': 'en-ZA-LukeNeural',
  'en-ZA': 'en-ZA-LukeNeural',
  'af': 'af-ZA-AdriNeural',
  'af-ZA': 'af-ZA-AdriNeural',
  'zu': 'zu-ZA-ThandoNeural',
  'zu-ZA': 'zu-ZA-ThandoNeural',
  'xh': 'xh-ZA-YaandeNeural',
  'xh-ZA': 'xh-ZA-YaandeNeural',
  'nso': 'en-ZA-LukeNeural', // Fallback to English for Sepedi
};

export function useWebTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stoppedRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Load voices on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Find the best voice for a given language
  const findBestVoice = useCallback((langCode: string): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current;
    if (!voices.length) return null;

    const locale = LANG_TO_LOCALE[langCode] || langCode;
    const shortLang = locale.split('-')[0];

    // Try exact locale match first
    let voice = voices.find(v => v.lang === locale);
    if (voice) return voice;

    // Try language prefix match (e.g., 'af' for 'af-ZA')
    voice = voices.find(v => v.lang.startsWith(shortLang));
    if (voice) return voice;

    // For Afrikaans specifically, try to find any Afrikaans voice
    if (shortLang === 'af') {
      voice = voices.find(v => 
        v.lang.toLowerCase().includes('afrikaans') || 
        v.lang.toLowerCase().includes('af') ||
        v.name.toLowerCase().includes('afrikaans')
      );
      if (voice) return voice;
    }

    return null;
  }, []);

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
    const shortLang = (lang.split('-')[0] as 'en' | 'af' | 'zu' | 'xh' | 'nso') ?? 'en';
    const locale = LANG_TO_LOCALE[lang] || lang;

    // Try voiceService (Azure TTS via our backend)
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
      console.warn('[useWebTTS] Azure TTS failed, falling back to browser TTS:', err);
    }

    // Fallback: Web Speech API with proper voice selection
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (stoppedRef.current) return;

    // Ensure voices are loaded
    if (!voicesRef.current.length) {
      voicesRef.current = window.speechSynthesis.getVoices();
    }

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      
      // Find the best voice for this language
      const bestVoice = findBestVoice(lang);
      if (bestVoice) {
        utterance.voice = bestVoice;
        console.log(`[useWebTTS] Using voice: ${bestVoice.name} (${bestVoice.lang})`);
      } else {
        console.warn(`[useWebTTS] No voice found for ${locale}, using default`);
      }
      
      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        console.warn('[useWebTTS] Speech error:', e);
        resolve();
      };
      
      // Cancel any ongoing speech before starting new
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }, [findBestVoice]);

  return { speakText, stopSpeaking };
}