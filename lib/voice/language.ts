/**
 * Language Synchronization Service
 * 
 * Unified language selection for Voice Orb across UI, ASR, AI, and TTS.
 * 
 * Architecture:
 * - Single source of truth: voice_preferences table (RLS-protected)
 * - Merges with i18n UI language and ASR-detected language
 * - Provides BCP-47 codes and Azure TTS voice mappings
 * 
 * Usage:
 * ```ts
 * const { data: profile } = useLanguageProfile();
 * // profile.bcp47: 'en-ZA' | 'af-ZA' | 'zu-ZA' | 'xh-ZA' | 'nso-ZA'
 * // profile.azureVoice: 'en-ZA-LeahNeural' | ...
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';

// Lazy getter to avoid accessing supabase at module load time
const getSupabase = () => assertSupabase();

// ==================== TYPES ====================

/**
 * South African language codes (BCP-47)
 */
export type SouthAfricanLanguage = 'en-ZA' | 'af-ZA' | 'zu-ZA' | 'xh-ZA' | 'nso-ZA';

/**
 * Language selection strategy
 */
export type LanguageStrategy = 'explicit' | 'detected' | 'fallback';

/**
 * Language profile for voice session
 */
export interface LanguageProfile {
  bcp47: SouthAfricanLanguage;
  azureVoice: string;
  uiLocale: string;
  strategy: LanguageStrategy;
  gender: 'male' | 'female';
}

/**
 * Voice preference from database
 */
interface VoicePreference {
  language: string;
  voice_id: string;
  speaking_rate: number;
  pitch: number;
  volume: number;
}

// ==================== AZURE VOICE MAPPING ====================

/**
 * Azure TTS Neural Voices for South African languages
 * Reference: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
 */
export const AZURE_VOICE_MAP: Record<SouthAfricanLanguage, { male: string; female: string }> = {
  'en-ZA': { male: 'en-ZA-LukeNeural', female: 'en-ZA-LeahNeural' },
  'af-ZA': { male: 'af-ZA-WillemNeural', female: 'af-ZA-AdriNeural' },
  'zu-ZA': { male: 'zu-ZA-ThembaNeural', female: 'zu-ZA-ThandoNeural' },
  'xh-ZA': { male: 'xh-ZA-LungeloNeural', female: 'xh-ZA-NomalungaNeural' },
  'nso-ZA': { male: 'nso-ZA-OupaNeural', female: 'nso-ZA-DidiNeural' },
};

/**
 * Language display names
 */
export const LANGUAGE_NAMES: Record<SouthAfricanLanguage, string> = {
  'en-ZA': 'English (South Africa)',
  'af-ZA': 'Afrikaans',
  'zu-ZA': 'isiZulu',
  'xh-ZA': 'isiXhosa',
  'nso-ZA': 'Sepedi (Northern Sotho)',
};

// ==================== NORMALIZATION ====================

/**
 * Normalize language code to BCP-47 South African format
 */
export function normalizeToBCP47(code?: string): SouthAfricanLanguage {
  if (!code) return 'en-ZA';
  
  const lower = code.toLowerCase();
  
  if (lower.startsWith('en')) return 'en-ZA';
  if (lower.startsWith('af')) return 'af-ZA';
  if (lower.startsWith('zu')) return 'zu-ZA';
  if (lower.startsWith('xh')) return 'xh-ZA';
  if (lower.startsWith('nso') || lower === 'st' || lower.includes('sotho')) return 'nso-ZA';
  
  // Default fallback
  return 'en-ZA';
}

/**
 * Get Azure voice for language and gender
 */
export function getAzureVoice(bcp47: SouthAfricanLanguage, gender: 'male' | 'female' = 'male'): string {
  return AZURE_VOICE_MAP[bcp47]?.[gender] || AZURE_VOICE_MAP['en-ZA'].male;
}

// ==================== TANSTACK QUERY HOOKS ====================

/**
 * Query key factory
 */
export const languageKeys = {
  all: ['language'] as const,
  profile: () => [...languageKeys.all, 'profile'] as const,
  preferences: () => [...languageKeys.all, 'preferences'] as const,
};

/**
 * Load language profile (merges voice_preferences + i18n + session)
 */
export function useLanguageProfile(detectedLanguage?: string) {
  const { i18n } = useTranslation();
  const { session } = useAuth();
  
  return useQuery({
    queryKey: [...languageKeys.profile(), detectedLanguage, i18n.language],
    queryFn: async (): Promise<LanguageProfile> => {
      let strategy: LanguageStrategy = 'fallback';
      let bcp47: SouthAfricanLanguage = 'en-ZA';
      let gender: 'male' | 'female' = 'female';
      
      try {
        // 1. Try explicit preference from database (RLS-protected)
        if (session?.user?.id) {
          const { data: pref } = await getSupabase()
            .from('voice_preferences')
            .select('language, voice_id')
            .eq('user_id', session.user.id)
            .single();
          
          if (pref?.language) {
            bcp47 = normalizeToBCP47(pref.language);
            strategy = 'explicit';
            
            // Extract gender from voice_id if it contains male/female
            if (pref.voice_id) {
              gender = pref.voice_id.toLowerCase().includes('male') && !pref.voice_id.toLowerCase().includes('female')
                ? 'male'
                : 'female';
            }
            
            if (__DEV__) {
              console.log('[Language] Loaded explicit preference:', { bcp47, voice_id: pref.voice_id, gender });
            }
          }
        }
        
        // 2. Fall back to detected language (from ASR/Whisper)
        if (strategy === 'fallback' && detectedLanguage) {
          bcp47 = normalizeToBCP47(detectedLanguage);
          strategy = 'detected';
          if (__DEV__) {
            console.log('[Language] Using detected language:', bcp47);
          }
        }
        
        // 3. Fall back to UI i18n language
        if (strategy === 'fallback' && i18n.language) {
          bcp47 = normalizeToBCP47(i18n.language);
          if (__DEV__) {
            console.log('[Language] Using UI i18n language:', bcp47);
          }
        }
      } catch (error) {
        console.error('[Language] Failed to load preferences:', error);
        // Continue with fallback
      }
      
      const azureVoice = getAzureVoice(bcp47, gender);
      
      if (__DEV__) {
        console.log('[Language] Final profile:', { bcp47, azureVoice, strategy, gender });
      }
      
      return {
        bcp47,
        azureVoice,
        uiLocale: i18n.language || 'en',
        strategy,
        gender,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Update voice language preference (persists to database)
 */
export function useUpdateLanguagePreference() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  
  return useMutation({
    mutationFn: async ({ language, gender }: { language: SouthAfricanLanguage; gender?: 'male' | 'female' }) => {
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }
      
      const voice_id = getAzureVoice(language, gender || 'male');
      
      const { error } = await getSupabase()
        .from('voice_preferences')
        .upsert({
          user_id: session.user.id,
          language,
          voice_id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });
      
      if (error) throw error;
      
      if (__DEV__) {
        console.log('[Language] Updated preference:', { language, voice_id });
      }
    },
    onSuccess: () => {
      // Invalidate language queries to refetch
      queryClient.invalidateQueries({ queryKey: languageKeys.profile() });
      queryClient.invalidateQueries({ queryKey: languageKeys.preferences() });
    },
  });
}
