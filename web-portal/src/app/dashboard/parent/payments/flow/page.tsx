'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { AlertCircle, ArrowLeft, CheckCircle2, Copy, CreditCard, FileText } from 'lucide-react';

interface PaymentMethod {
  id: string;
  method_name: string;
  display_name: string;
  processing_fee: number;
  fee_type: string;
  description?: string | null;
  instructions?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  branch_code?: string | null;
  preferred: boolean;
}

const COPY = {
  headerTitle: 'Make a Payment',
  headerSubtitleFallback: 'School payment flow',
  backToPayments: 'Back to Payments',
  loadingPaymentDetails: 'Loading payment details…',
  summaryTitle: 'Payment Summary',
  summaryLabels: {
    for: 'For',
    child: 'Child',
    dueDate: 'Due date',
    total: 'Total',
    reference: 'Payment Reference',
  },
  copyLabels: {
    copied: 'Copied',
    copy: 'Copy',
  },
  bankingTitle: 'Banking Details',
  bankingLabels: {
    bank: 'Bank',
    accountNumber: 'Account Number',
    branchCode: 'Branch Code',
  },
  noBankingDetails: 'No banking details available. Please contact the school.',
  nextStepsTitle: 'Next Steps',
  nextSteps: [
    'Open your banking app and make the transfer.',
    'Use the payment reference exactly as shown above.',
    'Upload proof of payment once done.',
  ],
  uploadProof: 'Upload Proof of Payment',
  childFallback: 'N/A',
  accountNumberFallback: 'N/A',
  feeDescriptionFallback: 'School Fees',
} as const;

const formatCurrency = (amount: number) => `R ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;

function PaymentFlowContent() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const childId = searchParams.get('childId') || '';
  const childName = searchParams.get('childName') || '';
  const studentCode = searchParams.get('studentCode') || '';
  const feeAmountParam = searchParams.get('feeAmount') || '0';
  const feeDescription = searchParams.get('feeDescription') || COPY.feeDescriptionFallback;
  const feeId = searchParams.get('feeId') || '';
  const feeDueDate = searchParams.get('feeDueDate') || '';
  const preschoolId = searchParams.get('preschoolId') || '';
  const preschoolName = searchParams.get('preschoolName') || '';

  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const { slug } = useTenantSlug(userId);
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const amount = useMemo(() => {
    const parsed = Number.parseFloat(feeAmountParam);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [feeAmountParam]);

  const preferredMethod = useMemo(() => {
    if (paymentMethods.length === 0) return null;
    return paymentMethods.find((method) => method.preferred) || paymentMethods[0];
  }, [paymentMethods]);

  const copyValue = useCallback(async (value: string, field: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Ignore clipboard errors (unsupported browser)
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setEmail(session.user.email || '');
      setUserId(session.user.id);

      if (preschoolId) {
        const { data } = await supabase
          .from('organization_payment_methods')
          .select('*')
          .eq('organization_id', preschoolId)
          .eq('active', true)
          .order('preferred', { ascending: false });

        setPaymentMethods((data || []) as PaymentMethod[]);
      }

      setLoading(false);
    })();
  }, [preschoolId, router, supabase]);

  return (
    <ParentShell tenantSlug={slug} userEmail={email} preschoolName={preschoolName}>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title={COPY.headerTitle}
          subtitle={preschoolName || COPY.headerSubtitleFallback}
          icon={<CreditCard size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20 }}>
          <button
            onClick={() => router.push('/dashboard/parent/payments')}
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 20,
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} />
            {COPY.backToPayments}
          </button>

          {loading ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
              <p className="muted" style={{ marginTop: 12 }}>{COPY.loadingPaymentDetails}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>{COPY.summaryTitle}</div>
                <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">{COPY.summaryLabels.for}</span>
                    <span>{feeDescription}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">{COPY.summaryLabels.child}</span>
                    <span>{childName || COPY.childFallback}</span>
                  </div>
                  {feeDueDate && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">{COPY.summaryLabels.dueDate}</span>
                      <span>{new Date(feeDueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>{COPY.summaryLabels.total}</span>
                    <span>{formatCurrency(amount)}</span>
                  </div>
                </div>
                {studentCode && (
                  <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'rgba(59,130,246,0.08)' }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{COPY.summaryLabels.reference}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{studentCode}</span>
                      <button
                        className="btn btnSecondary"
                        onClick={() => copyValue(studentCode, 'reference')}
                        style={{ padding: '6px 10px', fontSize: 12 }}
                      >
                        {copiedField === 'reference' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                        {copiedField === 'reference' ? COPY.copyLabels.copied : COPY.copyLabels.copy}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>{COPY.bankingTitle}</div>
                {preferredMethod?.bank_name ? (
                  <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span className="muted">{COPY.bankingLabels.bank}</span>
                      <span>{preferredMethod.bank_name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span className="muted">{COPY.bankingLabels.accountNumber}</span>
                      <span style={{ fontWeight: 600 }}>{preferredMethod.account_number || COPY.accountNumberFallback}</span>
                    </div>
                    {preferredMethod.branch_code && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span className="muted">{COPY.bankingLabels.branchCode}</span>
                        <span>{preferredMethod.branch_code}</span>
                      </div>
                    )}
                    {preferredMethod.instructions && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                        {preferredMethod.instructions}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                    <AlertCircle size={16} />
                    {COPY.noBankingDetails}
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>{COPY.nextStepsTitle}</div>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 13, color: 'var(--muted)' }}>
                  {COPY.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button
                    className="btn btnPrimary"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (childId) params.set('child', childId);
                      if (feeId) params.set('feeId', feeId);
                      if (amount > 0) params.set('feeAmount', amount.toFixed(2));
                      if (feeDescription) params.set('feeDescription', feeDescription);
                      if (feeId) params.set('feeId', feeId);
                      router.push(`/dashboard/parent/payments/pop-upload?${params.toString()}`);
                    }}
                  >
                    <FileText size={16} />
                    {COPY.uploadProof}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ParentShell>
  );
}

export default function PaymentFlowPage() {
  return (
    <Suspense
      fallback={
        <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <PaymentFlowContent />
    </Suspense>
  );
}
