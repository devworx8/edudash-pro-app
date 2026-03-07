/**
 * Message Thread Types
 * Extracted from useParentMessaging.ts for reuse across messaging hooks
 */

export interface MessageThread {
  id: string;
  preschool_id: string;
  type: 'parent-teacher' | 'parent-principal' | 'general';
  student_id: string | null;
  subject: string;
  created_by: string;
  last_message_at: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  student?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  message_participants?: MessageParticipant[];
  last_message?: {
    content: string;
    sender_name: string;
    created_at: string;
  };
  unread_count?: number;
}

export interface MessageParticipant {
  id: string;
  thread_id: string;
  user_id: string;
  role: 'parent' | 'teacher' | 'principal' | 'admin';
  joined_at: string;
  is_muted: boolean;
  last_read_at: string;
  // Joined data
  profiles?: {
    first_name: string;
    last_name: string;
    role: string;
  };
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  content_type: 'text' | 'system';
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  // Joined data
  sender?: {
    first_name: string;
    last_name: string;
    role: string;
  };
}

export interface CreateThreadParams {
  preschoolId: string;
  type: 'parent-teacher' | 'parent-principal' | 'general';
  subject: string;
  studentId?: string;
  recipientId: string;
  userId: string;
  initialMessage: string;
}

export interface SendMessageParams {
  threadId: string;
  content: string;
  userId: string;
}
