/**
 * Loads petty cash account, transactions, and computes summary.
 */

import { assertSupabase } from '@/lib/supabase';
import { withPettyCashTenant } from '@/lib/utils/pettyCashTenant';
import { isPettyCashResetEntry } from '@/lib/utils/pettyCashReset';
import { logger } from '@/lib/logger';

import type { PettyCashTransaction, PettyCashSummary } from './types';

export interface FetchPettyCashResult {
  accountId: string | null;
  preschoolId: string;
  transactions: PettyCashTransaction[];
  summary: PettyCashSummary;
}

export async function fetchPettyCashData(userId: string): Promise<FetchPettyCashResult> {
  // Resolve school
  const { data: userProfile } = await assertSupabase()
    .from('profiles')
    .select('preschool_id, organization_id')
    .eq('auth_user_id', userId)
    .single();

  let schoolId = userProfile?.preschool_id || null;

  if (!schoolId && userProfile?.organization_id) {
    const { data: preschoolRow } = await assertSupabase()
      .from('preschools')
      .select('id')
      .eq('organization_id', userProfile.organization_id)
      .maybeSingle();
    schoolId = preschoolRow?.id || userProfile.organization_id;
  }

  if (!schoolId) throw new Error('NO_SCHOOL');

  // Ensure petty cash account
  let accountId: string | null = null;

  try {
    const { data: ensuredId, error } = await assertSupabase()
      .rpc('ensure_petty_cash_account', { school_uuid: schoolId });
    if (error) throw error;
    if (ensuredId) accountId = String(ensuredId);
  } catch {
    try {
      const { data: ensuredIdV2, error } = await assertSupabase()
        .rpc('ensure_petty_cash_account_v2', { preschool_uuid: schoolId });
      if (error) throw error;
      if (ensuredIdV2) accountId = String(ensuredIdV2);
    } catch {
      const { data: acct } = await withPettyCashTenant((column, client) =>
        client
          .from('petty_cash_accounts')
          .select('id')
          .eq(column, schoolId)
          .eq('is_active', true)
          .maybeSingle(),
      );
      if (acct?.id) accountId = String(acct.id);
    }
  }

  // Load transactions
  const { data: transactionsData, error: transError } = await withPettyCashTenant(
    (column, client) =>
      client
        .from('petty_cash_transactions')
        .select('*')
        .eq(column, schoolId)
        .order('created_at', { ascending: false })
        .limit(50),
  );

  if (transError) {
    logger.error('PettyCash', 'Error loading transactions', transError);
  }

  const transactions: PettyCashTransaction[] = transactionsData || [];

  // Monthly summary
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const monthly = transactions.filter((tx) => new Date(tx.created_at) >= currentMonthStart);
  const expenses = monthly
    .filter(
      (tx) => tx.type === 'expense' && tx.status === 'approved' && !isPettyCashResetEntry(tx),
    )
    .reduce((s, tx) => s + tx.amount, 0);
  const replenishments = monthly
    .filter(
      (tx) =>
        tx.type === 'replenishment' &&
        tx.status === 'approved' &&
        !isPettyCashResetEntry(tx),
    )
    .reduce((s, tx) => s + tx.amount, 0);
  const pending = monthly.filter((tx) => tx.status === 'pending').reduce((s, tx) => s + tx.amount, 0);

  // Account balance
  const { data: accountRow } = await withPettyCashTenant((column, client) =>
    client
      .from('petty_cash_accounts')
      .select('opening_balance, low_balance_threshold')
      .eq(column, schoolId)
      .eq('is_active', true)
      .maybeSingle(),
  );
  const openingBalance = Number(accountRow?.opening_balance ?? 0);

  const { data: approvedAll } = await withPettyCashTenant((column, client) =>
    client
      .from('petty_cash_transactions')
      .select('amount, type, status')
      .eq(column, schoolId)
      .eq('status', 'approved')
      .limit(1000),
  );

  const totalSignedAll = (approvedAll || []).reduce((sum, tx: Record<string, unknown>) => {
    const amt = Number(tx.amount || 0);
    if (tx.type === 'expense') return sum - amt;
    if (tx.type === 'replenishment') return sum + amt;
    return sum;
  }, 0);

  return {
    accountId,
    preschoolId: schoolId,
    transactions,
    summary: {
      opening_balance: openingBalance,
      current_balance: openingBalance + totalSignedAll,
      total_expenses: expenses,
      total_replenishments: replenishments,
      pending_approval: pending,
    },
  };
}
