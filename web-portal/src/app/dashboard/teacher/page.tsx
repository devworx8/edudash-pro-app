'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { useTeacherDashboard } from '@/lib/hooks/teacher/useTeacherDashboard';
import { useTeacherUnreadMessages } from '@/lib/hooks/teacher/useTeacherUnreadMessages';
import { useTeacherApproval } from '@/lib/hooks/teacher/useTeacherApproval';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { MetricCard } from '@/components/dashboard/parent/MetricCard';
import { QuickActionCard } from '@/components/dashboard/parent/QuickActionCard';
import { ClassCard } from '@/components/dashboard/teacher/ClassCard';
import { AskAIWidget } from '@/components/dashboard/AskAIWidget';
import { TierBadge } from '@/components/ui/TierBadge';
import { StartLiveLessonWithToggle, QuickCallModal } from '@/components/calls';
import { useCall } from '@/components/calls';
import {
  Users,
  School,
  ClipboardCheck,
  BookOpen,
  MessageCircle,
  Calendar,
  FileText,
  PlusCircle,
  Search,
  Phone,
  Brain,
  Cpu,
  Laptop,
  Sparkles,
  Wand2,
  MonitorPlay,
} from 'lucide-react';

export default function TeacherDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [showQuickCallModal, setShowQuickCallModal] = useState(false);

  // Call functionality
  const { startVoiceCall, startVideoCall } = useCall();

  // Fetch user profile with preschool data
  const { profile, loading: profileLoading, refetch: refetchProfile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);

  const userEmail = profile?.email;
  const userName = profile?.firstName || userEmail?.split('@')[0] || 'Teacher';
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId;
  const userRole = profile?.role;
  const roleDisplay = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'Teacher';
  const subscriptionTier = profile?.subscription_tier || 'starter';
  const isPreschool = profile?.usageType === 'preschool' || profile?.schoolType === 'preschool';
  const teacherSchoolType: 'preschool' | 'k12_school' = isPreschool ? 'preschool' : 'k12_school';
  const teacherSeatStatus = profile?.seat_status;
  const isTeacherSeatActive = profile?.has_active_seat === true || teacherSeatStatus === 'active';

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

  // Keep seat status reasonably fresh for PWA sessions.
  useEffect(() => {
    if (!userId || userRole !== 'teacher') return;

    const refreshProfile = () => {
      void refetchProfile();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshProfile();
      }
    };

    const intervalId = window.setInterval(refreshProfile, 30000);
    window.addEventListener('focus', refreshProfile);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshProfile);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refetchProfile, userId, userRole]);

  // Load dashboard data
  const { metrics, classes, loading: dashboardLoading, refetch } = useTeacherDashboard(userId);
  
  // Load unread message count with real-time updates
  const { unreadCount } = useTeacherUnreadMessages(userId, preschoolId);

  // Approval gate — redirect pending/rejected teachers
  const { approvalState, loading: approvalLoading, allowed: approvalAllowed } = useTeacherApproval(userId, preschoolId);

  useEffect(() => {
    if (approvalLoading || !userId) return;
    if (!approvalAllowed) {
      const params = approvalState === 'rejected' ? '?state=rejected' : '';
      router.replace(`/dashboard/teacher/approval-pending${params}`);
    }
  }, [approvalLoading, approvalAllowed, approvalState, userId, router]);

  const loading = authLoading || profileLoading || dashboardLoading || approvalLoading;

  if (loading) {
    return (
      <TeacherShell
        tenantSlug={tenantSlug}
        userEmail={userEmail}
        userName={userName}
        preschoolName={preschoolName}
        preschoolId={preschoolId}
        userId={userId}
        schoolType={teacherSchoolType}
        unreadCount={unreadCount}
      >
        <div className="flex items-center justify-center min-h-[400px]" role="status" aria-label="Loading teacher dashboard">
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} aria-hidden="true"></div>
            <p className="text-slate-400">Loading dashboard…</p>
          </div>
        </div>
      </TeacherShell>
    );
  }

  return (
    <>
      <style jsx global>{`
        body, html {
          overflow-x: hidden;
          max-width: 100vw;
        }
        .section, .card {
          max-width: 100%;
          overflow-x: hidden;
        }
      `}</style>
      <TeacherShell
        tenantSlug={tenantSlug}
        userEmail={userEmail}
        userName={userName}
        preschoolName={preschoolName}
        preschoolId={preschoolId}
        userId={userId}
        schoolType={teacherSchoolType}
        unreadCount={unreadCount}
      >
      {/* Search Bar */}
      <div style={{ marginTop: 0, marginBottom: '20px' }}>
        <div style={{ position: 'relative' }}>
          <Search className="searchIcon icon16" aria-hidden="true" />
          <input
            className="searchInput"
            aria-label="Search students and classes"
            placeholder="Search students, classes..."
            onKeyDown={(e) => {
              const t = e.target as HTMLInputElement;
              if (e.key === 'Enter' && t.value.trim()) router.push(`/dashboard/teacher/search?q=${encodeURIComponent(t.value.trim())}`);
            }}
          />
        </div>
      </div>

      {/* Page Header with Preschool Name */}
      <div className="section" style={{ marginTop: '8px', marginBottom: '16px' }}>
        {preschoolName && (
          <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', marginBottom: 16, cursor: 'pointer', border: 'none' }} onClick={() => router.push('/dashboard/teacher/classes')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24 }}>🎓</span>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{preschoolName}</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 32 }}>
                <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{roleDisplay}</p>
                <span style={{ opacity: 0.7 }}>•</span>
                <TierBadge userId={userId} size="sm" showUpgrade />
                {userRole === 'teacher' && (
                  <span
                    style={{
                      marginLeft: 4,
                      padding: '2px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.2,
                      textTransform: 'uppercase',
                      background: isTeacherSeatActive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.22)',
                      border: `1px solid ${isTeacherSeatActive ? 'rgba(16,185,129,0.65)' : 'rgba(239,68,68,0.65)'}`,
                    }}
                  >
                    Seat {isTeacherSeatActive ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <h1 className="h1">{greeting}, {userName}</h1>

      {/* Daily Room – routine & TV display */}
      <div className="section" style={{ marginBottom: 16 }}>
        <div
          className="card"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
          onClick={() => router.push('/display')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && router.push('/display')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MonitorPlay size={24} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>Daily Room</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>View today&apos;s routine, lessons &amp; menu on the TV display</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', fontWeight: 600 }}
              onClick={(e) => { e.stopPropagation(); router.push('/display'); }}
            >
              Open Display
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.6)', color: 'white', fontWeight: 600 }}
              onClick={(e) => { e.stopPropagation(); router.push('/dashboard/teacher/timetable'); }}
            >
              My Timetable
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard sections: two distinct grids (Overview + Quick actions) */}
      <div className="dashboardSections">
        {/* Overview Metrics */}
        <div className="section">
          <div className="sectionTitle">Overview</div>
          <div className="grid2">
            <div className="card tile">
              <div className="metricValue">{metrics.totalStudents}</div>
              <div className="metricLabel">Total Students</div>
            </div>
            <div className="card tile">
              <div className="metricValue">{metrics.totalClasses}</div>
              <div className="metricLabel">Active Classes</div>
            </div>
            <div className="card tile">
              <div className="metricValue">{metrics.pendingGrading}</div>
              <div className="metricLabel">Pending Grading</div>
            </div>
            <div className="card tile">
              <div className="metricValue">{metrics.upcomingLessons}</div>
              <div className="metricLabel">Upcoming Lessons</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="section">
          <div className="sectionTitle">Quick actions</div>
          <div className="grid2">
          {isPreschool && (
            <button className="qa" onClick={() => router.push('/dashboard/teacher/lessons/create?mode=quick')}>
              <Wand2 className="icon20" />
              <span>Quick Lesson (AI)</span>
            </button>
          )}
          <button className="qa" aria-label="View progress reports" onClick={() => router.push('/dashboard/teacher/reports')}>
            <FileText className="icon20" />
            <span>Progress Reports</span>
          </button>
          <button className="qa" aria-label="Create a lesson plan" onClick={() => router.push('/dashboard/teacher/lessons')}>
            <BookOpen className="icon20" />
            <span>Create Lesson Plan</span>
          </button>
          <button className="qa" aria-label="Grade assignments" onClick={() => router.push('/dashboard/teacher/assignments')}>
            <ClipboardCheck className="icon20" />
            <span>Grade Assignments</span>
          </button>
          <button className="qa" aria-label="View your classes" onClick={() => router.push('/dashboard/teacher/classes')}>
            <Users className="icon20" />
            <span>View Classes</span>
          </button>
          <button className="qa" aria-label={`Messaging hub${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`} onClick={() => router.push('/dashboard/teacher/messages')} style={{ position: 'relative' }}>
            <MessageCircle className="icon20" />
            <span>Messaging Hub</span>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: 6,
                right: 6,
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: 'var(--danger, #ef4444)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            className="qa"
            onClick={() => router.push('/display')}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none',
              color: 'white',
            }}
          >
            <MonitorPlay className="icon20" />
            <span>Daily Room (TV)</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/teacher/groups')}>
            <Calendar className="icon20" />
            <span>Staff Planning Room</span>
          </button>
          {/* Quick Call Button - Moved from FAB */}
          <button 
            className="qa" 
            onClick={() => setShowQuickCallModal(true)}
            style={{ 
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              border: 'none',
              color: 'white',
            }}
          >
            <Phone className="icon20" />
            <span>Quick Call</span>
          </button>
        </div>
        </div>
      </div>

      {/* STEM Integration Section */}
      <div className="section">
        <div className="sectionTitle">STEM Integration</div>
        <div className="grid2">
          <button 
            className="qa" 
            onClick={() => router.push('/dashboard/teacher/lessons/create?stem=ai')}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
              border: 'none',
              color: 'white',
            }}
          >
            <Brain className="icon20" />
            <span>Create AI-Enhanced Lesson</span>
          </button>
          <button 
            className="qa" 
            onClick={() => router.push('/dashboard/teacher/lessons/create?stem=robotics')}
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
              border: 'none',
              color: 'white',
            }}
          >
            <Cpu className="icon20" />
            <span>Add Robotics Activity</span>
          </button>
          <button 
            className="qa" 
            onClick={() => router.push('/dashboard/teacher/lessons/create?stem=computer_literacy')}
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              border: 'none',
              color: 'white',
            }}
          >
            <Laptop className="icon20" />
            <span>Computer Literacy Module</span>
          </button>
          <button 
            className="qa" 
            onClick={() => router.push('/dashboard/teacher/interactive-activities')}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              color: 'white',
            }}
          >
            <Sparkles className="icon20" />
            <span>Interactive Activities</span>
          </button>
        </div>
      </div>

      {/* Live Lesson Section */}
      {preschoolId && userId && (
        <div className="section">
          <div className="sectionTitle">Live Lessons</div>
          <StartLiveLessonWithToggle 
            preschoolId={preschoolId} 
            teacherId={userId} 
            teacherName={userName}
            subscriptionTier={subscriptionTier}
          />
        </div>
      )}

      {/* My Classes */}
      {classes.length > 0 ? (
        <div className="section">
          <div className="sectionTitle">My Classes</div>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {classes.map((cls) => (
              <div key={cls.id} className="card" style={{ padding: 16 }}>
                <h3 style={{ marginBottom: 8, fontSize: 18, fontWeight: 600 }}>{cls.name}</h3>
                <p style={{ color: 'var(--muted)', marginBottom: 12, fontSize: 14 }}>Grade {cls.grade}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{cls.studentCount}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Students</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>{cls.pendingAssignments}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pending</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success, #10b981)' }}>{cls.upcomingLessons}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Lessons</div>
                  </div>
                </div>
                <button 
                  className="btn btnPrimary" 
                  aria-label={`View ${cls.name} class`}
                  style={{ width: '100%', marginTop: 12 }}
                  onClick={() => router.push(`/dashboard/teacher/classes/${cls.id}`)}
                >
                  View Class
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="section">
          <div className="sectionTitle">My Classes</div>
          <div className="card" role="status" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <School className="icon20" style={{ margin: '0 auto 12px', color: 'var(--muted)' }} aria-hidden="true" />
            <h3 style={{ marginBottom: 8 }}>No classes assigned yet</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 16, maxWidth: 360, margin: '0 auto 16px' }}>
              Classes are assigned by your school administrator. Once assigned, you&apos;ll see your students, lessons, and grading here.
            </p>
            <button
              className="btn btnPrimary"
              aria-label="View available classes"
              onClick={() => router.push('/dashboard/teacher/classes')}
            >
              View Classes
            </button>
          </div>
        </div>
      )}

      {/* Quick Call Modal */}
      <QuickCallModal
        isOpen={showQuickCallModal}
        onClose={() => setShowQuickCallModal(false)}
        onVoiceCall={(userId, userName) => startVoiceCall(userId, userName)}
        onVideoCall={(userId, userName) => startVideoCall(userId, userName)}
        currentUserId={userId}
        preschoolId={preschoolId}
      />
      </TeacherShell>
    </>
  );
}
