'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, ClipboardCheck, RefreshCw } from 'lucide-react';

type StudentRow = {
  id: string;
  date_of_birth: string | null;
};

type ListRow = {
  id: string;
  age_min: number | null;
  age_max: number | null;
};

interface StationeryReadinessWidgetProps {
  schoolId?: string;
}

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

export function StationeryReadinessWidget({ schoolId }: StationeryReadinessWidgetProps) {
  const supabase = useMemo(() => createClient(), []);
  const [academicYear] = useState(() => getAcademicYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    totalStudents: 0,
    completeCount: 0,
    incompleteCount: 0,
    overdueEtaCount: 0,
  });

  const load = useCallback(async () => {
    if (!schoolId) {
      setSummary({
        totalStudents: 0,
        completeCount: 0,
        incompleteCount: 0,
        overdueEtaCount: 0,
      });
      setError(null);
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

      const [{ data: listsData, error: listsError }, { data: studentsData, error: studentsError }] = await Promise.all([
        supabase
          .from('stationery_lists')
          .select('id, age_min, age_max')
          .eq('school_id', schoolId)
          .eq('academic_year', academicYear)
          .eq('is_visible', true)
          .eq('is_published', true),
        supabase
          .from('students')
          .select('id, date_of_birth')
          .or(`preschool_id.eq.${schoolId},organization_id.eq.${schoolId}`)
          .eq('is_active', true),
      ]);

      if (listsError) throw listsError;
      if (studentsError) throw studentsError;

      const lists = (listsData || []) as ListRow[];
      const students = (studentsData || []) as StudentRow[];
      const listIds = lists.map((list) => list.id);
      const studentIds = students.map((student) => student.id);

      const [{ data: itemsData }, { data: checksData }, { data: notesData }, { data: overridesData }] = await Promise.all([
        listIds.length
          ? supabase
              .from('stationery_list_items')
              .select('id, list_id')
              .in('list_id', listIds)
              .eq('is_visible', true)
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
              .select('student_id, expected_completion_date')
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

      const overrideMap = new Map<string, string>();
      (overridesData || []).forEach((row: any) => {
        if (row?.student_id && row?.list_id) {
          overrideMap.set(String(row.student_id), String(row.list_id));
        }
      });

      const listItems = new Map<string, string[]>();
      (itemsData || []).forEach((item: any) => {
        const key = String(item.list_id || '');
        if (!key) return;
        const current = listItems.get(key) || [];
        current.push(String(item.id));
        listItems.set(key, current);
      });

      const boughtMap = new Map<string, Set<string>>();
      (checksData || []).forEach((row: any) => {
        if (!row?.student_id || !row?.item_id || !row?.is_bought) return;
        const key = String(row.student_id);
        if (!boughtMap.has(key)) boughtMap.set(key, new Set<string>());
        boughtMap.get(key)?.add(String(row.item_id));
      });

      const noteMap = new Map<string, string>();
      (notesData || []).forEach((row: any) => {
        if (row?.student_id && row?.expected_completion_date) {
          noteMap.set(String(row.student_id), String(row.expected_completion_date));
        }
      });

      let completeCount = 0;
      let overdueEtaCount = 0;
      const now = Date.now();

      students.forEach((student) => {
        const age = getAgeFromDob(student.date_of_birth);
        const overrideListId = overrideMap.get(student.id);
        let activeList =
          lists.find((list) => list.id === overrideListId) ||
          null;
        if (!activeList) {
          activeList =
            lists.find((list) => {
              if (age == null) return false;
              if (list.age_min != null && age < list.age_min) return false;
              if (list.age_max != null && age > list.age_max) return false;
              return true;
            }) ||
            lists[0] ||
            null;
        }

        const itemIds = activeList ? listItems.get(activeList.id) || [] : [];
        const boughtSet = boughtMap.get(student.id) || new Set<string>();
        const boughtCount = itemIds.filter((itemId) => boughtSet.has(itemId)).length;
        const remainingCount = Math.max(itemIds.length - boughtCount, 0);
        if (itemIds.length > 0 && remainingCount === 0) completeCount += 1;

        const eta = noteMap.get(student.id);
        if (eta && remainingCount > 0) {
          const etaDate = new Date(`${eta}T00:00:00`).getTime();
          if (Number.isFinite(etaDate) && etaDate < now) {
            overdueEtaCount += 1;
          }
        }
      });

      const totalStudents = students.length;
      const incompleteCount = Math.max(totalStudents - completeCount, 0);
      setSummary({ totalStudents, completeCount, incompleteCount, overdueEtaCount });
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load stationery readiness');
    } finally {
      setLoading(false);
    }
  }, [academicYear, schoolId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardCheck size={18} style={{ color: 'var(--primary)' }} />
          <div>
            <div style={{ fontWeight: 600 }}>Stationery Readiness</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Academic year {academicYear}</div>
          </div>
        </div>
        <button className="btn btnSecondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading stationery readiness...</p>
      ) : null}

      {error ? (
        <p style={{ fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Students tracked</span>
            <span className="badge">{summary.totalStudents}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Complete</span>
            <span className="badge" style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.4)' }}>{summary.completeCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Incomplete</span>
            <span className="badge" style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}>{summary.incompleteCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Overdue ETA</span>
            <span className="badge" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }}>{summary.overdueEtaCount}</span>
          </div>

          <Link
            href="/dashboard/principal/stationery?filter=incomplete"
            className="btn btnPrimary"
            style={{ marginTop: 6, width: '100%', justifyContent: 'center' }}
          >
            Open Incomplete Drilldown
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default StationeryReadinessWidget;
