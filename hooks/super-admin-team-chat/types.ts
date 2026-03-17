import type { AlertButton } from '@/components/ui/AlertModal';

export interface ShowAlertConfig {
  title: string;
  message?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  buttons?: AlertButton[];
}

export interface TeamChannel {
  id: string;
  name: string;
  description: string | null;
  channel_type: 'general' | 'announcements' | 'dev' | 'support' | 'operations' | 'custom';
  created_by: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  unread_count?: number;
  last_message?: TeamMessage | null;
  member_count?: number;
}

export interface TeamChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  profile?: {
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: string;
  };
}

export interface TeamMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  content_type: 'text' | 'image' | 'file' | 'system';
  reply_to_id: string | null;
  is_pinned: boolean;
  is_edited: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  sender?: {
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
  reply_to?: {
    content: string;
    sender?: { full_name: string };
  } | null;
}

export interface TeamChatState {
  channels: TeamChannel[];
  activeChannel: TeamChannel | null;
  messages: TeamMessage[];
  members: TeamChannelMember[];
  loading: boolean;
  sendingMessage: boolean;
  refreshing: boolean;
}

export const CHANNEL_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  general: { icon: 'chatbubbles', color: '#3b82f6', label: 'General' },
  announcements: { icon: 'megaphone', color: '#f59e0b', label: 'Announcements' },
  dev: { icon: 'code-slash', color: '#8b5cf6', label: 'Development' },
  support: { icon: 'help-buoy', color: '#10b981', label: 'Support' },
  operations: { icon: 'settings', color: '#6366f1', label: 'Operations' },
  custom: { icon: 'chatbubble', color: '#ec4899', label: 'Custom' },
};
