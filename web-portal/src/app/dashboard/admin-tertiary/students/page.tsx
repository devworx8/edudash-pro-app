'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TertiaryShell } from '@/components/dashboard/tertiary/TertiaryShell';
import { useRouter } from 'next/navigation';
import { Search, Plus, Users, BookOpen, Clock, Mail, MoreVertical } from 'lucide-react';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  courses_enrolled: number;
  courses_completed: number;
  total_credits: number;
  status: 'active' | 'inactive' | 'graduated';
  enrolled_at: string;
}

export default function StudentsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'graduated'>('all');
  const [showEnrollModal, setShowEnrollModal] = useState(false);

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

      await loadStudents();
    } catch (error) {
      console.error('Error in initAuth:', error);
      setLoading(false);
    }
  }

  async function loadStudents() {
    setLoading(true);
    
    // Mock data for MVP
    const mockStudents: Student[] = [
      {
        id: '1',
        first_name: 'Thabo',
        last_name: 'Mbeki',
        email: 'thabo.mbeki@example.com',
        courses_enrolled: 2,
        courses_completed: 1,
        total_credits: 15,
        status: 'active',
        enrolled_at: '2024-09-01',
      },
      {
        id: '2',
        first_name: 'Nomsa',
        last_name: 'Dlamini',
        email: 'nomsa.dlamini@example.com',
        courses_enrolled: 3,
        courses_completed: 2,
        total_credits: 30,
        status: 'active',
        enrolled_at: '2024-08-15',
      },
      {
        id: '3',
        first_name: 'John',
        last_name: 'Smith',
        email: 'john.smith@example.com',
        courses_enrolled: 1,
        courses_completed: 0,
        total_credits: 0,
        status: 'inactive',
        enrolled_at: '2024-11-01',
      },
      {
        id: '4',
        first_name: 'Zanele',
        last_name: 'Khumalo',
        email: 'zanele.khumalo@example.com',
        courses_enrolled: 4,
        courses_completed: 4,
        total_credits: 60,
        status: 'graduated',
        enrolled_at: '2024-01-10',
      },
    ];

    setStudents(mockStudents);
    setLoading(false);
  }

  const filteredStudents = students.filter((student) => {
    const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch = fullName.includes(query) || student.email.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || student.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10b981';
      case 'inactive':
        return '#f59e0b';
      case 'graduated':
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  };

  if (!profile) {
    return (
      <TertiaryShell userEmail="" userName="" userRole="admin" hideRightSidebar={true}>
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
          <h1 className="h1">Students</h1>
          <p style={{ marginTop: 8, fontSize: 16, color: 'var(--muted)' }}>
            Manage adult learners and track their progress
          </p>
        </div>
        <button
          onClick={() => setShowEnrollModal(true)}
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
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus style={{ width: 20, height: 20 }} />
          Enroll Student
        </button>
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
              placeholder="Search students..."
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
            {['all', 'active', 'inactive', 'graduated'].map((status) => (
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
          <div className="metricValue">{students.length}</div>
          <div className="metricLabel">Total Students</div>
        </div>
        <div className="card tile">
          <div className="metricValue">{students.filter((s) => s.status === 'active').length}</div>
          <div className="metricLabel">Active Students</div>
        </div>
        <div className="card tile">
          <div className="metricValue">{students.filter((s) => s.status === 'graduated').length}</div>
          <div className="metricLabel">Graduated</div>
        </div>
        <div className="card tile">
          <div className="metricValue">
            {students.reduce((sum, s) => sum + s.courses_enrolled, 0)}
          </div>
          <div className="metricLabel">Total Enrollments</div>
        </div>
      </div>

      {/* Students List */}
      <div className="section">
        <div className="sectionTitle">
          {filteredStudents.length} {filteredStudents.length === 1 ? 'Student' : 'Students'}
        </div>

        {loading ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)' }}>Loading students...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <Users style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted)' }} />
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No students found</p>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Enroll your first student to get started'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {filteredStudents.map((student) => (
              <div
                key={student.id}
                className="card"
                style={{
                  padding: 20,
                  borderLeft: `4px solid ${getStatusColor(student.status)}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 16, flex: 1 }}>
                    {/* Avatar */}
                    <div
                      className="avatar"
                      style={{
                        width: 60,
                        height: 60,
                        fontSize: 24,
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      }}
                    >
                      {student.first_name[0]}
                      {student.last_name[0]}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                          {student.first_name} {student.last_name}
                        </h3>
                        <span
                          className="badge"
                          style={{
                            padding: '4px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            background: `${getStatusColor(student.status)}22`,
                            color: getStatusColor(student.status),
                            borderRadius: 12,
                          }}
                        >
                          {student.status}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <Mail style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                        <span style={{ fontSize: 14, color: 'var(--muted)' }}>{student.email}</span>
                      </div>

                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <BookOpen style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                          <span style={{ fontSize: 14 }}>
                            <strong>{student.courses_enrolled}</strong> enrolled
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Clock style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                          <span style={{ fontSize: 14 }}>
                            <strong>{student.courses_completed}</strong> completed
                          </span>
                        </div>
                        <div style={{ fontSize: 14 }}>
                          <strong>{student.total_credits}</strong> credits earned
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                          Enrolled: {new Date(student.enrolled_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button className="iconBtn" style={{ padding: 8 }}>
                    <MoreVertical style={{ width: 20, height: 20 }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enroll Modal */}
      {showEnrollModal && (
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
          onClick={() => setShowEnrollModal(false)}
        >
          <div
            className="card"
            style={{ padding: 32, maxWidth: 500, width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Enroll Student</h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 24 }}>
              Register a new adult learner (18+ years old)
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Email Address
              </label>
              <input
                type="email"
                placeholder="student@example.com"
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  First Name
                </label>
                <input
                  type="text"
                  placeholder="First name"
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
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Last Name
                </label>
                <input
                  type="text"
                  placeholder="Last name"
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
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEnrollModal(false)}
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
                  // TODO: Implement enrollment logic
                  setShowEnrollModal(false);
                }}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  borderRadius: 8,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Enroll Student
              </button>
            </div>
          </div>
        </div>
      )}
    </TertiaryShell>
  );
}
