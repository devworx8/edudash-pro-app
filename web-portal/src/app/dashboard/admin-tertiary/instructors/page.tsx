'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TertiaryShell } from '@/components/dashboard/tertiary/TertiaryShell';
import { useRouter } from 'next/navigation';
import { Search, Plus, BookOpen, Users, Mail, Phone, MoreVertical } from 'lucide-react';

interface Instructor {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  courses_count: number;
  students_count: number;
  status: 'active' | 'inactive';
  joined_at: string;
}

export default function InstructorsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);

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

      await loadInstructors();
    } catch (error) {
      console.error('Error in initAuth:', error);
      setLoading(false);
    }
  }

  async function loadInstructors() {
    setLoading(true);
    
    // Mock data for MVP
    const mockInstructors: Instructor[] = [
      {
        id: '1',
        first_name: 'Sarah',
        last_name: 'Johnson',
        email: 'sarah.johnson@example.com',
        phone: '+27 82 345 6789',
        courses_count: 3,
        students_count: 67,
        status: 'active',
        joined_at: '2024-09-15',
      },
      {
        id: '2',
        first_name: 'Mike',
        last_name: 'Peters',
        email: 'mike.peters@example.com',
        phone: '+27 83 456 7890',
        courses_count: 2,
        students_count: 42,
        status: 'active',
        joined_at: '2024-10-01',
      },
      {
        id: '3',
        first_name: 'Linda',
        last_name: 'Nkosi',
        email: 'linda.nkosi@example.com',
        courses_count: 0,
        students_count: 0,
        status: 'inactive',
        joined_at: '2024-11-20',
      },
    ];

    setInstructors(mockInstructors);
    setLoading(false);
  }

  const filteredInstructors = instructors.filter((instructor) => {
    const fullName = `${instructor.first_name} ${instructor.last_name}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || instructor.email.toLowerCase().includes(query);
  });

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
          <h1 className="h1">Instructors</h1>
          <p style={{ marginTop: 8, fontSize: 16, color: 'var(--muted)' }}>
            Manage course facilitators and teaching staff
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
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
          Invite Instructor
        </button>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ position: 'relative' }}>
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
            placeholder="Search instructors by name or email..."
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
      </div>

      {/* Stats */}
      <div className="grid2" style={{ marginBottom: 24 }}>
        <div className="card tile">
          <div className="metricValue">{instructors.length}</div>
          <div className="metricLabel">Total Instructors</div>
        </div>
        <div className="card tile">
          <div className="metricValue">{instructors.filter((i) => i.status === 'active').length}</div>
          <div className="metricLabel">Active Instructors</div>
        </div>
        <div className="card tile">
          <div className="metricValue">
            {instructors.reduce((sum, i) => sum + i.courses_count, 0)}
          </div>
          <div className="metricLabel">Total Courses</div>
        </div>
        <div className="card tile">
          <div className="metricValue">
            {instructors.reduce((sum, i) => sum + i.students_count, 0)}
          </div>
          <div className="metricLabel">Total Students</div>
        </div>
      </div>

      {/* Instructors List */}
      <div className="section">
        <div className="sectionTitle">
          {filteredInstructors.length} {filteredInstructors.length === 1 ? 'Instructor' : 'Instructors'}
        </div>

        {loading ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)' }}>Loading instructors...</p>
          </div>
        ) : filteredInstructors.length === 0 ? (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <Users style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted)' }} />
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No instructors found</p>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              {searchQuery ? 'Try a different search term' : 'Invite your first instructor to get started'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {filteredInstructors.map((instructor) => (
              <div
                key={instructor.id}
                className="card"
                style={{
                  padding: 20,
                  borderLeft: `4px solid ${instructor.status === 'active' ? '#10b981' : '#6b7280'}`,
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
                      {instructor.first_name[0]}
                      {instructor.last_name[0]}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                          {instructor.first_name} {instructor.last_name}
                        </h3>
                        <span
                          className="badge"
                          style={{
                            padding: '4px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            background: instructor.status === 'active' ? '#10b98122' : '#6b728022',
                            color: instructor.status === 'active' ? '#10b981' : '#6b7280',
                            borderRadius: 12,
                          }}
                        >
                          {instructor.status}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Mail style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                          <span style={{ fontSize: 14, color: 'var(--muted)' }}>{instructor.email}</span>
                        </div>
                        {instructor.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Phone style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{instructor.phone}</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 24 }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 700 }}>{instructor.courses_count}</div>
                          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Courses</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 700 }}>{instructor.students_count}</div>
                          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Students</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Joined</div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {new Date(instructor.joined_at).toLocaleDateString()}
                          </div>
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

      {/* Invite Modal - Simple implementation */}
      {showInviteModal && (
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
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="card"
            style={{ padding: 32, maxWidth: 500, width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Invite Instructor</h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 24 }}>
              Send an invitation email to add a new instructor to your organization
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Email Address
              </label>
              <input
                type="email"
                placeholder="instructor@example.com"
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
                onClick={() => setShowInviteModal(false)}
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
                  // TODO: Implement invite logic
                  setShowInviteModal(false);
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
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </TertiaryShell>
  );
}
