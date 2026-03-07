'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { 
  Calendar, Plus, Edit, Trash2, Users, Clock, MapPin, 
  Video, X, CheckCircle, List, FileText
} from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  description?: string;
  meeting_type: string;
  meeting_date: string;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  location?: string;
  is_virtual: boolean;
  virtual_link?: string;
  invited_roles: string[];
  agenda_items: { title: string; duration_minutes?: number; presenter?: string }[];
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  minutes?: string;
  action_items: { task: string; assignee_id?: string; due_date?: string; status?: string }[];
  created_at: string;
}

const MEETING_TYPES = [
  { value: 'staff', label: 'Staff Meeting', icon: '👥' },
  { value: 'parent', label: 'Parent Meeting', icon: '👪' },
  { value: 'governing_body', label: 'Governing Body', icon: '🏛️' },
  { value: 'pta', label: 'PTA Meeting', icon: '🤝' },
  { value: 'curriculum', label: 'Curriculum Planning', icon: '📚' },
  { value: 'safety', label: 'Safety Committee', icon: '🛡️' },
  { value: 'budget', label: 'Budget Review', icon: '💰' },
  { value: 'training', label: 'Staff Training', icon: '🎓' },
  { value: 'one_on_one', label: 'One-on-One', icon: '👤' },
  { value: 'other', label: 'Other', icon: '📋' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#94a3b8', text: 'white' },
  scheduled: { bg: '#3b82f6', text: 'white' },
  in_progress: { bg: '#f59e0b', text: 'white' },
  completed: { bg: '#10b981', text: 'white' },
  cancelled: { bg: '#ef4444', text: 'white' },
};

export default function MeetingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const preschoolName = profile?.preschoolName;

  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    meeting_type: string;
    meeting_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    location: string;
    is_virtual: boolean;
    virtual_link: string;
    invited_roles: string[];
    agenda_items: { title: string; duration_minutes?: number }[];
    status: Meeting['status'];
  }>({
    title: '',
    description: '',
    meeting_type: 'staff',
    meeting_date: '',
    start_time: '09:00',
    end_time: '10:00',
    duration_minutes: 60,
    location: '',
    is_virtual: false,
    virtual_link: '',
    invited_roles: ['teacher'],
    agenda_items: [],
    status: 'scheduled',
  });

  const [newAgendaItem, setNewAgendaItem] = useState('');

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
    if (preschoolId) {
      loadMeetings();
    }
  }, [preschoolId]);

  const loadMeetings = async () => {
    if (!preschoolId) return;

    try {
      const { data, error } = await supabase
        .from('school_meetings')
        .select('*')
        .eq('preschool_id', preschoolId)
        .order('meeting_date', { ascending: true });

      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error('Error loading meetings:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preschoolId || !userId) return;

    try {
      const payload = {
        preschool_id: preschoolId,
        created_by: userId,
        ...formData,
        end_time: formData.end_time || null,
        virtual_link: formData.is_virtual ? formData.virtual_link : null,
      };

      if (editingMeeting) {
        const { error } = await supabase
          .from('school_meetings')
          .update(payload)
          .eq('id', editingMeeting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('school_meetings')
          .insert(payload);
        if (error) throw error;
      }

      await loadMeetings();
      resetForm();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;

    try {
      const { error } = await supabase
        .from('school_meetings')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadMeetings();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleStatusChange = async (id: string, newStatus: Meeting['status']) => {
    try {
      const { error } = await supabase
        .from('school_meetings')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
      await loadMeetings();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingMeeting(null);
    setFormData({
      title: '',
      description: '',
      meeting_type: 'staff',
      meeting_date: '',
      start_time: '09:00',
      end_time: '10:00',
      duration_minutes: 60,
      location: '',
      is_virtual: false,
      virtual_link: '',
      invited_roles: ['teacher'],
      agenda_items: [],
      status: 'scheduled',
    });
    setNewAgendaItem('');
  };

  const handleEdit = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setFormData({
      title: meeting.title,
      description: meeting.description || '',
      meeting_type: meeting.meeting_type,
      meeting_date: meeting.meeting_date,
      start_time: meeting.start_time,
      end_time: meeting.end_time || '',
      duration_minutes: meeting.duration_minutes || 60,
      location: meeting.location || '',
      is_virtual: meeting.is_virtual,
      virtual_link: meeting.virtual_link || '',
      invited_roles: meeting.invited_roles || ['teacher'],
      agenda_items: meeting.agenda_items || [],
      status: meeting.status,
    });
    setShowModal(true);
  };

  const addAgendaItem = () => {
    if (!newAgendaItem.trim()) return;
    setFormData({
      ...formData,
      agenda_items: [...formData.agenda_items, { title: newAgendaItem.trim() }],
    });
    setNewAgendaItem('');
  };

  const removeAgendaItem = (index: number) => {
    setFormData({
      ...formData,
      agenda_items: formData.agenda_items.filter((_, i) => i !== index),
    });
  };

  const today = new Date().toISOString().split('T')[0];
  const upcomingMeetings = meetings.filter(m => m.meeting_date >= today && m.status !== 'cancelled');
  const pastMeetings = meetings.filter(m => m.meeting_date < today || m.status === 'completed');

  if (loading) {
    return (
      <PrincipalShell preschoolName={preschoolName}>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p>Loading...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell preschoolName={preschoolName} hideRightSidebar>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 className="h1">Meeting Scheduler</h1>
            <p className="text-muted">Plan and manage staff, parent, and committee meetings</p>
          </div>
          <button className="btn btnPrimary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Schedule Meeting
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button
            className={`btn ${activeTab === 'upcoming' ? 'btnPrimary' : ''}`}
            onClick={() => setActiveTab('upcoming')}
          >
            Upcoming ({upcomingMeetings.length})
          </button>
          <button
            className={`btn ${activeTab === 'past' ? 'btnPrimary' : ''}`}
            onClick={() => setActiveTab('past')}
          >
            Past ({pastMeetings.length})
          </button>
        </div>

        {/* Meeting List */}
        <div className="card">
          {(activeTab === 'upcoming' ? upcomingMeetings : pastMeetings).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <Calendar size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
              <p>{activeTab === 'upcoming' ? 'No upcoming meetings scheduled' : 'No past meetings'}</p>
              {activeTab === 'upcoming' && (
                <button className="btn btnPrimary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
                  Schedule Your First Meeting
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {(activeTab === 'upcoming' ? upcomingMeetings : pastMeetings).map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </div>

        {/* Modal */}
        {showModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}>
            <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>{editingMeeting ? 'Edit Meeting' : 'Schedule Meeting'}</h2>
                <button className="iconBtn" onClick={resetForm}><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label className="label">Title *</label>
                    <input
                      className="input"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Weekly Staff Meeting"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Meeting Type *</label>
                    <select
                      className="input"
                      value={formData.meeting_type}
                      onChange={(e) => setFormData({ ...formData, meeting_type: e.target.value })}
                    >
                      {MEETING_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label">Date *</label>
                      <input
                        type="date"
                        className="input"
                        value={formData.meeting_date}
                        onChange={(e) => setFormData({ ...formData, meeting_date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Start Time *</label>
                      <input
                        type="time"
                        className="input"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">End Time</label>
                      <input
                        type="time"
                        className="input"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={formData.is_virtual}
                        onChange={(e) => setFormData({ ...formData, is_virtual: e.target.checked })}
                      />
                      Virtual Meeting
                    </label>
                  </div>

                  {formData.is_virtual ? (
                    <div>
                      <label className="label">Meeting Link</label>
                      <input
                        className="input"
                        value={formData.virtual_link}
                        onChange={(e) => setFormData({ ...formData, virtual_link: e.target.value })}
                        placeholder="https://meet.google.com/..."
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="label">Location</label>
                      <input
                        className="input"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder="e.g., Staff Room, Hall"
                      />
                    </div>
                  )}

                  <div>
                    <label className="label">Description</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Meeting purpose and notes..."
                    />
                  </div>

                  <div>
                    <label className="label">Invite Roles</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {['teacher', 'principal', 'parent'].map(role => (
                        <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={formData.invited_roles.includes(role)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, invited_roles: [...formData.invited_roles, role] });
                              } else {
                                setFormData({ ...formData, invited_roles: formData.invited_roles.filter(r => r !== role) });
                              }
                            }}
                          />
                          {role.charAt(0).toUpperCase() + role.slice(1)}s
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Agenda Items */}
                  <div>
                    <label className="label">Agenda Items</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        className="input"
                        value={newAgendaItem}
                        onChange={(e) => setNewAgendaItem(e.target.value)}
                        placeholder="Add agenda item..."
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAgendaItem())}
                      />
                      <button type="button" className="btn" onClick={addAgendaItem}>
                        <Plus size={16} />
                      </button>
                    </div>
                    {formData.agenda_items.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                        {formData.agenda_items.map((item, index) => (
                          <li key={index} style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', background: 'var(--surface-1)', borderRadius: 8, marginBottom: 4
                          }}>
                            <span>{index + 1}. {item.title}</span>
                            <button type="button" className="iconBtn" onClick={() => removeAgendaItem(index)}>
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button type="button" className="btn" onClick={resetForm} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btnPrimary" style={{ flex: 1 }}>
                    {editingMeeting ? 'Update' : 'Schedule'} Meeting
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}

function MeetingCard({ 
  meeting, 
  onEdit, 
  onDelete, 
  onStatusChange 
}: { 
  meeting: Meeting;
  onEdit: (m: Meeting) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: Meeting['status']) => void;
}) {
  const meetingType = MEETING_TYPES.find(t => t.value === meeting.meeting_type);
  const statusColor = STATUS_COLORS[meeting.status];

  return (
    <div className="card" style={{ 
      padding: 20, 
      border: meeting.status === 'scheduled' ? '2px solid var(--primary)' : '1px solid var(--border)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 24 }}>{meetingType?.icon || '📋'}</span>
            <h3 style={{ margin: 0, fontSize: 18 }}>{meeting.title}</h3>
            <span className="badge" style={{ background: statusColor?.bg, color: statusColor?.text }}>
              {meeting.status.replace('_', ' ')}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, color: 'var(--muted)', fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={14} /> {new Date(meeting.meeting_date).toLocaleDateString()}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={14} /> {meeting.start_time}{meeting.end_time && ` - ${meeting.end_time}`}
            </span>
            {meeting.is_virtual ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Video size={14} /> Virtual Meeting
              </span>
            ) : meeting.location && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={14} /> {meeting.location}
              </span>
            )}
            {meeting.invited_roles?.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users size={14} /> {meeting.invited_roles.join(', ')}
              </span>
            )}
          </div>

          {meeting.description && (
            <p style={{ marginTop: 12, color: 'var(--muted)', fontSize: 14 }}>{meeting.description}</p>
          )}

          {meeting.agenda_items?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                <List size={14} /> Agenda ({meeting.agenda_items.length} items)
              </strong>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {meeting.status === 'scheduled' && (
            <button
              className="btn"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => onStatusChange(meeting.id, 'completed')}
            >
              <CheckCircle size={14} /> Mark Complete
            </button>
          )}
          <button className="iconBtn" onClick={() => onEdit(meeting)}><Edit size={18} /></button>
          <button className="iconBtn" onClick={() => onDelete(meeting.id)}><Trash2 size={18} /></button>
        </div>
      </div>
    </div>
  );
}
