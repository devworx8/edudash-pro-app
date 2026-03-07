'use client';

import { useState, useEffect } from 'react';
import { 
  Clock, CheckCircle2, XCircle, AlertCircle, FileText, 
  Image as ImageIcon, ExternalLink, Calendar, DollarSign 
} from 'lucide-react';
import { usePOPUploads, usePOPFileUrl, formatFileSize, POPUpload } from '@/lib/hooks/parent/usePOPUploads';

interface POPHistoryListProps {
  userId: string;
  studentId?: string;
  limit?: number;
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    label: 'Pending Review',
  },
  approved: {
    icon: CheckCircle2,
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    label: 'Approved',
  },
  rejected: {
    icon: XCircle,
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    label: 'Rejected',
  },
  needs_revision: {
    icon: AlertCircle,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    label: 'Needs Revision',
  },
};

export function POPHistoryList({ userId, studentId, limit }: POPHistoryListProps) {
  const { uploads, loading, error, refetch } = usePOPUploads(userId, {
    upload_type: 'proof_of_payment',
    student_id: studentId,
  });
  const { getFileUrl } = usePOPFileUrl();
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleViewFile = async (upload: POPUpload) => {
    setLoadingUrl(upload.id);
    try {
      const url = await getFileUrl(upload.upload_type, upload.file_path);
      if (url) {
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('Failed to get file URL:', err);
    } finally {
      setLoadingUrl(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatMonth = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-ZA', {
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') {
      return <FileText size={20} style={{ color: '#ef4444' }} />;
    }
    return <ImageIcon size={20} style={{ color: '#3b82f6' }} />;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="card"
            style={{
              padding: 16,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          >
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: 'var(--surface-2)', borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 16, width: '60%', background: 'var(--surface-2)', borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 12, width: '40%', background: 'var(--surface-2)', borderRadius: 4 }} />
              </div>
            </div>
          </div>
        ))}
        <style jsx>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <AlertCircle size={48} style={{ color: 'var(--danger)', margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Failed to load history</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{error}</p>
        <button onClick={refetch} className="btn btnSecondary" style={{ marginTop: 16 }}>
          Try Again
        </button>
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <FileText size={64} style={{ color: 'var(--muted)', margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No uploads yet</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Your proof of payment uploads will appear here once you submit them.
        </p>
      </div>
    );
  }

  const displayUploads = limit ? uploads.slice(0, limit) : uploads;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {displayUploads.map((upload) => {
        const status = statusConfig[upload.status];
        const StatusIcon = status.icon;
        
        return (
          <div
            key={upload.id}
            className="card"
            style={{ 
              padding: 16,
              borderLeft: `4px solid ${status.color}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* File Icon */}
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'var(--surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {getFileIcon(upload.file_type)}
              </div>
              
              {/* Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <h4 style={{ 
                    fontSize: 15, 
                    fontWeight: 600, 
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {upload.title}
                  </h4>
                  
                  {/* Status Badge */}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    background: status.bgColor,
                    border: `1px solid ${status.borderColor}`,
                    color: status.color,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    <StatusIcon size={12} />
                    {status.label}
                  </span>
                </div>
                
                {/* Meta Info */}
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap',
                  gap: '8px 16px', 
                  fontSize: 13, 
                  color: 'var(--muted)',
                  marginBottom: 8,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={14} />
                    {formatDate(upload.created_at)}
                  </span>
                  
                  {upload.payment_amount && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <DollarSign size={14} />
                      {formatCurrency(upload.payment_amount)}
                    </span>
                  )}

                  {upload.payment_for_month && (
                    <span>
                      For: {formatMonth(upload.payment_for_month)}
                    </span>
                  )}
                  
                  {upload.payment_reference && (
                    <span>
                      Ref: {upload.payment_reference}
                    </span>
                  )}
                  
                  {upload.student && (
                    <span>
                      For: {upload.student.first_name} {upload.student.last_name}
                    </span>
                  )}
                </div>
                
                {/* File Info & Actions */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {upload.file_name} ({formatFileSize(upload.file_size)})
                  </span>
                  
                  <button
                    onClick={() => handleViewFile(upload)}
                    disabled={loadingUrl === upload.id}
                    className="btn btnSmall"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      fontSize: 12,
                      opacity: loadingUrl === upload.id ? 0.6 : 1,
                    }}
                  >
                    <ExternalLink size={14} />
                    {loadingUrl === upload.id ? 'Loading...' : 'View'}
                  </button>
                </div>
                
                {/* Review Notes */}
                {upload.review_notes && (
                  <div style={{
                    marginTop: 12,
                    padding: 12,
                    background: status.bgColor,
                    border: `1px solid ${status.borderColor}`,
                    borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: status.color }}>
                      Review Notes:
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>
                      {upload.review_notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
