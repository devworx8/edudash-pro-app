'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import {
  UserPlus, CheckCircle2, XCircle, Clock, Shield, Eye, Filter,
  AlertTriangle, Search, RefreshCw, ChevronDown, Users, Briefcase,
} from 'lucide-react';

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type ScreeningStatus = 'not_screened' | 'recommended' | 'hold' | 'reject_recommended';
type FilterTab = 'all' | 'pending' | 'screened' | 'approved' | 'rejected';

interface JoinRequest {
  id: string;
  requester_id: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  request_type: string;
  requested_role: string | null;
  status: RequestStatus;
  screening_status: ScreeningStatus;
  screening_notes: string | null;
  screened_by: string | null;
  screened_at: string | null;
  principal_decision_required: boolean;
  invite_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  requester_profile?: {
    first_name: string;
    last_name: string;
    email: string;
    role: string;
  };
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  teacher_invite: '👩‍🏫 Teacher Invite',
  staff_invite: '👤 Staff Invite',
  parent_join: '👨‍👩‍👧 Parent Join',
  guardian_claim: '🛡️ Guardian Claim',
  learner_enroll: '🎓 Learner Enroll',
  member_join: '🤝 Member Join',
};

const SCREENING_BADGE: Record<ScreeningStatus, { label: string; bg: string; color: string }> = {
  not_screened: { label: 'Not Screened', bg: 'rgba(156,163,175,0.1)', color: '#9ca3af' },
  recommended: { label: 'Recommended', bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
  hold: { label: 'On Hold', bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  reject_recommended: { label: 'Reject Rec.', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
};

const STATUS_BADGE: Record<RequestStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  approved: { label: 'Approved', bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
  rejected: { label: 'Rejected', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  expired: { label: 'Expired', bg: 'rgba(156,163,175,0.1)', color: '#9ca3af' },
};

export default function JoinRequestsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const organizationId = profile?.organizationId;
  const orgId = organizationId || preschoolId;
  const userRole = profile?.role || '';

  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [screeningModal, setScreeningModal] = useState<JoinRequest | null>(null);
  const [screeningNotes, setScreeningNotes] = useState('');

  const isPrincipal = ['principal', 'principal_admin', 'super_admin'].includes(userRole.toLowerCase());

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
    };
    init();
  }, [supabase]);

  const loadRequests = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('join_requests')
        .select(`
          id, requester_id, requester_email, requester_phone, request_type,
          requested_role, status, screening_status, screening_notes,
          screened_by, screened_at, principal_decision_required,
          invite_code, notes, created_at, updated_at, reviewed_by, reviewed_at,
          requester_profile:profiles!join_requests_requester_id_fkey(first_name, last_name, email, role)
        `)
        .or(`organization_id.eq.${orgId},preschool_id.eq.${orgId}`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        const mapped = data.map((r: any) => ({
          ...r,
          requester_profile: Array.isArray(r.requester_profile)
            ? r.requester_profile[0]
            : r.requester_profile,
        }));
        setRequests(mapped);
      }
    } catch (err) {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId, supabase]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    let result = requests;

    // Tab filter
    if (activeTab === 'pending') result = result.filter((r) => r.status === 'pending');
    else if (activeTab === 'screened')
      result = result.filter(
        (r) => r.status === 'pending' && r.screening_status !== 'not_screened'
      );
    else if (activeTab === 'approved') result = result.filter((r) => r.status === 'approved');
    else if (activeTab === 'rejected') result = result.filter((r) => r.status === 'rejected');

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.requester_email?.toLowerCase().includes(q) ||
          r.requester_phone?.includes(q) ||
          r.requester_profile?.first_name?.toLowerCase().includes(q) ||
          r.requester_profile?.last_name?.toLowerCase().includes(q) ||
          r.request_type?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [requests, activeTab, searchQuery]);

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      screened: requests.filter(
        (r) => r.status === 'pending' && r.screening_status !== 'not_screened'
      ).length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    }),
    [requests]
  );

  const handleScreen = async (requestId: string, status: ScreeningStatus) => {
    setActionLoading(requestId);
    try {
      const { data, error } = await supabase.rpc('screen_join_request', {
        p_request_id: requestId,
        p_screening_status: status,
        p_notes: screeningNotes.trim() || null,
        p_checklist: { reviewed_at: new Date().toISOString(), source: 'web_dashboard' },
      });

      if (error) throw error;
      const result = typeof data === 'object' && data !== null ? data : {};
      if ((result as any).success) {
        setScreeningModal(null);
        setScreeningNotes('');
        await loadRequests();
      } else {
        alert((result as any).error || 'Screening failed');
      }
    } catch (err: any) {
      alert(err.message || 'Screening failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFinalDecision = async (requestId: string, decision: 'approved' | 'rejected') => {
    if (!isPrincipal) {
      alert('Only principals can make final decisions on hiring requests.');
      return;
    }
    if (!confirm(`Are you sure you want to ${decision === 'approved' ? 'approve' : 'reject'} this request?`)) return;

    setActionLoading(requestId);
    try {
      const { error } = await supabase
        .from('join_requests')
        .update({
          status: decision,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;
      await loadRequests();
    } catch (err: any) {
      alert(err.message || 'Decision failed');
    } finally {
      setActionLoading(null);
    }
  };

  const getRequesterName = (r: JoinRequest) => {
    if (r.requester_profile) {
      const name = `${r.requester_profile.first_name || ''} ${r.requester_profile.last_name || ''}`.trim();
      if (name) return name;
    }
    return r.requester_email || r.requester_phone || 'Unknown';
  };

  const getAgingHours = (createdAt: string) => {
    const hours = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'pending', label: `Pending (${counts.pending})` },
    { key: 'screened', label: `Screened (${counts.screened})` },
    { key: 'approved', label: `Approved (${counts.approved})` },
    { key: 'rejected', label: `Rejected (${counts.rejected})` },
  ];

  return (
    <PrincipalShell
      preschoolName={profile?.preschoolName}
      preschoolId={preschoolId}
      hideRightSidebar={true}
    >
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title="Join Requests"
          subtitle="Manage staff hiring, parent joins, and enrollment requests"
          icon={<UserPlus size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20, maxWidth: 1000, margin: '0 auto' }}>
          {/* Search & Actions Bar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, phone..."
                style={{
                  width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 14,
                }}
              />
            </div>
            <button
              onClick={loadRequests}
              style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)',
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: activeTab === tab.key ? 'var(--primary)' : 'var(--surface)',
                  color: activeTab === tab.key ? 'white' : 'var(--text)',
                  fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Request List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
              <p style={{ color: 'var(--muted)', marginTop: 16 }}>Loading join requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <UserPlus size={48} style={{ margin: '0 auto', color: 'var(--muted)', opacity: 0.4 }} />
              <h3 style={{ marginTop: 16 }}>No requests found</h3>
              <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>
                {activeTab === 'all' ? 'No join requests yet.' : `No ${activeTab} requests.`}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredRequests.map((request) => {
                const screeningBadge = SCREENING_BADGE[request.screening_status];
                const statusBadge = STATUS_BADGE[request.status];
                const isUrgent = Date.now() - new Date(request.created_at).getTime() > 72 * 3600000;
                const isHiring = ['teacher_invite', 'staff_invite'].includes(request.request_type);

                return (
                  <div
                    key={request.id}
                    className="card"
                    style={{
                      padding: 20,
                      borderLeft: `4px solid ${isUrgent ? '#ef4444' : isHiring ? '#8b5cf6' : '#3b82f6'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Name & type */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{getRequesterName(request)}</span>
                          {isUrgent && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>
                              ⏰ Urgent
                            </span>
                          )}
                        </div>

                        {/* Request type & role */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: 'rgba(124,58,237,0.1)', color: '#7c3aed', fontWeight: 600 }}>
                            {REQUEST_TYPE_LABELS[request.request_type] || request.request_type}
                          </span>
                          {request.requested_role && (
                            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 600 }}>
                              Role: {request.requested_role}
                            </span>
                          )}
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: statusBadge.bg, color: statusBadge.color, fontWeight: 600 }}>
                            {statusBadge.label}
                          </span>
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: screeningBadge.bg, color: screeningBadge.color, fontWeight: 600 }}>
                            {screeningBadge.label}
                          </span>
                        </div>

                        {/* Contact info */}
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                          {request.requester_email && <span>{request.requester_email}</span>}
                          {request.requester_phone && <span> · {request.requester_phone}</span>}
                        </div>

                        {/* Screening notes */}
                        {request.screening_notes && (
                          <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginTop: 6, padding: '6px 10px', background: 'var(--surface)', borderRadius: 8 }}>
                            📝 {request.screening_notes}
                          </div>
                        )}

                        {/* Principal decision badge */}
                        {request.principal_decision_required && request.status === 'pending' && request.screening_status !== 'not_screened' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                            <AlertTriangle size={14} /> Awaiting principal decision
                          </div>
                        )}
                      </div>

                      {/* Age & Actions */}
                      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 120 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                          {getAgingHours(request.created_at)}
                        </div>

                        {request.status === 'pending' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* Screening actions (admins and principals) */}
                            {request.screening_status === 'not_screened' && (
                              <button
                                onClick={() => { setScreeningModal(request); setScreeningNotes(''); }}
                                disabled={actionLoading === request.id}
                                style={{
                                  padding: '6px 14px', borderRadius: 8, border: 'none',
                                  background: 'var(--primary)', color: 'white', cursor: 'pointer',
                                  fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center',
                                  gap: 4, justifyContent: 'center',
                                }}
                              >
                                <Eye size={12} /> Screen
                              </button>
                            )}

                            {/* Final decisions (principals only) */}
                            {isPrincipal && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  onClick={() => handleFinalDecision(request.id, 'approved')}
                                  disabled={actionLoading === request.id}
                                  style={{
                                    flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none',
                                    background: 'rgba(16,185,129,0.1)', color: '#10b981', cursor: 'pointer',
                                    fontSize: 11, fontWeight: 600,
                                  }}
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  onClick={() => handleFinalDecision(request.id, 'rejected')}
                                  disabled={actionLoading === request.id}
                                  style={{
                                    flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none',
                                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer',
                                    fontSize: 11, fontWeight: 600,
                                  }}
                                >
                                  ✗ Reject
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Screening Modal */}
      {screeningModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setScreeningModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card)', borderRadius: 16, padding: 24,
              maxWidth: 500, width: '100%', maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>
              Screen Request
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
              Screening <strong>{getRequesterName(screeningModal)}</strong> —{' '}
              {REQUEST_TYPE_LABELS[screeningModal.request_type] || screeningModal.request_type}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Screening Notes (optional)
              </label>
              <textarea
                value={screeningNotes}
                onChange={(e) => setScreeningNotes(e.target.value)}
                placeholder="Add any notes about this request..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 14, resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => handleScreen(screeningModal.id, 'recommended')}
                disabled={actionLoading === screeningModal.id}
                style={{
                  padding: '12px 20px', borderRadius: 10, border: 'none',
                  background: '#10b981', color: 'white', cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center',
                  gap: 8, justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={16} /> Recommend for Approval
              </button>
              <button
                onClick={() => handleScreen(screeningModal.id, 'hold')}
                disabled={actionLoading === screeningModal.id}
                style={{
                  padding: '12px 20px', borderRadius: 10, border: 'none',
                  background: '#f59e0b', color: 'white', cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center',
                  gap: 8, justifyContent: 'center',
                }}
              >
                <Clock size={16} /> Put on Hold
              </button>
              <button
                onClick={() => handleScreen(screeningModal.id, 'reject_recommended')}
                disabled={actionLoading === screeningModal.id}
                style={{
                  padding: '12px 20px', borderRadius: 10, border: 'none',
                  background: '#ef4444', color: 'white', cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center',
                  gap: 8, justifyContent: 'center',
                }}
              >
                <XCircle size={16} /> Recommend Rejection
              </button>
              <button
                onClick={() => setScreeningModal(null)}
                style={{
                  padding: '12px 20px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
                  fontWeight: 600, fontSize: 14,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </PrincipalShell>
  );
}
