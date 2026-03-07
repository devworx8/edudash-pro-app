'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Sparkles, Pencil, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';

type ActivityTemplateRow = {
  id: string;
  preschool_id: string | null;
  title: string;
  description: string | null;
  activity_type: string;
  age_groups: string[] | null;
  developmental_domains: string[] | null;
  learning_objectives: string[] | null;
  duration_minutes: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

const DEFAULT_TYPES = [
  'art',
  'music',
  'movement',
  'story',
  'dramatic_play',
  'sensory',
  'science',
  'math',
  'literacy',
  'life_skills',
];

export default function TeacherActivitiesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ActivityTemplateRow | null>(null);
  const [rows, setRows] = useState<ActivityTemplateRow[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activityType, setActivityType] = useState<string>(DEFAULT_TYPES[0]);
  const [objectives, setObjectives] = useState('');
  const [duration, setDuration] = useState('30');

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const schoolId = profile?.organizationId || profile?.preschoolId;

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setAuthLoading(false);
    };
    void init();
  }, [router, supabase]);

  const loadRows = async () => {
    if (!schoolId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_templates')
        .select('*')
        .or(`preschool_id.eq.${schoolId},preschool_id.is.null`)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setRows((data || []) as ActivityTemplateRow[]);
    } catch (error) {
      console.error('[TeacherActivitiesPage] Failed to load activities:', error);
      alert('Failed to load activities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!schoolId || authLoading || profileLoading) return;
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, authLoading, profileLoading]);

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setActivityType(DEFAULT_TYPES[0]);
    setObjectives('');
    setDuration('30');
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (row: ActivityTemplateRow) => {
    setEditing(row);
    setTitle(row.title || '');
    setDescription(row.description || '');
    setActivityType(row.activity_type || DEFAULT_TYPES[0]);
    setObjectives((row.learning_objectives || []).join(', '));
    setDuration(String(row.duration_minutes || 30));
    setShowModal(true);
  };

  const saveTemplate = async () => {
    if (!userId || !schoolId) {
      alert('Missing teacher or school context.');
      return;
    }
    if (!title.trim()) {
      alert('Please enter a title.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        preschool_id: schoolId,
        created_by: userId,
        title: title.trim(),
        description: description.trim() || null,
        activity_type: activityType,
        age_groups: ['3-6'],
        developmental_domains: [],
        learning_objectives: objectives
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        materials_needed: [],
        duration_minutes: Math.max(5, Number(duration) || 30),
        group_size: 'small_group',
        setup_instructions: null,
        activity_steps: [],
        theme_tags: [],
        is_published: false,
      };

      if (editing) {
        const { error } = await supabase
          .from('activity_templates')
          .update(payload)
          .eq('id', editing.id)
          .eq('preschool_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('activity_templates').insert(payload);
        if (error) throw error;
      }

      setShowModal(false);
      resetForm();
      await loadRows();
    } catch (error) {
      console.error('[TeacherActivitiesPage] Failed to save template:', error);
      alert('Failed to save activity template.');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (row: ActivityTemplateRow) => {
    if (row.preschool_id !== schoolId) return;
    try {
      const { error } = await supabase
        .from('activity_templates')
        .update({ is_published: !row.is_published })
        .eq('id', row.id)
        .eq('preschool_id', schoolId);
      if (error) throw error;
      await loadRows();
    } catch (error) {
      console.error('[TeacherActivitiesPage] Failed to toggle publish:', error);
      alert('Failed to update publish status.');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const typeMatch = typeFilter === 'all' ? true : row.activity_type === typeFilter;
      const queryMatch =
        !q ||
        row.title.toLowerCase().includes(q) ||
        String(row.description || '').toLowerCase().includes(q) ||
        String(row.activity_type || '').toLowerCase().includes(q);
      return typeMatch && queryMatch;
    });
  }, [query, rows, typeFilter]);

  if (authLoading || profileLoading) {
    return (
      <TeacherShell hideHeader>
        <div className="section">
          <div className="spinner" />
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
      hideHeader
    >
      <div className="section" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkles className="icon24" style={{ color: 'var(--primary)' }} />
              Activity Templates
            </h1>
            <p style={{ marginTop: 6, color: 'var(--muted)' }}>
              Plan and reuse classroom activity templates for your weekly lessons.
            </p>
          </div>
          <button className="btn btnPrimary" onClick={openCreateModal}>
            <Plus className="icon16" /> New Activity
          </button>
        </div>

        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search
              className="icon16"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
            />
            <input
              className="input"
              placeholder="Search activity templates..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
          <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All activity types</option>
            {DEFAULT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 28 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>
            No activity templates found.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filtered.map((row) => {
              const isSchoolOwned = row.preschool_id === schoolId;
              return (
                <div key={row.id} className="card" style={{ border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>{row.title}</h3>
                        <span className="badge">
                          {row.activity_type.replace(/_/g, ' ')}
                        </span>
                        <span
                          className="badge"
                          style={{
                            background: row.is_published ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)',
                            color: row.is_published ? '#10b981' : '#f59e0b',
                          }}
                        >
                          {row.is_published ? 'Published' : 'Draft'}
                        </span>
                        {!isSchoolOwned ? <span className="badge">Global</span> : null}
                      </div>
                      {row.description ? (
                        <p style={{ margin: '8px 0 0 0', color: 'var(--muted)' }}>{row.description}</p>
                      ) : null}
                      <p style={{ margin: '8px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
                        {row.duration_minutes || 30} min • Ages {(row.age_groups || ['3-6']).join(', ')}
                      </p>
                    </div>
                    {isSchoolOwned ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="iconBtn" onClick={() => openEditModal(row)} title="Edit template">
                          <Pencil className="icon16" />
                        </button>
                        <button className="iconBtn" onClick={() => togglePublished(row)} title="Toggle publish">
                          {row.is_published ? <EyeOff className="icon16" /> : <Eye className="icon16" />}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 560, display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0 }}>{editing ? 'Edit Activity Template' : 'Create Activity Template'}</h2>
            <input
              className="input"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="input"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select className="input" value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                {DEFAULT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Duration (minutes)"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                type="number"
                min={5}
              />
            </div>
            <textarea
              className="input"
              placeholder="Learning objectives (comma-separated)"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              rows={3}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                Cancel
              </button>
              <button className="btn btnPrimary" onClick={saveTemplate} disabled={saving}>
                {saving ? 'Saving...' : 'Save Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherShell>
  );
}
