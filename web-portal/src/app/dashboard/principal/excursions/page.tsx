'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { 
  MapPin, Plus, Edit, Trash2, Calendar, Users, DollarSign, 
  CheckCircle, XCircle, Clock, Bus, X, FileText, Sparkles 
} from 'lucide-react';

interface Excursion {
  id: string;
  title: string;
  description?: string;
  destination: string;
  destination_address?: string;
  excursion_date: string;
  departure_time?: string;
  return_time?: string;
  age_groups: string[];
  estimated_cost_per_child: number;
  total_budget: number;
  consent_required: boolean;
  consent_deadline?: string;
  items_to_bring: string[];
  learning_objectives: string[];
  status: 'draft' | 'pending_approval' | 'approved' | 'cancelled' | 'completed';
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#94a3b8', text: 'white' },
  pending_approval: { bg: '#f59e0b', text: 'white' },
  approved: { bg: '#10b981', text: 'white' },
  cancelled: { bg: '#ef4444', text: 'white' },
  completed: { bg: '#6366f1', text: 'white' },
};

export default function ExcursionsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingExcursion, setEditingExcursion] = useState<Excursion | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);

  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const preschoolName = profile?.preschoolName;

  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    destination: string;
    destination_address: string;
    excursion_date: string;
    departure_time: string;
    return_time: string;
    age_groups: string[];
    estimated_cost_per_child: number;
    total_budget: number;
    consent_required: boolean;
    consent_deadline: string;
    items_to_bring: string[];
    learning_objectives: string[];
    status: Excursion['status'];
  }>({
    title: '',
    description: '',
    destination: '',
    destination_address: '',
    excursion_date: '',
    departure_time: '09:00',
    return_time: '14:00',
    age_groups: ['3-6'],
    estimated_cost_per_child: 0,
    total_budget: 0,
    consent_required: true,
    consent_deadline: '',
    items_to_bring: [],
    learning_objectives: [],
    status: 'draft',
  });

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
      loadExcursions();
    }
  }, [preschoolId]);

  const loadExcursions = async () => {
    if (!preschoolId) return;

    try {
      const { data, error } = await supabase
        .from('school_excursions')
        .select('*')
        .eq('preschool_id', preschoolId)
        .order('excursion_date', { ascending: true });

      if (error) throw error;
      setExcursions(data || []);
    } catch (err) {
      console.error('Error loading excursions:', err);
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
        consent_deadline: formData.consent_deadline || null,
      };

      if (editingExcursion) {
        const { error } = await supabase
          .from('school_excursions')
          .update(payload)
          .eq('id', editingExcursion.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('school_excursions')
          .insert(payload);
        if (error) throw error;
      }

      await loadExcursions();
      resetForm();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this excursion?')) return;

    try {
      const { error } = await supabase
        .from('school_excursions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadExcursions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleStatusChange = async (id: string, newStatus: Excursion['status']) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'approved') {
        updateData.approved_by = userId;
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('school_excursions')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;
      await loadExcursions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingExcursion(null);
    setFormData({
      title: '',
      description: '',
      destination: '',
      destination_address: '',
      excursion_date: '',
      departure_time: '09:00',
      return_time: '14:00',
      age_groups: ['3-6'],
      estimated_cost_per_child: 0,
      total_budget: 0,
      consent_required: true,
      consent_deadline: '',
      items_to_bring: [],
      learning_objectives: [],
      status: 'draft',
    });
  };

  const handleEdit = (excursion: Excursion) => {
    setEditingExcursion(excursion);
    setFormData({
      title: excursion.title,
      description: excursion.description || '',
      destination: excursion.destination,
      destination_address: excursion.destination_address || '',
      excursion_date: excursion.excursion_date,
      departure_time: excursion.departure_time || '09:00',
      return_time: excursion.return_time || '14:00',
      age_groups: excursion.age_groups || ['3-6'],
      estimated_cost_per_child: excursion.estimated_cost_per_child || 0,
      total_budget: excursion.total_budget || 0,
      consent_required: excursion.consent_required,
      consent_deadline: excursion.consent_deadline || '',
      items_to_bring: excursion.items_to_bring || [],
      learning_objectives: excursion.learning_objectives || [],
      status: excursion.status,
    });
    setShowModal(true);
  };

  const generateAISuggestions = async () => {
    setAiGenerating(true);
    // Simulate AI suggestion - in production, call Edge Function
    setTimeout(() => {
      const suggestions = [
        {
          title: 'Local Fire Station Visit',
          destination: 'Community Fire Station',
          learning_objectives: ['Learn about fire safety', 'Understand community helpers', 'Observe fire equipment'],
          items_to_bring: ['Water bottle', 'Hat', 'Sunscreen'],
        },
        {
          title: 'Nature Walk at Botanical Gardens',
          destination: 'Local Botanical Gardens',
          learning_objectives: ['Identify different plants', 'Observe insects and birds', 'Learn about ecosystems'],
          items_to_bring: ['Magnifying glass', 'Nature journal', 'Water', 'Snack'],
        },
        {
          title: 'Farm Visit',
          destination: 'Local Children\'s Farm',
          learning_objectives: ['Learn about farm animals', 'Understand where food comes from', 'Practice gentle handling of animals'],
          items_to_bring: ['Closed shoes', 'Hat', 'Change of clothes'],
        },
      ];
      const random = suggestions[Math.floor(Math.random() * suggestions.length)];
      setFormData(prev => ({
        ...prev,
        title: random.title,
        destination: random.destination,
        learning_objectives: random.learning_objectives,
        items_to_bring: random.items_to_bring,
      }));
      setAiGenerating(false);
    }, 1500);
  };

  const upcomingExcursions = excursions.filter(e => 
    new Date(e.excursion_date) >= new Date() && e.status !== 'cancelled'
  );
  const pastExcursions = excursions.filter(e => 
    new Date(e.excursion_date) < new Date() || e.status === 'completed'
  );

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
            <h1 className="h1">Excursion Planner</h1>
            <p className="text-muted">Plan educational outings and field trips</p>
          </div>
          <button className="btn btnPrimary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Plan Excursion
          </button>
        </div>

        {/* Upcoming Excursions */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={20} style={{ color: 'var(--primary)' }} />
            Upcoming Excursions
          </h2>

          {upcomingExcursions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <MapPin size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
              <p>No upcoming excursions planned</p>
              <button className="btn btnPrimary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
                Plan Your First Excursion
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {upcomingExcursions.map((excursion) => (
                <ExcursionCard
                  key={excursion.id}
                  excursion={excursion}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </div>

        {/* Past Excursions */}
        {pastExcursions.length > 0 && (
          <div className="card">
            <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={20} style={{ color: 'var(--muted)' }} />
              Past Excursions
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {pastExcursions.slice(0, 5).map((excursion) => (
                <div key={excursion.id} style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 12, background: 'var(--surface-1)', borderRadius: 8, opacity: 0.7
                }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{excursion.title}</span>
                    <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                      {new Date(excursion.excursion_date).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="badge" style={{ 
                    background: STATUS_COLORS[excursion.status]?.bg,
                    color: STATUS_COLORS[excursion.status]?.text 
                  }}>
                    {excursion.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}>
            <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>{editingExcursion ? 'Edit Excursion' : 'Plan New Excursion'}</h2>
                <button className="iconBtn" onClick={resetForm}><X size={20} /></button>
              </div>

              {!editingExcursion && (
                <button
                  className="btn"
                  style={{ width: '100%', marginBottom: 20, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}
                  onClick={generateAISuggestions}
                  disabled={aiGenerating}
                >
                  <Sparkles size={18} />
                  {aiGenerating ? 'Generating Ideas...' : 'Get AI Suggestions'}
                </button>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label className="label">Title *</label>
                    <input
                      className="input"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Zoo Visit"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Destination *</label>
                    <input
                      className="input"
                      value={formData.destination}
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                      placeholder="e.g., Johannesburg Zoo"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Address</label>
                    <input
                      className="input"
                      value={formData.destination_address}
                      onChange={(e) => setFormData({ ...formData, destination_address: e.target.value })}
                      placeholder="Full address"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label">Date *</label>
                      <input
                        type="date"
                        className="input"
                        value={formData.excursion_date}
                        onChange={(e) => setFormData({ ...formData, excursion_date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Departure</label>
                      <input
                        type="time"
                        className="input"
                        value={formData.departure_time}
                        onChange={(e) => setFormData({ ...formData, departure_time: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Return</label>
                      <input
                        type="time"
                        className="input"
                        value={formData.return_time}
                        onChange={(e) => setFormData({ ...formData, return_time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label">Cost per Child (R)</label>
                      <input
                        type="number"
                        className="input"
                        value={formData.estimated_cost_per_child}
                        onChange={(e) => setFormData({ ...formData, estimated_cost_per_child: parseFloat(e.target.value) || 0 })}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="label">Total Budget (R)</label>
                      <input
                        type="number"
                        className="input"
                        value={formData.total_budget}
                        onChange={(e) => setFormData({ ...formData, total_budget: parseFloat(e.target.value) || 0 })}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Description</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe the excursion..."
                    />
                  </div>

                  <div>
                    <label className="label">Learning Objectives (one per line)</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={formData.learning_objectives.join('\n')}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        learning_objectives: e.target.value.split('\n').filter(Boolean) 
                      })}
                      placeholder="What will children learn?"
                    />
                  </div>

                  <div>
                    <label className="label">Items to Bring (one per line)</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={formData.items_to_bring.join('\n')}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        items_to_bring: e.target.value.split('\n').filter(Boolean) 
                      })}
                      placeholder="Water bottle, hat, etc."
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      id="consent"
                      checked={formData.consent_required}
                      onChange={(e) => setFormData({ ...formData, consent_required: e.target.checked })}
                    />
                    <label htmlFor="consent">Require parent consent forms</label>
                  </div>

                  {formData.consent_required && (
                    <div>
                      <label className="label">Consent Deadline</label>
                      <input
                        type="date"
                        className="input"
                        value={formData.consent_deadline}
                        onChange={(e) => setFormData({ ...formData, consent_deadline: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button type="button" className="btn" onClick={resetForm} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btnPrimary" style={{ flex: 1 }}>
                    {editingExcursion ? 'Update' : 'Create'} Excursion
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

function ExcursionCard({ 
  excursion, 
  onEdit, 
  onDelete, 
  onStatusChange 
}: { 
  excursion: Excursion;
  onEdit: (e: Excursion) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: Excursion['status']) => void;
}) {
  const statusColor = STATUS_COLORS[excursion.status];

  return (
    <div className="card" style={{ 
      padding: 20, 
      border: excursion.status === 'approved' ? '2px solid #10b981' : '1px solid var(--border)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>{excursion.title}</h3>
            <span className="badge" style={{ background: statusColor?.bg, color: statusColor?.text }}>
              {excursion.status.replace('_', ' ')}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, color: 'var(--muted)', fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={14} /> {excursion.destination}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={14} /> {new Date(excursion.excursion_date).toLocaleDateString()}
            </span>
            {excursion.departure_time && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Bus size={14} /> {excursion.departure_time} - {excursion.return_time}
              </span>
            )}
            {excursion.estimated_cost_per_child > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <DollarSign size={14} /> R{excursion.estimated_cost_per_child}/child
              </span>
            )}
          </div>

          {excursion.description && (
            <p style={{ marginTop: 12, color: 'var(--muted)', fontSize: 14 }}>{excursion.description}</p>
          )}

          {excursion.learning_objectives?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Learning Objectives:</strong>
              <ul style={{ margin: '4px 0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
                {excursion.learning_objectives.slice(0, 3).map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {excursion.status === 'draft' && (
            <button
              className="btn"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => onStatusChange(excursion.id, 'approved')}
            >
              <CheckCircle size={14} /> Approve
            </button>
          )}
          <button className="iconBtn" onClick={() => onEdit(excursion)}><Edit size={18} /></button>
          <button className="iconBtn" onClick={() => onDelete(excursion.id)}><Trash2 size={18} /></button>
        </div>
      </div>
    </div>
  );
}
