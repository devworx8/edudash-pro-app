'use client';

/**
 * Thread List Components
 *
 * Reusable thread list item components for messaging pages.
 * Used by parent, teacher, and principal messaging pages.
 */

import { Trash2, School } from 'lucide-react';
import { DashAIAvatar } from '@/components/dash/DashAIAvatar';
import { getMessageDisplayText } from '@/lib/messaging/messageContent';
import {
  type MessageThread,
  DASH_AI_THREAD_ID,
  formatMessageTime,
  getInitials,
  getRoleGradient,
  getAvatarGradient,
  getDateSeparatorLabel,
  getDateKey,
} from '@/lib/messaging/types';

// Re-export utilities used by messaging pages
export { formatMessageTime, getDateSeparatorLabel, getDateKey };

interface ThreadItemProps {
  thread: MessageThread;
  isActive: boolean;
  onSelect: () => void;
  onDelete?: (threadId: string) => void;
  isDesktop?: boolean;
  currentUserId?: string;
  /** Custom display name override */
  displayName?: string;
  /** Whether this thread is for teacher view (shows parent as contact) */
  isTeacherView?: boolean;
}

/**
 * Message status ticks component for thread list
 */
export const ThreadMessageTicks = ({
  lastMessage,
  participants,
  currentUserId,
}: {
  lastMessage?: MessageThread['last_message'];
  participants: MessageThread['message_participants'];
  currentUserId?: string;
}) => {
  if (!lastMessage || !currentUserId) return null;

  // Only show ticks for messages WE sent
  const isOwnMessage = lastMessage.sender_id === currentUserId;
  if (!isOwnMessage) return null;

  const otherParticipantIds = (participants || [])
    .map((p) => p.user_id)
    .filter((id): id is string => Boolean(id && id !== currentUserId));

  const isRead =
    Array.isArray(lastMessage.read_by) && otherParticipantIds.length > 0
      ? otherParticipantIds.some((id) => lastMessage.read_by?.includes(id))
      : false;

  const isDelivered = Boolean(lastMessage.delivered_at);

  const ticks = isRead ? '✓✓' : isDelivered ? '✓✓' : '✓';
  const color = isRead ? '#34d399' : 'rgba(148, 163, 184, 0.6)';

  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color,
        letterSpacing: '-3px',
        marginRight: 4,
        flexShrink: 0,
      }}
    >
      {ticks}
    </span>
  );
};

/**
 * Date separator component for message grouping
 */
export const DateSeparator = ({ label }: { label: string }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 0',
    }}
  >
    <div
      style={{
        background: 'rgba(30, 41, 59, 0.8)',
        backdropFilter: 'blur(8px)',
        padding: '6px 14px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        color: 'rgba(148, 163, 184, 0.9)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        border: '1px solid rgba(148, 163, 184, 0.1)',
      }}
    >
      {label}
    </div>
  </div>
);

/**
 * Thread list item component
 */
export const ThreadItem = ({
  thread,
  isActive,
  onSelect,
  onDelete,
  isDesktop,
  currentUserId,
  displayName,
  isTeacherView,
}: ThreadItemProps) => {
  // Check if this is the Dash AI thread
  const isDashAI = thread.id === DASH_AI_THREAD_ID || thread.type === 'dash_ai';

  const participants = thread.message_participants || [];
  
  // For teacher view, find the parent; for parent view, find the educator
  let contactName = 'Contact';
  let contactRole = 'teacher';
  
  if (displayName) {
    contactName = displayName;
  } else if (isDashAI) {
    contactName = 'Dash AI';
    contactRole = 'ai_assistant';
  } else if (isTeacherView) {
    // Teacher sees parent as contact
    const parent = participants.find((p) => {
      const role = p.role || p.profiles?.role || p.user_profile?.role;
      return role === 'parent';
    });
    contactName = parent?.profiles 
      ? `${parent.profiles.first_name} ${parent.profiles.last_name}`.trim()
      : parent?.user_profile
        ? `${parent.user_profile.first_name} ${parent.user_profile.last_name}`.trim()
        : 'Parent';
    contactRole = 'parent';
  } else {
    // Parent sees educator as contact
    const educator = participants.find((p) => {
      const role = p.role || p.profiles?.role;
      return role !== 'parent';
    });
    contactName = educator?.profiles
      ? `${educator.profiles.first_name} ${educator.profiles.last_name}`.trim()
      : 'Teacher';
    contactRole = educator?.profiles?.role || educator?.role || 'teacher';
  }
  const studentName = thread.student
    ? `${thread.student.first_name} ${thread.student.last_name}`
    : null;
  const hasUnread = (thread.unread_count || 0) > 0;

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '14px 16px',
        margin: '4px 8px',
        cursor: 'pointer',
        background: getRoleGradient(contactRole, isActive, isDashAI),
        borderRadius: 16,
        border: isActive
          ? `1px solid ${isDashAI ? 'rgba(168, 85, 247, 0.3)' : contactRole === 'principal' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
          : '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        transition: 'all 0.25s ease',
        width: 'calc(100% - 16px)',
        boxShadow: isActive
          ? isDashAI
            ? '0 4px 20px rgba(168, 85, 247, 0.2), 0 0 30px rgba(168, 85, 247, 0.1)'
            : '0 4px 16px rgba(59, 130, 246, 0.15)'
          : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = getRoleGradient(contactRole, true, isDashAI);
          e.currentTarget.style.transform = 'translateX(4px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = getRoleGradient(contactRole, false, isDashAI);
          e.currentTarget.style.transform = 'translateX(0)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {/* Avatar */}
      {isDashAI ? (
        <DashAIAvatar size={44} showStars={true} animated={isActive} />
      ) : (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: getAvatarGradient(contactRole),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.25s ease',
          }}
        >
          {contactRole === 'principal' ? <School size={18} /> : getInitials(contactName)}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: hasUnread ? 700 : 600,
                color: isDashAI ? '#e879f9' : hasUnread ? '#f1f5f9' : '#e2e8f0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}
            >
              {contactName}
            </span>
            {isDashAI && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fff',
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                  padding: '3px 8px',
                  borderRadius: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  boxShadow: '0 2px 8px rgba(168, 85, 247, 0.4)',
                }}
              >
                AI
              </span>
            )}
            {contactRole === 'principal' && !isDashAI && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#a78bfa',
                  background: 'rgba(139, 92, 246, 0.15)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}
              >
                Principal
              </span>
            )}
          </div>
        </div>
        {isDashAI ? (
          <p
            style={{
              margin: '0 0 2px 0',
              fontSize: 12,
              color: '#22d3ee',
              fontWeight: 500,
            }}
          >
            ✨ Your AI Assistant
          </p>
        ) : (
          studentName && (
            <p
              style={{
                margin: '0 0 2px 0',
                fontSize: 11,
                color: '#a78bfa',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 500,
              }}
            >
              📚 {studentName}
            </p>
          )
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Ticks for own messages */}
          <ThreadMessageTicks
            lastMessage={thread.last_message}
            participants={thread.message_participants || []}
            currentUserId={currentUserId}
          />
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: hasUnread ? '#cbd5e1' : '#64748b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
              flex: 1,
            }}
          >
            {thread.last_message?.content
              ? getMessageDisplayText(thread.last_message.content)
              : 'No messages yet'}
          </p>
          {thread.last_message?.created_at && (
            <span
              style={{
                fontSize: 11,
                color: hasUnread ? '#a78bfa' : '#64748b',
                fontWeight: hasUnread ? 600 : 400,
                flexShrink: 0,
              }}
            >
              {formatMessageTime(thread.last_message.created_at)}
            </span>
          )}
        </div>
      </div>
      {hasUnread && (
        <div
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            boxShadow: '0 2px 6px rgba(59, 130, 246, 0.4)',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>
            {thread.unread_count && thread.unread_count > 9 ? '9+' : thread.unread_count}
          </span>
        </div>
      )}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete conversation with ${contactName}?`)) {
              onDelete(thread.id);
            }
          }}
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#ef4444',
            flexShrink: 0,
            marginLeft: 'auto',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
          }}
          title="Delete conversation"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
};

export type { ThreadItemProps };
