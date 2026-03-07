'use client';

import { useAIConversationList } from '@/lib/hooks/useAIConversation';
import { MessageSquare, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SavedConversationsProps {
  onSelectConversation?: (conversationId: string) => void;
}

export function SavedConversations({ onSelectConversation }: SavedConversationsProps) {
  const { conversations, loading } = useAIConversationList();
  
  if (loading) {
    return (
      <div className="section">
        <div className="sectionTitle">💬 Recent AI Sessions</div>
        <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--muted)' }}>
          Loading conversations...
        </div>
      </div>
    );
  }
  
  if (conversations.length === 0) {
    return (
      <div className="section">
        <div className="sectionTitle">💬 Recent AI Sessions</div>
        <div 
          className="card" 
          style={{ 
            textAlign: 'center', 
            padding: 'var(--space-6)',
            background: 'var(--surface)'
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 'var(--space-3)' }}>💬</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            No saved conversations yet.
            <br />
            Start chatting with Dash AI to see your history here!
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="section">
      <div className="sectionTitle">💬 Recent AI Sessions</div>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {conversations.map(conv => {
          const messageCount = Array.isArray(conv.messages) ? conv.messages.length : 0;
          const lastMessage = messageCount > 0 ? conv.messages[messageCount - 1] : null;
          
          return (
            <div 
              key={conv.id} 
              className="card"
              style={{ 
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: '1px solid var(--border)'
              }}
              onClick={() => onSelectConversation?.(conv.conversationId)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <div style={{ 
                  fontSize: 24, 
                  flexShrink: 0,
                  marginTop: 2
                }}>
                  💬
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontWeight: 600, 
                    marginBottom: 'var(--space-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {conv.title}
                  </div>
                  
                  {lastMessage && (
                    <div style={{ 
                      fontSize: 13, 
                      color: 'var(--muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: 'var(--space-2)'
                    }}>
                      {lastMessage.content.substring(0, 80)}
                      {lastMessage.content.length > 80 ? '...' : ''}
                    </div>
                  )}
                  
                  <div style={{ 
                    display: 'flex', 
                    gap: 'var(--space-3)', 
                    fontSize: 12, 
                    color: 'var(--muted)',
                    alignItems: 'center'
                  }}>
                    <span>
                      💬 {messageCount} {messageCount === 1 ? 'message' : 'messages'}
                    </span>
                    <span>
                      🕐 {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
