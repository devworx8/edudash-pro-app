'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import {
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';

type StationeryList = {
  id: string;
  age_group_label: string;
  age_min: number | null;
  age_max: number | null;
  is_visible: boolean;
  is_published: boolean;
  sort_order: number;
};

type StationeryItem = {
  id: string;
  list_id: string;
  item_name: string;
  required_quantity: number;
  unit_label: string | null;
  sort_order: number;
  is_visible: boolean;
  notes: string | null;
};

type StudentRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  classes?: { name?: string | null } | null;
};

type StudentProgressRow = {
  studentId: string;
  studentName: string;
  className: string;
  listId: string | null;
  listLabel: string;
  boughtCount: number;
  remainingCount: number;
  totalCount: number;
  noteText: string;
  expectedBy: string;
};

function getAcademicYear(): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
      }).format(new Date())
    );
  } catch {
    return new Date().getFullYear();
  }
}

function getAgeFromDob(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function PrincipalStationeryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string>();
  const { profile, loading: profileLoading } = useUserProfile(userId);

  const schoolId = profile?.preschoolId || profile?.organizationId;
  const schoolName = profile?.preschoolName || profile?.organizationName;

  const [academicYear] = useState<number>(() => getAcademicYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<StationeryList[]>([]);
  const [items, setItems] = useState<StationeryItem[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('pc');

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/sign-in');
        return;
      }
      setUserId(user.id);
    };
    void init();
  }, [router, supabase]);

  const load = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await supabase.rpc('ensure_stationery_year_templates', {
        p_school_id: schoolId,
        p_academic_year: academicYear,
      });

      const [{ data: listRows, error: listError }, { data: studentRows, error: studentError }] = await Promise.all([
        supabase
          .from('stationery_lists')
          .select('id, age_group_label, age_min, age_max, is_visible, is_published, sort_order')
          .eq('school_id', schoolId)
          .eq('academic_year', academicYear)
          .order('sort_order', { ascending: true }),
        supabase
          .from('students')
          .select('id, first_name, last_name, date_of_birth, classes(name)')
          .or(`preschool_id.eq.${schoolId},organization_id.eq.${schoolId}`)
          .eq('is_active', true)
          .order('first_name', { ascending: true }),
      ]);

      if (listError) throw listError;
      if (studentError) throw studentError;

      const loadedLists = (listRows || []) as StationeryList[];
      const listIds = loadedLists.map((row) => row.id);
      const loadedStudents = (studentRows || []) as StudentRow[];
      const studentIds = loadedStudents.map((row) => row.id);

      const [{ data: itemRows }, { data: checkRows }, { data: noteRows }, { data: overrideRows }] = await Promise.all([
        listIds.length
          ? supabase
              .from('stationery_list_items')
              .select('id, list_id, item_name, required_quantity, unit_label, sort_order, is_visible, notes')
              .in('list_id', listIds)
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? supabase
              .from('stationery_parent_checks')
              .select('student_id, item_id, is_bought')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? supabase
              .from('stationery_parent_notes')
              .select('student_id, note_text, expected_completion_date')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? supabase
              .from('stationery_student_overrides')
              .select('student_id, list_id')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      setLists(loadedLists);
      setItems((itemRows || []) as StationeryItem[]);
      setStudents(loadedStudents);
      setChecks(checkRows || []);
      setNotes(noteRows || []);
      setOverrides(
        Object.fromEntries(
          (overrideRows || [])
            .filter((row: any) => row?.student_id && row?.list_id)
            .map((row: any) => [String(row.student_id), String(row.list_id)])
        )
      );

      if (!selectedListId && loadedLists[0]?.id) {
        setSelectedListId(loadedLists[0].id);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load stationery module');
    } finally {
      setLoading(false);
    }
  }, [academicYear, schoolId, selectedListId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemsByList = useMemo(() => {
    const map = new Map<string, StationeryItem[]>();
    items.forEach((item) => {
      const list = map.get(item.list_id) || [];
      list.push(item);
      map.set(item.list_id, list);
    });
    for (const [key, value] of map.entries()) {
      value.sort((a, b) => a.sort_order - b.sort_order);
      map.set(key, value);
    }
    return map;
  }, [items]);

  const selectedListItems = useMemo(
    () => (selectedListId ? itemsByList.get(selectedListId) || [] : []),
    [itemsByList, selectedListId]
  );

  const progressRows = useMemo<StudentProgressRow[]>(() => {
    const checkMap = new Map<string, boolean>();
    checks.forEach((row: any) => {
      if (!row?.student_id || !row?.item_id) return;
      checkMap.set(`${row.student_id}:${row.item_id}`, Boolean(row.is_bought));
    });
    const noteMap = new Map<string, any>();
    notes.forEach((row: any) => {
      if (!row?.student_id) return;
      noteMap.set(String(row.student_id), row);
    });

    return students.map((student) => {
      const overrideListId = overrides[student.id] || null;
      const age = getAgeFromDob(student.date_of_birth || null);
      let activeList = lists.find((list) => list.id === overrideListId) || null;
      if (!activeList) {
        activeList =
          lists.find((list) => {
            if (age == null) return false;
            if (list.age_min != null && age < list.age_min) return false;
            if (list.age_max != null && age > list.age_max) return false;
            return true;
          }) || lists[0] || null;
      }

      const activeItems = activeList ? itemsByList.get(activeList.id) || [] : [];
      const boughtCount = activeItems.filter((item) => checkMap.get(`${student.id}:${item.id}`)).length;
      const totalCount = activeItems.length;
      const remainingCount = Math.max(totalCount - boughtCount, 0);
      const note = noteMap.get(student.id);
      const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';

      return {
        studentId: student.id,
        studentName,
        className: student.classes?.name || 'Class not set',
        listId: activeList?.id || null,
        listLabel: activeList?.age_group_label || 'No list assigned',
        boughtCount,
        remainingCount,
        totalCount,
        noteText: String(note?.note_text || ''),
        expectedBy: String(note?.expected_completion_date || ''),
      };
    });
  }, [checks, itemsByList, lists, notes, overrides, students]);

  const progressFilter = useMemo(() => {
    const filter = String(searchParams.get('filter') || '').toLowerCase();
    return filter === 'incomplete' ? 'incomplete' : 'all';
  }, [searchParams]);

  const filteredProgressRows = useMemo(() => {
    if (progressFilter !== 'incomplete') return progressRows;
    return progressRows.filter((row) => row.remainingCount > 0 || row.totalCount === 0);
  }, [progressFilter, progressRows]);

  const stats = useMemo(() => {
    const totalStudents = progressRows.length;
    const completeCount = progressRows.filter((row) => row.totalCount > 0 && row.remainingCount === 0).length;
    const incompleteCount = Math.max(totalStudents - completeCount, 0);
    const overdueEtaCount = progressRows.filter((row) => {
      if (!row.expectedBy || row.remainingCount <= 0) return false;
      const d = new Date(`${row.expectedBy}T00:00:00`);
      return Number.isFinite(d.getTime()) && d.getTime() < Date.now();
    }).length;
    return { totalStudents, completeCount, incompleteCount, overdueEtaCount };
  }, [progressRows]);

  const saveListToggle = async (listId: string, field: 'is_visible' | 'is_published', value: boolean) => {
    setSaving(true);
    try {
      const { error: saveError } = await supabase
        .from('stationery_lists')
        .update({ [field]: value })
        .eq('id', listId);
      if (saveError) throw saveError;
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to update list setting');
    } finally {
      setSaving(false);
    }
  };

  const saveItemVisibility = async (itemId: string, value: boolean) => {
    setSaving(true);
    try {
      const { error: saveError } = await supabase
        .from('stationery_list_items')
        .update({ is_visible: value })
        .eq('id', itemId);
      if (saveError) throw saveError;
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to update item visibility');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    setSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from('stationery_list_items')
        .delete()
        .eq('id', itemId);
      if (deleteError) throw deleteError;
      await load();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Failed to delete item');
    } finally {
      setSaving(false);
    }
  };

  const addItem = async () => {
    if (!selectedListId) return;
    const itemName = newItemName.trim();
    const quantity = Number.parseInt(newItemQty.trim(), 10);
    if (!itemName || !Number.isFinite(quantity) || quantity < 0) {
      setError('Enter a valid item name and quantity');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const nextSort =
        selectedListItems.length > 0
          ? Math.max(...selectedListItems.map((item) => Number(item.sort_order || 0))) + 10
          : 10;

      const { error: insertError } = await supabase
        .from('stationery_list_items')
        .insert({
          list_id: selectedListId,
          item_name: itemName,
          required_quantity: quantity,
          unit_label: (newItemUnit || 'pc').trim() || 'pc',
          sort_order: nextSort,
          is_visible: true,
        });
      if (insertError) throw insertError;

      setNewItemName('');
      setNewItemQty('1');
      setNewItemUnit('pc');
      await load();
    } catch (insertError: any) {
      setError(insertError?.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const saveOverride = async (studentId: string, listId: string) => {
    setSaving(true);
    try {
      const payload = {
        student_id: studentId,
        list_id: listId,
        academic_year: academicYear,
      };
      const { error: upsertError } = await supabase
        .from('stationery_student_overrides')
        .upsert(payload, { onConflict: 'student_id,academic_year' });
      if (upsertError) throw upsertError;
      setOverrides((prev) => ({ ...prev, [studentId]: listId }));
      await load();
    } catch (upsertError: any) {
      setError(upsertError?.message || 'Failed to save student override');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const headers = [
      'Student',
      'Class',
      'Age Group',
      'Bought',
      'Remaining',
      'Total',
      'Note',
      'Expected By',
    ];
    const rows = filteredProgressRows.map((row) =>
      [
        csvEscape(row.studentName),
        csvEscape(row.className),
        csvEscape(row.listLabel),
        csvEscape(row.boughtCount),
        csvEscape(row.remainingCount),
        csvEscape(row.totalCount),
        csvEscape(row.noteText),
        csvEscape(row.expectedBy),
      ].join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stationery-progress-${academicYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PrincipalShell
      userEmail={profile?.email}
      userName={profile?.firstName || profile?.email}
      preschoolName={schoolName}
      preschoolId={schoolId}
    >
      <div className="section" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="h1" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <ClipboardList className="icon24" style={{ color: 'var(--primary)' }} />
              Stationery Control Center
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--textLight)' }}>
              Manage age-group lists, visibility, and per-student stationery readiness for {academicYear}.
            </p>
            {progressFilter === 'incomplete' ? (
              <p style={{ margin: '6px 0 0', color: '#f59e0b', fontSize: 13 }}>
                Showing incomplete students only.
              </p>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btnSecondary" onClick={() => void load()} disabled={loading || profileLoading || saving}>
              <RefreshCw className="icon14" /> Refresh
            </button>
            <button className="btn btnPrimary" onClick={exportCsv} disabled={filteredProgressRows.length === 0}>
              <Download className="icon14" /> Export CSV
            </button>
          </div>
        </div>

        {error ? (
          <div className="card" style={{ color: '#f87171' }}>{error}</div>
        ) : null}

        {loading || profileLoading ? (
          <div className="card" style={{ textAlign: 'center', padding: 24 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : (
          <>
            <div className="grid2">
              <div className="card tile">
                <div className="metricValue">{stats.totalStudents}</div>
                <div className="metricLabel">Students tracked</div>
              </div>
              <div className="card tile">
                <div className="metricValue" style={{ color: '#22c55e' }}>{stats.completeCount}</div>
                <div className="metricLabel">Complete</div>
              </div>
              <div className="card tile">
                <div className="metricValue" style={{ color: '#f59e0b' }}>{stats.incompleteCount}</div>
                <div className="metricLabel">Incomplete</div>
              </div>
              <div className="card tile">
                <div className="metricValue" style={{ color: '#ef4444' }}>{stats.overdueEtaCount}</div>
                <div className="metricLabel">Overdue ETA</div>
              </div>
            </div>

            <div className="card" style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Templates & Visibility</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {lists.map((list) => {
                  const active = selectedListId === list.id;
                  return (
                    <div key={list.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          className="btn btnSecondary"
                          onClick={() => setSelectedListId(list.id)}
                          style={active ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}
                        >
                          {list.age_group_label}
                        </button>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            className="btn btnSecondary"
                            onClick={() => void saveListToggle(list.id, 'is_visible', !list.is_visible)}
                            disabled={saving}
                          >
                            {list.is_visible ? <Eye className="icon14" /> : <EyeOff className="icon14" />}
                            {list.is_visible ? 'Visible' : 'Hidden'}
                          </button>
                          <button
                            className="btn btnSecondary"
                            onClick={() => void saveListToggle(list.id, 'is_published', !list.is_published)}
                            disabled={saving}
                          >
                            <Save className="icon14" />
                            {list.is_published ? 'Published' : 'Unpublished'}
                          </button>
                        </div>
                      </div>
                      <div style={{ color: 'var(--textLight)', fontSize: 12 }}>
                        Age range: {list.age_min ?? '-'} to {list.age_max ?? '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card" style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Items ({lists.find((list) => list.id === selectedListId)?.age_group_label || 'Select a list'})</div>

              {selectedListId ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 120px auto', gap: 8 }}>
                    <input
                      className="input"
                      placeholder="New item name"
                      value={newItemName}
                      onChange={(event) => setNewItemName(event.target.value)}
                    />
                    <input
                      className="input"
                      value={newItemQty}
                      onChange={(event) => setNewItemQty(event.target.value)}
                      inputMode="numeric"
                    />
                    <input
                      className="input"
                      value={newItemUnit}
                      onChange={(event) => setNewItemUnit(event.target.value)}
                      placeholder="unit"
                    />
                    <button className="btn btnPrimary" onClick={() => void addItem()} disabled={saving}>
                      <Plus className="icon14" /> Add
                    </button>
                  </div>

                  {selectedListItems.length === 0 ? (
                    <div style={{ color: 'var(--textLight)', fontSize: 13 }}>No items in this list yet.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {selectedListItems.map((item) => (
                        <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                            <div style={{ color: 'var(--textLight)', fontSize: 12 }}>
                              Required: {item.required_quantity} {item.unit_label || 'pc'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn btnSecondary"
                              onClick={() => void saveItemVisibility(item.id, !item.is_visible)}
                              disabled={saving}
                            >
                              {item.is_visible ? <Eye className="icon14" /> : <EyeOff className="icon14" />}
                            </button>
                            <button className="btn btnSecondary" onClick={() => void deleteItem(item.id)} disabled={saving}>
                              <Trash2 className="icon14" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--textLight)', fontSize: 13 }}>Select an age-group list first.</div>
              )}
            </div>

            <div className="card" style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Student Progress</div>
              {filteredProgressRows.length === 0 ? (
                <div style={{ color: 'var(--textLight)', fontSize: 13 }}>No students found for this school.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 8 }}>Student</th>
                        <th style={{ textAlign: 'left', padding: 8 }}>Class</th>
                        <th style={{ textAlign: 'left', padding: 8 }}>Age Group</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>Bought</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>Remaining</th>
                        <th style={{ textAlign: 'left', padding: 8 }}>Expected By</th>
                        <th style={{ textAlign: 'left', padding: 8 }}>Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProgressRows.map((row) => (
                        <tr key={row.studentId} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: 8 }}>
                            <div style={{ fontWeight: 600 }}>{row.studentName}</div>
                            {row.noteText ? <div style={{ color: 'var(--textLight)', fontSize: 12 }}>{row.noteText}</div> : null}
                          </td>
                          <td style={{ padding: 8 }}>{row.className}</td>
                          <td style={{ padding: 8 }}>{row.listLabel}</td>
                          <td style={{ padding: 8, textAlign: 'right' }}>{row.boughtCount}</td>
                          <td style={{ padding: 8, textAlign: 'right' }}>{row.remainingCount}</td>
                          <td style={{ padding: 8 }}>{row.expectedBy || '-'}</td>
                          <td style={{ padding: 8 }}>
                            <select
                              value={overrides[row.studentId] || row.listId || ''}
                              onChange={(event) => {
                                const listId = event.target.value;
                                if (!listId) return;
                                void saveOverride(row.studentId, listId);
                              }}
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                background: 'var(--surface)',
                                padding: '6px 8px',
                                minWidth: 150,
                              }}
                            >
                              {lists.map((list) => (
                                <option key={list.id} value={list.id}>
                                  {list.age_group_label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PrincipalShell>
  );
}

export default function PrincipalStationeryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading stationery workspace...</div>}>
      <PrincipalStationeryPageContent />
    </Suspense>
  );
}
