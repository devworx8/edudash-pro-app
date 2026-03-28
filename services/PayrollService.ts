import { assertSupabase } from '@/lib/supabase';
import type { PayrollRosterBundle, PayrollPaymentRecord, PayrollAdvanceRecord } from '@/types/finance';
import * as PayrollExt from './PayrollExtensions';

const normalizeMonthIso = (value?: string): string => {
  const base = value ? new Date(value) : new Date();
  const date = Number.isNaN(base.getTime()) ? new Date() : base;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

const nextMonthIso = (monthIso: string): string => {
  const base = new Date(monthIso);
  const date = Number.isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
};

const normalizeDateOnly = (value?: string): string => {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
  const base = value ? new Date(value) : new Date();
  const date = Number.isNaN(base.getTime()) ? new Date() : base;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const coerceMoney = (value: number): number => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
};

export class PayrollService {
  static async getRoster(orgId: string, monthIso?: string): Promise<PayrollRosterBundle> {
    const supabase = assertSupabase();
    const month = normalizeMonthIso(monthIso);

    const { data, error } = await supabase.rpc('get_payroll_roster', {
      p_org_id: orgId,
      p_month: month,
    });

    if (error) {
      console.error('[PayrollService] get_payroll_roster failed:', error);
      if (error.code === '42P10') {
        const fallback = await this.getRosterFallback(orgId, month);
        if (fallback) {
          console.warn('[PayrollService] Falling back to direct table queries for payroll roster.');
          return {
            ...fallback,
            fallback_used: true,
          };
        }
        throw new Error(
          'Payroll roster is using an outdated DB function. Apply migration 20260212102000_fix_payroll_roster_on_conflict.sql.',
        );
      }
      throw new Error(error.message || 'Failed to load payroll roster');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to load payroll roster');
    }

    return {
      success: true,
      organization_id: data.organization_id,
      month: data.month,
      items: Array.isArray(data.items) ? data.items : [],
      generated_at: data.generated_at || new Date().toISOString(),
      fallback_used: false,
    };
  }

  private static async getRosterFallback(
    orgId: string,
    monthIso: string,
  ): Promise<PayrollRosterBundle | null> {
    const supabase = assertSupabase();

    try {
      const { data: recipients, error: recipientsError } = await supabase
        .from('payroll_recipients')
        .select('id, role_type, display_name, teacher_id, profile_id, active')
        .eq('organization_id', orgId)
        .eq('active', true);

      if (recipientsError) throw recipientsError;
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return {
          success: true,
          organization_id: orgId,
          month: monthIso,
          items: [],
          generated_at: new Date().toISOString(),
          fallback_used: true,
        };
      }

      const recipientIds = recipients
        .map((recipient: any) => recipient.id)
        .filter((id: any) => typeof id === 'string' && id.length > 0);
      if (recipientIds.length === 0) {
        return {
          success: true,
          organization_id: orgId,
          month: monthIso,
          items: [],
          generated_at: new Date().toISOString(),
          fallback_used: true,
        };
      }

      const [profilesRes, paymentsRes] = await Promise.all([
        supabase
          .from('payroll_profiles')
          .select('payroll_recipient_id, base_salary, allowances, deductions, net_salary, effective_from, created_at')
          .in('payroll_recipient_id', recipientIds)
          .lte('effective_from', monthIso)
          .order('effective_from', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('payroll_payments')
          .select('payroll_recipient_id, amount, created_at, payment_month')
          .eq('organization_id', orgId)
          .in('payroll_recipient_id', recipientIds)
          .gte('payment_month', monthIso)
          .lt('payment_month', nextMonthIso(monthIso)),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const latestProfileByRecipient = new Map<string, any>();
      for (const row of profilesRes.data || []) {
        const key = row?.payroll_recipient_id;
        if (!key || latestProfileByRecipient.has(key)) continue;
        latestProfileByRecipient.set(key, row);
      }

      const paidByRecipient = new Map<string, { amount: number; lastPaidAt: string | null }>();
      for (const row of paymentsRes.data || []) {
        const key = row?.payroll_recipient_id;
        if (!key) continue;
        const current = paidByRecipient.get(key) || { amount: 0, lastPaidAt: null };
        const amount = Number(row?.amount || 0);
        current.amount += Number.isFinite(amount) ? amount : 0;
        const createdAt = typeof row?.created_at === 'string' ? row.created_at : null;
        if (createdAt && (!current.lastPaidAt || createdAt > current.lastPaidAt)) {
          current.lastPaidAt = createdAt;
        }
        paidByRecipient.set(key, current);
      }

      const items = recipients.map((recipient: any) => {
        const profile = latestProfileByRecipient.get(recipient.id);
        const paid = paidByRecipient.get(recipient.id);
        const roleType: 'teacher' | 'principal' =
          recipient.role_type === 'principal' ? 'principal' : 'teacher';
        return {
          payroll_recipient_id: recipient.id,
          role_type: roleType,
          display_name: recipient.display_name || 'Staff Member',
          teacher_id: recipient.teacher_id || null,
          profile_id: recipient.profile_id || null,
          active: Boolean(recipient.active),
          base_salary: Number(profile?.base_salary || 0),
          allowances: Number(profile?.allowances || 0),
          deductions: Number(profile?.deductions || 0),
          net_salary: Number(profile?.net_salary || 0),
          salary_effective_from: profile?.effective_from || null,
          paid_this_month: Boolean(paid && paid.amount > 0),
          paid_amount_this_month: Number(paid?.amount || 0),
          last_paid_at: paid?.lastPaidAt || null,
        };
      }).sort((a, b) => {
        if (a.role_type === 'principal' && b.role_type !== 'principal') return -1;
        if (a.role_type !== 'principal' && b.role_type === 'principal') return 1;
        return String(a.display_name).localeCompare(String(b.display_name));
      });

      return {
        success: true,
        organization_id: orgId,
        month: monthIso,
        items,
        generated_at: new Date().toISOString(),
        fallback_used: true,
      };
    } catch (fallbackError) {
      console.error('[PayrollService] roster fallback failed:', fallbackError);
      return null;
    }
  }

  static async recordPayment(params: {
    payrollRecipientId: string;
    amount: number;
    paymentMonth: string;
    paymentMethod: string;
    reference?: string;
    notes?: string;
  }): Promise<{ payrollPaymentId?: string; financialTxId?: string }> {
    const supabase = assertSupabase();

    const { data, error } = await supabase.rpc('record_payroll_payment', {
      p_payroll_recipient_id: params.payrollRecipientId,
      p_amount: params.amount,
      p_payment_month: params.paymentMonth,
      p_payment_method: params.paymentMethod,
      p_reference: params.reference || null,
      p_notes: params.notes || null,
    });

    if (error) {
      console.error('[PayrollService] record_payroll_payment failed:', error);
      throw new Error(error.message || 'Failed to record payroll payment');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to record payroll payment');
    }

    return {
      payrollPaymentId: data.payroll_payment_id,
      financialTxId: data.financial_tx_id,
    };
  }

  static async closeMonth(orgId: string, monthIso: string): Promise<void> {
    const supabase = assertSupabase();
    const { data, error } = await supabase.rpc('close_finance_month', {
      p_org_id: orgId,
      p_month: monthIso,
    });

    if (error) {
      console.error('[PayrollService] close_finance_month failed:', error);
      throw new Error(error.message || 'Failed to close month');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to close month');
    }
  }

  static async upsertSalaryProfile(params: {
    payrollRecipientId: string;
    baseSalary: number;
    allowances?: number;
    deductions?: number;
    effectiveFrom?: string;
    notes?: string;
  }): Promise<{ id: string; netSalary: number; effectiveFrom: string }> {
    const supabase = assertSupabase();
    const payrollRecipientId = String(params.payrollRecipientId || '').trim();
    if (!payrollRecipientId) {
      throw new Error('Payroll recipient is required');
    }

    const baseSalary = coerceMoney(params.baseSalary);
    const allowances = coerceMoney(params.allowances || 0);
    const deductions = coerceMoney(params.deductions || 0);
    if (baseSalary < 0 || allowances < 0 || deductions < 0) {
      throw new Error('Salary values cannot be negative');
    }

    const effectiveFrom = normalizeDateOnly(params.effectiveFrom);
    const profilePayload = {
      payroll_recipient_id: payrollRecipientId,
      base_salary: baseSalary,
      allowances,
      deductions,
      effective_from: effectiveFrom,
      notes: params.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data: existingRows, error: existingError } = await supabase
      .from('payroll_profiles')
      .select('id')
      .eq('payroll_recipient_id', payrollRecipientId)
      .eq('effective_from', effectiveFrom)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      console.error('[PayrollService] upsertSalaryProfile lookup failed:', existingError);
      throw new Error(existingError.message || 'Failed to load salary profile');
    }

    const existingId = Array.isArray(existingRows) && existingRows[0]?.id
      ? String(existingRows[0].id)
      : null;

    if (existingId) {
      const { data, error } = await supabase
        .from('payroll_profiles')
        .update(profilePayload)
        .eq('id', existingId)
        .select('id, net_salary, effective_from')
        .single();

      if (error) {
        console.error('[PayrollService] upsertSalaryProfile update failed:', error);
        throw new Error(error.message || 'Failed to update salary profile');
      }

      const fallbackNet = Number((baseSalary + allowances - deductions).toFixed(2));
      return {
        id: String(data?.id || existingId),
        netSalary: Number.isFinite(Number(data?.net_salary)) ? Number(data?.net_salary) : fallbackNet,
        effectiveFrom: String(data?.effective_from || effectiveFrom),
      };
    }

    const { data, error } = await supabase
      .from('payroll_profiles')
      .insert({
        ...profilePayload,
        created_at: new Date().toISOString(),
      })
      .select('id, net_salary, effective_from')
      .single();

    if (error) {
      console.error('[PayrollService] upsertSalaryProfile insert failed:', error);
      throw new Error(error.message || 'Failed to create salary profile');
    }

    const fallbackNet = Number((baseSalary + allowances - deductions).toFixed(2));
    return {
      id: String(data?.id || ''),
      netSalary: Number.isFinite(Number(data?.net_salary)) ? Number(data?.net_salary) : fallbackNet,
      effectiveFrom: String(data?.effective_from || effectiveFrom),
    };
  }

  static async deactivateRecipient(params: {
    payrollRecipientId: string;
  }): Promise<void> {
    const supabase = assertSupabase();
    const payrollRecipientId = String(params.payrollRecipientId || '').trim();
    if (!payrollRecipientId) {
      throw new Error('Payroll recipient is required');
    }

    const { error } = await supabase
      .from('payroll_recipients')
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payrollRecipientId);

    if (error) {
      console.error('[PayrollService] deactivateRecipient failed:', error);
      throw new Error(error.message || 'Failed to remove payroll recipient');
    }
  }

  // ── Delegated to PayrollExtensions (WARP split) ─────────────

  static getPaymentHistory = PayrollExt.getPaymentHistory;
  static editPayment = PayrollExt.editPayment;
  static voidPayment = PayrollExt.voidPayment;
  static getAdvances = PayrollExt.getAdvances;
  static recordAdvance = PayrollExt.recordAdvance;
  static markAdvanceRepaid = PayrollExt.markAdvanceRepaid;
}
