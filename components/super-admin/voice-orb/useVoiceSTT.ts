/**
 * useVoiceSTT Hook
 * 
 * Handles Speech-to-Text via Edge Function.
 * Extracted from VoiceOrb per WARP.md guidelines.
 * 
 * @module components/super-admin/voice-orb/useVoiceSTT
 */

import { useCallback, useState } from 'react';
import { assertSupabase } from '../../../lib/supabase';
import { getCachedToken, invalidateTokenCache, setCachedToken } from '@/lib/voice/sessionTokenCache';

// Azure Speech Services supported South African languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en-ZA', name: 'English (South Africa)', voice: 'en-ZA-LukeNeural' },
  { code: 'af-ZA', name: 'Afrikaans', voice: 'af-ZA-AdriNeural' },
  { code: 'zu-ZA', name: 'isiZulu', voice: 'zu-ZA-ThandoNeural' },
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];
export type TranscribeLanguage = SupportedLanguage | 'auto';

export interface STTResult {
  text: string;
  language: string;
  audio_base64?: string;
  audio_content_type?: string;
}

export interface UseVoiceSTTReturn {
  transcribe: (
    audioUri: string,
    language?: TranscribeLanguage,
    options?: { includeAudioBase64?: boolean }
  ) => Promise<STTResult | null>;
  isTranscribing: boolean;
  error: string | null;
}

export interface UseVoiceSTTOptions {
  preschoolId?: string | null;
}

export function useVoiceSTT(hookOptions: UseVoiceSTTOptions = {}): UseVoiceSTTReturn {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeDetectedLanguage = (input?: string | null): SupportedLanguage | null => {
    if (!input) return null;
    const trimmed = input.trim();
    const direct = SUPPORTED_LANGUAGES.find(lang => lang.code.toLowerCase() === trimmed.toLowerCase());
    if (direct) return direct.code;
    const base = trimmed.split('-')[0].toLowerCase();
    const baseMatch = SUPPORTED_LANGUAGES.find(lang => lang.code.split('-')[0].toLowerCase() === base);
    return baseMatch?.code ?? null;
  };

  const transcribe = useCallback(async (
    audioUri: string, 
    language: TranscribeLanguage = 'auto',
    options?: { includeAudioBase64?: boolean }
  ): Promise<STTResult | null> => {
    setIsTranscribing(true);
    setError(null);
    
    try {
      const supabase = assertSupabase();
      let session: any = null;

      const getAccessToken = async (forceFresh = false): Promise<string> => {
        if (!forceFresh) {
          const cachedToken = getCachedToken();
          if (cachedToken) return cachedToken;
        }

        const { data: { session: freshSession } } = await supabase.auth.getSession();
        session = freshSession;
        if (!freshSession?.access_token) {
          throw new Error('Not authenticated');
        }
        setCachedToken(freshSession.access_token);
        return freshSession.access_token;
      };

      let accessToken = await getAccessToken();

      const resolveTenantId = (): string | null => {
        if (hookOptions?.preschoolId) return hookOptions.preschoolId;
        if (session?.user) {
          const userMeta = (session.user?.user_metadata || {}) as Record<string, any>;
          const appMeta = (session.user?.app_metadata || {}) as Record<string, any>;
          const metaCandidate =
            userMeta.organization_id ||
            userMeta.preschool_id ||
            appMeta.organization_id ||
            appMeta.preschool_id ||
            null;
          if (metaCandidate) return metaCandidate;
        }
        return null;
      };

      const tenantId = resolveTenantId();

      // Read audio file as base64
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const audioContentType = blob.type || 'audio/m4a';
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      const sendRequest = async (lang: TranscribeLanguage, canRetryAuth = true): Promise<{ text?: string; language?: string }> => {
        console.log('[VoiceSTT] Sending to STT, language:', lang, 'size:', base64.length);
        const requestBody = JSON.stringify({
          audio_base64: base64,
          language: lang,
          auto_detect: lang === 'auto',
          format: 'm4a',
          ...(tenantId ? { preschool_id: tenantId, organization_id: tenantId } : {}),
        });
        let sttResponse = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stt-proxy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: requestBody,
          }
        );

        if ((sttResponse.status === 401 || sttResponse.status === 403) && canRetryAuth) {
          invalidateTokenCache();
          accessToken = await getAccessToken(true);
          sttResponse = await fetch(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stt-proxy`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: requestBody,
            }
          );
        }

        if (!sttResponse.ok) {
          const errorText = await sttResponse.text();
          console.error('[VoiceSTT] STT error:', errorText);
          let detail = '';
          try {
            const parsed = JSON.parse(errorText) as { error?: string; message?: string; details?: string };
            detail = String(parsed.error || parsed.message || parsed.details || '').trim();
          } catch {
            detail = '';
          }

          const statusLabel = sttResponse.status === 401 || sttResponse.status === 403
            ? 'not authenticated'
            : sttResponse.status === 400
              ? 'invalid voice request'
              : sttResponse.status >= 500
                ? 'voice service unavailable'
                : 'voice recognition request failed';

          throw new Error(detail ? `${statusLabel}: ${detail}` : `${statusLabel} (${sttResponse.status})`);
        }

        return sttResponse.json();
      };

      let sttData: { text?: string; language?: string };
      try {
        sttData = await sendRequest(language);
      } catch (err) {
        if (language === 'auto') {
          console.warn('[VoiceSTT] Auto-detect failed, retrying with en-ZA...');
          sttData = await sendRequest('en-ZA');
        } else {
          throw err;
        }
      }

      const { text, language: detectedLang } = sttData || {};
      
      if (text && text.trim()) {
        console.log('[VoiceSTT] Transcribed:', text.substring(0, 50) + '...');
        const normalized = normalizeDetectedLanguage(detectedLang) || normalizeDetectedLanguage(language) || 'en-ZA';
        return {
          text,
          language: normalized,
          audio_base64: options?.includeAudioBase64 ? base64 : undefined,
          audio_content_type: options?.includeAudioBase64 ? audioContentType : undefined,
        };
      } else {
        console.log('[VoiceSTT] No speech in audio');
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed';
      console.error('[VoiceSTT] Error:', message);
      setError(message);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [hookOptions.preschoolId]);

  return { transcribe, isTranscribing, error };
}

export default useVoiceSTT;
