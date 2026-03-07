'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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
  Download,
  DollarSign,
  ArrowLeft,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';

interface Registration {
  id: string;
  organization_id: string;
  organization_name?: string;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_address: string;
  parent_email?: string | null;
  student_first_name: string;
  student_last_name: string;
  student_dob: string;
  student_gender: string;
  student_birth_certificate_url?: string;
  student_clinic_card_url?: string;
  guardian_id_document_url?: string;
  documents_uploaded: boolean;
  documents_deadline?: string;
  payment_reference?: string;
  registration_fee_amount?: number;
  registration_fee_paid: boolean;
  payment_verified?: boolean;
  payment_method?: string;
  proof_of_payment_url?: string;
  campaign_applied?: string;
  discount_amount?: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  created_at: string;
}

export default function RegistrationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [popVerified, setPopVerified] = useState(false);
  const [sendingPopLink, setSendingPopLink] = useState(false);

  useEffect(() => {
    fetchRegistration();
  }, [params.id]);

  const fetchRegistration = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('registration_requests')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;
      setRegistration(data);
      
      // If payment is already verified, set popVerified to true
      if (data.registration_fee_paid) {
        setPopVerified(true);
      }
    } catch (error) {
      console.error('Error fetching registration:', error);
      alert('Failed to load registration details');
      router.push('/dashboard/principal/registrations');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!registration) return;

    if (!confirm(`Approve registration for ${registration.student_first_name} ${registration.student_last_name}?`)) {
      return;
    }

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Only update status - payment should already be verified
      const updates: any = {
        status: 'approved',
        reviewed_by: user?.email,
        reviewed_date: new Date().toISOString(),
      };

      // Update local EduDashPro database
      const { error } = await supabase
        .from('registration_requests')
        .update(updates)
        .eq('id', registration.id);

      if (error) throw error;

      // Trigger sync to create parent account and student record
      console.log('Triggering sync for registration:', registration.id);
      const { data: syncResult, error: syncError } = await supabase.functions.invoke('sync-registration-to-edudash', {
        body: { registration_id: registration.id },
      });

      console.log('Sync result:', syncResult);
      console.log('Sync error:', syncError);

      // Send approval notification (email + push) to guardian
      try {
        const childName = `${registration.student_first_name} ${registration.student_last_name}`.trim();
        const guardianEmail = registration.guardian_email || registration.parent_email;
        const schoolName = registration.organization_name || 'your school';
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
        console.warn('Failed to send approval notification:', notifErr);
      }

      // Check if sync was successful
      if (syncError || (syncResult && !syncResult.success)) {
        const errorMessage = syncError?.message || syncResult?.error || 'Unknown error';
        console.error('Sync failed:', errorMessage);
        
        // Show error but don't block the approval
        alert(`⚠️ Registration approved locally.\n\nHowever, parent account creation ${syncError ? 'failed' : 'may have failed'}:\n${errorMessage}\n\nYou may need to create the parent account manually.`);
      } else {
        alert('✅ Registration approved successfully!\n\nParent account created and welcome email sent.');
      }

      router.push('/dashboard/principal/registrations');
    } catch (error) {
      console.error('Error approving registration:', error);
      alert('Failed to approve registration. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!registration) return;

    const reason = prompt(`Enter reason for rejecting ${registration.student_first_name} ${registration.student_last_name}'s registration:`);
    if (!reason) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

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
        const schoolName = registration.organization_name || 'your school';

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

      alert('Registration rejected. The guardian has been notified.');
      router.push('/dashboard/principal/registrations');
    } catch (error) {
      console.error('Error rejecting registration:', error);
      alert('Failed to reject registration. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleVerifyPayment = async (verify: boolean) => {
    if (!registration) return;

    const action = verify ? 'verify' : 'remove verification for';
    if (!confirm(`${verify ? 'Verify' : 'Remove verification for'} payment for ${registration.student_first_name} ${registration.student_last_name}?`)) {
      return;
    }

    setProcessing(true);
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
        await fetchRegistration();
        return;
      } else {
        console.log('[VerifyPayment] Successfully updated', studentData.length, 'student(s):', studentData);
      }

      alert(`Payment ${verify ? 'verified' : 'verification removed'}!`);
      await fetchRegistration();
    } catch (error: any) {
      console.error(`Error ${action}ing payment:`, error);
      alert(`Failed to ${action} payment. Please try again.`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSendPopUploadLink = async () => {
    if (!registration) return;

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

    setSendingPopLink(true);
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
        alert('POP upload link sent to some recipients, but at least one email failed.');
      } else {
        alert('✅ POP upload link sent successfully.');
      }
    } catch (error) {
      console.error('Error sending POP upload link:', error);
      alert('Failed to send POP upload link. Please try again.');
    } finally {
      setSendingPopLink(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!registration) return;

    const reason = prompt(`⚠️ WARNING: This will DELETE the student and potentially their parent account.

Enter reason for deletion:
(This will be sent to the parent)`);
    if (!reason) return;

    if (!confirm(`🚨 FINAL CONFIRMATION 🚨

This will:
- Delete ${registration.student_first_name} ${registration.student_last_name}
- Delete the registration record
- Potentially delete the parent's account if no other students
- Send an email notification

Type 'DELETE' to confirm this cannot be undone.`)) {
      return;
    }

    setProcessing(true);
    try {
      // First, find the student ID from the approved registration
      // Use ILIKE with wildcards to handle trailing/leading spaces in DB
      const trimmedFirstName = registration.student_first_name?.trim() || '';
      const trimmedLastName = registration.student_last_name?.trim() || '';
      
      // Query with ILIKE pattern using wildcards to match with any whitespace
      const { data: students, error: findError } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('preschool_id', registration.organization_id)
        .ilike('first_name', `${trimmedFirstName}%`)
        .ilike('last_name', `${trimmedLastName}%`);

      if (findError) {
        console.error('Student lookup error:', findError);
        throw new Error(`Database error: ${findError.message}`);
      }

      if (!students || students.length === 0) {
        console.error('No student found matching:', {
          preschool_id: registration.organization_id,
          first_name: trimmedFirstName,
          last_name: trimmedLastName
        });
        throw new Error('Student not found in database. They may not have been approved yet.');
      }

      const studentId = students[0].id;
      const studentName = `${students[0].first_name.trim()} ${students[0].last_name.trim()}`;

      console.log('[Delete Student] Found student:', studentId, studentName);

      // Get guardian info before deletion
      const { data: guardianRelation } = await supabase
        .from('student_guardians')
        .select('guardian_id, profiles!inner(email, first_name, last_name)')
        .eq('student_id', studentId)
        .eq('primary_contact', true)
        .single();

      const parentEmail = guardianRelation?.profiles?.email;
      const guardianId = guardianRelation?.guardian_id;
      const profile = guardianRelation?.profiles;
      const parentName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Parent' : 'Parent';

      // Delete ALL registration requests for this student/parent combo
      // This allows parent to re-register if needed
      // NOTE: Trial records are preserved in trial_usage_log to prevent duplicate trials
      const { error: regDeleteError } = await supabase
        .from('registration_requests')
        .delete()
        .eq('organization_id', registration.organization_id)
        .eq('guardian_email', parentEmail || registration.guardian_email);

      if (regDeleteError) {
        console.error('Error deleting registration requests:', regDeleteError);
      } else {
        console.log('✅ Registration requests deleted for parent:', parentEmail);
        console.log('ℹ️ Trial records preserved in trial_usage_log (no duplicate trials allowed)');
      }

      // Delete student record (cascades will handle related records)
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);

      if (deleteError) {
        console.error('Error deleting student:', deleteError);
        throw new Error('Failed to delete student from database');
      }

      console.log('✅ Student deleted successfully');

      // Check if parent has other students
      let hasOtherStudents = false;
      if (guardianId) {
        const { data: otherStudents } = await supabase
          .from('student_guardians')
          .select('student_id, students!inner(id, preschool_id)')
          .eq('guardian_id', guardianId)
          .eq('students.preschool_id', registration.organization_id);

        hasOtherStudents = otherStudents && otherStudents.length > 0;
      }

      // Create in-app notification for the parent
      if (guardianId) {
        try {
          const schoolName = registration.organization_name || 'the school';
          const notificationTitle = hasOtherStudents 
            ? `Student Removed: ${studentName}`
            : 'Account Closed';
          const notificationMessage = hasOtherStudents
            ? `${studentName} has been removed from ${schoolName}.${reason ? ` Reason: ${reason}` : ''} You still have other students enrolled.`
            : `${studentName} has been removed from ${schoolName} and your account has been closed.${reason ? ` Reason: ${reason}` : ''} You can rejoin by registering again.`;

          const { error: notifError } = await supabase
            .from('notifications')
            .insert({
              user_id: guardianId,
              title: notificationTitle,
              message: notificationMessage,
              type: 'warning',
              preschool_id: registration.organization_id,
              metadata: {
                student_name: studentName,
                deletion_reason: reason,
                has_other_students: hasOtherStudents,
                deleted_at: new Date().toISOString(),
              },
            });

          if (notifError) {
            console.error('Error creating notification:', notifError);
          } else {
            console.log('✅ In-app notification created for parent');
          }

          // Also send push notification to device
          try {
            await supabase
              .from('push_notifications')
              .insert({
                recipient_user_id: guardianId,
                title: notificationTitle,
                body: notificationMessage,
                notification_type: hasOtherStudents ? 'student_removed' : 'account_closed',
                preschool_id: registration.organization_id,
                status: 'sent',
                data: {
                  type: 'student_deletion',
                  student_name: studentName,
                  deletion_reason: reason,
                  has_other_students: hasOtherStudents,
                  action: 'view_notifications',
                },
              });
            console.log('✅ Push notification queued for delivery');
          } catch (pushError) {
            console.error('Error sending push notification (non-critical):', pushError);
          }
        } catch (notifError) {
          console.error('Error creating notification (non-critical):', notifError);
        }
      }

      // Send email notification to parent
      if (parentEmail) {
        try {
          const profile = guardianRelation?.profiles;
          const parentName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Parent' : 'Parent';
          const schoolName = registration.organization_name || 'the school';
          
          const emailSubject = hasOtherStudents 
            ? `Student Removed from ${schoolName} - ${studentName}`
            : `Account Closed - ${schoolName}`;
          
          const emailMessage = hasOtherStudents
            ? `Dear ${parentName},\n\nWe are writing to inform you that ${studentName} has been removed from ${schoolName}.\n\n${reason ? `Reason: ${reason}\n\n` : ''}You still have other students enrolled at this school.\n\nIf you have any questions, please contact the school administration.\n\nBest regards,\n${schoolName}\nEduDash Pro Team`
            : `Dear ${parentName},\n\nWe are writing to inform you that ${studentName} has been removed from ${schoolName}, and your account with this school has been closed.\n\n${reason ? `Reason: ${reason}\n\n` : ''}You can re-register at any time by visiting our registration page. Your previous registration has been cleared to allow you to register again if needed.\n\nTo rejoin:\n1. Visit the school's registration page\n2. Complete the registration form\n3. Upload required documents\n4. Wait for approval\n\nFor other options, you can:\n• Join another school\n• Use the "EduDash Pro Community" for free learning resources\n\nIf you have any questions, please contact support@edudashpro.org.za\n\nBest regards,\n${schoolName}\nEduDash Pro Team`;

          const { error: emailError } = await supabase.functions.invoke('send-email', {
            body: {
              to: parentEmail,
              subject: emailSubject,
              message: emailMessage,
            },
          });

          if (emailError) {
            console.error('Email notification failed:', emailError);
          } else {
            console.log('✅ Email notification sent to:', parentEmail);
          }
        } catch (emailError) {
          console.error('Error sending email (non-critical):', emailError);
        }
      }

      alert(`✅ Student deleted successfully!\n\nStudent: ${studentName}\nParent: ${parentEmail || 'Unknown'}\n${parentEmail ? '📧 Email sent\n🔔 In-app notification created\n✅ Registration cleared (parent can re-register)' : 'No notifications sent (no parent email)'}\nOther students: ${hasOtherStudents ? 'Yes' : 'No'}`);
      
      router.push('/dashboard/principal/registrations');
    } catch (error: any) {
      console.error('Error deleting student:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <PrincipalShell hideRightSidebar={true}>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-amber-600"></div>
            <p className="mt-4 text-gray-400">Loading registration details...</p>
          </div>
        </div>
      </PrincipalShell>
    );
  }

  if (!registration) {
    return null;
  }

  return (
    <PrincipalShell hideRightSidebar={true}>
      <div className="section">
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.push('/dashboard/principal/registrations')}
            className="btn btnSecondary"
            style={{ marginBottom: 16 }}
          >
            <ArrowLeft size={18} style={{ marginRight: 8 }} />
            Back to Registrations
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <h1 className="h1">Registration Details</h1>
              <p style={{ color: 'var(--muted)', marginTop: 4 }}>
                {registration.student_first_name} {registration.student_last_name}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {registration.status === 'approved' && registration.proof_of_payment_url && !registration.payment_verified && (
                <button
                  onClick={() => handleVerifyPayment(true)}
                  disabled={processing}
                  className="btn"
                  style={{ 
                    background: '#f59e0b',
                    color: 'white',
                    opacity: processing ? 0.5 : 1 
                  }}
                >
                  <ShieldCheck size={18} style={{ marginRight: 8 }} />
                  Verify Payment
                </button>
              )}
              {registration.status === 'approved' && registration.payment_verified && (
                <button
                  onClick={() => handleVerifyPayment(false)}
                  disabled={processing}
                  className="btn"
                  style={{ 
                    background: '#6b7280',
                    color: 'white',
                    opacity: processing ? 0.5 : 1 
                  }}
                >
                  <XCircle size={18} style={{ marginRight: 8 }} />
                  Unverify Payment
                </button>
              )}
              {registration.status === 'approved' && (
                <button
                  onClick={handleDeleteStudent}
                  disabled={processing}
                  className="btn"
                  style={{ 
                    background: '#dc2626',
                    color: 'white',
                    opacity: processing ? 0.5 : 1 
                  }}
                >
                  <Trash2 size={18} style={{ marginRight: 8 }} />
                  Delete Student
                </button>
              )}
              {registration.status === 'pending' && (
                <>
                  {registration.proof_of_payment_url && !registration.payment_verified && (
                    <button
                      onClick={() => handleVerifyPayment(true)}
                      disabled={processing}
                      className="btn"
                      style={{ 
                        background: '#f59e0b',
                        color: 'white',
                        opacity: processing ? 0.5 : 1 
                      }}
                    >
                      <ShieldCheck size={18} style={{ marginRight: 8 }} />
                      Verify Payment
                    </button>
                  )}
                  <button
                    onClick={handleReject}
                    disabled={processing}
                    className="btn"
                    style={{ 
                      background: 'var(--red)', 
                      color: 'white',
                      opacity: processing ? 0.5 : 1 
                    }}
                  >
                    <XCircle size={18} style={{ marginRight: 8 }} />
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={processing || !registration.payment_verified}
                    className="btn btnPrimary"
                    style={{ 
                      opacity: (processing || !registration.payment_verified) ? 0.5 : 1,
                      cursor: (!registration.payment_verified) ? 'not-allowed' : 'pointer'
                    }}
                    title={!registration.payment_verified ? 'Please verify payment first' : 'Approve registration'}
                  >
                    <CheckCircle2 size={18} style={{ marginRight: 8 }} />
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Grid - Mobile: Stack, Tablet+: 2 columns */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr',
          gap: 16,
          marginBottom: 24 
        }} className="reg-detail-grid">
          {/* Student Information */}
          <div className="card">
            <h3 className="sectionTitle" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Baby size={20} color="var(--primary)" />
              Student Information
            </h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Name</div>
                <div style={{ marginTop: 6, fontSize: 15, fontWeight: 500 }}>
                  {registration.student_first_name} {registration.student_last_name}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date of Birth</div>
                <div style={{ marginTop: 6, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={16} color="var(--muted)" />
                  {new Date(registration.student_dob).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gender</div>
                <div style={{ marginTop: 6, fontSize: 15, textTransform: 'capitalize' }}>
                  {registration.student_gender || 'Not specified'}
                </div>
              </div>
            </div>
          </div>

          {/* Guardian Information */}
          <div className="card">
            <h3 className="sectionTitle" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={20} color="var(--primary)" />
              Guardian Information
            </h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</div>
                <div style={{ marginTop: 6, fontSize: 15, fontWeight: 500 }}>
                  {registration.guardian_name}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
                <div style={{ marginTop: 6, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mail size={16} color="var(--muted)" />
                  {registration.guardian_email}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</div>
                <div style={{ marginTop: 6, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Phone size={16} color="var(--muted)" />
                  {registration.guardian_phone}
                </div>
              </div>
            </div>
          </div>

          {/* Registration Details */}
          <div className="card">
            <h3 className="sectionTitle" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={20} color="var(--primary)" />
              Registration Details
            </h3>
            <div style={{ display: 'grid', gap: 16 }}>
              {registration.payment_reference && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Reference</div>
                  <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>
                    {registration.payment_reference}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 20,
                    background: registration.status === 'pending' ? '#fef3c7' : registration.status === 'approved' ? '#d1fae5' : '#fee2e2',
                    color: registration.status === 'pending' ? '#92400e' : registration.status === 'approved' ? '#065f46' : '#991b1b'
                  }}>
                    <div style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      marginRight: 8,
                      background: registration.status === 'pending' ? '#f59e0b' : registration.status === 'approved' ? '#10b981' : '#ef4444'
                    }} />
                    {registration.status}
                  </span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registration Date</div>
                <div style={{ marginTop: 6, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={16} color="var(--muted)" />
                  {new Date(registration.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registration Fee</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
                  R{registration.registration_fee_amount || 200}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="card">
            <h3 className="sectionTitle" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign size={20} color="var(--primary)" />
              Payment Status
            </h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Status</div>
                <div style={{ marginTop: 6 }}>
                  {registration.payment_verified && registration.status !== 'rejected' ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 8,
                      background: '#d1fae5',
                      color: '#065f46'
                    }}>
                      <ShieldCheck size={16} />
                      Verified
                    </span>
                  ) : registration.registration_fee_paid && registration.status !== 'rejected' ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 8,
                      background: '#fef3c7',
                      color: '#92400e'
                    }}>
                      <Clock size={16} />
                      Paid (Pending)
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 8,
                      background: '#fee2e2',
                      color: '#991b1b'
                    }}>
                      <XCircle size={16} />
                      No Payment
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proof of Payment</div>
                <div style={{ marginTop: 6 }}>
                  {registration.proof_of_payment_url ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {registration.payment_verified ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 12px',
                          fontSize: 13,
                          fontWeight: 500,
                          borderRadius: 8,
                          background: '#d1fae5',
                          color: '#065f46'
                        }}>
                          <CheckCircle2 size={16} />
                          Verified
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 12px',
                          fontSize: 13,
                          fontWeight: 500,
                          borderRadius: 8,
                          background: '#fef3c7',
                          color: '#92400e'
                        }}>
                          <Clock size={16} />
                          Pending Verification
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 8,
                      background: '#fee2e2',
                      color: '#991b1b'
                    }}>
                      <XCircle size={16} />
                      Not Uploaded
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Proof of Payment Section - Full Width */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 className="sectionTitle" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={20} color="var(--primary)" />
              Proof of Payment
            </h3>
            {registration.proof_of_payment_url && registration.payment_verified && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 20,
                background: '#d1fae5',
                color: '#065f46'
              }}>
                <CheckCircle2 size={18} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Verified</span>
              </div>
            )}
          </div>

          {registration.proof_of_payment_url ? (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* POP Image Preview */}
              <div style={{
                position: 'relative',
                borderRadius: 12,
                overflow: 'hidden',
                border: '2px solid var(--border)',
                background: '#000'
              }}>
                <img
                  src={registration.proof_of_payment_url}
                  alt="Proof of Payment"
                  style={{
                    width: '100%',
                    height: 'auto',
                    objectFit: 'contain',
                    maxHeight: '600px'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => window.open(registration.proof_of_payment_url, '_blank')}
                    className="btn"
                    style={{ background: 'var(--primary)' }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View Full Size
                  </button>
                  {!registration.payment_verified && (
                    <button
                      onClick={() => handleVerifyPayment(true)}
                      disabled={processing}
                      className="btn"
                      style={{ 
                        background: '#f59e0b',
                        color: 'white',
                        opacity: processing ? 0.5 : 1 
                      }}
                    >
                      <ShieldCheck size={16} style={{ marginRight: 8 }} />
                      Verify Payment
                    </button>
                  )}
                  {registration.payment_verified && (
                    <button
                      onClick={() => handleVerifyPayment(false)}
                      disabled={processing}
                      className="btn"
                      style={{ 
                        background: '#6b7280',
                        color: 'white',
                        opacity: processing ? 0.5 : 1 
                      }}
                    >
                      <XCircle size={16} style={{ marginRight: 8 }} />
                      Unverify Payment
                    </button>
                  )}
                </div>
              </div>

              {/* Warning if not verified */}
              {!registration.payment_verified && registration.status === 'pending' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 16,
                  borderRadius: 12,
                  border: '2px solid #fbbf24',
                  background: 'rgba(251, 191, 36, 0.1)'
                }}>
                  <div style={{
                    flexShrink: 0,
                    padding: 8,
                    background: '#f59e0b',
                    borderRadius: 8
                  }}>
                    <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>Payment Verification Required</h4>
                    <p style={{ marginTop: 4, fontSize: 13, color: '#fcd34d' }}>
                      Please verify the proof of payment before approving this registration.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 48,
              textAlign: 'center',
              borderRadius: 12,
              border: '2px dashed var(--border)',
              background: 'rgba(0,0,0,0.2)'
            }}>
              <div style={{
                padding: 16,
                background: 'var(--card)',
                borderRadius: '50%',
                marginBottom: 16
              }}>
                <FileText size={48} color="var(--muted)" />
              </div>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Proof of Payment</h4>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                The parent has not uploaded proof of payment yet.
              </p>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 8,
                border: '2px solid #ef4444',
                background: 'rgba(239, 68, 68, 0.1)'
              }}>
                <XCircle size={20} color="#ef4444" />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#ef4444' }}>
                  Cannot approve without payment verification
                </span>
              </div>
              <button
                onClick={handleSendPopUploadLink}
                disabled={sendingPopLink}
                className="btn"
                style={{
                  marginTop: 16,
                  background: '#2563eb',
                  color: 'white',
                  opacity: sendingPopLink ? 0.6 : 1,
                }}
              >
                <Mail size={16} style={{ marginRight: 8 }} />
                {sendingPopLink ? 'Sending...' : 'Send POP Upload Link'}
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .reg-detail-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        
        @media (min-width: 768px) {
          .reg-detail-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
          }
        }
        
        @media (min-width: 1024px) {
          .reg-detail-grid {
            gap: 24px;
          }
        }
      `}</style>
    </PrincipalShell>
  );
}
