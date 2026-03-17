// Platform Command Center — Data Fetching Layer
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  CommandCenterData, KPICard, ErrorHeatmapEntry, LiveIncident,
  PlatformHealthMetric, UserGrowthPoint, RoleDistribution,
  TierDistribution, AIUsageMetric, RecentActivity,
} from './types';
import {
  SEVERITY_COLORS, CATEGORY_CONFIG, TIER_COLORS, ROLE_COLORS,
} from './types';

const __DEV__ = process.env.NODE_ENV === 'development';

/** Fetch all command center data in parallel batches */
export async function fetchCommandCenterData(): Promise<CommandCenterData> {
  const supabase = assertSupabase();
  const now = new Date();
  const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const h48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Batch 1: Counts + Errors + Presence ──────────────────────
  const [
    usersRes, orgsPreRes, orgsSchRes, subsRes,
    errors24hRes, errorsPriorRes, incidentsRes,
    presenceRes, activityRes,
  ] = await Promise.all([
    supabase.from('profiles').select('id, role, subscription_tier, created_at', { count: 'exact', head: false }).eq('is_active', true),
    supabase.from('preschools').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('subscriptions').select('id, seats_total, seats_used, status, plan_id, billing_frequency').eq('status', 'active'),
    supabase.from('platform_error_logs').select('id, error_type, severity, status, category, occurred_at, auto_fix_applied').gte('occurred_at', h24Ago),
    supabase.from('platform_error_logs').select('id, category', { count: 'exact', head: true }).gte('occurred_at', h48Ago).lt('occurred_at', h24Ago),
    supabase.from('platform_incidents').select('id, title, severity, status, error_count, affected_users, last_seen_at, assigned_team').in('status', ['open', 'investigating', 'mitigating']).order('severity', { ascending: true }).limit(10),
    supabase.from('user_presence').select('user_id', { count: 'exact', head: true }).eq('status', 'online'),
    supabase.from('platform_activity_log').select('id, actor_id, action, entity_type, metadata, created_at, profiles!platform_activity_log_actor_id_fkey(full_name, role, avatar_url)').order('created_at', { ascending: false }).limit(20),
  ]);

  // ── Batch 2: AI usage + Revenue ──────────────────────────────
  const [aiUsageRes, revenueRes, aiCostRes] = await Promise.all([
    supabase.from('user_ai_usage').select('chat_messages_today, chat_messages_this_month, exams_generated_this_month, images_generated_this_month'),
    supabase.from('payment_transactions').select('amount, status, created_at').eq('status', 'completed').gte('created_at', d7Ago),
    supabase.rpc('get_superadmin_ai_usage_cost', { days_back: 30 }).maybeSingle(),
  ]);

  // ── Process Users ────────────────────────────────────────────
  const profiles = usersRes.data || [];
  const totalUsers = profiles.length;
  const totalOrgs = (orgsPreRes.count ?? 0) + (orgsSchRes.count ?? 0);

  // Role distribution
  const roleCounts: Record<string, number> = {};
  const tierCounts: Record<string, number> = {};
  const dailySignups: Record<string, number> = {};
  for (const p of profiles) {
    const role = p.role || 'unknown';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
    const tier = p.subscription_tier || 'free';
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    // Growth: count signups per day (last 7 days)
    if (p.created_at && p.created_at >= d7Ago) {
      const day = new Date(p.created_at).toLocaleDateString('en-ZA', { weekday: 'short' });
      dailySignups[day] = (dailySignups[day] || 0) + 1;
    }
  }

  const roleDistribution: RoleDistribution[] = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count, color: ROLE_COLORS[role] || '#64748b' }));

  const tierDistribution: TierDistribution[] = Object.entries(tierCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tier, count]) => ({ tier, count, color: TIER_COLORS[tier] || '#64748b' }));

  // User growth sparkline (last 7 days)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIdx = now.getDay(); // 0=Sun
  const orderedDays = [...days.slice(todayIdx === 0 ? 0 : todayIdx), ...days.slice(0, todayIdx === 0 ? 0 : todayIdx)];
  const userGrowth: UserGrowthPoint[] = orderedDays.map(d => ({
    label: d, count: dailySignups[d] || 0,
  }));

  // ── Process Errors ───────────────────────────────────────────
  const errors24h = errors24hRes.data || [];
  const totalErrors24h = errors24h.length;
  const priorErrors = errorsPriorRes.count ?? 0;
  const autoResolved24h = errors24h.filter(e => e.auto_fix_applied).length;

  // Error heatmap by category
  const catCounts: Record<string, { count: number; severities: string[] }> = {};
  for (const e of errors24h) {
    const cat = e.category || 'infrastructure';
    if (!catCounts[cat]) catCounts[cat] = { count: 0, severities: [] };
    catCounts[cat].count++;
    catCounts[cat].severities.push(e.severity);
  }

  const errorHeatmap: ErrorHeatmapEntry[] = Object.entries(catCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([cat, data]) => {
      const worstSeverity = data.severities.includes('critical') ? 'critical'
        : data.severities.includes('high') ? 'high'
        : data.severities.includes('medium') ? 'medium' : 'low';
      const conf = CATEGORY_CONFIG[cat] || { label: cat, icon: 'alert-circle', color: '#64748b' };
      return {
        category: conf.label,
        count: data.count,
        severity: worstSeverity as ErrorHeatmapEntry['severity'],
        color: conf.color,
        trend: priorErrors > 0 && data.count > priorErrors / Object.keys(catCounts).length ? 'up' : 'down',
      };
    });

  // ── Live Incidents ───────────────────────────────────────────
  const liveIncidents: LiveIncident[] = (incidentsRes.data || []).map((inc: any) => ({
    id: inc.id,
    title: inc.title,
    severity: inc.severity,
    status: inc.status,
    errorCount: inc.error_count,
    affectedUsers: inc.affected_users,
    lastSeen: inc.last_seen_at,
    assignedTeam: inc.assigned_team,
  }));

  // ── Subscriptions & Revenue ──────────────────────────────────
  const subs = subsRes.data || [];
  const activeSeats = subs.reduce((s: number, sub: any) => s + (sub.seats_total || 0), 0);
  const transactions = revenueRes.data || [];
  const weeklyRevenue = transactions.reduce((s: number, t: any) => s + (t.amount || 0), 0);

  // ── AI Usage ─────────────────────────────────────────────────
  const aiData = aiUsageRes.data || [];
  const totalChatsToday = aiData.reduce((s: number, u: any) => s + (u.chat_messages_today || 0), 0);
  const totalChatsMonth = aiData.reduce((s: number, u: any) => s + (u.chat_messages_this_month || 0), 0);
  const totalExams = aiData.reduce((s: number, u: any) => s + (u.exams_generated_this_month || 0), 0);
  const totalImages = aiData.reduce((s: number, u: any) => s + (u.images_generated_this_month || 0), 0);
  const aiCostResult = aiCostRes.data as any;
  const aiCost = aiCostResult?.data?.monthly_cost ?? aiCostResult?.monthly_cost ?? 0;

  const aiUsage: AIUsageMetric[] = [
    { label: 'Chats Today', value: totalChatsToday, limit: 10000, color: '#8b5cf6' },
    { label: 'Chats / Month', value: totalChatsMonth, limit: 300000, color: '#3b82f6' },
    { label: 'Exams Generated', value: totalExams, limit: 5000, color: '#f59e0b' },
    { label: 'Images Generated', value: totalImages, limit: 2000, color: '#ec4899' },
  ];

  // ── Platform Health ──────────────────────────────────────────
  const onlineNow = presenceRes.count ?? 0;
  const health: PlatformHealthMetric[] = [
    { name: 'Database', status: 'operational', icon: 'server', color: '#10b981' },
    { name: 'Edge Functions', status: totalErrors24h > 50 ? 'degraded' : 'operational', icon: 'cloud', color: totalErrors24h > 50 ? '#f59e0b' : '#10b981' },
    { name: 'Auth', status: 'operational', icon: 'lock-closed', color: '#10b981' },
    { name: 'Realtime', status: 'operational', icon: 'radio', color: '#10b981' },
    { name: 'Storage', status: 'operational', icon: 'folder', color: '#10b981' },
    { name: 'AI Proxy', status: aiCost > 500 ? 'degraded' : 'operational', icon: 'flash', color: aiCost > 500 ? '#f59e0b' : '#10b981' },
  ];

  // ── KPIs ─────────────────────────────────────────────────────
  const errorChange = priorErrors > 0 ? Math.round(((totalErrors24h - priorErrors) / priorErrors) * 100) : 0;

  const kpis: KPICard[] = [
    { id: 'users', label: 'Total Users', value: totalUsers, icon: 'people', color: '#3b82f6', sparkline: userGrowth.map(d => d.count) },
    { id: 'orgs', label: 'Organizations', value: totalOrgs, icon: 'business', color: '#10b981' },
    { id: 'revenue', label: 'Revenue (7d)', value: `R${Math.round(weeklyRevenue).toLocaleString()}`, icon: 'card', color: '#f59e0b' },
    { id: 'ai-cost', label: 'AI Cost (30d)', value: `$${Math.round(aiCost)}`, icon: 'flash', color: '#8b5cf6' },
    { id: 'errors', label: 'Errors (24h)', value: totalErrors24h, change: errorChange, changeLabel: 'vs prior 24h', icon: 'warning', color: totalErrors24h > 20 ? '#ef4444' : '#22c55e' },
    { id: 'online', label: 'Online Now', value: onlineNow, icon: 'radio', color: '#06b6d4' },
    { id: 'seats', label: 'Active Seats', value: activeSeats, icon: 'person-add', color: '#ec4899' },
    { id: 'auto-fixed', label: 'Auto-Resolved', value: autoResolved24h, icon: 'checkmark-circle', color: '#22c55e' },
  ];

  // ── Recent Activity ──────────────────────────────────────────
  const recentActivity: RecentActivity[] = (activityRes.data || []).map((a: any) => {
    const actor = a.profiles;
    return {
      id: a.id,
      actorName: actor?.full_name || 'System',
      actorRole: actor?.role || 'system',
      action: a.action,
      actionLabel: a.action.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      detail: a.metadata?.email || a.metadata?.entity_name || a.entity_type || '',
      timestamp: a.created_at,
      icon: getActivityIcon(a.action),
      color: getActivityColor(a.action),
    };
  });

  if (__DEV__) {
    logger.debug(`[CommandCenter] ${totalUsers} users, ${totalOrgs} orgs, ${totalErrors24h} errors, ${onlineNow} online`);
  }

  return {
    kpis, errorHeatmap, liveIncidents, health,
    userGrowth, roleDistribution, tierDistribution, aiUsage,
    recentActivity, onlineNow, totalErrors24h, autoResolved24h,
  };
}

function getActivityIcon(action: string): string {
  if (action.startsWith('admin_')) return 'people-circle';
  if (action.startsWith('announcement_')) return 'megaphone';
  if (action.startsWith('social_')) return 'share-social';
  if (action.startsWith('user_')) return 'person';
  if (action.startsWith('org_')) return 'business';
  if (action.startsWith('feature_')) return 'toggle';
  if (action === 'login') return 'log-in';
  return 'ellipse';
}

function getActivityColor(action: string): string {
  if (action.startsWith('admin_')) return '#6366f1';
  if (action.startsWith('announcement_')) return '#ec4899';
  if (action.startsWith('social_')) return '#06b6d4';
  if (action.startsWith('user_')) return '#3b82f6';
  if (action.startsWith('org_')) return '#10b981';
  if (action.startsWith('feature_')) return '#f59e0b';
  if (action === 'login') return '#22c55e';
  return '#64748b';
}
