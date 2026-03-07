'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { usePrincipalHub } from '@/lib/hooks/principal/usePrincipalHub';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import {
  Users,
  School,
  DollarSign,
  TrendingUp,
  UserPlus,
  FileText,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Activity,
  ShieldCheck,
  Wallet,
  ClipboardList,
  Clock,
  Search,
  Sparkles,
  BookOpen,
  Megaphone,
} from 'lucide-react';
import { PrincipalSidebar } from '@/components/dashboard/principal/PrincipalSidebar';
import { DashAIFullscreenModal } from '@/components/dashboard/principal/DashAIFullscreenModal';
import { TierBadge } from '@/components/ui/TierBadge';

export default function PrincipalDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [dashAIFullscreen, setDashAIFullscreen] = useState(false);

  // Fetch user profile with preschool data
  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);

  const userEmail = profile?.email;
  const userName = profile?.firstName || userEmail?.split('@')[0] || 'Principal';
  const preschoolName = profile?.preschoolName || profile?.organizationName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const userRole = profile?.role;
  const roleDisplay = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'Principal';

  // Data layer — replaces inline Supabase queries
  const { metrics, activities: recentActivities, loading: hubLoading } = usePrincipalHub(preschoolId);

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

      const hour = new Date().getHours();
      if (hour < 12) setGreeting('Good Morning');
      else if (hour < 18) setGreeting('Good Afternoon');
      else setGreeting('Good Evening');

      setAuthLoading(false);
    };

    initAuth();
  }, [router, supabase]);

  const loading = authLoading || profileLoading || hubLoading;

  if (loading) {
    return (
      <PrincipalShell
        tenantSlug={tenantSlug}
        userEmail={userEmail}
        userName={userName}
        preschoolName={preschoolName}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading...</p>
        </div>
      </PrincipalShell>
    );
  }

  // Right sidebar content
  const rightSidebar = (
    <PrincipalSidebar
      metrics={metrics}
      recentActivities={recentActivities}
      preschoolId={preschoolId}
      userId={userId}
      onOpenDashAI={() => setDashAIFullscreen(true)}
    />
  );

  return (
    <>
      <style jsx global>{`
        body, html {
          overflow-x: hidden;
          max-width: 100vw;
        }
        .section, .card, .grid2, .grid3 {
          max-width: 100%;
          overflow-x: hidden;
        }
      `}</style>
      <PrincipalShell
        tenantSlug={tenantSlug}
        userEmail={userEmail}
        userName={userName}
        preschoolName={preschoolName}
        rightSidebar={rightSidebar}
        onOpenDashAI={() => setDashAIFullscreen(true)}
      >
      {/* Search Bar */}
      <div style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>
        <div style={{ position: 'relative' }}>
          <input
            className="searchInput"
            placeholder="Search students, teachers, reports..."
            style={{ width: '100%', paddingRight: '2.5rem' }}
            onKeyDown={(e) => {
              const t = e.target as HTMLInputElement;
              if (e.key === 'Enter' && t.value.trim()) router.push(`/dashboard/principal/search?q=${encodeURIComponent(t.value.trim())}`);
            }}
          />
          <Search className="searchIcon icon16" style={{ right: '0.75rem', left: 'auto' }} />
        </div>
      </div>

      {/* Page Header with Preschool Name */}
      <div className="section" style={{ marginBottom: 0 }}>
        {preschoolName && (
          <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', marginBottom: 16, cursor: 'pointer' }} onClick={() => router.push('/dashboard/principal/settings')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24 }}>🏫</span>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{preschoolName}</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 32 }}>
                <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{roleDisplay}</p>
                <span style={{ opacity: 0.7 }}>•</span>
                <TierBadge userId={userId} size="sm" showUpgrade />
              </div>
            </div>
          </div>
        )}
      </div>

      <h1 className="h1">{greeting}, {userName}</h1>

      {/* Overview Metrics */}
      <div className="section">
        <div className="sectionTitle">School Overview</div>
        <div className="grid2">
          <div className="card tile">
            <div className="metricValue">{metrics.totalStudents}</div>
            <div className="metricLabel">Total Students</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{metrics.totalTeachers}</div>
            <div className="metricLabel">Teaching Staff</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{metrics.totalClasses}</div>
            <div className="metricLabel">Active Classes</div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="section">
        <div className="sectionTitle">Financial Summary</div>
        <div className="grid2">
          <div className="card tile">
            <div className="metricValue" style={{ color: '#10b981' }}>
              R{metrics.revenue.toLocaleString()}
            </div>
            <div className="metricLabel">Registration Fees Collected</div>
          </div>
          <div className="card tile">
            <div className="metricValue" style={{ color: '#f59e0b' }}>
              {metrics.pendingPayments}
            </div>
            <div className="metricLabel">Pending Payments</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{metrics.upcomingEvents}</div>
            <div className="metricLabel">Upcoming Events</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section">
        <div className="sectionTitle">Quick Actions</div>
        <div className="grid2">
          <button className="qa" onClick={() => router.push('/dashboard/principal/students')}>
            <UserPlus className="icon20" />
            <span>Enroll Student</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/teachers')}>
            <School className="icon20" />
            <span>Manage Teachers</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/learner-activity-control')}>
            <AlertTriangle className="icon20" />
            <span>Learner Activity</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/dash-chat')} style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)', color: 'white', border: 'none' }}>
            <Sparkles className="icon20" />
            <span>Chat with Dash AI</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/financials')}>
            <DollarSign className="icon20" />
            <span>View Financials</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/reports')}>
            <FileText className="icon20" />
            <span>Generate Reports</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/messages?create=group')}>
            <Users className="icon20" />
            <span>Create Group</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/calendar')}>
            <Calendar className="icon20" />
            <span>School Calendar</span>
          </button>
        </div>
      </div>

      {/* ECD Planning & Curriculum */}
      <div className="section">
        <div className="sectionTitle">ECD Planning & Curriculum</div>
        <div className="grid2">
          <button className="qa" onClick={() => router.push('/dashboard/principal/ai-year-planner')} style={{ background: 'linear-gradient(135deg, #8b5cf620, #6366f120)', border: '1px solid #8b5cf650' }}>
            <Sparkles className="icon20" style={{ color: '#8b5cf6' }} />
            <span>✨ AI Year Planner</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/year-planner')}>
            <Calendar className="icon20" />
            <span>Year Planner</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/curriculum-themes')}>
            <BookOpen className="icon20" />
            <span>Curriculum Themes</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/lesson-templates')}>
            <FileText className="icon20" />
            <span>Lesson Templates</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/weekly-plans')}>
            <Activity className="icon20" />
            <span>Weekly Plans</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/stem-programs')}>
            <Sparkles className="icon20" />
            <span>STEM Programs</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/timetable')}>
            <Clock className="icon20" />
            <span>Timetable</span>
          </button>
        </div>
      </div>

      {/* School Operations */}
      <div className="section">
        <div className="sectionTitle">School Operations</div>
        <div className="grid2">
          <button className="qa" onClick={() => router.push('/dashboard/principal/excursions')}>
            <span style={{ fontSize: 20 }}>🚌</span>
            <span>Excursion Planner</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/meetings')}>
            <Users className="icon20" />
            <span>Meeting Scheduler</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/activities')}>
            <span style={{ fontSize: 20 }}>🎨</span>
            <span>Activity Library</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/lesson-approvals')}>
            <CheckCircle className="icon20" />
            <span>Lesson Approvals</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/announcements')}>
            <Megaphone className="icon20" />
            <span>Announcements</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/analytics')}>
            <TrendingUp className="icon20" />
            <span>School Analytics</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/staff-leave')}>
            <Calendar className="icon20" />
            <span>Staff Leave</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/waitlist')}>
            <ClipboardList className="icon20" />
            <span>Waitlist</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/compliance')}>
            <ShieldCheck className="icon20" />
            <span>Compliance</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/principal/budget-overview')}>
            <Wallet className="icon20" />
            <span>Budget Overview</span>
          </button>
        </div>
      </div>



      {/* Alerts & Notifications */}
      <div className="section">
        <div className="sectionTitle">Recent Alerts</div>
        <div className="card">
          {metrics.pendingPayments > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderLeft: '4px solid #f59e0b' }}>
              <AlertTriangle size={20} color="#f59e0b" />
              <div>
                <div style={{ fontWeight: 600 }}>Pending Payments</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  {metrics.pendingPayments} payments awaiting review
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderLeft: '4px solid #10b981' }}>
              <CheckCircle size={20} color="#10b981" />
              <div>
                <div style={{ fontWeight: 600 }}>All Systems Operational</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  No urgent actions required at this time
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </PrincipalShell>
      
      {dashAIFullscreen && (
        <DashAIFullscreenModal
          userId={userId}
          onClose={() => setDashAIFullscreen(false)}
        />
      )}
    </>
  );
}
