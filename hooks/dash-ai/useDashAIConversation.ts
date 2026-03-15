/**
 * useDashAIConversation — Thread CRUD, switching, new-conversation flow.
 *
 * Extracted from useDashAssistantImpl.ts (Phase 1 refactor).
 * Works with DashAIContext state for `conversation` and `messages`.
 */

import { useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DashMessage, DashConversation, DashAttachment } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import {
  getLastActiveConversationId,
} from '@/services/conversationPersistence';
import type { TutorSession } from '@/hooks/dash-assistant/tutorTypes';
import { normalizeConversationMessages } from './useDashAIMessages';

// ─── Types ──────────────────────────────────────────────────

export interface UseDashAIConversationOptions {
  userId: string | undefined;
  /** Explicit conversation ID to restore (e.g. from route param). */
  conversationId: string | undefined;
  dashInstance: IDashAIAssistant | null;
  // State setters from DashAIContext
  setConversation: React.Dispatch<React.SetStateAction<DashConversation | null>>;
  setMessages: React.Dispatch<React.SetStateAction<DashMessage[]>>;
  setTutorSession: React.Dispatch<React.SetStateAction<TutorSession | null>>;
  showAlert: (config: { title: string; message: string; type?: string; icon?: string; buttons?: any[] }) => void;
  // Snapshot helpers
  persistConversationSnapshot: (conv?: DashConversation | null) => Promise<void>;
  hydrateFromSnapshot: (id: string) => Promise<{ conversation: DashConversation; messages: DashMessage[] } | null>;
}

export interface UseDashAIConversationReturn {
  /** Resolve the current conversation ID from state or DashInstance. */
  resolveActiveConversationId: () => string | null;
  /** Start a brand-new conversation thread. */
  startNewConversation: () => Promise<void>;
  /** Persist conversation ID to AsyncStorage whenever it changes. */
  // (handled internally via useEffect)
}

// ─── Hook ───────────────────────────────────────────────────

export function useDashAIConversation(
  opts: UseDashAIConversationOptions,
): UseDashAIConversationReturn {
  const {
    userId,
    conversationId: explicitConversationId,
    dashInstance,
    setConversation,
    setMessages,
    setTutorSession,
    showAlert,
    persistConversationSnapshot,
    hydrateFromSnapshot,
  } = opts;

  const tutorOverridesRef = useRef<Record<string, string>>({});
  const conversationRef = useRef<DashConversation | null>(null);

  // Keep conversationRef in sync for resolveActiveConversationId
  const updateConversationRef = useCallback((conv: DashConversation | null) => {
    conversationRef.current = conv;
  }, []);

  const resolveActiveConversationId = useCallback((): string | null => {
    if (conversationRef.current?.id) return conversationRef.current.id;
    try {
      const current = dashInstance?.getCurrentConversationId?.();
      if (typeof current === 'string' && current.trim().length > 0) {
        return current;
      }
    } catch { /* noop */ }
    return null;
  }, [dashInstance]);

  const startNewConversation = useCallback(async () => {
    if (!dashInstance) return;
    try {
      const newConvId = await dashInstance.startNewConversation('Chat with Dash');
      const newConv = await dashInstance.getConversation(newConvId);
      if (newConv) {
        conversationRef.current = newConv;
        setConversation(newConv);
        persistConversationSnapshot(newConv).catch(() => {});
        setMessages([]);
        setTutorSession(null);
        tutorOverridesRef.current = {};

        const greeting: DashMessage = {
          id: `greeting_${Date.now()}`,
          type: 'assistant',
          content: dashInstance.getPersonality().greeting,
          timestamp: Date.now(),
        };
        setMessages([greeting]);
      }
    } catch (error) {
      console.error('Failed to start new conversation:', error);
      showAlert({
        title: 'Error',
        message: 'Failed to start new conversation.',
        type: 'error',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    }
  }, [dashInstance, setConversation, setMessages, setTutorSession, showAlert, persistConversationSnapshot]);

  return {
    resolveActiveConversationId,
    startNewConversation,
  };
}
