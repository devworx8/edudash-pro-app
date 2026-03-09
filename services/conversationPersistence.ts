/**
 * Conversation Persistence
 * 
 * Manages local storage of conversation state for instant hydration on app load.
 * Uses AsyncStorage with proper error handling and corruption recovery.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PersistedMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  meta?: {
    tts?: boolean;
    ackType?: 'greet' | 'followup' | 'clarify' | 'confirm' | 'thanks' | 'short';
    turn_id?: string;
  };
}

export interface ConversationSnapshot {
  conversationId: string;
  updatedAt: number;
  messages: PersistedMessage[];
}

export interface SessionState {
  isNewSession: boolean;
  greeted: boolean;
  lastAckType?: string;
  lastUserHash?: string;
  recentPhrases: string[];
  lastActivityAt: number;
}

// Storage key generators (scoped by user ID)
const LAST_ACTIVE_CONVERSATION_KEY = (userId: string) => `dash:last-active:${userId}`;
const CONVERSATION_CACHE_KEY = (userId: string, conversationId: string) => 
  `dash:conv:${userId}:${conversationId}:messages`;
const SESSION_STATE_KEY = (userId: string) => `dash:session:${userId}`;

// Session timeout (30 minutes of inactivity = new session)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Get the last active conversation ID for a user
 */
export async function getLastActiveConversationId(userId: string): Promise<string | null> {
  try {
    const key = LAST_ACTIVE_CONVERSATION_KEY(userId);
    const value = await AsyncStorage.getItem(key);
    return value;
  } catch (error) {
    console.error('[ConversationPersistence] Failed to get last active conversation ID:', error);
    return null;
  }
}

/**
 * Set the last active conversation ID for a user
 */
export async function setLastActiveConversationId(userId: string, conversationId: string): Promise<void> {
  try {
    const key = LAST_ACTIVE_CONVERSATION_KEY(userId);
    await AsyncStorage.setItem(key, conversationId);
  } catch (error) {
    console.error('[ConversationPersistence] Failed to set last active conversation ID:', error);
  }
}

/**
 * Get a conversation snapshot (limited to recent messages)
 */
export async function getConversationSnapshot(
  userId: string,
  conversationId: string,
  limit: number = 100
): Promise<ConversationSnapshot | null> {
  try {
    const key = CONVERSATION_CACHE_KEY(userId, conversationId);
    const value = await AsyncStorage.getItem(key);
    
    if (!value) {
      return null;
    }
    
    const snapshot: ConversationSnapshot = JSON.parse(value);
    
    // Validate structure
    if (!snapshot.conversationId || !Array.isArray(snapshot.messages)) {
      console.warn('[ConversationPersistence] Invalid snapshot structure, clearing');
      await AsyncStorage.removeItem(key);
      return null;
    }
    
    // Return only the last N messages
    return {
      ...snapshot,
      messages: snapshot.messages.slice(-limit),
    };
  } catch (error) {
    console.error('[ConversationPersistence] Failed to get conversation snapshot:', error);
    // Clear corrupted data
    try {
      const key = CONVERSATION_CACHE_KEY(userId, conversationId);
      await AsyncStorage.removeItem(key);
    } catch { /* Intentional: non-fatal */ }
    return null;
  }
}

/**
 * Save a conversation snapshot (pruned to max messages)
 */
export async function saveConversationSnapshot(
  userId: string,
  conversationId: string,
  messages: PersistedMessage[],
  maxMessages: number = 200
): Promise<void> {
  try {
    const key = CONVERSATION_CACHE_KEY(userId, conversationId);
    
    // Prune to last N messages to keep storage size reasonable
    const prunedMessages = messages.slice(-maxMessages);
    
    const snapshot: ConversationSnapshot = {
      conversationId,
      updatedAt: Date.now(),
      messages: prunedMessages,
    };
    
    await AsyncStorage.setItem(key, JSON.stringify(snapshot));
  } catch (error) {
    console.error('[ConversationPersistence] Failed to save conversation snapshot:', error);
  }
}

/**
 * Get session state for smart response coordination
 */
export async function getSessionState(userId: string): Promise<SessionState> {
  try {
    const key = SESSION_STATE_KEY(userId);
    const value = await AsyncStorage.getItem(key);
    
    if (!value) {
      return createDefaultSessionState();
    }
    
    const state: SessionState = JSON.parse(value);
    
    // Check if session has expired (30 minutes of inactivity)
    const now = Date.now();
    const timeSinceLastActivity = now - (state.lastActivityAt || 0);
    
    if (timeSinceLastActivity > SESSION_TIMEOUT_MS) {
      console.log('[ConversationPersistence] Session expired, creating new session');
      return createDefaultSessionState();
    }
    
    return state;
  } catch (error) {
    console.error('[ConversationPersistence] Failed to get session state:', error);
    return createDefaultSessionState();
  }
}

/**
 * Save session state
 */
export async function saveSessionState(userId: string, state: SessionState): Promise<void> {
  try {
    const key = SESSION_STATE_KEY(userId);
    await AsyncStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[ConversationPersistence] Failed to save session state:', error);
  }
}

/**
 * Update last activity timestamp (keep session alive)
 */
export async function updateLastActivity(userId: string): Promise<void> {
  try {
    const state = await getSessionState(userId);
    state.lastActivityAt = Date.now();
    await saveSessionState(userId, state);
  } catch (error) {
    console.error('[ConversationPersistence] Failed to update last activity:', error);
  }
}

/**
 * Reset session state (start fresh conversation)
 */
export async function resetSession(userId: string): Promise<void> {
  try {
    const key = SESSION_STATE_KEY(userId);
    await AsyncStorage.setItem(key, JSON.stringify(createDefaultSessionState()));
  } catch (error) {
    console.error('[ConversationPersistence] Failed to reset session:', error);
  }
}

/**
 * Create default session state
 */
function createDefaultSessionState(): SessionState {
  return {
    isNewSession: true,
    greeted: false,
    lastAckType: undefined,
    lastUserHash: undefined,
    recentPhrases: [],
    lastActivityAt: Date.now(),
  };
}

/**
 * Prune messages array to keep only last N
 */
export function pruneMessages(messages: PersistedMessage[], max: number): PersistedMessage[] {
  if (messages.length <= max) {
    return messages;
  }
  return messages.slice(-max);
}

/**
 * Clear all conversation data for a user (for logout/reset)
 */
export async function clearAllConversationData(userId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const userKeys = keys.filter(key => key.includes(userId));
    await AsyncStorage.multiRemove(userKeys);
    console.log(`[ConversationPersistence] Cleared ${userKeys.length} keys for user ${userId}`);
  } catch (error) {
    console.error('[ConversationPersistence] Failed to clear conversation data:', error);
  }
}
