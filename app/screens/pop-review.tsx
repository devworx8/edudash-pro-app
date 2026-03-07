/**
 * POP Review Screen
 * 
 * Allows principals/admins to view, approve, or reject Proof of Payment submissions.
 * Shows pending POP uploads from parents with ability to view documents and take action.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Linking, Modal, Platform, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { useUpdatePOPStatus } from '@/hooks/usePOPUploads';
import { SuccessModal } from '@/components/ui/SuccessModal';
import { getPOPFileUrl } from '@/lib/popUpload';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { ReceiptService } from '@/lib/services/ReceiptService';
import { inferFeeCategoryCode, normalizeFeeCategoryCode } from '@/lib/utils/feeUtils';
import { getMonthStartISO } from '@/lib/utils/dateUtils';
import type { FeeCategoryCode } from '@/types/finance';
import { useFinanceAccessGuard } from '@/hooks/useFinanceAccessGuard';
import FinancePasswordPrompt from '@/components/security/FinancePasswordPrompt';
import { ApprovalWorkflowService, type PettyCashRequest } from '@/services/ApprovalWorkflowService';
import { createStyles } from './pop-review.styles';
import { CATEGORY_META, CATEGORY_ORDER, type POPUpload, type ReceiptDraft, type ReviewQueue, type StatusFilter } from './pop-review.constants';
import { POPUploadCard, PettyCashCard } from './pop-review.cards';
import {
  formatMonth,
  hasValidListId,
  includesCaseInsensitive,
  normalizePOPStatus,
} from './pop-review.utils';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

export default function POPReviewScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const financeAccess = useFinanceAccessGuard();
  const insets = useSafeAreaInsets();
  const updatePOPStatus = useUpdatePOPStatus();
  const { showAlert, alertProps } = useAlertModal();
  const params = useLocalSearchParams<{ monthIso?: string }>();
  
  // State
  const [activeQueue, setActiveQueue] = useState<ReviewQueue>('payment_proofs');
  const [uploads, setUploads] = useState<POPUpload[]>([]);
  const [filteredUploads, setFilteredUploads] = useState<POPUpload[]>([]);
  const [pettyCashRequests, setPettyCashRequests] = useState<PettyCashRequest[]>([]);
  const [filteredPettyCashRequests, setFilteredPettyCashRequests] = useState<PettyCashRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [error, setError] = useState<string | null>(null);
  
  // Modal state
  const [selectedUpload, setSelectedUpload] = useState<POPUpload | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState({ title: '', message: '' });
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
  const [receiptGenerating, setReceiptGenerating] = useState(false);
  const [receiptResult, setReceiptResult] = useState<{ receiptUrl?: string | null; storagePath?: string | null; filename?: string } | null>(null);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, FeeCategoryCode>>({});
  const [queueMonthSelections, setQueueMonthSelections] = useState<Record<string, string>>({});
  const [selectedPettyCash, setSelectedPettyCash] = useState<PettyCashRequest | null>(null);
  const [showPettyCashModal, setShowPettyCashModal] = useState(false);
  const [pettyCashReviewNotes, setPettyCashReviewNotes] = useState('');
  const [pettyCashRejectReason, setPettyCashRejectReason] = useState('');
  const [pettyCashApprovedAmount, setPettyCashApprovedAmount] = useState('');

  const organizationId = profile?.organization_id || profile?.preschool_id;
  const selectedControlMonth = React.useMemo(
    () => getMonthStartISO(params.monthIso || new Date().toISOString()),
    [params.monthIso],
  );
  const reviewerDisplayName =
    (profile as any)?.full_name ||
    `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() ||
    'Principal';

  const toFilterStatus = useCallback((status?: string): StatusFilter => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'pending') return 'pending';
    if (normalized === 'rejected' || normalized === 'cancelled') return 'rejected';
    if (normalized === 'approved' || normalized === 'completed' || normalized === 'disbursed') return 'approved';
    return 'pending';
  }, []);

  // Fetch POP uploads
  const fetchUploads = useCallback(async () => {
    if (financeAccess.needsPassword) return;
    if (!organizationId) {
      setError('Organization not found');
      setLoading(false);
      return;
    }

    try {
      const supabase = assertSupabase();
      const pettyCashPromise = ApprovalWorkflowService.getAllPettyCashRequests(organizationId, {
        limit: 200,
      });
      
      // Fetch POP uploads with student data (avoid FK join for profiles)
      const { data, error: fetchError } = await supabase
        .from('pop_uploads')
        .select(`
          *,
          student:students (
            first_name,
            last_name,
            student_id
          )
        `)
        .eq('preschool_id', organizationId)
        .eq('upload_type', 'proof_of_payment')
        .order('created_at', { ascending: false });
      let pettyCashData: PettyCashRequest[] = [];
      try {
        const loadedPettyCash = await pettyCashPromise;
        pettyCashData = Array.isArray(loadedPettyCash) ? loadedPettyCash : [];
      } catch (pettyCashError: any) {
        console.error('Error fetching petty cash queue:', pettyCashError);
      }
      setPettyCashRequests(pettyCashData);

      if (fetchError) {
        console.error('Error fetching POP uploads:', fetchError);
        setError(fetchError.message);
      } else {
        // Batch-fetch uploader profiles to avoid N+1 queries
        const uploaderIds = [...new Set(
          (data || []).map((u) => u.uploaded_by).filter(Boolean) as string[]
        )];

        let profileMap: Record<string, { first_name: string; last_name: string; email: string }> = {};
        if (uploaderIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', uploaderIds);
          (profiles || []).forEach((p) => {
            profileMap[p.id] = { first_name: p.first_name, last_name: p.last_name, email: p.email };
          });
        }

        const uploadsWithProfiles = (data || []).map((upload) => ({
          ...upload,
          status: normalizePOPStatus(upload.status),
          title: String(upload.title || ''),
          description: upload.description || '',
          uploader: upload.uploaded_by ? (profileMap[upload.uploaded_by] || null) : null,
        }));
        setUploads(uploadsWithProfiles);
        setError(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch review queues:', err);
      setError(err.message || 'Failed to load approval queues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [financeAccess.needsPassword, organizationId]);

  useEffect(() => {
    if (!financeAccess.needsPassword) {
      fetchUploads();
    }
  }, [fetchUploads, financeAccess.needsPassword]);

  const openReceiptModal = (upload: POPUpload) => {
    const paidDateValue = (upload.payment_date || upload.payment_for_month || upload.created_at || new Date().toISOString())
      .toString()
      .split('T')[0];
    setReceiptDraft({
      upload,
      description: upload.description || upload.title || 'Payment receipt',
      amount: String(upload.payment_amount ?? ''),
      paidDate: paidDateValue,
      paymentMethod: upload.payment_method || 'bank_transfer',
      paymentReference: upload.payment_reference || `POP-${upload.id.slice(0, 8)}`,
    });
    setReceiptResult(null);
    setShowReceiptModal(true);
  };

  const fetchParentProfile = async (upload: POPUpload) => {
    const fallbackName = `${upload.uploader?.first_name || ''} ${upload.uploader?.last_name || ''}`.trim();
    const fallback = {
      id: upload.uploaded_by,
      name: fallbackName || 'Parent',
      email: upload.uploader?.email,
    };
    if (!upload.uploaded_by) return fallback;
    if (fallback.email) return fallback;
    const supabase = assertSupabase();
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('id', upload.uploaded_by)
      .maybeSingle();
    if (!data) return fallback;
    return {
      id: data.id,
      name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || fallback.name,
      email: data.email || fallback.email,
    };
  };

  const fetchStudentClassName = async (studentId: string) => {
    const supabase = assertSupabase();
    const { data } = await supabase
      .from('students')
      .select('classes(name)')
      .eq('id', studentId)
      .maybeSingle();
    return (data as any)?.classes?.name || null;
  };

  const attachReceiptToPayment = async (
    upload: POPUpload,
    receiptUrl: string | null,
    receiptStoragePath?: string | null
  ) => {
    const supabase = assertSupabase();
    const nowIso = new Date().toISOString();
    const paymentReference = upload.payment_reference || `POP-${upload.id.slice(0, 8)}`;

    let payment = null as any;
    try {
      const { data } = await supabase
        .from('payments')
        .select('id, metadata, attachment_url')
        .eq('metadata->>pop_upload_id', upload.id)
        .maybeSingle();
      payment = data;
    } catch {
      payment = null;
    }

    if (!payment && paymentReference) {
      const { data } = await supabase
        .from('payments')
        .select('id, metadata, attachment_url')
        .eq('payment_reference', paymentReference)
        .maybeSingle();
      payment = data;
    }

    if (payment?.id) {
      const nextMetadata = {
        ...(payment.metadata || {}),
        receipt_storage_path: receiptStoragePath,
        receipt_url: receiptUrl,
      };
      const updates: Record<string, any> = {
        metadata: nextMetadata,
        updated_at: nowIso,
      };
      if (receiptUrl && !payment.attachment_url) {
        updates.attachment_url = receiptUrl;
      }
      await supabase
        .from('payments')
        .update(updates)
        .eq('id', payment.id);
    }
  };

  const sendReceiptNotification = async (
    parent: { id?: string | null; name?: string | null; email?: string | null },
    studentName: string,
    receiptUrl: string | null,
    receiptNumber: string,
    amount: number,
    context?: {
      studentId?: string;
      popId?: string;
      paymentPurpose?: string;
      paymentReference?: string;
    }
  ) => {
    if (!parent?.email && !parent?.id) return;
    const supabase = assertSupabase();
    const subject = `Payment receipt for ${studentName}`;
    const text = receiptUrl
      ? `Your payment of R ${amount.toFixed(2)} for ${studentName} has been marked as paid. Receipt #${receiptNumber}. Download: ${receiptUrl}`
      : `Your payment of R ${amount.toFixed(2)} for ${studentName} has been marked as paid. Receipt #${receiptNumber}.`;
    const html = `
      <p>Your payment of <strong>R ${amount.toFixed(2)}</strong> for <strong>${studentName}</strong> has been marked as paid.</p>
      <p>Receipt #: <strong>${receiptNumber}</strong></p>
      ${receiptUrl ? `<p><a href="${receiptUrl}">Download your receipt</a></p>` : ''}
    `;

    await supabase.functions.invoke('notifications-dispatcher', {
      body: {
        event_type: 'payment_receipt',
        user_ids: parent?.id ? [parent.id] : undefined,
        recipient_email: parent?.email || undefined,
        include_email: true,
        template_override: {
          title: 'Payment Receipt Ready',
          body: `Receipt issued for ${studentName}.`,
          data: {
            type: 'receipt',
            student_name: studentName,
            receipt_url: receiptUrl,
            student_id: context?.studentId,
            pop_id: context?.popId,
            payment_purpose: context?.paymentPurpose,
            payment_reference: context?.paymentReference,
          },
        },
        email_template_override: {
          subject,
          text,
          html,
        },
      },
    });
  };

  const handleGenerateReceipt = async (sendToParent: boolean) => {
    if (!receiptDraft || !profile?.id || !organizationId) return;
    setReceiptGenerating(true);
    try {
      const amountValue = parseFloat(receiptDraft.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        throw new Error('Enter a valid payment amount');
      }
      const paidDate = receiptDraft.paidDate || new Date().toISOString().split('T')[0];
      const parentProfile = await fetchParentProfile(receiptDraft.upload);
      const className = await fetchStudentClassName(receiptDraft.upload.student_id);
      const issuerName =
        (profile as any)?.full_name ||
        `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
        'School Administrator';
      const studentName = `${receiptDraft.upload.student?.first_name || ''} ${receiptDraft.upload.student?.last_name || ''}`.trim() || 'Student';
      const receiptNumber = `REC-${new Date().getFullYear()}-${receiptDraft.upload.id.slice(0, 6).toUpperCase()}`;

      const result = await ReceiptService.generateFeeReceipt({
        schoolId: organizationId,
        fee: {
          id: receiptDraft.upload.id,
          description: receiptDraft.description,
          amount: amountValue,
          dueDate: null,
          paidDate,
          paymentReference: receiptDraft.paymentReference,
          paymentMethod: receiptDraft.paymentMethod,
        },
        student: {
          id: receiptDraft.upload.student_id,
          firstName: receiptDraft.upload.student?.first_name || '',
          lastName: receiptDraft.upload.student?.last_name || '',
          className,
        },
        parent: {
          id: parentProfile.id || null,
          name: parentProfile.name || null,
          email: parentProfile.email || null,
        },
        issuer: {
          id: profile.id,
          name: issuerName,
        },
      });

      setReceiptResult(result);
      await attachReceiptToPayment(receiptDraft.upload, result.receiptUrl ?? null, result.storagePath);

      if (sendToParent) {
        await sendReceiptNotification(parentProfile, studentName, result.receiptUrl ?? null, receiptNumber, amountValue, {
          studentId: receiptDraft.upload.student_id,
          popId: receiptDraft.upload.id,
          paymentPurpose: receiptDraft.description,
          paymentReference: receiptDraft.paymentReference,
        });
        showAlert({
          title: 'Receipt Sent',
          message: `Receipt sent to ${parentProfile.email || 'the parent'}.`,
          type: 'success',
        });
        setShowReceiptModal(false);
      } else {
        showAlert({
          title: 'Receipt Ready',
          message: 'Receipt generated. You can send it to the parent when ready.',
          type: 'success',
        });
      }
    } catch (err: any) {
      showAlert({
        title: 'Receipt Error',
        message: err?.message || 'Failed to generate receipt',
        type: 'error',
      });
    } finally {
      setReceiptGenerating(false);
    }
  };

  // Filter uploads
  useEffect(() => {
    let filtered = uploads;
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(u => u.status === statusFilter);
    }
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(u => 
        includesCaseInsensitive(u.student?.first_name, search) ||
        includesCaseInsensitive(u.student?.last_name, search) ||
        includesCaseInsensitive(u.uploader?.first_name, search) ||
        includesCaseInsensitive(u.uploader?.last_name, search) ||
        includesCaseInsensitive(u.payment_reference, search) ||
        includesCaseInsensitive(u.title, search)
      );
    }
    
    setFilteredUploads(filtered);
  }, [uploads, statusFilter, searchTerm]);

  useEffect(() => {
    let filtered = pettyCashRequests;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((request) => toFilterStatus(request.status) === statusFilter);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter((request) =>
        includesCaseInsensitive(request.requestor_name, search) ||
        includesCaseInsensitive(request.category, search) ||
        includesCaseInsensitive(request.description, search) ||
        includesCaseInsensitive(request.justification, search)
      );
    }

    setFilteredPettyCashRequests(filtered);
  }, [pettyCashRequests, searchTerm, statusFilter, toFilterStatus]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUploads();
  };

  const getResolvedCategoryCode = useCallback((upload: POPUpload): FeeCategoryCode => {
    const override = categoryOverrides[upload.id];
    if (override) return override;
    if (upload.category_code) {
      return normalizeFeeCategoryCode(upload.category_code);
    }
    return inferFeeCategoryCode(upload.description || upload.title || 'tuition');
  }, [categoryOverrides]);

  const getCategoryMeta = useCallback((upload: POPUpload) => {
    const code = getResolvedCategoryCode(upload);
    return { code, ...CATEGORY_META[code] };
  }, [getResolvedCategoryCode]);

  const openCategoryPicker = useCallback((upload: POPUpload) => {
    const currentCode = getResolvedCategoryCode(upload);
    showAlert({
      title: 'Payment Category',
      message: 'Choose the category to use when approving this POP.',
      type: 'warning',
      buttons: [
        ...CATEGORY_ORDER.map((code) => ({
          text: `${CATEGORY_META[code].label}${currentCode === code ? ' ✓' : ''}`,
          onPress: () => {
            setCategoryOverrides((prev) => ({ ...prev, [upload.id]: code }));
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    });
  }, [getResolvedCategoryCode, showAlert]);

  const resolveQueueDisplayMonth = useCallback(
    (upload: POPUpload) =>
      getMonthStartISO(upload.payment_for_month || upload.payment_date || upload.created_at || selectedControlMonth, {
        recoverUtcMonthBoundary: Boolean(upload.payment_for_month),
      }),
    [selectedControlMonth],
  );

  const openQueueMonthPicker = useCallback((upload: POPUpload) => {
    const selectedMonth = queueMonthSelections[upload.id];
    const normalizedSelected = selectedMonth
      ? getMonthStartISO(selectedMonth, { recoverUtcMonthBoundary: true })
      : null;
    const currentMonthDate = new Date(selectedControlMonth);
    const previousMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1);
    const nextMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1);
    const suggestedMonth = resolveQueueDisplayMonth(upload);
    const candidateMonths = [
      suggestedMonth,
      selectedControlMonth,
      `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}-01`,
      `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`,
    ].filter((candidate, index, list) => Boolean(candidate) && list.indexOf(candidate) === index);

    showAlert({
      title: 'Select Accounting Month',
      message: 'Choose the month this POP should settle against.',
      type: 'warning',
      buttons: [
        ...candidateMonths.map((candidate) => ({
          text: `${new Date(candidate).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}${
            normalizedSelected === candidate ? ' ✓' : ''
          }`,
          onPress: () => {
            setQueueMonthSelections((prev) => ({ ...prev, [upload.id]: candidate }));
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    });
  }, [queueMonthSelections, resolveQueueDisplayMonth, selectedControlMonth, showAlert]);

  useEffect(() => {
    setQueueMonthSelections((prev) => {
      const next: Record<string, string> = {};
      uploads.forEach((upload) => {
        if (String(upload.status || '').toLowerCase() !== 'pending') return;
        const resolvedMonth = resolveQueueDisplayMonth(upload);
        const existing = prev[upload.id];
        next[upload.id] = existing
          ? getMonthStartISO(existing, { recoverUtcMonthBoundary: true })
          : resolvedMonth;
      });

      const prevKeys = Object.keys(prev).sort();
      const nextKeys = Object.keys(next).sort();
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key, index) => key === nextKeys[index] && prev[key] === next[key])
      ) {
        return prev;
      }
      return next;
    });
  }, [uploads, resolveQueueDisplayMonth]);

  const handleApprove = useCallback((upload: POPUpload) => {
    const originalCategory = upload.category_code
      ? normalizeFeeCategoryCode(upload.category_code)
      : inferFeeCategoryCode(upload.description || upload.title || 'tuition');
    const selectedCategory = getResolvedCategoryCode(upload);
    const categoryLabel = CATEGORY_META[selectedCategory].label;
    const categoryWasCorrected = selectedCategory !== originalCategory;
    const selectedMonth = queueMonthSelections[upload.id];
    if (!selectedMonth) {
      console.info('finance.queue.month_required_block', { uploadId: upload.id, studentId: upload.student_id });
      showAlert({
        title: 'Month Required',
        message: 'Select accounting month to continue.',
        type: 'warning',
      });
      return;
    }

    const uploaderDisplay = (() => {
      if (!upload.uploader) return 'the parent';
      const fn = upload.uploader.first_name ?? '';
      const ln = upload.uploader.last_name ?? '';
      const n = `${fn} ${ln}`.trim();
      return n || (upload.uploader as { email?: string }).email || 'the parent';
    })();

    const reviewNotes = categoryWasCorrected
      ? `Payment verified and approved. Category corrected from ${CATEGORY_META[originalCategory].label} to ${CATEGORY_META[selectedCategory].label}.`
      : `Payment verified and approved. Category confirmed as ${CATEGORY_META[selectedCategory].label}.`;
    const effectivePaymentMonth = selectedMonth || resolveQueueDisplayMonth(upload);
    const paymentForLabel = formatMonth(effectivePaymentMonth);
    const selectedMonthLabel = formatMonth(selectedMonth);

    showAlert({
      title: 'Approve Payment',
      message:
        `Approve this payment proof from ${uploaderDisplay}?\n\n` +
        `Category: ${categoryLabel}${categoryWasCorrected ? ' (corrected)' : ''}\n` +
        `Payment For: ${paymentForLabel}\n` +
        `Accounting Month: ${selectedMonthLabel}`,
      type: 'warning',
      buttons: [
        { text: 'Change Category', onPress: () => openCategoryPicker(upload) },
        { text: 'Change Month', onPress: () => openQueueMonthPicker(upload) },
        { text: 'Cancel', style: 'cancel' as const },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            setProcessing(upload.id);
            try {
              console.info('finance.pop.approve.month_selected', {
                uploadId: upload.id,
                studentId: upload.student_id,
                billingMonth: selectedMonth,
                categoryCode: selectedCategory,
              });
              await updatePOPStatus.mutateAsync({
                uploadId: upload.id,
                status: 'approved',
                reviewNotes,
                billingMonth: selectedMonth,
                categoryCode: selectedCategory,
              });
              setCategoryOverrides((prev) => {
                const next = { ...prev };
                delete next[upload.id];
                return next;
              });
              setQueueMonthSelections((prev) => {
                const next = { ...prev };
                delete next[upload.id];
                return next;
              });
              openReceiptModal(upload);
              fetchUploads();
            } catch (err: any) {
              showAlert({
                title: 'Error',
                message: err?.message || 'Failed to approve payment',
                type: 'error',
              });
            } finally {
              setProcessing(null);
            }
          },
        },
      ],
    });
  }, [fetchUploads, getResolvedCategoryCode, openCategoryPicker, openQueueMonthPicker, queueMonthSelections, resolveQueueDisplayMonth, showAlert, updatePOPStatus]);

  const handleReject = (upload: POPUpload) => {
    setSelectedUpload(upload);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!selectedUpload) return;
    
    if (!rejectReason.trim()) {
      showAlert({
        title: 'Reason Required',
        message: 'Please provide a reason for rejection',
        type: 'warning',
      });
      return;
    }

    setProcessing(selectedUpload.id);
    setShowRejectModal(false);
    
    try {
      await updatePOPStatus.mutateAsync({
        uploadId: selectedUpload.id,
        status: 'rejected',
        reviewNotes: rejectReason,
      });
      
      setSuccessMessage({
        title: 'Payment Rejected',
        message: `The payment proof has been rejected. The parent will be notified to resubmit.`,
      });
      setShowSuccessModal(true);
      
      // Refresh the list
      fetchUploads();
    } catch (err: any) {
      showAlert({
        title: 'Error',
        message: err?.message || 'Failed to reject payment',
        type: 'error',
      });
    } finally {
      setProcessing(null);
      setSelectedUpload(null);
    }
  };

  const openPettyCashModal = useCallback((request: PettyCashRequest) => {
    setSelectedPettyCash(request);
    setPettyCashReviewNotes('');
    setPettyCashRejectReason('');
    setPettyCashApprovedAmount(request.amount ? String(request.amount.toFixed(2)) : '');
    setShowPettyCashModal(true);
  }, []);

  const closePettyCashModal = useCallback(() => {
    setShowPettyCashModal(false);
    setSelectedPettyCash(null);
    setPettyCashReviewNotes('');
    setPettyCashRejectReason('');
    setPettyCashApprovedAmount('');
  }, []);

  const handleApprovePettyCash = useCallback(async () => {
    if (!selectedPettyCash || !profile?.id) return;
    setProcessing(selectedPettyCash.id);
    try {
      const parsedApprovedAmount = pettyCashApprovedAmount.trim().length
        ? Number(pettyCashApprovedAmount)
        : undefined;
      if (parsedApprovedAmount !== undefined && (!Number.isFinite(parsedApprovedAmount) || parsedApprovedAmount <= 0)) {
        showAlert({
          title: 'Invalid Amount',
          message: 'Enter a valid approved amount or leave it blank.',
          type: 'warning',
        });
        return;
      }

      const ok = await ApprovalWorkflowService.approvePettyCashRequest(
        selectedPettyCash.id,
        profile.id,
        reviewerDisplayName,
        parsedApprovedAmount,
        pettyCashReviewNotes.trim() || undefined,
      );

      if (!ok) {
        showAlert({
          title: 'Approval Failed',
          message: 'Could not approve petty cash request.',
          type: 'error',
        });
        return;
      }

      setSuccessMessage({
        title: 'Petty Cash Approved',
        message: 'The petty cash request has been approved and the requester was notified.',
      });
      setShowSuccessModal(true);
      closePettyCashModal();
      fetchUploads();
    } catch (err: any) {
      showAlert({
        title: 'Approval Failed',
        message: err?.message || 'Could not approve petty cash request.',
        type: 'error',
      });
    } finally {
      setProcessing(null);
    }
  }, [closePettyCashModal, fetchUploads, pettyCashApprovedAmount, pettyCashReviewNotes, profile?.id, reviewerDisplayName, selectedPettyCash, showAlert]);

  const handleRejectPettyCash = useCallback(async () => {
    if (!selectedPettyCash || !profile?.id) return;
    if (!pettyCashRejectReason.trim()) {
      showAlert({
        title: 'Reason Required',
        message: 'Please provide a rejection reason.',
        type: 'warning',
      });
      return;
    }

    setProcessing(selectedPettyCash.id);
    try {
      const ok = await ApprovalWorkflowService.rejectPettyCashRequest(
        selectedPettyCash.id,
        profile.id,
        reviewerDisplayName,
        pettyCashRejectReason.trim(),
        pettyCashReviewNotes.trim() || undefined,
      );

      if (!ok) {
        showAlert({
          title: 'Rejection Failed',
          message: 'Could not reject petty cash request.',
          type: 'error',
        });
        return;
      }

      setSuccessMessage({
        title: 'Petty Cash Rejected',
        message: 'The petty cash request has been rejected and the requester was notified.',
      });
      setShowSuccessModal(true);
      closePettyCashModal();
      fetchUploads();
    } catch (err: any) {
      showAlert({
        title: 'Rejection Failed',
        message: err?.message || 'Could not reject petty cash request.',
        type: 'error',
      });
    } finally {
      setProcessing(null);
    }
  }, [closePettyCashModal, fetchUploads, pettyCashRejectReason, pettyCashReviewNotes, profile?.id, reviewerDisplayName, selectedPettyCash, showAlert]);

  const viewDocument = async (upload: POPUpload) => {
    try {
      const url = await getPOPFileUrl('proof_of_payment', upload.file_path);
      if (url) {
        Linking.openURL(url);
      } else {
        showAlert({
          title: 'Error',
          message: 'Could not retrieve document URL',
          type: 'error',
        });
      }
    } catch (err) {
      showAlert({
        title: 'Error',
        message: 'Failed to open document',
        type: 'error',
      });
    }
  };

  const renderUploadItem = ({ item }: { item: POPUpload }) => {
    return (
      <POPUploadCard
        item={item}
        processing={processing}
        theme={theme}
        styles={styles}
        queueMonthSelections={queueMonthSelections}
        resolveQueueDisplayMonth={resolveQueueDisplayMonth}
        getCategoryMeta={getCategoryMeta}
        onViewDocument={viewDocument}
        onOpenReceiptModal={openReceiptModal}
        onOpenQueueMonthPicker={openQueueMonthPicker}
        onOpenCategoryPicker={openCategoryPicker}
        onReject={handleReject}
        onApprove={handleApprove}
      />
    );
  };

  const renderPettyCashItem = ({ item }: { item: PettyCashRequest }) => {
    return (
      <PettyCashCard
        item={item}
        processing={processing}
        theme={theme}
        styles={styles}
        toFilterStatus={toFilterStatus}
        onOpenPettyCashModal={openPettyCashModal}
      />
    );
  };

  const styles = createStyles(theme, insets);
  const isWeb = Platform.OS === 'web';
  const safeFilteredUploads = React.useMemo(
    () => filteredUploads.filter((upload): upload is POPUpload => Boolean(upload) && hasValidListId(upload.id)),
    [filteredUploads],
  );
  const safeFilteredPettyCashRequests = React.useMemo(
    () => filteredPettyCashRequests.filter((request) => Boolean(request) && hasValidListId((request as any)?.id)),
    [filteredPettyCashRequests],
  );
  const popSummary = {
    pending: uploads.filter((upload) => upload.status === 'pending').length,
    approved: uploads.filter((upload) => upload.status === 'approved').length,
    rejected: uploads.filter((upload) => upload.status === 'rejected').length,
  };
  const pettyCashSummary = {
    pending: pettyCashRequests.filter((request) => toFilterStatus(request.status) === 'pending').length,
    approved: pettyCashRequests.filter((request) => toFilterStatus(request.status) === 'approved').length,
    rejected: pettyCashRequests.filter((request) => toFilterStatus(request.status) === 'rejected').length,
  };
  const activeSummary = activeQueue === 'payment_proofs' ? popSummary : pettyCashSummary;
  const hasNoResults = activeQueue === 'payment_proofs'
    ? safeFilteredUploads.length === 0
    : safeFilteredPettyCashRequests.length === 0;
  const emptyIcon = activeQueue === 'payment_proofs' ? 'receipt-outline' : 'wallet-outline';
  const emptyPendingText = activeQueue === 'payment_proofs'
    ? 'No pending payments to review'
    : 'No pending petty cash requests to review';
  const emptyAnyText = activeQueue === 'payment_proofs'
    ? 'No payment uploads found'
    : 'No petty cash requests found';
  const searchPlaceholder = activeQueue === 'payment_proofs'
    ? 'Search by student, parent, reference...'
    : 'Search by requester, category...';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Finance Approvals',
          headerShown: false,
        }}
      />
      
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.screenHeader,
            {
              backgroundColor: theme.cardBackground,
              borderBottomColor: theme.border,
              paddingTop: Math.max(insets.top, 12),
            },
          ]}
        >
          <TouchableOpacity style={styles.headerIconButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.screenHeaderTitle, { color: theme.text }]}>Finance Approvals</Text>
          <TouchableOpacity style={styles.headerIconButton} onPress={handleRefresh}>
            <Ionicons name="refresh" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Queue Switch */}
        <View style={styles.queueTabs}>
          {([
            { key: 'payment_proofs', label: 'Payment Proofs', count: popSummary.pending },
            { key: 'petty_cash', label: 'Petty Cash', count: pettyCashSummary.pending },
          ] as Array<{ key: ReviewQueue; label: string; count: number }>).map((queue) => (
            <TouchableOpacity
              key={queue.key}
              style={[
                styles.queueTab,
                {
                  borderColor: activeQueue === queue.key ? theme.primary : theme.border,
                  backgroundColor: activeQueue === queue.key ? theme.primary + '14' : theme.cardBackground,
                },
              ]}
              onPress={() => setActiveQueue(queue.key)}
            >
              <Text
                style={[
                  styles.queueTabText,
                  { color: activeQueue === queue.key ? theme.primary : theme.textSecondary },
                ]}
              >
                {queue.label}
              </Text>
              <View
                style={[
                  styles.queueBadge,
                  { backgroundColor: queue.count > 0 ? theme.primary : theme.border },
                ]}
              >
                <Text style={styles.queueBadgeText}>{queue.count}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Header Stats */}
        <View style={[styles.statsBar, { backgroundColor: theme.cardBackground }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.primary }]}>{activeSummary.pending}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Pending</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.success }]}>
              {activeSummary.approved}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Approved</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.error }]}>
              {activeSummary.rejected}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Rejected</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: theme.cardBackground }]}>
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.textSecondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm ? (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabs}>
          {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterTab,
                statusFilter === filter && { backgroundColor: theme.primary },
              ]}
              onPress={() => setStatusFilter(filter)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: statusFilter === filter ? '#fff' : theme.textSecondary },
                ]}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading approval queues...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={48} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.primary }]} onPress={fetchUploads}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : hasNoResults ? (
          <View style={styles.emptyContainer}>
            <Ionicons name={emptyIcon as any} size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {statusFilter === 'pending' 
                ? emptyPendingText
                : emptyAnyText}
            </Text>
          </View>
        ) : activeQueue === 'payment_proofs' ? (
          isWeb ? (
            <ScrollView
              key={`queue-${activeQueue}-web`}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
              }
            >
              {safeFilteredUploads.map((item) => (
                <View key={item.id}>
                  {renderUploadItem({ item })}
                </View>
              ))}
            </ScrollView>
          ) : (
            <FlashList
              key={`queue-${activeQueue}`}
              data={safeFilteredUploads}
              renderItem={renderUploadItem}
              keyExtractor={(item, index) => (hasValidListId(item?.id) ? item.id : `pop-${index}`)}
              contentContainerStyle={styles.listContent}
              estimatedItemSize={220}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
              }
            />
          )
        ) : (
          isWeb ? (
            <ScrollView
              key={`queue-${activeQueue}-web`}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
              }
            >
              {safeFilteredPettyCashRequests.map((item) => (
                <View key={item.id}>
                  {renderPettyCashItem({ item })}
                </View>
              ))}
            </ScrollView>
          ) : (
            <FlashList
              key={`queue-${activeQueue}`}
              data={safeFilteredPettyCashRequests}
              renderItem={renderPettyCashItem}
              keyExtractor={(item, index) =>
                hasValidListId((item as any)?.id) ? String((item as any).id) : `petty-cash-${index}`
              }
              contentContainerStyle={styles.listContent}
              estimatedItemSize={220}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
              }
            />
          )
        )}
      </View>

      {/* Reject Modal */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Reject Payment</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Please provide a reason for rejection
            </Text>
            <TextInput
              style={[styles.reasonInput, { 
                backgroundColor: theme.surface, 
                color: theme.text, 
                borderColor: theme.border 
              }]}
              placeholder="Enter reason..."
              placeholderTextColor={theme.textSecondary}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { borderColor: theme.border }]}
                onPress={() => setShowRejectModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalRejectButton, { backgroundColor: theme.error }]}
                onPress={confirmReject}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Petty Cash Review Modal */}
      <Modal
        visible={showPettyCashModal}
        transparent
        animationType="fade"
        onRequestClose={closePettyCashModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Review Petty Cash Request</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Confirm approved amount, add notes, or provide a rejection reason.
            </Text>

            <TextInput
              style={[styles.receiptInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
              placeholder="Approved amount (optional)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              value={pettyCashApprovedAmount}
              onChangeText={setPettyCashApprovedAmount}
            />
            <TextInput
              style={[styles.reasonInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
              placeholder="Review notes (optional)"
              placeholderTextColor={theme.textSecondary}
              value={pettyCashReviewNotes}
              onChangeText={setPettyCashReviewNotes}
              multiline
              numberOfLines={3}
            />
            <TextInput
              style={[styles.reasonInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, marginTop: 12 }]}
              placeholder="Rejection reason (required only when rejecting)"
              placeholderTextColor={theme.textSecondary}
              value={pettyCashRejectReason}
              onChangeText={setPettyCashRejectReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { borderColor: theme.border }]}
                onPress={closePettyCashModal}
                disabled={processing === selectedPettyCash?.id}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalRejectButton, { backgroundColor: theme.error }]}
                onPress={handleRejectPettyCash}
                disabled={processing === selectedPettyCash?.id}
              >
                {processing === selectedPettyCash?.id ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>Reject</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.success }]}
                onPress={handleApprovePettyCash}
                disabled={processing === selectedPettyCash?.id}
              >
                {processing === selectedPettyCash?.id ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>Approve</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt Modal */}
      <Modal
        visible={showReceiptModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReceiptModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Payment Receipt</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Review the receipt details, then generate and send to the parent.
            </Text>

            <TextInput
              style={[styles.receiptInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
              placeholder="Description"
              placeholderTextColor={theme.textSecondary}
              value={receiptDraft?.description || ''}
              onChangeText={(value) =>
                setReceiptDraft((prev) => (prev ? { ...prev, description: value } : prev))
              }
            />

            <View style={styles.receiptRow}>
              <TextInput
                style={[styles.receiptInputSmall, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                placeholder="Amount"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={receiptDraft?.amount || ''}
                onChangeText={(value) =>
                  setReceiptDraft((prev) => (prev ? { ...prev, amount: value } : prev))
                }
              />
              <TextInput
                style={[styles.receiptInputSmall, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                placeholder="Paid Date (YYYY-MM-DD)"
                placeholderTextColor={theme.textSecondary}
                value={receiptDraft?.paidDate || ''}
                onChangeText={(value) =>
                  setReceiptDraft((prev) => (prev ? { ...prev, paidDate: value } : prev))
                }
              />
            </View>

            <View style={styles.receiptRow}>
              <TextInput
                style={[styles.receiptInputSmall, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                placeholder="Payment Method"
                placeholderTextColor={theme.textSecondary}
                value={receiptDraft?.paymentMethod || ''}
                onChangeText={(value) =>
                  setReceiptDraft((prev) => (prev ? { ...prev, paymentMethod: value } : prev))
                }
              />
              <TextInput
                style={[styles.receiptInputSmall, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                placeholder="Reference"
                placeholderTextColor={theme.textSecondary}
                value={receiptDraft?.paymentReference || ''}
                onChangeText={(value) =>
                  setReceiptDraft((prev) => (prev ? { ...prev, paymentReference: value } : prev))
                }
              />
            </View>

            {receiptResult?.receiptUrl ? (
              <TouchableOpacity
                style={[styles.receiptViewButton, { borderColor: theme.border }]}
                onPress={() => Linking.openURL(receiptResult.receiptUrl!)}
              >
                <Ionicons name="open-outline" size={18} color={theme.primary} />
                <Text style={[styles.receiptViewText, { color: theme.primary }]}>View Receipt</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { borderColor: theme.border }]}
                onPress={() => setShowReceiptModal(false)}
                disabled={receiptGenerating}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={() => handleGenerateReceipt(false)}
                disabled={receiptGenerating}
              >
                {receiptGenerating ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>Generate</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.success }]}
                onPress={() => handleGenerateReceipt(true)}
                disabled={receiptGenerating}
              >
                {receiptGenerating ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        title={successMessage.title}
        message={successMessage.message}
        buttonText="Done"
        onClose={() => setShowSuccessModal(false)}
      />

      <AlertModal {...alertProps} />
      <FinancePasswordPrompt
        visible={financeAccess.promptVisible}
        onSuccess={financeAccess.markUnlocked}
        onCancel={() => {
          financeAccess.dismissPrompt();
          try {
            router.back();
          } catch {
            router.replace('/screens/principal-dashboard' as any);
          }
        }}
      />
    </>
  );
}
