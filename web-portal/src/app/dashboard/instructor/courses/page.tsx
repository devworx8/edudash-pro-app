'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TertiaryShell } from '@/components/dashboard/tertiary/TertiaryShell';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Users, FileText, Clock, ArrowRight } from 'lucide-react';

interface Course {
  id: string;
  title: string;
  description: string;
  enrolled_count: number;
  assignments_count: number;
  pending_grading: number;
  duration_weeks: number;
  status: 'active' | 'draft';
}

export default function InstructorCoursesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

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

      await loadCourses();
    } catch (error) {
      console.error('Error in initAuth:', error);
      setLoading(false);
    }
  }

  async function loadCourses() {
    setLoading(true);
    
    // Mock data for MVP - instructor's assigned courses
    const mockCourses: Course[] = [
      {
        id: '1',
        title: 'Business Management Fundamentals',
        description: 'Introduction to core business management principles and practices',
        enrolled_count: 24,
        assignments_count: 5,
        pending_grading: 8,
        duration_weeks: 12,
        status: 'active',
      },
      {
        id: '2',
        title: 'Digital Marketing Strategy',
        description: 'Learn modern digital marketing techniques and tools',
        enrolled_count: 18,
        assignments_count: 4,
        pending_grading: 3,
        duration_weeks: 8,
        status: 'active',
      },
    ];

    setCourses(mockCourses);
    setLoading(false);
  }

  if (!profile) {
    return (
      <TertiaryShell userEmail="" userName="" userRole="instructor" hideRightSidebar={true}>
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
      <h1 className="h1">My Courses</h1>
      <p style={{ marginTop: 8, marginBottom: 24, fontSize: 16, color: 'var(--muted)' }}>
        View and manage your assigned courses
      </p>

      {/* Stats */}
      <div className="grid2" style={{ marginBottom: 24 }}>
        <div className="card tile">
          <div className="metricValue">{courses.length}</div>
          <div className="metricLabel">Active Courses</div>
        </div>
        <div className="card tile">
          <div className="metricValue">
            {courses.reduce((sum, c) => sum + c.enrolled_count, 0)}
          </div>
          <div className="metricLabel">Total Students</div>
        </div>
        <div className="card tile">
          <div className="metricValue">
            {courses.reduce((sum, c) => sum + c.assignments_count, 0)}
          </div>
          <div className="metricLabel">Total Assignments</div>
        </div>
        <div className="card tile">
          <div className="metricValue" style={{ color: '#f59e0b' }}>
            {courses.reduce((sum, c) => sum + c.pending_grading, 0)}
          </div>
          <div className="metricLabel">Pending Grading</div>
        </div>
      </div>

      {/* Courses List */}
      <div className="section">
        <div className="sectionTitle">Your Courses</div>

        {loading ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)' }}>Loading courses...</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <BookOpen style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted)' }} />
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No courses assigned</p>
            <p style={{ color: 'var(--muted)' }}>Contact your administrator to be assigned to courses</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/dashboard/instructor/courses/${course.id}`}
                className="card"
                style={{
                  padding: 24,
                  borderLeft: '4px solid #667eea',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{course.title}</h3>
                    <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
                      {course.description}
                    </p>

                    {/* Course stats */}
                    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Users style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                          <span style={{ fontSize: 24, fontWeight: 700 }}>{course.enrolled_count}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Students</div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <FileText style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                          <span style={{ fontSize: 24, fontWeight: 700 }}>{course.assignments_count}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Assignments</div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Clock style={{ width: 16, height: 16, color: '#f59e0b' }} />
                          <span style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>
                            {course.pending_grading}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>To Grade</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Manage</span>
                    <ArrowRight style={{ width: 20, height: 20 }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </TertiaryShell>
  );
}
