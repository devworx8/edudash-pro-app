/**
 * Hook for loading and computing student fee data.
 * Handles student, fees, classes, and derived computed values.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getMonthStartISO } from '@/lib/utils/dateUtils';
import {
  isStudentFeeInMonth,
  shouldExcludeStudentFeeFromMonthScopedViews,
} from '@/lib/utils/studentFeeMonth';
import type { FinanceStudentFeesRouteSource } from '@/types/finance';
import type { Student, StudentFee, ClassOption } from './types';
import {
  type FeeSetupStatus,
  bootstrapFeesIfMissing,
  mapFeeRow,
} from './feeHelpers';

export interface StudentFeeDataReturn {
  student: Student | null;
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>;
  studentRef: React.MutableRefObject<Student | null>;
  fees: StudentFee[];
  displayFees: StudentFee[];
  displayFeesForMonth: StudentFee[];
  classes: ClassOption[];
  loading: boolean;
  refreshing: boolean;
  feeSetupStatus: FeeSetupStatus;
  generatingFees: boolean;
  totals: { outstanding: number; paid: number; waived: number };
  organizationId: string | undefined;
  source: FinanceStudentFeesRouteSource | 'unknown';
  activeMonthIso: string | null;
  hasParent: boolean;
  onRefresh: () => Promise<void>;
  loadStudent: () => Promise<Student | null>;
  loadFees: (targetStudent?: Student | null) => Promise<void>;
  handleGenerateFees: () => Promise<void>;
}

interface UseStudentFeeDataOptions {
  monthIso?: string;
  source?: string;
}

export function useStudentFeeData(studentId?: string, options?: UseStudentFeeDataOptions): StudentFeeDataReturn {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id || (profile as any)?.preschool_id;
  const source: FinanceStudentFeesRouteSource | 'unknown' =
    options?.source === 'receivables' || options?.source === 'direct'
      ? options.source
      : 'unknown';
  const activeMonthIso = useMemo(() => {
    const value = String(options?.monthIso || '').trim();
    if (!value) return null;
    return getMonthStartISO(value, { recoverUtcMonthBoundary: true });
  }, [options?.monthIso]);

  const [student, setStudent] = useState<Student | null>(null);
  const [fees, setFees] = useState<StudentFee[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feeBootstrapAttempted, setFeeBootstrapAttempted] = useState(false);
  const [feeSetupStatus, setFeeSetupStatus] = useState<FeeSetupStatus>('unknown');
  const [generatingFees, setGeneratingFees] = useState(false);
  const studentRef = useRef<Student | null>(null);

  useEffect(() => { studentRef.current = student; }, [student]);

  const loadStudent = useCallback(async (): Promise<Student | null> => {
    if (!studentId) return null;
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('students')
        .select(`
          id, first_name, last_name, class_id, parent_id, preschool_id, enrollment_date, date_of_birth, registration_fee_amount, registration_fee_paid, payment_verified, payment_date,
          is_active, status,
          classes!students_class_id_fkey(name),
          profiles!students_parent_id_fkey(first_name, last_name)
        `)
        .eq('id', studentId)
        .single();

      if (error) throw error;

      const classData = Array.isArray(data.classes) ? data.classes[0] : data.classes;
      const parentData = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

      const next: Student = {
        id: data.id, first_name: data.first_name, last_name: data.last_name,
        class_id: data.class_id,
        is_active: data.is_active,
        status: data.status,
        registration_fee_amount: data.registration_fee_amount != null ? Number(data.registration_fee_amount) : null,
        registration_fee_paid: data.registration_fee_paid,
        payment_verified: data.payment_verified,
        payment_date: data.payment_date,
        class_name: classData?.name,
        parent_name: parentData ? `${parentData.first_name} ${parentData.last_name}` : undefined,
        parent_id: data.parent_id, preschool_id: data.preschool_id,
        enrollment_date: data.enrollment_date, date_of_birth: data.date_of_birth,
      };

      setStudent(next);
      studentRef.current = next;
      return next;
    } catch (error) {
      console.error('[StudentFeeManagement] Error loading student:', error);
      return null;
    }
  }, [studentId]);

  const loadFees = useCallback(async (targetStudent?: Student | null) => {
    if (!studentId) return;
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('student_fees')
        .select('*, billing_month, fee_structures(name, fee_type, description)')
        .eq('student_id', studentId)
        .order('due_date', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map(mapFeeRow);
      if (mapped.length > 0) { setFeeSetupStatus('ready'); }

      const bootstrapTarget = targetStudent ?? studentRef.current;
      if (mapped.length === 0 && bootstrapTarget && !feeBootstrapAttempted) {
        setFeeBootstrapAttempted(true);
        const status = await bootstrapFeesIfMissing(bootstrapTarget, organizationId, profile?.id);
        if (status) setFeeSetupStatus(status);

        const { data: refreshed } = await supabase
          .from('student_fees')
          .select('*, billing_month, fee_structures(name, fee_type, description)')
          .eq('student_id', studentId)
          .order('due_date', { ascending: false });

        setFees((refreshed || []).map(mapFeeRow));
        return;
      }
      setFees(mapped);
    } catch (error) {
      console.error('[StudentFeeManagement] Error loading fees:', error);
    }
  }, [studentId, feeBootstrapAttempted, organizationId, profile?.id]);

  const loadClasses = useCallback(async () => {
    if (!organizationId) return;
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('preschool_id', organizationId)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('[StudentFeeManagement] Error loading classes:', error);
    }
  }, [organizationId]);

  // Reset on student change
  useEffect(() => { setFeeBootstrapAttempted(false); setFeeSetupStatus('unknown'); }, [studentId]);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const resolved = await loadStudent();
      await Promise.all([loadFees(resolved), loadClasses()]);
      setLoading(false);
    };
    load();
  }, [loadStudent, loadFees, loadClasses]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const resolved = await loadStudent();
    await loadFees(resolved);
    setRefreshing(false);
  }, [loadStudent, loadFees]);

  const handleGenerateFees = useCallback(async () => {
    if (!student) return;
    setGeneratingFees(true);
    try {
      const status = await bootstrapFeesIfMissing(student, organizationId, profile?.id);
      if (status) setFeeSetupStatus(status);
      await loadFees(student);
    } finally {
      setGeneratingFees(false);
    }
  }, [student, loadFees, organizationId, profile?.id]);

  const displayFees = useMemo(() => {
    return fees.filter((fee) =>
      !shouldExcludeStudentFeeFromMonthScopedViews(fee, student?.enrollment_date),
    );
  }, [fees, student?.enrollment_date]);

  const displayFeesForMonth = useMemo(() => {
    if (source !== 'receivables') return displayFees;
    const unpaidStatuses = new Set(['pending', 'overdue', 'partially_paid']);
    const statusPriority: Record<string, number> = { overdue: 0, partially_paid: 1, pending: 2 };
    const filtered = displayFees.filter((fee) => {
      if (!unpaidStatuses.has(String(fee.status || '').toLowerCase())) return false;
      return isStudentFeeInMonth(fee, activeMonthIso);
    });
    return filtered.sort((a, b) => {
      const pa = statusPriority[a.status] ?? 3;
      const pb = statusPriority[b.status] ?? 3;
      if (pa !== pb) return pa - pb;
      const da = a.due_date ? new Date(a.due_date).getTime() : 0;
      const db = b.due_date ? new Date(b.due_date).getTime() : 0;
      return da - db;
    });
  }, [activeMonthIso, displayFees, source]);

  const totals = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const unpaidStatuses = new Set(['pending', 'overdue', 'partially_paid']);

    if (source === 'receivables') {
      const receivableFees = displayFeesForMonth;
      const paid = displayFees.filter(f => f.status === 'paid');
      const waived = displayFees.filter(f => f.status === 'waived' || (f.discount_amount || f.waived_amount));

      return {
        outstanding: receivableFees.reduce((sum, f) => {
          const amountOutstanding = Number(f.amount_outstanding);
          if (Number.isFinite(amountOutstanding)) return sum + amountOutstanding;
          const amountPaid = Number(f.amount_paid || 0);
          return sum + Math.max(0, f.final_amount - amountPaid);
        }, 0),
        paid: paid.reduce((sum, f) => {
          const amountPaid = Number(f.amount_paid);
          if (Number.isFinite(amountPaid) && amountPaid > 0) return sum + amountPaid;
          return sum + f.final_amount;
        }, 0),
        waived: waived.reduce((sum, f) => sum + Number(f.discount_amount || f.waived_amount || 0), 0),
      };
    }

    const pending = fees.filter(f => {
      if (shouldExcludeStudentFeeFromMonthScopedViews(f, student?.enrollment_date)) return false;
      if (!unpaidStatuses.has(f.status)) return false;
      if (!f.due_date) return true;
      const due = new Date(f.due_date);
      return Number.isNaN(due.getTime()) || due <= todayStart;
    });
    const eligibleFees = fees.filter((fee) =>
      !shouldExcludeStudentFeeFromMonthScopedViews(fee, student?.enrollment_date),
    );
    const paid = eligibleFees.filter(f => f.status === 'paid');
    const waived = eligibleFees.filter(f => f.status === 'waived' || (f.discount_amount || f.waived_amount));

    return {
      outstanding: pending.reduce((sum, f) => {
        const amountOutstanding = Number(f.amount_outstanding);
        if (Number.isFinite(amountOutstanding)) return sum + amountOutstanding;
        const amountPaid = Number(f.amount_paid || 0);
        return sum + Math.max(0, f.final_amount - amountPaid);
      }, 0),
      paid: paid.reduce((sum, f) => {
        const amountPaid = Number(f.amount_paid);
        if (Number.isFinite(amountPaid) && amountPaid > 0) return sum + amountPaid;
        return sum + f.final_amount;
      }, 0),
      waived: waived.reduce((sum, f) => sum + Number(f.discount_amount || f.waived_amount || 0), 0),
    };
  }, [fees, student?.enrollment_date, source, displayFeesForMonth]);

  const hasParent = Boolean(student?.parent_id || student?.parent_name);

  return {
    student, setStudent, studentRef, fees, displayFees, displayFeesForMonth, classes,
    loading, refreshing, feeSetupStatus, generatingFees,
    totals, organizationId, source, activeMonthIso, hasParent,
    onRefresh, loadStudent, loadFees, handleGenerateFees,
  };
}
