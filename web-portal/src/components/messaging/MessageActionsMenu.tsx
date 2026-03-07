'use client';

import { useEffect, useRef, useState } from 'react';
import { Reply, Forward, Edit3, Trash2, Copy, Smile, X } from 'lucide-react';

// Common emoji reactions
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageActionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onReply: () => void;
  onForward: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onReact: (emoji: string) => void;
  position: { x: number; y: number };
  isOwnMessage: boolean;
  isMobile?: boolean;
  messageContent?: string;
}

export function MessageActionsMenu({
  isOpen,
  onClose,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onCopy,
  onReact,
  position,
  isOwnMessage,
  isMobile = false,
  messageContent,
}: MessageActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [showMoreEmojis, setShowMoreEmojis] = useState(false);

  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    // Adjust position to keep menu on screen
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Keep menu within viewport
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 10;
    }
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    setAdjustedPosition({ x, y });
  }, [isOpen, position]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const menuItems = [
    { icon: Reply, label: 'Reply', onClick: onReply, color: 'var(--text)' },
    { icon: Forward, label: 'Forward', onClick: onForward, color: 'var(--text)' },
    { icon: Copy, label: 'Copy', onClick: onCopy, color: 'var(--text)' },
    ...(isOwnMessage && onEdit ? [{ icon: Edit3, label: 'Edit', onClick: onEdit, color: 'var(--text)' }] : []),
    { icon: Trash2, label: 'Delete', onClick: onDelete, color: '#ef4444' },
  ];

  // Mobile bottom sheet style
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 2999,
            backdropFilter: 'blur(2px)',
          }}
        />
        {/* Bottom Sheet */}
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 3000,
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            borderRadius: '20px 20px 0 0',
            padding: '12px 16px calc(16px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            borderBottom: 'none',
            animation: 'slideUp 0.2s ease-out',
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
          `}</style>
          
          {/* Handle bar */}
          <div style={{
            width: 40,
            height: 4,
            background: 'rgba(148, 163, 184, 0.3)',
            borderRadius: 2,
            margin: '0 auto 16px',
          }} />

          {/* Message preview */}
          {messageContent && (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(100, 116, 139, 0.1)',
              borderRadius: 12,
              marginBottom: 16,
              borderLeft: '3px solid #3b82f6',
            }}>
              <p style={{
                margin: 0,
                fontSize: 13,
                color: '#94a3b8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}>
                {messageContent.startsWith('__media__') ? '📎 Media' : messageContent}
              </p>
            </div>
          )}

          {/* Quick Reactions Row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-around',
            marginBottom: 16,
            padding: '8px 0',
          }}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(emoji);
                  onClose();
                }}
                style={{
                  fontSize: 28,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 8,
                  borderRadius: 12,
                  transition: 'all 0.15s ease',
                }}
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={() => setShowMoreEmojis(!showMoreEmojis)}
              style={{
                fontSize: 20,
                background: 'rgba(100, 116, 139, 0.2)',
                border: 'none',
                cursor: 'pointer',
                padding: 8,
                borderRadius: 12,
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
              }}
            >
              <Smile size={20} />
            </button>
          </div>

          {/* Action buttons */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}>
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={index}
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 8px',
                    background: 'rgba(100, 116, 139, 0.1)',
                    border: 'none',
                    borderRadius: 12,
                    cursor: 'pointer',
                    color: item.color,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon size={22} />
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // Desktop context menu style
  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: `${adjustedPosition.y}px`,
        left: `${adjustedPosition.x}px`,
        zIndex: 3000,
        minWidth: 200,
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        padding: '8px 0',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Quick Reactions Row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 12px 12px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
      }}>
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onReact(emoji);
              onClose();
            }}
            style={{
              fontSize: 22,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(100, 116, 139, 0.2)';
              e.currentTarget.style.transform = 'scale(1.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Menu Items */}
      {menuItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={index}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            style={{
              width: '100%',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: item.color,
              fontSize: 14,
              fontWeight: 500,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(100, 116, 139, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
