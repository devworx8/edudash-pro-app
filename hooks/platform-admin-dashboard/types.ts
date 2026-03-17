import type { AlertButton } from '@/components/ui/AlertModal';

// ── Role Configuration ──────────────────────────

export type PlatformAdminRole = 'system_admin' | 'content_moderator' | 'support_admin' | 'billing_admin';

export interface RoleConfig {
  role: PlatformAdminRole;
  label: string;
  department: string;
  icon: string;
  color: string;
}

export const ROLE_CONFIGS: Record<PlatformAdminRole, RoleConfig> = {
  system_admin: {
    role: 'system_admin',
    label: 'System Admin',
    department: 'Engineering',
    icon: 'hardware-chip',
    color: '#8b5cf6',
  },
  content_moderator: {
    role: 'content_moderator',
    label: 'Content Moderator',
    department: 'Content',
    icon: 'shield-checkmark',
    color: '#f59e0b',
  },
  support_admin: {
    role: 'support_admin',
    label: 'Support Admin',
    department: 'Customer Success',
    icon: 'headset',
    color: '#10b981',
  },
  billing_admin: {
    role: 'billing_admin',
    label: 'Billing Admin',
    department: 'Operations',
    icon: 'wallet',
    color: '#ec4899',
  },
};

// ── Stats ────────────────────────────────────────

export interface StatCard {
  id: string;
  label: string;
  value: string | number;
  icon: string;
  color: string;
  change?: { value: number; direction: 'up' | 'down' };
}

// ── Quick Actions ────────────────────────────────

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  route: string;
  badge?: number;
  externalUrl?: string;
}

// ── Activity ─────────────────────────────────────

export interface ActivityItem {
  id: string;
  action: string;
  actor_name: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ── Dashboard Data ───────────────────────────────

export interface PlatformAdminDashboardData {
  stats: StatCard[];
  quickActions: QuickAction[];
  sharedActions: QuickAction[];
  recentActivity: ActivityItem[];
}

// ── Hook Return Type ─────────────────────────────

export type ShowAlertFn = (opts: {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  buttons?: AlertButton[];
}) => void;

export interface UsePlatformAdminDashboardReturn {
  profile: any;
  authLoading: boolean;
  profileLoading: boolean;
  adminRole: PlatformAdminRole | null;
  roleConfig: RoleConfig | null;
  loading: boolean;
  refreshing: boolean;
  data: PlatformAdminDashboardData | null;
  onRefresh: () => Promise<void>;
  handleQuickAction: (action: QuickAction) => void;
}
