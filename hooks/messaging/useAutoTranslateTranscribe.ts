/**
 * useAutoTranslateTranscribe — Wires auto-translation and auto-transcription
 * for incoming messages in a message thread.
 *
 * Reads the per-thread auto_translate setting from message_participants.
 * Exposes getTranslation / getTranscription for use in renderRow.
 */

import { useState, useEffect, useCallback } from 'react';
import { useMessageTranslation, type SupportedLanguage } from '@/hooks/messaging/useMessageTranslation';
import { useVoiceTranscription } from '@/hooks/messaging/useVoiceTranscription';
import { logger } from '@/lib/logger';

let assertSupabase: () => any;
try { assertSupabase = require('@/lib/supabase').assertSupabase; } catch { assertSupabase = () => { throw new Error('Supabase unavailable'); }; }

/** Minimal message shape — avoids coupling to any specific Message type */
interface MessageLike {
  id: string;
  sender_id: string;
  content: string;
  content_type?: string;
  voice_url?: string;
}

interface UseAutoTranslateTranscribeProps {
  threadId: string;
  userId: string | undefined;
  preferredLanguage?: SupportedLanguage;
  messages: MessageLike[];
}

export function useAutoTranslateTranscribe({
  threadId,
  userId,
  preferredLanguage = 'en',
  messages,
}: UseAutoTranslateTranscribeProps) {
  const translation = useMessageTranslation();
  const transcription = useVoiceTranscription();
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(false);
  const [showTranslationMap, setShowTranslationMap] = useState<Map<string, boolean>>(new Map());

  // Load auto_translate preference from message_participants
  useEffect(() => {
    if (!threadId || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const client = assertSupabase();
        const { data } = await client
          .from('message_participants')
          .select('auto_translate')
          .eq('thread_id', threadId)
          .eq('user_id', userId)
          .single();
        if (!cancelled && data) {
          setAutoTranslateEnabled(!!data.auto_translate);
        }
      } catch {
        // auto_translate column may not exist yet
      }
    })();
    return () => { cancelled = true; };
  }, [threadId, userId]);

  // Auto-translate incoming text messages when enabled
  useEffect(() => {
    if (!autoTranslateEnabled || !userId) return;
    for (const msg of messages) {
      if (msg.sender_id === userId) continue;
      if (msg.content_type && msg.content_type !== 'text') continue;
      if (!msg.content || msg.content.length < 3) continue;
      translation.autoTranslateMessage(msg.id, msg.content, preferredLanguage);
    }
  }, [autoTranslateEnabled, messages, userId, preferredLanguage, translation.autoTranslateMessage]);

  // Auto-transcribe incoming voice messages
  useEffect(() => {
    if (!userId) return;
    for (const msg of messages) {
      if (msg.sender_id === userId) continue;
      if (msg.content_type !== 'voice' && !msg.voice_url) continue;
      const audioUrl = msg.voice_url || msg.content;
      if (audioUrl) transcription.autoTranscribeVoice(audioUrl, msg.id);
    }
  }, [messages, userId, transcription.autoTranscribeVoice]);

  const toggleAutoTranslate = useCallback(async () => {
    const newValue = !autoTranslateEnabled;
    setAutoTranslateEnabled(newValue);
    try {
      const client = assertSupabase();
      await client
        .from('message_participants')
        .update({ auto_translate: newValue })
        .eq('thread_id', threadId)
        .eq('user_id', userId);
    } catch (err) {
      logger.warn('useAutoTranslateTranscribe', 'Failed to persist auto_translate:', err);
      setAutoTranslateEnabled(!newValue); // revert
    }
  }, [autoTranslateEnabled, threadId, userId]);

  const getTranslation = useCallback(
    (messageId: string): string | undefined => {
      return translation.translatedMessages.get(`${messageId}:${preferredLanguage}`);
    },
    [translation.translatedMessages, preferredLanguage],
  );

  const isTranslating = useCallback(
    (messageId: string): boolean => translation.translating.has(messageId),
    [translation.translating],
  );

  const toggleShowTranslation = useCallback((messageId: string) => {
    setShowTranslationMap((prev) => {
      const next = new Map(prev);
      next.set(messageId, !prev.get(messageId));
      return next;
    });
  }, []);

  const isShowingTranslation = useCallback(
    (messageId: string): boolean => showTranslationMap.get(messageId) ?? autoTranslateEnabled,
    [showTranslationMap, autoTranslateEnabled],
  );

  const getTranscription = useCallback(
    (messageId: string): string | undefined => transcription.transcriptions.get(messageId),
    [transcription.transcriptions],
  );

  const isTranscribing = useCallback(
    (messageId: string): boolean => transcription.transcribing.has(messageId),
    [transcription.transcribing],
  );

  const manualTranscribe = useCallback(
    (audioUrl: string, messageId: string) => {
      transcription.transcribeVoice(audioUrl, messageId).catch(() => {});
    },
    [transcription.transcribeVoice],
  );

  const manualTranslate = useCallback(
    (messageId: string, content: string) => {
      translation.translateMessage(messageId, content, preferredLanguage).catch(() => {});
    },
    [translation.translateMessage, preferredLanguage],
  );

  return {
    autoTranslateEnabled,
    toggleAutoTranslate,
    getTranslation,
    isTranslating,
    toggleShowTranslation,
    isShowingTranslation,
    getTranscription,
    isTranscribing,
    manualTranscribe,
    manualTranslate,
  };
}
