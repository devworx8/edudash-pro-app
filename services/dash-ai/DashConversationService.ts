/**
 * DashConversationService
 * 
 * Supabase-backed conversation storage with proper multi-tenant RLS isolation.
 * Replaces AsyncStorage-only approach with server-backed storage.
 * 
 * CRITICAL: All operations MUST filter by preschool_id for tenant isolation.
 */

import { assertSupabase } from '@/lib/supabase';
import type { DashConversation, DashMessage } from './types';

// Lazy getter to avoid accessing supabase at module load time
const getSupabase = () => assertSupabase();

/**
 * Database row structure for ai_conversations table
 */
interface AIConversationRow {
  id: string;
  user_id: string;
  preschool_id: string;
  conversation_id: string;
  title: string;
  messages: DashMessage[];
  created_at: string;
  updated_at: string;
}

/**
 * Convert database row to DashConversation
 */
function rowToConversation(row: AIConversationRow): DashConversation {
  return {
    id: row.conversation_id,
    title: row.title,
    messages: row.messages,
    created_at: new Date(row.created_at).getTime(),
    updated_at: new Date(row.updated_at).getTime(),
  };
}

/**
 * DashConversationService
 * Server-backed conversation operations with RLS enforcement
 */
export class DashConversationService {
  private userId: string;
  private preschoolId: string;

  constructor(userId: string, preschoolId: string) {
    if (!userId || !preschoolId) {
      throw new Error('[DashConversationService] userId and preschoolId are required');
    }
    this.userId = userId;
    this.preschoolId = preschoolId;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    conversationId: string,
    title: string
  ): Promise<DashConversation> {
    try {
      const { data, error } = await getSupabase()
        .from('ai_conversations')
        .insert({
          user_id: this.userId,
          preschool_id: this.preschoolId, // REQUIRED for tenant isolation
          conversation_id: conversationId,
          title,
          messages: [],
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`[DashConversationService] Created conversation: ${conversationId}`);
      return rowToConversation(data);
    } catch (error) {
      console.error('[DashConversationService] Failed to create conversation:', error);
      throw error;
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<DashConversation | null> {
    try {
      const { data, error } = await getSupabase()
        .from('ai_conversations')
        .select('*')
        .eq('user_id', this.userId)
        .eq('preschool_id', this.preschoolId) // REQUIRED for tenant isolation
        .eq('conversation_id', conversationId)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return row ? rowToConversation(row as AIConversationRow) : null;
    } catch (error) {
      console.error('[DashConversationService] Failed to get conversation:', error);
      return null;
    }
  }

  /**
   * Get all conversations for current user and preschool
   */
  async getAllConversations(): Promise<DashConversation[]> {
    try {
      const { data, error } = await getSupabase()
        .from('ai_conversations')
        .select('*')
        .eq('user_id', this.userId)
        .eq('preschool_id', this.preschoolId) // REQUIRED for tenant isolation
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return data ? data.map(rowToConversation) : [];
    } catch (error) {
      console.error('[DashConversationService] Failed to get conversations:', error);
      return [];
    }
  }

  /**
   * Update conversation messages
   */
  async updateConversationMessages(
    conversationId: string,
    messages: DashMessage[]
  ): Promise<void> {
    try {
      const { error } = await getSupabase()
        .from('ai_conversations')
        .update({ messages })
        .eq('user_id', this.userId)
        .eq('preschool_id', this.preschoolId) // REQUIRED for tenant isolation
        .eq('conversation_id', conversationId);

      if (error) throw error;

      console.log(`[DashConversationService] Updated messages for: ${conversationId}`);
    } catch (error) {
      console.error('[DashConversationService] Failed to update messages:', error);
      throw error;
    }
  }

  /**
   * Add message to conversation (atomic operation)
   */
  async addMessageToConversation(
    conversationId: string,
    message: DashMessage
  ): Promise<void> {
    try {
      // Fetch current conversation
      const conversation = await this.getConversation(conversationId);
      
      if (!conversation) {
        console.warn(`[DashConversationService] Conversation not found: ${conversationId}`);
        return;
      }

      // Check for duplicate messages
      const exists = conversation.messages.some((m) => m.id === message.id);
      if (exists) {
        console.log(`[DashConversationService] Message already exists: ${message.id}`);
        return;
      }

      // Append message
      const updatedMessages = [...conversation.messages, message];
      await this.updateConversationMessages(conversationId, updatedMessages);
    } catch (error) {
      console.error('[DashConversationService] Failed to add message:', error);
      throw error;
    }
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(
    conversationId: string,
    title: string
  ): Promise<void> {
    try {
      const { error } = await getSupabase()
        .from('ai_conversations')
        .update({ title })
        .eq('user_id', this.userId)
        .eq('preschool_id', this.preschoolId) // REQUIRED for tenant isolation
        .eq('conversation_id', conversationId);

      if (error) throw error;

      console.log(`[DashConversationService] Updated title for: ${conversationId}`);
    } catch (error) {
      console.error('[DashConversationService] Failed to update title:', error);
      throw error;
    }
  }

  /**
   * Delete conversation
   * RLS enforces auth.uid() = user_id, so preschool_id filter is relaxed
   * to avoid silent 0-row deletes when org IDs drift.
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      // Try exact match first (user + preschool + conversation)
      const { data, error } = await getSupabase()
        .from('ai_conversations')
        .delete()
        .eq('user_id', this.userId)
        .eq('preschool_id', this.preschoolId)
        .eq('conversation_id', conversationId)
        .select('id');

      if (error) throw error;

      // If exact match deleted rows, we're done
      if (data && data.length > 0) {
        console.log(`[DashConversationService] Deleted conversation: ${conversationId}`);
        return;
      }

      // Fallback: delete by user_id + conversation_id only (RLS still enforces ownership)
      const { error: fallbackError } = await getSupabase()
        .from('ai_conversations')
        .delete()
        .eq('user_id', this.userId)
        .eq('conversation_id', conversationId);

      if (fallbackError) throw fallbackError;

      console.log(`[DashConversationService] Deleted conversation (fallback): ${conversationId}`);
    } catch (error) {
      console.error('[DashConversationService] Failed to delete conversation:', error);
      throw error;
    }
  }

  /**
   * Get recent messages (context window)
   */
  async getRecentMessages(
    conversationId: string,
    limit: number = 10
  ): Promise<DashMessage[]> {
    try {
      const conversation = await this.getConversation(conversationId);
      
      if (!conversation || !conversation.messages.length) {
        return [];
      }

      return conversation.messages.slice(-limit);
    } catch (error) {
      console.error('[DashConversationService] Failed to get recent messages:', error);
      return [];
    }
  }

  /**
   * Trim conversation to max messages (storage optimization)
   */
  async trimConversation(
    conversationId: string,
    maxMessages: number
  ): Promise<void> {
    try {
      const conversation = await this.getConversation(conversationId);
      
      if (!conversation || conversation.messages.length <= maxMessages) {
        return;
      }

      const trimmedMessages = conversation.messages.slice(-maxMessages);
      await this.updateConversationMessages(conversationId, trimmedMessages);

      console.log(
        `[DashConversationService] Trimmed conversation to ${maxMessages} messages`
      );
    } catch (error) {
      console.error('[DashConversationService] Failed to trim conversation:', error);
      throw error;
    }
  }

  /**
   * Check if conversation exists
   */
  async conversationExists(conversationId: string): Promise<boolean> {
    try {
      const { data, error } = await getSupabase()
        .from('ai_conversations')
        .select('id')
        .eq('user_id', this.userId)
        .eq('preschool_id', this.preschoolId) // REQUIRED for tenant isolation
        .eq('conversation_id', conversationId)
        .limit(1);

      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    } catch (error) {
      console.error('[DashConversationService] Failed to check conversation existence:', error);
      return false;
    }
  }
}

export default DashConversationService;
