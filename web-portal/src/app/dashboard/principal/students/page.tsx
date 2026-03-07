'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Users, UserPlus, Search, Filter } from 'lucide-react';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  age_months: number;
  age_years: number;
  class_id: string | null;
  status: string;
  is_active?: boolean | null;
  age_group_name?: string;
  class_name?: string;
}

export default function StudentsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  // Auth check
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    initAuth();
  }, [router, supabase]);

  // Load students
  useEffect(() => {
    if (!preschoolId) return;

    const loadStudents = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('students')
          .select(`
            id,
            first_name,
            last_name,
            date_of_birth,
            class_id,
            status,
            is_active,
            classes (name)
          `)
          .eq('preschool_id', preschoolId)
          .order('first_name');

        if (!error && data) {
          const processedStudents = data.map((student: any) => {
            const ageInfo = calculateAge(student.date_of_birth);
            return {
              ...student,
              age_months: ageInfo.age_months,
              age_years: ageInfo.age_years,
              class_name: student.classes?.name,
            };
          });
          setStudents(processedStudents);
        }
      } catch (error) {
        console.error('Error loading students:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [preschoolId, supabase]);

  const calculateAge = (dateOfBirth: string | null) => {
    if (!dateOfBirth) return { age_months: 0, age_years: 0 };
    const birth = new Date(dateOfBirth);
    const today = new Date();
    const totalMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
    return { age_months: Math.max(0, totalMonths), age_years: Math.floor(totalMonths / 12) };
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.last_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || student.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading students...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 className="h1">Students</h1>
          <button 
            className="btn btnPrimary"
            onClick={() => router.push('/dashboard/principal/students/enroll')}
          >
            <UserPlus size={18} style={{ marginRight: 8 }} />
            Enroll Student
          </button>
        </div>

        {/* Stats */}
        <div className="grid2" style={{ marginBottom: 24 }}>
          <div className="card tile">
            <div className="metricValue">{students.length}</div>
            <div className="metricLabel">Total Students</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{students.filter(s => s.status === 'active' && s.is_active === true).length}</div>
            <div className="metricLabel">Active Students</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{students.filter(s => s.class_id).length}</div>
            <div className="metricLabel">Assigned to Class</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{students.filter(s => !s.class_id).length}</div>
            <div className="metricLabel">Unassigned</div>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
            </div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {/* Students List */}
        {filteredStudents.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Users size={48} style={{ margin: '0 auto 16px', color: 'var(--muted)' }} />
            <h3 style={{ marginBottom: 8 }}>No students found</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
              {searchTerm ? 'Try adjusting your search' : 'Get started by enrolling your first student'}
            </p>
            {!searchTerm && (
              <button 
                className="btn btnPrimary"
                onClick={() => router.push('/dashboard/principal/students/enroll')}
              >
                <UserPlus size={18} style={{ marginRight: 8 }} />
                Enroll Student
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredStudents.map((student) => (
              <div 
                key={student.id} 
                className="card"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => router.push(`/dashboard/principal/students/${student.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div 
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: 18,
                    }}
                  >
                    {student.first_name[0]}{student.last_name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {student.first_name} {student.last_name}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                      {student.age_years} years old
                      {student.class_name && ` • ${student.class_name}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span 
                    style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: student.status === 'active' ? '#10b98120' : '#f59e0b20',
                      color: student.status === 'active' ? '#10b981' : '#f59e0b',
                    }}
                  >
                    {student.status}
                  </span>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--muted)' }}>
                    <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
