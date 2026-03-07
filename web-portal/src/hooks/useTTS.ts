'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TTSOptions {
  rate?: number; // -50 to +50
  pitch?: number; // -50 to +50
  language?: 'en' | 'af' | 'zu' | 'xh' | 'nso';
  style?: 'friendly' | 'empathetic' | 'professional' | 'cheerful';
  voice?: 'male' | 'female';
}

export interface TTSQuota {
  allowed: boolean;
  remaining: number;
  limit: number;
  tier: 'free' | 'trial' | 'parent_starter' | 'parent_plus' | 'school_starter' | 'school_premium' | 'school_pro' | 'school_enterprise';
}

// TTS Tier Limits (requests per day)
const TTS_LIMITS: Record<string, number> = {
  free: 3,
  trial: 20,
  parent_starter: 50,
  parent_plus: 200,
  school_starter: 100,
  school_premium: 500,
  school_pro: 1000,
  school_enterprise: 5000,
  // Legacy fallbacks
  basic: 50,
  premium: 200,
  school: 1000,
};

const VOICES_BY_LANG: Record<'en' | 'af' | 'zu' | 'xh' | 'nso', { male: string; female: string }> = {
  en: { male: 'en-ZA-LukeNeural', female: 'en-ZA-LeahNeural' },
  af: { male: 'af-ZA-WillemNeural', female: 'af-ZA-AdriNeural' },
  zu: { male: 'zu-ZA-ThembaNeural', female: 'zu-ZA-ThandoNeural' },
  xh: { male: 'xh-ZA-NomalungaNeural', female: 'xh-ZA-NomalungaNeural' },
  nso: { male: 'nso-ZA-DidiNeural', female: 'nso-ZA-DidiNeural' },
};

const normalizeForTTS = (input: string): string => {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};

const getVoiceIdForLanguage = (lang: string, gender: 'male' | 'female' = 'female'): string => {
  const raw = String(lang || 'en').toLowerCase();
  const short: 'en' | 'af' | 'zu' | 'xh' | 'nso' =
    raw.startsWith('af')
      ? 'af'
      : raw.startsWith('zu')
        ? 'zu'
        : raw.startsWith('xh')
          ? 'xh'
          : raw.startsWith('nso') || raw.startsWith('st') || raw.includes('sotho')
            ? 'nso'
            : 'en';
  const voices = VOICES_BY_LANG[short] || VOICES_BY_LANG.en;
  return gender === 'male' ? voices.male : voices.female;
};

const resolveVoiceId = (language: string, voice: 'male' | 'female') => {
  return getVoiceIdForLanguage(language, voice);
};

export function useTTS(userId?: string) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported] = useState(true); // Always supported via Azure
  const [error, setError] = useState<string | null>(null);
  const [languageFallback, setLanguageFallback] = useState<{ requested: string; actual: string } | null>(null);
  const [quota, setQuota] = useState<TTSQuota | null>(null);
  const [userTier, setUserTier] = useState<string>('free');
  const [voicePreference, setVoicePreference] = useState<'male' | 'female'>('female');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supabase = createClient();

  // Fetch user tier and preferences on mount
  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) return;

      try {
        // Get user tier
        const { data: tierData } = await supabase
          .from('user_ai_tiers')
          .select('tier')
          .eq('user_id', userId)
          .single();

        if (tierData) {
          setUserTier(tierData.tier || 'free');
        }

        // Get voice preference from user_metadata
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.voice_preference) {
          setVoicePreference(user.user_metadata.voice_preference);
        }
      } catch (err) {
        console.error('[TTS] Failed to fetch user data:', err);
      }
    };

    fetchUserData();

    // Cleanup on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [userId, supabase]);

  // Check TTS quota
  const checkTTSQuota = useCallback(async (): Promise<TTSQuota> => {
    if (!userId) {
      return { allowed: false, remaining: 0, limit: 0, tier: 'free' };
    }

    try {
      // Get today's TTS usage
      const today = new Date().toISOString().split('T')[0];
      const { data: usageData, error: usageError } = await supabase
        .from('voice_usage_logs')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('service', 'tts')
        .gte('created_at', `${today}T00:00:00Z`)
        .lt('created_at', `${today}T23:59:59Z`);

      if (usageError) throw usageError;

      const usedToday = usageData?.length || 0;
      const limit = TTS_LIMITS[userTier] || TTS_LIMITS.free;
      const remaining = Math.max(0, limit - usedToday);

      const quotaResult: TTSQuota = {
        allowed: remaining > 0,
        remaining,
        limit,
        tier: userTier as TTSQuota['tier'],
      };

      setQuota(quotaResult);
      return quotaResult;
    } catch (err) {
      console.error('[TTS] Quota check failed:', err);
      return { allowed: false, remaining: 0, limit: 0, tier: userTier as TTSQuota['tier'] };
    }
  }, [userId, userTier, supabase]);

  // Detect language from text content
  const detectLanguage = useCallback((text: string): 'en' | 'af' | 'zu' | 'xh' | 'nso' => {
    const t = text.toLowerCase();

    // Xhosa markers
    if (/\b(molo|ndiyabulela|uxolo|ewe|hayi|yintoni|ndiza|umntwana)\b/i.test(t)) return 'xh';
    // Zulu markers
    if (/\b(sawubona|ngiyabonga|ngiyaphila|umfundi|siyakusiza|ufunde|yebo|cha)\b/i.test(t)) return 'zu';
    // Afrikaans markers
    if (/\b(hallo|asseblief|baie|goed|graag|ek|jy|nie|met|van|is|dit)\b/i.test(t)) return 'af';
    // Sepedi markers
    if (/\b(thobela|le\s+kae|ke\s+a\s+leboga|hle|ka\s+kgopelo)\b/i.test(t)) return 'nso';

    return 'en'; // Default to English
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  const speakWithBrowserTTS = useCallback((text: string, options: TTSOptions) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[TTS] Browser TTS not supported');
      return;
    }

    const cleanText = normalizeForTTS(text);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Map Azure rate/pitch to browser TTS (Azure: -50 to +50, Browser: 0.1 to 10 / 0 to 2)
    const browserRate = 1.0 + ((options.rate ?? 0) / 100);
    const browserPitch = 1.0 + ((options.pitch ?? 0) / 100);
    
    utterance.rate = Math.max(0.1, Math.min(10, browserRate));
    utterance.pitch = Math.max(0, Math.min(2, browserPitch));
    utterance.volume = 1.0;

    // Map language codes
    const langMap: Record<string, string> = {
      en: 'en-ZA',
      af: 'af-ZA',
      zu: 'zu-ZA',
      xh: 'xh-ZA',
      nso: 'nso-ZA',
    };
    utterance.lang = langMap[options.language || 'en'] || 'en-US';

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utterance.onerror = (event) => {
      console.error('[TTS] Browser speech error:', event);
      setIsSpeaking(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback(async (text: string, options: TTSOptions = {}) => {
    if (!text) return;

    try {
      // Stop any ongoing speech
      stop();
      setError(null);

      // Check quota for paid feature
      if (userId) {
        const quotaCheck = await checkTTSQuota();
        if (!quotaCheck.allowed) {
          setError(`TTS limit reached (${quotaCheck.limit}/${quotaCheck.tier}). Upgrade for more.`);
          return;
        }
      }

      // Keep one normalization path shared with mobile/super-admin TTS flows.
      const cleanText = normalizeForTTS(text);

      // Auto-detect language if not specified
      const language = options.language || detectLanguage(cleanText);

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Use user's voice preference if not specified in options
      const voiceGender = options.voice || voicePreference;
      const voiceId = resolveVoiceId(language, voiceGender);

      // Call Azure TTS via edge function
      const { data, error: ttsError } = await supabase.functions.invoke('tts-proxy', {
        body: {
          text: cleanText,
          language: language,
          voice_id: voiceId,
          style: options.style || 'friendly',
          rate: options.rate ?? 0,
          pitch: options.pitch ?? 0,
        },
      });

      if (ttsError) {
        console.error('[TTS] Error:', ttsError);
        throw ttsError;
      }

      if (data.fallback === 'device') {
        // Fallback to browser TTS for unsupported languages
        speakWithBrowserTTS(cleanText, options);
        return;
      }

      if (!data.audio_url) {
        throw new Error('No audio URL returned');
      }

      // Detect language fallback from Edge Function
      if (data.language_fallback === true && data.actual_voice) {
        const actualLang = (data.actual_voice as string).split('-')[0] || 'en';
        setLanguageFallback({ requested: language, actual: actualLang });
      } else {
        setLanguageFallback(null);
      }

      // Play audio
      const audio = new Audio(data.audio_url);
      audioRef.current = audio;

      audio.onloadstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
      };

      audio.onplay = () => {
        setIsSpeaking(true);
        setIsPaused(false);
      };

      audio.onended = () => {
        setIsSpeaking(false);
        setIsPaused(false);
      };

      audio.onerror = (e) => {
        console.error('[TTS] Audio playback error:', e);
        setError('Failed to play audio');
        setIsSpeaking(false);
        setIsPaused(false);
      };

      await audio.play();

      // Refresh quota after successful use
      if (userId) {
        setTimeout(() => checkTTSQuota(), 1000);
      }
    } catch (err) {
      console.error('[TTS] Error:', err);
      setError(err instanceof Error ? err.message : 'TTS failed');
      setIsSpeaking(false);
      
      // Fallback to browser TTS on error
      speakWithBrowserTTS(text, options);
    }
  }, [supabase, userId, checkTTSQuota, detectLanguage, voicePreference, stop, speakWithBrowserTTS]);

  const pause = useCallback(() => {
    if (!isSpeaking) return;
    
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPaused(true);
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSpeaking]);

  const resume = useCallback(() => {
    if (!isPaused) return;
    
    if (audioRef.current) {
      audioRef.current.play();
      setIsPaused(false);
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isPaused]);

  // Update voice preference
  const setVoice = useCallback(async (voice: 'male' | 'female') => {
    setVoicePreference(voice);
    
    if (userId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.auth.updateUser({
            data: {
              ...user.user_metadata,
              voice_preference: voice,
            },
          });
        }
      } catch (err) {
        console.error('[TTS] Failed to save voice preference:', err);
      }
    }
  }, [userId, supabase]);

  return {
    speak,
    pause,
    resume,
    stop,
    isSpeaking,
    isPaused,
    isSupported,
    error,
    languageFallback,
    quota,
    userTier,
    voicePreference,
    setVoice,
    checkQuota: checkTTSQuota,
    detectLanguage,
  };
}
