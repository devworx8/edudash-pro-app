/**
 * useAIConversation Hook
 * 
 * Manages AI chat conversation persistence to Supabase database.
 * Automatically loads and saves conversation history.
 */

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface AIConversation {
  id: string;
  conversationId: string;
  title: string;
  messages: AIMessage[];
  createdAt: string;
  updatedAt: string;
}

export function useAIConversation(conversationId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Load conversation on mount
  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      return;
    }
    
    const loadConversation = async () => {
      try {
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError || !userData.user) {
          if (authError) {
            console.error('[useAIConversation] Auth error:', authError);
          }
          return;
        }

        const { data, error } = await supabase
          .from('ai_conversations')
          .select('messages, title')
          .eq('user_id', userData.user.id)
          .eq('conversation_id', conversationId)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') { // Not found is OK
          console.error('[useAIConversation] Load error:', error);
          setError(error.message);
        }
        
        if (data?.messages) {
          setMessages(data.messages as AIMessage[]);
        }
      } catch (err) {
        console.error('[useAIConversation] Exception:', err);
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    };
    
    loadConversation();
  }, [conversationId, supabase]);
  
  /**
   * Save messages to database
   * Auto-upsert based on conversation_id
   */
  const saveMessages = async (newMessages: AIMessage[], title: string): Promise<boolean> => {
    if (!conversationId) {
      console.warn('[useAIConversation] No conversationId provided, cannot save');
      return false;
    }
    
    try {
      // Get current user
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('[useAIConversation] Not authenticated');
        return false;
      }
      
      // Get user profile (for preschool_id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, preschool_id')
        .eq('id', sessionData.session.user.id)
        .single();
      
      // Upsert conversation
      const payload = {
        conversation_id: conversationId,
        user_id: sessionData.session.user.id,
        preschool_id: profile?.preschool_id || null, // NULL for independent parents
        title: title || 'Untitled Conversation',
        messages: newMessages,
        updated_at: new Date().toISOString()
      };

      const { data: existingConversation, error: existingError } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('user_id', sessionData.session.user.id)
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (existingError && existingError.code !== 'PGRST116') {
        console.error('[useAIConversation] Lookup error:', existingError);
        setError(existingError.message);
        return false;
      }

      const { error } = existingConversation
        ? await supabase
            .from('ai_conversations')
            .update(payload)
            .eq('id', existingConversation.id)
            .eq('user_id', sessionData.session.user.id)
        : await supabase
            .from('ai_conversations')
            .insert(payload);
      
      if (error) {
        console.error('[useAIConversation] Save error:', error);
        setError(error.message);
        return false;
      }
      
      console.log(`[useAIConversation] Saved ${newMessages.length} messages to conversation: ${conversationId}`);
      return true;
    } catch (err) {
      console.error('[useAIConversation] Exception:', err);
      setError(err instanceof Error ? err.message : 'Failed to save conversation');
      return false;
    }
  };
  
  /**
   * Delete conversation
   */
  const deleteConversation = async (): Promise<boolean> => {
    if (!conversationId) return false;
    
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) {
        if (authError) {
          console.error('[useAIConversation] Auth error:', authError);
        }
        return false;
      }

      const { error } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('user_id', userData.user.id)
        .eq('conversation_id', conversationId);
      
      if (error) {
        console.error('[useAIConversation] Delete error:', error);
        return false;
      }
      
      setMessages([]);
      return true;
    } catch (err) {
      console.error('[useAIConversation] Exception:', err);
      return false;
    }
  };
  
  return {
    messages,
    setMessages,
    saveMessages,
    deleteConversation,
    loading,
    error
  };
}

/**
 * Hook to fetch all user conversations (for history view)
 */
export function useAIConversationList() {
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError || !userData.user) {
          if (authError) {
            console.error('[useAIConversationList] Auth error:', authError);
          }
          setConversations([]);
          return;
        }

        const { data, error } = await supabase
          .from('ai_conversations')
          .select('*')
          .eq('user_id', userData.user.id)
          .order('updated_at', { ascending: false })
          .limit(50);
        
        if (error) {
          console.error('[useAIConversationList] Error:', error);
        } else {
          setConversations(data as any[] || []);
        }
      } catch (err) {
        console.error('[useAIConversationList] Exception:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchConversations();
  }, [supabase]);
  
  return { conversations, loading, refetch: () => {} };
}
