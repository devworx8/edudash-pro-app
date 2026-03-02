/**
 * Pure helper functions for Enhanced User Management
 *
 * Filtering, color mapping, and formatting utilities.
 */

import { EnhancedUser, UserFilter } from './types';

// ── Color Mapping ──────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#ef4444',
  principal_admin: '#8b5cf6',
  teacher: '#10b981',
  parent: '#f59e0b',
  student: '#3b82f6',
};

export function getRoleColor(role: string): string {
  return ROLE_COLORS[role] || '#6b7280';
}

export function getRiskColor(score: number): string {
  if (score >= 76) return '#ef4444';
  if (score >= 51) return '#f59e0b';
  if (score >= 26) return '#eab308';
  return '#10b981';
}

// ── Formatting ─────────────────────────────────────────────────────────

export function formatLastActivity(lastLoginAt?: string): string {
  if (!lastLoginAt) return 'Never';

  const diff = Date.now() - new Date(lastLoginAt).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// ── Filtering ──────────────────────────────────────────────────────────

const RISK_RANGES = {
  low: [0, 25],
  medium: [26, 50],
  high: [51, 75],
  critical: [76, 100],
} as const;

const ACTIVITY_DAYS = {
  today: 1,
  week: 7,
  month: 30,
  inactive: 90,
} as const;

export function applyUserFilters(
  users: EnhancedUser[],
  filters: UserFilter
): EnhancedUser[] {
  let filtered = users;

  if (filters.role !== 'all') {
    filtered = filtered.filter(user => user.role === filters.role);
  }

  if (filters.status !== 'all') {
    switch (filters.status) {
      case 'active':
        filtered = filtered.filter(user => user.isActive && !user.isSuspended);
        break;
      case 'suspended':
        filtered = filtered.filter(user => user.isSuspended);
        break;
      case 'deleted':
        filtered = filtered.filter(user => !user.isActive);
        break;
    }
  }

  if (filters.organization !== 'all') {
    filtered = filtered.filter(
      user => user.organizationId === filters.organization
    );
  }

  if (filters.riskLevel !== 'all') {
    const [min, max] =
      RISK_RANGES[filters.riskLevel as keyof typeof RISK_RANGES];
    filtered = filtered.filter(
      user => user.riskScore >= min && user.riskScore <= max
    );
  }

  if (filters.lastActivity !== 'all') {
    const days =
      ACTIVITY_DAYS[filters.lastActivity as keyof typeof ACTIVITY_DAYS];
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (filters.lastActivity === 'inactive') {
      filtered = filtered.filter(
        user => !user.lastLoginAt || new Date(user.lastLoginAt) < cutoff
      );
    } else {
      filtered = filtered.filter(
        user => user.lastLoginAt && new Date(user.lastLoginAt) >= cutoff
      );
    }
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      user =>
        user.email.toLowerCase().includes(searchLower) ||
        user.fullName?.toLowerCase()?.includes(searchLower) ||
        user.organizationName?.toLowerCase()?.includes(searchLower) ||
        user.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  }

  return filtered;
}
