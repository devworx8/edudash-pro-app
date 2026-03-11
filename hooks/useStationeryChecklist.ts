import { useCallback, useEffect, useMemo, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { retrySupabaseRead } from '@/lib/supabaseErrors';

export interface StationeryChecklistItemState {
  itemId: string;
  itemName: string;
  requiredQuantity: number;
  unitLabel: string;
  notes: string | null;
  isBought: boolean;
  quantityBought: number;
  evidenceUrl: string | null;
  updatedAt: string | null;
}

export interface StationeryChildChecklist {
  childId: string;
  childName: string;
  schoolId: string;
  schoolName?: string;
  academicYear: number;
  listId: string;
  listLabel: string;
  boughtCount: number;
  remainingCount: number;
  completionPercent: number;
  noteText: string;
  expectedBy: string;
  items: StationeryChecklistItemState[];
}

interface ChildRow {
  id: string;
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  dateOfBirth?: string | null;
  date_of_birth?: string | null;
  preschoolId?: string | null;
  preschool_id?: string | null;
  organizationId?: string | null;
  organization_id?: string | null;
  preschoolName?: string | null;
  organizationName?: string | null;
  grade?: string | null;
  grade_level?: string | null;
  classes?: { grade_level?: string | null } | Array<{ grade_level?: string | null }> | null;
  age_group?: {
    age_min?: number | null;
    age_max?: number | null;
  } | null;
  age_group_ref_data?: {
    age_min?: number | null;
    age_max?: number | null;
  } | null;
}

interface UpsertItemInput {
  isBought?: boolean;
  quantityBought?: number;
  evidenceUrl?: string | null;
}

type StationeryNoteRow = {
  student_id: string;
  note_text?: string | null;
  expected_completion_date?: string | null;
};

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

function resolveChildName(child: ChildRow): string {
  const first = String(child.firstName || child.first_name || '').trim();
  const last = String(child.lastName || child.last_name || '').trim();
  return `${first} ${last}`.trim() || 'Child';
}

function resolveChildAge(child: ChildRow): number | null {
  const dobRaw = child.dateOfBirth || child.date_of_birth;
  if (!dobRaw) return null;
  const dob = new Date(`${dobRaw}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function resolveChildGradeToken(child: ChildRow): string | null {
  const classGrade = Array.isArray(child.classes)
    ? child.classes[0]?.grade_level
    : child.classes?.grade_level;
  const raw = String(child.grade_level || child.grade || classGrade || '').trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/\s+/g, ' ');
}

function estimateAgeFromGrade(gradeToken: string | null): number | null {
  if (!gradeToken) return null;
  if (gradeToken.includes('grade rr') || gradeToken === 'rr') return 4;
  if (gradeToken.includes('grade r') || gradeToken === 'r') return 5;
  const numberMatch = gradeToken.match(/grade\s*(\d{1,2})|^(\d{1,2})$/);
  const numeric = Number(numberMatch?.[1] || numberMatch?.[2] || '');
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) {
    return 5 + numeric;
  }
  return null;
}

function resolveAgeFromAgeGroup(child: ChildRow): number | null {
  const group = child.age_group || child.age_group_ref_data || null;
  if (!group) return null;
  const min = typeof group.age_min === 'number' ? group.age_min : null;
  const max = typeof group.age_max === 'number' ? group.age_max : null;
  if (min != null && max != null) return Math.round((min + max) / 2);
  if (min != null) return min;
  if (max != null) return max;
  return null;
}

function resolveBestEffortChildAge(child: ChildRow): number | null {
  return (
    resolveChildAge(child) ??
    resolveAgeFromAgeGroup(child) ??
    estimateAgeFromGrade(resolveChildGradeToken(child))
  );
}

function parseAgeHintFromLabel(label: string): { min: number | null; max: number | null; center: number | null } {
  const normalized = String(label || '').toLowerCase();
  const range = normalized.match(/(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { min, max, center: Math.round((min + max) / 2) };
    }
  }
  const single = normalized.match(/(\d{1,2})\s*(?:year|yr|years|yrs)?/);
  if (single) {
    const value = Number(single[1]);
    if (Number.isFinite(value)) return { min: value, max: value, center: value };
  }
  return { min: null, max: null, center: null };
}

function pickBestStationeryList(schoolLists: any[], child: ChildRow, overrideListId?: string): any | null {
  if (!schoolLists.length) return null;
  const overridden = schoolLists.find((list: any) => String(list.id) === overrideListId) || null;
  if (overridden) return overridden;

  const childAge = resolveBestEffortChildAge(child);
  const gradeToken = resolveChildGradeToken(child);

  if (childAge != null) {
    const ageRangeMatch = schoolLists.find((list: any) => {
      const min = typeof list.age_min === 'number' ? list.age_min : null;
      const max = typeof list.age_max === 'number' ? list.age_max : null;
      if (min == null && max == null) return false;
      if (min != null && childAge < min) return false;
      if (max != null && childAge > max) return false;
      return true;
    });
    if (ageRangeMatch) return ageRangeMatch;
  }

  if (gradeToken) {
    const gradeMatch = schoolLists.find((list: any) =>
      String(list.age_group_label || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .includes(gradeToken)
    );
    if (gradeMatch) return gradeMatch;
  }

  if (childAge != null) {
    const byClosestAge = [...schoolLists].sort((a: any, b: any) => {
      const aHint = parseAgeHintFromLabel(String(a.age_group_label || ''));
      const bHint = parseAgeHintFromLabel(String(b.age_group_label || ''));
      const aCenter = aHint.center ?? (typeof a.age_min === 'number' ? a.age_min : null) ?? (typeof a.age_max === 'number' ? a.age_max : null) ?? Number.POSITIVE_INFINITY;
      const bCenter = bHint.center ?? (typeof b.age_min === 'number' ? b.age_min : null) ?? (typeof b.age_max === 'number' ? b.age_max : null) ?? Number.POSITIVE_INFINITY;
      return Math.abs(aCenter - childAge) - Math.abs(bCenter - childAge);
    });
    if (byClosestAge[0]) return byClosestAge[0];
  }

  return schoolLists[schoolLists.length - 1] || schoolLists[0] || null;
}

function sortByOrder<T extends { sort_order?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (Number(a.sort_order || 0) - Number(b.sort_order || 0)));
}

function resolveChildSchoolIds(child: ChildRow): string[] {
  const ids = [
    child.organizationId,
    child.preschoolId,
    child.organization_id,
    child.preschool_id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function resolveChildSchoolName(child: ChildRow): string | undefined {
  return child.preschoolName || child.organizationName || undefined;
}

export function useStationeryChecklist(children: ChildRow[]) {
  const supabase = useMemo(() => assertSupabase(), []);
  const academicYear = useMemo(() => getCurrentAcademicYear(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null);
  const [savingNoteChildId, setSavingNoteChildId] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<StationeryChildChecklist[]>([]);

  const load = useCallback(async () => {
    const filteredChildren = children.filter(
      (child) => Boolean(child?.id) && resolveChildSchoolIds(child).length > 0
    );
    if (!filteredChildren.length) {
      setChecklists([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const schoolIds = Array.from(
        new Set(filteredChildren.flatMap((child) => resolveChildSchoolIds(child)))
      ).filter(Boolean);

      await Promise.all(
        schoolIds.map(async (schoolId) => {
          try {
            await supabase.rpc('ensure_stationery_year_templates', {
              p_school_id: schoolId,
              p_academic_year: academicYear,
            });
          } catch (rpcError) {
            logger.warn('[Stationery] ensure templates failed', { schoolId, rpcError });
          }
        })
      );

      const studentIds = filteredChildren.map((child) => child.id);

      const [{ data: listsData, error: listsError }, { data: overridesData, error: overridesError }] = await Promise.all([
        supabase
          .from('stationery_lists')
          .select('id, school_id, age_group_label, age_min, age_max, sort_order')
          .in('school_id', schoolIds)
          .eq('academic_year', academicYear)
          .eq('is_visible', true)
          .eq('is_published', true),
        supabase
          .from('stationery_student_overrides')
          .select('student_id, list_id')
          .in('student_id', studentIds)
          .eq('academic_year', academicYear),
      ]);

      if (listsError) throw listsError;
      if (overridesError) throw overridesError;

      const { data: notesData, error: notesError } = studentIds.length
        ? await retrySupabaseRead<StationeryNoteRow[]>(() =>
            supabase
              .from('stationery_parent_notes')
              .select('student_id, note_text, expected_completion_date')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          )
        : { data: [] as StationeryNoteRow[], error: null };

      if (notesError) {
        logger.warn('[Stationery] parent notes read failed; continuing without notes', {
          academicYear,
          studentCount: studentIds.length,
          notesError,
        });
      }

      const lists = Array.isArray(listsData) ? listsData : [];
      const listIds = lists.map((row: any) => row.id).filter(Boolean);

      const [{ data: itemsData }, { data: checksData }] = await Promise.all([
        listIds.length
          ? supabase
              .from('stationery_list_items')
              .select('id, list_id, item_name, required_quantity, unit_label, notes, sort_order')
              .in('list_id', listIds)
              .eq('is_visible', true)
          : Promise.resolve({ data: [] as any[] }),
        listIds.length
          ? supabase
              .from('stationery_parent_checks')
              .select('student_id, item_id, is_bought, quantity_bought, evidence_url, updated_at')
              .in('student_id', studentIds)
              .eq('academic_year', academicYear)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const listsBySchool = new Map<string, any[]>();
      lists.forEach((list: any) => {
        const key = String(list.school_id);
        const current = listsBySchool.get(key) || [];
        current.push(list);
        listsBySchool.set(key, current);
      });
      for (const [key, value] of listsBySchool.entries()) {
        listsBySchool.set(key, sortByOrder(value));
      }

      const itemsByList = new Map<string, any[]>();
      (itemsData || []).forEach((item: any) => {
        const key = String(item.list_id);
        const current = itemsByList.get(key) || [];
        current.push(item);
        itemsByList.set(key, current);
      });
      for (const [key, value] of itemsByList.entries()) {
        itemsByList.set(key, sortByOrder(value));
      }

      const overrideMap = new Map<string, string>();
      (overridesData || []).forEach((row: any) => {
        if (row?.student_id && row?.list_id) {
          overrideMap.set(String(row.student_id), String(row.list_id));
        }
      });

      const checkMap = new Map<string, any>();
      (checksData || []).forEach((row: any) => {
        if (!row?.student_id || !row?.item_id) return;
        checkMap.set(`${row.student_id}:${row.item_id}`, row);
      });

      const notesMap = new Map<string, { note_text?: string | null; expected_completion_date?: string | null }>();
      (notesData || []).forEach((row) => {
        if (!row?.student_id) return;
        notesMap.set(String(row.student_id), row);
      });

      const mapped: StationeryChildChecklist[] = filteredChildren.map((child) => {
        const childSchoolIds = resolveChildSchoolIds(child);
        const listSchoolId = childSchoolIds.find((id) => (listsBySchool.get(id) || []).length > 0) || null;
        const schoolLists = listSchoolId ? listsBySchool.get(listSchoolId) || [] : [];
        const overrideListId = overrideMap.get(child.id);
        const activeList = pickBestStationeryList(schoolLists, child, overrideListId);

        const listItems = activeList ? itemsByList.get(String(activeList.id)) || [] : [];
        const itemStates: StationeryChecklistItemState[] = listItems.map((item: any) => {
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
            updatedAt: check?.updated_at ? String(check.updated_at) : null,
          };
        });

        const boughtCount = itemStates.filter((item) => item.isBought).length;
        const remainingCount = Math.max(itemStates.length - boughtCount, 0);
        const completionPercent = itemStates.length > 0 ? Math.round((boughtCount / itemStates.length) * 100) : 0;

        const note = notesMap.get(child.id);

        return {
          childId: child.id,
          childName: resolveChildName(child),
          schoolId: String(activeList?.school_id || listSchoolId || childSchoolIds[0] || ''),
          schoolName: resolveChildSchoolName(child),
          academicYear,
          listId: activeList ? String(activeList.id) : '',
          listLabel: activeList ? String(activeList.age_group_label || 'Stationery') : 'Stationery',
          boughtCount,
          remainingCount,
          completionPercent,
          noteText: String(note?.note_text || ''),
          expectedBy: String(note?.expected_completion_date || ''),
          items: itemStates,
        };
      });

      mapped.sort((a, b) => a.childName.localeCompare(b.childName));
      setChecklists(mapped);
    } catch (loadError: any) {
      const message = loadError?.message || 'Failed to load stationery checklist';
      setError(message);
      logger.error('[Stationery] load failed', loadError);
    } finally {
      setLoading(false);
    }
  }, [academicYear, children, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const upsertItemState = useCallback(
    async (childId: string, itemId: string, patch: UpsertItemInput) => {
      const key = `${childId}:${itemId}`;
      setSavingItemKey(key);

      setChecklists((prev) =>
        prev.map((list) => {
          if (list.childId !== childId) return list;
          const nextItems = list.items.map((item) => {
            if (item.itemId !== itemId) return item;
            return {
              ...item,
              isBought: patch.isBought ?? item.isBought,
              quantityBought: patch.quantityBought ?? item.quantityBought,
              evidenceUrl:
                patch.evidenceUrl === undefined ? item.evidenceUrl : patch.evidenceUrl,
              updatedAt: new Date().toISOString(),
            };
          });
          const boughtCount = nextItems.filter((item) => item.isBought).length;
          const remainingCount = Math.max(nextItems.length - boughtCount, 0);
          const completionPercent = nextItems.length > 0 ? Math.round((boughtCount / nextItems.length) * 100) : 0;
          return {
            ...list,
            items: nextItems,
            boughtCount,
            remainingCount,
            completionPercent,
          };
        })
      );

      try {
        const payload: any = {
          student_id: childId,
          item_id: itemId,
          academic_year: academicYear,
          updated_by: null,
        };
        if (patch.isBought !== undefined) payload.is_bought = patch.isBought;
        if (patch.quantityBought !== undefined) payload.quantity_bought = Math.max(0, patch.quantityBought);
        if (patch.evidenceUrl !== undefined) payload.evidence_url = patch.evidenceUrl;

        const { error: upsertError } = await supabase
          .from('stationery_parent_checks')
          .upsert(payload, { onConflict: 'student_id,item_id,academic_year' });

        if (upsertError) throw upsertError;
      } catch (upsertError: any) {
        logger.error('[Stationery] upsert item failed', upsertError);
        setError(upsertError?.message || 'Failed to save stationery item');
        await load();
      } finally {
        setSavingItemKey(null);
      }
    },
    [academicYear, load, supabase]
  );

  const saveNote = useCallback(
    async (childId: string, noteText: string, expectedBy: string) => {
      setSavingNoteChildId(childId);
      setChecklists((prev) =>
        prev.map((list) =>
          list.childId === childId
            ? { ...list, noteText, expectedBy }
            : list
        )
      );

      try {
        const payload = {
          student_id: childId,
          academic_year: academicYear,
          note_text: noteText || null,
          expected_completion_date: expectedBy || null,
          updated_by: null,
        };

        const { error: saveError } = await supabase
          .from('stationery_parent_notes')
          .upsert(payload, { onConflict: 'student_id,academic_year' });

        if (saveError) throw saveError;
      } catch (saveError: any) {
        logger.error('[Stationery] save note failed', saveError);
        setError(saveError?.message || 'Failed to save stationery note');
        await load();
      } finally {
        setSavingNoteChildId(null);
      }
    },
    [academicYear, load, supabase]
  );

  const uploadEvidence = useCallback(
    async (childId: string, itemId: string, fileUri: string) => {
      const targetChecklist = checklists.find((list) => list.childId === childId);
      if (!targetChecklist) return null;

      const extension = (fileUri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const safeExt = extension || 'jpg';
      const path = `${targetChecklist.schoolId}/${childId}/${academicYear}/${itemId}-${Date.now()}.${safeExt}`;

      try {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        const contentType = blob.type || (safeExt === 'png' ? 'image/png' : 'image/jpeg');

        const { error: uploadError } = await supabase.storage
          .from('stationery-evidence')
          .upload(path, blob, {
            contentType,
            upsert: true,
          });

        if (uploadError) throw uploadError;

        await upsertItemState(childId, itemId, {
          evidenceUrl: path,
        });

        return path;
      } catch (uploadError: any) {
        logger.error('[Stationery] evidence upload failed', uploadError);
        setError(uploadError?.message || 'Failed to upload evidence');
        return null;
      }
    },
    [academicYear, checklists, supabase, upsertItemState]
  );

  return {
    academicYear,
    checklists,
    loading,
    error,
    savingItemKey,
    savingNoteChildId,
    refresh: load,
    upsertItemState,
    saveNote,
    uploadEvidence,
  };
}

export default useStationeryChecklist;
