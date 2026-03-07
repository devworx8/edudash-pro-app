'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Plus, Pencil, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import type { WeeklyPlan } from '@/types/ecd-planning';

type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

type DailyDraft = Record<Weekday, { activities: string; objectives: string }>;

type WeeklyForm = {
  weekStartDate: string;
  weekNumber: string;
  weeklyFocus: string;
  weeklyObjectives: string;
  materials: string;
  daily: DailyDraft;
};

const csv = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const toISODate = (date: Date) => date.toISOString().split('T')[0];
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
};

const makeDailyDraft = (): DailyDraft => ({
  monday: { activities: '', objectives: '' },
  tuesday: { activities: '', objectives: '' },
  wednesday: { activities: '', objectives: '' },
  thursday: { activities: '', objectives: '' },
  friday: { activities: '', objectives: '' },
});

const createEmptyForm = (): WeeklyForm => {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + mondayOffset);
  return {
    weekStartDate: toISODate(today),
    weekNumber: '1',
    weeklyFocus: '',
    weeklyObjectives: '',
    materials: '',
    daily: makeDailyDraft(),
  };
};

const mapDailyToForm = (plans: WeeklyPlan['daily_plans'] | undefined): DailyDraft => {
  const next = makeDailyDraft();
  if (!plans) return next;
  WEEKDAYS.forEach((day) => {
    const current = plans[day] || { activities: [], learning_objectives: [] };
    next[day] = {
      activities: (current.activities || []).join(', '),
      objectives: (current.learning_objectives || []).join(', '),
    };
  });
  return next;
};

export default function TeacherWeeklyPlansPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WeeklyPlan | null>(null);
  const [rows, setRows] = useState<WeeklyPlan[]>([]);
  const [form, setForm] = useState<WeeklyForm>(createEmptyForm());

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
        .from('weekly_plans')
        .select('*')
        .eq('preschool_id', schoolId)
        .order('week_start_date', { ascending: false });
      if (error) throw error;
      setRows((data || []) as WeeklyPlan[]);
    } catch (error) {
      console.error('[TeacherWeeklyPlansPage] Failed to load plans:', error);
      alert('Failed to load weekly plans.');
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
    setForm(createEmptyForm());
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (plan: WeeklyPlan) => {
    setEditing(plan);
    setForm({
      weekStartDate: plan.week_start_date,
      weekNumber: String(plan.week_number || 1),
      weeklyFocus: plan.weekly_focus || '',
      weeklyObjectives: (plan.weekly_objectives || []).join(', '),
      materials: (plan.materials_list || []).join(', '),
      daily: mapDailyToForm(plan.daily_plans),
    });
    setShowModal(true);
  };

  const savePlan = async () => {
    if (!userId || !schoolId) {
      alert('Missing teacher or school context.');
      return;
    }
    if (!form.weekStartDate) {
      alert('Week start date is required.');
      return;
    }

    setSaving(true);
    try {
      const dailyPlans = WEEKDAYS.reduce((acc, day) => {
        acc[day] = {
          activities: csv(form.daily[day].activities),
          learning_objectives: csv(form.daily[day].objectives),
        };
        return acc;
      }, {} as WeeklyPlan['daily_plans']);

      const payload = {
        preschool_id: schoolId,
        created_by: userId,
        week_number: Math.max(1, Number(form.weekNumber) || 1),
        week_start_date: form.weekStartDate,
        week_end_date: addDays(form.weekStartDate, 4),
        weekly_focus: form.weeklyFocus.trim() || null,
        weekly_objectives: csv(form.weeklyObjectives),
        materials_list: csv(form.materials),
        daily_plans: dailyPlans,
      };

      if (editing) {
        const { error } = await supabase.from('weekly_plans').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('weekly_plans').insert({ ...payload, status: 'draft' });
        if (error) throw error;
      }

      setShowModal(false);
      resetForm();
      await loadRows();
    } catch (error) {
      console.error('[TeacherWeeklyPlansPage] Failed to save plan:', error);
      alert('Failed to save weekly plan.');
    } finally {
      setSaving(false);
    }
  };

  const submitPlan = async (plan: WeeklyPlan) => {
    try {
      const { error } = await supabase
        .from('weekly_plans')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          // Clear previous revision request metadata on resubmission
          rejection_reason: null,
          rejected_at: null,
          rejected_by: null,
        })
        .eq('id', plan.id);
      if (error) throw error;
      await loadRows();
    } catch (error) {
      console.error('[TeacherWeeklyPlansPage] Failed to submit plan:', error);
      alert('Failed to submit weekly plan.');
    }
  };

  const statusColor = (status: WeeklyPlan['status']) => {
    if (status === 'published') return '#3b82f6';
    if (status === 'approved') return '#10b981';
    if (status === 'submitted') return '#f59e0b';
    return 'var(--muted)';
  };

  const myRows = useMemo(() => rows.filter((row) => row.created_by === userId), [rows, userId]);

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
              <CalendarDays className="icon24" style={{ color: 'var(--primary)' }} />
              Weekly Plans
            </h1>
            <p style={{ marginTop: 6, color: 'var(--muted)' }}>
              Draft your weekly teaching plan and submit it for principal approval.
            </p>
          </div>
          <button className="btn btnPrimary" onClick={openCreateModal}>
            <Plus className="icon16" /> New Weekly Plan
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 28 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : myRows.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>
            You have not created any weekly plans yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {myRows.map((row) => (
              <div key={row.id} className="card" style={{ border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0 }}>
                        Week {row.week_number} ({row.week_start_date})
                      </h3>
                      <span
                        className="badge"
                        style={{
                          background: `${statusColor(row.status)}20`,
                          color: statusColor(row.status),
                          textTransform: 'capitalize',
                        }}
                      >
                        {row.status}
                      </span>
                    </div>
                    {row.weekly_focus ? (
                      <p style={{ margin: '8px 0 0 0', color: 'var(--muted)' }}>
                        Focus: {row.weekly_focus}
                      </p>
                    ) : null}
                    {row.status === 'draft' && row.rejection_reason ? (
                      <div
                        className="card"
                        style={{
                          marginTop: 10,
                          padding: 10,
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          background: 'rgba(245, 158, 11, 0.08)',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                          Revisions requested
                        </p>
                        <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#fde68a' }}>
                          {row.rejection_reason}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="iconBtn" onClick={() => openEditModal(row)} title="Edit">
                      <Pencil className="icon16" />
                    </button>
                    {row.status === 'draft' ? (
                      <button className="iconBtn" onClick={() => submitPlan(row)} title="Submit">
                        <Send className="icon16" />
                      </button>
                    ) : null}
                  </div>
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
            overflow: 'auto',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 760, display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0 }}>{editing ? 'Edit Weekly Plan' : 'Create Weekly Plan'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input
                className="input"
                placeholder="Week start date (YYYY-MM-DD)"
                value={form.weekStartDate}
                onChange={(e) => setForm((prev) => ({ ...prev, weekStartDate: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Week number"
                value={form.weekNumber}
                type="number"
                min={1}
                onChange={(e) => setForm((prev) => ({ ...prev, weekNumber: e.target.value }))}
              />
            </div>
            <input
              className="input"
              placeholder="Weekly focus"
              value={form.weeklyFocus}
              onChange={(e) => setForm((prev) => ({ ...prev, weeklyFocus: e.target.value }))}
            />
            <textarea
              className="input"
              rows={2}
              placeholder="Weekly objectives (comma-separated)"
              value={form.weeklyObjectives}
              onChange={(e) => setForm((prev) => ({ ...prev, weeklyObjectives: e.target.value }))}
            />
            <textarea
              className="input"
              rows={2}
              placeholder="Materials (comma-separated)"
              value={form.materials}
              onChange={(e) => setForm((prev) => ({ ...prev, materials: e.target.value }))}
            />

            <div style={{ display: 'grid', gap: 10 }}>
              {WEEKDAYS.map((day) => (
                <div key={day} className="card" style={{ border: '1px solid var(--border)', padding: 10 }}>
                  <h4 style={{ margin: '0 0 8px 0', textTransform: 'capitalize' }}>{day}</h4>
                  <input
                    className="input"
                    placeholder="Activities (comma-separated)"
                    value={form.daily[day].activities}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        daily: { ...prev.daily, [day]: { ...prev.daily[day], activities: e.target.value } },
                      }))
                    }
                  />
                  <input
                    className="input"
                    placeholder="Learning objectives (comma-separated)"
                    value={form.daily[day].objectives}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        daily: { ...prev.daily, [day]: { ...prev.daily[day], objectives: e.target.value } },
                      }))
                    }
                    style={{ marginTop: 8 }}
                  />
                </div>
              ))}
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
              <button className="btn btnPrimary" onClick={savePlan} disabled={saving}>
                {saving ? 'Saving...' : 'Save Weekly Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherShell>
  );
}
