'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Calendar, Filter } from 'lucide-react';
import { useWeeklyPlans } from '@/hooks/principal/useWeeklyPlans';
import { WeeklyPlanCard } from '@/components/ecd-planning/WeeklyPlanCard';
import { WeeklyPlanDetails } from '@/components/ecd-planning/WeeklyPlanDetails';
import type { WeeklyPlan } from '@/types/ecd-planning';

export default function WeeklyPlansPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<WeeklyPlan | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'submitted' | 'approved' | 'published'>('all');

  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const { plans, loading: plansLoading, approvePlan, rejectPlan } = useWeeklyPlans(preschoolId);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  const filteredPlans = plans.filter((plan) => {
    if (statusFilter === 'all') return true;
    return plan.status === statusFilter;
  });

  const handleApprove = async (id: string) => {
    try {
      await approvePlan(id);
      setSelectedPlan(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Request revisions (reason required):');
    const trimmed = (reason || '').trim();
    if (!trimmed) return;
    try {
      await rejectPlan(id, trimmed);
      setSelectedPlan(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const pendingCount = plans.filter((p) => p.status === 'submitted').length;
  const approvedCount = plans.filter((p) => p.status === 'approved' || p.status === 'published').length;

  if (loading) {
    return (
      <PrincipalShell>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p>Loading...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 className="h1">Weekly Plans</h1>
            <p className="text-muted">Review and approve teacher weekly plans</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="card tile">
            <div className="metricValue">{plans.length}</div>
            <div className="metricLabel">Total Plans</div>
          </div>
          <div className="card tile" style={{ border: pendingCount > 0 ? '2px solid #f59e0b' : undefined }}>
            <div className="metricValue" style={{ color: pendingCount > 0 ? '#f59e0b' : undefined }}>
              {pendingCount}
            </div>
            <div className="metricLabel">Pending Approval</div>
          </div>
          <div className="card tile">
            <div className="metricValue" style={{ color: '#10b981' }}>{approvedCount}</div>
            <div className="metricLabel">Approved</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Filter size={18} style={{ color: 'var(--muted)' }} />
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{ width: 'auto' }}
            >
              <option value="all">All Plans</option>
              <option value="submitted">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </div>
        </div>

        {plansLoading ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <p>Loading plans...</p>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <Calendar size={48} style={{ color: 'var(--muted)', marginBottom: 16 }} />
            <h3 style={{ marginBottom: 8 }}>
              {statusFilter === 'all' ? 'No Weekly Plans' : `No ${statusFilter} Plans`}
            </h3>
            <p style={{ color: 'var(--muted)' }}>
              {statusFilter === 'submitted'
                ? 'No plans pending approval'
                : 'Teachers can create weekly plans for your review'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {filteredPlans.map((plan) => (
              <WeeklyPlanCard
                key={plan.id}
                plan={plan}
                onView={setSelectedPlan}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        )}

        {selectedPlan && (
          <WeeklyPlanDetails
            plan={selectedPlan}
            onClose={() => setSelectedPlan(null)}
            onApprove={selectedPlan.status === 'submitted' ? handleApprove : undefined}
            onReject={selectedPlan.status === 'submitted' ? handleReject : undefined}
          />
        )}
      </div>
    </PrincipalShell>
  );
}
