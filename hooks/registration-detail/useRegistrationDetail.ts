/** Orchestrator hook for registration-detail screen */
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import type { Registration, ShowAlert } from './types';
import { canApprove, getStartMonthIso } from './helpers';
import { fetchRegistration as fetchReg } from './fetchRegistration';
import { approveRegistrationCore } from './approveRegistration';
import { processRejection as processReject } from './rejectRegistration';
import type { AlertButton } from '@/components/ui/AlertModal';

const TAG = 'RegistrationDetail';

interface AlertState {
  visible: boolean;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  buttons: AlertButton[];
}

const INITIAL_ALERT: AlertState = { visible: false, title: '', message: '', type: 'info', buttons: [] };

export function useRegistrationDetail(id: string | undefined) {
  const { user } = useAuth();

  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popViewed, setPopViewed] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [alertState, setAlertState] = useState<AlertState>(INITIAL_ALERT);

  const showAlert: ShowAlert = useCallback((title, message, type = 'info', buttons = [{ text: 'OK', style: 'default' }]) => {
    setAlertState({ visible: true, title, message, type, buttons });
  }, []);
  const hideAlert = useCallback(() => setAlertState(prev => ({ ...prev, visible: false })), []);

  // --- Fetch --- //
  useEffect(() => {
    if (!id) { setError('Registration ID not provided'); setLoading(false); return; }
    (async () => {
      try {
        const reg = await fetchReg(id);
        setRegistration(reg);
      } catch (err: any) {
        logger.error(TAG, 'Error fetching registration', err);
        setError(err.message || 'Failed to load registration');
      } finally { setLoading(false); }
    })();
  }, [id]);

  // --- Prompt start-month picker --- //
  const promptStartMonth = useCallback((onSelect: (iso: string) => void) => {
    showAlert('Start Month', 'When does the child start? This sets the first fee and avoids false unpaid fees.', 'info', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Starts This Month', style: 'default', onPress: () => { hideAlert(); onSelect(getStartMonthIso(0)); } },
      { text: 'Starts Next Month', style: 'default', onPress: () => { hideAlert(); onSelect(getStartMonthIso(1)); } },
    ]);
  }, [showAlert, hideAlert]);

  // --- Approve --- //
  const handleApprove = useCallback(() => {
    if (!registration) return;
    if (registration.status !== 'pending') {
      showAlert('Already Processed', 'This registration has already been approved or rejected.', 'warning');
      return;
    }
    const requiresPayment = (registration.registration_fee_amount || 0) > 0;
    if (requiresPayment && !registration.payment_verified) {
      showAlert('Payment Required', 'Please verify payment before approving this registration.', 'warning');
      return;
    }
    promptStartMonth(async (startDateIso) => {
      setProcessing(true);
      try {
        await approveRegistrationCore(registration, user?.id, startDateIso);
        showAlert('Success', '✅ Registration approved!\n\n👶 Student profile created\n👤 Linked to parent\n📧 Parent notified via email & push', 'success', [{ text: 'OK', onPress: () => router.back() }]);
      } catch (err: any) {
        showAlert('Error', err.message || 'Failed to approve registration', 'error');
      } finally { setProcessing(false); }
    });
  }, [registration, user, promptStartMonth, showAlert]);

  // --- Reject --- //
  const handleReject = useCallback(() => {
    if (!registration) return;
    setRejectionReason('');
    setShowRejectionModal(true);
  }, [registration]);

  const confirmRejection = useCallback(async () => {
    if (!rejectionReason.trim()) { showAlert('Error', 'Please provide a rejection reason', 'error'); return; }
    setShowRejectionModal(false);
    if (!registration) return;

    setProcessing(true);
    try {
      await processReject(registration, rejectionReason, user?.id, user?.email);
      showAlert('Rejected', 'Registration has been rejected. The guardian has been notified.', 'info', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to reject registration', 'error');
    } finally { setProcessing(false); }
  }, [registration, rejectionReason, user, showAlert]);

  // --- Verify Payment & Approve --- //
  const handleVerifyPayment = useCallback(() => {
    if (!registration) return;
    const hasPop = !!registration.proof_of_payment_url;

    showAlert(
      hasPop ? 'Verify Payment & Approve' : 'Confirm Payment (No POP)',
      hasPop
        ? 'Confirm that the payment has been received and approve this registration?'
        : 'No proof of payment was uploaded. Confirm the payment was received and approve this registration?',
      'info',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify & Approve',
          style: 'default',
          onPress: async () => {
            hideAlert();
            setProcessing(true);
            try {
              const supabase = assertSupabase();
              const tableName = registration.source === 'in-app' ? 'child_registration_requests' : 'registration_requests';
              const { error: upErr } = await supabase.from(tableName).update({ payment_verified: true, registration_fee_paid: true }).eq('id', registration.id);
              if (upErr) throw upErr;

              setRegistration(prev => prev ? { ...prev, payment_verified: true, registration_fee_paid: true } : null);
              setProcessing(false);

              promptStartMonth(async (startDateIso) => {
                setProcessing(true);
                try {
                  await approveRegistrationCore(registration, user?.id, startDateIso);
                  showAlert('Success', '✅ Registration approved!', 'success', [{ text: 'OK', onPress: () => router.back() }]);
                } catch (err: any) {
                  showAlert('Error', err.message || 'Failed to approve registration', 'error');
                } finally { setProcessing(false); }
              });
            } catch (err: any) {
              showAlert('Error', err.message || 'Failed to verify payment', 'error');
              setProcessing(false);
            }
          },
        },
      ],
    );
  }, [registration, user, promptStartMonth, showAlert, hideAlert]);

  return {
    registration, loading, processing, error,
    popViewed, setPopViewed,
    showRejectionModal, setShowRejectionModal,
    rejectionReason, setRejectionReason,
    alertState, hideAlert, showAlert,
    handleApprove, handleReject, confirmRejection, handleVerifyPayment,
  };
}
