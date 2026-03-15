/**
 * DashAIConversationFacade
 * 
 * Facade for conversation and message management.
 * Delegates to DashConversationManager.
 */

import { DashConversationManager } from '../DashConversationManager';
import type { DashMessage, DashConversation } from '../types';
import { 
  getConversationSnapshot,
  saveConversationSnapshot,
  setLastActiveConversationId,
  getLastActiveConversationId,
  deleteConversationSnapshot,
} from '@/services/conversationPersistence';

export class DashAIConversationFacade {
  private tempConversationId: string | null = null;
  private tempMessages = new Map<string, DashMessage[]>();
  private userId?: string;
  
  constructor(private conversationManager: DashConversationManager | null, userId?: string) {
    this.userId = userId;
  }

  private async loadTempMessages(conversationId: string): Promise<DashMessage[]> {
    const cached = this.tempMessages.get(conversationId);
    if (cached) return cached;
    if (!this.userId) return [];

    const snapshot = await getConversationSnapshot(this.userId, conversationId, 200);
    if (!snapshot?.messages?.length) return [];
    const messages = snapshot.messages.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      timestamp: m.timestamp,
      ...(m.meta ? { metadata: { ...(m.meta as any) } } : {}),
    } as DashMessage));
    this.tempMessages.set(conversationId, messages);
    return messages;
  }

  private async persistTempMessages(conversationId: string, messages: DashMessage[]): Promise<void> {
    if (!this.userId) return;
    await saveConversationSnapshot(
      this.userId,
      conversationId,
      messages.map((m) => ({
        id: m.id,
        type: m.type as any,
        content: m.content,
        timestamp: m.timestamp,
      })),
      200
    );
    await setLastActiveConversationId(this.userId, conversationId);
  }

  /**
   * Start new conversation
   * For users without organizations, creates a temporary in-memory conversation
   */
  public async startNewConversation(title?: string): Promise<string> {
    if (!this.conversationManager) {
      // User doesn't have organization - create temporary conversation ID
      // This allows DashAI to work but conversations won't persist
      const tempId = `temp_conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.tempConversationId = tempId;
      this.tempMessages.set(tempId, []);
      if (this.userId) {
        await this.persistTempMessages(tempId, []);
      }
      console.log('[DashAIConversationFacade] Created temporary conversation (no organization):', tempId);
      return tempId;
    }
    return this.conversationManager.startNewConversation(title);
  }

  /**
   * Get conversation by ID
   * For users without organizations, returns a temporary in-memory conversation
   */
  public async getConversation(conversationId: string): Promise<DashConversation | null> {
    if (!this.conversationManager) {
      // Return temporary conversation for users without organization
      if (conversationId.startsWith('temp_conv_')) {
        const messages = await this.loadTempMessages(conversationId);
        const createdAt = messages.length > 0 ? Math.min(...messages.map(m => m.timestamp)) : Date.now();
        const updatedAt = messages.length > 0 ? Math.max(...messages.map(m => m.timestamp)) : Date.now();
        if (!this.tempConversationId) {
          this.tempConversationId = conversationId;
        }
        return {
          id: conversationId,
          title: 'Dash AI Chat',
          messages,
          created_at: createdAt,
          updated_at: updatedAt,
        };
      }
      console.warn('[DashAIConversationFacade] Conversation manager not initialized');
      return null;
    }
    return this.conversationManager.getConversation(conversationId);
  }

  /**
   * Get all conversations
   */
  public async getAllConversations(): Promise<DashConversation[]> {
    if (!this.conversationManager) {
      const ids = new Set<string>();
      if (this.tempConversationId) ids.add(this.tempConversationId);
      if (this.userId) {
        const lastActive = await getLastActiveConversationId(this.userId);
        if (lastActive) ids.add(lastActive);
      }
      if (ids.size === 0) {
        console.warn('[DashAIConversationFacade] Conversation manager not initialized');
        return [];
      }
      const convs = await Promise.all(Array.from(ids).map((id) => this.getConversation(id)));
      return convs.filter(Boolean) as DashConversation[];
    }
    return this.conversationManager.getAllConversations();
  }

  /**
   * Delete conversation
   */
  public async deleteConversation(conversationId: string): Promise<void> {
    if (!this.conversationManager) {
      // Standalone user — delete from local persistence
      if (this.userId) {
        await deleteConversationSnapshot(this.userId, conversationId);
      }
      this.tempMessages.delete(conversationId);
      if (this.tempConversationId === conversationId) {
        this.tempConversationId = null;
      }
      return;
    }
    return this.conversationManager.deleteConversation(conversationId);
  }

  /**
   * Get current conversation ID
   */
  public getCurrentConversationId(): string | null {
    if (!this.conversationManager) {
      // Return temporary conversation ID for users without organization
      return this.tempConversationId;
    }
    return this.conversationManager.getCurrentConversationId();
  }

  /**
   * Set current conversation ID
   */
  public setCurrentConversationId(conversationId: string): void {
    if (!this.conversationManager) {
      // Store temporary conversation ID for users without organization
      this.tempConversationId = conversationId;
      if (this.userId) {
        setLastActiveConversationId(this.userId, conversationId).catch(() => {});
      }
      return;
    }
    this.conversationManager.setCurrentConversationId(conversationId);
  }

  /**
   * Add message to conversation
   */
  public async addMessageToConversation(
    conversationId: string,
    message: DashMessage
  ): Promise<void> {
    if (!this.conversationManager) {
      // For temporary conversations (no organization), messages are only kept in memory
      // They won't persist but DashAI can still function
      const existing = await this.loadTempMessages(conversationId);
      if (existing.some((m) => m.id === message.id)) {
        return;
      }
      const updated = [...existing, message];
      this.tempMessages.set(conversationId, updated);
      if (!this.tempConversationId) this.tempConversationId = conversationId;
      await this.persistTempMessages(conversationId, updated);
      console.debug('[DashAIConversationFacade] Message added to temporary conversation (local persisted)');
      return;
    }
    return this.conversationManager.addMessageToConversation(conversationId, message);
  }

  /**
   * Export conversation as text
   */
  public async exportConversation(conversationId: string): Promise<string> {
    if (!this.conversationManager) {
      const messages = await this.loadTempMessages(conversationId);
      if (!messages.length) {
        console.warn('[DashAIConversationFacade] Cannot export empty temporary conversation');
        return 'Conversation history not available (no local messages found).';
      }
      let exportText = `Dash AI Assistant Conversation\n`;
      exportText += `Title: Dash AI Chat\n`;
      exportText += `Date: ${new Date(messages[0].timestamp).toLocaleDateString()}\n`;
      exportText += `\n${'='.repeat(50)}\n\n`;

      for (const message of messages) {
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        const sender = message.type === 'user' ? 'You' : 'Dash';
        exportText += `[${timestamp}] ${sender}: ${message.content}\n\n`;
      }

      return exportText;
    }
    return this.conversationManager.exportConversation(conversationId);
  }

  /**
   * Dispose conversation manager resources
   */
  public dispose(): void {
    if (this.conversationManager) {
      this.conversationManager.dispose();
    }
  }
}
