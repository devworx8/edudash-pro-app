'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  Mail,
  Calendar,
  User,
  Baby,
  Search,
  Download,
  RefreshCw,
  DollarSign,
  ShieldCheck,
  AlertCircle,
  Filter,
  FileCheck,
  Image,
  ExternalLink,
} from 'lucide-react';

interface AfterCareRegistration {
  id: string;
  preschool_id: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_phone: string;
  parent_id_number?: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: string;
  child_date_of_birth?: string;
  child_allergies?: string;
  child_medical_conditions?: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  how_did_you_hear?: string;
  registration_fee: number;
  registration_fee_original: number;
  promotion_code?: string;
  payment_reference?: string;
  status: 'pending_payment' | 'paid' | 'enrolled' | 'cancelled' | 'waitlisted';
  payment_date?: string;
  proof_of_payment_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

const statusConfig = {
  pending_payment: { label: 'Pending Payment', color: '#f59e0b', bg: '#fef3c7', icon: Clock },
  paid: { label: 'Paid', color: '#10b981', bg: '#d1fae5', icon: DollarSign },
  enrolled: { label: 'Enrolled', color: '#3b82f6', bg: '#dbeafe', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: '#fee2e2', icon: XCircle },
  waitlisted: { label: 'Waitlisted', color: '#8b5cf6', bg: '#ede9fe', icon: AlertCircle },
};

export default function AfterCareAdminPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [registrations, setRegistrations] = useState<AfterCareRegistration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<AfterCareRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [selectedRegistration, setSelectedRegistration] = useState<AfterCareRegistration | null>(null);

  // Fetch registrations
  const fetchRegistrations = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('aftercare_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRegistrations(data || []);
      setFilteredRegistrations(data || []);
    } catch (error) {
      console.error('Error fetching registrations:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Check auth and fetch data
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      fetchRegistrations();
    };
    checkAuth();
  }, [router, supabase, fetchRegistrations]);

  // Filter registrations
  useEffect(() => {
    let filtered = registrations;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    if (gradeFilter !== 'all') {
      filtered = filtered.filter(r => r.child_grade === gradeFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.parent_first_name.toLowerCase().includes(term) ||
        r.parent_last_name.toLowerCase().includes(term) ||
        r.parent_email.toLowerCase().includes(term) ||
        r.child_first_name.toLowerCase().includes(term) ||
        r.child_last_name.toLowerCase().includes(term) ||
        r.payment_reference?.toLowerCase().includes(term)
      );
    }

    setFilteredRegistrations(filtered);
  }, [registrations, statusFilter, gradeFilter, searchTerm]);

  // Update status
  const updateStatus = async (id: string, newStatus: AfterCareRegistration['status']) => {
    setProcessing(id);
    try {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'paid') {
        updates.payment_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from('aftercare_registrations')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      // Refresh data
      await fetchRegistrations();
      setSelectedRegistration(null);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    } finally {
      setProcessing(null);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Child Name', 'Grade', 'Parent Name', 'Email', 'Phone', 'Payment Ref', 'Status', 'Created'];
    const rows = filteredRegistrations.map(r => [
      `${r.child_first_name} ${r.child_last_name}`,
      `Grade ${r.child_grade}`,
      `${r.parent_first_name} ${r.parent_last_name}`,
      r.parent_email,
      r.parent_phone,
      r.payment_reference || '',
      r.status,
      new Date(r.created_at).toLocaleDateString(),
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aftercare-registrations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Stats
  const stats = {
    total: registrations.length,
    pending: registrations.filter(r => r.status === 'pending_payment').length,
    paid: registrations.filter(r => r.status === 'paid').length,
    enrolled: registrations.filter(r => r.status === 'enrolled').length,
    revenue: registrations.filter(r => ['paid', 'enrolled'].includes(r.status)).reduce((sum, r) => sum + r.registration_fee, 0),
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 16px', color: '#7c3aed' }} />
          <p style={{ color: '#6b7280' }}>Loading registrations...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Link href="/dashboard" style={{ color: '#6b7280', fontSize: '14px', textDecoration: 'none' }}>← Back to Dashboard</Link>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginTop: '4px' }}>
              🏫 Aftercare Registrations
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={fetchRegistrations}
              style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={exportToCSV}
              style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '4px' }}>Total Registrations</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827' }}>{stats.total}</p>
          </div>
          <div style={{ background: '#fef3c7', padding: '20px', borderRadius: '12px', border: '2px solid #fbbf24' }}>
            <p style={{ color: '#92400e', fontSize: '14px', marginBottom: '4px' }}>Pending Payment</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: '#92400e' }}>{stats.pending}</p>
          </div>
          <div style={{ background: '#d1fae5', padding: '20px', borderRadius: '12px', border: '2px solid #10b981' }}>
            <p style={{ color: '#065f46', fontSize: '14px', marginBottom: '4px' }}>Paid</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: '#065f46' }}>{stats.paid}</p>
          </div>
          <div style={{ background: '#dbeafe', padding: '20px', borderRadius: '12px', border: '2px solid #3b82f6' }}>
            <p style={{ color: '#1e40af', fontSize: '14px', marginBottom: '4px' }}>Enrolled</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: '#1e40af' }}>{stats.enrolled}</p>
          </div>
          <div style={{ background: '#ede9fe', padding: '20px', borderRadius: '12px', border: '2px solid #8b5cf6' }}>
            <p style={{ color: '#5b21b6', fontSize: '14px', marginBottom: '4px' }}>Revenue</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: '#5b21b6' }}>R{stats.revenue.toLocaleString()}</p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Search by name, email, or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '10px 10px 10px 40px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
          >
            <option value="all">All Statuses</option>
            <option value="pending_payment">Pending Payment</option>
            <option value="paid">Paid</option>
            <option value="enrolled">Enrolled</option>
            <option value="cancelled">Cancelled</option>
            <option value="waitlisted">Waitlisted</option>
          </select>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            style={{ padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
          >
            <option value="all">All Grades</option>
            <option value="R">Grade R</option>
            <option value="1">Grade 1</option>
            <option value="2">Grade 2</option>
            <option value="3">Grade 3</option>
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
            <option value="6">Grade 6</option>
            <option value="7">Grade 7</option>
          </select>
        </div>

        {/* Registrations List */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {filteredRegistrations.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <Baby size={48} style={{ color: '#d1d5db', margin: '0 auto 16px' }} />
              <p style={{ color: '#6b7280', fontSize: '16px' }}>No registrations found</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Child</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Parent</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Reference</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>POP</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.map((reg) => {
                  const status = statusConfig[reg.status];
                  const StatusIcon = status.icon;
                  return (
                    <tr key={reg.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Baby size={20} style={{ color: '#7c3aed' }} />
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, color: '#111827', fontSize: '14px' }}>{reg.child_first_name} {reg.child_last_name}</p>
                            <p style={{ color: '#6b7280', fontSize: '13px' }}>Grade {reg.child_grade}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <p style={{ fontWeight: 500, color: '#111827', fontSize: '14px' }}>{reg.parent_first_name} {reg.parent_last_name}</p>
                        <p style={{ color: '#6b7280', fontSize: '13px' }}>{reg.parent_email}</p>
                        <p style={{ color: '#6b7280', fontSize: '13px' }}>{reg.parent_phone}</p>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <code style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', color: '#374151' }}>
                          {reg.payment_reference || 'N/A'}
                        </code>
                      </td>
                      <td style={{ padding: '16px' }}>
                        {reg.proof_of_payment_url ? (
                          <a 
                            href={reg.proof_of_payment_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              padding: '4px 8px', 
                              background: '#d1fae5', 
                              color: '#065f46', 
                              borderRadius: '4px', 
                              fontSize: '12px',
                              fontWeight: 500,
                              textDecoration: 'none'
                            }}
                          >
                            <FileCheck size={14} /> View
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          padding: '4px 10px', 
                          borderRadius: '20px', 
                          fontSize: '13px', 
                          fontWeight: 500,
                          background: status.bg,
                          color: status.color
                        }}>
                          <StatusIcon size={14} />
                          {status.label}
                        </span>
                      </td>
                      <td style={{ padding: '16px', color: '#6b7280', fontSize: '13px' }}>
                        {new Date(reg.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <button
                          onClick={() => setSelectedRegistration(reg)}
                          style={{ padding: '6px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRegistration && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>Registration Details</h2>
              <button onClick={() => setSelectedRegistration(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            
            <div style={{ padding: '24px' }}>
              {/* Status Badge */}
              {(() => {
                const status = statusConfig[selectedRegistration.status];
                const StatusIcon = status.icon;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      padding: '6px 14px', 
                      borderRadius: '20px', 
                      fontSize: '14px', 
                      fontWeight: 600,
                      background: status.bg,
                      color: status.color
                    }}>
                      <StatusIcon size={16} />
                      {status.label}
                    </span>
                    <span style={{ color: '#6b7280', fontSize: '14px' }}>
                      Ref: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{selectedRegistration.payment_reference}</code>
                    </span>
                  </div>
                );
              })()}

              {/* Child Info */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>👧 Child Information</h3>
                <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
                  <p><strong>Name:</strong> {selectedRegistration.child_first_name} {selectedRegistration.child_last_name}</p>
                  <p><strong>Grade:</strong> {selectedRegistration.child_grade}</p>
                  {selectedRegistration.child_date_of_birth && <p><strong>DOB:</strong> {selectedRegistration.child_date_of_birth}</p>}
                  {selectedRegistration.child_allergies && <p><strong>Allergies:</strong> {selectedRegistration.child_allergies}</p>}
                  {selectedRegistration.child_medical_conditions && <p><strong>Medical:</strong> {selectedRegistration.child_medical_conditions}</p>}
                </div>
              </div>

              {/* Parent Info */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>👤 Parent Information</h3>
                <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
                  <p><strong>Name:</strong> {selectedRegistration.parent_first_name} {selectedRegistration.parent_last_name}</p>
                  <p><strong>Email:</strong> <a href={`mailto:${selectedRegistration.parent_email}`} style={{ color: '#7c3aed' }}>{selectedRegistration.parent_email}</a></p>
                  <p><strong>Phone:</strong> <a href={`tel:${selectedRegistration.parent_phone}`} style={{ color: '#7c3aed' }}>{selectedRegistration.parent_phone}</a></p>
                  {selectedRegistration.parent_id_number && <p><strong>ID:</strong> {selectedRegistration.parent_id_number}</p>}
                </div>
              </div>

              {/* Emergency Contact */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>🚨 Emergency Contact</h3>
                <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '8px' }}>
                  <p><strong>Name:</strong> {selectedRegistration.emergency_contact_name}</p>
                  <p><strong>Phone:</strong> <a href={`tel:${selectedRegistration.emergency_contact_phone}`} style={{ color: '#92400e' }}>{selectedRegistration.emergency_contact_phone}</a></p>
                  <p><strong>Relation:</strong> {selectedRegistration.emergency_contact_relation}</p>
                </div>
              </div>

              {/* Payment Info */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>💳 Payment</h3>
                <div style={{ background: '#d1fae5', padding: '16px', borderRadius: '8px' }}>
                  <p><strong>Amount:</strong> R{selectedRegistration.registration_fee.toFixed(2)} <span style={{ color: '#6b7280', textDecoration: 'line-through' }}>(R{selectedRegistration.registration_fee_original.toFixed(2)})</span></p>
                  <p><strong>Promo:</strong> {selectedRegistration.promotion_code || 'None'}</p>
                  {selectedRegistration.payment_date && <p><strong>Paid:</strong> {new Date(selectedRegistration.payment_date).toLocaleDateString()}</p>}
                </div>
              </div>

              {/* Proof of Payment */}
              {selectedRegistration.proof_of_payment_url && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>📄 Proof of Payment</h3>
                  <div style={{ background: '#f0fdf4', border: '2px solid #10b981', padding: '16px', borderRadius: '8px' }}>
                    {selectedRegistration.proof_of_payment_url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                      <div>
                        <img 
                          src={selectedRegistration.proof_of_payment_url} 
                          alt="Proof of Payment" 
                          style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', marginBottom: '12px' }}
                        />
                        <a 
                          href={selectedRegistration.proof_of_payment_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#10b981', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '14px', fontWeight: 500 }}
                        >
                          <ExternalLink size={16} /> Open Full Size
                        </a>
                      </div>
                    ) : (
                      <a 
                        href={selectedRegistration.proof_of_payment_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', background: '#10b981', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}
                      >
                        <FileCheck size={18} /> View/Download Proof of Payment (PDF)
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {selectedRegistration.status === 'pending_payment' && (
                  <button
                    onClick={() => updateStatus(selectedRegistration.id, 'paid')}
                    disabled={processing === selectedRegistration.id}
                    style={{ flex: 1, padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <DollarSign size={18} />
                    {processing === selectedRegistration.id ? 'Processing...' : 'Mark as Paid'}
                  </button>
                )}
                {selectedRegistration.status === 'paid' && (
                  <button
                    onClick={() => updateStatus(selectedRegistration.id, 'enrolled')}
                    disabled={processing === selectedRegistration.id}
                    style={{ flex: 1, padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <CheckCircle2 size={18} />
                    {processing === selectedRegistration.id ? 'Processing...' : 'Enroll Student'}
                  </button>
                )}
                {!['cancelled', 'enrolled'].includes(selectedRegistration.status) && (
                  <button
                    onClick={() => updateStatus(selectedRegistration.id, 'cancelled')}
                    disabled={processing === selectedRegistration.id}
                    style={{ padding: '12px 20px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
                <a
                  href={`mailto:${selectedRegistration.parent_email}?subject=Aftercare Registration - ${selectedRegistration.payment_reference}`}
                  style={{ padding: '12px 20px', background: '#f3f4f6', color: '#374151', borderRadius: '8px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Mail size={16} /> Email Parent
                </a>
                <a
                  href={`https://wa.me/${selectedRegistration.parent_phone.replace(/\D/g, '')}?text=Hi ${selectedRegistration.parent_first_name}, regarding ${selectedRegistration.child_first_name}'s aftercare registration (Ref: ${selectedRegistration.payment_reference})...`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '12px 20px', background: '#25D366', color: '#fff', borderRadius: '8px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Phone size={16} /> WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
