'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SuperAdminShell } from '@/components/dashboard/superadmin/SuperAdminShell';
import { useSuperAdminDashboard } from '@/lib/hooks/admin/useSuperAdminDashboard';
import Link from 'next/link';
import { BookMarked, Activity, Users, DollarSign, Zap, RefreshCw, AlertCircle } from 'lucide-react';

const TOOL_COLORS: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#a855f7',
  green: '#22c55e',
  orange: '#f97316',
  indigo: '#6366f1',
};

const adminTools = [
  {
    title: 'Registration Management',
    description: 'Review and approve student registrations from all schools in real-time',
    icon: Users,
    href: '/admin/registrations',
    color: TOOL_COLORS.red,
  },
  {
    title: 'User Management & Troubleshooting',
    description: 'Search users, view payment history, tier status, and fix upgrade issues',
    icon: Users,
    href: '/admin/users',
    color: TOOL_COLORS.blue,
  },
  {
    title: 'Promotions & Pricing',
    description: 'Manage trial periods, promotional offers, and subscription pricing',
    icon: DollarSign,
    href: '/admin/promotions',
    color: TOOL_COLORS.purple,
  },
  {
    title: 'AI Provider Configuration',
    description: 'Configure AI providers (Claude/OpenAI) and models per scenario and user tier',
    icon: Zap,
    href: '/admin/ai-config',
    color: TOOL_COLORS.green,
  },
  {
    title: 'CAPS Curriculum Mapping',
    description: 'Map CAPS topics to textbooks and chapters for exam generation',
    icon: BookMarked,
    href: '/admin/caps-mapping',
    color: TOOL_COLORS.orange,
  },
  {
    title: 'System Monitoring',
    description: 'View AI usage, costs, and system health metrics',
    icon: Activity,
    href: '/admin/monitoring',
    color: TOOL_COLORS.indigo,
    disabled: true,
  },
];

export default function AdminDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const { metrics, loading: metricsLoading, error: metricsError, refresh } = useSuperAdminDashboard();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [greeting, setGreeting] = useState('');

  // Initialize auth
  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      setUserId(session.user.id);

      // Set greeting based on time of day
      const hour = new Date().getHours();
      if (hour < 12) setGreeting('Good Morning');
      else if (hour < 18) setGreeting('Good Afternoon');
      else setGreeting('Good Evening');

      setAuthLoading(false);
    };

    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (!userId) return;
    loadProfile();
  }, [userId]);

  async function loadProfile() {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    setProfile(profileData);
  }

  if (authLoading) {
    return (
      <SuperAdminShell
        userEmail={profile?.email}
        userName={profile?.first_name}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400 dark:text-slate-500">Loading...</p>
        </div>
      </SuperAdminShell>
    );
  }

  return (
    <SuperAdminShell
      userEmail={profile?.email}
      userName={profile?.first_name}
      hideRightSidebar={true}
    >
      <h1 className="h1">{greeting}, {profile?.first_name || 'Admin'}! 🛡️</h1>
      <p style={{ marginTop: 8, marginBottom: 24, fontSize: 16, color: 'var(--muted)' }}>
        System-wide platform management and configuration
      </p>

      {/* Platform Overview */}
      <div className="section">
        <div className="sectionTitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          Platform Overview
          <button
            type="button"
            onClick={() => refresh()}
            disabled={metricsLoading}
            className="button secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}
          >
            <RefreshCw size={16} style={{ opacity: metricsLoading ? 0.6 : 1 }} />
            {metricsLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {metricsError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 10,
              marginBottom: 16,
              color: 'var(--destructive)',
            }}
          >
            <AlertCircle size={20} />
            <span>{metricsError}</span>
          </div>
        )}
        <div className="grid2">
          <div className="card tile">
            <div className="metricValue">
              {metricsLoading ? '—' : metrics.totalSchools.toLocaleString()}
            </div>
            <div className="metricLabel">Total Schools</div>
          </div>
          <div className="card tile">
            <div className="metricValue">
              {metricsLoading ? '—' : metrics.totalUsers.toLocaleString()}
            </div>
            <div className="metricLabel">Total Users</div>
          </div>
          <div className="card tile">
            <div className="metricValue">
              {metricsLoading ? '—' : metrics.pendingRegistrations.toLocaleString()}
            </div>
            <div className="metricLabel">Pending Registrations</div>
          </div>
          <div className="card tile">
            <div className="metricValue" style={{ color: '#10b981' }}>
              {metricsLoading ? '—' : '—'}
            </div>
            <div className="metricLabel">System Uptime (coming soon)</div>
          </div>
        </div>
        {!metricsLoading && (metrics.usersByRole.teachers > 0 || metrics.usersByRole.principals > 0 || metrics.usersByRole.parents > 0) && (
          <div style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>
            Users by role: {metrics.usersByRole.teachers} teachers, {metrics.usersByRole.principals} principals, {metrics.usersByRole.parents} parents
          </div>
        )}
      </div>

      {/* Admin Tools */}
      <div className="section">
        <div className="sectionTitle">Admin Tools</div>
        <div className="grid2">
          {adminTools.map((tool) => {
            const Icon = tool.icon;
            const isDisabled = tool.disabled;

            return (
              <Link
                key={tool.href}
                href={isDisabled ? '#' : tool.href}
                className="card"
                style={{
                  opacity: isDisabled ? 0.6 : 1,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  borderLeft: `4px solid ${tool.color}`,
                  padding: 20,
                }}
                onClick={(e) => isDisabled && e.preventDefault()}
              >
                <div style={{ display: 'flex', alignItems: 'start', gap: 16 }}>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: isDisabled ? '#e5e7eb' : tool.color,
                      color: 'white',
                    }}
                  >
                    <Icon style={{ width: 24, height: 24 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {tool.title}
                      {isDisabled && (
                        <span style={{ 
                          padding: '2px 8px', 
                          fontSize: 11, 
                          fontWeight: 600, 
                          background: '#e5e7eb',
                          color: '#6b7280',
                          borderRadius: 12
                        }}>
                          Coming Soon
                        </span>
                      )}
                    </h3>
                    <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
                      {tool.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </SuperAdminShell>
  );
}
