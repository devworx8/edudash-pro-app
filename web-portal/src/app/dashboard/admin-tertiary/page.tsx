"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TertiaryShell } from "@/components/dashboard/tertiary/TertiaryShell";
import { BookOpen, Users, GraduationCap, Building2, TrendingUp } from "lucide-react";

interface DashboardStats {
  totalCourses: number;
  totalInstructors: number;
  totalStudents: number;
  totalCenters: number;
  activeEnrollments: number;
}

export default function AdminTertiaryDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalCourses: 0,
    totalInstructors: 0,
    totalStudents: 0,
    totalCenters: 0,
    activeEnrollments: 0,
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

      // Get stats (filtered by organization_id if applicable)
      const orgFilter = profileData?.organization_id 
        ? { organization_id: profileData.organization_id } 
        : {};

      const [
        { count: coursesCount },
        { count: instructorsCount },
        { count: studentsCount },
        { count: centersCount },
        { count: enrollmentsCount }
      ] = await Promise.all([
        supabase.from('courses').select('*', { count: 'exact', head: true }).match(orgFilter),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).match({ ...orgFilter, role: 'instructor' }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).match({ ...orgFilter, role: 'student' }),
        supabase.from('preschools').select('*', { count: 'exact', head: true }).match(orgFilter),
        supabase.from('enrollments').select('*', { count: 'exact', head: true }).match({ ...orgFilter, status: 'active' })
      ]);

      setStats({
        totalCourses: coursesCount || 0,
        totalInstructors: instructorsCount || 0,
        totalStudents: studentsCount || 0,
        totalCenters: centersCount || 0,
        activeEnrollments: enrollmentsCount || 0,
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
        userRole="admin"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400 dark:text-slate-500">Loading...</p>
        </div>
      </TertiaryShell>
    );
  }

  // Right sidebar content
  const rightSidebar = (
    <>
      {/* At a Glance */}
      <div className="card">
        <div className="sectionTitle">At a glance</div>
        <ul style={{ display: 'grid', gap: 8 }}>
          <li className="listItem">
            <span>Total Courses</span>
            <span className="badge">{stats.totalCourses}</span>
          </li>
          <li className="listItem">
            <span>Instructors</span>
            <span className="badge">{stats.totalInstructors}</span>
          </li>
          <li className="listItem">
            <span>Students</span>
            <span className="badge">{stats.totalStudents}</span>
          </li>
          <li className="listItem">
            <span>Training Centers</span>
            <span className="badge">{stats.totalCenters}</span>
          </li>
        </ul>
      </div>

      {/* Quick Stats */}
      <div className="card">
        <div className="sectionTitle">Enrollment Summary</div>
        <ul style={{ display: 'grid', gap: 8 }}>
          <li className="listItem">
            <span>Active Enrollments</span>
            <span className="badge" style={{ background: '#10b981', color: 'white' }}>{stats.activeEnrollments}</span>
          </li>
          <li className="listItem">
            <span>Pending Applications</span>
            <span className="badge">0</span>
          </li>
          <li className="listItem">
            <span>Completions</span>
            <span className="badge">0</span>
          </li>
        </ul>
      </div>
    </>
  );

  return (
    <TertiaryShell
      tenantSlug={tenantSlug}
      organizationName={organizationName}
      userEmail={profile?.email}
      userName={profile?.first_name}
      userRole="admin"
      rightSidebar={rightSidebar}
    >
      <h1 className="h1">{greeting}, {profile?.first_name || 'Admin'}! 👋</h1>
      <p style={{ marginTop: 8, marginBottom: 24, fontSize: 16, color: 'var(--muted)' }}>
        Manage your adult learning centers, courses, and students.
      </p>

      {/* Overview Metrics */}
      <div className="section">
        <div className="sectionTitle">Platform Overview</div>
        <div className="grid2">
          <div className="card tile">
            <div className="metricValue">{stats.totalCourses}</div>
            <div className="metricLabel">Total Courses</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{stats.totalInstructors}</div>
            <div className="metricLabel">Instructors</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{stats.totalStudents}</div>
            <div className="metricLabel">Students</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{stats.totalCenters}</div>
            <div className="metricLabel">Training Centers</div>
          </div>
        </div>
      </div>

      {/* Enrollment Metrics */}
      <div className="section">
        <div className="sectionTitle">Enrollment Summary</div>
        <div className="grid2">
          <div className="card tile">
            <div className="metricValue" style={{ color: '#10b981' }}>{stats.activeEnrollments}</div>
            <div className="metricLabel">Active Enrollments</div>
          </div>
          <div className="card tile">
            <div className="metricValue">0</div>
            <div className="metricLabel">Pending Applications</div>
          </div>
          <div className="card tile">
            <div className="metricValue">0</div>
            <div className="metricLabel">Courses This Month</div>
          </div>
          <div className="card tile">
            <div className="metricValue">0</div>
            <div className="metricLabel">Completions</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section">
        <div className="sectionTitle">Quick Actions</div>
        <div className="grid2">
          <button className="qa" onClick={() => router.push('/dashboard/admin-tertiary/courses/new')}>
            <BookOpen className="icon20" />
            <span>Create New Course</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/admin-tertiary/instructors/new')}>
            <GraduationCap className="icon20" />
            <span>Add Instructor</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/admin-tertiary/students/new')}>
            <Users className="icon20" />
            <span>Enroll Student</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/admin-tertiary/centers')}>
            <Building2 className="icon20" />
            <span>Manage Centers</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/admin-tertiary/courses')}>
            <BookOpen className="icon20" />
            <span>View All Courses</span>
          </button>
          <button className="qa" onClick={() => router.push('/dashboard/admin-tertiary/reports')}>
            <TrendingUp className="icon20" />
            <span>Generate Reports</span>
          </button>
        </div>
      </div>

      {/* Getting Started Guide */}
      {stats.totalCourses === 0 && (
        <div className="section">
          <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              🚀 Getting Started with Tertiary Education Platform
            </h3>
            <ul style={{ display: 'grid', gap: 12, fontSize: 15, lineHeight: 1.6 }}>
              <li>1. Set up your training centers and locations</li>
              <li>2. Create courses and assign instructors</li>
              <li>3. Enroll adult students (18+) into courses</li>
              <li>4. Monitor progress and manage assessments</li>
            </ul>
          </div>
        </div>
      )}
    </TertiaryShell>
  );
}
