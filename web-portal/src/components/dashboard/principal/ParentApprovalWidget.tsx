'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, XCircle, Clock, User } from 'lucide-react';

interface PendingRequest {
  id: string;
  parent_email: string;
  parent_name: string;
  child_name: string;
  relationship?: string;
  requested_date: string;
  student_id: string;
}

interface ParentApprovalWidgetProps {
  preschoolId?: string;
  userId?: string;
}

export function ParentApprovalWidget({ preschoolId, userId }: ParentApprovalWidgetProps) {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!preschoolId) return;

    const loadRequests = async () => {
      try {
        setLoading(true);
        
        // Fetch pending guardian requests
        const { data, error } = await supabase
          .from('guardian_requests')
          .select(`
            id,
            parent_auth_id,
            student_id,
            child_full_name,
            relationship,
            created_at,
            school_id
          `)
          .eq('school_id', preschoolId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;

        // Get parent emails and names - parent_auth_id is auth.users UUID
        const parentAuthIds = data?.map((r: any) => r.parent_auth_id) || [];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('auth_user_id, email, first_name, last_name')
          .in('auth_user_id', parentAuthIds);

        const profileMap = new Map<string, { email: string; name: string }>(
          profiles?.map((p: any) => [
            p.auth_user_id,
            {
              email: p.email || 'No email',
              name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Parent'
            }
          ])
        );

        const mapped: PendingRequest[] = (data || []).map((r: any) => ({
          id: r.id,
          parent_email: profileMap.get(r.parent_auth_id)?.email || 'No email',
          parent_name: profileMap.get(r.parent_auth_id)?.name || 'Parent',
          child_name: r.child_full_name || 'Child',
          relationship: r.relationship,
          requested_date: new Date(r.created_at).toLocaleDateString('en-ZA', {
            day: '2-digit',
            month: 'short',
          }),
          student_id: r.student_id,
        }));

        setRequests(mapped);
      } catch (_error) {
        // Parent requests load failed — user sees empty state
      } finally {
        setLoading(false);
      }
    };

    loadRequests();
  }, [preschoolId, supabase]);

  const handleApprove = async (requestId: string) => {
    if (!userId) return;
    setProcessingId(requestId);

    try {
      const { error } = await supabase
        .from('guardian_requests')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== requestId));
      alert('✅ Request approved successfully');
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'Failed to approve request'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!userId) return;
    const reason = prompt('Rejection reason (optional):');
    
    setProcessingId(requestId);

    try {
      const { error } = await supabase
        .from('guardian_requests')
        .update({
          status: 'rejected',
          rejected_by: userId,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason || undefined,
        })
        .eq('id', requestId);

      if (error) throw error;

      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== requestId));
      alert('❌ Request rejected');
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'Failed to reject request'}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
          Loading requests...
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Parent Link Requests</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {requests.length} pending approval
          </p>
        </div>
        <div style={{
          background: '#dc2626',
          color: 'white',
          borderRadius: 12,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 700,
        }}>
          {requests.length}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {requests.map(request => (
          <div
            key={request.id}
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'var(--card)',
              border: '1px solid var(--divider)',
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <User size={14} style={{ color: 'var(--muted)' }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{request.parent_name}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                {request.parent_email}
              </div>
              <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>
                → {request.child_name}
              </div>
              {request.relationship && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  as {request.relationship.charAt(0).toUpperCase() + request.relationship.slice(1)}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Clock size={11} style={{ color: 'var(--muted)' }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{request.requested_date}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  fontSize: 13,
                  border: '1px solid #dc2626',
                  color: '#dc2626',
                  background: 'transparent',
                }}
                onClick={() => handleReject(request.id)}
                disabled={processingId === request.id}
              >
                <XCircle size={14} style={{ marginRight: 4 }} />
                Reject
              </button>
              <button
                className="btn btnPrimary"
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  fontSize: 13,
                  background: '#059669',
                }}
                onClick={() => handleApprove(request.id)}
                disabled={processingId === request.id}
              >
                <CheckCircle size={14} style={{ marginRight: 4 }} />
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        background: '#3b82f615',
        border: '1px solid #3b82f6',
        display: 'flex',
        gap: 8,
        fontSize: 12,
        color: 'var(--text)',
      }}>
        <span>ℹ️</span>
        <span>Review each request carefully. Approved parents will gain access to their child's information.</span>
      </div>
    </div>
  );
}
