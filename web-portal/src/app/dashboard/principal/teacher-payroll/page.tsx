'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import {
  DollarSign, Users, Plus, Receipt, TrendingUp, Download,
  Search, Filter, Calendar, CheckCircle, Clock, AlertCircle,
  Wallet, CreditCard, Briefcase,
} from 'lucide-react';

type PaymentType = 'salary' | 'advance' | 'loan' | 'bonus' | 'reimbursement' | 'deduction_recovery' | 'other';
type PaymentMethod = 'bank_transfer' | 'cash' | 'cheque' | 'eft' | 'other';
type FilterPeriod = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all';

interface TeacherSalary {
  id: string;
  teacher_id: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  pay_scale: string | null;
  effective_date: string;
  notes: string | null;
  teacher?: { id: string; first_name?: string; last_name?: string; user_id?: string };
}

interface TeacherPayment {
  id: string;
  teacher_id: string | null;
  preschool_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  payment_type: PaymentType;
  recipient_role: string;
  recipient_name: string | null;
  reference_number: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  teacher?: { first_name?: string; last_name?: string };
}

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  salary: '💰 Salary',
  advance: '⏩ Advance',
  loan: '🏦 Loan',
  bonus: '🎁 Bonus',
  reimbursement: '🔄 Reimbursement',
  deduction_recovery: '📋 Deduction Recovery',
  other: '📄 Other',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: '🏦 Bank Transfer',
  cash: '💵 Cash',
  cheque: '📝 Cheque',
  eft: '💳 EFT',
  other: '📋 Other',
};

const formatCurrency = (amount: number) =>
  `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TeacherPayrollPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const organizationId = profile?.organizationId;
  const orgId = organizationId || preschoolId;

  const [activeView, setActiveView] = useState<'overview' | 'payments' | 'salaries' | 'add'>('overview');
  const [salaries, setSalaries] = useState<TeacherSalary[]>([]);
  const [payments, setPayments] = useState<TeacherPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('this_month');
  const [searchQuery, setSearchQuery] = useState('');

  // Add payment form
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formType, setFormType] = useState<PaymentType>('salary');
  const [formMethod, setFormMethod] = useState<PaymentMethod>('bank_transfer');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formRef, setFormRef] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formRecipientRole, setFormRecipientRole] = useState('teacher');
  const [formRecipientName, setFormRecipientName] = useState('');
  const [formPeriodStart, setFormPeriodStart] = useState('');
  const [formPeriodEnd, setFormPeriodEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [teachers, setTeachers] = useState<{ id: string; first_name: string; last_name: string }[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
    };
    init();
  }, [supabase]);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // Load salaries
      const { data: salaryData } = await supabase
        .from('teacher_salaries')
        .select('*, teacher:teachers(id, first_name, last_name, user_id)')
        .eq('preschool_id', orgId)
        .order('created_at', { ascending: false });

      if (salaryData) {
        setSalaries(salaryData.map((s: any) => ({
          ...s,
          teacher: Array.isArray(s.teacher) ? s.teacher[0] : s.teacher,
        })));
      }

      // Load payments
      const { data: paymentData } = await supabase
        .from('teacher_payments')
        .select('*, teacher:teachers(first_name, last_name)')
        .eq('preschool_id', orgId)
        .order('payment_date', { ascending: false })
        .limit(100);

      if (paymentData) {
        setPayments(paymentData.map((p: any) => ({
          ...p,
          teacher: Array.isArray(p.teacher) ? p.teacher[0] : p.teacher,
        })));
      }

      // Load teachers for dropdown
      const { data: teacherData } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')
        .eq('preschool_id', orgId)
        .order('first_name');

      if (teacherData) setTeachers(teacherData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Summary metrics
  const metrics = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const monthPayments = payments.filter((p) => {
      const d = new Date(p.payment_date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const totalMonthly = monthPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalBudget = salaries.reduce((sum, s) => sum + s.net_salary, 0);
    const totalSalaryPayments = monthPayments
      .filter((p) => p.payment_type === 'salary')
      .reduce((sum, p) => sum + p.amount, 0);
    const totalAdvances = monthPayments
      .filter((p) => p.payment_type === 'advance')
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      totalMonthly,
      totalBudget,
      totalSalaryPayments,
      totalAdvances,
      teacherCount: salaries.length,
      paymentCount: monthPayments.length,
    };
  }, [payments, salaries]);

  const filteredPayments = useMemo(() => {
    let result = payments;
    const now = new Date();

    // Period filter
    if (filterPeriod === 'this_month') {
      result = result.filter((p) => {
        const d = new Date(p.payment_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (filterPeriod === 'last_month') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      result = result.filter((p) => {
        const d = new Date(p.payment_date);
        return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
      });
    } else if (filterPeriod === 'this_quarter') {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      result = result.filter((p) => new Date(p.payment_date) >= qStart);
    } else if (filterPeriod === 'this_year') {
      result = result.filter((p) => new Date(p.payment_date).getFullYear() === now.getFullYear());
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.teacher?.first_name?.toLowerCase().includes(q) ||
          p.teacher?.last_name?.toLowerCase().includes(q) ||
          p.recipient_name?.toLowerCase().includes(q) ||
          p.reference_number?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [payments, filterPeriod, searchQuery]);

  const handleRecordPayment = async () => {
    if (!orgId || !formAmount || !userId) return;
    setSubmitting(true);
    try {
      const payload: any = {
        preschool_id: orgId,
        teacher_id: formTeacherId || null,
        amount: parseFloat(formAmount),
        payment_date: formDate,
        payment_method: formMethod,
        payment_type: formType,
        recipient_role: formRecipientRole,
        recipient_name: formRecipientName.trim() || null,
        reference_number: formRef.trim() || null,
        period_start: formPeriodStart || null,
        period_end: formPeriodEnd || null,
        notes: formNotes.trim() || null,
        recorded_by: userId,
      };

      const { error } = await supabase
        .from('teacher_payments')
        .insert(payload);

      if (error) throw error;

      // Reset form
      setFormTeacherId('');
      setFormAmount('');
      setFormType('salary');
      setFormRef('');
      setFormNotes('');
      setFormRecipientName('');
      setFormPeriodStart('');
      setFormPeriodEnd('');
      setActiveView('overview');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const getPayeeLabel = (p: TeacherPayment) => {
    if (p.recipient_name) return p.recipient_name;
    if (p.teacher) return `${p.teacher.first_name || ''} ${p.teacher.last_name || ''}`.trim();
    return 'Unknown';
  };

  const periodLabels: { key: FilterPeriod; label: string }[] = [
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_quarter', label: 'This Quarter' },
    { key: 'this_year', label: 'This Year' },
    { key: 'all', label: 'All Time' },
  ];

  return (
    <PrincipalShell
      preschoolName={profile?.preschoolName}
      preschoolId={preschoolId}
      hideRightSidebar={true}
    >
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title="Teacher Payroll"
          subtitle="Manage salaries, payments, advances, and bonuses"
          icon={<Wallet size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20, maxWidth: 1000, margin: '0 auto' }}>
          {/* View tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            {(['overview', 'payments', 'salaries', 'add'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: activeView === view ? 'var(--primary)' : 'var(--surface)',
                  color: activeView === view ? 'white' : 'var(--text)',
                  fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {view === 'overview' && <TrendingUp size={14} />}
                {view === 'payments' && <Receipt size={14} />}
                {view === 'salaries' && <Users size={14} />}
                {view === 'add' && <Plus size={14} />}
                {view.charAt(0).toUpperCase() + view.slice(1)}
                {view === 'add' ? ' Payment' : ''}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
              <p style={{ color: 'var(--muted)', marginTop: 16 }}>Loading payroll data...</p>
            </div>
          ) : activeView === 'overview' ? (
            <>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                <MetricCard icon={<DollarSign size={24} />} label="Monthly Payroll" value={formatCurrency(metrics.totalMonthly)} color="#3b82f6" />
                <MetricCard icon={<Wallet size={24} />} label="Salary Budget" value={formatCurrency(metrics.totalBudget)} color="#10b981" />
                <MetricCard icon={<Users size={24} />} label="Staff on Payroll" value={String(metrics.teacherCount)} color="#8b5cf6" />
                <MetricCard icon={<Receipt size={24} />} label="Payments This Month" value={String(metrics.paymentCount)} color="#f59e0b" />
              </div>

              {/* Budget vs Actual */}
              {metrics.totalBudget > 0 && (
                <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
                    Budget vs Actual (This Month)
                  </h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span>Paid: {formatCurrency(metrics.totalSalaryPayments)}</span>
                    <span>Budget: {formatCurrency(metrics.totalBudget)}</span>
                  </div>
                  <div style={{ height: 12, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 6,
                      width: `${Math.min(100, (metrics.totalSalaryPayments / metrics.totalBudget) * 100)}%`,
                      background: metrics.totalSalaryPayments > metrics.totalBudget ? '#ef4444' : '#10b981',
                      transition: 'width 0.5s',
                    }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    {((metrics.totalSalaryPayments / metrics.totalBudget) * 100).toFixed(0)}% utilized
                    {metrics.totalAdvances > 0 && ` · Advances: ${formatCurrency(metrics.totalAdvances)}`}
                  </div>
                </div>
              )}

              {/* Recent Payments */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Recent Payments</h3>
              {payments.slice(0, 5).map((p) => (
                <PaymentRow key={p.id} payment={p} getPayeeLabel={getPayeeLabel} />
              ))}
              {payments.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <DollarSign size={36} style={{ margin: '0 auto', color: 'var(--muted)', opacity: 0.4 }} />
                  <p style={{ color: 'var(--muted)', marginTop: 12 }}>No payments recorded yet.</p>
                </div>
              )}
            </>
          ) : activeView === 'payments' ? (
            <>
              {/* Filter bar */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                  <input
                    type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, reference..."
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
                <select
                  value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}
                >
                  {periodLabels.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>

              {/* Totals */}
              <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{filteredPayments.length} payments</span>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                  Total: {formatCurrency(filteredPayments.reduce((s, p) => s + p.amount, 0))}
                </span>
              </div>

              {filteredPayments.map((p) => (
                <PaymentRow key={p.id} payment={p} getPayeeLabel={getPayeeLabel} />
              ))}
              {filteredPayments.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ color: 'var(--muted)' }}>No payments found for this period.</p>
                </div>
              )}
            </>
          ) : activeView === 'salaries' ? (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Salary Configurations</h3>
              {salaries.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <Users size={36} style={{ margin: '0 auto', color: 'var(--muted)', opacity: 0.4 }} />
                  <p style={{ color: 'var(--muted)', marginTop: 12 }}>No salary records configured yet.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {salaries.map((s) => (
                    <div key={s.id} className="card" style={{ padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                            {s.teacher ? `${s.teacher.first_name || ''} ${s.teacher.last_name || ''}`.trim() : 'Unknown Teacher'}
                          </div>
                          {s.pay_scale && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Scale: {s.pay_scale}</span>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>
                            {formatCurrency(s.net_salary)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>net / month</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
                        <span>Basic: {formatCurrency(s.basic_salary)}</span>
                        <span>Allow: +{formatCurrency(s.allowances)}</span>
                        <span>Deduc: -{formatCurrency(s.deductions)}</span>
                        <span>Since: {new Date(s.effective_date).toLocaleDateString('en-ZA')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Add Payment Form */
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Record Payment</h3>

              {/* Recipient type */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Recipient Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['teacher', 'principal', 'staff'].map((r) => (
                    <button key={r} type="button" onClick={() => setFormRecipientRole(r)}
                      style={{
                        padding: '8px 16px', borderRadius: 10, border: '2px solid',
                        borderColor: formRecipientRole === r ? 'var(--primary)' : 'var(--border)',
                        background: formRecipientRole === r ? 'rgba(59,130,246,0.1)' : 'var(--surface)',
                        color: formRecipientRole === r ? 'var(--primary)' : 'var(--text)',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
                      }}
                    >{r}</button>
                  ))}
                </div>
              </div>

              {/* Teacher dropdown or name field */}
              {formRecipientRole === 'teacher' ? (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Teacher</label>
                  <select value={formTeacherId} onChange={(e) => setFormTeacherId(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  >
                    <option value="">Select teacher</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                  </select>
                </div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Recipient Name</label>
                  <input type="text" value={formRecipientName} onChange={(e) => setFormRecipientName(e.target.value)}
                    placeholder="Full name"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Amount (R) *</label>
                  <input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00" step="0.01" min="0"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Date *</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Payment Type</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value as PaymentType)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  >
                    {Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Payment Method</label>
                  <select value={formMethod} onChange={(e) => setFormMethod(e.target.value as PaymentMethod)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Period Start</label>
                  <input type="date" value={formPeriodStart} onChange={(e) => setFormPeriodStart(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Period End</label>
                  <input type="date" value={formPeriodEnd} onChange={(e) => setFormPeriodEnd(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Reference Number</label>
                <input type="text" value={formRef} onChange={(e) => setFormRef(e.target.value)}
                  placeholder="e.g., EFT-2026-0207"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Notes</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={2}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }}
                />
              </div>

              <button
                onClick={handleRecordPayment}
                disabled={submitting || !formAmount}
                style={{
                  width: '100%', padding: '14px 24px', borderRadius: 10, border: 'none',
                  background: submitting || !formAmount ? 'var(--muted)' : 'var(--primary)',
                  color: 'white', fontWeight: 700, fontSize: 16, cursor: submitting || !formAmount ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          )}
        </div>
      </div>
    </PrincipalShell>
  );
}

/* ── Sub-components ── */

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `${color}15`, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function PaymentRow({ payment, getPayeeLabel }: {
  payment: TeacherPayment;
  getPayeeLabel: (p: TeacherPayment) => string;
}) {
  const typeInfo = PAYMENT_TYPE_LABELS[payment.payment_type] || payment.payment_type;
  return (
    <div className="card" style={{
      padding: 16, marginBottom: 8, display: 'flex',
      alignItems: 'center', gap: 14,
      borderLeft: `3px solid ${payment.payment_type === 'salary' ? '#10b981' : payment.payment_type === 'advance' ? '#f59e0b' : '#3b82f6'}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
          {getPayeeLabel(payment)}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(124,58,237,0.1)', color: '#7c3aed', fontWeight: 600,
          }}>
            {typeInfo}
          </span>
          <span>{PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}</span>
          {payment.reference_number && <span>Ref: {payment.reference_number}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {formatCurrency(payment.amount)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {new Date(payment.payment_date).toLocaleDateString('en-ZA')}
        </div>
      </div>
    </div>
  );
}
