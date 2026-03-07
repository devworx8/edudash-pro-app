'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Check, X, AlertTriangle, Search, Building2 } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  type: string | null;
  city: string | null;
  province: string | null;
  approved: boolean;
  verified: boolean;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  is_active: boolean;
}

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/sign-in');
        return;
      }

      // Check if user is superadmin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profile?.role !== 'superadmin') {
        alert('Access denied. Superadmin role required.');
        router.push('/dashboard');
        return;
      }

      setUserId(session.user.id);
      loadOrganizations();
    };

    initAuth();
  }, [router, supabase]);

  const loadOrganizations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('preschools')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error('Error loading organizations:', error);
      alert('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (orgId: string) => {
    if (!userId) return;
    
    setProcessingIds(prev => new Set(prev).add(orgId));
    
    try {
      const { error } = await supabase
        .from('preschools')
        .update({
          approved: true,
          verified: true,
          approved_by: userId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      if (error) throw error;

      // Update local state
      setOrganizations(prev =>
        prev.map(org =>
          org.id === orgId
            ? { ...org, approved: true, verified: true, approved_at: new Date().toISOString() }
            : org
        )
      );

      alert('Organization approved successfully!');
    } catch (error: any) {
      console.error('Error approving organization:', error);
      alert(`Failed to approve: ${error.message}`);
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(orgId);
        return newSet;
      });
    }
  };

  const handleReject = async (orgId: string) => {
    if (!confirm('Reject this organization? It will not appear in parent searches.')) return;
    
    setProcessingIds(prev => new Set(prev).add(orgId));
    
    try {
      const { error } = await supabase
        .from('preschools')
        .update({
          approved: false,
          verified: false,
          approved_by: null,
          approved_at: null,
        })
        .eq('id', orgId);

      if (error) throw error;

      setOrganizations(prev =>
        prev.map(org =>
          org.id === orgId
            ? { ...org, approved: false, verified: false, approved_at: null }
            : org
        )
      );

      alert('Organization rejected.');
    } catch (error: any) {
      console.error('Error rejecting organization:', error);
      alert(`Failed to reject: ${error.message}`);
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(orgId);
        return newSet;
      });
    }
  };

  const filteredOrganizations = organizations.filter(org => {
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        org.name?.toLowerCase().includes(query) ||
        org.city?.toLowerCase().includes(query) ||
        org.province?.toLowerCase().includes(query) ||
        org.type?.toLowerCase().includes(query);
      
      if (!matchesSearch) return false;
    }

    // Apply status filter
    if (filter === 'pending' && org.approved) return false;
    if (filter === 'approved' && !org.approved) return false;

    return true;
  });

  const stats = {
    total: organizations.length,
    approved: organizations.filter(o => o.approved).length,
    pending: organizations.filter(o => !o.approved).length,
  };

  if (loading) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="container topbarRow">
            <div className="brand">EduDash Pro - Superadmin</div>
          </div>
        </header>
        <main className="content container">
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <p>Loading organizations...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbarRow topbarEdge">
          <div className="leftGroup">
            <div className="brand">EduDash Pro</div>
            <div className="chip" style={{ background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}>
              <span style={{ fontSize: 16 }}>👑</span>
              <span style={{ fontWeight: 600 }}>Superadmin</span>
            </div>
          </div>
        </div>
      </header>

      <div className="content container">
        <div className="section">
          <h1 className="h1">Organization Management</h1>
          <p className="muted">Approve organizations to appear in parent signup searches</p>
        </div>

        {/* Stats */}
        <div className="section">
          <div className="grid2">
            <div className="card tile">
              <div className="metricValue">{stats.total}</div>
              <div className="metricLabel">Total Organizations</div>
            </div>
            <div className="card tile">
              <div className="metricValue" style={{ color: 'var(--primary)' }}>{stats.approved}</div>
              <div className="metricLabel">Approved</div>
            </div>
            <div className="card tile">
              <div className="metricValue" style={{ color: 'var(--warning)' }}>{stats.pending}</div>
              <div className="metricLabel">Pending Approval</div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="section">
          <div className="card">
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 250 }}>
                <input
                  type="text"
                  className="searchInput"
                  placeholder="Search organizations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', paddingLeft: 36 }}
                />
                <Search className="searchIcon icon16" style={{ left: 12 }} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {['all', 'pending', 'approved'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f as any)}
                    className="btn"
                    style={{
                      background: filter === f ? 'var(--primary)' : 'var(--surface-2)',
                      color: filter === f ? 'white' : 'var(--text)',
                      borderColor: filter === f ? 'transparent' : 'var(--border)',
                      textTransform: 'capitalize'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Organizations List */}
        <div className="section">
          {filteredOrganizations.length === 0 ? (
            <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
              <Building2 className="icon20" style={{ margin: '0 auto 16px', width: 48, height: 48, opacity: 0.5 }} />
              <p className="muted">No organizations found</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {filteredOrganizations.map((org) => (
                <div key={org.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 250 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{org.name}</h3>
                        {org.approved ? (
                          <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#6ee7b7', borderColor: 'rgba(34, 197, 94, 0.4)' }}>
                            ✓ Approved
                          </span>
                        ) : (
                          <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', borderColor: 'var(--warning-border)' }}>
                            ⏳ Pending
                          </span>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 14, color: 'var(--muted)' }}>
                        {org.type && <div>📚 {org.type}</div>}
                        {org.city && <div>📍 {org.city}, {org.province}</div>}
                      </div>

                      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
                        Created: {new Date(org.created_at).toLocaleDateString('en-ZA')}
                        {org.approved_at && (
                          <span> • Approved: {new Date(org.approved_at).toLocaleDateString('en-ZA')}</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      {!org.approved ? (
                        <button
                          onClick={() => handleApprove(org.id)}
                          disabled={processingIds.has(org.id)}
                          className="btn"
                          style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            borderColor: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}
                        >
                          <Check className="icon16" />
                          {processingIds.has(org.id) ? 'Approving...' : 'Approve'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReject(org.id)}
                          disabled={processingIds.has(org.id)}
                          className="btn"
                          style={{
                            background: 'transparent',
                            color: 'var(--danger)',
                            borderColor: 'var(--danger)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}
                        >
                          <X className="icon16" />
                          {processingIds.has(org.id) ? 'Rejecting...' : 'Revoke'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="section">
          <div className="card" style={{ background: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <AlertTriangle className="icon20" style={{ color: '#60a5fa', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#60a5fa' }}>About Organization Approval</div>
                <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6, color: 'var(--text)' }}>
                  Only <strong>approved organizations</strong> will appear in the parent signup search. 
                  Approving an organization means it has been verified and parents can request to link their accounts to it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
