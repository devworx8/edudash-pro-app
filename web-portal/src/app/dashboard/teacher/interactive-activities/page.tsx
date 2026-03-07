'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Gamepad2, Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';

type InteractiveRow = {
  id: string;
  preschool_id: string;
  title: string;
  description: string | null;
  activity_type: 'matching' | 'coloring' | 'tracing' | 'counting' | 'sorting' | 'puzzle' | 'memory' | 'quiz';
  content: Record<string, unknown>;
  difficulty_level: number;
  stars_reward: number;
  age_group: string;
  is_published: boolean;
  created_at: string;
};

const ACTIVITY_TYPES: InteractiveRow['activity_type'][] = [
  'matching',
  'counting',
  'sorting',
  'memory',
  'puzzle',
  'quiz',
  'tracing',
  'coloring',
];

export default function TeacherInteractiveActivitiesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<InteractiveRow | null>(null);
  const [rows, setRows] = useState<InteractiveRow[]>([]);
  const [query, setQuery] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<InteractiveRow['activity_type']>('matching');
  const [difficulty, setDifficulty] = useState('2');
  const [stars, setStars] = useState('3');
  const [ageGroup, setAgeGroup] = useState('3-6');
  const [instructions, setInstructions] = useState('');

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
        .from('interactive_activities')
        .select('*')
        .eq('preschool_id', schoolId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setRows((data || []) as InteractiveRow[]);
    } catch (error) {
      console.error('[TeacherInteractiveActivitiesPage] Failed to load activities:', error);
      alert('Failed to load interactive activities.');
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
    setType('matching');
    setDifficulty('2');
    setStars('3');
    setAgeGroup('3-6');
    setInstructions('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (row: InteractiveRow) => {
    setEditing(row);
    setTitle(row.title || '');
    setDescription(row.description || '');
    setType(row.activity_type || 'matching');
    setDifficulty(String(row.difficulty_level || 2));
    setStars(String(row.stars_reward || 3));
    setAgeGroup(row.age_group || '3-6');
    setInstructions(String((row.content || {}).instructions || ''));
    setShowModal(true);
  };

  const saveRow = async () => {
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
        activity_type: type,
        content: {
          instructions: instructions.trim() || 'Follow the activity instructions.',
          blocks: [],
        },
        difficulty_level: Math.min(5, Math.max(1, Number(difficulty) || 2)),
        stars_reward: Math.min(5, Math.max(1, Number(stars) || 3)),
        age_group: ageGroup,
      };

      if (editing) {
        const { error } = await supabase
          .from('interactive_activities')
          .update(payload)
          .eq('id', editing.id)
          .eq('preschool_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('interactive_activities').insert(payload);
        if (error) throw error;
      }

      setShowModal(false);
      resetForm();
      await loadRows();
    } catch (error) {
      console.error('[TeacherInteractiveActivitiesPage] Failed to save activity:', error);
      alert('Failed to save interactive activity.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        String(row.description || '').toLowerCase().includes(q) ||
        String(row.activity_type || '').toLowerCase().includes(q)
      );
    });
  }, [query, rows]);

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
              <Gamepad2 className="icon24" style={{ color: 'var(--primary)' }} />
              Interactive Activities
            </h1>
            <p style={{ marginTop: 6, color: 'var(--muted)' }}>
              Build and refine playable activities for assignments and class practice.
            </p>
          </div>
          <button className="btn btnPrimary" onClick={openCreateModal}>
            <Plus className="icon16" /> New Interactive
          </button>
        </div>

        <div className="card" style={{ position: 'relative' }}>
          <Search
            className="icon16"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
          />
          <input
            className="input"
            placeholder="Search interactive activities..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 28 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>
            No interactive activities found.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filtered.map((row) => (
              <div key={row.id} className="card" style={{ border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0 }}>{row.title}</h3>
                      <span className="badge">{row.activity_type}</span>
                      <span className="badge">Difficulty {row.difficulty_level}</span>
                      <span className="badge">{row.stars_reward}★</span>
                    </div>
                    {row.description ? (
                      <p style={{ margin: '8px 0 0 0', color: 'var(--muted)' }}>{row.description}</p>
                    ) : null}
                  </div>
                  <button className="iconBtn" onClick={() => openEditModal(row)} title="Edit">
                    <Pencil className="icon16" />
                  </button>
                </div>
              </div>
            ))}
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
            <h2 style={{ margin: 0 }}>{editing ? 'Edit Interactive Activity' : 'Create Interactive Activity'}</h2>
            <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              className="input"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <textarea
              className="input"
              placeholder="Instructions for learners"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <select className="input" value={type} onChange={(e) => setType(e.target.value as InteractiveRow['activity_type'])}>
                {ACTIVITY_TYPES.map((activityType) => (
                  <option key={activityType} value={activityType}>
                    {activityType}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                min={1}
                max={5}
                placeholder="Difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              />
              <input
                className="input"
                type="number"
                min={1}
                max={5}
                placeholder="Stars"
                value={stars}
                onChange={(e) => setStars(e.target.value)}
              />
              <select className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                {['1-2', '3-4', '4-5', '5-6', '3-6'].map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>

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
              <button className="btn btnPrimary" onClick={saveRow} disabled={saving}>
                {saving ? 'Saving...' : 'Save Interactive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherShell>
  );
}
