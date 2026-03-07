'use client';

/**
 * ReportCard — Renders a single progress report row in the teacher reports list.
 */

import { useRouter } from 'next/navigation';
import { CheckCircle, Clock, XCircle, FileText, Eye } from 'lucide-react';

interface ReportCardProps {
  report: {
    id: string;
    student_id: string;
    report_period: string;
    report_type: string;
    overall_grade: string;
    approval_status: 'draft' | 'pending_review' | 'approved' | 'rejected';
    created_at: string;
    students?: {
      first_name: string;
      last_name: string;
    };
  };
}

function getStatusIcon(status: string) {
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
}

export function getStatusColor(status: string) {
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
}

export function ReportCard({ report }: ReportCardProps) {
  const router = useRouter();
  const studentName = report.students
    ? `${report.students.first_name} ${report.students.last_name}`
    : 'Unknown Student';
  const statusColor = getStatusColor(report.approval_status);
  const reportUrl = `/dashboard/teacher/reports/create?student_id=${report.student_id}&report_id=${report.id}`;

  return (
    <div
      className="card"
      style={{ borderLeft: `4px solid ${statusColor}`, cursor: 'pointer' }}
      onClick={() => router.push(reportUrl)}
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
              letterSpacing: '0.5px',
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
                fontWeight: 600,
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
              textTransform: 'capitalize',
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
            router.push(reportUrl);
          }}
        >
          <Eye size={16} style={{ marginRight: 6 }} />
          View
        </button>
      </div>
    </div>
  );
}
