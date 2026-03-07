'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Calendar, MapPin, Users, Bell, Repeat } from 'lucide-react';

interface CreateEventModalProps {
  preschoolId: string;
  onClose: () => void;
  onEventCreated: (event: any) => void;
}

export function CreateEventModal({ preschoolId, onClose, onEventCreated }: CreateEventModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'other',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    all_day: false,
    location: '',
    virtual_link: '',
    target_audience: ['all'] as string[],
    send_notification: true,
    rsvp_required: false,
    rsvp_deadline: '',
    max_attendees: '',
    is_recurring: false,
    recurrence_freq: 'weekly',
    recurrence_interval: '1',
    recurrence_end_date: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Build start and end timestamps
      const startDateTime = formData.all_day
        ? new Date(`${formData.start_date}T00:00:00`).toISOString()
        : new Date(`${formData.start_date}T${formData.start_time}`).toISOString();

      const endDateTime = formData.all_day
        ? new Date(`${formData.end_date || formData.start_date}T23:59:59`).toISOString()
        : new Date(`${formData.end_date || formData.start_date}T${formData.end_time || formData.start_time}`).toISOString();

      // Build recurrence rule if recurring
      const recurrence_rule = formData.is_recurring
        ? {
            freq: formData.recurrence_freq,
            interval: parseInt(formData.recurrence_interval) || 1,
          }
        : null;

      const eventData = {
        preschool_id: preschoolId,
        created_by: user.id,
        title: formData.title,
        description: formData.description || null,
        event_type: formData.event_type,
        start_date: startDateTime,
        end_date: endDateTime,
        all_day: formData.all_day,
        location: formData.location || null,
        virtual_link: formData.virtual_link || null,
        target_audience: formData.target_audience,
        send_notification: formData.send_notification,
        rsvp_required: formData.rsvp_required,
        rsvp_deadline: formData.rsvp_deadline ? new Date(formData.rsvp_deadline).toISOString() : null,
        max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : null,
        is_recurring: formData.is_recurring,
        recurrence_rule,
        recurrence_end_date: formData.recurrence_end_date ? new Date(formData.recurrence_end_date).toISOString() : null,
        status: 'scheduled',
      };

      const { data, error: insertError } = await supabase
        .from('school_events')
        .insert(eventData)
        .select()
        .single();

      if (insertError) throw insertError;

      // Send notification if enabled - using notifications-dispatcher
      if (formData.send_notification && data) {
        try {
          await supabase.functions.invoke('notifications-dispatcher', {
            body: { 
              event_type: 'school_event_created',
              event_id: data.id, 
              preschool_id: preschoolId,
              target_audience: formData.target_audience,
            },
          });
          console.log('✅ Event notification sent');
        } catch (notifyError) {
          console.error('Failed to send event notification:', notifyError);
          // Don't fail the whole operation if notification fails
        }
      }

      onEventCreated(data);
    } catch (err: any) {
      console.error('Failed to create event:', err);
      setError(err.message || 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  const toggleAudience = (audience: string) => {
    if (audience === 'all') {
      setFormData({ ...formData, target_audience: ['all'] });
    } else {
      const filtered = formData.target_audience.filter(a => a !== 'all');
      if (filtered.includes(audience)) {
        setFormData({ ...formData, target_audience: filtered.filter(a => a !== audience) });
      } else {
        setFormData({ ...formData, target_audience: [...filtered, audience] });
      }
    }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0 }}>Create Event</h2>
          <button onClick={onClose} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={24} style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {error && (
          <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, backgroundColor: '#FEE2E2', color: '#DC2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Title */}
          <div>
            <label className="label">Event Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="input"
              placeholder="e.g., Parent-Teacher Conference"
            />
          </div>

          {/* Event Type */}
          <div>
            <label className="label">Event Type *</label>
            <select
              required
              value={formData.event_type}
              onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
              className="select"
            >
              <option value="holiday">Holiday</option>
              <option value="parent_meeting">Parent Meeting</option>
              <option value="field_trip">Field Trip</option>
              <option value="assembly">Assembly</option>
              <option value="sports_day">Sports Day</option>
              <option value="graduation">Graduation</option>
              <option value="fundraiser">Fundraiser</option>
              <option value="donation_drive">Donation Drive</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="textarea"
              rows={3}
              placeholder="Additional details about the event..."
            />
          </div>

          {/* Date and Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label">Start Date *</label>
              <input
                type="date"
                required
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="input"
              />
            </div>
            {!formData.all_day && (
              <div>
                <label className="label">Start Time *</label>
                <input
                  type="time"
                  required={!formData.all_day}
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="input"
                />
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="input"
                min={formData.start_date}
              />
            </div>
            {!formData.all_day && (
              <div>
                <label className="label">End Time</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="input"
                />
              </div>
            )}
          </div>

          {/* All Day Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.all_day}
              onChange={(e) => setFormData({ ...formData, all_day: e.target.checked })}
            />
            <span>All day event</span>
          </label>

          {/* Location */}
          <div>
            <label className="label">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="input"
              placeholder="School Hall, Grade R Classroom, etc."
            />
          </div>

          {/* Target Audience */}
          <div>
            <label className="label">Target Audience *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['all', 'parents', 'teachers', 'staff'].map(audience => (
                <button
                  key={audience}
                  type="button"
                  onClick={() => toggleAudience(audience)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '2px solid',
                    borderColor: formData.target_audience.includes(audience) ? 'var(--primary)' : 'var(--divider)',
                    backgroundColor: formData.target_audience.includes(audience) ? 'var(--primary)' : 'transparent',
                    color: formData.target_audience.includes(audience) ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {audience}
                </button>
              ))}
            </div>
          </div>

          {/* Notification */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.send_notification}
              onChange={(e) => setFormData({ ...formData, send_notification: e.target.checked })}
            />
            <Bell size={16} />
            <span>Send notification to attendees</span>
          </label>

          {/* RSVP */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.rsvp_required}
              onChange={(e) => setFormData({ ...formData, rsvp_required: e.target.checked })}
            />
            <Users size={16} />
            <span>Require RSVP</span>
          </label>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="button" onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
