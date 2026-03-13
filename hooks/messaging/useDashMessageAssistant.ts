/**
 * Dash AI Message Assistant Hook (M11)
 *
 * Provides AI-powered message improvement actions for the chat composer.
 * Uses the existing ai-proxy edge function to rewrite messages based on
 * context (recipient role, desired tone, etc.).
 */

import { useState, useCallback, useRef } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type AssistAction =
  | 'improve_tone'
  | 'make_formal'
  | 'make_friendly'
  | 'translate'
  | 'grammar_check'
  | 'shorten';

const ACTION_PROMPTS: Record<Exclude<AssistAction, 'translate'>, string> = {
  improve_tone:
    'Rewrite this message to be clear and professional for a school context. Keep it concise.',
  make_formal:
    'Rewrite this message in a formal, respectful tone suitable for a principal or school administrator.',
  make_friendly:
    'Rewrite this message in a warm, friendly, and encouraging tone suitable for a parent or guardian.',
  grammar_check:
    'Fix all grammar, spelling, and punctuation errors in this message. Keep the original tone and meaning intact.',
  shorten:
    'Make this message concise while preserving its meaning. Remove filler words and unnecessary repetition.',
};

const SYSTEM_CONTEXT =
  'You are a writing assistant for a South African educational platform (EduDash Pro). ' +
  'Return ONLY the rewritten message text — no explanations, labels, or formatting.';

interface UseDashMessageAssistantReturn {
  assistMessage: (
    text: string,
    action: AssistAction,
    context?: { recipientRole?: string },
  ) => Promise<string>;
  isProcessing: boolean;
}

export function useDashMessageAssistant(): UseDashMessageAssistantReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const assistMessage = useCallback(
    async (
      text: string,
      action: AssistAction,
      context?: { recipientRole?: string },
    ): Promise<string> => {
      if (!text.trim()) return text;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsProcessing(true);

      try {
        const client = assertSupabase();

        if (action === 'translate') {
          const prompt = [
            'Translate this message to the most likely other language used in South African schools.',
            'If the text is English, translate to Afrikaans. If Afrikaans or isiZulu, translate to English.',
            'Return only the translation.',
            '',
            text,
          ].join('\n');

          const { data, error } = await client.functions.invoke('ai-proxy', {
            body: {
              scope: 'parent',
              service_type: 'lesson_generation',
              payload: { prompt, context: SYSTEM_CONTEXT },
              stream: false,
              enable_tools: false,
              metadata: { source: 'dash_message_assistant', action },
            },
          });

          if (error) throw error;
          return extractText(data);
        }

        const actionPrompt = ACTION_PROMPTS[action];
        const roleHint = context?.recipientRole
          ? ` The intended audience is ${context.recipientRole}.`
          : '';

        const prompt = `${actionPrompt}${roleHint}\n\n${text}`;

        const { data, error } = await client.functions.invoke('ai-proxy', {
          body: {
            scope: 'parent',
            service_type: 'lesson_generation',
            payload: { prompt, context: SYSTEM_CONTEXT },
            stream: false,
            enable_tools: false,
            metadata: { source: 'dash_message_assistant', action },
          },
        });

        if (error) throw error;
        return extractText(data);
      } catch (err) {
        logger.error('useDashMessageAssistant', 'Assist failed:', err);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  return { assistMessage, isProcessing };
}

function extractText(data: unknown): string {
  if (typeof data === 'string') return data.trim();
  const obj = data as Record<string, unknown> | null;
  const content =
    (obj?.content as string) ||
    ((obj?.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message
      ?.content as string) ||
    '';
  const result = content.trim();
  if (!result) throw new Error('Empty AI response');
  return result;
}
