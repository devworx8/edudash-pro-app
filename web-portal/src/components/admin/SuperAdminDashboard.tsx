'use client';

/**
 * Comprehensive SuperAdmin Dashboard for Web
 * Modern, professional design with glassmorphism and smooth animations
 * Updated: 2025-11-12 - Grid layout for System Status
 */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users,
  Activity,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Shield,
  Zap,
  Settings,
  RefreshCw,
  UserPlus,
  Building2,
  Clock,
  Eye,
  Edit,
  Trash2,
  Mail,
  XCircle,
  AlertTriangle,
  Globe,
  Database,
  Cpu,
  HardDrive,
  Gift,
} from 'lucide-react';

interface DashboardData {
  user_stats: {
    total_users: number;
    active_users: number;
    inactive_users: number;
    superadmins: number;
    principals: number;
    teachers: number;
    parents: number;
  };
  generated_at: string;
  success: boolean;
}

interface SystemStatus {
  test_suite: string;
  run_at: string;
  superadmin_count: number;
  current_user_role: string;
  current_user_id: string;
  is_superadmin: boolean;
  system_status: string;
}

interface UserActivity {
  id: string;
  email: string;
  action: string;
  timestamp: string;
  ip_address?: string;
  details?: any;
}

interface RecentUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  updated_at: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
  status: string;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  user_email: string;
  risk_level: string;
  created_at: string;
  ip_address?: string;
}

// Stats Card Component
interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down';
  icon: React.ElementType;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

function StatsCard({ title, value, change, trend, icon: Icon, color }: StatsCardProps) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div className="group relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl border border-gray-200 dark:border-gray-700 p-6 transition-all duration-300 overflow-hidden">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${colorClasses[color]} opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity`}></div>
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 bg-gradient-to-br ${colorClasses[color]} rounded-xl shadow-md`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
              trend === 'up' 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              <TrendingUp className={`w-3 h-3 ${trend === 'down' ? 'rotate-180' : ''}`} />
            </div>
          )}
        </div>
        
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</h3>
        <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{value}</p>
        {change && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{change}</p>
        )}
      </div>
    </div>
  );
}

// Action Button Component
interface ActionButtonProps {
  icon: React.ElementType;
  label: string;
  href: string;
}

function ActionButton({ icon: Icon, label, href }: ActionButtonProps) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 bg-white/50 dark:bg-gray-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group shadow-sm hover:shadow-md"
    >
      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-600 transition-colors">
        <Icon className="w-5 h-5 text-blue-600 group-hover:text-white transition-colors" />
      </div>
      <span className="font-medium text-gray-900 dark:text-white text-sm">{label}</span>
    </a>
  );
}

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [recentActivity, setRecentActivity] = useState<UserActivity[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null);

      // Fetch dashboard statistics
      const { data: dashboardResult, error: dashboardError } = await supabase
        .rpc('get_superadmin_dashboard_data');

      if (dashboardError) {
        console.warn('Dashboard RPC error (using fallback):', dashboardError.message);
        // Use fallback: Query profiles directly
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('role, updated_at');
        
        if (!profilesError && profiles) {
          const now = new Date();
          const oneDayAgo = new Date(now.getTime() - 86400000);
          
          setDashboardData({
            user_stats: {
              total_users: profiles.length,
              active_users: profiles.filter((p: any) => 
                p.updated_at && new Date(p.updated_at) > oneDayAgo
              ).length,
              inactive_users: profiles.filter((p: any) => 
                !p.updated_at || new Date(p.updated_at) <= oneDayAgo
              ).length,
              superadmins: profiles.filter((p: any) => p.role === 'superadmin').length,
              principals: profiles.filter((p: any) => p.role === 'principal').length,
              teachers: profiles.filter((p: any) => p.role === 'teacher').length,
              parents: profiles.filter((p: any) => p.role === 'parent').length,
            },
            generated_at: new Date().toISOString(),
            success: true,
          });
        }
      } else if (dashboardResult && dashboardResult.success) {
        setDashboardData(dashboardResult.data || dashboardResult);
      }

      // Test system health
      const { data: systemResult, error: systemError } = await supabase
        .rpc('test_superadmin_system');

      if (systemError) {
        console.warn('System test RPC error (using fallback):', systemError.message);
        // Fallback system status
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user?.id)
          .single();
        
        setSystemStatus({
          test_suite: 'Fallback Status',
          run_at: new Date().toISOString(),
          superadmin_count: 1,
          current_user_role: profile?.role || 'unknown',
          current_user_id: user?.id || '',
          is_superadmin: profile?.role === 'superadmin',
          system_status: profile?.role === 'superadmin' ? 'operational' : 'limited_access',
        });
      } else if (systemResult) {
        setSystemStatus(systemResult);
      }

      // Fetch recent activity (from audit log) - Handle if table doesn't exist
      const { data: activityData } = await supabase
        .from('superadmin_audit_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);

      if (activityData) {
        setRecentActivity(activityData);
      }

      // Fetch recent users (last 10 updated)
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, updated_at')
        .order('updated_at', { ascending: false })
        .limit(10);

      if (usersData) {
        setRecentUsers(usersData);
      }

      // Fetch pending invitations
      const { data: invitationsData } = await supabase
        .from('user_invitations')
        .select('id, email, role, created_at, status')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      if (invitationsData) {
        setPendingInvitations(invitationsData);
      }

      // Fetch recent security events
      const { data: securityData } = await supabase
        .from('security_events')
        .select('id, event_type, user_email, risk_level, created_at, ip_address')
        .order('created_at', { ascending: false })
        .limit(10);

      if (securityData) {
        setSecurityEvents(securityData);
      }

    } catch (error: any) {
      console.error('Failed to fetch dashboard data:', error);
      setError(error.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'operational':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'no_superadmins':
      case 'limited_access':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'error':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    }
  };

  const formatNumber = (num: number) => {
    return num?.toLocaleString() || '0';
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
              Dashboard Error
            </h2>
            <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950">
      {/* Container with proper margins */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 lg:px-12 py-8 md:py-10 lg:py-12 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  SuperAdmin Control Center
                </h1>
                <p className="text-base text-gray-600 dark:text-gray-400 mt-2">
                  Platform-wide oversight and management
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-3 px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="font-semibold">Refresh</span>
          </button>
        </div>

        {/* System Status Banner - UPDATED GRID LAYOUT v2 */}
        {systemStatus && (
          <div className={`p-8 rounded-3xl border-2 backdrop-blur-sm shadow-2xl ${
            systemStatus.is_superadmin 
              ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800' 
              : 'bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Status Indicator */}
              <div className="flex items-center gap-5">
                <div className={`p-4 rounded-2xl shadow-lg ${
                  systemStatus.is_superadmin 
                    ? 'bg-green-100 dark:bg-green-900/30' 
                    : 'bg-yellow-100 dark:bg-yellow-900/30'
                }`}>
                  {systemStatus.is_superadmin ? (
                    <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="w-7 h-7 text-yellow-600 dark:text-yellow-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Overall Status</p>
                  <h3 className="font-bold text-xl text-gray-900 dark:text-white">
                    {systemStatus.system_status.replace('_', ' ').toUpperCase()}
                  </h3>
                </div>
              </div>

              {/* Access Level */}
              <div className="flex items-center gap-5">
                <div className={`p-4 rounded-2xl shadow-lg ${
                  systemStatus.is_superadmin 
                    ? 'bg-blue-100 dark:bg-blue-900/30' 
                    : 'bg-orange-100 dark:bg-orange-900/30'
                }`}>
                  <Shield className={`w-7 h-7 ${
                    systemStatus.is_superadmin 
                      ? 'text-blue-600 dark:text-blue-400' 
                      : 'text-orange-600 dark:text-orange-400'
                  }`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Your Access Level</p>
                  <h3 className={`font-bold text-xl ${
                    systemStatus.is_superadmin 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-orange-600 dark:text-orange-400'
                  }`}>
                    {systemStatus.is_superadmin ? 'Full SuperAdmin' : 'Limited Access'}
                  </h3>
                </div>
              </div>

              {/* SuperAdmins Online */}
              <div className="flex items-center gap-5">
                <div className="p-4 rounded-2xl bg-purple-100 dark:bg-purple-900/30 shadow-lg">
                  <Users className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">SuperAdmins Online</p>
                  <h3 className="font-bold text-xl text-gray-900 dark:text-white">
                    {systemStatus.superadmin_count}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Last checked: {formatTimeAgo(systemStatus.run_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {dashboardData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            <StatsCard
              title="Total Users"
              value={formatNumber(dashboardData.user_stats.total_users)}
              change="+12% from last month"
              trend="up"
              icon={Users}
              color="blue"
            />
            <StatsCard
              title="Active Users"
              value={formatNumber(dashboardData.user_stats.active_users)}
              change="Last 24 hours"
              trend="up"
              icon={Activity}
              color="green"
            />
            <StatsCard
              title="Principals"
              value={formatNumber(dashboardData.user_stats.principals)}
              change={`${dashboardData.user_stats.teachers} teachers`}
              icon={Building2}
              color="purple"
            />
            <StatsCard
              title="Parents"
              value={formatNumber(dashboardData.user_stats.parents)}
              change="Platform engagement"
              icon={Users}
              color="orange"
            />
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Left Column - 2/3 width */}
          <div className="xl:col-span-2 space-y-8">
            
            {/* Quick Actions */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Zap className="w-6 h-6 text-blue-600" />
                Quick Actions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ActionButton icon={Users} label="User Management" href="/admin/users" />
                <ActionButton icon={Gift} label="Promotions & Pricing" href="/admin/promotions" />
                <ActionButton icon={Zap} label="AI Configuration" href="/admin/ai-config" />
                <ActionButton icon={Building2} label="CAPS Mapping" href="/admin/caps-mapping" />
              </div>
            </div>

            {/* User Management */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <Users className="w-6 h-6 text-blue-600" />
                  Recent Users
                </h2>
                <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center gap-2 text-sm font-semibold">
                  <UserPlus className="w-5 h-5" />
                  Add User
                </button>
              </div>

              <div className="space-y-4">
                {recentUsers.length > 0 ? (
                  recentUsers.slice(0, 5).map((user) => {
                    const initials = user.full_name 
                      ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()
                      : user.email.substring(0, 2).toUpperCase();
                    const isRecentlyActive = user.updated_at && 
                      new Date().getTime() - new Date(user.updated_at).getTime() < 3600000; // 1 hour
                    
                    return (
                      <div
                        key={user.id}
                        className="group p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all bg-white/50 dark:bg-gray-900/50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md">
                                {initials}
                              </div>
                              {isRecentlyActive && (
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></div>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {user.full_name || user.email.split('@')[0]}
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                              <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                {user.role.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
                              <Eye className="w-4 h-4 text-blue-600" />
                            </button>
                            <button className="p-2 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-lg transition-colors">
                              <Edit className="w-4 h-4 text-yellow-600" />
                            </button>
                            <button className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No users found
                  </div>
                )}
              </div>

              <div className="mt-4 text-center">
                <a href="/admin/users" className="text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline">
                  View All Users →
                </a>
              </div>
            </div>
          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-8">
            
            {/* Pending Invitations */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Mail className="w-6 h-6 text-blue-600" />
                Pending Invitations
              </h2>
              <div className="space-y-3">
                {pendingInvitations.length > 0 ? (
                  pendingInvitations.slice(0, 5).map((inv) => (
                    <div key={inv.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{inv.email}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {inv.role} • {formatTimeAgo(inv.created_at)}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">
                          Resend
                        </button>
                        <button className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No pending invitations
                  </div>
                )}
              </div>
            </div>

            {/* Security Events */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Shield className="w-6 h-6 text-blue-600" />
                Security Events
              </h2>
              <div className="space-y-3">
                {securityEvents.length > 0 ? (
                  securityEvents.slice(0, 5).map((event) => {
                    const eventConfig = {
                      login_success: { icon: '✅', title: 'Login Success', defaultRisk: 'low' },
                      login_failure: { icon: '❌', title: 'Login Failure', defaultRisk: 'high' },
                      invitation_sent: { icon: '📧', title: 'Invitation Sent', defaultRisk: 'low' },
                      password_reset: { icon: '🔑', title: 'Password Reset', defaultRisk: 'medium' },
                      account_locked: { icon: '🔒', title: 'Account Locked', defaultRisk: 'high' },
                    };
                    
                    const config = eventConfig[event.event_type as keyof typeof eventConfig] || { 
                      icon: '⚠️', 
                      title: event.event_type, 
                      defaultRisk: 'medium' 
                    };
                    const risk = event.risk_level || config.defaultRisk;
                    
                    return (
                      <div key={event.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50">
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{config.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 dark:text-white">{config.title}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{event.user_email}</p>
                          </div>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                            risk === 'high'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              : risk === 'medium'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {risk.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {formatTimeAgo(event.created_at)}
                          {event.ip_address && ` • ${event.ip_address}`}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No security events
                  </div>
                )}
              </div>
            </div>

            {/* System Activity */}
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Clock className="w-6 h-6 text-blue-600" />
                Activity Log
              </h2>
              <div className="space-y-2">
                {recentActivity.length > 0 ? (
                  recentActivity.slice(0, 5).map((activity) => (
                    <div
                      key={activity.id}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {activity.action}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {activity.email} • {formatTimeAgo(activity.timestamp)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
                    No recent activity
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
