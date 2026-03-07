/**
 * Shared Message Types
 * Used by both parent and teacher message threads
 */

export interface MessageReaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
  /** User IDs who reacted (for native long-press to show names) */
  reactedByUserIds?: string[];
  /** Resolved names for display (web and native when available) */
  reactedBy?: { id: string; first_name?: string; last_name?: string }[];
}

export interface Message {
  id: string;
  thread_id?: string;
  content: string;
  content_type?: string;
  sender_id: string;
  created_at: string;
  sender?: { 
    first_name?: string; 
    last_name?: string; 
    role?: string;
    avatar_url?: string | null;
  };
  read_by?: string[];
  delivered_at?: string;
  isTyping?: boolean;
  voice_url?: string;
  voice_duration?: number;
  reactions?: MessageReaction[];
  forwarded_from_id?: string;
  edited_at?: string;
  is_starred?: boolean;
  is_pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: string | null;
  scheduled_at?: string | null;
  is_scheduled?: boolean;
  reply_to_id?: string | null;
  reply_to?: {
    id: string;
    content: string;
    content_type?: string;
    sender_id: string;
    sender?: { first_name?: string; last_name?: string };
  } | null;
  /** Set when the message failed to send */
  _failed?: boolean;
  /** Human-readable error from the last failed attempt */
  _failedError?: string;
  /** Pending message queued offline — not yet persisted to DB */
  _pending?: boolean;
  /** Local ID for offline-queued or failed messages */
  _localId?: string;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface MessageThreadParams {
  threadId?: string;
  title?: string;
  teacherName?: string;
  parentName?: string;
}
