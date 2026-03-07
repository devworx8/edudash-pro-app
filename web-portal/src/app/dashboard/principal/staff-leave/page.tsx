'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { CheckCircle, XCircle, Clock, Plus, Calendar } from 'lucide-react';

interface LeaveRequest {
  id: string;
  staff_id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
  approved: { bg: '#d1fae5', text: '#065f46', label: 'Approved' },
  rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
  cancelled: { bg: '#f3f4f6', text: '#6b7280', label: 'Cancelled' },
};

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', family_responsibility: 'Family',
  maternity: 'Maternity', unpaid: 'Unpaid', study: 'Study',
  compassionate: 'Compassionate', other: 'Other',
};

export default function StaffLeavePage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

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

  const fetchRequests = useCallback(async () => {
    if (!preschoolId) return;
    const { data } = await supabase
      .from('staff_leave_requests')
      .select('*')
      .eq('school_id', preschoolId)
      .order('created_at', { ascending: false });
    setRequests((data as LeaveRequest[]) || []);
    setLoading(false);
  }, [preschoolId, supabase]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    await supabase
      .from('staff_leave_requests')
      .update({ status: action, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    fetchRequests();
  };

  const filtered = filter === 'pending' ? requests.filter((r) => r.status === 'pending') : requests;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <PrincipalShell tenantSlug={tenantSlug} userEmail={profile?.email} userName={profile?.firstName} preschoolName={profile?.preschoolName}>
      <div style={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 className="h1">Staff Leave</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Review and manage leave requests</p>
          </div>
          <button className="qa" style={{ background: 'var(--primary)', color: 'white', border: 'none', gap: 6 }}>
            <Plus size={16} /> New Request
          </button>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['pending', 'all'] as const).map((tab) => (
            <button
              key={tab}
              className="qa"
              onClick={() => setFilter(tab)}
              style={{
                background: filter === tab ? 'var(--primary)' : undefined,
                color: filter === tab ? 'white' : undefined,
                border: filter === tab ? 'none' : undefined,
              }}
            >
              {tab === 'pending' ? `Pending (${pendingCount})` : 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Calendar size={40} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600 }}>No leave requests</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((req) => {
              const s = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
              return (
                <div key={req.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ background: s.bg, color: s.text, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                      {s.label}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>{req.days_requested}d</span>
                  </div>
                  <div style={{ fontWeight: 600 }}>{LEAVE_LABELS[req.leave_type] || req.leave_type} Leave</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {new Date(req.start_date).toLocaleDateString()} – {new Date(req.end_date).toLocaleDateString()}
                  </div>
                  {req.reason && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>{req.reason}</div>}
                  {req.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => handleAction(req.id, 'approved')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#10b981', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button onClick={() => handleAction(req.id, 'rejected')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ef4444', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
