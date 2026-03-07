'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TertiaryShell } from '@/components/dashboard/tertiary/TertiaryShell';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, BookOpen, Users, Clock, MoreVertical } from 'lucide-react';

interface Course {
  id: string;
  title: string;
  description: string;
  duration_weeks: number;
  credits: number;
  instructor_id?: string;
  instructor_name?: string;
  enrolled_count: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
}

export default function CoursesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'active' | 'archived'>('all');

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, organization_id')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      // Try to get organization name, but don't fail if it doesn't exist
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

      await loadCourses(profileData?.organization_id);
    } catch (error) {
      console.error('Error in initAuth:', error);
      setLoading(false);
    }
  }

  async function loadCourses(orgId: string) {
    setLoading(true);
    // Mock data for MVP - replace with actual Supabase query
    const mockCourses: Course[] = [
      {
        id: '1',
        title: 'Business Management Fundamentals',
        description: 'Introduction to core business management principles and practices',
        duration_weeks: 12,
        credits: 15,
        instructor_id: 'inst-1',
        instructor_name: 'Dr. Sarah Johnson',
        enrolled_count: 24,
        status: 'active',
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        title: 'Digital Marketing Strategy',
        description: 'Learn modern digital marketing techniques and tools',
        duration_weeks: 8,
        credits: 10,
        instructor_id: 'inst-2',
        instructor_name: 'Mike Peters',
        enrolled_count: 18,
        status: 'active',
        created_at: new Date().toISOString(),
      },
      {
        id: '3',
        title: 'Financial Accounting',
        description: 'Comprehensive course on financial accounting principles',
        duration_weeks: 10,
        credits: 12,
        enrolled_count: 0,
        status: 'draft',
        created_at: new Date().toISOString(),
      },
    ];

    setCourses(mockCourses);
    setLoading(false);
  }

  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || course.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10b981';
      case 'draft':
        return '#f59e0b';
      case 'archived':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  if (!profile) {
    return (
      <TertiaryShell
        userEmail=""
        userName=""
        userRole="admin"
        hideRightSidebar={true}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading...</p>
        </div>
      </TertiaryShell>
    );
  }

  return (
    <TertiaryShell
      tenantSlug={tenantSlug}
      organizationName={organizationName}
      userEmail={profile.email}
      userName={profile.first_name}
      userRole={profile.role}
      hideRightSidebar={true}
    >
      {/* Header with actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="h1">Course Management</h1>
          <p style={{ marginTop: 8, fontSize: 16, color: 'var(--muted)' }}>
            Manage courses, instructors, and curriculum
          </p>
        </div>
        <Link
          href="/dashboard/admin-tertiary/courses/new"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 15,
            textDecoration: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus style={{ width: 20, height: 20 }} />
          Create Course
        </Link>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ flex: '1 1 300px', position: 'relative' }}>
            <Search
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 20,
                height: 20,
                color: 'var(--muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                fontSize: 15,
                color: 'var(--text)',
              }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', gap: 8 }}>
            {['all', 'active', 'draft', 'archived'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as any)}
                className="chip"
                style={{
                  padding: '8px 16px',
                  background: statusFilter === status ? 'var(--primary)' : 'transparent',
                  color: statusFilter === status ? 'white' : 'var(--text)',
                  border: `1px solid ${statusFilter === status ? 'transparent' : 'var(--border)'}`,
                  textTransform: 'capitalize',
                  fontWeight: statusFilter === status ? 600 : 400,
                }}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid2" style={{ marginBottom: 24 }}>
        <div className="card tile">
          <div className="metricValue">{courses.length}</div>
          <div className="metricLabel">Total Courses</div>
        </div>
        <div className="card tile">
          <div className="metricValue">{courses.filter((c) => c.status === 'active').length}</div>
          <div className="metricLabel">Active Courses</div>
        </div>
        <div className="card tile">
          <div className="metricValue">
            {courses.reduce((sum, c) => sum + c.enrolled_count, 0)}
          </div>
          <div className="metricLabel">Total Enrollments</div>
        </div>
        <div className="card tile">
          <div className="metricValue">{courses.filter((c) => c.status === 'draft').length}</div>
          <div className="metricLabel">Draft Courses</div>
        </div>
      </div>

      {/* Courses List */}
      <div className="section">
        <div className="sectionTitle">
          {filteredCourses.length} {filteredCourses.length === 1 ? 'Course' : 'Courses'}
        </div>

        {loading ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)' }}>Loading courses...</p>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <BookOpen style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted)' }} />
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No courses found</p>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first course to get started'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Link
                href="/dashboard/admin-tertiary/courses/new"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  borderRadius: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Plus style={{ width: 20, height: 20 }} />
                Create Course
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {filteredCourses.map((course) => (
              <Link
                key={course.id}
                href={`/dashboard/admin-tertiary/courses/${course.id}`}
                className="card"
                style={{
                  padding: 20,
                  borderLeft: `4px solid ${getStatusColor(course.status)}`,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    {/* Course header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 700 }}>{course.title}</h3>
                      <span
                        className="badge"
                        style={{
                          padding: '4px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          background: `${getStatusColor(course.status)}22`,
                          color: getStatusColor(course.status),
                          borderRadius: 12,
                        }}
                      >
                        {course.status}
                      </span>
                    </div>

                    {/* Description */}
                    <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                      {course.description}
                    </p>

                    {/* Meta info */}
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Clock style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                        <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                          {course.duration_weeks} weeks
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BookOpen style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                        <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                          {course.credits} credits
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                        <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                          {course.enrolled_count} enrolled
                        </span>
                      </div>
                      {course.instructor_name && (
                        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                          Instructor: <span style={{ fontWeight: 600 }}>{course.instructor_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      // TODO: Add menu options
                    }}
                    className="iconBtn"
                    style={{ padding: 8 }}
                  >
                    <MoreVertical style={{ width: 20, height: 20 }} />
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </TertiaryShell>
  );
}
