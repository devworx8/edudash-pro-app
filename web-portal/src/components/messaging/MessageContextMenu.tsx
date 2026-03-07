'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Copy, 
  Edit3, 
  Forward, 
  Info, 
  Reply, 
  Trash2, 
  X 
} from 'lucide-react';

// Constants for touch handling
const LONG_PRESS_DURATION_MS = 500;
const TOUCH_MOVE_THRESHOLD_PX = 10;

interface MessageContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  messageId: string;
  messageContent: string;
  isOwnMessage: boolean;
  messageCreatedAt: string;
  onEdit?: (messageId: string) => void;
  onDeleteForMe?: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  onInfo?: (messageId: string) => void;
}

// Check if message can be edited (within 15 minutes)
const canEditMessage = (createdAt: string): boolean => {
  const messageTime = new Date(createdAt).getTime();
  const now = Date.now();
  const fifteenMinutesMs = 15 * 60 * 1000;
  return now - messageTime < fifteenMinutesMs;
};

// Check if message can be deleted for everyone (within 1 hour)
const canDeleteForEveryone = (createdAt: string): boolean => {
  const messageTime = new Date(createdAt).getTime();
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  return now - messageTime < oneHourMs;
};

export const MessageContextMenu = ({
  isOpen,
  onClose,
  position,
  messageId,
  messageContent,
  isOwnMessage,
  messageCreatedAt,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onReply,
  onForward,
  onCopy,
  onInfo,
}: MessageContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = position.x;
    let newY = position.y;

    // Adjust horizontal position
    if (position.x + menuRect.width > viewportWidth - 16) {
      newX = viewportWidth - menuRect.width - 16;
    }
    if (newX < 16) newX = 16;

    // Adjust vertical position
    if (position.y + menuRect.height > viewportHeight - 16) {
      newY = viewportHeight - menuRect.height - 16;
    }
    if (newY < 16) newY = 16;

    setAdjustedPosition({ x: newX, y: newY });
  }, [isOpen, position]);

  // Close menu when clicking outside
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

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy(messageContent);
    } else {
      navigator.clipboard.writeText(messageContent);
    }
    onClose();
  }, [messageContent, onCopy, onClose]);

  const handleEdit = useCallback(() => {
    onEdit?.(messageId);
    onClose();
  }, [messageId, onEdit, onClose]);

  const handleDeleteForMe = useCallback(() => {
    onDeleteForMe?.(messageId);
    onClose();
  }, [messageId, onDeleteForMe, onClose]);

  const handleDeleteForEveryone = useCallback(() => {
    onDeleteForEveryone?.(messageId);
    onClose();
  }, [messageId, onDeleteForEveryone, onClose]);

  const handleReply = useCallback(() => {
    onReply?.(messageId);
    onClose();
  }, [messageId, onReply, onClose]);

  const handleForward = useCallback(() => {
    onForward?.(messageId);
    onClose();
  }, [messageId, onForward, onClose]);

  const handleInfo = useCallback(() => {
    onInfo?.(messageId);
    onClose();
  }, [messageId, onInfo, onClose]);

  if (!isOpen) return null;

  const canEdit = isOwnMessage && canEditMessage(messageCreatedAt);
  const canDeleteEveryone = isOwnMessage && canDeleteForEveryone(messageCreatedAt);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          zIndex: 999,
        }}
        onClick={onClose}
      />
      
      {/* Menu */}
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          top: adjustedPosition.y,
          left: adjustedPosition.x,
          background: 'var(--surface-2)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          border: '1px solid var(--border)',
          padding: 8,
          minWidth: 180,
          zIndex: 1000,
        }}
      >
        {/* Close button for touch devices */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            borderRadius: 12,
            background: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--muted)',
          }}
        >
          <X size={14} />
        </button>

        {/* Reply */}
        {onReply && (
          <MenuButton icon={<Reply size={16} />} onClick={handleReply}>
            Reply
          </MenuButton>
        )}

        {/* Edit (within 15 minutes, own messages only) */}
        {canEdit && onEdit && (
          <MenuButton icon={<Edit3 size={16} />} onClick={handleEdit}>
            Edit
          </MenuButton>
        )}

        {/* Copy */}
        <MenuButton icon={<Copy size={16} />} onClick={handleCopy}>
          Copy
        </MenuButton>

        {/* Forward */}
        {onForward && (
          <MenuButton icon={<Forward size={16} />} onClick={handleForward}>
            Forward
          </MenuButton>
        )}

        {/* Info */}
        {onInfo && (
          <MenuButton icon={<Info size={16} />} onClick={handleInfo}>
            Info
          </MenuButton>
        )}

        {/* Divider before delete options */}
        {(onDeleteForMe || (canDeleteEveryone && onDeleteForEveryone)) && (
          <div
            style={{
              height: 1,
              background: 'var(--border)',
              margin: '8px 0',
            }}
          />
        )}

        {/* Delete for Me */}
        {onDeleteForMe && (
          <MenuButton
            icon={<Trash2 size={16} />}
            onClick={handleDeleteForMe}
            variant="danger"
          >
            Delete for Me
          </MenuButton>
        )}

        {/* Delete for Everyone (within 1 hour, own messages only) */}
        {canDeleteEveryone && onDeleteForEveryone && (
          <MenuButton
            icon={<Trash2 size={16} />}
            onClick={handleDeleteForEveryone}
            variant="danger"
          >
            Delete for Everyone
          </MenuButton>
        )}

        {/* Time limit hints */}
        {isOwnMessage && !canEdit && (
          <div
            style={{
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            Edit window expired (15 min)
          </div>
        )}
        {isOwnMessage && !canDeleteEveryone && (
          <div
            style={{
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            Delete for everyone expired (1 hour)
          </div>
        )}
      </div>
    </>
  );
};

// Helper component for menu buttons
interface MenuButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}

const MenuButton = ({ icon, onClick, children, variant = 'default' }: MenuButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: 'none',
        background: isHovered ? 'var(--surface-3)' : 'transparent',
        color: variant === 'danger' ? 'var(--danger)' : 'var(--text-primary)',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s ease',
      }}
    >
      <span style={{ opacity: 0.8 }}>{icon}</span>
      {children}
    </button>
  );
};

// Hook to handle long-press and right-click for context menu
export const useMessageContextMenu = () => {
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    messageId: string;
    messageContent: string;
    isOwnMessage: boolean;
    messageCreatedAt: string;
  } | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const openContextMenu = useCallback((
    event: React.MouseEvent | React.TouchEvent | { clientX: number; clientY: number },
    messageId: string,
    messageContent: string,
    isOwnMessage: boolean,
    messageCreatedAt: string
  ) => {
    let x: number;
    let y: number;

    if ('touches' in event) {
      const touch = event.touches[0];
      x = touch.clientX;
      y = touch.clientY;
    } else {
      x = event.clientX;
      y = event.clientY;
    }

    setContextMenu({
      isOpen: true,
      position: { x, y },
      messageId,
      messageContent,
      isOwnMessage,
      messageCreatedAt,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle right-click (desktop)
  const handleContextMenu = useCallback((
    event: React.MouseEvent,
    messageId: string,
    messageContent: string,
    isOwnMessage: boolean,
    messageCreatedAt: string
  ) => {
    event.preventDefault();
    openContextMenu(event, messageId, messageContent, isOwnMessage, messageCreatedAt);
  }, [openContextMenu]);

  // Handle long-press start (mobile)
  const handleTouchStart = useCallback((
    event: React.TouchEvent,
    messageId: string,
    messageContent: string,
    isOwnMessage: boolean,
    messageCreatedAt: string
  ) => {
    const touch = event.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressTimerRef.current = setTimeout(() => {
      openContextMenu(event, messageId, messageContent, isOwnMessage, messageCreatedAt);
    }, LONG_PRESS_DURATION_MS);
  }, [openContextMenu]);

  // Handle touch move (cancel long press if moved too much)
  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    if (!touchStartPosRef.current || !longPressTimerRef.current) return;

    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);

    // Cancel if moved more than threshold
    if (dx > TOUCH_MOVE_THRESHOLD_PX || dy > TOUCH_MOVE_THRESHOLD_PX) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      touchStartPosRef.current = null;
    }
  }, []);

  // Handle touch end (cancel long press)
  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu,
    handleContextMenu,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};