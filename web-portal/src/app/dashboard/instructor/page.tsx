"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TertiaryShell } from "@/components/dashboard/tertiary/TertiaryShell";
import { BookOpen, Users, FileText, CheckCircle } from "lucide-react";

interface InstructorStats {
  totalCourses: number;
  totalStudents: number;
  totalAssignments: number;
  pendingGrading: number;
}

export default function InstructorDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [stats, setStats] = useState<InstructorStats>({
    totalCourses: 0,
    totalStudents: 0,
    totalAssignments: 0,
    pendingGrading: 0,
  });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [greeting, setGreeting] = useState('');
  const [organizationName, setOrganizationName] = useState<string>();
  const [tenantSlug, setTenantSlug] = useState<string>();

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
    loadDashboardData();
  }, [userId]);

  async function loadDashboardData() {
    try {
      setLoading(true);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      setProfile(profileData);

      // Get organization name
      if (profileData?.organization_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name, slug')
          .eq('id', profileData.organization_id)
          .maybeSingle();
        
        if (orgData) {
          setOrganizationName(orgData.name);
          setTenantSlug(orgData.slug);
        }
      }

      // Get instructor's courses
      const { data: courses } = await supabase
        .from('courses')
        .select('id')
        .eq('instructor_id', userId);

      const courseIds = courses?.map((c: { id: string }) => c.id) || [];

      // Get stats
      const [
        { count: studentsCount },
        { count: assignmentsCount },
        { count: pendingCount }
      ] = await Promise.all([
        supabase
          .from('enrollments')
          .select('*', { count: 'exact', head: true })
          .in('course_id', courseIds.length > 0 ? courseIds : ['']),
        supabase
          .from('assignments')
          .select('*', { count: 'exact', head: true })
          .in('course_id', courseIds.length > 0 ? courseIds : ['']),
        supabase
          .from('assignment_submissions')
          .select('*', { count: 'exact', head: true })
          .in('assignment_id', courseIds.length > 0 ? courseIds : [''])
          .is('grade', null)
      ]);

      setStats({
        totalCourses: courses?.length || 0,
        totalStudents: studentsCount || 0,
        totalAssignments: assignmentsCount || 0,
        pendingGrading: pendingCount || 0,
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <TertiaryShell
        tenantSlug={tenantSlug}
        organizationName={organizationName}
        userEmail={profile?.email}
        userName={profile?.first_name}
        userRole="instructor"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400 dark:text-slate-500">Loading...</p>
        </div>
      </TertiaryShell>
    );
  }

  return (
    <TertiaryShell
      tenantSlug={tenantSlug}
      organizationName={organizationName}
      userEmail={profile?.email}
      userName={profile?.first_name}
      userRole="instructor"
    >
      <h1 className="h1">{greeting}, {profile?.first_name || 'Instructor'}! 👋</h1>
      <p style={{ marginTop: 8, marginBottom: 24, fontSize: 16, color: 'var(--muted)' }}>
        Manage your courses, assignments, and student progress.
      </p>

      {/* Overview Metrics */}
      <div className="section">
        <div className="sectionTitle">My Teaching Overview</div>
        <div className="grid2">
          <div className="card tile">
            <div className="metricValue">{stats.totalCourses}</div>
            <div className="metricLabel">My Courses</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{stats.totalStudents}</div>
            <div className="metricLabel">Total Students</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{stats.totalAssignments}</div>
            <div className="metricLabel">Assignments</div>
          </div>
          <div className="card tile">
            <div className="metricValue" style={{ color: '#f59e0b' }}>{stats.pendingGrading}</div>
            <div className="metricLabel">Pending Grading</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section">
        <div className="sectionTitle">Quick Actions</div>
        <div className="grid2">
          <button className="qa" onClick={() => router.push('/dashboard/instructor/assignments/new')}>
            <FileText className="icon20" />
            <span>Create Assignment</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/instructor/grading')}>
            <CheckCircle className="icon20" />
            <span>Grade Submissions</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/instructor/courses')}>
            <BookOpen className="icon20" />
            <span>View My Courses</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/instructor/students')}>
            <Users className="icon20" />
            <span>My Students</span>
          </button>
        </div>
      </div>

      {/* Getting Started Guide */}
      {stats.totalCourses === 0 && (
        <div className="section">
          <div className="card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', color: 'white' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              👋 Getting Started as an Instructor
            </h3>
            <ul style={{ display: 'grid', gap: 12, fontSize: 15, lineHeight: 1.6 }}>
              <li>📚 Your courses will be assigned by the administrator</li>
              <li>📝 Create assignments and assessments for your students</li>
              <li>✅ Review and grade student submissions</li>
              <li>📊 Track student progress and performance</li>
            </ul>
          </div>
        </div>
      )}
    </TertiaryShell>
  );
}
