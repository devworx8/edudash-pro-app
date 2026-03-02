/**
 * useFeeOverview — orchestrator hook for the fee overview screen.
 *
 * Manages state, triggers data fetch, computes derived values.
 * ≤200 lines per WARP.md.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type {
  StudentWithFees, FilterType, TimeFilter, FeeOverviewData,
} from './types';
import { fetchFeeOverviewData } from './fetchFeeOverviewData';
import { computeInsights } from './computeInsights';

export { formatCurrency } from './feeOverviewHelpers';
export type {
  StudentWithFees, FilterType, TimeFilter, FinancialSummary,
  PaymentSummary, PopSummary, ExpenseSummary, UniformPaymentSummary,
  FeeBreakdownRow, AccountingSnapshot,
} from './types';
export type { FeeInsights } from './computeInsights';

export function useFeeOverview() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id || (profile as any)?.preschool_id;

  const [data, setData] = useState<FeeOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const result = await fetchFeeOverviewData(organizationId, timeFilter);
      setData(result);
    } catch (error) {
      console.error('[PrincipalFeeOverview] Error loading data:', error);
    }
  }, [organizationId, timeFilter]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    };
    init();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const isFullyPaid = useCallback((student: StudentWithFees) => (
    student.fees.outstanding <= 0 &&
    student.fees.overdue_count === 0 &&
    student.fees.pending_count === 0
  ), []);

  const filteredStudents = useMemo(() => {
    let result = data?.students || [];
    switch (filter) {
      case 'outstanding': result = result.filter(s => s.fees.outstanding > 0); break;
      case 'paid': result = result.filter(isFullyPaid); break;
      case 'overdue': result = result.filter(s => s.fees.overdue_count > 0); break;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.class_name?.toLowerCase()?.includes(q) ||
        s.parent_name?.toLowerCase()?.includes(q)
      );
    }
    return result;
  }, [data?.students, filter, searchQuery, isFullyPaid]);

  const insights = useMemo(
    () => computeInsights(
      data?.accountingSnapshot ?? null,
      data?.expenseSummary ?? null,
      data?.paymentSummary ?? null,
    ),
    [data?.accountingSnapshot, data?.expenseSummary, data?.paymentSummary],
  );

  return {
    loading, refreshing, onRefresh,
    summary: data?.summary ?? null,
    paymentSummary: data?.paymentSummary ?? null,
    popSummary: data?.popSummary ?? null,
    expenseSummary: data?.expenseSummary ?? null,
    feeBreakdown: data?.feeBreakdown ?? [],
    advancePayments: data?.advancePayments ?? null,
    accountingSnapshot: data?.accountingSnapshot ?? null,
    uniformSummary: data?.uniformSummary ?? null,
    filteredStudents,
    searchQuery, setSearchQuery,
    filter, setFilter,
    timeFilter, setTimeFilter,
    insights, isFullyPaid,
  };
}
