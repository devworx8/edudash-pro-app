/**
 * Messaging Types
 *
 * Shared type definitions for the messaging system.
 * Used by parent, teacher, and principal messaging pages.
 */

/**
 * Participant profile data from Supabase
 */
export interface ParticipantProfile {
  first_name: string;
  last_name: string;
  role: string;
}

/**
 * Message thread with participants and last message
 */
export interface MessageThread {
  id: string;
  type: string;
  subject: string;
  student_id?: string | null;
  last_message_at?: string;
  is_group?: boolean | null;
  group_name?: string | null;
  group_type?: string | null;
  allow_replies?: boolean | null;
  student?: {
    id?: string;
    first_name: string;
    last_name: string;
  };
  /** Can be either message_participants or participants depending on context */
  message_participants?: Array<{
    user_id: string;
    role: string;
    last_read_at?: string;
    is_admin?: boolean | null;
    can_send_messages?: boolean | null;
    /** Profile data - some APIs use 'profiles', others use 'user_profile' */
    profiles?: ParticipantProfile;
    user_profile?: ParticipantProfile;
  }>;
  /** Alternative name for message_participants used in some contexts */
  participants?: Array<{
    user_id: string;
    role: string;
    user_profile?: ParticipantProfile;
  }>;
  last_message?: {
    id?: string;
    content: string;
    created_at: string;
    sender_id: string;
    delivered_at?: string | null;
    read_by?: string[] | null;
  };
  unread_count?: number;
}

/**
 * Dash AI Virtual Contact Constants
 */
export const DASH_AI_THREAD_ID = 'dash-ai-assistant';
export const DASH_AI_USER_ID = 'dash-ai-system';

/**
 * Contact panel layout constant
 */
export const CONTACT_PANEL_WIDTH = 296;

/**
 * Create virtual Dash AI thread that appears as a contact
 */
export const createDashAIThread = (
  lastMessage?: string,
  lastMessageAt?: string
): MessageThread => ({
  id: DASH_AI_THREAD_ID,
  type: 'dash_ai',
  subject: 'Dash AI',
  student_id: null,
  last_message_at: lastMessageAt || new Date().toISOString(),
  message_participants: [
    {
      user_id: DASH_AI_USER_ID,
      role: 'ai_assistant',
      profiles: {
        first_name: 'Dash',
        last_name: 'AI',
        role: 'ai_assistant',
      },
    },
  ],
  last_message: lastMessage
    ? {
        content: lastMessage,
        created_at: lastMessageAt || new Date().toISOString(),
        sender_id: DASH_AI_USER_ID,
      }
    : {
        content: "Hi! I'm Dash, your AI assistant. How can I help you today? 🌟",
        created_at: new Date().toISOString(),
        sender_id: DASH_AI_USER_ID,
      },
  unread_count: 0,
});

/**
 * Wallpaper preset mappings
 */
export const WALLPAPER_PRESETS: Record<string, string> = {
  'purple-glow': 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
  midnight: 'linear-gradient(180deg, #0a0f1e 0%, #1a1a2e 50%, #0a0f1e 100%)',
  'ocean-deep': 'linear-gradient(180deg, #0c4a6e 0%, #164e63 50%, #0f172a 100%)',
  'forest-night': 'linear-gradient(180deg, #14532d 0%, #1e3a3a 50%, #0f172a 100%)',
  'sunset-warm': 'linear-gradient(180deg, #7c2d12 0%, #4a1d1d 50%, #0f172a 100%)',
  'dark-slate': 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
};

/**
 * Format message time for display
 */
export const formatMessageTime = (timestamp: string | undefined | null): string => {
  if (!timestamp) return '';

  const date = new Date(timestamp);

  // Handle invalid dates
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) {
    return 'Just now';
  } else if (diffInHours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Get date separator label (Today, Yesterday, Weekday, or Date)
 */
export const getDateSeparatorLabel = (timestamp: string): string => {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Reset time parts for comparison
  const messageDateOnly = new Date(
    messageDate.getFullYear(),
    messageDate.getMonth(),
    messageDate.getDate()
  );
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate()
  );

  if (messageDateOnly.getTime() === todayOnly.getTime()) {
    return 'Today';
  }
  if (messageDateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Yesterday';
  }

  // Check if within the last 7 days - show weekday name
  const daysDiff = Math.floor(
    (todayOnly.getTime() - messageDateOnly.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff < 7) {
    return messageDate.toLocaleDateString([], { weekday: 'long' });
  }

  // Older than a week - show full date
  return messageDate.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
};

/**
 * Get date key for grouping messages
 */
export const getDateKey = (timestamp: string): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/**
 * Get initials for avatar display
 */
export const getInitials = (name: string): string => {
  if (!name || name.trim() === '') return '?';
  const parts = name
    .trim()
    .split(' ')
    .filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return parts[0]?.[0]?.toUpperCase() || '?';
};

/**
 * Get role-based gradient colors
 */
export const getRoleGradient = (
  role: string,
  isActive: boolean,
  isDashAI = false
): string => {
  if (isDashAI) {
    return isActive
      ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(236, 72, 153, 0.2) 100%)'
      : 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(236, 72, 153, 0.05) 100%)';
  }
  if (role === 'principal') {
    return isActive
      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(168, 85, 247, 0.2) 100%)'
      : 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)';
  }
  return isActive
    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(99, 102, 241, 0.15) 100%)'
    : 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.04) 100%)';
};

/**
 * Get avatar gradient based on role
 */
export const getAvatarGradient = (role: string, isDashAI = false): string => {
  if (isDashAI) {
    return 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)';
  }
  if (role === 'principal') {
    return 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)';
  }
  return 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)';
};
