/**
 * Message Translation Hook (M6)
 * Translates messages between all 9 app languages via AI proxy.
 * Supports manual translate and auto-translate per-thread.
 * Caches translations in memory.
 */

import { useState, useCallback, useRef } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type SupportedLanguage = 'en' | 'af' | 'zu' | 'st' | 'nso' | 'fr' | 'pt' | 'es' | 'de';

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  af: 'Afrikaans',
  zu: 'isiZulu',
  st: 'Sesotho',
  nso: 'Sepedi',
  fr: 'French',
  pt: 'Portuguese',
  es: 'Spanish',
  de: 'German',
};

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_LABELS) as SupportedLanguage[];

export interface UseMessageTranslationResult {
  translateMessage: (messageId: string, content: string, targetLanguage: SupportedLanguage) => Promise<string>;
  translatedMessages: Map<string, string>;
  translating: Set<string>;
  clearTranslation: (messageId: string) => void;
  autoTranslateMessage: (messageId: string, content: string, preferredLanguage: SupportedLanguage) => void;
}

function buildTranslationCacheKey(messageId: string, language: SupportedLanguage): string {
  return `${messageId}:${language}`;
}

export function useMessageTranslation(): UseMessageTranslationResult {
  const [translatedMessages, setTranslatedMessages] = useState<Map<string, string>>(new Map());
  const [translating, setTranslating] = useState<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());

  const translateMessage = useCallback(
    async (messageId: string, content: string, targetLanguage: SupportedLanguage): Promise<string> => {
      const cacheKey = buildTranslationCacheKey(messageId, targetLanguage);

      const cached = translatedMessages.get(cacheKey);
      if (cached) return cached;

      if (inflightRef.current.has(cacheKey)) return '';

      inflightRef.current.add(cacheKey);
      setTranslating((prev) => new Set(prev).add(messageId));

      try {
        const client = assertSupabase();
        const targetName = LANGUAGE_LABELS[targetLanguage];

        const prompt = [
          `Translate the following message to ${targetName}.`,
          `Only return the translated text, no explanations or formatting.`,
          `If the text is already in ${targetName}, return it unchanged.`,
          '',
          content,
        ].join('\n');

        const { data, error } = await client.functions.invoke('ai-proxy', {
          body: {
            scope: 'parent',
            service_type: 'message_translation',
            payload: {
              prompt,
              context: `You are a translation assistant for a South African educational platform. Translate accurately between ${Object.values(LANGUAGE_LABELS).join(', ')}. Preserve the original tone and meaning. Return only the translation.`,
            },
            stream: false,
            enable_tools: false,
            metadata: { source: 'message_translation', target_language: targetLanguage },
          },
        });

        if (error) {
          logger.warn('useMessageTranslation', `Translation failed: ${error.message}`);
          throw error;
        }

        const translated = typeof data === 'string'
          ? data.trim()
          : (data?.content || data?.choices?.[0]?.message?.content || '').trim();

        if (!translated) {
          throw new Error('Empty translation response');
        }

        setTranslatedMessages((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, translated);
          return next;
        });

        return translated;
      } catch (err) {
        logger.error('useMessageTranslation', 'Translation error:', err);
        throw err;
      } finally {
        setTranslating((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        inflightRef.current.delete(cacheKey);
      }
    },
    [translatedMessages],
  );

  const autoTranslateMessage = useCallback(
    (messageId: string, content: string, preferredLanguage: SupportedLanguage) => {
      const cacheKey = buildTranslationCacheKey(messageId, preferredLanguage);
      if (translatedMessages.has(cacheKey) || inflightRef.current.has(cacheKey)) return;
      translateMessage(messageId, content, preferredLanguage).catch(() => {
        // Silently fail for auto-translate — user can still tap to translate manually
      });
    },
    [translateMessage, translatedMessages],
  );

  const clearTranslation = useCallback((messageId: string) => {
    setTranslatedMessages((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.startsWith(`${messageId}:`)) {
          next.delete(key);
        }
      }
      return next;
    });
  }, []);

  return { translateMessage, translatedMessages, translating, clearTranslation, autoTranslateMessage };
}
