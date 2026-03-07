'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TertiaryShell } from '@/components/dashboard/tertiary/TertiaryShell';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Users,
  BookOpen,
  Clock,
  Award,
  FileText,
  CheckCircle,
} from 'lucide-react';

interface Course {
  id: string;
  title: string;
  description: string;
  duration_weeks: number;
  credits: number;
  prerequisites?: string;
  learning_outcomes?: string;
  instructor_id?: string;
  instructor_name?: string;
  enrolled_count: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
}

export default function CourseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params?.id as string;
  const supabase = createClient();
  
  const [profile, setProfile] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

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

      await loadCourse();
    } catch (error) {
      console.error('Error in initAuth:', error);
      setLoading(false);
    }
  }

  async function loadCourse() {
    setLoading(true);
    
    // Mock data for MVP - replace with actual Supabase query
    const mockCourse: Course = {
      id: courseId,
      title: 'Business Management Fundamentals',
      description: 'This comprehensive course covers essential business management principles including strategic planning, operations management, human resources, and financial oversight. Students will learn practical skills for managing teams, projects, and organizational resources effectively.',
      duration_weeks: 12,
      credits: 15,
      prerequisites: 'Basic understanding of business concepts\nMinimum age: 18 years\nHigh school diploma or equivalent',
      learning_outcomes: 'Understand core business management principles\nApply strategic planning frameworks\nManage teams and projects effectively\nAnalyze financial statements and budgets\nMake data-driven business decisions',
      instructor_id: 'inst-1',
      instructor_name: 'Dr. Sarah Johnson',
      enrolled_count: 24,
      status: 'active',
      created_at: new Date().toISOString(),
    };

    setCourse(mockCourse);
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
      return;
    }

    try {
      // TODO: Implement actual delete
      router.push('/dashboard/admin-tertiary/courses');
    } catch (error) {
      console.error('Error deleting course:', error);
      alert('Failed to delete course');
    }
  }

  async function handleStatusChange(newStatus: 'draft' | 'active' | 'archived') {
    if (!course) return;

    try {
      // TODO: Implement actual update
      setCourse({ ...course, status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update course status');
    }
  }

  if (!profile || loading) {
    return (
      <TertiaryShell
        userEmail=""
        userName=""
        userRole="admin"
        hideRightSidebar={true}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        </div>
      </TertiaryShell>
    );
  }

  if (!course) {
    return (
      <TertiaryShell
        tenantSlug={tenantSlug}
        organizationName={organizationName}
        userEmail={profile.email}
        userName={profile.first_name}
        userRole={profile.role}
        hideRightSidebar={true}
      >
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Course not found</p>
          <Link href="/dashboard/admin-tertiary/courses" style={{ color: 'var(--primary)' }}>
            Return to courses
          </Link>
        </div>
      </TertiaryShell>
    );
  }

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

  return (
    <TertiaryShell
      tenantSlug={tenantSlug}
      organizationName={organizationName}
      userEmail={profile.email}
      userName={profile.first_name}
      userRole={profile.role}
      hideRightSidebar={true}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/dashboard/admin-tertiary/courses"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            padding: '8px 16px',
            fontSize: 14,
            color: 'var(--muted)',
            textDecoration: 'none',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          Back to Courses
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h1 className="h1" style={{ marginBottom: 0 }}>{course.title}</h1>
              <span
                className="badge"
                style={{
                  padding: '6px 16px',
                  fontSize: 13,
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
            <p style={{ fontSize: 16, color: 'var(--muted)' }}>{course.description}</p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setIsEditing(!isEditing)}
              style={{
                padding: '10px 20px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <Edit style={{ width: 18, height: 18 }} />
              Edit
            </button>
            <button
              onClick={handleDelete}
              style={{
                padding: '10px 20px',
                border: '1px solid #ef4444',
                color: '#ef4444',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <Trash2 style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid2" style={{ marginBottom: 24 }}>
        <div className="card tile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Users style={{ width: 24, height: 24, color: '#667eea' }} />
            <div className="metricValue">{course.enrolled_count}</div>
          </div>
          <div className="metricLabel">Enrolled Students</div>
        </div>
        <div className="card tile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Clock style={{ width: 24, height: 24, color: '#f59e0b' }} />
            <div className="metricValue">{course.duration_weeks}</div>
          </div>
          <div className="metricLabel">Weeks Duration</div>
        </div>
        <div className="card tile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Award style={{ width: 24, height: 24, color: '#10b981' }} />
            <div className="metricValue">{course.credits}</div>
          </div>
          <div className="metricLabel">Credits</div>
        </div>
        <div className="card tile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <BookOpen style={{ width: 24, height: 24, color: '#8b5cf6' }} />
            <div className="metricValue">0</div>
          </div>
          <div className="metricLabel">Assignments</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Main Content */}
        <div>
          {/* Prerequisites */}
          {course.prerequisites && (
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <FileText style={{ width: 20, height: 20, color: 'var(--primary)' }} />
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>Prerequisites</h3>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-line' }}>
                {course.prerequisites}
              </div>
            </div>
          )}

          {/* Learning Outcomes */}
          {course.learning_outcomes && (
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <CheckCircle style={{ width: 20, height: 20, color: '#10b981' }} />
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>Learning Outcomes</h3>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text)' }}>
                {course.learning_outcomes.split('\n').map((outcome, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    <span style={{ color: '#10b981' }}>•</span>
                    <span>{outcome}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Placeholder for modules/content */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Course Content</h3>
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
              <BookOpen style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.5 }} />
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No modules yet</p>
              <p style={{ fontSize: 14 }}>Add course modules and materials to get started</p>
              <button
                style={{
                  marginTop: 16,
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  borderRadius: 8,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Add Module
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Instructor */}
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Instructor</h3>
            {course.instructor_name ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  className="avatar"
                  style={{
                    width: 48,
                    height: 48,
                    fontSize: 18,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  }}
                >
                  {course.instructor_name[0]}
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>{course.instructor_name}</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>Course Instructor</p>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)' }}>
                <p style={{ fontSize: 14, marginBottom: 12 }}>No instructor assigned</p>
                <button
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  Assign Instructor
                </button>
              </div>
            )}
          </div>

          {/* Status Management */}
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['draft', 'active', 'archived'].map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status as any)}
                  className={course.status === status ? 'navItemActive' : 'navItem'}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    textAlign: 'left',
                    textTransform: 'capitalize',
                    fontSize: 14,
                    fontWeight: course.status === status ? 600 : 400,
                    border: `1px solid ${course.status === status ? getStatusColor(status) : 'var(--border)'}`,
                    background: course.status === status ? `${getStatusColor(status)}11` : 'transparent',
                    color: course.status === status ? getStatusColor(status) : 'var(--text)',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Quick Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                style={{
                  padding: '10px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  textAlign: 'left',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <Users style={{ width: 16, height: 16 }} />
                View Students
              </button>
              <button
                style={{
                  padding: '10px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  textAlign: 'left',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <BookOpen style={{ width: 16, height: 16 }} />
                Add Assignment
              </button>
            </div>
          </div>
        </div>
      </div>
    </TertiaryShell>
  );
}
