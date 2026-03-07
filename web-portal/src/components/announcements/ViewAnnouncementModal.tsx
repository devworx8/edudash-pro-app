import { X, Users, Calendar, Eye, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface Announcement {
  id: string;
  preschool_id: string;
  title: string;
  content: string;
  author_id: string;
  target_audience: 'all' | 'teachers' | 'parents' | 'students';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_published: boolean;
  pinned: boolean;
  published_at: string | null;
  scheduled_for: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  view_count?: number;
}

interface ViewAnnouncementModalProps {
  announcement: Announcement;
  onClose: () => void;
}

export function ViewAnnouncementModal({ announcement, onClose }: ViewAnnouncementModalProps) {
  const getPriorityColor = () => {
    switch (announcement.priority) {
      case 'urgent':
        return 'var(--danger)';
      case 'high':
        return 'var(--warning)';
      case 'medium':
        return 'var(--primary)';
      case 'low':
        return 'var(--textLight)';
      default:
        return 'var(--textMuted)';
    }
  };

  const getPriorityLabel = () => {
    switch (announcement.priority) {
      case 'urgent':
        return '🔴 Urgent';
      case 'high':
        return '🟠 High Priority';
      case 'medium':
        return '🟡 Medium Priority';
      case 'low':
        return '⚪ Low Priority';
      default:
        return 'Normal';
    }
  };

  const getAudienceLabel = () => {
    switch (announcement.target_audience) {
      case 'all':
        return 'Everyone';
      case 'teachers':
        return 'Teachers Only';
      case 'parents':
        return 'Parents Only';
      case 'students':
        return 'Students Only';
      default:
        return 'Unknown';
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9998,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: 700,
            maxHeight: '90vh',
            overflow: 'auto',
            padding: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: getPriorityColor(),
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {getPriorityLabel()}
                </div>
                {announcement.is_published ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: 'var(--success-light)',
                      color: 'var(--success)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle className="icon14" />
                    Published
                  </div>
                ) : announcement.scheduled_for ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: 'var(--warning-light)',
                      color: 'var(--warning)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <Clock className="icon14" />
                    Scheduled
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: 'var(--surface-2)',
                      color: 'var(--textMuted)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Draft
                  </div>
                )}
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{announcement.title}</h2>
            </div>
            <button className="iconBtn" onClick={onClose}>
              <X className="icon20" />
            </button>
          </div>

          {/* Metadata */}
          <div
            style={{
              padding: '16px 24px',
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 20,
              fontSize: 14,
              color: 'var(--textLight)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users className="icon16" style={{ color: 'var(--primary)' }} />
              <span>{getAudienceLabel()}</span>
            </div>
            {announcement.published_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar className="icon16" style={{ color: 'var(--primary)' }} />
                <span>{formatDateTime(announcement.published_at)}</span>
              </div>
            )}
            {announcement.scheduled_for && !announcement.is_published && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock className="icon16" style={{ color: 'var(--warning)' }} />
                <span>Scheduled for {formatDateTime(announcement.scheduled_for)}</span>
              </div>
            )}
            {announcement.view_count !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eye className="icon16" style={{ color: 'var(--primary)' }} />
                <span>
                  {announcement.view_count} {announcement.view_count === 1 ? 'view' : 'views'}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ padding: '24px', fontSize: 15, lineHeight: 1.7, color: 'var(--text)' }}>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{announcement.content}</div>
          </div>

          {/* Additional Info */}
          {announcement.expires_at && (
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'var(--textMuted)',
              }}
            >
              <AlertCircle className="icon16" />
              <span>This announcement expires on {formatDateTime(announcement.expires_at)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
