import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput, StyleSheet, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { SelectedFile, PaymentChild } from '@/types/payments';
import { uploadPOPFile, formatFileSize } from '@/lib/popUpload';
import { assertSupabase } from '@/lib/supabase';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import {
  consumePendingCameraResult,
  launchCameraWithRecovery,
  normalizeMediaUri,
} from '@/lib/utils/cameraRecovery';
import { inferFeeCategoryCode } from '@/lib/utils/feeUtils';
import type { FeeCategoryCode } from '@/types/finance';
import { SuccessModal } from '@/components/ui/SuccessModal';
import { ApprovalNotificationService } from '@/services/approvals/ApprovalNotificationService';
import { useAlert } from '@/components/ui/StyledAlert';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

const PAYMENT_MODAL_CAMERA_CONTEXT = 'payment_upload_modal_camera';
interface PaymentUploadModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedChildId: string | null;
  selectedChild: PaymentChild | undefined;
  userId: string;
  preschoolId?: string;
  feeId?: string;
  initialAmount?: string;
  initialReference?: string;
  paymentForDate?: string;
  paymentPurpose?: string;
  theme: any;
}

const CATEGORY_OPTIONS: Array<{ code: FeeCategoryCode; label: string }> = [
  { code: 'tuition', label: 'Tuition' },
  { code: 'registration', label: 'Registration' },
  { code: 'uniform', label: 'Uniform' },
  { code: 'aftercare', label: 'Aftercare' },
  { code: 'transport', label: 'Transport' },
  { code: 'meal', label: 'Meal' },
  { code: 'ad_hoc', label: 'Other' },
];

const parsePaymentAmountInput = (value: string): number => {
  const raw = String(value || '').replace(/[Rr]/g, '').replace(/\s/g, '');
  if (!raw) return Number.NaN;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');

  let normalized = raw;
  if (lastComma !== -1 && lastDot !== -1) {
    // If both separators exist, treat the last separator as decimal and strip the other.
    normalized =
      lastComma > lastDot
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '');
  } else if (lastComma !== -1) {
    normalized = raw.replace(',', '.');
  }

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const mapPopUploadInsertError = (error: unknown): string => {
  const message = String((error as any)?.message || '');
  const details = String((error as any)?.details || '');
  const hint = String((error as any)?.hint || '');
  const combined = `${message} ${details} ${hint}`.toLowerCase();

  if (combined.includes('valid_amount') || combined.includes('payment_amount')) {
    return 'Amount paid is required and must be greater than R0.00.';
  }

  if (combined.includes('valid_payment_fields') || combined.includes('payment_date')) {
    return 'Payment date and month are required for POP uploads.';
  }

  if (
    combined.includes('already exists for this month') ||
    combined.includes('duplicate') ||
    combined.includes('idx_pop_uploads_unique_month')
  ) {
    return 'A proof of payment for this learner, month, and category is already pending or approved.';
  }

  if (combined.includes('row-level security') || combined.includes('policy')) {
    return 'You can only upload POP for your linked learner at this school.';
  }

  return message || 'Failed to save proof of payment';
};

export function PaymentUploadModal({
  visible,
  onClose,
  onSuccess,
  selectedChildId,
  selectedChild,
  userId,
  preschoolId,
  feeId,
  initialAmount = '',
  initialReference = '',
  paymentForDate,
  paymentPurpose = '',
  theme,
}: PaymentUploadModalProps) {
  const alert = useAlert();
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [paymentReference, setPaymentReference] = useState(initialReference);
  const [paymentAmount, setPaymentAmount] = useState(initialAmount);
  const [uploading, setUploading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [paymentForMonth, setPaymentForMonth] = useState<Date | null>(null);
  const [categoryCode, setCategoryCode] = useState<FeeCategoryCode>('tuition');
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);
  const [showPaymentForPicker, setShowPaymentForPicker] = useState(false);
  const insets = useSafeAreaInsets();

  const resolveMonthStart = (dateValue?: string) => {
    if (!dateValue) return null;
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  };

  const styles = createStyles(theme, insets);
  const today = new Date();
  const paymentDateLabel = paymentDate.toLocaleDateString('en-ZA');
  const lowerPurpose = (paymentPurpose || '').toLowerCase();
  const isUniformPayment = (feeId || '').startsWith('uniform:') || lowerPurpose.includes('uniform');
  const autoCategoryCode = React.useMemo<FeeCategoryCode>(() => {
    if (isUniformPayment) return 'uniform';
    return inferFeeCategoryCode(paymentPurpose || 'tuition');
  }, [isUniformPayment, paymentPurpose]);
  // Memoize to avoid creating a new Date on every render (which would trigger useEffect loops)
  const autoPaymentForMonth = React.useMemo(
    () => resolveMonthStart(paymentForDate) ?? new Date(today.getFullYear(), today.getMonth(), 1),
    [paymentForDate]
  );
  const autoMonthLabel = autoPaymentForMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const paymentForLabel = paymentForMonth
    ? paymentForMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    : null;
  const paymentAmountValue = parsePaymentAmountInput(paymentAmount);
  const hasValidAmount = Number.isFinite(paymentAmountValue) && paymentAmountValue > 0;
  const hasSuggestedPaymentForMonth = Boolean(paymentForDate);
  const showPaymentForField = !isUniformPayment;
  const canSubmit =
    Boolean(selectedFile) &&
    !uploading &&
    (paymentForMonth || isUniformPayment) &&
    Boolean(categoryCode) &&
    hasValidAmount;

  // Track previous visible state to only reset fields on open transition (false → true),
  // not on every re-render while modal is open (which caused infinite setState loops).
  const prevVisibleRef = React.useRef(false);
  React.useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      // Modal just opened — reset fields to initial values
      setPaymentReference(initialReference);
      setPaymentAmount(initialAmount);
      setPaymentDate(new Date());
      const resolvedMonth = resolveMonthStart(paymentForDate);
      setPaymentForMonth(resolvedMonth ?? null);
      setCategoryCode(autoCategoryCode);
    }
    prevVisibleRef.current = visible;
  }, [visible, initialReference, initialAmount, paymentForDate, isUniformPayment, autoPaymentForMonth, autoCategoryCode]);

  const setFileFromImageAsset = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    setSelectedFile({
      uri: normalizeMediaUri(asset.uri),
      name: asset.fileName || `payment_proof_${Date.now()}.jpg`,
      size: asset.fileSize,
      type: asset.mimeType || 'image/jpeg',
      webFile: (asset as any).file,
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const recovered = await consumePendingCameraResult(PAYMENT_MODAL_CAMERA_CONTEXT);
      if (cancelled || !recovered || recovered.canceled || !recovered.assets?.[0]) return;
      setFileFromImageAsset(recovered.assets[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, setFileFromImageAsset]);

  const handleImagePicker = async () => {
    try {
      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        alert.showWarning('Permission Required', 'Camera roll permission is required.');
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        setFileFromImageAsset(result.assets[0]);
      }
    } catch (error) {
      alert.showError('Error', 'Failed to select image');
    }
  };

  const handleCameraPicker = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        alert.showWarning('Permission Required', 'Camera permission is required.');
        return;
      }

      const result = await launchCameraWithRecovery(PAYMENT_MODAL_CAMERA_CONTEXT, {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.75,
        exif: false,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        setFileFromImageAsset(result.assets[0]);
      }
    } catch {
      alert.showError('Error', 'Failed to capture image');
    }
  };

  const handleDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
          type: asset.mimeType,
          webFile: (asset as any).file,
        });
      }
    } catch (error) {
      alert.showError('Error', 'Failed to select document');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedChildId || !userId) {
      alert.showError('Error', 'Please select a file first');
      return;
    }
    const resolvedPaymentDate = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());
    const derivedPaymentForMonth = new Date(resolvedPaymentDate.getFullYear(), resolvedPaymentDate.getMonth(), 1);
    const effectivePaymentForMonth = isUniformPayment ? derivedPaymentForMonth : paymentForMonth;
    if (!effectivePaymentForMonth) {
      alert.showWarning('Select Month', 'Please choose the month you are paying for.');
      return;
    }
    if (!hasValidAmount) {
      alert.showWarning('Amount Required', 'Enter an amount greater than R0.00 before uploading.');
      return;
    }

    setUploading(true);
    try {
      const supabase = assertSupabase();
      const today = new Date();
      const last24Hours = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const normalizedPurpose = paymentPurpose?.trim() || 'School Fees';

      // Check for existing pending OR recently approved POP uploads for this student
      let popQuery = supabase
        .from('pop_uploads')
        .select('id, status, created_at, payment_amount, description')
        .eq('student_id', selectedChildId)
        .eq('upload_type', 'proof_of_payment')
        .or(`status.in.(pending,submitted),and(status.eq.approved,created_at.gte.${last24Hours})`);

      popQuery = popQuery.eq('description', normalizedPurpose);

      const { data: existingPOPs, error: checkError } = await popQuery
        .order('created_at', { ascending: false })
        .limit(5);

      if (checkError) {
        console.error('Error checking existing POPs:', checkError);
      }

      // Check for pending uploads - warn but allow override
      const pendingPOP = existingPOPs?.find(p => ['pending', 'submitted'].includes(p.status));
      if (pendingPOP) {
        const createdDate = new Date(pendingPOP.created_at).toLocaleDateString();
        
        // Show confirmation dialog for pending - can override
        alert.show(
          'Pending Upload Found',
          `You already have a pending proof of payment uploaded on ${createdDate}${pendingPOP.payment_amount ? ` for R${pendingPOP.payment_amount}` : ''}.\n\nWait for it to be reviewed before uploading another.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setUploading(false) },
            { text: 'Upload Anyway', style: 'destructive', onPress: () => proceedWithUpload() },
          ],
          { type: 'warning' }
        );
        return;
      }

      // Check for recently approved uploads - block completely
      const recentApproved = existingPOPs?.find(p => p.status === 'approved');
      if (recentApproved) {
        const createdDate = new Date(recentApproved.created_at).toLocaleDateString();
        alert.show(
          'Recent Upload Approved',
          `Your proof of payment from ${createdDate}${recentApproved.payment_amount ? ` for R${recentApproved.payment_amount}` : ''} was already approved.\n\nYou don't need to upload again unless you made a new payment.`,
          [{ text: 'OK', onPress: () => setUploading(false) }],
          { type: 'info' }
        );
        return;
      }

      await proceedWithUpload();
    } catch (error: any) {
      alert.showError('Upload Failed', error.message || 'Failed to upload proof of payment');
      setUploading(false);
    }
  };

  const proceedWithUpload = async () => {
    if (!selectedFile || !selectedChildId || !userId) return;

    try {
      const supabase = assertSupabase();
      const resolvedPaymentDate = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());
      const paymentDateValue = resolvedPaymentDate.toISOString().split('T')[0];
      const effectivePaymentForMonth = isUniformPayment
        ? new Date(resolvedPaymentDate.getFullYear(), resolvedPaymentDate.getMonth(), 1)
        : paymentForMonth;
      if (!effectivePaymentForMonth) {
        throw new Error('Select month');
      }

      const uploadResult = await uploadPOPFile(
        selectedFile.uri,
        'proof_of_payment',
        userId,
        selectedChildId,
        selectedFile.name,
        { webFile: selectedFile.webFile }
      );

      if (!uploadResult.success || !uploadResult.filePath) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      // Get user profile for parent name
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .single();
      
      const parentName = userProfile 
        ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() 
        : 'A parent';

      const finalPreschoolId = selectedChild?.preschool_id || preschoolId;
      const paymentAmountNum = paymentAmountValue;
      const paymentForMonthValue = effectivePaymentForMonth
        ? new Date(effectivePaymentForMonth.getFullYear(), effectivePaymentForMonth.getMonth(), 1)
            .toISOString()
            .split('T')[0]
        : new Date(paymentDate.getFullYear(), paymentDate.getMonth(), 1).toISOString().split('T')[0];

      // Use student_code (which maps from student_id in database) for payment reference
      const studentCode = selectedChild?.student_code || `STU-${selectedChildId.slice(0, 8).toUpperCase()}`;
      
      const titlePrefix = paymentPurpose ? paymentPurpose : 'Payment';
      const popTitle = `${titlePrefix} - ${studentCode}${paymentReference ? ` (${paymentReference})` : ''}`;

      const normalizedPurpose = paymentPurpose?.trim() || 'School Fees';
      const normalizedCategory = categoryCode || autoCategoryCode || inferFeeCategoryCode(normalizedPurpose);
      const { data: insertedPOP, error: dbError } = await supabase
        .from('pop_uploads')
        .insert({
          student_id: selectedChildId,
          uploaded_by: userId,
          preschool_id: finalPreschoolId,
          upload_type: 'proof_of_payment',
          title: popTitle,
          description: normalizedPurpose,
          file_path: uploadResult.filePath,
          file_name: uploadResult.fileName || selectedFile.name,
          file_size: uploadResult.fileSize || selectedFile.size || 0,
          file_type: uploadResult.fileType || selectedFile.type || 'unknown',
          payment_amount: paymentAmountNum, // Required by CHECK constraint
          payment_date: paymentDateValue, // Actual payment date (YYYY-MM-DD)
          payment_for_month: paymentForMonthValue, // Billing period month (YYYY-MM-DD)
          category_code: normalizedCategory,
          payment_reference: paymentReference || studentCode,
          status: 'pending',
        })
        .select()
        .single();

      if (dbError) throw new Error(mapPopUploadInsertError(dbError));

      // Notify principal of new POP submission
      if (finalPreschoolId && insertedPOP) {
        try {
          await ApprovalNotificationService.notifyPrincipalOfNewPOP({
            id: insertedPOP.id,
            preschool_id: finalPreschoolId,
            student_id: selectedChildId,
            submitted_by: userId,
            parent_name: parentName,
            payment_amount: paymentAmountNum,
            payment_date: paymentDateValue,
            payment_for_month: paymentForMonthValue,
            payment_method: 'bank_transfer',
            payment_purpose: normalizedPurpose,
            status: 'submitted',
            auto_matched: false,
            submitted_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          console.log('✅ Principal notified of new POP');
        } catch (notifError) {
          console.error('Failed to notify principal:', notifError);
          // Don't fail the upload if notification fails
        }
      }

      // Show celebration modal instead of basic Alert
      setShowSuccessModal(true);
      resetForm();
      
      // Add delay to ensure database propagation before calling onSuccess
      // This allows realtime subscriptions to pick up the new record
      // Increased to 1000ms for more reliable propagation
      setTimeout(() => {
        console.log('[PaymentUploadModal] Triggering onSuccess callback after upload');
        onSuccess();
      }, 1000);
    } catch (error: any) {
      alert.showError('Upload Failed', error.message || 'Failed to upload proof of payment');
    } finally {
      setUploading(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    onClose();
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPaymentReference(initialReference);
    setPaymentAmount(initialAmount);
    setPaymentDate(new Date());
    setPaymentForMonth(resolveMonthStart(paymentForDate));
    setShowPaymentDatePicker(false);
    setShowPaymentForPicker(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Upload Proof of Payment</Text>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <Text style={styles.modalLabel}>Select File *</Text>
          {!selectedFile ? (
            <View style={styles.filePickerRow}>
              <TouchableOpacity style={styles.filePickerButton} onPress={handleCameraPicker}>
                <Ionicons name="camera" size={24} color={theme.primary} />
                <Text style={styles.filePickerText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filePickerButton} onPress={handleImagePicker}>
                <Ionicons name="image" size={24} color={theme.primary} />
                <Text style={styles.filePickerText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filePickerButton} onPress={handleDocumentPicker}>
                <Ionicons name="document" size={24} color={theme.primary} />
                <Text style={styles.filePickerText}>Files</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.selectedFileCard}>
              <Ionicons 
                name={selectedFile.type?.includes('pdf') ? 'document-text' : 'image'} 
                size={32} 
                color={theme.primary} 
              />
              <View style={styles.selectedFileInfo}>
                <Text style={styles.selectedFileName} numberOfLines={1}>{selectedFile.name}</Text>
                {selectedFile.size && (
                  <Text style={styles.selectedFileSize}>{formatFileSize(selectedFile.size)}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setSelectedFile(null)}>
                <Ionicons name="close-circle" size={24} color={theme.error} />
              </TouchableOpacity>
            </View>
          )}

          {/* Child Payment Reference - Non-editable */}
          <Text style={styles.modalLabel}>Payment Reference (Use when paying)</Text>
          <View style={styles.referenceContainer}>
            <Ionicons name="barcode-outline" size={20} color={theme.primary} />
            <Text style={styles.referenceText}>{selectedChild?.student_code || 'N/A'}</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>Required</Text>
            </View>
          </View>
          <Text style={styles.referenceHint}>
            Always include this reference when making bank payments
          </Text>

          <Text style={styles.modalLabel}>Payment Date *</Text>
          <TouchableOpacity
            style={styles.datePickerButton}
            onPress={() => setShowPaymentDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color={theme.primary} />
            <Text style={styles.datePickerText}>{paymentDateLabel}</Text>
            <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
          </TouchableOpacity>

          {showPaymentForField ? (
            <>
              <Text style={styles.modalLabel}>Payment For Month *</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowPaymentForPicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                <Text style={styles.datePickerText}>
                  {paymentForLabel || 'Select month'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.referenceHint}>
                {hasSuggestedPaymentForMonth
                  ? 'Prefilled from the fee due date. Tap to adjust if needed.'
                  : 'This proof of payment will be matched to the selected billing month.'}
              </Text>
            </>
          ) : (
            <View style={styles.oneTimePaymentRow}>
              <Text style={styles.modalLabel}>Payment Month</Text>
              <Text style={styles.referenceHint}>
                Recorded automatically for {autoMonthLabel}.
              </Text>
            </View>
          )}

          <Text style={styles.modalLabel}>Payment Category *</Text>
          <View style={styles.categoryRow}>
            {CATEGORY_OPTIONS.map((option) => {
              const isSelected = categoryCode === option.code;
              return (
                <TouchableOpacity
                  key={option.code}
                  style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                  onPress={() => setCategoryCode(option.code)}
                >
                  <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.referenceHint}>
            This helps allocate the payment correctly in the monthly finance ledger.
          </Text>

          <Text style={styles.modalLabel}>Bank Transaction Reference (Optional)</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="document-text-outline" size={20} color={theme.textSecondary} />
            <TextInput
              style={styles.textInput}
              value={paymentReference}
              onChangeText={setPaymentReference}
              placeholder="e.g., TXN123456"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <Text style={styles.modalLabel}>Amount Paid *</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.currencyPrefix}>R</Text>
            <TextInput
              style={styles.textInput}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              placeholder="0.00"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
        </ScrollView>

        {showPaymentForField && showPaymentForPicker && (
          <DateTimePicker
            value={paymentForMonth || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              if (Platform.OS !== 'ios') setShowPaymentForPicker(false);
              if (event.type === 'dismissed') return;
              if (selectedDate) {
                setPaymentForMonth(
                  new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
                );
              }
              if (Platform.OS === 'ios') setShowPaymentForPicker(false);
            }}
          />
        )}
        {showPaymentDatePicker && (
          <DateTimePicker
            value={paymentDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(event, selectedDate) => {
              if (Platform.OS !== 'ios') setShowPaymentDatePicker(false);
              if (event.type === 'dismissed') return;
              if (selectedDate) {
                const normalizedDate = new Date(
                  selectedDate.getFullYear(),
                  selectedDate.getMonth(),
                  selectedDate.getDate(),
                );
                setPaymentDate(normalizedDate);
                if (isUniformPayment) {
                  setPaymentForMonth(new Date(normalizedDate.getFullYear(), normalizedDate.getMonth(), 1));
                }
              }
              if (Platform.OS === 'ios') setShowPaymentDatePicker(false);
            }}
          />
        )}

        <View style={styles.modalFooter}>
          <TouchableOpacity 
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleUpload}
            disabled={!canSubmit}
          >
            {uploading ? (
              <EduDashSpinner color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>Submit Proof of Payment</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Celebration Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        title="Payment Submitted! 🎉"
        message="Your proof of payment has been uploaded. The school will verify and confirm your payment within 24-48 hours."
        buttonText="Done"
        onClose={handleSuccessModalClose}
        icon="checkmark-circle"
      />
    </Modal>
  );
}

const createStyles = (theme: any, insets: { top: number; bottom: number }) => StyleSheet.create({
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Math.max(16, insets.top),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: theme.text },
  modalContent: { flex: 1, padding: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 8, marginTop: 16 },
  referenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.primary + '15',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.primary + '40',
  },
  referenceText: { flex: 1, marginLeft: 8, fontSize: 18, fontWeight: '700', color: theme.primary },
  requiredBadge: {
    backgroundColor: theme.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  requiredText: { fontSize: 10, fontWeight: '600', color: '#fff' },
  referenceHint: { fontSize: 12, color: theme.textSecondary, marginTop: 6, fontStyle: 'italic' },
  oneTimePaymentRow: {
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  categoryChipActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  categoryChipText: {
    fontSize: 12,
    color: theme.text,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  filePickerRow: { flexDirection: 'row', gap: 12 },
  filePickerButton: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  filePickerText: { marginTop: 8, fontSize: 14, color: theme.text },
  selectedFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  selectedFileInfo: { flex: 1, marginLeft: 12 },
  selectedFileName: { fontSize: 14, fontWeight: '500', color: theme.text },
  selectedFileSize: { fontSize: 12, color: theme.textSecondary },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  datePickerText: {
    flex: 1,
    fontSize: 16,
    color: theme.text,
  },
  currencyPrefix: { fontSize: 16, color: theme.textSecondary, marginRight: 4 },
  textInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: theme.text },
  modalFooter: { 
    padding: 16, 
    paddingBottom: Math.max(16, insets.bottom),
    borderTopWidth: 1, 
    borderTopColor: theme.border 
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    paddingVertical: 16,
    borderRadius: 12,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
