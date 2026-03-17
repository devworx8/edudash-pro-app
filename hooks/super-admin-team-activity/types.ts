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

/** Activity grouped by date section for timeline view */
export interface ActivityGroup {
  title: string;       // "Today", "Yesterday", "Mar 15", etc.
  date: string;        // ISO date string for sorting
  activities: PlatformActivity[];
}

/** Richer stats for the dashboard header */
export interface ActivityStats {
  today: number;
  thisWeek: number;
  uniqueActors: number;
  /** Breakdown by filter category */
  byCategory: Record<ActivityFilter, number>;
  /** Hourly activity distribution for last 24h (24 values) */
  hourlyDistribution: number[];
  /** Most active team member (name + count) */
  topActor: { name: string; count: number } | null;
}

export type ActivityFilter = 'all' | 'admin' | 'content' | 'user' | 'system';

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string; icon: string; color: string }[] = [
  { id: 'all', label: 'All', icon: 'layers', color: '#8b5cf6' },
  { id: 'admin', label: 'Admin', icon: 'shield', color: '#3b82f6' },
  { id: 'content', label: 'Content', icon: 'document-text', color: '#ec4899' },
  { id: 'user', label: 'Users', icon: 'people', color: '#10b981' },
  { id: 'system', label: 'System', icon: 'server', color: '#f59e0b' },
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
  user_role_changed: { icon: 'swap-horizontal', color: '#6366f1', label: 'Role Changed' },
  user_deleted: { icon: 'trash', color: '#ef4444', label: 'User Deleted' },
  org_created: { icon: 'business', color: '#10b981', label: 'Organization Created' },
  feature_flag_toggled: { icon: 'flag', color: '#f59e0b', label: 'Feature Flag Toggled' },
  system_test_run: { icon: 'checkmark-circle', color: '#8b5cf6', label: 'System Test' },
  login: { icon: 'log-in', color: '#3b82f6', label: 'Login' },
  password_reset: { icon: 'key', color: '#f59e0b', label: 'Password Reset' },
  config_changed: { icon: 'options', color: '#14b8a6', label: 'Config Changed' },
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
  system: ['org_', 'feature_flag_', 'system_', 'config_'],
};

export function matchesFilter(action: string, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  return FILTER_PREFIXES[filter].some((prefix) => action.startsWith(prefix));
}

/** Group activities by date for timeline display */
export function groupByDate(activities: PlatformActivity[]): ActivityGroup[] {
  const groups = new Map<string, PlatformActivity[]>();
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  for (const a of activities) {
    const dayKey = a.created_at.slice(0, 10);
    const existing = groups.get(dayKey);
    if (existing) existing.push(a);
    else groups.set(dayKey, [a]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, acts]) => ({
      title: dateKey === todayKey
        ? 'Today'
        : dateKey === yesterday
          ? 'Yesterday'
          : new Date(dateKey + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' }),
      date: dateKey,
      activities: acts,
    }));
}

/** Build richer stats from activities array */
export function buildStats(activities: PlatformActivity[]): ActivityStats {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const weekActivities = activities.filter(a => a.created_at >= weekStart);
  const todayActivities = weekActivities.filter(a => a.created_at >= todayStart);
  const uniqueActors = new Set(weekActivities.map(a => a.actor_id).filter(Boolean)).size;

  // Category breakdown
  const byCategory: Record<ActivityFilter, number> = { all: activities.length, admin: 0, content: 0, user: 0, system: 0 };
  for (const a of activities) {
    for (const f of ['admin', 'content', 'user', 'system'] as ActivityFilter[]) {
      if (matchesFilter(a.action, f)) { byCategory[f]++; break; }
    }
  }

  // Hourly distribution (last 24h)
  const hourlyDistribution = new Array(24).fill(0);
  const h24Ago = new Date(now.getTime() - 24 * 3_600_000);
  for (const a of activities) {
    const t = new Date(a.created_at);
    if (t >= h24Ago) hourlyDistribution[t.getHours()]++;
  }

  // Top actor
  const actorCounts = new Map<string, { name: string; count: number }>();
  for (const a of weekActivities) {
    const name = a.actor?.full_name || 'System';
    const key = a.actor_id || 'system';
    const entry = actorCounts.get(key);
    if (entry) entry.count++;
    else actorCounts.set(key, { name, count: 1 });
  }
  let topActor: { name: string; count: number } | null = null;
  for (const v of actorCounts.values()) {
    if (!topActor || v.count > topActor.count) topActor = v;
  }

  return { today: todayActivities.length, thisWeek: weekActivities.length, uniqueActors, byCategory, hourlyDistribution, topActor };
}
