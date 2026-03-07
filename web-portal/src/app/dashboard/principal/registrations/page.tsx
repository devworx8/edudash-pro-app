'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Phone,
  Mail,
  Calendar,
  User,
  Baby,
  Bell,
  Search,
  Download,
  RefreshCw,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';

interface Registration {
  id: string;
  organization_id: string;
  organization_name?: string;
  edusite_id?: string; // EduSitePro source ID
  // Guardian info
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_address: string;
  parent_email?: string | null;
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
  payment_reference?: string;
  registration_fee_amount?: number;
  registration_fee_paid: boolean;
  payment_verified?: boolean;
  payment_method?: string;
  proof_of_payment_url?: string;
  campaign_applied?: string;
  discount_amount?: number;
  // Status
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_date?: string;
  rejection_reason?: string;
  created_at: string;
}

// Schools that use EduSitePro external sync
// EduDash Pro Community School (00000000-0000-0000-0000-000000000001) does NOT use EduSite sync
// Young Eagles and other schools may use it
const EDUDASH_COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
const EDUDASH_MAIN_SCHOOL_ID = '00000000-0000-0000-0000-000000000003';

export default function PrincipalRegistrationsPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [userId, setUserId] = useState<string>();
  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const organizationId = profile?.organizationId;
  
  // Check if this school uses EduSite sync (exclude EduDash Pro schools)
  const usesEdusiteSync = organizationId && 
    organizationId !== EDUDASH_COMMUNITY_SCHOOL_ID && 
    organizationId !== EDUDASH_MAIN_SCHOOL_ID;
  
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [newRegistrationsCount, setNewRegistrationsCount] = useState(0);
  const [lastCheckedCount, setLastCheckedCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sendingPopLinkId, setSendingPopLinkId] = useState<string | null>(null);

  // Initialize auth
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    initAuth();
  }, [router, supabase]);

  // Notification sound
  const playNotificationSound = () => {
    if (soundEnabled && typeof Audio !== 'undefined') {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBze');
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore errors
    }
  };

  // Fetch registrations from LOCAL EduDashPro database (same as ChildRegistrationWidget)
  const fetchRegistrations = async () => {
    if (!organizationId && !preschoolId) {
      console.log('⏳ [Registrations] Waiting for organizationId or preschoolId...');
      return;
    }

    try {
      setLoading(true);
      
      const orgId = organizationId || preschoolId;
      console.log('📍 [Registrations] Fetching for organization:', orgId);

      // Query LOCAL database (same as ChildRegistrationWidget does)
      const { data, error } = await supabase
        .from('registration_requests')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching registrations:', error);
        // If table doesn't exist, show empty state
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          console.log('ℹ️ [Registrations] registration_requests table not found - data needs to sync from EduSitePro');
          setRegistrations([]);
          setFilteredRegistrations([]);
          setLoading(false);
          return;
        }
        throw error;
      }

      console.log('✅ [Registrations] Found:', data?.length || 0, 'registrations');

      setRegistrations(data || []);
      setFilteredRegistrations(data || []);

      // Count new pending registrations
      const newPending = (data || []).filter((r: Registration) => r.status === 'pending').length;
      // Only notify if there's an actual increase from last check (not initial load)
      if (lastCheckedCount > 0 && newPending > lastCheckedCount) {
        const newCount = newPending - lastCheckedCount;
        playNotificationSound();
        if (Notification.permission === 'granted') {
          new Notification('New Registration!', {
            body: `${newCount} new registration(s) pending approval`,
            icon: '/icon-192.png',
          });
        }
      }
      setLastCheckedCount(newPending);
      setNewRegistrationsCount(newPending);

    } catch (error) {
      console.error('Error fetching registrations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Initial fetch and set up real-time updates
  useEffect(() => {
    if (!organizationId && !preschoolId) return;
    
    fetchRegistrations();
    
    // Poll every 5 minutes for new registrations
    const interval = setInterval(fetchRegistrations, 300000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, preschoolId]);

  // Filter registrations
  useEffect(() => {
    let filtered = registrations;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.guardian_name.toLowerCase().includes(term) ||
        r.guardian_email.toLowerCase().includes(term) ||
        r.student_first_name.toLowerCase().includes(term) ||
        r.student_last_name.toLowerCase().includes(term)
      );
    }

    setFilteredRegistrations(filtered);
  }, [registrations, statusFilter, searchTerm]);

  // Approve registration
  const handleApprove = async (registration: Registration) => {
    if (!confirm(`Approve registration for ${registration.student_first_name} ${registration.student_last_name}?`)) {
      return;
    }

    setProcessing(registration.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      console.log('[Approve] Starting approval for registration:', registration.id);
      
      // Step 1: Update status to 'approved' in EduDashPro database
      // The database trigger will automatically:
      // - Sync back to EduSitePro (if edusite_id exists)
      // - Create parent/student accounts
      // - Send welcome email
      const { error: updateError } = await supabase
        .from('registration_requests')
        .update({
          status: 'approved',
          reviewed_by: user?.email,
          reviewed_date: new Date().toISOString(),
        })
        .eq('id', registration.id);

      if (updateError) {
        throw updateError;
      }

      console.log('[Approve] ✅ Status updated to approved');
      
      // Step 2: Create student/parent accounts and send email
      // Wait a moment for DB trigger to complete, then explicitly call sync function
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('[Approve] Calling sync-registration-to-edudash with ID:', registration.id);
      
      const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-registration-to-edudash', {
        body: { registration_id: registration.id }, // Pass the EduDashPro registration ID
      });
      
      if (syncError) {
        console.error('[Approve] ❌ Sync error:', syncError);
        alert(`Registration approved, but account creation failed: ${syncError.message}\n\nPlease contact admin.`);
      } else {
        console.log('[Approve] ✅ Sync successful:', syncData);
        alert('✅ Registration approved!\n\n✉️ Welcome email sent to parent\n👤 Parent account created\n👶 Student profile created');
      }

      // Send approval notification (email + push) to guardian
      try {
        const childName = `${registration.student_first_name} ${registration.student_last_name}`.trim();
        const guardianEmail = registration.guardian_email || registration.parent_email;
        const schoolName = registration.organization_name || profile?.preschoolName || 'your school';
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.edudashpro.com';

        if (guardianEmail) {
          await supabase.functions.invoke('notifications-dispatcher', {
            body: {
              event_type: 'child_registration_approved',
              recipient_email: guardianEmail,
              registration_id: registration.id,
              child_name: childName,
              school_name: schoolName,
              preschool_id: registration.organization_id,
              include_email: true,
              email_template_override: {
                subject: `✅ ${childName}'s Registration Approved — ${schoolName}`,
                html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.7"><h2 style="color:#16a34a">✅ Registration Approved</h2><p>Dear ${registration.guardian_name || 'Parent'},</p><p><strong>${childName}</strong>'s registration at <strong>${schoolName}</strong> has been approved!</p><p>Here's what happens next:</p><ul><li>Your child has been enrolled and is now active on the school system.</li><li>Track attendance, homework, and school updates from the EduDash Pro app.</li><li>Your child's teacher will be in touch with class details.</li></ul><p style="margin:24px 0"><a href="${appUrl}" style="display:inline-block;background:#6d28d9;color:#fff;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700">Open EduDash Pro</a></p><p style="font-size:13px;color:#64748b">If you haven't downloaded the app yet, search for <strong>EduDash Pro</strong> on the App Store or Google Play.</p><p>Welcome to ${schoolName}! 🎉</p></div>`,
                text: `${childName}'s registration at ${schoolName} has been approved! Open EduDash Pro to get started: ${appUrl}`,
              },
            },
          });
          console.log('[Approve] ✉️ Notification sent to', guardianEmail);
        }
      } catch (notifErr) {
        console.warn('[Approve] Failed to send approval notification:', notifErr);
      }

      await fetchRegistrations();
    } catch (error) {
      console.error('[Approve] Error:', error);
      alert(`Failed to approve registration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessing(null);
    }
  };

  // Manual sync from EduSitePro
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      console.log('🔄 Triggering manual sync from EduSitePro...');
      const { data, error } = await supabase.functions.invoke('sync-registrations-from-edusite');
      
      if (error) {
        console.error('❌ Sync error:', error);
        alert('Failed to sync registrations. Check console for details.');
        return;
      }

      console.log('✅ Sync result:', data);
      alert(`Sync complete! ${data.synced || 0} new, ${data.updated || 0} updated, ${data.deleted || 0} removed`);
      
      // Refresh the list
      await fetchRegistrations();
    } catch (error) {
      console.error('💥 Sync failed:', error);
      alert('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSendPopUploadLink = async (registration: Registration) => {
    const recipientEmails = [registration.guardian_email, registration.parent_email]
      .map((email) => email?.trim().toLowerCase())
      .filter((email): email is string => !!email);

    const uniqueEmails = Array.from(new Set(recipientEmails));

    if (uniqueEmails.length === 0) {
      alert('No parent email found for this registration.');
      return;
    }

    const studentName = `${registration.student_first_name} ${registration.student_last_name}`.trim();
    const schoolName = registration.organization_name || 'your school';

    if (!confirm(`Send POP upload link to ${uniqueEmails.join(', ')}?`)) {
      return;
    }

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    if (!baseUrl) {
      alert('Unable to build the upload link. Please try again.');
      return;
    }

    setSendingPopLinkId(registration.id);
    try {
      const results = await Promise.all(uniqueEmails.map(async (recipient) => {
        const params = new URLSearchParams({
          registration_id: registration.id,
          email: recipient,
        });
        const uploadLink = `${baseUrl}/registration/pop-upload?${params.toString()}`;
        const emailBody = `
          <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
            <h2 style="color: #1d4ed8; margin-bottom: 8px;">Upload Proof of Payment</h2>
            <p>Dear Parent,</p>
            <p>We are finalizing <strong>${studentName}</strong>'s registration at <strong>${schoolName}</strong>.</p>
            <p>Please upload your proof of payment using the secure link below:</p>
            <p style="margin: 20px 0;">
              <a href="${uploadLink}" style="display: inline-block; background: #1d4ed8; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Upload Proof of Payment
              </a>
            </p>
            <p>If the button does not work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #475569;">${uploadLink}</p>
            <p style="font-size: 12px; color: #64748b; margin-top: 16px;">Do not share this link. It is intended only for the registered parent.</p>
          </div>
        `;

        return supabase.functions.invoke('send-email', {
          body: {
            to: recipient,
            subject: `Upload Proof of Payment - ${studentName}`,
            body: emailBody,
            confirmed: true,
            is_html: true,
          },
        });
      }));

      const failures = results.filter((result) => result.error);
      if (failures.length > 0) {
        console.error('POP link send errors:', failures.map((f) => f.error));
        alert('POP upload link sent to some recipients, but at least one email failed. Please try again.');
      } else {
        alert('✅ POP upload link sent successfully.');
      }
    } catch (error) {
      console.error('Error sending POP upload link:', error);
      alert('Failed to send POP upload link. Please try again.');
    } finally {
      setSendingPopLinkId(null);
    }
  };

  // Verify payment
  const handleVerifyPayment = async (registration: Registration, verify: boolean) => {
    const action = verify ? 'verify' : 'unverify';
    if (!confirm(`${verify ? 'Verify' : 'Remove verification for'} payment for ${registration.student_first_name} ${registration.student_last_name}?`)) {
      return;
    }

    setProcessing(registration.id);
    try {
      // Update directly using client (RLS will handle permissions)
      const updateData: any = {
        payment_verified: verify,
        payment_date: verify ? new Date().toISOString() : null,
      };
      
      if (verify) {
        updateData.registration_fee_paid = true;
      }

      const { error } = await supabase
        .from('registration_requests')
        .update(updateData)
        .eq('id', registration.id);

      if (error) throw error;

      // Also update students table if exists - parent dashboard reads from students table
      console.log('[VerifyPayment] Updating students table for:', {
        preschool_id: registration.organization_id,
        first_name: registration.student_first_name,
        last_name: registration.student_last_name,
      });
      
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .update(updateData)
        .eq('preschool_id', registration.organization_id)
        .ilike('first_name', registration.student_first_name)
        .ilike('last_name', registration.student_last_name)
        .select();

      if (studentError) {
        console.error('[VerifyPayment] Error updating students table:', studentError);
      } else if (!studentData || studentData.length === 0) {
        console.warn('[VerifyPayment] No matching student found in students table. Payment verified in registration_requests only.');
        alert(`Payment ${verify ? 'verified' : 'verification removed'}!\n\n⚠️ Note: No matching student record found. The parent's dashboard may not reflect this change until the student record is synced.`);
        await fetchRegistrations();
        return;
      } else {
        console.log('[VerifyPayment] Successfully updated', studentData.length, 'student(s):', studentData);
      }

      alert(`Payment ${verify ? 'verified' : 'verification removed'}!`);
      await fetchRegistrations();
    } catch (error: any) {
      console.error(`Error ${action}ing payment:`, error);
      alert(`Failed to ${action} payment. Please try again.`);
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
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update in LOCAL database
      const { error } = await supabase
        .from('registration_requests')
        .update({
          status: 'rejected',
          reviewed_by: user?.email,
          reviewed_date: new Date().toISOString(),
          rejection_reason: reason,
          registration_fee_paid: false, // Clear payment status when rejecting
        })
        .eq('id', registration.id);

      if (error) throw error;

      // Send rejection notification (email + push) to guardian
      try {
        const childName = `${registration.student_first_name} ${registration.student_last_name}`.trim();
        const guardianEmail = registration.guardian_email || registration.parent_email;
        const schoolName = registration.organization_name || profile?.preschoolName || 'your school';

        if (guardianEmail) {
          await supabase.functions.invoke('notifications-dispatcher', {
            body: {
              event_type: 'child_registration_rejected',
              recipient_email: guardianEmail,
              registration_id: registration.id,
              child_name: childName,
              school_name: schoolName,
              rejection_reason: reason,
              preschool_id: registration.organization_id,
              include_email: true,
              email_template_override: {
                subject: `Registration Update — ${childName} at ${schoolName}`,
                html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.7"><h2 style="color:#dc2626">Registration Update</h2><p>Dear ${registration.guardian_name || 'Parent'},</p><p>We regret to inform you that <strong>${childName}</strong>'s registration at <strong>${schoolName}</strong> was not approved at this time.</p>${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}<p>If you believe this is an error or have questions, please contact the school directly.</p><p style="font-size:13px;color:#64748b;margin-top:16px">This is an automated message from EduDash Pro.</p></div>`,
                text: `${childName}'s registration at ${schoolName} was not approved. ${reason ? 'Reason: ' + reason : ''} Please contact the school for more information.`,
              },
            },
          });
        }
      } catch (notifErr) {
        console.warn('Failed to send rejection notification:', notifErr);
      }

      await fetchRegistrations();
      alert('Registration rejected. The guardian has been notified.');
    } catch (error) {
      console.error('Error rejecting registration:', error);
      alert('Failed to reject registration. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <PrincipalShell hideRightSidebar={true}>
      {/* Full-width page - override content padding */}
      <div className="registrations-page">
        {/* Header */}
        <div className="reg-header">
          <div className="reg-header-inner">
            <div>
              <h1 className="reg-title">Registrations</h1>
              <p className="reg-subtitle">
                Review and approve registration requests from parents
              </p>
            </div>
            {usesEdusiteSync && (
              <button
                onClick={handleManualSync}
                disabled={syncing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  background: syncing ? '#374151' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  opacity: syncing ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                {syncing ? 'Syncing...' : 'Sync from EduSite'}
              </button>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="reg-stats">
          <div className="reg-stats-inner">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-gray-300">
                <span className="font-semibold">{registrations.length}</span> Total
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-gray-300">
                <span className="font-semibold">{registrations.filter(r => r.status === 'pending').length}</span> Pending
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-300">
                <span className="font-semibold">{registrations.filter(r => r.status === 'approved').length}</span> Approved
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-gray-300">
                <span className="font-semibold">{registrations.filter(r => r.status === 'rejected').length}</span> Rejected
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="reg-filters">
          <div className="reg-filters-inner">
            {['all', 'pending', 'approved', 'rejected'].map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter as any)}
                className={`reg-filter-btn ${
                  statusFilter === filter ? 'reg-filter-btn-active' : ''
                }`}
              >
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Table / Cards */}
        <div className="reg-table-container">
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : filteredRegistrations.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No registrations found
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="reg-table-wrapper desktop-only">
                <table className="reg-table">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Student</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Parent</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Fee</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Payment</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRegistrations.map((reg) => (
                      <tr
                        key={reg.id}
                        className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div>
                            <div className="text-sm font-medium text-white">
                              {reg.student_first_name} {reg.student_last_name?.toUpperCase()}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              DOB: {new Date(reg.student_dob).toLocaleDateString()}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <div className="text-sm font-medium text-white">{reg.guardian_name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{reg.guardian_email}</div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium text-white">R{reg.registration_fee_amount || 200}</div>
                        </td>
                        <td className="py-3 px-4">
                          {reg.payment_verified && reg.status !== 'rejected' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                              <span className="text-green-400 font-medium">Verified</span>
                            </span>
                          ) : reg.registration_fee_paid && reg.status !== 'rejected' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                              <span className="text-yellow-400 font-medium">Paid (Pending)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                              <span className="text-red-400 font-medium">No Payment</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                            reg.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                            reg.status === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {reg.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400">
                          {new Date(reg.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => router.push(`/dashboard/principal/registrations/${reg.id}`)}
                              className="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
                            >
                              View
                            </button>
                            {reg.status === 'approved' && reg.proof_of_payment_url && !reg.payment_verified && (
                              <button
                                onClick={() => handleVerifyPayment(reg, true)}
                                disabled={processing === reg.id}
                                className="text-yellow-400 hover:text-yellow-300 text-xs font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
                                title="Verify payment proof"
                              >
                                <ShieldCheck size={14} />
                                Verify
                              </button>
                            )}
                            {reg.status === 'approved' && reg.payment_verified && (
                              <button
                                onClick={() => handleVerifyPayment(reg, false)}
                                disabled={processing === reg.id}
                                className="text-gray-400 hover:text-gray-300 text-xs font-medium disabled:opacity-50 transition-colors"
                                title="Remove verification"
                              >
                                Unverify
                              </button>
                            )}
                            {reg.status === 'pending' && (
                              <>
                                {!reg.proof_of_payment_url && (
                                  <button
                                    onClick={() => handleSendPopUploadLink(reg)}
                                    disabled={sendingPopLinkId === reg.id}
                                    className="text-blue-400 hover:text-blue-300 text-xs font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
                                    title="Send proof of payment upload link"
                                  >
                                    <Mail size={14} />
                                    {sendingPopLinkId === reg.id ? 'Sending...' : 'Send POP Link'}
                                  </button>
                                )}
                                {reg.proof_of_payment_url && !reg.payment_verified && (
                                  <button
                                    onClick={() => handleVerifyPayment(reg, true)}
                                    disabled={processing === reg.id}
                                    className="text-yellow-400 hover:text-yellow-300 text-xs font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
                                    title="Verify payment proof"
                                  >
                                    <ShieldCheck size={14} />
                                    Verify
                                  </button>
                                )}
                                <button
                                  onClick={() => handleApprove(reg)}
                                  disabled={processing === reg.id || !reg.payment_verified}
                                  className="text-green-400 hover:text-green-300 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  title={!reg.payment_verified ? "Please verify payment first" : "Approve registration"}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject(reg)}
                                  disabled={processing === reg.id}
                                  className="text-red-400 hover:text-red-300 text-xs font-medium disabled:opacity-50 transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="mobile-only reg-cards">
                {filteredRegistrations.map((reg) => (
                  <div
                    key={reg.id}
                    className="reg-card"
                    onClick={() => router.push(`/dashboard/principal/registrations/${reg.id}`)}
                  >
                    <div className="reg-card-header">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="reg-card-student">
                            {reg.student_first_name} {reg.student_last_name?.toUpperCase()}
                          </h3>
                          <p className="reg-card-meta">
                            <Baby size={12} className="inline" /> {new Date(reg.student_dob).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                          reg.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                          reg.status === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                          'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {reg.status}
                        </span>
                      </div>
                    </div>

                    <div className="reg-card-body">
                      <div className="reg-card-info">
                        <User size={14} className="text-gray-500" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{reg.guardian_name}</div>
                          <div className="text-xs text-gray-500">{reg.guardian_email}</div>
                        </div>
                      </div>

                      <div className="reg-card-info">
                        <DollarSign size={14} className="text-gray-500" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">R{reg.registration_fee_amount || 200}</div>
                          {reg.payment_verified && reg.status !== 'rejected' ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                              <span className="text-green-400">Verified</span>
                            </div>
                          ) : reg.registration_fee_paid && reg.status !== 'rejected' ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                              <span className="text-yellow-400">Paid (Pending)</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs">
                              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                              <span className="text-red-400">No Payment</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="reg-card-info">
                        <Calendar size={14} className="text-gray-500" />
                        <span className="text-sm text-gray-400">
                          {new Date(reg.created_at).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                      </div>
                    </div>

                    {reg.status === 'approved' && reg.proof_of_payment_url && !reg.payment_verified && (
                      <div className="reg-card-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVerifyPayment(reg, true);
                          }}
                          disabled={processing === reg.id}
                          className="reg-card-btn reg-card-btn-verify"
                          title="Verify payment proof"
                        >
                          <ShieldCheck size={16} />
                          Verify Payment
                        </button>
                      </div>
                    )}
                    {reg.status === 'approved' && reg.payment_verified && (
                      <div className="reg-card-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVerifyPayment(reg, false);
                          }}
                          disabled={processing === reg.id}
                          className="reg-card-btn reg-card-btn-unverify"
                        >
                          Remove Verification
                        </button>
                      </div>
                    )}
                    {reg.status === 'pending' && (
                      <>
                        {!reg.proof_of_payment_url && (
                          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 rounded">
                            <Clock className="w-3 h-3" />
                            Waiting for proof of payment
                          </div>
                        )}
                        {reg.proof_of_payment_url && !reg.payment_verified && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                            <ShieldCheck className="w-3 h-3" />
                            POP uploaded - verify payment before approving
                          </div>
                        )}
                        <div className="reg-card-actions">
                          {!reg.proof_of_payment_url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendPopUploadLink(reg);
                              }}
                              disabled={sendingPopLinkId === reg.id}
                              className="reg-card-btn reg-card-btn-link"
                              title="Send proof of payment upload link"
                            >
                              <Mail size={16} />
                              {sendingPopLinkId === reg.id ? 'Sending...' : 'Send POP Link'}
                            </button>
                          )}
                          {reg.proof_of_payment_url && !reg.payment_verified && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVerifyPayment(reg, true);
                              }}
                              disabled={processing === reg.id}
                              className="reg-card-btn reg-card-btn-verify"
                              title="Verify payment proof"
                            >
                              <ShieldCheck size={16} />
                              Verify Payment
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(reg);
                            }}
                            disabled={processing === reg.id || !reg.payment_verified}
                            className="reg-card-btn reg-card-btn-approve disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!reg.payment_verified ? "Please verify payment first" : "Approve registration"}
                          >
                            <CheckCircle2 size={16} />
                            Approve
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReject(reg);
                            }}
                            disabled={processing === reg.id}
                            className="reg-card-btn reg-card-btn-reject"
                          >
                            <XCircle size={16} />
                            Reject
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        /* Override content padding for full-width layout */
        .registrations-page {
          margin: calc(var(--space-3) * -1) calc(var(--space-2) * -1);
          min-height: calc(100vh - var(--topbar-h));
          background: #111827;
        }
        @media(min-width:640px) {
          .registrations-page {
            margin: calc(var(--space-4) * -1) calc(var(--space-3) * -1);
          }
        }
        @media(min-width:768px) {
          .registrations-page {
            margin: calc(var(--space-3) * -1) calc(var(--space-4) * -1);
          }
        }
        
        /* Header */
        .reg-header {
          border-bottom: 1px solid #374151;
          padding: 20px 24px;
        }
        .reg-header-inner {
          max-width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .reg-title {
          font-size: 20px;
          font-weight: 600;
          color: #fff;
          margin: 0;
        }
        .reg-subtitle {
          font-size: 13px;
          color: #9ca3af;
          margin: 4px 0 0 0;
        }
        
        /* Stats */
        .reg-stats {
          background: #1f2937;
          border-bottom: 1px solid #374151;
          padding: 12px 24px;
        }
        .reg-stats-inner {
          display: flex;
          align-items: center;
          gap: 24px;
          font-size: 13px;
        }
        
        /* Filters */
        .reg-filters {
          border-bottom: 1px solid #374151;
          padding: 0 24px;
        }
        .reg-filters-inner {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .reg-filter-btn {
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 500;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
          cursor: pointer;
          background: none;
          border-top: none;
          border-left: none;
          border-right: none;
        }
        .reg-filter-btn-active {
          border-bottom-color: #f97316;
          color: #fb923c;
        }
        .reg-filter-btn:not(.reg-filter-btn-active) {
          color: #9ca3af;
        }
        .reg-filter-btn:not(.reg-filter-btn-active):hover {
          color: #e5e7eb;
        }
        
        /* Table Container */
        .reg-table-container {
          padding: 16px 24px;
          width: 100%;
        }
        .reg-table-wrapper {
          overflow-x: auto;
          width: 100%;
        }
        .reg-table {
          width: 100%;
          min-width: 100%;
          border-collapse: collapse;
        }
        .reg-table thead tr {
          border-bottom: 1px solid #374151;
        }
        .reg-table th {
          text-align: left;
          padding: 12px 16px;
          font-size: 11px;
          font-weight: 500;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .reg-table th:last-child {
          text-align: right;
        }
        .reg-table tbody tr {
          border-bottom: 1px solid #1f2937;
          transition: background-color 0.15s;
        }
        .reg-table tbody tr:hover {
          background-color: rgba(31, 41, 55, 0.5);
        }
        .reg-table td {
          padding: 12px 16px;
        }

        /* Mobile Cards */
        .reg-cards {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .reg-card {
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s;
        }
        .reg-card:active {
          transform: scale(0.98);
        }
        .reg-card-header {
          padding: 16px;
          border-bottom: 1px solid #374151;
        }
        .reg-card-student {
          font-size: 16px;
          font-weight: 600;
          color: #fff;
          margin: 0 0 4px 0;
        }
        .reg-card-meta {
          font-size: 12px;
          color: #9ca3af;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .reg-card-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .reg-card-info {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .reg-card-actions {
          padding: 12px 16px;
          border-top: 1px solid #374151;
          display: flex;
          gap: 8px;
        }
        .reg-card-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          border: 1px solid;
          transition: all 0.2s;
          cursor: pointer;
        }
        .reg-card-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .reg-card-btn-approve {
          background: rgba(34, 197, 94, 0.1);
          border-color: rgba(34, 197, 94, 0.2);
          color: #4ade80;
        }
        .reg-card-btn-approve:active:not(:disabled) {
          background: rgba(34, 197, 94, 0.2);
        }
        .reg-card-btn-reject {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }
        .reg-card-btn-reject:active:not(:disabled) {
          background: rgba(239, 68, 68, 0.2);
        }
        .reg-card-btn-verify {
          background: rgba(234, 179, 8, 0.1);
          border-color: rgba(234, 179, 8, 0.2);
          color: #facc15;
        }
        .reg-card-btn-verify:active:not(:disabled) {
          background: rgba(234, 179, 8, 0.2);
        }
        .reg-card-btn-unverify {
          background: rgba(107, 114, 128, 0.1);
          border-color: rgba(107, 114, 128, 0.2);
          color: #9ca3af;
        }
        .reg-card-btn-unverify:active:not(:disabled) {
          background: rgba(107, 114, 128, 0.2);
        }
        .reg-card-btn-link {
          background: rgba(59, 130, 246, 0.12);
          border-color: rgba(59, 130, 246, 0.3);
          color: #60a5fa;
        }
        .reg-card-btn-link:active:not(:disabled) {
          background: rgba(59, 130, 246, 0.2);
        }

        /* Responsive */
        .mobile-only {
          display: none;
        }
        .desktop-only {
          display: block;
        }

        @media (max-width: 768px) {
          .mobile-only {
            display: flex;
          }
          .desktop-only {
            display: none;
          }
          .reg-header {
            padding: 16px;
          }
          .reg-stats {
            padding: 12px 16px;
          }
          .reg-stats-inner {
            flex-wrap: wrap;
            gap: 12px;
          }
          .reg-filters {
            padding: 0 16px;
          }
          .reg-filters-inner {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .reg-filter-btn {
            white-space: nowrap;
            padding: 12px 12px;
            font-size: 12px;
          }
          .reg-table-container {
            padding: 12px 16px;
          }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PrincipalShell>
  );
}
