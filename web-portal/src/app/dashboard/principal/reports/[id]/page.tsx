'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { FileText, CheckCircle, XCircle, ArrowLeft, Calendar, User, GraduationCap } from 'lucide-react';

interface ProgressReport {
  id: string;
  student_id: string;
  teacher_id: string;
  report_period: string;
  report_type: string;
  overall_comments: string;
  teacher_comments: string;
  strengths: string;
  areas_for_improvement: string;
  subjects_performance: any;
  overall_grade: string;
  attendance_summary: any;
  behavioral_notes: any;
  approval_status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  reviewed_at?: string;
  principal_notes?: string;
  students?: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
  };
  teacher?: {
    first_name: string;
    last_name: string;
  };
}

export default function ReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = params.id as string;
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ProgressReport | null>(null);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;

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

  useEffect(() => {
    if (!preschoolId || !reportId) return;

    const loadReport = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('progress_reports')
          .select(`
            *,
            students (first_name, last_name, date_of_birth),
            teacher:users!progress_reports_teacher_id_fkey (first_name, last_name)
          `)
          .eq('id', reportId)
          .eq('preschool_id', preschoolId)
          .single();

        if (error) {
          console.error('Error loading report:', error);
          return;
        }

        setReport(data);
      } catch (err) {
        console.error('Error loading report:', err);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [preschoolId, reportId, supabase]);

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!report) return;

    let notes = null;
    if (action === 'reject') {
      notes = prompt('Reason for rejection (optional):');
      if (notes === null) return; // User cancelled
    }

    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('progress_reports')
        .update({ 
          approval_status: newStatus,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          principal_notes: notes,
        })
        .eq('id', report.id);

      if (error) {
        console.error('Error updating report:', error);
        alert('Failed to update report. Please try again.');
        return;
      }

      alert(`Report ${action}d successfully!`);
      router.push('/dashboard/principal/reports');
    } catch (err) {
      console.error('Error handling action:', err);
      alert('An error occurred. Please try again.');
    }
  };

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading report...</p>
        </div>
      </PrincipalShell>
    );
  }

  if (!report) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="section">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <FileText size={48} color="var(--muted)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ marginBottom: 8 }}>Report Not Found</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              The report you're looking for doesn't exist or you don't have permission to view it.
            </p>
            <button className="btn btnPrimary" onClick={() => router.push('/dashboard/principal/reports')}>
              <ArrowLeft size={16} style={{ marginRight: 6 }} />
              Back to Reports
            </button>
          </div>
        </div>
      </PrincipalShell>
    );
  }

  const studentName = report.students 
    ? `${report.students.first_name} ${report.students.last_name}` 
    : 'Unknown Student';
  const teacherName = report.teacher 
    ? `${report.teacher.first_name} ${report.teacher.last_name}` 
    : 'Unknown Teacher';

  const statusColor = report.approval_status === 'approved' ? '#10b981' : 
                      report.approval_status === 'rejected' ? '#ef4444' : '#667eea';

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section">
        <div style={{ marginBottom: 24 }}>
          <button className="btn btnSecondary" onClick={() => router.push('/dashboard/principal/reports')}>
            <ArrowLeft size={16} style={{ marginRight: 6 }} />
            Back to Reports
          </button>
        </div>

        {/* Report Header */}
        <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${statusColor}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FileText size={20} color={statusColor} />
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
                  {report.report_type} Report - {report.report_period}
                </h1>
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                Report ID: {report.id}
              </div>
            </div>
            <div style={{ 
              padding: '6px 12px', 
              borderRadius: 8, 
              background: statusColor,
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              textTransform: 'capitalize'
            }}>
              {report.approval_status.replace('_', ' ')}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Student</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={16} />
                <strong>{studentName}</strong>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Teacher</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GraduationCap size={16} />
                <strong>{teacherName}</strong>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Submitted</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={16} />
                {new Date(report.created_at).toLocaleDateString()}
              </div>
            </div>
            {report.reviewed_at && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Reviewed</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={16} />
                  {new Date(report.reviewed_at).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Overall Grade */}
        {report.overall_grade && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Overall Grade</h2>
            <div style={{ 
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              fontSize: 24,
              fontWeight: 700
            }}>
              {report.overall_grade}
            </div>
          </div>
        )}

        {/* Teacher Comments */}
        {report.teacher_comments && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Teacher Comments</h2>
            <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{report.teacher_comments}</p>
          </div>
        )}

        {/* Overall Comments */}
        {report.overall_comments && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Overall Comments</h2>
            <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{report.overall_comments}</p>
          </div>
        )}

        {/* Strengths & Areas for Improvement */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
          {report.strengths && (
            <div className="card">
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#10b981' }}>Strengths</h2>
              <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{report.strengths}</p>
            </div>
          )}
          {report.areas_for_improvement && (
            <div className="card">
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#f59e0b' }}>Areas for Improvement</h2>
              <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{report.areas_for_improvement}</p>
            </div>
          )}
        </div>

        {/* Subjects Performance */}
        {report.subjects_performance && Object.keys(report.subjects_performance).length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Subject Performance</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {Object.entries(report.subjects_performance).map(([subject, details]: [string, any]) => (
                <div key={subject} style={{ 
                  padding: 12, 
                  background: 'var(--surface-2)', 
                  borderRadius: 8,
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>{subject}</strong>
                    {details.grade && (
                      <span style={{ 
                        padding: '2px 8px', 
                        borderRadius: 6, 
                        background: '#10b981', 
                        color: 'white',
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {details.grade}
                      </span>
                    )}
                  </div>
                  {details.comments && (
                    <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>{details.comments}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attendance Summary */}
        {report.attendance_summary && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Attendance Summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
              {report.attendance_summary.present && (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                    {report.attendance_summary.present}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--muted)' }}>Days Present</div>
                </div>
              )}
              {report.attendance_summary.absent && (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
                    {report.attendance_summary.absent}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--muted)' }}>Days Absent</div>
                </div>
              )}
              {report.attendance_summary.percentage !== undefined && (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#667eea' }}>
                    {report.attendance_summary.percentage}%
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--muted)' }}>Attendance Rate</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Behavioral Notes */}
        {report.behavioral_notes && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Behavioral Notes</h2>
            <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {typeof report.behavioral_notes === 'string' 
                ? report.behavioral_notes 
                : JSON.stringify(report.behavioral_notes, null, 2)}
            </p>
          </div>
        )}

        {/* Principal Notes (if any) */}
        {report.principal_notes && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #667eea' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Principal Notes</h2>
            <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{report.principal_notes}</p>
          </div>
        )}

        {/* Action Buttons */}
        {(report.approval_status === 'draft' || report.approval_status === 'pending_review') && (
          <div className="card">
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Review Actions</h2>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="btn btnPrimary"
                onClick={() => handleAction('approve')}
                style={{ flex: 1, background: '#10b981' }}
              >
                <CheckCircle size={18} style={{ marginRight: 8 }} />
                Approve & Send to Parent
              </button>
              <button 
                className="btn"
                onClick={() => handleAction('reject')}
                style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none' }}
              >
                <XCircle size={18} style={{ marginRight: 8 }} />
                Reject Report
              </button>
            </div>
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
