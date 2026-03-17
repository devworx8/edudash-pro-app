import type { AlertButton } from '@/components/ui/AlertModal';

export interface ShowAlertConfig {
  title: string;
  message?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  buttons?: AlertButton[];
}

export interface PlatformActivity {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  actor?: {
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: string;
  } | null;
}

export type ActivityFilter = 'all' | 'admin' | 'content' | 'user' | 'system';

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'list' },
  { id: 'admin', label: 'Admin', icon: 'shield' },
  { id: 'content', label: 'Content', icon: 'document-text' },
  { id: 'user', label: 'User Mgmt', icon: 'people' },
  { id: 'system', label: 'System', icon: 'settings' },
];

export const ACTION_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  admin_invited: { icon: 'person-add', color: '#3b82f6', label: 'Admin Invited' },
  admin_deleted: { icon: 'person-remove', color: '#ef4444', label: 'Admin Deleted' },
  admin_status_changed: { icon: 'toggle', color: '#f59e0b', label: 'Status Changed' },
  announcement_created: { icon: 'megaphone', color: '#ec4899', label: 'Announcement Created' },
  announcement_updated: { icon: 'create', color: '#6366f1', label: 'Announcement Updated' },
  social_post_created: { icon: 'share-social', color: '#1877f2', label: 'Social Post Created' },
  social_post_published: { icon: 'checkmark-circle', color: '#10b981', label: 'Post Published' },
  user_tier_changed: { icon: 'hardware-chip', color: '#8b5cf6', label: 'AI Tier Changed' },
  user_deleted: { icon: 'trash', color: '#ef4444', label: 'User Deleted' },
  org_created: { icon: 'business', color: '#10b981', label: 'Organization Created' },
  feature_flag_toggled: { icon: 'flag', color: '#f59e0b', label: 'Feature Flag Toggled' },
  system_test_run: { icon: 'checkmark-circle', color: '#8b5cf6', label: 'System Test' },
  login: { icon: 'log-in', color: '#3b82f6', label: 'Login' },
  password_reset: { icon: 'key', color: '#f59e0b', label: 'Password Reset' },
};

/** Get config for an action, falling back to a generic style */
export function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || {
    icon: 'ellipse',
    color: '#64748b',
    label: action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

/** Filter mapping: which action prefixes belong to each filter category */
const FILTER_PREFIXES: Record<ActivityFilter, string[]> = {
  all: [],
  admin: ['admin_', 'login', 'password_'],
  content: ['announcement_', 'social_'],
  user: ['user_'],
  system: ['org_', 'feature_flag_', 'system_'],
};

export function matchesFilter(action: string, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  return FILTER_PREFIXES[filter].some((prefix) => action.startsWith(prefix));
}
