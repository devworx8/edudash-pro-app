import { assertSupabase } from '@/lib/supabase';
import { listActivePlans } from '@/lib/subscriptions/rpc-subscriptions';
import { logger } from '@/lib/logger';
import type { DashboardFetchResult, DashboardStats, RecentAlert, SystemStatus, FeatureFlag } from './types';

/**
 * Fetch all super-admin dashboard data from Supabase.
 * Pure async function — returns structured data without touching React state.
 */
export async function fetchDashboardData(): Promise<DashboardFetchResult> {
  const supabase = assertSupabase();

  // ── Batch 1: RPCs ─────────────────────────────────────────────
  const [dashboardRes, healthRes, logsRes, aiCostRes] = await Promise.all([
    supabase.rpc('get_superadmin_dashboard_data'),
    supabase.rpc('get_system_health_metrics'),
    supabase.rpc('get_recent_error_logs', { hours_back: 24 }),
    supabase.rpc('get_superadmin_ai_usage_cost', { days_back: 30 }),
  ]);

  let systemHealthStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
  let pendingIssues = 0;
  let aiUsageCost = 0;

  // System health
  if (healthRes.data?.success) {
    const dbStatus = healthRes.data.data.database_status;
    const errorCount = healthRes.data.data.recent_errors_24h || 0;
    if (dbStatus === 'critical' || errorCount > 10) {
      systemHealthStatus = 'down';
      pendingIssues += 3;
    } else if (dbStatus === 'degraded' || errorCount > 5) {
      systemHealthStatus = 'degraded';
      pendingIssues += 1;
    }
  }

  // AI cost
  if (aiCostRes.data?.success && aiCostRes.data.data) {
    aiUsageCost = aiCostRes.data.data.monthly_cost || 0;
    if (__DEV__) logger.debug(`AI usage cost for last 30 days: $${aiUsageCost}`);
  } else if (aiCostRes.error && __DEV__) {
    logger.warn('AI cost RPC error:', aiCostRes.error);
  }

  // ── Batch 2: Tenant + subscription + user counts ──────────────
  const [preschoolsRes, schoolsRes, subsRes, usersRes] = await Promise.all([
    supabase.from('preschools').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('subscriptions')
      .select('id,seats_total,plan_id,status,billing_frequency')
      .eq('status', 'active'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const preschoolCount = preschoolsRes.count ?? 0;
  const schoolCount = schoolsRes.count ?? 0;
  const totalOrgs = preschoolCount + schoolCount;
  if (__DEV__) {
    logger.debug(`Tenant count: ${preschoolCount} preschools + ${schoolCount} K-12 = ${totalOrgs}`);
  }

  // Subscriptions → seats + revenue
  const subscriptions = subsRes.data || [];
  let activeSeats = 0;
  let monthlyRevenue = 0;

  if (subscriptions.length > 0) {
    activeSeats = subscriptions.reduce((s, sub: any) => s + (sub.seats_total || 0), 0);
    const planIds = Array.from(new Set(subscriptions.map((s: any) => s.plan_id).filter(Boolean)));

    if (planIds.length > 0) {
      const plans = await listActivePlans(supabase);
      const priceByPlan: Record<string, { monthly: number; annual: number | null }> = {};
      (plans || []).filter((p) => planIds.includes(p.id)).forEach((p: any) => {
        priceByPlan[p.id] = {
          monthly: Number(p.price_monthly || 0),
          annual: p.price_annual != null ? Number(p.price_annual) : null,
        };
      });
      monthlyRevenue = subscriptions.reduce((sum, sub: any) => {
        const price = priceByPlan[sub.plan_id];
        if (!price) return sum;
        if (String(sub.billing_frequency) === 'annual' && price.annual && price.annual > 0) {
          return sum + price.annual / 12;
        }
        return sum + (price.monthly || 0);
      }, 0);
    }
  }

  if (__DEV__) {
    logger.debug(`Subs: ${subscriptions.length} active, ${activeSeats} seats, R${Math.round(monthlyRevenue)}/mo`);
  }

  // ── Alerts ────────────────────────────────────────────────────
  const alerts: RecentAlert[] = [];
  if (logsRes.data?.success && logsRes.data.data?.logs) {
    alerts.push(
      ...logsRes.data.data.logs.slice(0, 3).map((log: any, i: number) => ({
        id: `log_${i}`,
        message: log.message || 'System error occurred',
        severity: (log.level === 'error' ? 'high' : log.level === 'warning' ? 'medium' : 'low') as RecentAlert['severity'],
        timestamp: log.timestamp,
      })),
    );
  }
  if (systemHealthStatus === 'down') {
    alerts.unshift({
      id: 'sys_down',
      message: 'System health degraded - immediate attention required',
      severity: 'high',
      timestamp: new Date().toISOString(),
    });
  }

  if (dashboardRes.error) {
    logger.error('[SuperAdminDashboard] Dashboard RPC error:', dashboardRes.error);
  }

  // ── Stats ─────────────────────────────────────────────────────
  const totalUsers = usersRes.count ?? 0;
  const rpcStats = dashboardRes.data?.data?.user_stats;
  const stats: DashboardStats = {
    total_users: totalUsers || rpcStats?.total_users || 0,
    active_users: rpcStats?.active_users || 0,
    total_organizations: totalOrgs,
    active_seats: activeSeats,
    monthly_revenue: monthlyRevenue,
    ai_usage_cost: aiUsageCost,
    system_health: systemHealthStatus,
    pending_issues: pendingIssues,
  };

  // ── System status card ────────────────────────────────────────
  const dbStatus = healthRes.data?.data?.database_status || 'unknown';
  const dbColor = dbStatus === 'healthy' ? '#10b981' : dbStatus === 'degraded' ? '#f59e0b' : '#ef4444';
  const systemStatus: SystemStatus = {
    database: {
      status: dbStatus === 'healthy' ? 'Operational' : dbStatus === 'degraded' ? 'Degraded' : 'Issues',
      color: dbColor,
    },
    api: {
      status: systemHealthStatus === 'healthy' ? 'All Systems Go' : 'Some Issues',
      color: systemHealthStatus === 'healthy' ? '#10b981' : '#f59e0b',
    },
    security: {
      status: healthRes.data?.data?.rls_enabled ? 'Protected' : 'Warning',
      color: healthRes.data?.data?.rls_enabled ? '#10b981' : '#f59e0b',
    },
  };

  // ── Feature flags from config_kv ──────────────────────────────
  const { data: configData } = await supabase
    .from('config_kv')
    .select('key, value')
    .in('key', [
      'ai_gateway_enabled', 'principal_hub_rollout',
      'stem_generator_enabled', 'mobile_app_rollout', 'payment_gateway_enabled',
    ]);

  const cfg = (configData || []).reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {} as Record<string, any>);

  const aiEnabled = cfg.ai_gateway_enabled === true || process.env.EXPO_PUBLIC_AI_ENABLED === 'true';
  const mobilePct = cfg.mobile_app_rollout?.percentage || 75;

  const featureFlags: FeatureFlag[] = [
    { name: 'AI Gateway', percentage: aiEnabled ? 100 : 0, color: aiEnabled ? '#10b981' : '#ef4444', enabled: aiEnabled },
    { name: 'Principal Hub', percentage: totalOrgs > 0 ? (cfg.principal_hub_rollout?.percentage || 85) : 0, color: totalOrgs > 0 ? '#f59e0b' : '#6b7280', enabled: totalOrgs > 0 },
    { name: 'STEM Generator', percentage: cfg.stem_generator_enabled === true ? 100 : 50, color: cfg.stem_generator_enabled === true ? '#10b981' : '#f59e0b', enabled: cfg.stem_generator_enabled === true },
    { name: 'Payment Gateway', percentage: activeSeats > 0 ? 100 : 0, color: activeSeats > 0 ? '#10b981' : '#6b7280', enabled: activeSeats > 0 },
    { name: 'Mobile App', percentage: mobilePct, color: mobilePct > 50 ? '#10b981' : '#f59e0b', enabled: mobilePct > 0 },
  ];

  return { stats, systemStatus, alerts, featureFlags };
}
