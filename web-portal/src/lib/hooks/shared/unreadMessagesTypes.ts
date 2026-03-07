/**
 * Shared types for unread message hooks
 * Used by both parent and teacher unread message hooks
 */

export interface UnreadMessagesReturn {
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface ThreadParticipant {
  user_id: string;
  role: string;
  last_read_at: string | null;
}

export interface MessageThread {
  id: string;
  message_participants: ThreadParticipant[];
}

export interface MessagePayload {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface ThreadData {
  threadId: string;
  lastReadAt: string;
}

export interface MessageRecord {
  id: string;
  thread_id: string;
  created_at: string;
}

/**
 * Count unread messages from fetched messages based on thread last_read_at
 */
export function countUnreadMessages(
  messages: MessageRecord[] | null,
  threadData: ThreadData[]
): number {
  if (!messages) return 0;
  return messages.filter((msg) => {
    const thread = threadData.find((t) => t.threadId === msg.thread_id);
    return thread && new Date(msg.created_at) > new Date(thread.lastReadAt);
  }).length;
}

/**
 * Extract thread data for a user from message threads
 */
export function extractUserThreadData(
  threads: MessageThread[],
  userId: string,
  roleFilter?: string
): ThreadData[] {
  return threads
    .filter((thread) =>
      thread.message_participants?.some(
        (p) => p.user_id === userId && (!roleFilter || p.role === roleFilter)
      )
    )
    .map((thread) => {
      const participant = thread.message_participants?.find(
        (p) => p.user_id === userId && (!roleFilter || p.role === roleFilter)
      );
      return {
        threadId: thread.id,
        lastReadAt: participant?.last_read_at || '2000-01-01',
      };
    });
}
