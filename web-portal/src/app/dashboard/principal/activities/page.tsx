'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { 
  Search, Plus, Edit, Trash2, BookOpen, Clock, Users, 
  X, Sparkles, Filter, ChevronDown
} from 'lucide-react';

interface ActivityTemplate {
  id: string;
  preschool_id?: string;
  title: string;
  description?: string;
  activity_type: string;
  age_groups: string[];
  developmental_domains: string[];
  learning_objectives: string[];
  materials_needed: string[];
  duration_minutes: number;
  group_size?: string;
  setup_instructions?: string;
  activity_steps: { step_number: number; description: string; duration?: number }[];
  theme_tags: string[];
  is_published: boolean;
  is_featured: boolean;
  usage_count: number;
  created_at: string;
}

const ACTIVITY_TYPES = [
  { value: 'art', label: 'Art & Craft', icon: '🎨', color: '#ec4899' },
  { value: 'music', label: 'Music & Movement', icon: '🎵', color: '#8b5cf6' },
  { value: 'movement', label: 'Gross Motor', icon: '🏃', color: '#10b981' },
  { value: 'story', label: 'Story Time', icon: '📚', color: '#3b82f6' },
  { value: 'dramatic_play', label: 'Dramatic Play', icon: '🎭', color: '#f59e0b' },
  { value: 'sensory', label: 'Sensory', icon: '✋', color: '#06b6d4' },
  { value: 'outdoor', label: 'Outdoor', icon: '🌳', color: '#22c55e' },
  { value: 'construction', label: 'Construction', icon: '🔨', color: '#f97316' },
  { value: 'science', label: 'Science', icon: '🔬', color: '#6366f1' },
  { value: 'math', label: 'Math', icon: '🔢', color: '#14b8a6' },
  { value: 'literacy', label: 'Literacy', icon: '📖', color: '#a855f7' },
  { value: 'life_skills', label: 'Life Skills', icon: '🧹', color: '#64748b' },
];

const DEVELOPMENTAL_DOMAINS = [
  { value: 'cognitive', label: 'Cognitive', color: '#3b82f6' },
  { value: 'physical', label: 'Physical', color: '#10b981' },
  { value: 'social', label: 'Social', color: '#f59e0b' },
  { value: 'emotional', label: 'Emotional', color: '#ec4899' },
  { value: 'language', label: 'Language', color: '#8b5cf6' },
];

const AGE_GROUPS = ['1-2', '3-4', '4-5', '5-6', '3-6'];

export default function ActivitiesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityTemplate[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const preschoolName = profile?.preschoolName;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    activity_type: 'art',
    age_groups: ['3-6'] as string[],
    developmental_domains: [] as string[],
    learning_objectives: [] as string[],
    materials_needed: [] as string[],
    duration_minutes: 30,
    group_size: 'small_group',
    setup_instructions: '',
    activity_steps: [] as { step_number: number; description: string }[],
    theme_tags: [] as string[],
    is_published: false,
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
    loadActivities();
  }, [preschoolId]);

  const loadActivities = async () => {
    try {
      // Load both global templates and school-specific ones
      let query = supabase
        .from('activity_templates')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('usage_count', { ascending: false });

      if (preschoolId) {
        query = query.or(`preschool_id.eq.${preschoolId},preschool_id.is.null`);
      } else {
        query = query.is('preschool_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setActivities(data || []);
    } catch (err) {
      console.error('Error loading activities:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    try {
      const payload = {
        preschool_id: preschoolId, // School-specific activity
        created_by: userId,
        ...formData,
        activity_steps: formData.activity_steps.map((step, i) => ({ ...step, step_number: i + 1 })),
      };

      if (editingActivity) {
        const { error } = await supabase
          .from('activity_templates')
          .update(payload)
          .eq('id', editingActivity.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('activity_templates')
          .insert(payload);
        if (error) throw error;
      }

      await loadActivities();
      resetForm();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    try {
      const { error } = await supabase
        .from('activity_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadActivities();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingActivity(null);
    setFormData({
      title: '',
      description: '',
      activity_type: 'art',
      age_groups: ['3-6'],
      developmental_domains: [],
      learning_objectives: [],
      materials_needed: [],
      duration_minutes: 30,
      group_size: 'small_group',
      setup_instructions: '',
      activity_steps: [],
      theme_tags: [],
      is_published: false,
    });
  };

  const handleEdit = (activity: ActivityTemplate) => {
    // Can only edit own school's activities
    if (activity.preschool_id !== preschoolId) {
      alert('You can only edit activities created by your school');
      return;
    }
    setEditingActivity(activity);
    setFormData({
      title: activity.title,
      description: activity.description || '',
      activity_type: activity.activity_type,
      age_groups: activity.age_groups || ['3-6'],
      developmental_domains: activity.developmental_domains || [],
      learning_objectives: activity.learning_objectives || [],
      materials_needed: activity.materials_needed || [],
      duration_minutes: activity.duration_minutes || 30,
      group_size: activity.group_size || 'small_group',
      setup_instructions: activity.setup_instructions || '',
      activity_steps: activity.activity_steps || [],
      theme_tags: activity.theme_tags || [],
      is_published: activity.is_published,
    });
    setShowModal(true);
  };

  // Filter activities
  const filteredActivities = activities.filter(activity => {
    const matchesSearch = !searchQuery || 
      activity.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.theme_tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = !filterType || activity.activity_type === filterType;
    const matchesDomain = !filterDomain || activity.developmental_domains?.includes(filterDomain);

    return matchesSearch && matchesType && matchesDomain;
  });

  // Separate global and school activities
  const globalActivities = filteredActivities.filter(a => !a.preschool_id);
  const schoolActivities = filteredActivities.filter(a => a.preschool_id === preschoolId);

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
            <h1 className="h1">Activity Library</h1>
            <p className="text-muted">Browse and create ECD activities for your teachers</p>
          </div>
          <button className="btn btnPrimary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Create Activity
          </button>
        </div>

        {/* Search and Filters */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <input
                className="input"
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
              <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            </div>
            <button className="btn" onClick={() => setShowFilters(!showFilters)}>
              <Filter size={18} /> Filters {(filterType || filterDomain) && '•'}
            </button>
          </div>

          {showFilters && (
            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <select
                className="input"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                style={{ minWidth: 150 }}
              >
                <option value="">All Types</option>
                {ACTIVITY_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.icon} {type.label}</option>
                ))}
              </select>
              <select
                className="input"
                value={filterDomain}
                onChange={(e) => setFilterDomain(e.target.value)}
                style={{ minWidth: 150 }}
              >
                <option value="">All Domains</option>
                {DEVELOPMENTAL_DOMAINS.map(domain => (
                  <option key={domain.value} value={domain.value}>{domain.label}</option>
                ))}
              </select>
              {(filterType || filterDomain) && (
                <button className="btn" onClick={() => { setFilterType(''); setFilterDomain(''); }}>
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* School Activities */}
        {schoolActivities.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Your School's Activities</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {schoolActivities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isOwn={true}
                />
              ))}
            </div>
          </div>
        )}

        {/* Global Activities Library */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            EduDash Activity Library
            <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8, fontSize: 14 }}>
              ({globalActivities.length} activities)
            </span>
          </h2>
          
          {globalActivities.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <BookOpen size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
              <p>No activities match your search</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {globalActivities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isOwn={false}
                />
              ))}
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <ActivityModal
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            onCancel={resetForm}
            isEditing={!!editingActivity}
          />
        )}
      </div>
    </PrincipalShell>
  );
}

function ActivityCard({ 
  activity, 
  onEdit, 
  onDelete,
  isOwn,
}: { 
  activity: ActivityTemplate;
  onEdit: (a: ActivityTemplate) => void;
  onDelete: (id: string) => void;
  isOwn: boolean;
}) {
  const activityType = ACTIVITY_TYPES.find(t => t.value === activity.activity_type);
  
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ 
            fontSize: 24, padding: 8, borderRadius: 8,
            background: `${activityType?.color}20`
          }}>
            {activityType?.icon || '📋'}
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{activity.title}</h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{activityType?.label}</span>
          </div>
        </div>
        {activity.is_featured && (
          <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>Featured</span>
        )}
      </div>

      {activity.description && (
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          {activity.description.slice(0, 100)}{activity.description.length > 100 ? '...' : ''}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          <Clock size={12} /> {activity.duration_minutes} min
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          <Users size={12} /> Ages {activity.age_groups?.join(', ')}
        </span>
      </div>

      {/* Developmental domains */}
      {activity.developmental_domains?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {activity.developmental_domains.map(domain => {
            const d = DEVELOPMENTAL_DOMAINS.find(dd => dd.value === domain);
            return (
              <span key={domain} className="badge" style={{ 
                background: `${d?.color}20`, 
                color: d?.color,
                fontSize: 11 
              }}>
                {d?.label || domain}
              </span>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {activity.usage_count || 0} uses
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {isOwn && (
            <>
              <button className="iconBtn" onClick={() => onEdit(activity)}><Edit size={16} /></button>
              <button className="iconBtn" onClick={() => onDelete(activity.id)}><Trash2 size={16} /></button>
            </>
          )}
          <button className="btn" style={{ fontSize: 12, padding: '4px 12px' }}>
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivityModal({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  isEditing,
}: {
  formData: any;
  setFormData: (data: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEditing: boolean;
}) {
  const [newObjective, setNewObjective] = useState('');
  const [newMaterial, setNewMaterial] = useState('');
  const [newStep, setNewStep] = useState('');

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div className="card" style={{ maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>{isEditing ? 'Edit Activity' : 'Create Activity'}</h2>
          <button className="iconBtn" onClick={onCancel}><X size={20} /></button>
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label className="label">Title *</label>
              <input
                className="input"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Activity title"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Activity Type *</label>
                <select
                  className="input"
                  value={formData.activity_type}
                  onChange={(e) => setFormData({ ...formData, activity_type: e.target.value })}
                >
                  {ACTIVITY_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.icon} {type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Duration (minutes)</label>
                <input
                  type="number"
                  className="input"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 30 })}
                  min="5"
                  max="120"
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
                placeholder="Describe the activity..."
              />
            </div>

            <div>
              <label className="label">Age Groups</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AGE_GROUPS.map(age => (
                  <label key={age} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={formData.age_groups.includes(age)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, age_groups: [...formData.age_groups, age] });
                        } else {
                          setFormData({ ...formData, age_groups: formData.age_groups.filter((a: string) => a !== age) });
                        }
                      }}
                    />
                    {age} years
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Developmental Domains</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DEVELOPMENTAL_DOMAINS.map(domain => (
                  <label key={domain.value} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={formData.developmental_domains.includes(domain.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, developmental_domains: [...formData.developmental_domains, domain.value] });
                        } else {
                          setFormData({ ...formData, developmental_domains: formData.developmental_domains.filter((d: string) => d !== domain.value) });
                        }
                      }}
                    />
                    {domain.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Learning Objectives</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="input"
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value)}
                  placeholder="Add learning objective..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newObjective.trim()) {
                        setFormData({ ...formData, learning_objectives: [...formData.learning_objectives, newObjective.trim()] });
                        setNewObjective('');
                      }
                    }
                  }}
                />
                <button type="button" className="btn" onClick={() => {
                  if (newObjective.trim()) {
                    setFormData({ ...formData, learning_objectives: [...formData.learning_objectives, newObjective.trim()] });
                    setNewObjective('');
                  }
                }}>
                  <Plus size={16} />
                </button>
              </div>
              {formData.learning_objectives.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {formData.learning_objectives.map((obj: string, i: number) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{obj}</span>
                      <button type="button" className="iconBtn" onClick={() => {
                        setFormData({ ...formData, learning_objectives: formData.learning_objectives.filter((_: any, idx: number) => idx !== i) });
                      }}>
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="label">Materials Needed</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="input"
                  value={newMaterial}
                  onChange={(e) => setNewMaterial(e.target.value)}
                  placeholder="Add material..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newMaterial.trim()) {
                        setFormData({ ...formData, materials_needed: [...formData.materials_needed, newMaterial.trim()] });
                        setNewMaterial('');
                      }
                    }
                  }}
                />
                <button type="button" className="btn" onClick={() => {
                  if (newMaterial.trim()) {
                    setFormData({ ...formData, materials_needed: [...formData.materials_needed, newMaterial.trim()] });
                    setNewMaterial('');
                  }
                }}>
                  <Plus size={16} />
                </button>
              </div>
              {formData.materials_needed.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {formData.materials_needed.map((mat: string, i: number) => (
                    <span key={i} className="badge" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {mat}
                      <button type="button" onClick={() => {
                        setFormData({ ...formData, materials_needed: formData.materials_needed.filter((_: any, idx: number) => idx !== i) });
                      }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button type="button" className="btn" onClick={onCancel} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="btn btnPrimary" style={{ flex: 1 }}>
              {isEditing ? 'Update' : 'Create'} Activity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
