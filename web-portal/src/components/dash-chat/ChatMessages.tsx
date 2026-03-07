/**
 * Chat Messages Component
 * WARP.md compliant: ≤250 lines
 * 
 * Displays message list, empty state, typing indicator
 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Sparkles, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from './types.js';

interface ChatMessagesProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onRetry?: (messageId: string, userMessage: ChatMessage) => void;
  onExamBuilderClick?: (context: { grade?: string; subject?: string; topics?: string[] }) => void;
  examContext: { grade?: string; subject?: string; topics?: string[] };
  onQuickPrompt?: (prompt: string) => void;
}

export function ChatMessages({
  messages,
  isTyping,
  onRetry,
  onExamBuilderClick,
  examContext,
  onQuickPrompt,
}: ChatMessagesProps) {
  const { t } = useTranslation('common');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const quickPrompts = useMemo(
    () => [
      t('dashChat.quickPrompt1'),
      t('dashChat.quickPrompt2'),
      t('dashChat.quickPrompt3'),
    ],
    [t]
  );

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{
        paddingTop: '1rem',
        paddingBottom: '1rem',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        scrollBehavior: 'smooth',
      }}
    >
      <div className="w-full max-w-4xl mx-auto px-4" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: messages.length === 0 ? '100%' : 'auto',
        justifyContent: messages.length === 0 ? 'center' : 'flex-start'
      }}>
        {/* Empty State */}
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: 'var(--muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 32px rgba(124, 58, 237, 0.3)',
            }}>
              <Sparkles size={40} color="white" />
            </div>
            <h3 style={{
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 12,
              color: 'var(--text)'
            }}>{t('dashChat.welcomeTitle')}</h3>
            <p style={{
              fontSize: 14,
              lineHeight: 1.5,
              maxWidth: 500,
              margin: '0 auto 24px'
            }}>{t('dashChat.welcomeBody')}</p>
            
            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => {
                  // Focus the chat input
                  const input = document.querySelector('textarea[data-chat-input="true"]') as HTMLTextAreaElement | null;
                  if (input) input.focus();
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                  border: 'none',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.3)';
                }}
              >
                <Sparkles size={16} />
                {t('dashChat.startFirstChat')}
              </button>
            </div>

            {/* Quick Prompts */}
            <div style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 16
            }}>
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onQuickPrompt?.(prompt)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: '1px solid #2f2f2f',
                    background: 'rgba(124, 58, 237, 0.12)',
                    color: 'var(--text)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message List */}
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            onRetry={message.isError && index > 0 && onRetry ? () => {
              const lastUserMessage = messages[index - 1];
              if (lastUserMessage && lastUserMessage.role === 'user') {
                onRetry(message.id, lastUserMessage);
              }
            } : undefined}
          />
        ))}

        {/* Exam Builder Prompt */}
        {(() => {
          const lastMessage = messages[messages.length - 1];
          const grade = (examContext?.grade || '').toLowerCase();
          const gradeMatch = grade.match(/grade_(\d+)/);
          const gradeLevel = grade === 'grade_r' ? 0 : gradeMatch ? Number(gradeMatch[1]) : null;
          const canLaunchExamBuilder = gradeLevel !== null && gradeLevel >= 4;

          if (
            messages.length > 0 &&
            lastMessage?.role === 'assistant' &&
            lastMessage?.content.toLowerCase().includes('exam builder') &&
            onExamBuilderClick &&
            canLaunchExamBuilder
          ) {
            return (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '12px',
            marginBottom: '8px',
            width: '100%'
          }}>
            <button
              onClick={() => onExamBuilderClick(examContext)}
              className="btn btnPrimary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.25)';
              }}
            >
              <FileText size={18} />
              {t('dashChat.launchExamBuilder')}
              <Sparkles size={16} />
            </button>
          </div>
            );
          }
          return null;
        })()}

        {/* Typing Indicator - Animated */}
        {isTyping && (
          <div style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            paddingLeft: 4,
            paddingRight: 4
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              animation: 'spin 2s linear infinite'
            }}>
              <Sparkles size={16} color="white" />
            </div>
            <div style={{
              background: 'var(--surface-1)',
              padding: '12px 16px',
              borderRadius: '16px 16px 16px 4px',
              border: '1px solid var(--border)',
              display: 'flex',
              gap: 4,
              alignItems: 'center'
            }}>
              <div className="typing-dot" style={{ animationDelay: '0ms' }}></div>
              <div className="typing-dot" style={{ animationDelay: '150ms' }}></div>
              <div className="typing-dot" style={{ animationDelay: '300ms' }}></div>
            </div>
            <style jsx>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
              .typing-dot {
                width: 8px;
                height: 8px;
                borderRadius: '50%';
                background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
                animation: typing-bounce 1.4s infinite ease-in-out;
              }
              @keyframes typing-bounce {
                0%, 60%, 100% { transform: translateY(0); opacity: 0.7; }
                30% { transform: translateY(-10px); opacity: 1; }
              }
            `}</style>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
