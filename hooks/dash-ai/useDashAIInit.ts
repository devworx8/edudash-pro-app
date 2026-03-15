/**
 * hooks/dash-ai/useDashAIInit.ts
 *
 * Initialization logic extracted from useDashAssistantImpl.
 * Lazy-imports DashAICompat, loads/creates conversation, hydrates
 * snapshots, handles ORB session handoff, sends initial message
 * or tutor kickoff, and displays greeting.
 *
 * Runs once on mount (or when conversationId/initialMessage change).
 */

import { useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DashMessage, DashConversation } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import type { TutorSession } from '@/hooks/dash-assistant/tutorTypes';

// ─── Types ──────────────────────────────────────────────────

export interface UseDashAIInitOptions {
  conversationId?: string;
  initialMessage?: string;
  handoffSource?: string;
  externalTutorMode?: string | null;
  tutorConfig?: { subject?: string; grade?: string; topic?: string; difficulty?: number; slowLearner?: boolean } | null;
}

export interface UseDashAIInitDeps {
  user: { id: string } | null;
  profile: { id?: string; role?: string } | null;

  // State setters
  setDashInstance: React.Dispatch<React.SetStateAction<IDashAIAssistant | null>>;
  setConversation: React.Dispatch<React.SetStateAction<DashConversation | null>>;
  setMessages: React.Dispatch<React.SetStateAction<DashMessage[]>>;
  setIsInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  setInputText: (text: string) => void;

  // Helpers
  normalizeConversationMessages: (messages: DashMessage[]) => DashMessage[];
  hydrateFromSnapshot: (convId: string) => Promise<{ conversation: DashConversation; messages: DashMessage[] } | null>;
  persistConversationSnapshot: (conv: DashConversation) => Promise<void>;
  loadChatPrefs: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;

  // Snapshot persistence
  getLastActiveConversationId: (userId: string) => Promise<string | null>;
}

// ─── Hook ───────────────────────────────────────────────────

const INIT_TIMEOUT_MS = 25_000;

export function useDashAIInit(options: UseDashAIInitOptions, deps: UseDashAIInitDeps) {
  const {
    conversationId,
    initialMessage,
    handoffSource,
    externalTutorMode,
    tutorConfig,
  } = options;

  const {
    user,
    profile,
    setDashInstance,
    setConversation,
    setMessages,
    setIsInitialized,
    normalizeConversationMessages,
    hydrateFromSnapshot,
    persistConversationSnapshot,
    loadChatPrefs,
    sendMessage,
    getLastActiveConversationId,
  } = deps;

  const initialMessageSentRef = useRef<string | null>(null);
  const externalTutorKickoffSentRef = useRef(false);

  useEffect(() => {
    const initializeDash = async () => {
      const initBody = async () => {
        const module = await import('@/services/dash-ai/DashAICompat');
        const DashClass = (module as any).DashAIAssistant || (module as any).default;
        const dash: IDashAIAssistant | null = DashClass?.getInstance?.() || null;
        if (!dash) throw new Error('DashAIAssistant unavailable');
        await dash.initialize();
        setDashInstance(dash);

        const preferOrbHandoff = handoffSource === 'orb' || handoffSource === 'dash_voice_orb';
        let hasExistingMessages = false;

        // ── Load conversation ───────────────────────────
        if (conversationId) {
          hasExistingMessages = await loadConversationById(dash, conversationId);
        } else {
          hasExistingMessages = await loadLatestConversation(dash);
        }

        await loadChatPrefs();

        // ── ORB session handoff ─────────────────────────
        let orbMessagesLoaded = false;
        if ((preferOrbHandoff || !hasExistingMessages) && user?.id) {
          orbMessagesLoaded = await tryLoadOrbSession(dash, hasExistingMessages, preferOrbHandoff);
          if (orbMessagesLoaded) hasExistingMessages = true;
        }

        // ── Initial message or greeting ─────────────────
        const trimmedInitialMessage = String(initialMessage || '').trim();
        if (trimmedInitialMessage) {
          if (initialMessageSentRef.current !== trimmedInitialMessage) {
            initialMessageSentRef.current = trimmedInitialMessage;
            sendMessage(trimmedInitialMessage);
          }
        } else if (!hasExistingMessages && !orbMessagesLoaded && externalTutorMode && !externalTutorKickoffSentRef.current) {
          externalTutorKickoffSentRef.current = true;
          sendMessage(buildTutorKickoffPrompt(externalTutorMode, tutorConfig));
        } else if (!hasExistingMessages && !orbMessagesLoaded) {
          const greeting: DashMessage = {
            id: `greeting_${Date.now()}`,
            type: 'assistant',
            content: dash.getPersonality().greeting,
            timestamp: Date.now(),
          };
          setMessages([greeting]);
        }

        setIsInitialized(true);
      };

      try {
        await Promise.race([
          initBody(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Dash initialization timed out')), INIT_TIMEOUT_MS),
          ),
        ]);
      } catch (error) {
        console.error('Failed to initialize Dash:', error);
        setIsInitialized(true);
        setMessages([{
          id: `error_greeting_${Date.now()}`,
          type: 'assistant',
          content: "Hi! I'm having trouble connecting right now. Try sending a message and I'll do my best to help.",
          timestamp: Date.now(),
        }]);
      }
    };

    // ── Inner helpers (closure over deps) ───────────────

    async function loadConversationById(dash: IDashAIAssistant, convId: string): Promise<boolean> {
      let hasMessages = false;
      const snapshot = await hydrateFromSnapshot(convId);
      if (snapshot) {
        hasMessages = snapshot.messages.length > 0;
        setConversation(snapshot.conversation);
        setMessages(normalizeConversationMessages(snapshot.messages));
        dash.setCurrentConversationId(convId);
      }
      const existingConv = await dash.getConversation(convId);
      if (existingConv) {
        hasMessages = (existingConv.messages?.length || 0) > 0;
        setConversation(existingConv);
        setMessages(normalizeConversationMessages(existingConv.messages || []));
        dash.setCurrentConversationId(convId);
        persistConversationSnapshot(existingConv).catch(() => {});
      } else if (snapshot) {
        dash.setCurrentConversationId(convId);
      }
      return hasMessages;
    }

    async function loadLatestConversation(dash: IDashAIAssistant): Promise<boolean> {
      const savedConvId = await AsyncStorage.getItem('@dash_ai_current_conversation_id');
      const lastActiveId = user?.id ? await getLastActiveConversationId(user.id) : null;
      let newConvId = savedConvId || lastActiveId || null;
      let hasMessages = false;

      if (newConvId) {
        const snapshot = await hydrateFromSnapshot(newConvId);
        if (snapshot) {
          hasMessages = snapshot.messages.length > 0;
          setConversation(snapshot.conversation);
          setMessages(normalizeConversationMessages(snapshot.messages));
          dash.setCurrentConversationId(newConvId);
        }
        const existingConv = await dash.getConversation(newConvId);
        if (existingConv) {
          hasMessages = (existingConv.messages?.length || 0) > 0;
          setConversation(existingConv);
          setMessages(normalizeConversationMessages(existingConv.messages || []));
          dash.setCurrentConversationId(newConvId);
          persistConversationSnapshot(existingConv).catch(() => {});
        } else if (!snapshot) {
          newConvId = null;
        } else {
          dash.setCurrentConversationId(newConvId);
        }
      }

      if (!newConvId) {
        try {
          const convs = await dash.getAllConversations();
          if (Array.isArray(convs) && convs.length > 0) {
            const latest = convs.reduce((a: any, b: any) => (a.updated_at > b.updated_at ? a : b));
            hasMessages = (latest.messages?.length || 0) > 0;
            setConversation(latest);
            setMessages(normalizeConversationMessages(latest.messages || []));
            dash.setCurrentConversationId(latest.id);
            persistConversationSnapshot(latest).catch(() => {});
          } else {
            await createFreshConversation(dash);
          }
        } catch {
          await createFreshConversation(dash);
        }
      }

      return hasMessages;
    }

    async function createFreshConversation(dash: IDashAIAssistant) {
      const createdId = await dash.startNewConversation('Chat with Dash');
      const newConv = await dash.getConversation(createdId);
      if (newConv) {
        setConversation(newConv);
        persistConversationSnapshot(newConv).catch(() => {});
      }
    }

    async function tryLoadOrbSession(
      dash: IDashAIAssistant,
      hasExistingMessages: boolean,
      preferOrbHandoff: boolean,
    ): Promise<boolean> {
      try {
        const legacyProfileId = profile?.id && profile.id !== user!.id ? profile.id : null;
        const candidateKeys = [
          `dash:orb-session:${user!.id}`,
          legacyProfileId ? `dash:orb-session:${legacyProfileId}` : null,
          `@dash_orb_chat_${user!.id}`,
          legacyProfileId ? `@dash_orb_chat_${legacyProfileId}` : null,
        ].filter((key): key is string => Boolean(key));

        let orbData: any = null;
        const consumedKeys: string[] = [];
        const ORB_EXPIRY_MS = 2 * 60 * 60 * 1000;

        for (const key of candidateKeys) {
          const raw = await AsyncStorage.getItem(key);
          if (!raw) continue;
          consumedKeys.push(key);
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.messages?.length > 0 && (Date.now() - (parsed.updatedAt || 0)) < ORB_EXPIRY_MS) {
              orbData = parsed;
              break;
            }
            if (Array.isArray(parsed) && parsed.length > 0) {
              const filtered = parsed.filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content);
              if (filtered.length > 0) {
                const lastTs = filtered[filtered.length - 1]?.timestamp;
                const lastTime = lastTs ? new Date(lastTs).getTime() : 0;
                if (lastTime > 0 && (Date.now() - lastTime) < ORB_EXPIRY_MS) {
                  orbData = { messages: filtered.map((m: any) => ({ role: m.role, content: m.content })), updatedAt: lastTime };
                  break;
                }
              }
            }
          } catch {
            // ignore malformed orb payloads
          }
        }

        if (!orbData?.messages?.length) return false;

        const orbMessages: DashMessage[] = orbData.messages.map((m: any, i: number) => ({
          id: `orb_${orbData.conversationId || 'handoff'}_${i}`,
          type: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.content || ''),
          timestamp: (orbData.updatedAt || Date.now()) - ((orbData.messages.length - i) * 1000),
        }));

        if (preferOrbHandoff) {
          try {
            const handoffConversationId = await dash.startNewConversation('Dash Orb Chat');
            dash.setCurrentConversationId?.(handoffConversationId);
            let seededViaSyntheticConversation = false;

            const addMessage = (dash as any).addMessageToConversation;
            if (typeof addMessage === 'function') {
              for (const message of orbMessages) {
                await addMessage.call(dash, handoffConversationId, message);
              }
            } else {
              const nowTs = Date.now();
              const synthesizedConversation: DashConversation = {
                id: handoffConversationId,
                title: 'Dash Orb Chat',
                messages: orbMessages,
                created_at: nowTs,
                updated_at: nowTs,
              };
              setConversation(synthesizedConversation);
              setMessages(normalizeConversationMessages(orbMessages));
              persistConversationSnapshot(synthesizedConversation).catch(() => {});
              seededViaSyntheticConversation = true;
            }

            if (!seededViaSyntheticConversation) {
              const handoffConversation = await dash.getConversation(handoffConversationId);
              if (handoffConversation) {
                setConversation(handoffConversation);
                setMessages(normalizeConversationMessages(handoffConversation.messages || []));
                persistConversationSnapshot(handoffConversation).catch(() => {});
              } else {
                setMessages(orbMessages);
              }
            }
          } catch (handoffErr) {
            console.warn('[useDashAIInit] Orb handoff conversation bootstrap failed:', handoffErr);
            setMessages(orbMessages);
          }
        } else {
          setMessages(orbMessages);
        }

        for (const key of consumedKeys) {
          await AsyncStorage.removeItem(key);
        }
        return true;
      } catch (orbErr) {
        console.warn('[useDashAIInit] Failed to load ORB session:', orbErr);
        return false;
      }
    }

    initializeDash();
  }, [
    conversationId,
    initialMessage,
    handoffSource,
    externalTutorMode,
    tutorConfig,
    loadChatPrefs,
    normalizeConversationMessages,
    hydrateFromSnapshot,
    persistConversationSnapshot,
    profile?.id,
    user?.id,
  ]);
}

// ─── Tutor kickoff prompt builder ───────────────────────────

function buildTutorKickoffPrompt(
  mode: string,
  config?: { subject?: string; grade?: string; topic?: string; difficulty?: number; slowLearner?: boolean } | null,
): string {
  const modeLabel = String(mode || 'diagnostic').toLowerCase();
  const contextParts = [
    config?.grade ? `Grade: ${config.grade}` : null,
    config?.subject ? `Subject: ${config.subject}` : null,
    config?.topic ? `Topic: ${config.topic}` : null,
  ].filter(Boolean);
  const contextBlock = contextParts.length > 0 ? `\n${contextParts.join('\n')}` : '';
  return [
    `Start a ${modeLabel} tutor session for me.${contextBlock}`,
    config?.slowLearner
      ? 'Use slow-learner supportive pacing: one concept at a time, one question at a time, with worked examples and confidence checks.'
      : null,
    'Use Diagnose → Teach → Practice flow.',
    'Ask one question at a time and adapt based on my answer.',
  ].filter(Boolean).join('\n');
}
