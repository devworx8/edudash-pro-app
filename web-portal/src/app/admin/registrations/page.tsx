'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Baby,
  Bell,
  Filter,
  Search,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Registration {
  id: string;
  organization_id: string;
  organization_name?: string;
  // Guardian info
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_address: string;
  // Student info
  student_first_name: string;
  student_last_name: string;
  student_dob: string;
  student_gender: string;
  // Document URLs
  student_birth_certificate_url?: string;
  student_clinic_card_url?: string;
  guardian_id_document_url?: string;
  documents_uploaded: boolean;
  documents_deadline?: string;
  // Payment info
  registration_fee_amount?: number;
  registration_fee_paid: boolean;
  payment_method?: string;
  proof_of_payment_url?: string;
  campaign_applied?: string;
  discount_amount?: number;
  // Status
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  created_at: string;
}

export default function RegistrationsAdminPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [organizationFilter, setOrganizationFilter] = useState<string>('all');
  const [organizations, setOrganizations] = useState<{id: string, name: string}[]>([]);
  const [newRegistrationsCount, setNewRegistrationsCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Notification sound
  const playNotificationSound = () => {
    if (soundEnabled && typeof Audio !== 'undefined') {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBze');
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore errors
    }
  };

  // Fetch registrations from EduSitePro database
  const fetchRegistrations = async () => {
    try {
      setLoading(true);
      
      // Connect to EduSitePro database (bppuzibjlxgfwrujzfsz.supabase.co)
      const edusiteproUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL || 'https://bppuzibjlxgfwrujzfsz.supabase.co';
      const edusiteproKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;

      const { createClient } = await import('@supabase/supabase-js');
      const edusiteproClient = createClient(edusiteproUrl, edusiteproKey!);

      // Fetch all registrations
      const { data, error } = await edusiteproClient
        .from('registration_requests')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedData = data?.map((reg: any) => ({
        ...reg,
        organization_name: reg.organizations?.name,
      })) || [];

      setRegistrations(formattedData);
      setFilteredRegistrations(formattedData);

      // Extract unique organizations
      const uniqueOrgs = Array.from(
        new Map(
          formattedData
            .filter((r: any) => r.organization_id && r.organization_name)
            .map((r: any) => [r.organization_id, { id: r.organization_id, name: r.organization_name }])
        ).values()
      );
      setOrganizations(uniqueOrgs);

      // Count new pending registrations
      const newPending = formattedData.filter((r: Registration) => r.status === 'pending').length;
      if (newPending > newRegistrationsCount) {
        playNotificationSound();
        if (Notification.permission === 'granted') {
          new Notification('New Registration!', {
            body: `${newPending - newRegistrationsCount} new registration(s) pending approval`,
            icon: '/icon-192.png',
          });
        }
      }
      setNewRegistrationsCount(newPending);

    } catch (error) {
      console.error('Error fetching registrations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          router.push('/sign-in');
          return;
        }
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Auth check error:', error);
        router.push('/sign-in');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router, supabase]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Initial fetch and set up real-time updates
  useEffect(() => {
    if (!isAuthenticated) return;
    
    fetchRegistrations();
    
    // Poll every 30 seconds for new registrations
    const interval = setInterval(fetchRegistrations, 30000);
    
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Filter registrations
  useEffect(() => {
    let filtered = registrations;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    // Organization filter
    if (organizationFilter !== 'all') {
      filtered = filtered.filter(r => r.organization_id === organizationFilter);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.guardian_name.toLowerCase().includes(term) ||
        r.guardian_email.toLowerCase().includes(term) ||
        r.student_first_name.toLowerCase().includes(term) ||
        r.student_last_name.toLowerCase().includes(term) ||
        r.organization_name?.toLowerCase().includes(term)
      );
    }

    setFilteredRegistrations(filtered);
  }, [registrations, statusFilter, organizationFilter, searchTerm]);

  // Approve registration
  const handleApprove = async (registration: Registration) => {
    if (!confirm(`Approve registration for ${registration.student_first_name} ${registration.student_last_name}?`)) {
      return;
    }

    setProcessing(registration.id);
    try {
      const edusiteproUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL || 'https://bppuzibjlxgfwrujzfsz.supabase.co';
      const edusiteproKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;

      const { createClient } = await import('@supabase/supabase-js');
      const edusiteproClient = createClient(edusiteproUrl, edusiteproKey!);

      // Get current user email for tracking
      const { data: { session } } = await supabase.auth.getSession();
      const reviewerEmail = session?.user?.email || 'admin';

      const { error } = await edusiteproClient
        .from('registration_requests')
        .update({
          status: 'approved',
          reviewed_by: reviewerEmail,
          reviewed_date: new Date().toISOString(),
          registration_fee_paid: true,
          payment_method: registration.proof_of_payment_url ? 'bank_transfer' : 'cash',
        })
        .eq('id', registration.id);

      if (error) throw error;

      // Sync will happen automatically via pg_cron (every 5 minutes)
      // Or admin can manually trigger sync from EduDashPro principal dashboard

      await fetchRegistrations();
      alert('Registration approved successfully!');
    } catch (error) {
      console.error('Error approving registration:', error);
      alert('Failed to approve registration. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  // Reject registration
  const handleReject = async (registration: Registration) => {
    const reason = prompt(`Enter reason for rejecting ${registration.student_first_name} ${registration.student_last_name}'s registration:`);
    if (!reason) return;

    setProcessing(registration.id);
    try {
      const edusiteproUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL || 'https://bppuzibjlxgfwrujzfsz.supabase.co';
      const edusiteproKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;

      const { createClient } = await import('@supabase/supabase-js');
      const edusiteproClient = createClient(edusiteproUrl, edusiteproKey!);

      // Get current user email for tracking
      const { data: { session } } = await supabase.auth.getSession();
      const reviewerEmail = session?.user?.email || 'admin';

      const { error } = await edusiteproClient
        .from('registration_requests')
        .update({
          status: 'rejected',
          reviewed_by: reviewerEmail,
          reviewed_date: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', registration.id);

      if (error) throw error;

      await fetchRegistrations();
      alert('Registration rejected.');
    } catch (error) {
      console.error('Error rejecting registration:', error);
      alert('Failed to reject registration. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  if (authLoading) {
    return (
      <div className="section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <RefreshCw className="icon20 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const pendingCount = registrations.filter(r => r.status === 'pending').length;
  const approvedCount = registrations.filter(r => r.status === 'approved').length;
  const rejectedCount = registrations.filter(r => r.status === 'rejected').length;

  return (
    <>
      <div className="section">
        <div className="sectionTitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="h1">Registration Management</h1>
            <p style={{ marginTop: 4, fontSize: 14, color: 'var(--muted)' }}>
              Review and approve registration requests from parents
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="iconBtn"
              title="Toggle notification sound"
              style={soundEnabled ? { color: 'var(--success)' } : undefined}
            >
              <Bell className="icon20" />
            </button>
            <button
              type="button"
              onClick={fetchRegistrations}
              disabled={loading}
              className="button primary"
            >
              <RefreshCw className={`icon20 ${loading ? 'animate-spin' : ''}`} style={{ marginRight: 8 }} />
              Refresh
            </button>
          </div>
        </div>
        <div className="grid2" style={{ marginBottom: 24 }}>
          <div className="card tile">
            <FileText className="icon20" style={{ color: 'var(--primary)', marginBottom: 8 }} />
            <div className="metricValue">{registrations.length}</div>
            <div className="metricLabel">Total</div>
          </div>
          <div className="card tile">
            <Clock className="icon20" style={{ color: 'var(--warning)', marginBottom: 8 }} />
            <div className="metricValue">{pendingCount}</div>
            <div className="metricLabel">Pending</div>
          </div>
          <div className="card tile">
            <CheckCircle2 className="icon20" style={{ color: 'var(--success)', marginBottom: 8 }} />
            <div className="metricValue">{approvedCount}</div>
            <div className="metricLabel">Approved</div>
          </div>
          <div className="card tile">
            <XCircle className="icon20" style={{ color: 'var(--danger)', marginBottom: 8 }} />
            <div className="metricValue">{rejectedCount}</div>
            <div className="metricLabel">Rejected</div>
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="section card">

        {/* Tabs and Filters */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value as typeof statusFilter)}
                  className="button secondary"
                  style={{
                    ...(statusFilter === tab.value ? { borderBottomWidth: 2, borderBottomColor: 'var(--primary)', fontWeight: 600 } : {}),
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => alert('Export functionality coming soon')} className="button secondary">
              <Download className="icon20" style={{ marginRight: 8 }} />
              Export CSV
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16, paddingBottom: 16 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search className="icon20" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Search by name, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="searchInput"
                style={{ paddingLeft: 40 }}
              />
            </div>
            <select
              value={organizationFilter}
              onChange={(e) => setOrganizationFilter(e.target.value)}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                minWidth: 160,
              }}
            >
              <option value="all">All Schools</option>
              {organizations.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Registrations Table */}
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <RefreshCw className="icon20 animate-spin" style={{ color: 'var(--primary)', margin: '0 auto' }} />
              <p style={{ marginTop: 16, fontSize: 14, color: 'var(--muted)' }}>Loading registrations...</p>
            </div>
          ) : filteredRegistrations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <FileText className="icon20" style={{ color: 'var(--muted)', margin: '0 auto' }} />
              <p style={{ marginTop: 16, fontSize: 14, color: 'var(--muted)' }}>No registrations found</p>
            </div>
          ) : (
              <>
                {/* Desktop Table View */}
                <table className="w-full hidden md:table">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Parent</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">School</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payment</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {
filteredRegistrations.map((reg) => (
                    <tr key={reg.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      {/* Student */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {reg.student_first_name} {reg.student_last_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            DOB: {new Date(reg.student_dob).toLocaleDateString()}
                          </div>
                        </div>
                      </td>

                      {/* Parent */}
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm text-gray-900 dark:text-white">{reg.guardian_name}</div>
                          <div className="text-xs text-gray-500">{reg.guardian_email}</div>
                        </div>
                      </td>

                      {/* School */}
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {reg.organization_name || 'Unknown'}
                        </div>
                      </td>

                      {/* Fee */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {reg.registration_fee_amount ? `R${reg.registration_fee_amount}` : 'R300'}
                          {reg.discount_amount && reg.discount_amount > 0 && (
                            <div className="text-xs text-green-600">{reg.discount_amount}% off</div>
                          )}
                        </div>
                      </td>

                      {/* Payment */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          reg.registration_fee_paid
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {reg.registration_fee_paid ? 'Paid' : 'No Payment'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          reg.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          reg.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {reg.status}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {new Date(reg.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {reg.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApprove(reg)}
                              disabled={processing === reg.id || !reg.proof_of_payment_url}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title={!reg.proof_of_payment_url ? "Waiting for proof of payment" : "Approve"}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleReject(reg)}
                              disabled={processing === reg.id}
                              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => router.push(`/admin/registrations/${reg.id}`)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                          >
                            View Details
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                }
                </tbody>
              </table>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4 p-4">
                {filteredRegistrations.map((reg) => (
                  <div
                    key={reg.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {reg.student_first_name} {reg.student_last_name}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{reg.guardian_name}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        reg.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        reg.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {reg.status}
                      </span>
                    </div>

                    <div className="space-y-2 mb-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">School:</span>
                        <span className="text-gray-900 dark:text-white">{reg.organization_name || 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Fee:</span>
                        <span className="text-gray-900 dark:text-white">R{reg.registration_fee_amount || 300}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Payment:</span>
                        <span className={reg.registration_fee_paid ? 'text-green-600' : 'text-red-600'}>
                          {reg.registration_fee_paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Date:</span>
                        <span className="text-gray-900 dark:text-white">
                          {new Date(reg.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {!reg.proof_of_payment_url && reg.status === 'pending' && (
                        <div className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="w-3 h-3" />
                          Waiting for proof of payment
                        </div>
                      )}
                    </div>

                    {reg.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/admin/registrations/${reg.id}`)}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                        >
                          View & Approve
                        </button>
                        <button
                          onClick={() => handleReject(reg)}
                          disabled={processing === reg.id}
                          className="px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => router.push(`/admin/registrations/${reg.id}`)}
                        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        View Details
                      </button>
                    )}
                  </div>
                ))}
              </div>
              </>
            )}
        </div>
      </div>
    </>
  );
}
