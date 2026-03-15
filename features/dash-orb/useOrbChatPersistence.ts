/**
 * features/dash-orb/useOrbChatPersistence.ts
 *
 * Extracted from DashOrbImpl.tsx — AsyncStorage-backed chat history
 * load/save with debounce, plus conversation memory snapshot.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '@/components/dash-orb/ChatModal';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}

// ─── Hook ───────────────────────────────────────────────────

export function useOrbChatPersistence(
  userId: string | undefined,
  messages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setShowQuickActions: React.Dispatch<React.SetStateAction<boolean>>,
  setMemorySnapshot: React.Dispatch<React.SetStateAction<string>>,
  getMemorySpeakerLabel: (role: ChatMessage['role']) => string,
) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatStorageKey = userId ? `@dash_orb_chat_${userId}` : '@dash_orb_chat_guest';
  const memoryStorageKey = userId ? `@dash_orb_memory_${userId}` : '@dash_orb_memory_guest';

  // ---------- Load history on mount ----------
  useEffect(() => {
    if (!AsyncStorage) return;
    let isMounted = true;
    const loadHistory = async () => {
      try {
        const [storedChat, storedMemory] = await Promise.all([
          AsyncStorage.getItem(chatStorageKey),
          AsyncStorage.getItem(memoryStorageKey),
        ]);

        if (storedMemory && isMounted) {
          try {
            const parsedMemory = JSON.parse(storedMemory) as { summary?: string };
            setMemorySnapshot(typeof parsedMemory?.summary === 'string' ? parsedMemory.summary : '');
          } catch {
            setMemorySnapshot('');
          }
        }

        if (!storedChat) return;
        const parsed = JSON.parse(storedChat) as Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>;
        if (!Array.isArray(parsed)) return;
        const hydrated = parsed.map((msg) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          isLoading: false,
          isStreaming: false,
        })) as ChatMessage[];
        if (isMounted) {
          setMessages(hydrated);
          setShowQuickActions(hydrated.length === 0);
        }
      } catch (err) {
        console.warn('[DashOrb] Failed to load chat history:', err);
      }
    };
    loadHistory();
    return () => { isMounted = false; };
  }, [chatStorageKey, memoryStorageKey, setMemorySnapshot, setMessages, setShowQuickActions]);

  // ---------- Save history (debounced 1200ms) ----------
  useEffect(() => {
    if (!AsyncStorage) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        const serializable = messages
          .filter((msg) => !msg.isLoading && !msg.isStreaming)
          .map((msg) => ({
            ...msg,
            isLoading: false,
            isStreaming: false,
            toolCalls: undefined,
            timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : new Date().toISOString(),
          }));
        await AsyncStorage.setItem(chatStorageKey, JSON.stringify(serializable));
      } catch (err) {
        console.warn('[DashOrb] Failed to save chat history:', err);
      }
    }, 1200);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [messages, chatStorageKey]);

  // ---------- Memory snapshot (last 6 messages, 500 chars) ----------
  useEffect(() => {
    const summary = messages
      .filter((msg) => (msg.role === 'user' || msg.role === 'assistant') && !msg.isLoading)
      .slice(-6)
      .map((msg) => `${getMemorySpeakerLabel(msg.role)}: ${msg.content}`)
      .join(' | ')
      .slice(0, 500);

    setMemorySnapshot((prev) => (prev === summary ? prev : summary));

    if (!AsyncStorage) return;
    const timer = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(memoryStorageKey, JSON.stringify({
          summary,
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        console.warn('[DashOrb] Failed to save conversation memory:', err);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [getMemorySpeakerLabel, messages, memoryStorageKey, setMemorySnapshot]);

  // ---------- Clear chat ----------
  const clearChat = useCallback(async () => {
    if (AsyncStorage) {
      try { await AsyncStorage.removeItem(chatStorageKey); } catch {}
    }
  }, [chatStorageKey]);

  return { chatStorageKey, memoryStorageKey, saveTimerRef, clearChat };
}
