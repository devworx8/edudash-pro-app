'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';

type AttendanceLifecyclePolicy = {
  enabled: boolean;
  trigger_absent_days: number;
  grace_days: number;
  require_principal_approval: boolean;
  billing_behavior: string;
  auto_unassign_class_on_inactive: boolean;
  notify_channels: {
    push: boolean;
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
};

type InactivityCase = {
  id: string;
  student_id: string;
  case_state: 'at_risk' | 'resolved' | 'inactive' | 'dismissed';
  trigger_absence_streak: number;
  warning_deadline_at: string | null;
  auto_inactivated_at: string | null;
  updated_at: string;
  students?: {
    first_name?: string | null;
    last_name?: string | null;
    parent_id?: string | null;
    guardian_id?: string | null;
    classes?: { name?: string | null } | null;
  } | null;
};

const DEFAULT_POLICY: AttendanceLifecyclePolicy = {
  enabled: true,
  trigger_absent_days: 5,
  grace_days: 7,
  require_principal_approval: false,
  billing_behavior: 'stop_new_fees_keep_debt',
  auto_unassign_class_on_inactive: true,
  notify_channels: {
    push: true,
    email: false,
    sms: false,
    whatsapp: false,
  },
};

export default function LearnerActivityControlPage() {
  const router = useRouter();
  const supabase = createClient();
  const db = supabase as any;

  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [policy, setPolicy] = useState<AttendanceLifecyclePolicy>(DEFAULT_POLICY);
  const [cases, setCases] = useState<InactivityCase[]>([]);
  const [mismatchCount, setMismatchCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [reportDate, setReportDate] = useState<string | null>(null);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  const atRiskCases = useMemo(() => cases.filter((item) => item.case_state === 'at_risk'), [cases]);
  const dueTodayCases = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return atRiskCases.filter((item) => {
      if (!item.warning_deadline_at) return false;
      return new Date(item.warning_deadline_at).toISOString().slice(0, 10) <= today;
    });
  }, [atRiskCases]);
  const recentlyInactivatedCases = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return cases.filter((item) => {
      if (item.case_state !== 'inactive') return false;
      const at = item.auto_inactivated_at || item.updated_at;
      if (!at) return false;
      const time = new Date(at).getTime();
      return Number.isFinite(time) && time >= cutoff;
    });
  }, [cases]);

  const loadData = useCallback(async () => {
    if (!preschoolId) return;

    setLoading(true);
    try {
      const [policyRes, casesRes, reportRes] = await Promise.all([
        db.rpc('get_attendance_lifecycle_policy', { p_preschool_id: preschoolId }),
        db
          .from('student_inactivity_cases')
          .select(`
            id,
            student_id,
            case_state,
            trigger_absence_streak,
            warning_deadline_at,
            auto_inactivated_at,
            updated_at,
            students:student_id(first_name, last_name, parent_id, guardian_id, classes(name))
          `)
          .eq('preschool_id', preschoolId)
          .order('updated_at', { ascending: false })
          .limit(150),
        db
          .from('student_data_quality_daily_reports')
          .select('report_date, mismatch_count, duplicate_group_count')
          .eq('preschool_id', preschoolId)
          .order('report_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!policyRes.error && policyRes.data) {
        setPolicy({ ...DEFAULT_POLICY, ...policyRes.data });
      }

      if (!casesRes.error) {
        setCases((casesRes.data || []) as InactivityCase[]);
      }

      if (!reportRes.error && reportRes.data) {
        setMismatchCount(Number(reportRes.data.mismatch_count || 0));
        setDuplicateCount(Number(reportRes.data.duplicate_group_count || 0));
        setReportDate(reportRes.data.report_date || null);
      }
    } finally {
      setLoading(false);
    }
  }, [db, preschoolId]);

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    void initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (!preschoolId) return;
    void loadData();
  }, [loadData, preschoolId]);

  const savePolicy = useCallback(async () => {
    if (!preschoolId) return;
    setSaving(true);
    try {
      const { error } = await db.rpc('update_school_settings', {
        p_preschool_id: preschoolId,
        p_patch: {
          attendanceLifecycle: policy,
        },
      });
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Failed to save policy', error);
      alert(error instanceof Error ? error.message : 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  }, [db, loadData, policy, preschoolId]);

  const runNow = useCallback(async () => {
    if (!preschoolId) return;
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('student-activity-monitor', {
        body: { preschool_id: preschoolId, source: 'web_principal' },
      });
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Failed to run monitor now', error);
      alert(error instanceof Error ? error.message : 'Failed to run monitor now');
    } finally {
      setRunning(false);
    }
  }, [loadData, preschoolId, supabase.functions]);

  const applyAction = useCallback(
    async (caseId: string, action: 'contacted' | 'extend_grace' | 'keep_active' | 'force_inactivate' | 'dismiss') => {
      try {
        const { error } = await db.rpc('apply_student_inactivity_action', {
          p_case_id: caseId,
          p_action: action,
          p_notes: action === 'extend_grace' ? 'Extended from web principal control' : null,
          p_extend_days: action === 'extend_grace' ? 7 : null,
        });
        if (error) throw error;
        await loadData();
      } catch (error) {
        console.error(`Failed to apply action ${action}`, error);
        alert(error instanceof Error ? error.message : 'Failed to apply action');
      }
    },
    [db, loadData]
  );

  const notifyAtRiskParents = useCallback(async () => {
    if (!preschoolId) return;
    const parentIds = Array.from(
      new Set(
        atRiskCases
          .map((item) => item.students?.parent_id || item.students?.guardian_id)
          .filter(Boolean) as string[]
      )
    );

    if (!parentIds.length) {
      alert('No at-risk parent recipients found.');
      return;
    }

    setBroadcasting(true);
    try {
      const { error } = await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'student_inactivity_warning',
          preschool_id: preschoolId,
          user_ids: parentIds,
          context: {
            source: 'web_bulk_at_risk_broadcast',
          },
          send_immediately: true,
        },
      });
      if (error) throw error;
      alert(`Broadcast sent to ${parentIds.length} parent accounts.`);
    } catch (error) {
      console.error('Failed to notify at-risk parents', error);
      alert(error instanceof Error ? error.message : 'Failed to notify at-risk parents');
    } finally {
      setBroadcasting(false);
    }
  }, [atRiskCases, preschoolId, supabase.functions]);

  const renderCaseCard = (item: InactivityCase) => {
    const name = `${item.students?.first_name || ''} ${item.students?.last_name || ''}`.trim() || 'Learner';
    const className = item.students?.classes?.name || 'Unassigned';
    return (
      <div key={item.id} className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{name}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Class: {className}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              Streak: {item.trigger_absence_streak} • Deadline:{' '}
              {item.warning_deadline_at ? new Date(item.warning_deadline_at).toLocaleDateString() : '—'}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', maxWidth: 370 }}>
            <button className="btn" onClick={() => void applyAction(item.id, 'contacted')}>Contacted</button>
            <button className="btn" onClick={() => void applyAction(item.id, 'extend_grace')}>Extend</button>
            <button className="btn" onClick={() => void applyAction(item.id, 'keep_active')}>Keep active</button>
            <button className="btn" onClick={() => router.push(`/dashboard/principal/students`)}>Move/Reassign</button>
            <button className="btn btnDanger" onClick={() => void applyAction(item.id, 'force_inactivate')}>Inactivate</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <PrincipalShell
      tenantSlug={tenantSlug}
      preschoolName={preschoolName}
      preschoolId={preschoolId}
      hideRightSidebar={true}
    >
      <div className="section">
        <h1 className="h1">Learner Activity Control</h1>

        {loading ? (
          <div className="card">Loading learner activity lifecycle...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
              <div className="card tile"><div className="metricValue">{atRiskCases.length}</div><div className="metricLabel">At-risk</div></div>
              <div className="card tile"><div className="metricValue">{dueTodayCases.length}</div><div className="metricLabel">Due today</div></div>
              <div className="card tile"><div className="metricValue">{recentlyInactivatedCases.length}</div><div className="metricLabel">Recently inactive</div></div>
              <div className="card tile"><div className="metricValue">{mismatchCount}</div><div className="metricLabel">Status mismatches</div></div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <button className="btn btnPrimary" disabled={running} onClick={() => void runNow()}>
                  {running ? 'Running...' : 'Run monitor now'}
                </button>
                <button className="btn" disabled={broadcasting} onClick={() => void notifyAtRiskParents()}>
                  {broadcasting ? 'Sending...' : 'Message all at-risk parents'}
                </button>
              </div>
              <h3 style={{ marginBottom: 12 }}>Policy</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Automation enabled</span>
                  <input type="checkbox" checked={policy.enabled} onChange={(e) => setPolicy((prev) => ({ ...prev, enabled: e.target.checked }))} />
                </label>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Trigger absences</span>
                  <input
                    type="number"
                    min={1}
                    value={policy.trigger_absent_days}
                    onChange={(e) => setPolicy((prev) => ({ ...prev, trigger_absent_days: Math.max(1, Number(e.target.value || 1)) }))}
                    style={{ width: 90 }}
                  />
                </label>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Grace days</span>
                  <input
                    type="number"
                    min={1}
                    value={policy.grace_days}
                    onChange={(e) => setPolicy((prev) => ({ ...prev, grace_days: Math.max(1, Number(e.target.value || 1)) }))}
                    style={{ width: 90 }}
                  />
                </label>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Require principal approval</span>
                  <input
                    type="checkbox"
                    checked={policy.require_principal_approval}
                    onChange={(e) => setPolicy((prev) => ({ ...prev, require_principal_approval: e.target.checked }))}
                  />
                </label>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Auto-unassign class on inactive</span>
                  <input
                    type="checkbox"
                    checked={policy.auto_unassign_class_on_inactive}
                    onChange={(e) => setPolicy((prev) => ({ ...prev, auto_unassign_class_on_inactive: e.target.checked }))}
                  />
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(['push', 'email', 'sms', 'whatsapp'] as const).map((channel) => (
                    <label key={channel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(policy.notify_channels?.[channel])}
                        onChange={(e) =>
                          setPolicy((prev) => ({
                            ...prev,
                            notify_channels: {
                              ...prev.notify_channels,
                              [channel]: e.target.checked,
                            },
                          }))
                        }
                      />
                      <span>{channel.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button className="btn btnPrimary" style={{ marginTop: 14 }} onClick={() => void savePolicy()} disabled={saving}>
                {saving ? 'Saving...' : 'Save policy'}
              </button>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 10 }}>At-risk queue ({atRiskCases.length})</h3>
              {atRiskCases.length === 0 ? <p style={{ color: 'var(--muted)' }}>No at-risk learners.</p> : atRiskCases.map(renderCaseCard)}
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 10 }}>Due today ({dueTodayCases.length})</h3>
              {dueTodayCases.length === 0 ? <p style={{ color: 'var(--muted)' }}>Nothing due today.</p> : dueTodayCases.map(renderCaseCard)}
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 10 }}>Recently inactivated ({recentlyInactivatedCases.length})</h3>
              {recentlyInactivatedCases.length === 0 ? <p style={{ color: 'var(--muted)' }}>No recent inactive learners.</p> : recentlyInactivatedCases.map(renderCaseCard)}
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 10 }}>Duplicate and mismatch queue</h3>
              <p>Duplicate groups: <strong>{duplicateCount}</strong></p>
              <p>Status mismatches: <strong>{mismatchCount}</strong></p>
              <p style={{ color: 'var(--muted)' }}>Last daily report: {reportDate || 'No report yet'}</p>
            </div>
          </>
        )}
      </div>
    </PrincipalShell>
  );
}
