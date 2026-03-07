'use client';

import { useState, useRef, useEffect } from 'react';
import { Trash2, Archive, UserX, Download, AlertCircle, X } from 'lucide-react';

interface MessageOptionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteThread: () => void;
  onClearConversation: () => void;
  onBlockUser: () => void;
  onExportChat: () => void;
  onReportIssue: () => void;
  anchorEl: HTMLElement | null;
  isBlocked?: boolean;
}

export function MessageOptionsMenu({
  isOpen,
  onClose,
  onDeleteThread,
  onClearConversation,
  onBlockUser,
  onExportChat,
  onReportIssue,
  anchorEl,
  isBlocked = false,
}: MessageOptionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorEl]);

  if (!isOpen || !anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();
  const top = rect.bottom + 8;
  const right = window.innerWidth - rect.right;

  const menuItems = [
    {
      label: 'Clear conversation',
      icon: Archive,
      onClick: () => {
        onClearConversation();
        onClose();
      },
      color: 'var(--text)',
    },
    {
      label: isBlocked ? 'Unblock user' : 'Block user',
      icon: UserX,
      onClick: () => {
        onBlockUser();
        onClose();
      },
      color: 'var(--warning)',
    },
    {
      label: 'Export chat',
      icon: Download,
      onClick: () => {
        onExportChat();
        onClose();
      },
      color: 'var(--text)',
    },
    {
      label: 'Report issue',
      icon: AlertCircle,
      onClick: () => {
        onReportIssue();
        onClose();
      },
      color: 'var(--text)',
    },
    {
      label: 'Delete thread',
      icon: Trash2,
      onClick: () => {
        onDeleteThread();
        onClose();
      },
      color: 'var(--danger)',
    },
  ];

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: `${top}px`,
        right: `${right}px`,
        zIndex: 2000,
        minWidth: 220,
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        border: '1px solid var(--border)',
        padding: '8px 0',
        backdropFilter: 'blur(12px)',
      }}
    >
      {menuItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={index}
            onClick={item.onClick}
            style={{
              width: '100%',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
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
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
