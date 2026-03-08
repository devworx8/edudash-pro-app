/**
 * Shared messaging types used across all role-based messaging hooks.
 * Single source of truth for MessageThread, MessageParticipant, Message interfaces.
 */

export type ThreadType =
  | 'parent-teacher'
  | 'parent-principal'
  | 'parent-parent'
  | 'general'
  | 'class_group'
  | 'parent_group'
  | 'teacher_group'
  | 'announcement'
  | 'custom';

export type ContentType = 'text' | 'system' | 'voice' | 'image' | 'file';

export type ParticipantRole = 'parent' | 'teacher' | 'principal' | 'admin';

export type GroupType = 'class_group' | 'parent_group' | 'teacher_group' | 'announcement' | 'custom';

export interface MessageThread {
  id: string;
  preschool_id: string;
  type: ThreadType;
  student_id: string | null;
  subject: string;
  created_by: string;
  last_message_at: string;
  is_archived: boolean;
  is_group?: boolean;
  group_name?: string;
  group_type?: GroupType;
  created_at: string;
  updated_at: string;
  /** Disappearing messages timer in seconds. null = disabled */
  disappear_after_seconds?: number | null;
  // Joined data
  student?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  participants?: MessageParticipant[];
  last_message?: {
    content: string;
    sender_name?: string;
    sender_id?: string;
    created_at: string;
  };
  unread_count?: number;
}

export interface MessageParticipant {
  id: string;
  thread_id: string;
  user_id: string;
  role: ParticipantRole;
  joined_at: string;
  is_muted: boolean;
  last_read_at: string;
  can_send_messages?: boolean;
  is_admin?: boolean;
  // Joined data
  user_profile?: {
    first_name: string;
    last_name: string;
    role: string;
    avatar_url?: string | null;
  };
}

export interface MessageReaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  content_type: ContentType;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  delivered_at?: string | null;
  read_by?: string[];
  voice_url?: string | null;
  voice_duration?: number | null;
  reply_to_id?: string | null;
  forwarded_from_id?: string | null;
  is_starred?: boolean;
  is_pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: string | null;
  scheduled_at?: string | null;
  is_scheduled?: boolean;
  /** Pending message queued offline — not yet persisted to DB */
  _pending?: boolean;
  /** Local ID for offline-queued or failed messages */
  _localId?: string;
  /** Set when the message failed to send */
  _failed?: boolean;
  /** Human-readable error from the last failed attempt */
  _failedError?: string;
  // Joined data
  sender?: {
    first_name: string;
    last_name: string;
    role: string;
    avatar_url?: string | null;
  };
  reactions?: MessageReaction[];
  reply_to?: Message | null;
}

/** Shape of the send-message mutation input */
export interface SendMessageInput {
  threadId: string;
  content: string;
  contentType?: ContentType;
  voiceUrl?: string;
  voiceDuration?: number;
  replyToId?: string;
  forwardedFromId?: string;
  /** Media attachment encoded via messageContent helpers */
  mediaUrl?: string;
}

/** Role config passed to the base messaging hook factory */
export interface MessagingRoleConfig {
  /** Role identifier for query key prefixing */
  role: 'parent' | 'teacher' | 'principal';
  /** Supabase client getter */
  getClient: () => ReturnType<typeof import('@/lib/supabase').assertSupabase>;
}

/** Report category for message/thread reporting */
export type ReportCategory = 'spam' | 'harassment' | 'inappropriate' | 'other';

/** Report payload sent to moderation pipeline */
export interface MessageReport {
  thread_id: string;
  message_id?: string;
  reported_by: string;
  reason: ReportCategory;
  description?: string;
  content_preview: string;
}
