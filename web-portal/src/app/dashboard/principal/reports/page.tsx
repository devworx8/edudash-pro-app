'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { 
  FileText, 
  Plus, 
  CheckCircle, 
  Clock, 
  XCircle,
  Eye,
  Users
} from 'lucide-react';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class?: {
    name: string;
  };
}

interface ProgressReport {
  id: string;
  student_id: string;
  report_period: string;
  report_type: string;
  report_category: string;
  overall_grade: string;
  approval_status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  students?: {
    first_name: string;
    last_name: string;
  };
}

export default function TeacherReportsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'draft' | 'pending_review' | 'approved' | 'rejected'>('all');

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const userName = profile?.firstName || 'Teacher';

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (!preschoolId || !userId) return;

    const loadData = async () => {
      setLoadingReports(true);
      try {
        // Load students for this teacher's classes
        const { data: studentsData, error: studentsError } = await supabase
          .from('students')
          .select(`
            id,
            first_name,
            last_name,
            class_id,
            classes (name)
          `)
          .eq('preschool_id', preschoolId);

        if (studentsError) {
          console.error('Error loading students:', studentsError);
        } else {
          setStudents(studentsData?.map((s: any) => ({
            ...s,
            class: s.classes ? { name: s.classes.name } : undefined
          })) || []);
        }

        // Load reports created by this teacher
        const { data: reportsData, error: reportsError } = await supabase
          .from('progress_reports')
          .select(`
            id,
            student_id,
            report_period,
            report_type,
            report_category,
            overall_grade,
            approval_status,
            created_at,
            updated_at,
            students (first_name, last_name)
          `)
          .eq('preschool_id', preschoolId)
          .eq('teacher_id', userId)
          .order('created_at', { ascending: false });

        if (reportsError) {
          console.error('Error loading reports:', reportsError);
        } else {
          setReports(reportsData || []);
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoadingReports(false);
      }
    };

    loadData();
  }, [preschoolId, userId, supabase]);

  const filteredReports = selectedTab === 'all' 
    ? reports 
    : reports.filter(r => r.approval_status === selectedTab);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={16} color="#10b981" />;
      case 'pending_review':
        return <Clock size={16} color="#f59e0b" />;
      case 'rejected':
        return <XCircle size={16} color="#ef4444" />;
      default:
        return <FileText size={16} color="#6b7280" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return '#10b981';
      case 'pending_review':
        return '#f59e0b';
      case 'rejected':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  if (loading || profileLoading) {
    return (
      <PrincipalShell
        tenantSlug={tenantSlug}
        userName={userName}
        preschoolName={preschoolName}
        preschoolId={preschoolId}
        
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading reports...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell
      tenantSlug={tenantSlug}
      userName={userName}
      preschoolName={preschoolName}
      preschoolId={preschoolId}
      
    >
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 className="h1">Progress Reports</h1>
          <button 
            className="btn btnPrimary"
            onClick={() => router.push('/dashboard/principal/reports/create')}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={18} />
            Create Report
          </button>
        </div>

        {/* Quick Stats */}
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 24 }}>
          <div className="card tile">
            <div className="metricValue">{reports.length}</div>
            <div className="metricLabel">Total Reports</div>
          </div>
          <div className="card tile">
            <div className="metricValue" style={{ color: '#f59e0b' }}>
              {reports.filter(r => r.approval_status === 'pending_review').length}
            </div>
            <div className="metricLabel">Pending Review</div>
          </div>
          <div className="card tile">
            <div className="metricValue" style={{ color: '#10b981' }}>
              {reports.filter(r => r.approval_status === 'approved').length}
            </div>
            <div className="metricLabel">Approved</div>
          </div>
          <div className="card tile">
            <div className="metricValue">{students.length}</div>
            <div className="metricLabel">Students</div>
          </div>
        </div>

        {/* Tab Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className={selectedTab === 'all' ? 'btn btnPrimary' : 'btn btnSecondary'}
            onClick={() => setSelectedTab('all')}
          >
            <FileText size={16} style={{ marginRight: 6 }} />
            All ({reports.length})
          </button>
          <button
            className={selectedTab === 'draft' ? 'btn btnPrimary' : 'btn btnSecondary'}
            onClick={() => setSelectedTab('draft')}
          >
            Draft ({reports.filter(r => r.approval_status === 'draft').length})
          </button>
          <button
            className={selectedTab === 'pending_review' ? 'btn btnPrimary' : 'btn btnSecondary'}
            onClick={() => setSelectedTab('pending_review')}
          >
            <Clock size={16} style={{ marginRight: 6 }} />
            Pending ({reports.filter(r => r.approval_status === 'pending_review').length})
          </button>
          <button
            className={selectedTab === 'approved' ? 'btn btnPrimary' : 'btn btnSecondary'}
            onClick={() => setSelectedTab('approved')}
          >
            <CheckCircle size={16} style={{ marginRight: 6 }} />
            Approved ({reports.filter(r => r.approval_status === 'approved').length})
          </button>
          <button
            className={selectedTab === 'rejected' ? 'btn btnPrimary' : 'btn btnSecondary'}
            onClick={() => setSelectedTab('rejected')}
            style={{ background: selectedTab === 'rejected' ? '#ef4444' : undefined }}
          >
            <XCircle size={16} style={{ marginRight: 6 }} />
            Rejected ({reports.filter(r => r.approval_status === 'rejected').length})
          </button>
        </div>

        {/* Reports List */}
        {loadingReports ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--muted)' }}>Loading reports...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <FileText size={48} color="var(--muted)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ marginBottom: 8, color: 'var(--muted)' }}>
              No {selectedTab === 'all' ? '' : selectedTab.replace('_', ' ')} Reports
            </h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
              {selectedTab === 'all' && 'Create your first progress report for a student.'}
              {selectedTab === 'draft' && 'No draft reports. Reports saved before submission will appear here.'}
              {selectedTab === 'pending_review' && 'No reports pending review.'}
              {selectedTab === 'approved' && 'No approved reports yet.'}
              {selectedTab === 'rejected' && 'No rejected reports.'}
            </p>
            {selectedTab === 'all' && (
              <button 
                className="btn btnPrimary"
                onClick={() => router.push('/dashboard/principal/reports/create')}
              >
                <Plus size={16} style={{ marginRight: 6 }} />
                Create Report
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredReports.map(report => {
              const studentName = report.students 
                ? `${report.students.first_name} ${report.students.last_name}` 
                : 'Unknown Student';
              const statusColor = getStatusColor(report.approval_status);

              return (
                <div 
                  key={report.id} 
                  className="card" 
                  style={{ borderLeft: `4px solid ${statusColor}`, cursor: 'pointer' }}
                  onClick={() => router.push(`/dashboard/principal/reports/create?student_id=${report.student_id}&report_id=${report.id}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        {getStatusIcon(report.approval_status)}
                        <span style={{ 
                          fontSize: 12, 
                          fontWeight: 600, 
                          color: statusColor,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          {report.report_type} Report
                        </span>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>•</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {report.report_period}
                        </span>
                      </div>
                      
                      <h3 style={{ marginBottom: 4, fontSize: 18, fontWeight: 700 }}>
                        {studentName}
                      </h3>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        {report.overall_grade && (
                          <span style={{ 
                            background: '#10b981', 
                            color: 'white',
                            padding: '2px 8px', 
                            borderRadius: 6, 
                            fontSize: 12,
                            fontWeight: 600
                          }}>
                            Grade: {report.overall_grade}
                          </span>
                        )}
                        <span style={{ 
                          background: `${statusColor}20`, 
                          color: statusColor,
                          padding: '2px 8px', 
                          borderRadius: 6, 
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: 'capitalize'
                        }}>
                          {report.approval_status.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {new Date(report.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <button 
                      className="btn btnSecondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/principal/reports/create?student_id=${report.student_id}&report_id=${report.id}`);
                      }}
                    >
                      <Eye size={16} style={{ marginRight: 6 }} />
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Students Without Reports Section */}
        <div style={{ marginTop: 32 }}>
          <div className="sectionTitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={20} />
            Create Report for Student
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {students.slice(0, 8).map(student => (
              <div 
                key={student.id} 
                className="card" 
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/dashboard/principal/reports/create?student_id=${student.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600
                  }}>
                    {student.first_name[0]}{student.last_name[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                      {student.first_name} {student.last_name}
                    </h4>
                    {student.class && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                        {student.class.name}
                      </p>
                    )}
                  </div>
                  <Plus size={18} color="var(--primary)" />
                </div>
              </div>
            ))}
          </div>
          {students.length > 8 && (
            <button 
              className="btn btnSecondary" 
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => {/* Could show modal with all students */}}
            >
              View All Students ({students.length})
            </button>
          )}
        </div>
      </div>
    </PrincipalShell>
  );
}
