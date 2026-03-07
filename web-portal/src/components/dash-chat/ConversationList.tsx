'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, Trash2, Clock, CheckSquare, Square } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Conversation {
  id: string;
  conversation_id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

interface ConversationListProps {
  activeConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

export function ConversationList({ 
  activeConversationId, 
  onSelectConversation,
  onNewConversation 
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const loadConversations = useCallback(async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      if (!userData.user) {
        setCurrentUserId(null);
        setConversations([]);
        return;
      }

      setCurrentUserId(userData.user.id);

      const { data, error } = await supabase
        .from('ai_conversations')
        .select('id, conversation_id, title, updated_at, messages')
        .eq('user_id', userData.user.id)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const formattedConversations = (data || []).map((conv: any) => ({
        id: conv.id,
        conversation_id: conv.conversation_id,
        title: conv.title,
        updated_at: conv.updated_at,
        message_count: Array.isArray(conv.messages) ? conv.messages.length : 0,
      }));

      setConversations(formattedConversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Delete this conversation?')) return;
    if (!currentUserId) return;

    try {
      const { error } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('user_id', currentUserId)
        .eq('conversation_id', conversationId);

      if (error) throw error;

      setConversations((prev) => prev.filter(c => c.conversation_id !== conversationId));
      
      if (activeConversationId === conversationId) {
        onNewConversation();
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const toggleSelection = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === conversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(conversations.map(c => c.conversation_id)));
    }
  };

  const deleteBulk = async () => {
    if (selectedIds.size === 0) return;
    if (!currentUserId) return;
    
    if (!confirm(`Delete ${selectedIds.size} conversation(s)?`)) return;

    try {
      const { error } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('user_id', currentUserId)
        .in('conversation_id', Array.from(selectedIds));

      if (error) throw error;

      setConversations((prev) => prev.filter(c => !selectedIds.has(c.conversation_id)));
      
      if (activeConversationId && selectedIds.has(activeConversationId)) {
        onNewConversation();
      }

      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      console.error('Error deleting conversations:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div style={{ 
        padding: 20, 
        textAlign: 'center', 
        color: 'var(--muted)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12
      }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
        <p style={{ margin: 0 }}>Loading conversations...</p>
        <style jsx>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.6; transform: scale(0.9); }
            50% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-0)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            Conversations
          </h3>
          {conversations.length > 0 && (
            <button
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                setSelectedIds(new Set());
              }}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
                color: 'var(--text)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {isSelectionMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>
        
        {isSelectionMode && selectedIds.size > 0 ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={deleteBulk}
              className="btn"
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                border: 'none',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Trash2 size={16} />
              Delete ({selectedIds.size})
            </button>
            <button
              onClick={toggleSelectAll}
              className="btn"
              style={{
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {selectedIds.size === conversations.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        ) : (
          <button
            onClick={onNewConversation}
            className="btn btnPrimary"
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <MessageSquare size={16} />
            New Chat
          </button>
        )}
      </div>

      {/* Conversations List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {conversations.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--muted)',
            }}
          >
            <MessageSquare size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, margin: 0 }}>No conversations yet</p>
            <p style={{ fontSize: 12, margin: '4px 0 0 0' }}>Start a new chat to get help!</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => {
                if (isSelectionMode) {
                  toggleSelection(conv.conversation_id, { stopPropagation: () => {} } as React.MouseEvent);
                } else {
                  onSelectConversation(conv.conversation_id);
                }
              }}
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: activeConversationId === conv.conversation_id
                  ? 'rgba(124, 58, 237, 0.1)'
                  : 'transparent',
                transition: 'background 0.2s ease',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
              onMouseEnter={(e) => {
                if (activeConversationId !== conv.conversation_id) {
                  e.currentTarget.style.background = 'var(--surface-1)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeConversationId !== conv.conversation_id) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {isSelectionMode && (
                <div
                  onClick={(e) => toggleSelection(conv.conversation_id, e)}
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    cursor: 'pointer',
                    color: selectedIds.has(conv.conversation_id) ? '#7c3aed' : 'var(--muted)',
                  }}
                >
                  {selectedIds.has(conv.conversation_id) ? (
                    <CheckSquare size={20} />
                  ) : (
                    <Square size={20} />
                  )}
                </div>
              )}
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      paddingRight: 8,
                    }}
                  >
                    {conv.title}
                  </h4>
                  {!isSelectionMode && (
                    <button
                      onClick={(e) => deleteConversation(conv.conversation_id, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        color: 'var(--muted)',
                        flexShrink: 0,
                      }}
                      title="Delete conversation"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                  <Clock size={12} />
                  <span>{formatDate(conv.updated_at)}</span>
                  <span>•</span>
                  <span>{conv.message_count} messages</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
