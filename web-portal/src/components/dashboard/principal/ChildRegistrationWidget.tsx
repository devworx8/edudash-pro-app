'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, XCircle, Clock, User, Baby } from 'lucide-react';

interface ChildRegistration {
  id: string;
  parent_email: string;
  parent_name: string;
  child_first_name: string;
  child_last_name: string;
  child_birth_date: string;
  child_gender: string | null;
  requested_date: string;
  parent_id: string;
}

interface ChildRegistrationWidgetProps {
  preschoolId?: string;
  userId?: string;
}

export function ChildRegistrationWidget({ preschoolId, userId }: ChildRegistrationWidgetProps) {
  const [requests, setRequests] = useState<ChildRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!preschoolId || !userId) {
      setLoading(false);
      return;
    }

    const loadRequests = async () => {
      // Role-based access: Only principal/admin can view registrations
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (!profile || !['principal', 'admin', 'superadmin'].includes(profile.role)) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Check if this is a platform school (Community or Main)
        const COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
        const MAIN_SCHOOL_ID = '00000000-0000-0000-0000-000000000003';
        const isPlatformSchool = preschoolId === COMMUNITY_SCHOOL_ID || preschoolId === MAIN_SCHOOL_ID;
        
        // Platform schools (admin) see ALL platform registrations
        // Regular schools only see their own
        let query = supabase
          .from('registration_requests')
          .select(`
            id,
            guardian_email,
            guardian_name,
            student_first_name,
            student_last_name,
            student_dob,
            student_gender,
            created_at,
            organization_id
          `)
          .eq('status', 'pending');
        
        if (isPlatformSchool) {
          // Admin sees requests for BOTH Community School and Main School
          query = query.in('organization_id', [COMMUNITY_SCHOOL_ID, MAIN_SCHOOL_ID]);
        } else {
          // Regular schools only see their own requests
          query = query.eq('organization_id', preschoolId);
        }
        
        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(10); // Increased limit for platform admins

        if (error) {
          // If table doesn't exist (code 42P01) or column doesn't exist (code 42703), silently skip
          // This is expected - registration_requests is in EduSitePro, not EduDashPro
          if (error.code === '42P01' || error.code === '42703' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
            // registration_requests table not in EduDashPro — expected
            setRequests([]);
            setLoading(false);
            return;
          }
          throw error;
        }

        // Format the data to match the old interface
        const mapped: ChildRegistration[] = (data || []).map((r: any) => ({
          id: r.id,
          parent_id: r.guardian_email, // Use email as identifier since we don't have parent_id yet
          parent_email: r.guardian_email,
          parent_name: r.guardian_name,
          child_first_name: r.student_first_name,
          child_last_name: r.student_last_name,
          child_birth_date: r.student_dob,
          child_gender: r.student_gender,
          requested_date: new Date(r.created_at).toLocaleDateString('en-ZA', {
            day: '2-digit',
            month: 'short',
          }),
        }));

        setRequests(mapped);
      } catch (error) {
        // Registration load failed — user sees empty state
      } finally {
        setLoading(false);
      }
    };

    loadRequests();
  }, [preschoolId, supabase]);

  const handleApprove = async (requestId: string, childFirstName: string, childLastName: string) => {
    if (!userId || !preschoolId) return;
    setProcessingId(requestId);

    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) throw new Error('Request not found');

      // This registration came from EduSitePro website - we need to call the sync Edge Function
      // to create the parent account and student record
      const { data, error } = await supabase.functions.invoke('sync-registration-to-edudash', {
        body: { registration_id: requestId },
      });

      if (error) throw error;

      // Update local status
      const { error: updateError } = await supabase
        .from('registration_requests')
        .update({
          status: 'approved',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== requestId));
      
      alert(`✅ ${childFirstName} ${childLastName} has been enrolled!\n\nA parent account has been created and the student is now active.`);
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'Failed to approve registration'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string, childName: string) => {
    if (!userId) return;
    const reason = prompt(`Why are you rejecting ${childName}'s registration?`);
    
    setProcessingId(requestId);

    try {
      const { error } = await supabase
        .from('registration_requests')
        .update({
          status: 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== requestId));
      alert(`❌ Registration rejected${reason ? `: ${reason}` : ''}`);
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'Failed to reject registration'}`);
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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Child Registration Requests</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {requests.length} pending enrollment
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
        {requests.map(request => {
          const age = request.child_birth_date 
            ? Math.floor((Date.now() - new Date(request.child_birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : null;
          
          return (
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
                  <Baby size={14} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {request.child_first_name} {request.child_last_name}
                  </span>
                  {age && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      (Age {age})
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 20, marginBottom: 4 }}>
                  <User size={12} style={{ color: 'var(--muted)' }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Parent: {request.parent_name}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 20 }}>
                  {request.parent_email}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, marginLeft: 20 }}>
                  <Clock size={11} style={{ color: 'var(--muted)' }} />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Requested {request.requested_date}
                  </span>
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
                  onClick={() => handleReject(request.id, `${request.child_first_name} ${request.child_last_name}`)}
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
                  onClick={() => handleApprove(request.id, request.child_first_name, request.child_last_name)}
                  disabled={processingId === request.id}
                >
                  <CheckCircle size={14} style={{ marginRight: 4 }} />
                  Enroll Student
                </button>
              </div>
            </div>
          );
        })}
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
        <span>Approving will create a new student record and link them to their parent automatically.</span>
      </div>
    </div>
  );
}
