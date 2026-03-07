'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { ReportCard, getStatusColor } from '@/components/dashboard/teacher/ReportCard';
import { 
  FileText, 
  Plus, 
  CheckCircle, 
  Clock, 
  XCircle,
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
  const preschoolId = profile?.preschoolId;
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
        // First get this teacher's class IDs
        const { data: teacherClasses } = await supabase
          .from('classes')
          .select('id')
          .eq('preschool_id', preschoolId)
          .eq('teacher_id', userId);

        const classIds = teacherClasses?.map((c: { id: string }) => c.id) || [];

        // Load students only for this teacher's classes
        let studentsResult: Student[] = [];
        if (classIds.length > 0) {
          const { data: studentsData, error: studentsError } = await supabase
            .from('students')
            .select(`
              id,
              first_name,
              last_name,
              class_id,
              classes (name)
            `)
            .eq('preschool_id', preschoolId)
            .in('class_id', classIds);

          if (studentsError) {
            // Non-critical — reports can still be shown
          } else {
            studentsResult = studentsData?.map((s: any) => ({
              ...s,
              class: s.classes ? { name: s.classes.name } : undefined
            })) || [];
          }
        }
        setStudents(studentsResult);

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

        if (!reportsError) {
          setReports(reportsData || []);
        }
      } catch {
        // Non-critical: data will show empty state
      } finally {
        setLoadingReports(false);
      }
    };

    loadData();
  }, [preschoolId, userId, supabase]);

  const filteredReports = selectedTab === 'all' 
    ? reports 
    : reports.filter(r => r.approval_status === selectedTab);

  if (loading || profileLoading) {
    return (
      <TeacherShell
        tenantSlug={tenantSlug}
        userName={userName}
        preschoolName={preschoolName}
        preschoolId={preschoolId}
        userId={userId}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading reports...</p>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell
      tenantSlug={tenantSlug}
      userName={userName}
      preschoolName={preschoolName}
      preschoolId={preschoolId}
      userId={userId}
    >
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 className="h1">Progress Reports</h1>
          <button 
            className="btn btnPrimary"
            onClick={() => router.push('/dashboard/teacher/reports/create')}
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
                onClick={() => router.push('/dashboard/teacher/reports/create')}
              >
                <Plus size={16} style={{ marginRight: 6 }} />
                Create Report
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredReports.map(report => (
              <ReportCard key={report.id} report={report} />
            ))}
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
                onClick={() => router.push(`/dashboard/teacher/reports/create?student_id=${student.id}`)}
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
    </TeacherShell>
  );
}
