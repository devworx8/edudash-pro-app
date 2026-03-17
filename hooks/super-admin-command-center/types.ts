// Platform Command Center — Types & Constants

export interface KPICard {
  id: string;
  label: string;
  value: string | number;
  change?: number;       // % change vs prior period
  changeLabel?: string;  // e.g. "vs last week"
  icon: string;
  color: string;
  sparkline?: number[];  // last 7 data points for mini chart
}

export interface ErrorHeatmapEntry {
  category: string;
  count: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  trend: 'up' | 'down' | 'flat';
}

export interface LiveIncident {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  errorCount: number;
  affectedUsers: number;
  lastSeen: string;
  assignedTeam: string | null;
}

export interface PlatformHealthMetric {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  uptime?: number;
  icon: string;
  color: string;
}

export interface UserGrowthPoint {
  label: string;   // e.g. "Mon", "Tue" or "Mar 10"
  count: number;
}

export interface RoleDistribution {
  role: string;
  count: number;
  color: string;
}

export interface TierDistribution {
  tier: string;
  count: number;
  color: string;
}

export interface AIUsageMetric {
  label: string;
  value: number;
  limit: number;
  color: string;
}

export interface RecentActivity {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  actionLabel: string;
  detail: string;
  timestamp: string;
  icon: string;
  color: string;
}

export interface CommandCenterData {
  kpis: KPICard[];
  errorHeatmap: ErrorHeatmapEntry[];
  liveIncidents: LiveIncident[];
  health: PlatformHealthMetric[];
  userGrowth: UserGrowthPoint[];
  roleDistribution: RoleDistribution[];
  tierDistribution: TierDistribution[];
  aiUsage: AIUsageMetric[];
  recentActivity: RecentActivity[];
  onlineNow: number;
  totalErrors24h: number;
  autoResolved24h: number;
}

// Severity colors
export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
};

// Error category display
export const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  auth: { label: 'Authentication', icon: 'lock-closed', color: '#f97316' },
  data: { label: 'Data / Schema', icon: 'server', color: '#3b82f6' },
  payment: { label: 'Payments', icon: 'card', color: '#ef4444' },
  ai: { label: 'AI Services', icon: 'flash', color: '#8b5cf6' },
  communication: { label: 'Comms', icon: 'chatbubbles', color: '#06b6d4' },
  infrastructure: { label: 'Infrastructure', icon: 'cloud', color: '#64748b' },
};

// Tier colors for distribution chart
export const TIER_COLORS: Record<string, string> = {
  free: '#64748b',
  trial: '#94a3b8',
  starter: '#3b82f6',
  basic: '#06b6d4',
  premium: '#8b5cf6',
  pro: '#f59e0b',
  enterprise: '#10b981',
  school_premium: '#ec4899',
};

// Role colors
export const ROLE_COLORS: Record<string, string> = {
  parent: '#3b82f6',
  teacher: '#10b981',
  principal: '#f59e0b',
  student: '#8b5cf6',
  admin: '#ef4444',
  superadmin: '#ec4899',
  super_admin: '#ec4899',
  independent_user: '#06b6d4',
};
