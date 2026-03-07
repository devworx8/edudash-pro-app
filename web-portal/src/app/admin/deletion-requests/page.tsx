'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface DeletionRequest {
  id: string;
  request_id: string;
  full_name: string;
  email: string;
  role: string;
  organization: string | null;
  deletion_types: string[];
  reason: string | null;
  status: 'pending' | 'verified' | 'processing' | 'completed' | 'cancelled';
  submitted_at: string;
  verified_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'rgba(255, 170, 0, 0.2)', text: '#ffaa00' },
  verified: { bg: 'rgba(0, 150, 255, 0.2)', text: '#0096ff' },
  processing: { bg: 'rgba(138, 43, 226, 0.2)', text: '#8a2be2' },
  completed: { bg: 'rgba(0, 255, 136, 0.2)', text: '#00ff88' },
  cancelled: { bg: 'rgba(255, 68, 68, 0.2)', text: '#ff4444' },
};

const deletionTypeLabels: Record<string, string> = {
  'full_account': 'Full Account',
  'voice_recordings': 'Voice Recordings',
  'ai_conversations': 'AI Conversations',
  'uploaded_files': 'Uploaded Files',
  'analytics_data': 'Analytics Data',
  'other': 'Other',
};

export default function DeletionRequestsAdminPage() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<DeletionRequest | null>(null);
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const supabase = createClient();

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('deletion_requests')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch requests');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string, notes?: string) => {
    try {
      setUpdating(true);
      const updateData: Record<string, unknown> = { status: newStatus };
      
      if (newStatus === 'verified') {
        updateData.verified_at = new Date().toISOString();
      } else if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }
      
      if (notes) {
        updateData.notes = notes;
      }

      const { error } = await supabase
        .from('deletion_requests')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      
      await fetchRequests();
      setSelectedRequest(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const filteredRequests = filter === 'all' 
    ? requests 
    : requests.filter(r => r.status === filter);

  const styles = {
    container: { minHeight: '100vh', background: '#0a0a0f', color: '#fff', padding: '24px' },
    header: { marginBottom: '32px' },
    title: { fontSize: '28px', fontWeight: 700, color: '#00f5ff', marginBottom: '8px' },
    subtitle: { color: '#9CA3AF', fontSize: '14px' },
    backLink: { color: '#00f5ff', textDecoration: 'none', fontSize: '14px', marginBottom: '16px', display: 'inline-block' },
    stats: { display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' as const },
    statCard: { background: '#1a1a24', padding: '16px 24px', borderRadius: '8px', minWidth: '120px' },
    statNumber: { fontSize: '24px', fontWeight: 700, color: '#00f5ff' },
    statLabel: { fontSize: '12px', color: '#9CA3AF', marginTop: '4px' },
    filters: { display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' as const },
    filterButton: { padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, background: '#1a1a24', borderRadius: '12px', overflow: 'hidden' },
    th: { padding: '16px', textAlign: 'left' as const, borderBottom: '1px solid #2a2a3a', color: '#9CA3AF', fontSize: '12px', textTransform: 'uppercase' as const },
    td: { padding: '16px', borderBottom: '1px solid #2a2a3a', fontSize: '14px' },
    badge: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 },
    modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { background: '#1a1a24', padding: '32px', borderRadius: '12px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' },
    modalTitle: { fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: '#00f5ff' },
    row: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #2a2a3a' },
    label: { color: '#9CA3AF', fontSize: '14px' },
    value: { color: '#fff', fontSize: '14px', textAlign: 'right' as const },
    actionButtons: { display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' as const },
    actionButton: { padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600 },
    closeButton: { position: 'absolute' as const, top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ textAlign: 'center', padding: '48px' }}>Loading deletion requests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#ff4444', textAlign: 'center', padding: '48px' }}>Error: {error}</p>
      </div>
    );
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const verifiedCount = requests.filter(r => r.status === 'verified').length;
  const processingCount = requests.filter(r => r.status === 'processing').length;
  const completedCount = requests.filter(r => r.status === 'completed').length;

  return (
    <div style={styles.container}>
      <Link href="/admin" style={styles.backLink}>← Back to Admin</Link>
      
      <header style={styles.header}>
        <h1 style={styles.title}>🗑️ Data Deletion Requests</h1>
        <p style={styles.subtitle}>GDPR/POPIA compliant data deletion management</p>
      </header>

      {/* Stats */}
      <div style={styles.stats}>
        <div style={styles.statCard}>
          <div style={styles.statNumber}>{requests.length}</div>
          <div style={styles.statLabel}>Total Requests</div>
        </div>
        <div style={{ ...styles.statCard, borderLeft: '3px solid #ffaa00' }}>
          <div style={{ ...styles.statNumber, color: '#ffaa00' }}>{pendingCount}</div>
          <div style={styles.statLabel}>Pending</div>
        </div>
        <div style={{ ...styles.statCard, borderLeft: '3px solid #0096ff' }}>
          <div style={{ ...styles.statNumber, color: '#0096ff' }}>{verifiedCount}</div>
          <div style={styles.statLabel}>Verified</div>
        </div>
        <div style={{ ...styles.statCard, borderLeft: '3px solid #8a2be2' }}>
          <div style={{ ...styles.statNumber, color: '#8a2be2' }}>{processingCount}</div>
          <div style={styles.statLabel}>Processing</div>
        </div>
        <div style={{ ...styles.statCard, borderLeft: '3px solid #00ff88' }}>
          <div style={{ ...styles.statNumber, color: '#00ff88' }}>{completedCount}</div>
          <div style={styles.statLabel}>Completed</div>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        {['all', 'pending', 'verified', 'processing', 'completed', 'cancelled'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.filterButton,
              background: filter === f ? '#00f5ff' : '#2a2a3a',
              color: filter === f ? '#0a0a0f' : '#fff',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Request ID</th>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Email</th>
            <th style={styles.th}>Role</th>
            <th style={styles.th}>Data Types</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Submitted</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredRequests.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: '#9CA3AF' }}>
                No requests found
              </td>
            </tr>
          ) : (
            filteredRequests.map(request => (
              <tr key={request.id}>
                <td style={styles.td}>
                  <code style={{ color: '#00f5ff', fontSize: '12px' }}>{request.request_id}</code>
                </td>
                <td style={styles.td}>{request.full_name}</td>
                <td style={styles.td}>{request.email}</td>
                <td style={styles.td}>{request.role}</td>
                <td style={styles.td}>
                  {request.deletion_types.map(t => deletionTypeLabels[t] || t).join(', ')}
                </td>
                <td style={styles.td}>
                  <span style={{
                    ...styles.badge,
                    background: statusColors[request.status]?.bg || '#2a2a3a',
                    color: statusColors[request.status]?.text || '#fff',
                  }}>
                    {request.status}
                  </span>
                </td>
                <td style={styles.td}>
                  {new Date(request.submitted_at).toLocaleDateString()}
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => setSelectedRequest(request)}
                    style={{
                      padding: '6px 12px',
                      background: '#2a2a3a',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Modal */}
      {selectedRequest && (
        <div style={styles.modal} onClick={() => setSelectedRequest(null)}>
          <div style={{ ...styles.modalContent, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button style={styles.closeButton} onClick={() => setSelectedRequest(null)}>×</button>
            <h2 style={styles.modalTitle}>Request Details</h2>
            
            <div style={styles.row}>
              <span style={styles.label}>Request ID</span>
              <span style={styles.value}><code>{selectedRequest.request_id}</code></span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Full Name</span>
              <span style={styles.value}>{selectedRequest.full_name}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Email</span>
              <span style={styles.value}>{selectedRequest.email}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Role</span>
              <span style={styles.value}>{selectedRequest.role}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Organization</span>
              <span style={styles.value}>{selectedRequest.organization || 'N/A'}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Data to Delete</span>
              <span style={styles.value}>
                {selectedRequest.deletion_types.map(t => deletionTypeLabels[t] || t).join(', ')}
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Reason</span>
              <span style={styles.value}>{selectedRequest.reason || 'Not provided'}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Status</span>
              <span style={{
                ...styles.badge,
                background: statusColors[selectedRequest.status]?.bg || '#2a2a3a',
                color: statusColors[selectedRequest.status]?.text || '#fff',
              }}>
                {selectedRequest.status}
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Submitted</span>
              <span style={styles.value}>{new Date(selectedRequest.submitted_at).toLocaleString()}</span>
            </div>
            {selectedRequest.verified_at && (
              <div style={styles.row}>
                <span style={styles.label}>Verified</span>
                <span style={styles.value}>{new Date(selectedRequest.verified_at).toLocaleString()}</span>
              </div>
            )}
            {selectedRequest.completed_at && (
              <div style={styles.row}>
                <span style={styles.label}>Completed</span>
                <span style={styles.value}>{new Date(selectedRequest.completed_at).toLocaleString()}</span>
              </div>
            )}
            {selectedRequest.notes && (
              <div style={styles.row}>
                <span style={styles.label}>Notes</span>
                <span style={styles.value}>{selectedRequest.notes}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={styles.actionButtons}>
              {selectedRequest.status === 'pending' && (
                <>
                  <button
                    onClick={() => updateStatus(selectedRequest.id, 'verified')}
                    disabled={updating}
                    style={{ ...styles.actionButton, background: '#0096ff', color: '#fff' }}
                  >
                    ✓ Mark Verified
                  </button>
                  <button
                    onClick={() => updateStatus(selectedRequest.id, 'cancelled', 'Cancelled by admin')}
                    disabled={updating}
                    style={{ ...styles.actionButton, background: '#ff4444', color: '#fff' }}
                  >
                    ✗ Cancel Request
                  </button>
                </>
              )}
              {selectedRequest.status === 'verified' && (
                <button
                  onClick={() => updateStatus(selectedRequest.id, 'processing')}
                  disabled={updating}
                  style={{ ...styles.actionButton, background: '#8a2be2', color: '#fff' }}
                >
                  ⏳ Start Processing
                </button>
              )}
              {selectedRequest.status === 'processing' && (
                <button
                  onClick={() => updateStatus(selectedRequest.id, 'completed')}
                  disabled={updating}
                  style={{ ...styles.actionButton, background: '#00ff88', color: '#0a0a0f' }}
                >
                  ✓ Mark Completed
                </button>
              )}
              <a
                href={`mailto:${selectedRequest.email}?subject=Re: Data Deletion Request ${selectedRequest.request_id}`}
                style={{ ...styles.actionButton, background: '#2a2a3a', color: '#fff', textDecoration: 'none' }}
              >
                📧 Email User
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
