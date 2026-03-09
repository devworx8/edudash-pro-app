import { useEffect, useRef } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { assertSupabase } from '@/lib/supabase';

interface UseFinanceRealtimeRefreshParams {
  organizationId?: string | null;
  enabled?: boolean;
  debounceMs?: number;
  onRefresh: () => void | Promise<void>;
}

type PayloadRow = Record<string, unknown>;

const DIRECT_TABLES = new Set([
  'payments',
  'pop_uploads',
  'students',
  'registration_requests',
  'child_registration_requests',
]);

function getPayloadRow(payload: RealtimePostgresChangesPayload<PayloadRow>): PayloadRow | null {
  if (payload.eventType === 'DELETE') {
    return (payload.old as PayloadRow | null) || null;
  }
  return (payload.new as PayloadRow | null) || null;
}

function extractOrgId(row: PayloadRow | null): string | null {
  if (!row) return null;
  const orgId = row.organization_id;
  if (typeof orgId === 'string' && orgId.trim().length > 0) return orgId;
  const preschoolId = row.preschool_id;
  if (typeof preschoolId === 'string' && preschoolId.trim().length > 0) return preschoolId;
  return null;
}

function metadataExcludesFinance(row: PayloadRow | null): boolean {
  if (!row) return false;
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>).exclude_from_finance_metrics === true;
}

export function useFinanceRealtimeRefresh({
  organizationId,
  enabled = true,
  debounceMs = 500,
  onRefresh,
}: UseFinanceRealtimeRefreshParams) {
  const refreshRef = useRef(onRefresh);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentOrgCacheRef = useRef(new Map<string, string | null>());
  const paymentOrgCacheRef = useRef(new Map<string, string | null>());

  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || !organizationId) return;

    const supabase = assertSupabase();

    const queueRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refreshRef.current();
      }, debounceMs);
    };

    const resolveStudentOrg = async (studentId: string | null): Promise<string | null> => {
      if (!studentId) return null;
      const cached = studentOrgCacheRef.current.get(studentId);
      if (cached !== undefined) return cached;
      const { data, error } = await supabase
        .from('students')
        .select('organization_id, preschool_id')
        .eq('id', studentId)
        .maybeSingle();
      if (error) {
        studentOrgCacheRef.current.set(studentId, null);
        return null;
      }
      const resolved = extractOrgId((data as PayloadRow | null) || null);
      studentOrgCacheRef.current.set(studentId, resolved);
      return resolved;
    };

    const resolvePaymentOrg = async (paymentId: string | null): Promise<string | null> => {
      if (!paymentId) return null;
      const cached = paymentOrgCacheRef.current.get(paymentId);
      if (cached !== undefined) return cached;
      const { data, error } = await supabase
        .from('payments')
        .select('organization_id, preschool_id, metadata')
        .eq('id', paymentId)
        .maybeSingle();
      if (error || metadataExcludesFinance((data as PayloadRow | null) || null)) {
        paymentOrgCacheRef.current.set(paymentId, null);
        return null;
      }
      const resolved = extractOrgId((data as PayloadRow | null) || null);
      paymentOrgCacheRef.current.set(paymentId, resolved);
      return resolved;
    };

    const handleChange = async (payload: RealtimePostgresChangesPayload<PayloadRow>) => {
      const table = payload.table;
      const row = getPayloadRow(payload);

      if (DIRECT_TABLES.has(table)) {
        if (table === 'payments' && metadataExcludesFinance(row)) return;
        if (extractOrgId(row) === organizationId) {
          queueRefresh();
        }
        return;
      }

      if (table === 'student_fees') {
        const studentId = typeof row?.student_id === 'string' ? row.student_id : null;
        if ((await resolveStudentOrg(studentId)) === organizationId) {
          queueRefresh();
        }
        return;
      }

      if (table === 'payment_allocations') {
        const paymentId = typeof row?.payment_id === 'string' ? row.payment_id : null;
        if ((await resolvePaymentOrg(paymentId)) === organizationId) {
          queueRefresh();
        }
      }
    };

    const channel: RealtimeChannel = supabase
      .channel(`finance-realtime:${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_fees' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_allocations' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pop_uploads' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_requests' }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'child_registration_requests' }, handleChange)
      .subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [debounceMs, enabled, organizationId]);
}
