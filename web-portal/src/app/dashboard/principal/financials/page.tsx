'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { usePrincipalFinancials } from '@/hooks/principal/usePrincipalFinancials';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { 
  DollarSign, TrendingUp, TrendingDown, Calendar, CheckCircle, Clock, 
  AlertTriangle, RefreshCw, Receipt, Wallet, CreditCard, PieChart, BarChart3
} from 'lucide-react';

interface Payment {
  id: string;
  student_first_name: string;
  student_last_name: string;
  registration_fee_amount: number;
  registration_fee_paid: boolean;
  payment_date: string | null;
  created_at: string;
}

export default function FinancialsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const schoolId = profile?.preschoolId || profile?.organizationId;
  const preschoolId = schoolId;

  // Use the comprehensive financials hook
  const { data: financials, loading, error, refresh } = usePrincipalFinancials(schoolId);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    initAuth();
  }, [router, supabase]);

  // Load recent payments for the transaction table
  useEffect(() => {
    if (!schoolId) return;

    const loadRecentPayments = async () => {
      setPaymentsLoading(true);
      try {
        const { data: registrations } = await supabase
          .from('registration_requests')
          .select('id, student_first_name, student_last_name, registration_fee_amount, registration_fee_paid, payment_date, created_at, status')
          .eq('organization_id', schoolId)
          .order('created_at', { ascending: false })
          .limit(20);

        setRecentPayments((registrations as Payment[]) || []);
      } catch (err) {
        console.error('Error loading payments:', err);
      } finally {
        setPaymentsLoading(false);
      }
    };

    loadRecentPayments();
  }, [schoolId, supabase]);

  const formatCurrency = (amount: number) => {
    return `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading || paymentsLoading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading financials...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 className="h1">Financial Dashboard</h1>
            <p style={{ color: 'var(--muted)' }}>
              Comprehensive view of all school finances
            </p>
          </div>
          <button className="btn btnSecondary" onClick={refresh} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="card" style={{ background: '#fef2f2', borderColor: '#fecaca', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626' }}>
              <AlertTriangle size={20} />
              <span>Error loading financial data: {error}</span>
            </div>
          </div>
        )}

        {/* Key Metrics - 4 cards */}
        <div className="grid2" style={{ marginBottom: 24 }}>
          <div className="card tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ padding: 8, background: '#10b98120', borderRadius: 8 }}>
                <TrendingUp size={24} color="#10b981" />
              </div>
              <div className="metricLabel">Total Revenue (This Month)</div>
            </div>
            <div className="metricValue" style={{ color: '#10b981' }}>
              {formatCurrency(financials?.totalRevenueThisMonth || 0)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {financials?.registrationFeeCount || 0} registration fees + school fees + payments
            </div>
          </div>

          <div className="card tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ padding: 8, background: '#f59e0b20', borderRadius: 8 }}>
                <Clock size={24} color="#f59e0b" />
              </div>
              <div className="metricLabel">Outstanding Fees</div>
            </div>
            <div className="metricValue" style={{ color: '#f59e0b' }}>
              {formatCurrency((financials?.pendingRegistrationFees || 0) + (financials?.outstandingSchoolFees || 0))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {financials?.overdueFeesCount || 0} overdue
            </div>
            {((financials?.excludedInactiveStudents || 0) +
              (financials?.excludedFutureEnrollmentStudents || 0) +
              (financials?.excludedUnverifiedStudents || 0)) > 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                Excluded: {financials?.excludedFutureEnrollmentStudents || 0} not started,{' '}
                {financials?.excludedUnverifiedStudents || 0} unverified new registrations,{' '}
                {financials?.excludedInactiveStudents || 0} inactive.
              </div>
            )}
          </div>

          <div className="card tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ padding: 8, background: '#6366f120', borderRadius: 8 }}>
                <Wallet size={24} color="#6366f1" />
              </div>
              <div className="metricLabel">Net Income (This Month)</div>
            </div>
            <div className="metricValue" style={{ color: (financials?.netIncomeThisMonth || 0) >= 0 ? '#10b981' : '#ef4444' }}>
              {formatCurrency(financials?.netIncomeThisMonth || 0)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Revenue - Expenses
            </div>
          </div>

          <div className="card tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ padding: 8, background: '#06b6d420', borderRadius: 8 }}>
                <PieChart size={24} color="#06b6d4" />
              </div>
              <div className="metricLabel">Collection Rate</div>
            </div>
            <div className="metricValue" style={{ color: (financials?.collectionRate || 0) > 80 ? '#10b981' : '#f59e0b' }}>
              {Math.round(financials?.collectionRate || 0)}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Payment success rate
            </div>
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="grid2" style={{ marginBottom: 24 }}>
          <div className="card">
            <div className="sectionTitle" style={{ marginBottom: 16 }}>
              <Receipt size={18} style={{ marginRight: 8 }} />
              Revenue Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Registration Fees</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {financials?.registrationFeeCount || 0} payments
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: '#10b981' }}>
                    {formatCurrency(financials?.registrationFeesCollected || 0)}
                  </div>
                  <div style={{ fontSize: 12, color: '#f59e0b' }}>
                    {formatCurrency(financials?.pendingRegistrationFees || 0)} pending
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>School Fees</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Monthly tuition
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: '#10b981' }}>
                    {formatCurrency(financials?.monthlyFeesCollected || 0)}
                  </div>
                  <div style={{ fontSize: 12, color: '#f59e0b' }}>
                    {formatCurrency(financials?.outstandingSchoolFees || 0)} outstanding
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Other Payments</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    This month
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: '#10b981' }}>
                    {formatCurrency(financials?.paymentsThisMonth || 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="sectionTitle" style={{ marginBottom: 16 }}>
              <CreditCard size={18} style={{ marginRight: 8 }} />
              Expenses & Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Expenses This Month</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Petty cash & operational
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: '#ef4444' }}>
                  {formatCurrency(financials?.expensesThisMonth || 0)}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>POP Reviews Pending</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Proof of payment uploads
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(financials?.pendingPOPReviews || 0) > 0 && (
                    <span style={{
                      padding: '4px 12px',
                      background: '#f59e0b20',
                      color: '#f59e0b',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {financials?.pendingPOPReviews} pending
                    </span>
                  )}
                  <button 
                    className="btn btnSecondary" 
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    onClick={() => router.push('/dashboard/principal/pop-review')}
                  >
                    Review
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fee Type Breakdown */}
        {financials?.feeTypeBreakdown && financials.feeTypeBreakdown.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="sectionTitle" style={{ marginBottom: 16 }}>
              <BarChart3 size={18} style={{ marginRight: 8 }} />
              Fee Type Breakdown
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {financials.feeTypeBreakdown.map(item => (
                <div key={item.type} style={{ padding: 16, background: 'var(--background)', borderRadius: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{item.type}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#10b981' }}>Collected: {formatCurrency(item.collected)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 4 }}>
                    <span style={{ color: '#f59e0b' }}>Outstanding: {formatCurrency(item.outstanding)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Trend Chart */}
        {financials?.monthlyTrend && financials.monthlyTrend.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="sectionTitle" style={{ marginBottom: 16 }}>
              <TrendingUp size={18} style={{ marginRight: 8 }} />
              6-Month Financial Trend
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150, padding: '16px 0' }}>
              {financials.monthlyTrend.map((month, index) => {
                const maxRevenue = Math.max(...financials.monthlyTrend.map(m => m.revenue || 1));
                const barHeight = maxRevenue > 0 ? (month.revenue / maxRevenue) * 100 : 0;
                return (
                  <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ 
                      width: '100%', 
                      height: Math.max(barHeight, 4), 
                      background: `linear-gradient(180deg, #10b981, #059669)`,
                      borderRadius: '4px 4px 0 0',
                      minHeight: 4
                    }} />
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                      {month.month.split(' ')[0]}
                    </div>
                    <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>
                      {formatCurrency(month.revenue)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <div className="sectionTitle">Recent Transactions</div>
        {recentPayments.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <DollarSign size={48} style={{ margin: '0 auto 16px', color: 'var(--muted)' }} />
            <h3 style={{ marginBottom: 8 }}>No transactions yet</h3>
            <p style={{ color: 'var(--muted)' }}>
              Registration payments will appear here
            </p>
          </div>
        ) : (
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                      Student Name
                    </th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                      Amount
                    </th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                      Status
                    </th>
                    <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => (
                    <tr key={payment.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 500 }}>{payment.student_first_name} {payment.student_last_name}</div>
                      </td>
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 600 }}>
                          {formatCurrency(parseFloat(payment.registration_fee_amount as any || 0))}
                        </div>
                      </td>
                      <td style={{ padding: 12 }}>
                        {payment.registration_fee_paid ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 12px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: '#10b98120',
                            color: '#10b981',
                          }}>
                            <CheckCircle size={14} />
                            Paid
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 12px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: '#f59e0b20',
                            color: '#f59e0b',
                          }}>
                            <Clock size={14} />
                            Pending
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 14 }}>
                        {payment.payment_date 
                          ? new Date(payment.payment_date).toLocaleDateString('en-ZA')
                          : new Date(payment.created_at).toLocaleDateString('en-ZA')
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
