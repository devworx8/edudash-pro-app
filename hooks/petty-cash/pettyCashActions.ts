/**
 * Petty cash transaction actions.
 *
 * All mutating operations: add expense, replenishment, withdrawal,
 * reset, cancel, delete, reverse.
 */

import { assertSupabase } from '@/lib/supabase';
import { withPettyCashTenant } from '@/lib/utils/pettyCashTenant';
import { logger } from '@/lib/logger';

import type { ExpenseFormData, PettyCashTransaction, PettyCashSummary } from './types';

type AlertFn = (config: { title: string; message: string; type: string }) => void;
type TFunc = (...args: any[]) => string;

interface ActionContext {
  userId: string | undefined;
  preschoolId: string | null;
  accountId: string | null;
  summary: PettyCashSummary;
  alert: AlertFn;
  t: TFunc;
  reload: () => void;
}

// ---------------------------------------------------------------------------
// Add expense
// ---------------------------------------------------------------------------

export async function addExpense(
  ctx: ActionContext,
  form: ExpenseFormData,
  receiptImage: string | null,
  uploadReceiptImage: (uri: string, txId: string) => Promise<string | null>,
): Promise<boolean> {
  const { alert, t, preschoolId, accountId, userId, summary, reload } = ctx;

  if (!form.amount || !form.description || !form.category) {
    alert({ title: t('common.error'), message: t('petty_cash.error_fill_fields'), type: 'error' });
    return false;
  }
  if (!preschoolId || !accountId) {
    alert({ title: t('common.error'), message: t('petty_cash.error_no_school'), type: 'error' });
    return false;
  }

  const amount = parseFloat(form.amount);
  if (isNaN(amount) || amount <= 0) {
    alert({ title: t('common.error'), message: t('petty_cash.error_valid_amount'), type: 'error' });
    return false;
  }
  if (amount > summary.current_balance) {
    alert({ title: t('common.error'), message: t('petty_cash.error_insufficient_balance'), type: 'error' });
    return false;
  }

  try {
    const { data: txData, error } = await withPettyCashTenant((col, client) =>
      client.from('petty_cash_transactions').insert({
        [col]: preschoolId, account_id: accountId, amount,
        description: form.description.trim(), category: form.category,
        type: 'expense', reference_number: form.receipt_number.trim() || null,
        created_by: userId, approved_by: userId, status: 'approved',
      }).select().single(),
    );

    if (error) {
      logger.error('PettyCash', 'Error adding expense', error);
      alert({ title: t('common.error'), message: t('petty_cash.error_failed_add'), type: 'error' });
      return false;
    }

    let receiptPath = null;
    if (receiptImage && txData) receiptPath = await uploadReceiptImage(receiptImage, txData.id);

    alert({
      title: t('common.success'),
      message: t('petty_cash.success_expense_added') + (receiptPath ? t('petty_cash.success_expense_receipt') : ''),
      type: 'success',
    });
    reload();
    return true;
  } catch {
    alert({ title: t('common.error'), message: t('petty_cash.error_failed_add'), type: 'error' });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Add replenishment
// ---------------------------------------------------------------------------

export async function addReplenishment(ctx: ActionContext, amount: string): Promise<boolean> {
  const { alert, t, preschoolId, accountId, userId, reload } = ctx;

  if (!amount) { alert({ title: t('common.error'), message: t('petty_cash.error_replenishment_amount'), type: 'error' }); return false; }
  if (!preschoolId || !accountId) { alert({ title: t('common.error'), message: t('petty_cash.error_no_school'), type: 'error' }); return false; }

  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) { alert({ title: t('common.error'), message: t('petty_cash.error_valid_amount'), type: 'error' }); return false; }

  try {
    const { error } = await withPettyCashTenant((col, client) =>
      client.from('petty_cash_transactions').insert({
        [col]: preschoolId, account_id: accountId, amount: num,
        description: `Petty cash replenishment - ${new Date().toLocaleDateString()}`,
        category: 'Replenishment', type: 'replenishment',
        created_by: userId, approved_by: userId, status: 'approved',
      }),
    );
    if (error) { logger.error('PettyCash', 'Error adding replenishment', error); alert({ title: t('common.error'), message: t('petty_cash.error_failed_record'), type: 'error' }); return false; }
    alert({ title: t('common.success'), message: t('petty_cash.success_replenishment'), type: 'success' });
    reload();
    return true;
  } catch {
    alert({ title: t('common.error'), message: t('petty_cash.error_failed_record'), type: 'error' });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Add withdrawal
// ---------------------------------------------------------------------------

export async function addWithdrawal(ctx: ActionContext, form: ExpenseFormData): Promise<boolean> {
  const { alert, t, preschoolId, accountId, userId, summary, reload } = ctx;

  if (!form.amount || !form.description) { alert({ title: t('common.error'), message: t('petty_cash.error_amount_description'), type: 'error' }); return false; }
  if (!preschoolId || !accountId) { alert({ title: t('common.error'), message: t('petty_cash.error_no_school'), type: 'error' }); return false; }

  const amount = parseFloat(form.amount);
  if (isNaN(amount) || amount <= 0) { alert({ title: t('common.error'), message: t('petty_cash.error_valid_amount'), type: 'error' }); return false; }
  if (amount > summary.current_balance) { alert({ title: t('common.error'), message: t('petty_cash.error_withdrawal_exceeds'), type: 'error' }); return false; }

  try {
    const { error } = await withPettyCashTenant((col, client) =>
      client.from('petty_cash_transactions').insert({
        [col]: preschoolId, account_id: accountId, amount,
        description: form.description.trim(), category: 'Withdrawal/Adjustment',
        type: 'expense', reference_number: form.receipt_number.trim() || null,
        created_by: userId, approved_by: userId, status: 'approved',
      }),
    );
    if (error) { logger.error('PettyCash', 'Error adding withdrawal', error); alert({ title: t('common.error'), message: t('petty_cash.error_failed_withdrawal'), type: 'error' }); return false; }
    alert({ title: t('common.success'), message: t('petty_cash.success_withdrawal'), type: 'success' });
    reload();
    return true;
  } catch {
    alert({ title: t('common.error'), message: t('petty_cash.error_failed_withdrawal'), type: 'error' });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reset petty cash
// ---------------------------------------------------------------------------

export async function resetPettyCash(ctx: ActionContext, reason?: string): Promise<boolean> {
  const { alert, t, preschoolId, accountId, userId, summary, reload } = ctx;

  if (!preschoolId || !accountId) { alert({ title: t('common.error'), message: t('petty_cash.error_no_school'), type: 'error' }); return false; }

  const bal = Number(summary.current_balance || 0);
  if (Math.abs(bal) < 0.01) { alert({ title: t('common.info', 'Info'), message: t('petty_cash.reset_already_zero', 'Petty cash balance is already zero.'), type: 'info' }); return false; }

  const now = new Date();
  const reference = `RESET-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const description = reason?.trim() ? `Petty cash reset: ${reason.trim()}` : `Petty cash reset - ${now.toLocaleDateString()}`;

  try {
    const { error } = await withPettyCashTenant((col, client) =>
      client.from('petty_cash_transactions').insert({
        [col]: preschoolId, account_id: accountId,
        amount: Math.abs(bal), description, category: 'Reset',
        type: bal > 0 ? 'expense' : 'replenishment',
        reference_number: reference,
        created_by: userId, approved_by: userId, status: 'approved',
      }),
    );
    if (error) { alert({ title: t('common.error'), message: t('petty_cash.reset_failed', 'Failed to reset petty cash.'), type: 'error' }); return false; }
    alert({ title: t('common.success'), message: t('petty_cash.reset_success', 'Petty cash reset to zero.'), type: 'success' });
    reload();
    return true;
  } catch {
    alert({ title: t('common.error'), message: t('petty_cash.reset_failed', 'Failed to reset petty cash.'), type: 'error' });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cancel / delete / reverse
// ---------------------------------------------------------------------------

export async function cancelTransaction(ctx: ActionContext, transactionId: string): Promise<boolean> {
  try {
    const { error } = await assertSupabase().from('petty_cash_transactions').update({ status: 'rejected' }).eq('id', transactionId).eq('status', 'pending');
    if (error) throw error;
    ctx.reload();
    return true;
  } catch {
    ctx.alert({ title: ctx.t('common.error'), message: ctx.t('transaction.failed_cancel', 'Failed to cancel transaction'), type: 'error' });
    return false;
  }
}

export async function canDelete(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await assertSupabase().from('profiles').select('role').eq('id', userId).maybeSingle();
    return ['principal', 'principal_admin', 'admin', 'superadmin'].includes(data?.role || '');
  } catch { return false; }
}

export async function deleteTransaction(ctx: ActionContext, transactionId: string): Promise<boolean> {
  try {
    const allowed = await canDelete(ctx.userId);
    if (!allowed) { ctx.alert({ title: ctx.t('common.not_allowed', 'Not allowed'), message: ctx.t('transaction.principals_only_delete', 'Only principals can delete transactions'), type: 'warning' }); return false; }
    const { error } = await assertSupabase().from('petty_cash_transactions').delete().eq('id', transactionId);
    if (error) throw error;
    ctx.reload();
    return true;
  } catch {
    ctx.alert({ title: ctx.t('common.error'), message: ctx.t('transaction.failed_delete', 'Failed to delete transaction'), type: 'error' });
    return false;
  }
}

export async function reverseTransaction(ctx: ActionContext, transaction: PettyCashTransaction): Promise<boolean> {
  try {
    const oppositeType = transaction.type === 'expense' ? 'replenishment' : 'expense';
    const { error } = await withPettyCashTenant((col, client) =>
      client.from('petty_cash_transactions').insert({
        [col]: ctx.preschoolId, account_id: ctx.accountId,
        amount: transaction.amount,
        description: `Reversal of ${transaction.type} (${transaction.id.substring(0, 8)}) - ${transaction.description}`,
        category: 'Other', type: oppositeType as 'expense' | 'replenishment',
        created_by: ctx.userId, status: 'approved',
      }),
    );
    if (error) throw error;
    ctx.alert({ title: ctx.t('common.success'), message: ctx.t('transaction.reversal_success', 'Transaction reversed successfully'), type: 'success' });
    ctx.reload();
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    ctx.alert({ title: ctx.t('common.error'), message: e?.message || ctx.t('transaction.failed_reverse', 'Failed to create reversal'), type: 'error' });
    return false;
  }
}
