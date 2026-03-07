import {
  Edit2,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  Pin,
  Users,
  Calendar,
  Send,
  MoreVertical,
} from 'lucide-react';
import { useState } from 'react';

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

interface AnnouncementCardProps {
  announcement: Announcement;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onPublishNow: () => void;
  onView: () => void;
}

export function AnnouncementCard({
  announcement,
  onEdit,
  onDelete,
  onTogglePin,
  onPublishNow,
  onView,
}: AnnouncementCardProps) {
  const [showActions, setShowActions] = useState(false);

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

  const getPriorityEmoji = () => {
    switch (announcement.priority) {
      case 'urgent':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '⚪';
      default:
        return '⚪';
    }
  };

  const getAudienceLabel = () => {
    switch (announcement.target_audience) {
      case 'all':
        return 'Everyone';
      case 'teachers':
        return 'Teachers';
      case 'parents':
        return 'Parents';
      case 'students':
        return 'Students';
      default:
        return 'Unknown';
    }
  };

  const getStatusBadge = () => {
    if (announcement.is_published) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderRadius: 6,
          background: 'var(--success-light)',
          color: 'var(--success)',
          fontSize: 12,
          fontWeight: 600,
        }}>
          <CheckCircle className="icon14" />
          Published
        </div>
      );
    }

    if (announcement.scheduled_for) {
      const scheduledDate = new Date(announcement.scheduled_for);
      const now = new Date();
      if (scheduledDate > now) {
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            background: 'var(--warning-light)',
            color: 'var(--warning)',
            fontSize: 12,
            fontWeight: 600,
          }}>
            <Clock className="icon14" />
            Scheduled
          </div>
        );
      }
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'var(--surface-2)',
        color: 'var(--textMuted)',
        fontSize: 12,
        fontWeight: 600,
      }}>
        <Edit2 className="icon14" />
        Draft
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div
      className="card"
      style={{
        padding: 16,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: announcement.pinned ? '2px solid var(--primary)' : undefined,
      }}
      onClick={onView}
    >
      {announcement.pinned && (
        <div style={{
          position: 'absolute',
          top: -8,
          left: 16,
          padding: '4px 8px',
          borderRadius: 6,
          background: 'var(--primary)',
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <Pin className="icon12" />
          PINNED
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title and Priority */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>{getPriorityEmoji()}</span>
            <h3 style={{
              fontSize: 16,
              fontWeight: 600,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {announcement.title}
            </h3>
          </div>

          {/* Content Preview */}
          <p style={{
            color: 'var(--textLight)',
            fontSize: 14,
            margin: '0 0 12px 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {announcement.content}
          </p>

          {/* Metadata */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 13, color: 'var(--textMuted)' }}>
            {getStatusBadge()}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Users className="icon14" />
              {getAudienceLabel()}
            </div>
            {announcement.published_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar className="icon14" />
                {formatDate(announcement.published_at)}
              </div>
            )}
            {announcement.scheduled_for && !announcement.is_published && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock className="icon14" />
                {new Date(announcement.scheduled_for).toLocaleString('en-ZA', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
            {announcement.view_count !== undefined && announcement.view_count > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Eye className="icon14" />
                {announcement.view_count} {announcement.view_count === 1 ? 'view' : 'views'}
              </div>
            )}
          </div>
        </div>

        {/* Actions Menu */}
        <div style={{ position: 'relative' }}>
          <button
            className="iconBtn"
            onClick={(e) => {
              e.stopPropagation();
              setShowActions(!showActions);
            }}
            style={{ padding: 8 }}
          >
            <MoreVertical className="icon20" />
          </button>

          {showActions && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 999,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(false);
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  minWidth: 180,
                  zIndex: 1000,
                  overflow: 'hidden',
                }}
              >
                <button
                  className="menuItem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowActions(false);
                    onEdit();
                  }}
                >
                  <Edit2 className="icon16" />
                  Edit
                </button>
                <button
                  className="menuItem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowActions(false);
                    onTogglePin();
                  }}
                >
                  <Pin className="icon16" />
                  {announcement.pinned ? 'Unpin' : 'Pin'}
                </button>
                {!announcement.is_published && (
                  <button
                    className="menuItem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActions(false);
                      onPublishNow();
                    }}
                  >
                    <Send className="icon16" />
                    Publish Now
                  </button>
                )}
                <button
                  className="menuItem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowActions(false);
                    onDelete();
                  }}
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 className="icon16" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
