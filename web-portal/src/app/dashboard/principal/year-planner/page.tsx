'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Calendar, Plus, Edit, Trash2, CheckCircle, XCircle, BookOpen, X, Sparkles } from 'lucide-react';
import { useTermSuggestionAI } from '@/hooks/useTermSuggestionAI';
import type { TermFormData } from '@/components/principal/year-planner/types';

interface AcademicTerm {
  id: string;
  name: string;
  academic_year: number;
  term_number: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_published: boolean;
  description?: string;
}

type YearPlanMonthlyBucket =
  | 'holidays_closures'
  | 'meetings_admin'
  | 'excursions_extras'
  | 'donations_fundraisers';

interface YearPlanMonthlyEntry {
  id: string;
  preschool_id: string;
  created_by: string;
  academic_year: number;
  month_index: number;
  bucket: YearPlanMonthlyBucket;
  subtype?: string | null;
  title: string;
  details?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  source?: 'ai' | 'manual' | 'synced';
  is_published: boolean;
  published_to_calendar: boolean;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_BUCKET_LABELS: Record<YearPlanMonthlyBucket, string> = {
  holidays_closures: 'Holidays & Closures',
  meetings_admin: 'Meetings & Admin',
  excursions_extras: 'Excursions & Extras',
  donations_fundraisers: 'Donations & Fundraisers',
};

export default function YearPlannerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [monthlyEntries, setMonthlyEntries] = useState<YearPlanMonthlyEntry[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null);
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [editingMonthly, setEditingMonthly] = useState<YearPlanMonthlyEntry | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    academic_year: new Date().getFullYear(),
    term_number: 1,
    start_date: '',
    end_date: '',
    description: '',
    is_active: false,
    is_published: false,
  });
  const [monthlyForm, setMonthlyForm] = useState({
    academic_year: new Date().getFullYear(),
    month_index: 1,
    bucket: 'holidays_closures' as YearPlanMonthlyBucket,
    subtype: '',
    title: '',
    details: '',
    start_date: '',
    end_date: '',
    is_published: false,
  });

  const {
    suggest: aiSuggest,
    isBusy: aiBusy,
    error: aiError,
    lastResult: aiLastResult,
    applyToWebForm: aiApplyToWebForm,
  } = useTermSuggestionAI({ context: 'ecd' });

  const handleAISuggest = useCallback(async () => {
    const currentForSuggest: TermFormData = {
      ...formData,
      start_date: formData.start_date ? new Date(formData.start_date) : new Date(),
      end_date: formData.end_date ? new Date(formData.end_date) : new Date(),
    };
    const result = await aiSuggest(currentForSuggest);
    if (result) aiApplyToWebForm(formData, setFormData);
  }, [formData, aiSuggest, aiApplyToWebForm]);

  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;

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
      loadTerms();
      loadMonthlyEntries();
    }
  }, [preschoolId]);

  const loadTerms = async () => {
    if (!preschoolId) return;
    
    try {
      const { data, error } = await supabase
        .from('academic_terms')
        .select('*')
        .eq('preschool_id', preschoolId)
        .order('academic_year', { ascending: false })
        .order('term_number', { ascending: true });

      if (error) throw error;
      setTerms(data || []);
    } catch (err) {
      console.error('Error loading terms:', err);
    }
  };

  const loadMonthlyEntries = async () => {
    if (!preschoolId) return;

    try {
      const { data, error } = await supabase
        .from('year_plan_monthly_entries')
        .select('*')
        .eq('preschool_id', preschoolId)
        .order('academic_year', { ascending: false })
        .order('month_index', { ascending: true })
        .order('bucket', { ascending: true });

      if (error) throw error;
      setMonthlyEntries((data || []) as YearPlanMonthlyEntry[]);
    } catch (err) {
      console.error('Error loading monthly entries:', err);
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
        start_date: formData.start_date,
        end_date: formData.end_date,
      };

      if (editingTerm) {
        const { error } = await supabase
          .from('academic_terms')
          .update(payload)
          .eq('id', editingTerm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('academic_terms')
          .insert(payload);
        if (error) throw error;
      }

      await loadTerms();
      setShowCreateModal(false);
      setEditingTerm(null);
      setFormData({
        name: '',
        academic_year: new Date().getFullYear(),
        term_number: 1,
        start_date: '',
        end_date: '',
        description: '',
        is_active: false,
        is_published: false,
      });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this term?')) return;
    
    try {
      const { error } = await supabase
        .from('academic_terms')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadTerms();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleTogglePublish = async (term: AcademicTerm) => {
    try {
      const { error } = await supabase
        .from('academic_terms')
        .update({ is_published: !term.is_published })
        .eq('id', term.id);
      if (error) throw error;
      await loadTerms();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleEdit = (term: AcademicTerm) => {
    setEditingTerm(term);
    setFormData({
      name: term.name,
      academic_year: term.academic_year,
      term_number: term.term_number,
      start_date: term.start_date,
      end_date: term.end_date,
      description: term.description || '',
      is_active: term.is_active,
      is_published: term.is_published,
    });
    setShowCreateModal(true);
  };

  const handleMonthlySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preschoolId || !userId) return;
    if (!monthlyForm.title.trim()) {
      alert('Please add a title.');
      return;
    }

    try {
      const payload = {
        preschool_id: preschoolId,
        created_by: userId,
        academic_year: monthlyForm.academic_year,
        month_index: monthlyForm.month_index,
        bucket: monthlyForm.bucket,
        subtype: monthlyForm.subtype || null,
        title: monthlyForm.title.trim(),
        details: monthlyForm.details || null,
        start_date: monthlyForm.start_date || null,
        end_date: monthlyForm.end_date || null,
        source: editingMonthly?.source || 'manual',
        is_published: monthlyForm.is_published,
      };

      if (editingMonthly) {
        const { error } = await supabase
          .from('year_plan_monthly_entries')
          .update(payload)
          .eq('id', editingMonthly.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('year_plan_monthly_entries').insert(payload);
        if (error) throw error;
      }

      setShowMonthlyModal(false);
      setEditingMonthly(null);
      setMonthlyForm({
        academic_year: new Date().getFullYear(),
        month_index: 1,
        bucket: 'holidays_closures',
        subtype: '',
        title: '',
        details: '',
        start_date: '',
        end_date: '',
        is_published: false,
      });
      await loadMonthlyEntries();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleEditMonthly = (entry: YearPlanMonthlyEntry) => {
    setEditingMonthly(entry);
    setMonthlyForm({
      academic_year: entry.academic_year,
      month_index: entry.month_index,
      bucket: entry.bucket,
      subtype: entry.subtype || '',
      title: entry.title,
      details: entry.details || '',
      start_date: entry.start_date || '',
      end_date: entry.end_date || '',
      is_published: entry.is_published,
    });
    setShowMonthlyModal(true);
  };

  const handleDeleteMonthly = async (id: string) => {
    if (!confirm('Delete this monthly item?')) return;
    try {
      const { error } = await supabase
        .from('year_plan_monthly_entries')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadMonthlyEntries();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleToggleMonthlyPublish = async (entry: YearPlanMonthlyEntry) => {
    try {
      const { error } = await supabase
        .from('year_plan_monthly_entries')
        .update({ is_published: !entry.is_published })
        .eq('id', entry.id);
      if (error) throw error;
      await loadMonthlyEntries();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handlePublishMonthlyToCalendar = async (entry: YearPlanMonthlyEntry) => {
    if (!preschoolId || !userId) return;
    try {
      if (entry.bucket === 'meetings_admin') {
        const { error } = await supabase.from('school_meetings').insert({
          preschool_id: preschoolId,
          created_by: userId,
          title: entry.title,
          description: entry.details || '',
          meeting_type: entry.subtype || 'other',
          meeting_date: entry.start_date || `${entry.academic_year}-${String(entry.month_index).padStart(2, '0')}-01`,
          start_time: '09:00',
          end_time: '10:00',
          agenda_items: [],
          invited_roles: ['teacher', 'parent'],
          status: 'draft',
        });
        if (error) throw error;
      } else if (entry.bucket === 'excursions_extras') {
        const { error } = await supabase.from('school_excursions').insert({
          preschool_id: preschoolId,
          created_by: userId,
          title: entry.title,
          description: entry.details || '',
          destination: entry.details || 'Local venue',
          excursion_date: entry.start_date || `${entry.academic_year}-${String(entry.month_index).padStart(2, '0')}-01`,
          learning_objectives: [],
          status: 'draft',
          estimated_cost_per_child: 0,
        });
        if (error) throw error;
      } else {
        const mappedType =
          entry.bucket === 'donations_fundraisers'
            ? (String(entry.subtype || '').toLowerCase().includes('donation') ? 'donation_drive' : 'fundraiser')
            : 'holiday';
        const startDate = entry.start_date || `${entry.academic_year}-${String(entry.month_index).padStart(2, '0')}-01`;
        const endDate = entry.end_date || startDate;
        const { error } = await supabase.from('school_events').insert({
          preschool_id: preschoolId,
          created_by: userId,
          title: entry.title,
          description: entry.details || '',
          event_type: mappedType,
          start_date: startDate,
          end_date: endDate,
          all_day: true,
          is_recurring: false,
          target_audience: ['parent', 'teacher'],
          rsvp_enabled: false,
          send_notifications: true,
          status: 'scheduled',
        });
        if (error) throw error;
      }

      const { error: updateError } = await supabase
        .from('year_plan_monthly_entries')
        .update({ published_to_calendar: true, is_published: true, source: 'synced' })
        .eq('id', entry.id);
      if (updateError) throw updateError;
      await loadMonthlyEntries();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const groupedTerms = terms.reduce((acc, term) => {
    const year = term.academic_year;
    if (!acc[year]) acc[year] = [];
    acc[year].push(term);
    return acc;
  }, {} as Record<number, AcademicTerm[]>);

  const groupedMonthlyEntries = monthlyEntries.reduce((acc, entry) => {
    const year = entry.academic_year;
    if (!acc[year]) acc[year] = [];
    acc[year].push(entry);
    return acc;
  }, {} as Record<number, YearPlanMonthlyEntry[]>);

  if (loading) {
    return (
      <PrincipalShell>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p>Loading...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="h1">Year Planner</h1>
            <p className="text-muted">Plan and publish your academic calendar</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btnSecondary"
              onClick={() => {
                setEditingMonthly(null);
                setMonthlyForm({
                  academic_year: new Date().getFullYear(),
                  month_index: 1,
                  bucket: 'holidays_closures',
                  subtype: '',
                  title: '',
                  details: '',
                  start_date: '',
                  end_date: '',
                  is_published: false,
                });
                setShowMonthlyModal(true);
              }}
            >
              <Calendar size={18} /> Monthly Item
            </button>
            <button
              className="btn btnPrimary"
              onClick={() => {
                setEditingTerm(null);
                setFormData({
                  name: '',
                  academic_year: new Date().getFullYear(),
                  term_number: 1,
                  start_date: '',
                  end_date: '',
                  description: '',
                  is_active: false,
                  is_published: false,
                });
                setShowCreateModal(true);
              }}
            >
              <Plus size={18} /> New Term
            </button>
          </div>
        </div>

        {Object.keys(groupedTerms).length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <Calendar size={48} style={{ color: 'var(--muted)', marginBottom: 16 }} />
            <h3 style={{ marginBottom: 8 }}>No Terms Planned</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              Start by creating your first academic term
            </p>
            <button className="btn btnPrimary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} /> Create First Term
            </button>
          </div>
        ) : (
          Object.entries(groupedTerms)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([year, yearTerms]) => (
              <div key={year} className="card" style={{ marginBottom: 24 }}>
                <h2 style={{ marginBottom: 16, fontSize: 24, fontWeight: 600 }}>
                  Academic Year {year}
                </h2>
                <div style={{ display: 'grid', gap: 16 }}>
                  {yearTerms.map((term) => (
                    <div
                      key={term.id}
                      className="card"
                      style={{
                        padding: 20,
                        border: term.is_active ? '2px solid var(--primary)' : '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <h3 style={{ margin: 0, fontSize: 18 }}>{term.name}</h3>
                          {term.is_active && (
                            <span className="badge" style={{ background: 'var(--primary)', color: 'white' }}>
                              Active
                            </span>
                          )}
                          {term.is_published && (
                            <span className="badge" style={{ background: '#10b981', color: 'white' }}>
                              Published
                            </span>
                          )}
                        </div>
                        <p style={{ color: 'var(--muted)', margin: '4px 0' }}>
                          {new Date(term.start_date).toLocaleDateString()} - {new Date(term.end_date).toLocaleDateString()}
                        </p>
                        {term.description && (
                          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>
                            {term.description}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="iconBtn"
                          onClick={() => handleTogglePublish(term)}
                          title={term.is_published ? 'Unpublish' : 'Publish'}
                        >
                          {term.is_published ? <CheckCircle size={18} /> : <XCircle size={18} />}
                        </button>
                        <button className="iconBtn" onClick={() => handleEdit(term)} title="Edit">
                          <Edit size={18} />
                        </button>
                        <button className="iconBtn" onClick={() => handleDelete(term.id)} title="Delete">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}

        {Object.keys(groupedMonthlyEntries).length > 0 && (
          Object.entries(groupedMonthlyEntries)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([year, entries]) => (
              <div key={`monthly-${year}`} className="card" style={{ marginBottom: 24 }}>
                <h2 style={{ marginBottom: 16, fontSize: 22, fontWeight: 700 }}>
                  Monthly Matrix {year}
                </h2>
                <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)' }}>
                        <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)' }}>Month</th>
                        <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)' }}>Bucket</th>
                        <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)' }}>Title</th>
                        <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)' }}>Dates</th>
                        <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)' }}>State</th>
                        <th style={{ textAlign: 'right', padding: 10, borderBottom: '1px solid var(--border)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries
                        .slice()
                        .sort((a, b) => a.month_index - b.month_index || a.bucket.localeCompare(b.bucket))
                        .map((entry) => (
                          <tr key={entry.id}>
                            <td style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                              {MONTH_LABELS[entry.month_index - 1] || entry.month_index}
                            </td>
                            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                              {MONTH_BUCKET_LABELS[entry.bucket]}
                            </td>
                            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontWeight: 600 }}>{entry.title}</div>
                              {entry.details ? (
                                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{entry.details}</div>
                              ) : null}
                            </td>
                            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                              {entry.start_date || 'TBD'}{entry.end_date ? ` → ${entry.end_date}` : ''}
                            </td>
                            <td style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                <span className="badge" style={{ background: entry.is_published ? '#10b981' : 'rgba(148,163,184,0.2)', color: entry.is_published ? '#fff' : 'var(--muted)' }}>
                                  {entry.is_published ? 'Published' : 'Draft'}
                                </span>
                                <span className="badge" style={{ background: entry.published_to_calendar ? '#6366f1' : 'rgba(148,163,184,0.2)', color: entry.published_to_calendar ? '#fff' : 'var(--muted)' }}>
                                  {entry.published_to_calendar ? 'Calendar Synced' : 'Not Synced'}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: 10, borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 8 }}>
                                <button className="iconBtn" onClick={() => handleToggleMonthlyPublish(entry)} title={entry.is_published ? 'Unpublish' : 'Publish'}>
                                  {entry.is_published ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                </button>
                                <button className="iconBtn" onClick={() => handlePublishMonthlyToCalendar(entry)} title="Publish to Calendar">
                                  <BookOpen size={18} />
                                </button>
                                <button className="iconBtn" onClick={() => handleEditMonthly(entry)} title="Edit">
                                  <Edit size={18} />
                                </button>
                                <button className="iconBtn" onClick={() => handleDeleteMonthly(entry.id)} title="Delete">
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
        )}

        {/* Create/Edit Modal */}
        {showCreateModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>
                  {editingTerm ? 'Edit Term' : 'Create New Term'}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btnSecondary"
                    onClick={handleAISuggest}
                    disabled={aiBusy}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Sparkles size={18} />
                    {aiBusy ? '…' : 'Suggest with Dash'}
                  </button>
                  <button className="iconBtn" onClick={() => setShowCreateModal(false)}>
                    <X size={20} />
                  </button>
                </div>
              </div>

              {aiError && (
                <div className="card" style={{ marginBottom: 16, padding: 12, background: 'rgba(239,68,68,0.15)', color: 'var(--error)' }}>
                  {aiError}
                </div>
              )}
              {aiLastResult?.tips && (
                <div className="card" style={{ marginBottom: 16, padding: 12, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: 13 }}>{aiLastResult.tips}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label className="label">Term Name</label>
                    <input
                      type="text"
                      className="input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Term 1, First Semester"
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label className="label">Academic Year</label>
                      <input
                        type="number"
                        className="input"
                        value={formData.academic_year}
                        onChange={(e) => setFormData({ ...formData, academic_year: Number(e.target.value) })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Term Number</label>
                      <select
                        className="input"
                        value={formData.term_number}
                        onChange={(e) => setFormData({ ...formData, term_number: Number(e.target.value) })}
                        required
                      >
                        <option value={1}>Term 1</option>
                        <option value={2}>Term 2</option>
                        <option value={3}>Term 3</option>
                        <option value={4}>Term 4</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label className="label">Start Date</label>
                      <input
                        type="date"
                        className="input"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">End Date</label>
                      <input
                        type="date"
                        className="input"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Description (Optional)</label>
                    <textarea
                      className="input"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      placeholder="Add any notes about this term..."
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      />
                      <span>Set as Active Term</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={formData.is_published}
                        onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                      />
                      <span>Publish to Teachers</span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btnSecondary"
                      onClick={() => setShowCreateModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btnPrimary">
                      {editingTerm ? 'Update Term' : 'Create Term'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {showMonthlyModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <div className="card" style={{ maxWidth: 620, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>
                  {editingMonthly ? 'Edit Monthly Item' : 'Add Monthly Item'}
                </h2>
                <button className="iconBtn" onClick={() => setShowMonthlyModal(false)}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleMonthlySubmit}>
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label">Year</label>
                      <input
                        type="number"
                        className="input"
                        value={monthlyForm.academic_year}
                        onChange={(e) => setMonthlyForm((prev) => ({ ...prev, academic_year: Number(e.target.value) }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Month</label>
                      <select
                        className="input"
                        value={monthlyForm.month_index}
                        onChange={(e) => setMonthlyForm((prev) => ({ ...prev, month_index: Number(e.target.value) }))}
                        required
                      >
                        {MONTH_LABELS.map((month, index) => (
                          <option key={month} value={index + 1}>
                            {month}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Bucket</label>
                      <select
                        className="input"
                        value={monthlyForm.bucket}
                        onChange={(e) => setMonthlyForm((prev) => ({ ...prev, bucket: e.target.value as YearPlanMonthlyBucket }))}
                        required
                      >
                        {Object.entries(MONTH_BUCKET_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label">Title</label>
                    <input
                      type="text"
                      className="input"
                      value={monthlyForm.title}
                      onChange={(e) => setMonthlyForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., Parent Orientation"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Subtype</label>
                    <input
                      type="text"
                      className="input"
                      value={monthlyForm.subtype}
                      onChange={(e) => setMonthlyForm((prev) => ({ ...prev, subtype: e.target.value }))}
                      placeholder="e.g., parent_meeting, fundraiser, donation_drive"
                    />
                  </div>

                  <div>
                    <label className="label">Details</label>
                    <textarea
                      className="input"
                      value={monthlyForm.details}
                      onChange={(e) => setMonthlyForm((prev) => ({ ...prev, details: e.target.value }))}
                      rows={3}
                      placeholder="Optional details for this month entry..."
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label">Start Date</label>
                      <input
                        type="date"
                        className="input"
                        value={monthlyForm.start_date}
                        onChange={(e) => setMonthlyForm((prev) => ({ ...prev, start_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="label">End Date</label>
                      <input
                        type="date"
                        className="input"
                        value={monthlyForm.end_date}
                        onChange={(e) => setMonthlyForm((prev) => ({ ...prev, end_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={monthlyForm.is_published}
                      onChange={(e) => setMonthlyForm((prev) => ({ ...prev, is_published: e.target.checked }))}
                    />
                    <span>Mark as published</span>
                  </label>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="button" className="btn btnSecondary" onClick={() => setShowMonthlyModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btnPrimary">
                      {editingMonthly ? 'Update Entry' : 'Create Entry'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
