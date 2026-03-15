/**
 * useDashAIMessages — Message list state, normalization, and persistence.
 *
 * Extracted from useDashAssistantImpl.ts (Phase 1 refactor).
 * Manages the message array, scroll-tracking counters, and
 * conversation-snapshot persistence.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { DashMessage, DashConversation } from '@/services/dash-ai/types';
import {
  normalizeMessagesByTurn,
} from '@/features/dash-assistant/turnOrdering';
import { sanitizeTutorUserContent } from '@/hooks/dash-assistant/assistantHelpers';
import {
  getConversationSnapshot,
  saveConversationSnapshot,
  setLastActiveConversationId,
} from '@/services/conversationPersistence';
import type { PersistedMessage } from '@/services/conversationPersistence';
import { LOCAL_SNAPSHOT_MAX } from './types';

// ─── Helpers (pure functions) ───────────────────────────────

/** Normalize + sanitize tutor content + turn-order dedup. */
export function normalizeConversationMessages(items: DashMessage[]): DashMessage[] {
  const normalized = items.map((msg) => {
    if (msg.type !== 'user') return msg;
    const { content, sanitized } = sanitizeTutorUserContent(msg.content);
    return sanitized ? { ...msg, content } : msg;
  });
  return normalizeMessagesByTurn(normalized);
}

/** Strip large metadata fields before persisting to AsyncStorage. */
export function mapToPersistedMessages(items: DashMessage[]): PersistedMessage[] {
  return items.map((msg) => {
    const meta: PersistedMessage['meta'] = {};
    if (msg.metadata && typeof msg.metadata === 'object') {
      if ('tts' in msg.metadata) meta.tts = (msg.metadata as any).tts;
      if ('ackType' in msg.metadata) meta.ackType = (msg.metadata as any).ackType;
      if ('turn_id' in msg.metadata) meta.turn_id = (msg.metadata as any).turn_id;
    }
    const rawType = msg.type === 'task_result' ? 'assistant' : msg.type;
    const type: PersistedMessage['type'] =
      rawType === 'user' || rawType === 'assistant' || rawType === 'system'
        ? rawType
        : 'assistant';
    return {
      id: msg.id,
      type,
      content: msg.content,
      timestamp: msg.timestamp,
      meta: Object.keys(meta as Record<string, unknown>).length > 0 ? meta : undefined,
    };
  });
}

// ─── Hook ───────────────────────────────────────────────────

interface UseDashAIMessagesOptions {
  userId: string | undefined;
}

/**
 * Provides conversation-snapshot persistence and message normalization helpers.
 * The actual `messages` state lives in DashAIContext, so this hook only exposes
 * utility functions.
 */
export function useDashAIMessages({ userId }: UseDashAIMessagesOptions) {
  const persistConversationSnapshot = useCallback(
    async (conv?: DashConversation | null) => {
      if (!userId || !conv?.id) return;
      const msgs = mapToPersistedMessages(conv.messages || []);
      await saveConversationSnapshot(userId, conv.id, msgs, LOCAL_SNAPSHOT_MAX);
      await setLastActiveConversationId(userId, conv.id);
    },
    [userId],
  );

  /**
   * Hydrate a conversation from the local snapshot (fast cold-start).
   * Returns `null` if no snapshot is found.
   */
  const hydrateFromSnapshot = useCallback(
    async (
      conversationId: string,
    ): Promise<{ conversation: DashConversation; messages: DashMessage[] } | null> => {
      if (!userId) return null;
      const snapshot = await getConversationSnapshot(userId, conversationId);
      if (!snapshot || !Array.isArray(snapshot.messages) || snapshot.messages.length === 0) {
        return null;
      }
      const msgs: DashMessage[] = snapshot.messages.map((m: any) => ({
        id: m.id,
        type: m.type === 'assistant' || m.type === 'user' || m.type === 'system' ? m.type : 'assistant',
        content: m.content || '',
        timestamp: m.timestamp || Date.now(),
        metadata: m.meta,
      }));
      const conv: DashConversation = {
        id: conversationId,
        title: 'Chat with Dash',
        messages: msgs,
        created_at: msgs[0]?.timestamp || Date.now(),
        updated_at: msgs[msgs.length - 1]?.timestamp || Date.now(),
      };
      return { conversation: conv, messages: msgs };
    },
    [userId],
  );

  return {
    normalizeConversationMessages,
    persistConversationSnapshot,
    hydrateFromSnapshot,
  };
}
