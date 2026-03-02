/** useRegistrations — slim orchestrator hook. Delegates to extracted action files. */

import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { useAlertModal } from '@/components/ui/AlertModal';
import { logger } from '@/lib/logger';

import type { Registration, StatusFilter, UseRegistrationsReturn } from './types';
import { canApprove, hasValidPopUrl, getStartMonthIso, EDUDASH_COMMUNITY_SCHOOL_ID, EDUDASH_MAIN_SCHOOL_ID } from './helpers';
import { fetchRegistrationsData } from './fetchRegistrations';
import { approveInAppRegistration } from './approveInApp';
import { approveEdusiteRegistration } from './approveEdusite';
import { rejectRegistration as rejectRegistrationAction } from './rejectRegistration';
import { handleVerifyPayment as verifyPaymentAction } from './verifyPayment';
import { sendPaymentReminder as sendPaymentReminderAction } from './sendPaymentReminder';
import { sendPopUploadLink as sendPopUploadLinkAction } from './sendPopUploadLink';

export function useRegistrations(): UseRegistrationsReturn {
  const { user, profile } = useAuth();
  const organizationId = profile?.preschool_id || profile?.organization_id;

  const usesEdusiteSync =
    !!organizationId &&
    organizationId !== EDUDASH_COMMUNITY_SCHOOL_ID &&
    organizationId !== EDUDASH_MAIN_SCHOOL_ID;

  // --- State ---
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [error, setError] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [sendingPopLink, setSendingPopLink] = useState<string | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectingRegistration, setRejectingRegistration] = useState<Registration | null>(null);

  const { showAlert, alertProps } = useAlertModal();

  // --- Fetch ---
  const fetchRegistrations = useCallback(async () => {
    if (!organizationId) {
      logger.debug('Registrations', 'Waiting for organizationId');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchRegistrationsData(organizationId);
      setRegistrations(data);
    } catch (err: unknown) {
      const e = err as { message?: string };
      logger.error('Registrations', 'Fetch error', e);
      setError(e.message || 'Failed to load registrations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, usesEdusiteSync]);

  // Auto-fetch on mount and focus
  useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);
  useFocusEffect(useCallback(() => { fetchRegistrations(); }, [fetchRegistrations]));

  // Filtering
  useEffect(() => {
    let result = registrations;
    if (statusFilter !== 'all') result = result.filter((r) => r.status === statusFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          r.student_first_name?.toLowerCase().includes(q) ||
          r.student_last_name?.toLowerCase().includes(q) ||
          r.guardian_name?.toLowerCase().includes(q) ||
          r.guardian_email?.toLowerCase().includes(q),
      );
    }
    setFilteredRegistrations(result);
  }, [registrations, statusFilter, searchTerm]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchRegistrations(); }, [fetchRegistrations]);

  // --- Sync ---
  const handleSyncWithEduSite = async () => {
    if (!organizationId) return;
    setSyncing(true);
    try {
      const supabase = assertSupabase();
      const { data, error: syncError } = await supabase.functions.invoke('sync-registrations-from-edusite', {
        body: { organization_id: organizationId },
      });
      if (syncError) throw syncError;
      showAlert({ title: 'Sync Complete', message: data?.message || `Synced ${data?.count || 0} registrations from EduSitePro`, type: 'success', buttons: [{ text: 'OK', onPress: fetchRegistrations }] });
    } catch (err: unknown) {
      const e = err as { message?: string };
      logger.error('Registrations', 'Sync error', e);
      showAlert({ title: 'Sync Failed', message: e.message || 'Failed to sync with EduSitePro', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  // --- Approve ---
  const handleApprove = (registration: Registration) => {
    const isInApp = registration.source === 'in-app';
    const hasUnverifiedPayment = hasValidPopUrl(registration.proof_of_payment_url) && !registration.payment_verified;
    let message = `Approve registration for ${registration.student_first_name} ${registration.student_last_name}?`;
    if (isInApp) message += '\n\nThis will create a student profile.';
    if (hasUnverifiedPayment) message += '\n\n⚠️ Note: Payment has not been verified yet. Consider clicking "Verify" first to confirm the payment.';
    message += '\n\nWhen does the child start?';

    const approveWithStartDate = async (startDateIso: string) => {
      setProcessing(registration.id);
      try {
        const enrollmentDate = startDateIso || new Date().toISOString().split('T')[0];
        if (isInApp) {
          const result = await approveInAppRegistration(registration, enrollmentDate, user?.id);
          const parentMessage = registration.parent_id ? '👤 Parent account linked\n📱 Parent notified' : '⚠️ Parent account not found - they need to register';
          showAlert({
            title: 'Success',
            message: `✅ Registration approved!\n\n👶 Student profile ${result.studentCreated ? 'created' : 'linked'}${result.studentIdCode ? ` (${result.studentIdCode})` : ''}\n${parentMessage}`,
            type: 'success',
          });
        } else {
          const result = await approveEdusiteRegistration(registration, enrollmentDate, user?.id);
          const parentMessage = result.parentId
            ? result.parentCreated
              ? result.parentLinked === true ? '👤 Parent account created & linked\n📱 Parent notified' : result.parentLinked === false ? '⚠️ Parent account created but is not linked to the school yet' : '👤 Parent account created\n📱 Parent notified'
              : result.parentLinked === false ? '⚠️ Parent account exists but is not linked to the school yet' : result.parentLinked === true ? '👤 Parent linked\n📱 Parent notified' : '👤 Parent account found\n📱 Parent notified'
            : '⚠️ Parent account not found - they need to register';
          showAlert({
            title: 'Success',
            message: `✅ Registration approved!\n\n👶 Student profile ${result.studentCreated ? 'created' : 'linked'}${result.studentIdCode ? ` (${result.studentIdCode})` : ''}\n${parentMessage}`,
            type: 'success',
          });
        }
        fetchRegistrations();
      } catch (err: unknown) {
        const e = err as { message?: string };
        logger.error('Registrations', 'Error approving registration', e);
        showAlert({ title: 'Approval Failed', message: e.message || 'Failed to approve registration', type: 'error' });
      } finally {
        setProcessing(null);
      }
    };

    showAlert({ title: 'Approve Registration', message, type: 'info', buttons: [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Starts This Month', onPress: () => approveWithStartDate(getStartMonthIso(0)) },
      { text: 'Starts Next Month', onPress: () => approveWithStartDate(getStartMonthIso(1)) },
    ] });
  };

  // --- Reject ---
  const handleReject = (registration: Registration) => { setRejectingRegistration(registration); setRejectionReason(''); setRejectModalVisible(true); };
  const cancelReject = () => { setRejectModalVisible(false); setRejectingRegistration(null); setRejectionReason(''); };
  const confirmReject = async () => {
    if (!rejectingRegistration) return;
    const reason = rejectionReason.trim();
    if (!reason) { showAlert({ title: 'Rejection Reason Required', message: 'Please provide a rejection reason.', type: 'warning' }); return; }
    setRejectModalVisible(false);
    setProcessing(rejectingRegistration.id);
    try {
      await rejectRegistrationAction(rejectingRegistration, reason, user?.id, showAlert, fetchRegistrations);
    } catch (err: unknown) {
      const e = err as { message?: string };
      logger.error('Registrations', 'Error rejecting registration', e);
      showAlert({ title: 'Error', message: e.message || 'Failed to reject registration', type: 'error' });
    } finally {
      setProcessing(null);
      setRejectingRegistration(null);
      setRejectionReason('');
    }
  };

  // --- Verify / Reminder / POP ---
  const handleVerifyPayment = (reg: Registration, verify: boolean) => verifyPaymentAction(reg, verify, user?.id, showAlert, fetchRegistrations, setProcessing);
  const sendPaymentReminder = (reg: Registration) => sendPaymentReminderAction(reg, showAlert, setSendingReminder, fetchRegistrations);
  const sendPopUploadLink = (reg: Registration) => sendPopUploadLinkAction(reg, showAlert, setSendingPopLink);

  // --- Stats ---
  const pendingCount = registrations.filter((r) => r.status === 'pending').length;
  const approvedCount = registrations.filter((r) => r.status === 'approved').length;
  const rejectedCount = registrations.filter((r) => r.status === 'rejected').length;

  return {
    registrations, filteredRegistrations, alertProps, showAlert,
    loading, refreshing, syncing, processing, error, sendingReminder, sendingPopLink,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter,
    rejectModalVisible, rejectionReason, setRejectionReason, confirmReject, cancelReject, rejectingRegistration,
    fetchRegistrations, onRefresh, handleSyncWithEduSite, handleApprove, handleReject, handleVerifyPayment, sendPaymentReminder, sendPopUploadLink,
    canApprove, usesEdusiteSync,
    pendingCount, approvedCount, rejectedCount,
  };
}
