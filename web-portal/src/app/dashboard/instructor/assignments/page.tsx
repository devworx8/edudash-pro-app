'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TertiaryShell } from '@/components/dashboard/tertiary/TertiaryShell';
import { useRouter } from 'next/navigation';
import { Plus, FileText, Calendar, BookOpen, Users, Clock } from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  course_title: string;
  course_id: string;
  description: string;
  due_date: string;
  submissions_count: number;
  pending_grading: number;
  status: 'draft' | 'published';
  created_at: string;
}

export default function AssignmentsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

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

      await loadAssignments();
    } catch (error) {
      console.error('Error in initAuth:', error);
      setLoading(false);
    }
  }

  async function loadAssignments() {
    setLoading(true);
    
    // Mock data for MVP
    const mockAssignments: Assignment[] = [
      {
        id: '1',
        title: 'Strategic Planning Case Study',
        course_title: 'Business Management Fundamentals',
        course_id: '1',
        description: 'Analyze the provided case study and develop a strategic plan',
        due_date: '2024-12-15',
        submissions_count: 18,
        pending_grading: 8,
        status: 'published',
        created_at: '2024-11-20',
      },
      {
        id: '2',
        title: 'Market Research Project',
        course_title: 'Digital Marketing Strategy',
        course_id: '2',
        description: 'Conduct market research for a product of your choice',
        due_date: '2024-12-10',
        submissions_count: 15,
        pending_grading: 3,
        status: 'published',
        created_at: '2024-11-18',
      },
      {
        id: '3',
        title: 'Financial Statement Analysis',
        course_title: 'Business Management Fundamentals',
        course_id: '1',
        description: 'Analyze quarterly financial statements',
        due_date: '2024-12-20',
        submissions_count: 0,
        pending_grading: 0,
        status: 'draft',
        created_at: '2024-12-01',
      },
    ];

    setAssignments(mockAssignments);
    setLoading(false);
  }

  const getStatusColor = (status: string) => {
    return status === 'published' ? '#10b981' : '#f59e0b';
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="h1">Assignments</h1>
          <p style={{ marginTop: 8, fontSize: 16, color: 'var(--muted)' }}>
            Create and manage course assignments
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            color: 'white',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 15,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus style={{ width: 20, height: 20 }} />
          Create Assignment
        </button>
      </div>

      {/* Stats */}
      <div className="grid2" style={{ marginBottom: 24 }}>
        <div className="card tile">
          <div className="metricValue">{assignments.length}</div>
          <div className="metricLabel">Total Assignments</div>
        </div>
        <div className="card tile">
          <div className="metricValue">{assignments.filter((a) => a.status === 'published').length}</div>
          <div className="metricLabel">Published</div>
        </div>
        <div className="card tile">
          <div className="metricValue">
            {assignments.reduce((sum, a) => sum + a.submissions_count, 0)}
          </div>
          <div className="metricLabel">Total Submissions</div>
        </div>
        <div className="card tile">
          <div className="metricValue" style={{ color: '#f59e0b' }}>
            {assignments.reduce((sum, a) => sum + a.pending_grading, 0)}
          </div>
          <div className="metricLabel">Pending Grading</div>
        </div>
      </div>

      {/* Assignments List */}
      <div className="section">
        <div className="sectionTitle">All Assignments</div>

        {loading ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)' }}>Loading assignments...</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <FileText style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted)' }} />
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No assignments yet</p>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              Create your first assignment to get started
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                color: 'white',
                borderRadius: 12,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Plus style={{ width: 20, height: 20 }} />
              Create Assignment
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="card"
                style={{
                  padding: 20,
                  borderLeft: `4px solid ${getStatusColor(assignment.status)}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 700 }}>{assignment.title}</h3>
                      <span
                        className="badge"
                        style={{
                          padding: '4px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          background: `${getStatusColor(assignment.status)}22`,
                          color: getStatusColor(assignment.status),
                          borderRadius: 12,
                        }}
                      >
                        {assignment.status}
                      </span>
                      {isOverdue(assignment.due_date) && assignment.status === 'published' && (
                        <span
                          className="badge"
                          style={{
                            padding: '4px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: '#ef444422',
                            color: '#ef4444',
                            borderRadius: 12,
                          }}
                        >
                          Overdue
                        </span>
                      )}
                    </div>

                    {/* Course */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <BookOpen style={{ width: 14, height: 14, color: 'var(--muted)' }} />
                      <span style={{ fontSize: 14, color: 'var(--muted)' }}>{assignment.course_title}</span>
                    </div>

                    {/* Description */}
                    <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 16, lineHeight: 1.6 }}>
                      {assignment.description}
                    </p>

                    {/* Meta */}
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                        <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                          Due: {new Date(assignment.due_date).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                        <span style={{ fontSize: 14 }}>
                          <strong>{assignment.submissions_count}</strong> submissions
                        </span>
                      </div>
                      {assignment.pending_grading > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Clock style={{ width: 16, height: 16, color: '#f59e0b' }} />
                          <span style={{ fontSize: 14, color: '#f59e0b', fontWeight: 600 }}>
                            {assignment.pending_grading} to grade
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    style={{
                      padding: '10px 20px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 14,
                      background: 'transparent',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal - Simple placeholder */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="card"
            style={{ padding: 32, maxWidth: 600, width: '90%', maxHeight: '80vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Create Assignment</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Assignment Title
              </label>
              <input
                type="text"
                placeholder="e.g., Marketing Strategy Analysis"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Course
              </label>
              <select
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 15,
                }}
              >
                <option value="">Select a course...</option>
                <option value="1">Business Management Fundamentals</option>
                <option value="2">Digital Marketing Strategy</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Description
              </label>
              <textarea
                placeholder="Describe what students need to do..."
                rows={4}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Due Date
              </label>
              <input
                type="date"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '10px 20px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontWeight: 600,
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // TODO: Implement create logic
                  setShowCreateModal(false);
                }}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                  color: 'white',
                  borderRadius: 8,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Create Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </TertiaryShell>
  );
}
