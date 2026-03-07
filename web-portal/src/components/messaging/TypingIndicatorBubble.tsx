'use client';

import { User } from 'lucide-react';

interface TypingIndicatorBubbleProps {
  senderName?: string;
  isDesktop?: boolean;
}

export const TypingIndicatorBubble = ({ senderName, isDesktop = false }: TypingIndicatorBubbleProps) => {
  const getInitials = (name?: string) => {
    if (!name || name.trim() === '') return '?';
    const parts = name.trim().split(' ').filter(part => part.length > 0);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0]?.[0]?.toUpperCase() || '?';
  };

  return (
    <>
      {/* Inject keyframes */}
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% {
            transform: translateY(0);
          }
          30% {
            transform: translateY(-8px);
          }
        }
      `}</style>
      
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          maxWidth: '100%',
          paddingLeft: isDesktop ? 8 : 10,
          gap: 8,
          alignItems: 'flex-end',
          animation: 'fadeIn 0.3s ease-out',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: isDesktop ? 36 : 32,
            height: isDesktop ? 36 : 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
            marginBottom: 2,
          }}
        >
          {senderName ? (
            <span style={{ color: '#fff', fontSize: isDesktop ? 13 : 11, fontWeight: 600 }}>
              {getInitials(senderName)}
            </span>
          ) : (
            <User size={isDesktop ? 18 : 16} color="#fff" />
          )}
        </div>

        {/* Typing bubble */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '16px 16px 16px 4px',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15), 0 4px 12px rgba(15, 23, 42, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            minWidth: '60px',
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'typing-bounce 1.2s ease-in-out infinite',
              animationDelay: '0s',
            }}
          />
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'typing-bounce 1.2s ease-in-out infinite',
              animationDelay: '0.15s',
            }}
          />
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'typing-bounce 1.2s ease-in-out infinite',
              animationDelay: '0.3s',
            }}
          />
        </div>
      </div>
    </>
  );
};
