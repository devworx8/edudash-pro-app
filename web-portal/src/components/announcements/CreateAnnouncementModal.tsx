import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Save, Send, Clock, AlertCircle } from 'lucide-react';

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
}

interface CreateAnnouncementModalProps {
  announcement: Announcement | null;
  preschoolId: string;
  authorId: string;
  onClose: () => void;
  onSave: () => void;
}

export function CreateAnnouncementModal({
  announcement,
  preschoolId,
  authorId,
  onClose,
  onSave,
}: CreateAnnouncementModalProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState(announcement?.title || '');
  const [content, setContent] = useState(announcement?.content || '');
  const [targetAudience, setTargetAudience] = useState<'all' | 'teachers' | 'parents' | 'students'>(
    announcement?.target_audience || 'all'
  );
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>(
    announcement?.priority || 'medium'
  );
  const [scheduledFor, setScheduledFor] = useState(announcement?.scheduled_for || '');
  const [expiresAt, setExpiresAt] = useState(announcement?.expires_at || '');

  const handleSave = async (publish: boolean) => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!content.trim()) {
      setError('Content is required');
      return;
    }

    setSaving(true);
    setError('');

    const data: any = {
      preschool_id: preschoolId,
      author_id: authorId,
      title: title.trim(),
      content: content.trim(),
      target_audience: targetAudience,
      priority,
      is_published: publish,
      scheduled_for: scheduledFor || null,
      expires_at: expiresAt || null,
      updated_at: new Date().toISOString(),
    };

    if (publish && !announcement?.is_published) {
      data.published_at = new Date().toISOString();
    }

    if (announcement) {
      // Update existing
      const { error: updateError } = await supabase
        .from('announcements')
        .update(data)
        .eq('id', announcement.id);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      // Create new
      data.created_at = new Date().toISOString();
      if (publish) {
        data.published_at = new Date().toISOString();
      }

      const { error: insertError } = await supabase.from('announcements').insert(data);

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSave();
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
            maxWidth: 600,
            maxHeight: '90vh',
            overflow: 'auto',
            padding: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              background: 'var(--surface-1)',
              zIndex: 1,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
              {announcement ? 'Edit Announcement' : 'New Announcement'}
            </h2>
            <button className="iconBtn" onClick={onClose}>
              <X className="icon20" />
            </button>
          </div>

          {/* Form */}
          <div style={{ padding: 20 }}>
            {error && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: 'var(--danger-light)',
                  color: 'var(--danger)',
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle className="icon16" />
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Title */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter announcement title"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    fontSize: 14,
                  }}
                  autoFocus
                />
              </div>

              {/* Content */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                  Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your announcement here..."
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    fontSize: 14,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Target Audience and Priority */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                    Target Audience
                  </label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all">Everyone</option>
                    <option value="parents">Parents Only</option>
                    <option value="teachers">Teachers Only</option>
                    <option value="students">Students Only</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="low">⚪ Low</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="high">🟠 High</option>
                    <option value="urgent">🔴 Urgent</option>
                  </select>
                </div>
              </div>

              {/* Schedule and Expiry */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                    Schedule For (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledFor ? new Date(scheduledFor).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setScheduledFor(e.target.value ? new Date(e.target.value).toISOString() : '')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      fontSize: 14,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                    Expires At (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={expiresAt ? new Date(expiresAt).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end',
              position: 'sticky',
              bottom: 0,
              background: 'var(--surface-1)',
            }}
          >
            <button className="btn btnSecondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              className="btn btnSecondary"
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Save className="icon16" />
              Save Draft
            </button>
            <button
              className="btn btnPrimary"
              onClick={() => handleSave(true)}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {saving ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16 }} />
                  Saving...
                </>
              ) : (
                <>
                  <Send className="icon16" />
                  Publish
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
