'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { CheckCircle, X, Clock, FileText, Loader2 } from 'lucide-react';

interface LessonApproval {
  id: string;
  lesson_id: string;
  preschool_id: string;
  submitted_by: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  rejection_reason: string | null;
  review_notes: string | null;
  submitted_at: string;
  lesson?: {
    id: string;
    title: string;
    description: string | null;
    subject: string;
    teacher_id: string;
    teacher?: {
      first_name: string;
      last_name: string;
    };
  };
}

export default function LessonApprovalsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [approvals, setApprovals] = useState<LessonApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setAuthLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (!preschoolId) return;

    const loadApprovals = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('lesson_approvals')
          .select(`
            *,
            lesson:lessons(
              id,
              title,
              description,
              subject,
              teacher_id,
              teacher:profiles(first_name, last_name)
            )
          `)
          .eq('preschool_id', preschoolId)
          .order('submitted_at', { ascending: false });

        if (filter !== 'all') {
          query = query.eq('status', filter);
        }

        const { data, error } = await query;

        if (error) throw error;
        setApprovals((data || []) as LessonApproval[]);
      } catch (error) {
        console.error('Error loading approvals:', error);
      } finally {
        setLoading(false);
      }
    };

    loadApprovals();
  }, [preschoolId, filter, supabase]);

  const handleApprove = async (approvalId: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('lesson_approvals')
        .update({
          status: 'approved',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', approvalId);

      if (error) throw error;

      // Update lesson status to active
      const approval = approvals.find(a => a.id === approvalId);
      if (approval?.lesson_id) {
        await supabase
          .from('lessons')
          .update({ status: 'active' })
          .eq('id', approval.lesson_id);
      }

      setApprovals(approvals.map(a => 
        a.id === approvalId 
          ? { ...a, status: 'approved' as const, reviewed_by: userId, reviewed_at: new Date().toISOString() }
          : a
      ));
    } catch (error) {
      console.error('Error approving lesson:', error);
      alert('Failed to approve lesson');
    }
  };

  const handleReject = async (approvalId: string, reason: string) => {
    if (!userId || !reason.trim()) return;

    try {
      const { error } = await supabase
        .from('lesson_approvals')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', approvalId);

      if (error) throw error;

      setApprovals(approvals.map(a => 
        a.id === approvalId 
          ? { ...a, status: 'rejected' as const, rejection_reason: reason, reviewed_by: userId, reviewed_at: new Date().toISOString() }
          : a
      ));
    } catch (error) {
      console.error('Error rejecting lesson:', error);
      alert('Failed to reject lesson');
    }
  };

  if (authLoading || profileLoading) {
    return (
      <PrincipalShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={profile?.firstName}
        preschoolName={profile?.preschoolName}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading...</p>
        </div>
      </PrincipalShell>
    );
  }

  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  return (
    <PrincipalShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
    >
      <div className="container">
        <h1 className="h1">Lesson Approvals</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Review and approve lesson plans submitted by teachers
        </p>

        {/* Filter Tabs */}
        <div className="section">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
              <button
                key={f}
                className={`btn ${filter === f ? 'btnPrimary' : ''}`}
                onClick={() => setFilter(f)}
                style={{ textTransform: 'capitalize' }}
              >
                {f} {f === 'pending' && pendingApprovals.length > 0 && `(${pendingApprovals.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Approvals List */}
        <div className="section">
          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <Loader2 className="animate-spin mx-auto mb-4" size={32} />
              <p className="text-slate-400">Loading...</p>
            </div>
          ) : approvals.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 style={{ marginBottom: 8 }}>No Lessons to Review</h3>
              <p style={{ color: 'var(--muted)' }}>
                {filter === 'pending' 
                  ? 'All lessons have been reviewed'
                  : 'No lessons match the selected filter'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {approvals.map((approval) => (
                <LessonApprovalCard
                  key={approval.id}
                  approval={approval}
                  onApprove={() => handleApprove(approval.id)}
                  onReject={(reason) => handleReject(approval.id, reason)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PrincipalShell>
  );
}

function LessonApprovalCard({
  approval,
  onApprove,
  onReject,
}: {
  approval: LessonApproval;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const lesson = approval.lesson;
  const teacher = lesson?.teacher;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600 }}>
            {lesson?.title || 'Untitled Lesson'}
          </h3>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            {teacher && (
              <span>Teacher: {teacher.first_name} {teacher.last_name}</span>
            )}
            {lesson?.subject && (
              <span>Subject: {lesson.subject}</span>
            )}
            <span>Submitted: {new Date(approval.submitted_at).toLocaleDateString('en-ZA')}</span>
          </div>
          {lesson?.description && (
            <p style={{ color: 'var(--muted)', marginBottom: 12 }}>{lesson.description}</p>
          )}
          {approval.status === 'rejected' && approval.rejection_reason && (
            <div style={{ padding: 12, borderRadius: 8, background: '#fee2e2', marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>
                <strong>Rejection Reason:</strong> {approval.rejection_reason}
              </p>
            </div>
          )}
        </div>
        <div>
          {approval.status === 'pending' ? (
            <span style={{
              padding: '4px 12px',
              borderRadius: 12,
              background: '#fef3c7',
              color: '#d97706',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <Clock size={14} />
              Pending
            </span>
          ) : approval.status === 'approved' ? (
            <span style={{
              padding: '4px 12px',
              borderRadius: 12,
              background: '#d1fae5',
              color: '#059669',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <CheckCircle size={14} />
              Approved
            </span>
          ) : (
            <span style={{
              padding: '4px 12px',
              borderRadius: 12,
              background: '#fee2e2',
              color: '#dc2626',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <X size={14} />
              Rejected
            </span>
          )}
        </div>
      </div>

      {approval.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {!showRejectForm ? (
            <>
              <button className="btn btnPrimary" onClick={onApprove} style={{ flex: 1 }}>
                <CheckCircle className="icon16" />
                Approve
              </button>
              <button className="btn" onClick={() => setShowRejectForm(true)} style={{ flex: 1 }}>
                <X className="icon16" />
                Reject
              </button>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                className="input"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={3}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectionReason('');
                  }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    if (rejectionReason.trim()) {
                      onReject(rejectionReason);
                      setShowRejectForm(false);
                      setRejectionReason('');
                    }
                  }}
                  style={{ flex: 1, background: '#dc2626', color: 'white' }}
                >
                  Submit Rejection
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
