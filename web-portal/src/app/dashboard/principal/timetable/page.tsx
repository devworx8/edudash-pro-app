'use client';

import { useEffect, useState, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Calendar, Plus, Pencil, Trash2, X, BookOpen, Coffee, Users, Trophy, GraduationCap, Clock, Printer, FileDown } from 'lucide-react';

interface TimetableSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string | null;
  activity_type: string;
  room: string | null;
  notes?: string | null;
  period_number?: number | null;
  is_break?: boolean;
  teacher_name?: string | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'lesson', label: 'Lesson', icon: BookOpen },
  { value: 'break', label: 'Break', icon: Coffee },
  { value: 'assembly', label: 'Assembly', icon: Users },
  { value: 'sports', label: 'Sports', icon: Trophy },
  { value: 'study', label: 'Study', icon: GraduationCap },
  { value: 'free_period', label: 'Free Period', icon: Clock },
  { value: 'activity', label: 'Activity', icon: Calendar },
  { value: 'outdoor', label: 'Outdoor', icon: Calendar },
  { value: 'meal', label: 'Meal', icon: Coffee },
  { value: 'nap', label: 'Nap', icon: Clock },
  { value: 'other', label: 'Other', icon: Calendar },
];

const ACTIVITY_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  lesson:      { bg: '#3B82F615', text: '#3B82F6', border: '#3B82F640' },
  break:       { bg: '#F59E0B15', text: '#F59E0B', border: '#F59E0B40' },
  assembly:    { bg: '#8B5CF615', text: '#8B5CF6', border: '#8B5CF640' },
  sports:      { bg: '#10B98115', text: '#10B981', border: '#10B98140' },
  study:       { bg: '#6366F115', text: '#6366F1', border: '#6366F140' },
  free_period: { bg: '#94A3B815', text: '#94A3B8', border: '#94A3B840' },
  activity:    { bg: '#EC489915', text: '#EC4899', border: '#EC489940' },
  outdoor:     { bg: '#14B8A615', text: '#14B8A6', border: '#14B8A640' },
  meal:        { bg: '#F9731615', text: '#F97316', border: '#F9731640' },
  nap:         { bg: '#A78BFA15', text: '#A78BFA', border: '#A78BFA40' },
  other:       { bg: '#71717A15', text: '#71717A', border: '#71717A40' },
};

function getSlotColor(activityType: string) {
  return ACTIVITY_TYPE_COLORS[activityType] || ACTIVITY_TYPE_COLORS.other;
}

const normalizeTime = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
};

const timeToMinutes = (value: string) => {
  const [hh, mm] = value.split(':');
  return (Number(hh) || 0) * 60 + (Number(mm) || 0);
};

export default function TimetablePage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() || 1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<{
    start_time: string;
    end_time: string;
    subject: string;
    activity_type: string;
    room: string;
    notes: string;
    period_number: string;
    teacher_name: string;
  }>({
    start_time: '08:00',
    end_time: '09:00',
    subject: '',
    activity_type: 'lesson',
    room: '',
    notes: '',
    period_number: '',
    teacher_name: '',
  });

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/sign-in'); return; }
      setUserId(session.user.id);
    };
    init();
  }, [router, supabase]);

  useEffect(() => {
    if (!preschoolId) return;
    const load = async () => {
      const { data } = await supabase
        .from('timetable_slots')
        .select('*')
        .eq('school_id', preschoolId)
        .order('start_time');
      setSlots((data as TimetableSlot[]) || []);
      setLoading(false);
    };
    load();
  }, [preschoolId, supabase]);

  const daySlots = slots.filter((s) => s.day_of_week === selectedDay);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleSavePDF = useCallback(() => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      let yPos = 20;
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Timetable Management', 105, yPos, { align: 'center' });
      yPos += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${DAYS[selectedDay]} • ${new Date().toLocaleDateString()}`, 105, yPos, { align: 'center' });
      yPos += 12;
      const headers = ['Time', 'Subject / Activity', 'Room'];
      const rows = daySlots.map((s) => [
        `${s.start_time?.slice(0, 5) || ''} – ${s.end_time?.slice(0, 5) || ''}`,
        s.subject || s.activity_type || '',
        s.room || '-',
      ]);
      if (rows.length === 0) {
        doc.text('No classes scheduled', 20, yPos);
      } else {
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: yPos,
          theme: 'grid',
          headStyles: { fillColor: [124, 58, 237] },
        });
      }
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text('EduDash Pro', 105, doc.internal.pageSize.height - 10, { align: 'center' });
      doc.save(`timetable-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [slots, selectedDay, daySlots]);

  const openCreate = () => {
    setEditingSlot(null);
    setFormError(null);
    const last = daySlots[daySlots.length - 1];
    const suggestedStart = last?.end_time?.slice(0, 5) || '08:00';
    const suggestedEndMinutes = timeToMinutes(suggestedStart) + 60;
    const endH = String(Math.floor(suggestedEndMinutes / 60)).padStart(2, '0');
    const endM = String(suggestedEndMinutes % 60).padStart(2, '0');
    const nextPeriod = daySlots.filter((s) => s.period_number != null).length + 1;
    setForm({
      start_time: suggestedStart,
      end_time: `${endH}:${endM}`,
      subject: '',
      activity_type: 'lesson',
      room: '',
      notes: '',
      period_number: String(nextPeriod),
      teacher_name: '',
    });
    setModalOpen(true);
  };

  const openEdit = (slot: TimetableSlot) => {
    setEditingSlot(slot);
    setFormError(null);
    setForm({
      start_time: slot.start_time?.slice(0, 5) || '08:00',
      end_time: slot.end_time?.slice(0, 5) || '09:00',
      subject: slot.subject || '',
      activity_type: slot.activity_type || 'lesson',
      room: slot.room || '',
      notes: slot.notes || '',
      period_number: slot.period_number != null ? String(slot.period_number) : '',
      teacher_name: slot.teacher_name || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingSlot(null);
    setFormError(null);
  };

  const saveSlot = async () => {
    if (!preschoolId || !userId) return;
    setFormError(null);

    const startRaw = normalizeTime(form.start_time);
    const endRaw = normalizeTime(form.end_time);
    if (!startRaw || !endRaw) {
      setFormError('Start and end time are required.');
      return;
    }

    const startMin = timeToMinutes(startRaw);
    const endMin = timeToMinutes(endRaw);
    if (endMin <= startMin) {
      setFormError('End time must be after start time.');
      return;
    }

    const overlapsLocal = daySlots
      .filter((s) => (editingSlot ? s.id !== editingSlot.id : true))
      .some((s) => {
        const sStart = timeToMinutes(normalizeTime(s.start_time));
        const sEnd = timeToMinutes(normalizeTime(s.end_time));
        return startMin < sEnd && endMin > sStart;
      });
    if (overlapsLocal) {
      setFormError('This slot overlaps an existing slot for the selected day.');
      return;
    }

    setSaving(true);
    try {
      let overlapQuery = supabase
        .from('timetable_slots')
        .select('id')
        .eq('school_id', preschoolId)
        .eq('day_of_week', selectedDay)
        .lt('start_time', endRaw)
        .gt('end_time', startRaw)
        .limit(1);
      if (editingSlot) {
        overlapQuery = overlapQuery.neq('id', editingSlot.id);
      }
      const { data: overlaps, error: overlapError } = await overlapQuery;
      if (overlapError) throw overlapError;
      if (overlaps && overlaps.length > 0) {
        setFormError('This slot overlaps an existing slot (server validation).');
        return;
      }

      const periodNum = form.period_number.trim() ? Number(form.period_number) : null;
      const isBreak = ['break', 'meal', 'free_period'].includes(form.activity_type);

      const payload = {
        day_of_week: selectedDay,
        start_time: startRaw,
        end_time: endRaw,
        subject: form.subject.trim() || null,
        activity_type: form.activity_type.trim() || 'lesson',
        room: form.room.trim() || null,
        notes: form.notes.trim() || null,
        period_number: periodNum,
        is_break: isBreak,
        teacher_name: form.teacher_name.trim() || null,
      };

      if (editingSlot) {
        const { data: updated, error } = await supabase
          .from('timetable_slots')
          .update(payload)
          .eq('id', editingSlot.id)
          .select('*')
          .single();
        if (error) throw error;
        setSlots((prev) =>
          prev
            .map((s) => (s.id === editingSlot.id ? (updated as TimetableSlot) : s))
            .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        );
      } else {
        const { data: inserted, error } = await supabase
          .from('timetable_slots')
          .insert({
            school_id: preschoolId,
            created_by: userId,
            ...payload,
          })
          .select('*')
          .single();
        if (error) throw error;
        setSlots((prev) =>
          [...prev, inserted as TimetableSlot].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        );
      }

      setModalOpen(false);
      setEditingSlot(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save slot.';
      console.error('[TimetablePage] Failed to save slot:', err);
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteSlot = async (slot: TimetableSlot) => {
    if (!confirm('Delete this timetable slot?')) return;
    try {
      const { error } = await supabase.from('timetable_slots').delete().eq('id', slot.id);
      if (error) throw error;
      setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete slot.';
      console.error('[TimetablePage] Failed to delete slot:', err);
      alert(message);
    }
  };

  return (
    <PrincipalShell tenantSlug={tenantSlug} userEmail={profile?.email} userName={profile?.firstName} preschoolName={profile?.preschoolName}>
      <div style={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 className="h1">Timetable Management</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Manage weekly class schedules and teacher assignments</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="qa" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={16} /> Print
            </button>
            <button
              className="qa"
              onClick={handleSavePDF}
              disabled={exporting}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <FileDown size={16} /> {exporting ? 'Saving...' : 'Save PDF'}
            </button>
            <button
              className="qa"
              onClick={openCreate}
              style={{ background: 'var(--primary)', color: 'white', border: 'none', gap: 6 }}
            >
              <Plus size={16} /> Add Slot
            </button>
          </div>
        </div>

        {/* Day Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[1, 2, 3, 4, 5].map((day) => (
            <button
              key={day}
              className="qa"
              onClick={() => setSelectedDay(day)}
              style={{
                background: selectedDay === day ? 'var(--primary)' : undefined,
                color: selectedDay === day ? 'white' : undefined,
                border: selectedDay === day ? 'none' : undefined,
              }}
            >
              <Calendar size={14} /> {DAYS[day]}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</p>
        ) : daySlots.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Calendar size={40} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600 }}>No classes scheduled for {FULL_DAYS[selectedDay]}</p>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>Click &quot;Add Slot&quot; to build your timetable</p>
            <div style={{ textAlign: 'left', maxWidth: 360, margin: '0 auto', padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Getting started:</p>
              <ul style={{ fontSize: 13, color: 'var(--muted)', margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                <li>Add lessons, breaks, assemblies, and sports periods</li>
                <li>Assign subjects, rooms, and teachers to each slot</li>
                <li>Use period numbers for structured K-12 scheduling</li>
              </ul>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {daySlots.map((slot) => {
              const color = getSlotColor(slot.activity_type);
              const activityLabel = ACTIVITY_TYPE_OPTIONS.find(o => o.value === slot.activity_type)?.label || slot.activity_type;
              return (
                <div
                  key={slot.id}
                  className="card"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: 14,
                    borderLeft: `4px solid ${color.text}`,
                  }}
                >
                  {slot.period_number != null && (
                    <div style={{
                      minWidth: 40, height: 40, borderRadius: 20,
                      background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13, color: color.text, flexShrink: 0,
                    }}>
                      P{slot.period_number}
                    </div>
                  )}
                  <div style={{ minWidth: 80, textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 14 }}>{slot.start_time?.slice(0, 5)}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>–</div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 14 }}>{slot.end_time?.slice(0, 5)}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{slot.subject || slot.activity_type}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: color.bg, color: color.text, border: `1px solid ${color.border}`,
                      }}>
                        {activityLabel}
                      </span>
                    </div>
                    {slot.room && <div style={{ fontSize: 13, color: 'var(--muted)' }}>📍 {slot.room}</div>}
                    {slot.teacher_name && <div style={{ fontSize: 13, color: 'var(--muted)' }}>👩‍🏫 {slot.teacher_name}</div>}
                    {slot.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{slot.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="iconBtn" onClick={() => openEdit(slot)} title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button className="iconBtn" onClick={() => deleteSlot(slot)} title="Delete" style={{ color: '#ef4444' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div className="card" style={{ width: '100%', maxWidth: 600, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{editingSlot ? 'Edit Timetable Slot' : 'Add Timetable Slot'}</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
                    {FULL_DAYS[selectedDay]}
                  </p>
                </div>
                <button className="iconBtn" onClick={closeModal} aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {/* Time row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    Start time *
                    <input
                      className="input"
                      type="time"
                      value={form.start_time}
                      onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    End time *
                    <input
                      className="input"
                      type="time"
                      value={form.end_time}
                      onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    Period #
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="20"
                      value={form.period_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, period_number: e.target.value }))}
                      placeholder="e.g., 1"
                    />
                  </label>
                </div>

                {/* Activity type - visual picker */}
                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                  Activity type
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ACTIVITY_TYPE_OPTIONS.map((opt) => {
                      const isSelected = form.activity_type === opt.value;
                      const color = getSlotColor(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, activity_type: opt.value }))}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.15s',
                            background: isSelected ? color.text : color.bg,
                            color: isSelected ? '#fff' : color.text,
                            border: `1px solid ${isSelected ? color.text : color.border}`,
                          }}
                        >
                          <opt.icon size={12} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </label>

                {/* Subject + Teacher row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    Subject
                    <input
                      className="input"
                      value={form.subject}
                      onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g., Mathematics, English"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    Teacher
                    <input
                      className="input"
                      value={form.teacher_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, teacher_name: e.target.value }))}
                      placeholder="e.g., Mrs. Smith"
                    />
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                  Room
                  <input
                    className="input"
                    value={form.room}
                    onChange={(e) => setForm((prev) => ({ ...prev, room: e.target.value }))}
                    placeholder="e.g., Room 2, Lab 1, Hall"
                  />
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                  Notes
                  <textarea
                    className="input"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any extra details..."
                  />
                </label>

                {formError && (
                  <div className="card" style={{ padding: 10, border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.08)' }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#fecaca' }}>{formError}</p>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                  <button className="btn btnSecondary" onClick={closeModal} disabled={saving}>
                    Cancel
                  </button>
                  <button className="btn btnPrimary" onClick={saveSlot} disabled={saving}>
                    {saving ? 'Saving...' : editingSlot ? 'Save Changes' : 'Create Slot'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
