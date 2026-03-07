'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { POPUploadForm } from '@/components/dashboard/parent/POPUploadForm';
import { Upload, Info, ArrowLeft, History } from 'lucide-react';

function POPUploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  
  const {
    userName,
    preschoolName,
    hasOrganization,
    tenantSlug,
    profile,
    childrenCards,
  } = useParentDashboardData();

  const defaultChildId = useMemo(() => {
    const childParam = searchParams.get('child') || searchParams.get('childId');
    return childParam || undefined;
  }, [searchParams]);

  const defaultAmount = useMemo(() => {
    const amountParam = searchParams.get('feeAmount');
    if (!amountParam) return undefined;
    const parsed = Number.parseFloat(amountParam);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }, [searchParams]);

  const defaultDescription = useMemo(() => searchParams.get('feeDescription') || undefined, [searchParams]);
  const defaultFeeId = useMemo(() => searchParams.get('feeId') || undefined, [searchParams]);
  const defaultPaymentForMonth = useMemo(
    () => searchParams.get('billingMonth') || searchParams.get('paymentForMonth') || searchParams.get('feeDueDate') || undefined,
    [searchParams]
  );

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { 
        router.push('/sign-in'); 
        return; 
      }
      setUserId(session.user.id);
      setLoading(false);
    })();
  }, [router, supabase.auth]);

  if (loading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Convert children cards to format needed by form
  const children = childrenCards.map(child => ({
    id: child.id,
    first_name: child.firstName,
    last_name: child.lastName,
    student_code: child.studentCode || undefined,
  }));

  return (
    <ParentShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={userName}
      preschoolName={preschoolName}
      hasOrganization={hasOrganization}
    >
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader 
          title="Upload Proof of Payment"
          subtitle="Submit your payment receipt for verification"
          icon={<Upload size={28} color="white" />}
        />
        
        <div style={{ width: '100%', padding: '20px', maxWidth: 600, margin: '0 auto' }}>
          {/* Navigation */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button
              onClick={() => router.push('/dashboard/parent/payments')}
              className="btn btnSecondary"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <ArrowLeft size={16} />
              Back to Payments
            </button>
            <button
              onClick={() => router.push('/dashboard/parent/payments/pop-history')}
              className="btn btnSecondary"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <History size={16} />
              View History
            </button>
          </div>

          {/* Info Box */}
          <div style={{
            padding: 16,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 12,
            marginBottom: 24,
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Info size={20} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, margin: '0 0 8px 0' }}>
                  Upload Guidelines
                </h3>
                <ul style={{ fontSize: 13, color: 'var(--muted)', paddingLeft: 16, margin: 0 }}>
                  <li>Accepted formats: PDF, JPG, PNG</li>
                  <li>Maximum file size: 10MB</li>
                  <li>Include the payment reference number if available</li>
                  <li>Select the correct billing month for accurate fee matching</li>
                  <li>The school will review and confirm within 24-48 hours</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Check if children exist */}
          {children.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center' }}>
              <Info size={64} style={{ color: 'var(--muted)', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Children Found</h3>
              <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
                You need to register a child before uploading proof of payment.
              </p>
              <button
                onClick={() => router.push('/dashboard/parent/register-child')}
                className="btn btnPrimary"
              >
                Register a Child
              </button>
            </div>
          ) : (
            <div className="card" style={{ padding: 24 }}>
              <POPUploadForm
                linkedChildren={children}
                defaultChildId={defaultChildId}
                defaultAmount={defaultAmount}
                defaultDescription={defaultDescription}
                defaultFeeId={defaultFeeId}
                defaultPaymentForMonth={defaultPaymentForMonth}
                onSuccess={() => router.push('/dashboard/parent/payments/pop-history')}
                onCancel={() => router.push('/dashboard/parent/payments')}
              />
            </div>
          )}
        </div>
      </div>
    </ParentShell>
  );
}

export default function POPUploadPage() {
  return (
    <Suspense
      fallback={
        <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <POPUploadContent />
    </Suspense>
  );
}
