'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { ShieldCheck, AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';

interface ComplianceCheck {
  id: string;
  check_name: string;
  category: string;
  status: string;
  last_checked_at: string | null;
  next_due_date: string | null;
  notes: string | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  health_safety: '🏥',
  fire_safety: '🔥',
  hygiene: '🧼',
  documentation: '📋',
  staff_qualifications: '🎓',
  facility: '🏫',
  nutrition: '🍎',
  safeguarding: '🛡️',
  curriculum: '📚',
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  compliant: { color: '#065f46', bg: '#d1fae5', label: 'Compliant' },
  non_compliant: { color: '#991b1b', bg: '#fee2e2', label: 'Non-Compliant' },
  pending_review: { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
  expired: { color: '#6b7280', bg: '#f3f4f6', label: 'Expired' },
  not_checked: { color: '#4338ca', bg: '#e0e7ff', label: 'Not Checked' },
};

export default function CompliancePage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
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

  const fetchChecks = useCallback(async () => {
    if (!preschoolId) return;
    const { data } = await supabase
      .from('school_compliance_checks')
      .select('*')
      .eq('school_id', preschoolId)
      .order('category')
      .order('check_name');
    setChecks((data as ComplianceCheck[]) || []);
    setLoading(false);
  }, [preschoolId, supabase]);

  useEffect(() => { fetchChecks(); }, [fetchChecks]);

  const compliantCount = checks.filter((c) => c.status === 'compliant').length;
  const total = checks.length;
  const score = total > 0 ? Math.round((compliantCount / total) * 100) : 0;
  const overdueCount = checks.filter(
    (c) => c.next_due_date && new Date(c.next_due_date) < new Date() && c.status !== 'compliant'
  ).length;

  const categories = [...new Set(checks.map((c) => c.category))];

  return (
    <PrincipalShell tenantSlug={tenantSlug} userEmail={profile?.email} userName={profile?.firstName} preschoolName={profile?.preschoolName}>
      <div style={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 className="h1">Compliance Dashboard</h1>
          <button className="qa" onClick={fetchChecks} style={{ gap: 4 }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Score Overview */}
        <div className="grid2" style={{ marginBottom: 20 }}>
          <div className="card" style={{ padding: 20, textAlign: 'center' }}>
            <ShieldCheck size={32} color="var(--primary)" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 32, fontWeight: 700, color: score >= 80 ? '#065f46' : score >= 50 ? '#92400e' : '#991b1b' }}>{score}%</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Compliance Score</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{compliantCount} / {total} checks passed</div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                  <CheckCircle size={16} color="#059669" /> Compliant
                </span>
                <strong>{compliantCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                  <AlertTriangle size={16} color="#dc2626" /> Overdue
                </span>
                <strong style={{ color: overdueCount > 0 ? '#dc2626' : undefined }}>{overdueCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                  <Clock size={16} color="#d97706" /> Pending
                </span>
                <strong>{checks.filter((c) => c.status === 'pending_review').length}</strong>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</p>
        ) : checks.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <ShieldCheck size={40} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600 }}>No compliance checks configured</p>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Set up your compliance checklist</p>
          </div>
        ) : (
          categories.map((cat) => {
            const catChecks = checks.filter((c) => c.category === cat);
            const icon = CATEGORY_ICONS[cat] || '📌';
            return (
              <div key={cat} style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{icon}</span>
                  {cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {catChecks.map((check) => {
                    const s = STATUS_CONFIG[check.status] || STATUS_CONFIG.not_checked;
                    const overdue = check.next_due_date && new Date(check.next_due_date) < new Date() && check.status !== 'compliant';
                    return (
                      <div key={check.id} className="card" style={{ padding: 14, borderLeft: overdue ? '3px solid #dc2626' : undefined }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500 }}>{check.check_name}</span>
                          <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                            {s.label}
                          </span>
                        </div>
                        {check.next_due_date && (
                          <div style={{ fontSize: 12, color: overdue ? '#dc2626' : 'var(--muted)', marginTop: 4 }}>
                            {overdue ? '⚠️ Overdue — ' : 'Due: '}
                            {new Date(check.next_due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </PrincipalShell>
  );
}
