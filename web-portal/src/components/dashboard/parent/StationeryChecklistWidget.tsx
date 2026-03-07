'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ChildCard } from '@/lib/hooks/parent/types';
import { CheckSquare, Square, Camera, Plus, Minus, Save } from 'lucide-react';

interface StationeryChecklistWidgetProps {
  childrenCards: ChildCard[];
}

interface ItemState {
  itemId: string;
  itemName: string;
  requiredQuantity: number;
  unitLabel: string;
  notes: string | null;
  isBought: boolean;
  quantityBought: number;
  evidenceUrl: string | null;
}

interface ChildChecklist {
  childId: string;
  childName: string;
  schoolId: string;
  listId: string;
  listLabel: string;
  completionPercent: number;
  boughtCount: number;
  remainingCount: number;
  noteText: string;
  expectedBy: string;
  items: ItemState[];
}

function resolveChildSchoolId(child: ChildCard): string {
  const fallback = child as ChildCard & {
    organizationId?: string | null;
    organization_id?: string | null;
    preschool_id?: string | null;
  };
  return String(
    child.preschoolId ||
      fallback.preschool_id ||
      fallback.organizationId ||
      fallback.organization_id ||
      ''
  );
}

function getCurrentAcademicYear(): number {
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

function getChildAge(dateOfBirth?: string): number | null {
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

export function StationeryChecklistWidget({ childrenCards }: StationeryChecklistWidgetProps) {
  const supabase = useMemo(() => createClient(), []);
  const academicYear = useMemo(() => getCurrentAcademicYear(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<ChildChecklist[]>([]);
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null);
  const [savingNoteChildId, setSavingNoteChildId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const validChildren = childrenCards.filter(
      (child) => Boolean(child?.id) && Boolean(resolveChildSchoolId(child))
    );
    if (!validChildren.length) {
      setChecklists([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const schoolIds = Array.from(new Set(validChildren.map((child) => resolveChildSchoolId(child))));
      const studentIds = validChildren.map((child) => child.id);

      await Promise.all(
        schoolIds.map(async (schoolId) => {
          try {
            await supabase.rpc('ensure_stationery_year_templates', {
              p_school_id: schoolId,
              p_academic_year: academicYear,
            });
          } catch {
            // Non-blocking; list fallback is handled below.
          }
        })
      );

      const [{ data: listsData }, { data: overridesData }, { data: notesData }] = await Promise.all([
        supabase
          .from('stationery_lists')
          .select('id, school_id, age_group_label, age_min, age_max, sort_order')
          .in('school_id', schoolIds)
          .eq('academic_year', academicYear)
          .eq('is_visible', true)
          .eq('is_published', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('stationery_student_overrides')
          .select('student_id, list_id')
          .in('student_id', studentIds)
          .eq('academic_year', academicYear),
        supabase
          .from('stationery_parent_notes')
          .select('student_id, note_text, expected_completion_date')
          .in('student_id', studentIds)
          .eq('academic_year', academicYear),
      ]);

      const lists = Array.isArray(listsData) ? listsData : [];
      const listIds = lists.map((row: any) => row.id);

      const [{ data: itemsData }, { data: checksData }] = await Promise.all([
        listIds.length
          ? supabase
              .from('stationery_list_items')
              .select('id, list_id, item_name, required_quantity, unit_label, notes, sort_order')
              .in('list_id', listIds)
              .eq('is_visible', true)
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
        listIds.length
          ? supabase
              .from('stationery_parent_checks')
              .select('student_id, item_id, is_bought, quantity_bought, evidence_url')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const listsBySchool = new Map<string, any[]>();
      lists.forEach((list: any) => {
        const key = String(list.school_id);
        const arr = listsBySchool.get(key) || [];
        arr.push(list);
        listsBySchool.set(key, arr);
      });

      const itemsByList = new Map<string, any[]>();
      (itemsData || []).forEach((item: any) => {
        const key = String(item.list_id);
        const arr = itemsByList.get(key) || [];
        arr.push(item);
        itemsByList.set(key, arr);
      });

      const overrideMap = new Map<string, string>();
      (overridesData || []).forEach((row: any) => {
        if (row?.student_id && row?.list_id) {
          overrideMap.set(String(row.student_id), String(row.list_id));
        }
      });

      const notesMap = new Map<string, any>();
      (notesData || []).forEach((row: any) => {
        if (row?.student_id) notesMap.set(String(row.student_id), row);
      });

      const checkMap = new Map<string, any>();
      (checksData || []).forEach((row: any) => {
        if (!row?.student_id || !row?.item_id) return;
        checkMap.set(`${row.student_id}:${row.item_id}`, row);
      });

      const mapped: ChildChecklist[] = validChildren.map((child) => {
        const schoolId = resolveChildSchoolId(child);
        const schoolLists = listsBySchool.get(schoolId) || [];
        const overrideListId = overrideMap.get(child.id);
        const age = getChildAge(child.dateOfBirth);

        let list = schoolLists.find((row: any) => String(row.id) === overrideListId) || null;
        if (!list) {
          list = schoolLists.find((row: any) => {
            const min = typeof row.age_min === 'number' ? row.age_min : null;
            const max = typeof row.age_max === 'number' ? row.age_max : null;
            if (age == null) return false;
            if (min != null && age < min) return false;
            if (max != null && age > max) return false;
            return true;
          }) || schoolLists[0] || null;
        }

        const listItems = list ? itemsByList.get(String(list.id)) || [] : [];
        const itemStates: ItemState[] = listItems.map((item: any) => {
          const check = checkMap.get(`${child.id}:${item.id}`);
          return {
            itemId: String(item.id),
            itemName: String(item.item_name || 'Item'),
            requiredQuantity: Number(item.required_quantity || 1),
            unitLabel: String(item.unit_label || 'pcs'),
            notes: item.notes ? String(item.notes) : null,
            isBought: Boolean(check?.is_bought),
            quantityBought: Number(check?.quantity_bought || 0),
            evidenceUrl: check?.evidence_url ? String(check.evidence_url) : null,
          };
        });

        const boughtCount = itemStates.filter((item) => item.isBought).length;
        const remainingCount = Math.max(itemStates.length - boughtCount, 0);
        const completionPercent = itemStates.length > 0 ? Math.round((boughtCount / itemStates.length) * 100) : 0;
        const note = notesMap.get(child.id);

        return {
          childId: child.id,
          childName: `${child.firstName || ''} ${child.lastName || ''}`.trim() || 'Child',
          schoolId,
          listId: list ? String(list.id) : '',
          listLabel: list ? String(list.age_group_label || 'Stationery') : 'Stationery',
          completionPercent,
          boughtCount,
          remainingCount,
          noteText: String(note?.note_text || ''),
          expectedBy: String(note?.expected_completion_date || ''),
          items: itemStates,
        };
      });

      setChecklists(mapped);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load stationery checklist');
    } finally {
      setLoading(false);
    }
  }, [academicYear, childrenCards, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const upsertItem = useCallback(
    async (childId: string, itemId: string, patch: { isBought?: boolean; quantityBought?: number; evidenceUrl?: string | null }) => {
      const key = `${childId}:${itemId}`;
      setSavingItemKey(key);

      setChecklists((prev) =>
        prev.map((list) => {
          if (list.childId !== childId) return list;
          const nextItems = list.items.map((item) =>
            item.itemId === itemId
              ? {
                  ...item,
                  isBought: patch.isBought ?? item.isBought,
                  quantityBought: patch.quantityBought ?? item.quantityBought,
                  evidenceUrl: patch.evidenceUrl === undefined ? item.evidenceUrl : patch.evidenceUrl,
                }
              : item
          );
          const boughtCount = nextItems.filter((item) => item.isBought).length;
          const remainingCount = Math.max(nextItems.length - boughtCount, 0);
          return {
            ...list,
            items: nextItems,
            boughtCount,
            remainingCount,
            completionPercent: nextItems.length ? Math.round((boughtCount / nextItems.length) * 100) : 0,
          };
        })
      );

      try {
        const payload: any = {
          student_id: childId,
          item_id: itemId,
          academic_year: academicYear,
        };
        if (patch.isBought !== undefined) payload.is_bought = patch.isBought;
        if (patch.quantityBought !== undefined) payload.quantity_bought = Math.max(0, patch.quantityBought);
        if (patch.evidenceUrl !== undefined) payload.evidence_url = patch.evidenceUrl;

        const { error: upsertError } = await supabase
          .from('stationery_parent_checks')
          .upsert(payload, { onConflict: 'student_id,item_id,academic_year' });

        if (upsertError) throw upsertError;
      } catch (upsertError: any) {
        setError(upsertError?.message || 'Failed to save stationery item');
        await load();
      } finally {
        setSavingItemKey(null);
      }
    },
    [academicYear, load, supabase]
  );

  const uploadEvidence = useCallback(
    async (childId: string, itemId: string, file: File) => {
      const list = checklists.find((row) => row.childId === childId);
      if (!list) return;

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${list.schoolId}/${childId}/${academicYear}/${itemId}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('stationery-evidence')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });

      if (uploadError) {
        setError(uploadError.message || 'Failed to upload evidence photo');
        return;
      }

      await upsertItem(childId, itemId, { evidenceUrl: path });
    },
    [academicYear, checklists, supabase, upsertItem]
  );

  const saveNote = useCallback(
    async (childId: string, noteText: string, expectedBy: string) => {
      setSavingNoteChildId(childId);
      setChecklists((prev) =>
        prev.map((list) =>
          list.childId === childId
            ? {
                ...list,
                noteText,
                expectedBy,
              }
            : list
        )
      );

      try {
        const { error: noteError } = await supabase
          .from('stationery_parent_notes')
          .upsert(
            {
              student_id: childId,
              academic_year: academicYear,
              note_text: noteText || null,
              expected_completion_date: expectedBy || null,
            },
            { onConflict: 'student_id,academic_year' }
          );

        if (noteError) throw noteError;
      } catch (noteError: any) {
        setError(noteError?.message || 'Failed to save note');
        await load();
      } finally {
        setSavingNoteChildId(null);
      }
    },
    [academicYear, load, supabase]
  );

  if (!childrenCards.length) {
    return <div className="card">Add a child to start tracking stationery.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Stationery Checklist</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Academic year {academicYear}</div>
        </div>
        <button className="btn btnMuted" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="card" style={{ color: '#f87171' }}>
          {error}
        </div>
      ) : null}

      {checklists.map((childChecklist) => (
        <div key={childChecklist.childId} className="card" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{childChecklist.childName}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{childChecklist.listLabel}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="chip">Bought {childChecklist.boughtCount}</span>
              <span className="chip">Still needed {childChecklist.remainingCount}</span>
              <span className="chip" style={{ borderColor: 'rgba(99,102,241,0.5)' }}>
                {childChecklist.completionPercent}%
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {childChecklist.items.map((item) => {
              const key = `${childChecklist.childId}:${item.itemId}`;
              const saving = savingItemKey === key;
              return (
                <div key={item.itemId} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <button
                      className="iconBtn"
                      onClick={() =>
                        void upsertItem(childChecklist.childId, item.itemId, {
                          isBought: !item.isBought,
                        })
                      }
                      aria-label={item.isBought ? 'Mark not bought' : 'Mark bought'}
                      style={{ width: 28, height: 28 }}
                    >
                      {item.isBought ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{item.itemName}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                        Required: {item.requiredQuantity} {item.unitLabel}
                      </div>
                      {item.notes ? <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{item.notes}</div> : null}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <button
                        className="iconBtn"
                        onClick={() =>
                          void upsertItem(childChecklist.childId, item.itemId, {
                            quantityBought: Math.max(0, item.quantityBought - 1),
                            isBought: item.quantityBought - 1 > 0 ? item.isBought : false,
                          })
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{item.quantityBought}</span>
                      <button
                        className="iconBtn"
                        onClick={() =>
                          void upsertItem(childChecklist.childId, item.itemId, {
                            quantityBought: item.quantityBought + 1,
                          })
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <label className="btn btnMuted" style={{ cursor: 'pointer' }}>
                      <Camera size={14} />
                      {item.evidenceUrl ? 'Photo added' : 'Add photo'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          void uploadEvidence(childChecklist.childId, item.itemId, file);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>

                    {saving ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>Saving...</span> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Notes</div>
            <textarea
              className="input"
              rows={3}
              value={childChecklist.noteText}
              placeholder="What remains and when will the rest be received?"
              onChange={(event) => {
                const value = event.target.value;
                setChecklists((prev) =>
                  prev.map((row) =>
                    row.childId === childChecklist.childId
                      ? { ...row, noteText: value }
                      : row
                  )
                );
              }}
            />
            <input
              type="date"
              className="input"
              value={childChecklist.expectedBy}
              onChange={(event) => {
                const value = event.target.value;
                setChecklists((prev) =>
                  prev.map((row) =>
                    row.childId === childChecklist.childId
                      ? { ...row, expectedBy: value }
                      : row
                  )
                );
              }}
            />
            <button
              className="btn btnPrimary"
              onClick={() => void saveNote(childChecklist.childId, childChecklist.noteText, childChecklist.expectedBy)}
            >
              <Save size={14} />
              {savingNoteChildId === childChecklist.childId ? 'Saving note...' : 'Save note'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default StationeryChecklistWidget;
