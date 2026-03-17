import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  PlatformAdminRole,
  StatCard,
  QuickAction,
  ActivityItem,
  PlatformAdminDashboardData,
} from './types';

// ── Stats builders per role ──────────────────────

async function fetchSystemAdminStats(): Promise<StatCard[]> {
  try {
    const supabase = assertSupabase();
    const [usersRes, orgsRes, activityRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('organizations').select('id', { count: 'exact', head: true }),
      supabase
        .from('platform_activity_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 86_400_000).toISOString()),
    ]);
    return [
      { id: 'total-users', label: 'Total Users', value: usersRes.count ?? 0, icon: 'people-outline', color: '#3b82f6' },
      { id: 'total-orgs', label: 'Organizations', value: orgsRes.count ?? 0, icon: 'business-outline', color: '#10b981' },
      { id: 'actions-24h', label: 'Actions (24h)', value: activityRes.count ?? 0, icon: 'pulse-outline', color: '#f59e0b' },
      { id: 'health', label: 'System Health', value: 'Operational', icon: 'checkmark-circle-outline', color: '#22c55e' },
    ];
  } catch (e) {
    logger.error('[PlatformAdmin] fetchSystemAdminStats failed', e);
    return [
      { id: 'total-users', label: 'Total Users', value: 0, icon: 'people-outline', color: '#3b82f6' },
      { id: 'total-orgs', label: 'Organizations', value: 0, icon: 'business-outline', color: '#10b981' },
      { id: 'actions-24h', label: 'Actions (24h)', value: 0, icon: 'pulse-outline', color: '#f59e0b' },
      { id: 'health', label: 'System Health', value: 'Unknown', icon: 'help-circle-outline', color: '#64748b' },
    ];
  }
}

async function fetchContentModeratorStats(): Promise<StatCard[]> {
  try {
    const supabase = assertSupabase();
    const [usersRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    return [
      { id: 'pending', label: 'Pending Reviews', value: 0, icon: 'hourglass-outline', color: '#f59e0b' },
      { id: 'flagged', label: 'Flagged Today', value: 0, icon: 'flag-outline', color: '#ef4444' },
      { id: 'users', label: 'Content Users', value: usersRes.count ?? 0, icon: 'people-outline', color: '#3b82f6' },
      { id: 'rate', label: 'Moderation Rate', value: '100%', icon: 'checkmark-done-outline', color: '#22c55e' },
    ];
  } catch (e) {
    logger.error('[PlatformAdmin] fetchContentModeratorStats failed', e);
    return [
      { id: 'pending', label: 'Pending Reviews', value: 0, icon: 'hourglass-outline', color: '#f59e0b' },
      { id: 'flagged', label: 'Flagged Today', value: 0, icon: 'flag-outline', color: '#ef4444' },
      { id: 'users', label: 'Content Users', value: 0, icon: 'people-outline', color: '#3b82f6' },
      { id: 'rate', label: 'Moderation Rate', value: '—', icon: 'checkmark-done-outline', color: '#64748b' },
    ];
  }
}

async function fetchSupportAdminStats(): Promise<StatCard[]> {
  try {
    const supabase = assertSupabase();
    const [usersRes, activeRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('last_login_at', new Date(Date.now() - 86_400_000).toISOString()),
    ]);
    return [
      { id: 'active', label: 'Active (24h)', value: activeRes.count ?? 0, icon: 'people-outline', color: '#3b82f6' },
      { id: 'total', label: 'Total Users', value: usersRes.count ?? 0, icon: 'person-outline', color: '#10b981' },
      { id: 'tickets', label: 'Open Tickets', value: 0, icon: 'mail-unread-outline', color: '#f59e0b' },
      { id: 'resolution', label: 'Avg Resolution', value: '< 24h', icon: 'timer-outline', color: '#8b5cf6' },
    ];
  } catch (e) {
    logger.error('[PlatformAdmin] fetchSupportAdminStats failed', e);
    return [
      { id: 'active', label: 'Active (24h)', value: 0, icon: 'people-outline', color: '#3b82f6' },
      { id: 'total', label: 'Total Users', value: 0, icon: 'person-outline', color: '#10b981' },
      { id: 'tickets', label: 'Open Tickets', value: 0, icon: 'mail-unread-outline', color: '#f59e0b' },
      { id: 'resolution', label: 'Avg Resolution', value: '—', icon: 'timer-outline', color: '#64748b' },
    ];
  }
}

async function fetchBillingAdminStats(): Promise<StatCard[]> {
  try {
    const supabase = assertSupabase();
    const [subsRes, txRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .neq('subscription_tier', 'free'),
      supabase
        .from('payment_transactions')
        .select('id, amount', { count: 'exact' })
        .eq('status', 'completed')
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);
    const activeSubs = subsRes.count ?? 0;
    const revenue =
      txRes.data?.reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0) ?? 0;
    return [
      { id: 'revenue', label: 'Revenue (MTD)', value: `R${Math.round(revenue).toLocaleString()}`, icon: 'trending-up-outline', color: '#22c55e' },
      { id: 'subs', label: 'Active Subs', value: activeSubs, icon: 'receipt-outline', color: '#3b82f6' },
      { id: 'failed', label: 'Failed Payments', value: 0, icon: 'card-outline', color: '#ef4444' },
      { id: 'churn', label: 'Churn Rate', value: '0%', icon: 'trending-down-outline', color: '#f59e0b' },
    ];
  } catch (e) {
    logger.error('[PlatformAdmin] fetchBillingAdminStats failed', e);
    return [
      { id: 'revenue', label: 'Revenue (MTD)', value: 'R0', icon: 'trending-up-outline', color: '#22c55e' },
      { id: 'subs', label: 'Active Subs', value: 0, icon: 'receipt-outline', color: '#3b82f6' },
      { id: 'failed', label: 'Failed Payments', value: 0, icon: 'card-outline', color: '#ef4444' },
      { id: 'churn', label: 'Churn Rate', value: '—', icon: 'trending-down-outline', color: '#64748b' },
    ];
  }
}

// ── Quick Actions per role ───────────────────────

function getSystemAdminActions(): QuickAction[] {
  return [
    { id: 'command-center', title: 'Command Center', description: 'KPI metrics, errors, health', icon: 'grid', color: '#8b5cf6', route: '/screens/super-admin-platform-command-center' },
    { id: 'monitoring', title: 'System Monitoring', description: 'Health & performance', icon: 'analytics', color: '#f59e0b', route: '/screens/super-admin-system-monitoring' },
    { id: 'devops', title: 'DevOps & Integrations', description: 'GitHub, EAS, Vercel', icon: 'git-branch', color: '#059669', route: '/screens/super-admin-devops' },
    { id: 'system-test', title: 'System Tests', description: 'Run validation suite', icon: 'checkmark-circle', color: '#22c55e', route: '/screens/super-admin-system-test' },
    { id: 'ai-command', title: 'AI Command Center', description: 'AI operations control', icon: 'flash', color: '#00f5ff', route: '/screens/super-admin-ai-command-center' },
    { id: 'activity', title: 'Activity Log', description: 'Platform audit trail', icon: 'time', color: '#14b8a6', route: '/screens/super-admin-team-activity' },
  ];
}

function getContentModeratorActions(): QuickAction[] {
  return [
    { id: 'moderation', title: 'Content Moderation', description: 'Review & moderate content', icon: 'shield-checkmark', color: '#f59e0b', route: '/screens/super-admin-moderation' },
    { id: 'announcements', title: 'Announcements', description: 'Broadcast to schools', icon: 'megaphone', color: '#ec4899', route: '/screens/super-admin-announcements' },
    { id: 'content-studio', title: 'Content Studio', description: 'Social & email content', icon: 'create', color: '#8b5cf6', route: '/screens/super-admin-content-studio' },
    { id: 'users', title: 'User Reports', description: 'Review flagged users', icon: 'alert-circle', color: '#ef4444', route: '/screens/super-admin-users' },
    { id: 'orgs', title: 'Organizations', description: 'View school content', icon: 'business', color: '#10b981', route: '/screens/super-admin-organizations' },
    { id: 'whatsapp', title: 'WhatsApp Hub', description: 'Communications', icon: 'logo-whatsapp', color: '#25d366', route: '/screens/super-admin-whatsapp' },
  ];
}

function getSupportAdminActions(): QuickAction[] {
  return [
    { id: 'users', title: 'User Management', description: 'Manage users & roles', icon: 'people', color: '#3b82f6', route: '/screens/super-admin-users' },
    { id: 'orgs', title: 'Organizations', description: 'View & manage schools', icon: 'business', color: '#10b981', route: '/screens/super-admin-organizations' },
    { id: 'whatsapp', title: 'WhatsApp Support', description: 'WhatsApp comms', icon: 'logo-whatsapp', color: '#25d366', route: '/screens/super-admin-whatsapp' },
    { id: 'activity', title: 'Activity Log', description: 'Platform audit trail', icon: 'time', color: '#14b8a6', route: '/screens/super-admin-team-activity' },
    { id: 'announcements', title: 'Announcements', description: 'Broadcast messages', icon: 'megaphone', color: '#ec4899', route: '/screens/super-admin-announcements' },
    { id: 'admin-mgmt', title: 'Admin Management', description: 'Manage admin users', icon: 'people-circle', color: '#6366f1', route: '/screens/super-admin-admin-management' },
  ];
}

function getBillingAdminActions(): QuickAction[] {
  return [
    { id: 'quotas', title: 'AI Quota Management', description: 'Monitor & manage quotas', icon: 'hardware-chip', color: '#10b981', route: '/screens/super-admin-ai-quotas' },
    { id: 'ai-usage', title: 'AI Usage Analytics', description: 'Chat & image usage', icon: 'stats-chart', color: '#f59e0b', route: '/screens/super-admin-ai-usage' },
    { id: 'orgs', title: 'Organizations', description: 'School billing overview', icon: 'business', color: '#10b981', route: '/screens/super-admin-organizations' },
    { id: 'admin-mgmt', title: 'Admin Management', description: 'Platform admins', icon: 'people-circle', color: '#6366f1', route: '/screens/super-admin-admin-management' },
    { id: 'announcements', title: 'Announcements', description: 'Billing notifications', icon: 'megaphone', color: '#ec4899', route: '/screens/super-admin-announcements' },
    { id: 'activity', title: 'Activity Log', description: 'Platform audit trail', icon: 'time', color: '#14b8a6', route: '/screens/super-admin-team-activity' },
  ];
}

function getSharedActions(): QuickAction[] {
  return [
    { id: 'team-chat', title: 'Team Chat', description: 'Internal messaging', icon: 'chatbubbles', color: '#6366f1', route: '/screens/super-admin-team-chat' },
  ];
}

// ── Recent Activity ──────────────────────────────

async function fetchRecentActivity(): Promise<ActivityItem[]> {
  try {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('platform_activity_log')
      .select('id, action, actor_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error || !data) return [];
    return data.map((row: any) => ({
      id: row.id,
      action: row.action,
      actor_name: row.metadata?.target_name || row.metadata?.actor_name || 'System',
      timestamp: row.created_at,
      metadata: row.metadata,
    }));
  } catch {
    return [];
  }
}

// ── Main fetch ───────────────────────────────────

export async function fetchPlatformAdminData(
  role: PlatformAdminRole,
): Promise<PlatformAdminDashboardData> {
  let stats: StatCard[];
  let quickActions: QuickAction[];

  switch (role) {
    case 'system_admin':
      stats = await fetchSystemAdminStats();
      quickActions = getSystemAdminActions();
      break;
    case 'content_moderator':
      stats = await fetchContentModeratorStats();
      quickActions = getContentModeratorActions();
      break;
    case 'support_admin':
      stats = await fetchSupportAdminStats();
      quickActions = getSupportAdminActions();
      break;
    case 'billing_admin':
      stats = await fetchBillingAdminStats();
      quickActions = getBillingAdminActions();
      break;
    default:
      stats = [];
      quickActions = [];
  }

  const recentActivity = await fetchRecentActivity();

  return {
    stats,
    quickActions,
    sharedActions: getSharedActions(),
    recentActivity,
  };
}
