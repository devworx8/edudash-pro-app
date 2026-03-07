'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Wallet, PiggyBank, TrendingUp, Plus } from 'lucide-react';

interface BudgetCategory {
  id: string;
  category_name: string;
  budgeted_amount: number;
  spent_amount: number;
  fiscal_year: string;
}

interface PettyCashAccount {
  id: string;
  account_name: string;
  balance: number;
  float_amount: number;
}

export default function BudgetOverviewPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [budgets, setBudgets] = useState<BudgetCategory[]>([]);
  const [pettyCash, setPettyCash] = useState<PettyCashAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/sign-in'); return; }
      setUserId(session.user.id);
    };
    init();
  }, [router, supabase]);

  const fetchData = useCallback(async () => {
    if (!preschoolId) return;
    const [budgetRes, pettyRes] = await Promise.all([
      supabase.from('organization_budgets').select('*').eq('organization_id', preschoolId).order('category_name'),
      supabase.from('petty_cash_accounts').select('*').eq('organization_id', preschoolId),
    ]);
    setBudgets((budgetRes.data as BudgetCategory[]) || []);
    setPettyCash((pettyRes.data as PettyCashAccount[]) || []);
    setLoading(false);
  }, [preschoolId, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalBudgeted = budgets.reduce((s, b) => s + (b.budgeted_amount || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent_amount || 0), 0);
  const utilization = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const totalPettyCash = pettyCash.reduce((s, p) => s + (p.balance || 0), 0);

  const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <PrincipalShell tenantSlug={tenantSlug} userEmail={profile?.email} userName={profile?.firstName} preschoolName={profile?.preschoolName}>
      <div style={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 className="h1">Budget Overview</h1>
          <button className="qa" style={{ background: 'var(--primary)', color: 'white', border: 'none', gap: 6 }}>
            <Plus size={16} /> New Category
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid2" style={{ marginBottom: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Wallet size={24} color="var(--primary)" />
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>Total Budget</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{fmt(totalBudgeted)}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Spent: {fmt(totalSpent)}</div>
            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(utilization, 100)}%`, background: utilization > 90 ? '#dc2626' : utilization > 70 ? '#d97706' : '#059669', borderRadius: 99 }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{utilization}% utilized</div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <PiggyBank size={24} color="#d97706" />
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>Petty Cash</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{fmt(totalPettyCash)}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{pettyCash.length} account{pettyCash.length !== 1 ? 's' : ''}</div>
            {pettyCash.map((a) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
                <span>{a.account_name}</span>
                <span style={{ fontWeight: 600 }}>{fmt(a.balance)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Remaining Balance */}
        <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrendingUp size={20} color="#059669" />
          <span style={{ fontSize: 14 }}>Remaining: <strong style={{ color: '#059669' }}>{fmt(totalBudgeted - totalSpent)}</strong></span>
        </div>

        {/* Category Breakdown */}
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Budget Categories</h2>
        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</p>
        ) : budgets.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Wallet size={40} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600 }}>No budget categories</p>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Create budget categories to track spending</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {budgets.map((b) => {
              const pct = b.budgeted_amount > 0 ? Math.round((b.spent_amount / b.budgeted_amount) * 100) : 0;
              const barColor = pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#059669';
              return (
                <div key={b.id} className="card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{b.category_name}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{pct}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                    <span>Spent: {fmt(b.spent_amount)}</span>
                    <span>Budget: {fmt(b.budgeted_amount)}</span>
                  </div>
                  <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
