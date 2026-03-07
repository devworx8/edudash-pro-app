'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Edit2, Trash2, Calendar, MapPin, Users, Clock, Bell } from 'lucide-react';

interface EventDetailsModalProps {
  event: any;
  onClose: () => void;
  onEventUpdated: (event: any) => void;
  onEventDeleted: (eventId: string) => void;
}

export function EventDetailsModal({ event, onClose, onEventUpdated, onEventDeleted }: EventDetailsModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('school_events')
        .delete()
        .eq('id', event.id);

      if (error) throw error;

      onEventDeleted(event.id);
    } catch (err: any) {
      console.error('Failed to delete event:', err);
      alert('Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this event?')) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('school_events')
        .update({ 
          status: 'cancelled',
          cancelled_reason: 'Cancelled by organizer',
        })
        .eq('id', event.id)
        .select()
        .single();

      if (error) throw error;

      onEventUpdated(data);
    } catch (err: any) {
      console.error('Failed to cancel event:', err);
      alert('Failed to cancel event');
    } finally {
      setLoading(false);
    }
  };

  const getEventColor = (type: string) => {
    const colors: Record<string, string> = {
      holiday: '#EF4444',
      parent_meeting: '#8B5CF6',
      field_trip: '#10B981',
      assembly: '#3B82F6',
      sports_day: '#F59E0B',
      graduation: '#EC4899',
      fundraiser: '#14B8A6',
      donation_drive: '#0EA5A4',
      other: '#6B7280',
    };
    return colors[type] || colors.other;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: 600,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{event.title}</h2>
              <span
                style={{
                  fontSize: 11,
                  padding: '4px 12px',
                  borderRadius: 12,
                  backgroundColor: `${getEventColor(event.event_type)}20`,
                  color: getEventColor(event.event_type),
                  textTransform: 'capitalize',
                  fontWeight: 600,
                }}
              >
                {event.event_type.replace('_', ' ')}
              </span>
            </div>
            {event.status === 'cancelled' && (
              <span style={{ color: '#EF4444', fontSize: 14, fontWeight: 500 }}>
                ⚠️ Event Cancelled
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={24} style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
          {/* Date and Time */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Calendar size={20} style={{ color: 'var(--primary)', marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>
                {formatDate(event.start_date)}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                {event.all_day ? 'All day' : `${formatTime(event.start_date)} - ${formatTime(event.end_date)}`}
              </div>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <MapPin size={20} style={{ color: 'var(--primary)', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 500 }}>{event.location}</div>
                {event.virtual_link && (
                  <a
                    href={event.virtual_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--primary)', fontSize: 14 }}
                  >
                    Join virtual meeting
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>Description</div>
              <p style={{ color: 'var(--muted)', margin: 0 }}>{event.description}</p>
            </div>
          )}

          {/* Target Audience */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Users size={20} style={{ color: 'var(--primary)', marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>For</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {event.target_audience.map((audience: string) => (
                  <span
                    key={audience}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      backgroundColor: 'var(--card-hover)',
                      color: 'var(--text)',
                      fontSize: 13,
                      textTransform: 'capitalize',
                    }}
                  >
                    {audience}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* RSVP Info */}
          {event.rsvp_required && (
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--card-hover)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Users size={16} style={{ color: 'var(--primary)' }} />
                <span style={{ fontWeight: 500 }}>RSVP Required</span>
              </div>
              {event.rsvp_deadline && (
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Deadline: {formatDate(event.rsvp_deadline)}
                </div>
              )}
              {event.max_attendees && (
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                  Max attendees: {event.max_attendees}
                </div>
              )}
            </div>
          )}

          {/* Recurring Info */}
          {event.is_recurring && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
              <Clock size={16} />
              <span style={{ fontSize: 14 }}>
                Recurring event • {event.recurrence_rule?.freq}
              </span>
            </div>
          )}

          {/* Notification Status */}
          {event.send_notification && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
              <Bell size={16} />
              <span style={{ fontSize: 14 }}>
                {event.notification_sent_at ? 'Notification sent' : 'Will send notification'}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        {event.status !== 'cancelled' && (
          <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: '1px solid var(--divider)' }}>
            <button
              onClick={handleCancel}
              className="btn-secondary"
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? 'Cancelling...' : 'Cancel Event'}
            </button>
            <button
              onClick={handleDelete}
              className="btn-danger"
              disabled={deleting}
              style={{ flex: 1, backgroundColor: '#EF4444' }}
            >
              <Trash2 size={16} style={{ marginRight: 8 }} />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
