'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { POPHistoryList } from '@/components/dashboard/parent/POPHistoryList';
import { History, ArrowLeft, Plus } from 'lucide-react';

export default function POPHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  
  const {
    userName,
    preschoolName,
    hasOrganization,
    tenantSlug,
    profile,
  } = useParentDashboardData();

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
          title="Payment Upload History"
          subtitle="View your submitted proof of payment documents and their status"
          icon={<History size={28} color="white" />}
        />
        
        <div style={{ width: '100%', padding: '20px' }}>
          {/* Navigation */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12, 
            marginBottom: 24 
          }}>
            <button
              onClick={() => router.push('/dashboard/parent/payments')}
              className="btn btnSecondary"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <ArrowLeft size={16} />
              Back to Payments
            </button>
            <button
              onClick={() => router.push('/dashboard/parent/payments/pop-upload')}
              className="btn btnPrimary"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Plus size={16} />
              New Upload
            </button>
          </div>

          {/* Status Legend */}
          <div className="card" style={{ padding: 16, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Status Guide</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ 
                  width: 12, 
                  height: 12, 
                  borderRadius: '50%', 
                  background: '#f59e0b' 
                }} />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Pending - Awaiting review</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ 
                  width: 12, 
                  height: 12, 
                  borderRadius: '50%', 
                  background: '#22c55e' 
                }} />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Approved - Payment verified</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ 
                  width: 12, 
                  height: 12, 
                  borderRadius: '50%', 
                  background: '#ef4444' 
                }} />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Rejected - See notes</span>
              </div>
            </div>
          </div>

          {/* History List */}
          {userId && <POPHistoryList userId={userId} />}
        </div>
      </div>
    </ParentShell>
  );
}
