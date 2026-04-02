/**
 * useProofOfPayment — state + handlers for proof-of-payment screen
 *
 * Extracted from parent-proof-of-payment.tsx.
 * All Alert.alert calls replaced with showAlert callback.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useCreatePOPUpload, CreatePOPUploadData } from '@/hooks/usePOPUploads';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import {
  consumePendingCameraResult,
  launchCameraWithRecovery,
  normalizeMediaUri,
} from '@/lib/utils/cameraRecovery';
import { inferFeeCategoryCode } from '@/lib/utils/feeUtils';
import type { FeeCategoryCode } from '@/types/finance';

const POP_PAYMENT_CAMERA_CONTEXT = 'pop_proof_of_payment';

type ShowAlert = (cfg: {
  title: string;
  message: string;
  buttons?: Array<{
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }>;
}) => void;

export interface SelectedFile {
  uri: string;
  name: string;
  size?: number;
  type?: string;
  webFile?: Blob;
}

interface Params {
  studentId: string;
  studentName: string;
  feeId?: string;
  paymentPurpose?: string;
}

export function useProofOfPayment(showAlert: ShowAlert, t: (k: string, o?: any) => string, params: Params) {
  const { studentId, feeId, paymentPurpose } = params;
  const createUpload = useCreatePOPUpload();
  const today = new Date();
  const lowerPurpose = (paymentPurpose || '').toLowerCase();
  const isUniformPayment = (feeId || '').startsWith('uniform:') || lowerPurpose.includes('uniform');
  const autoPaymentForMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), []);
  const showPaymentForField = !isUniformPayment;

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const autoCategoryCode = useMemo<FeeCategoryCode>(() => {
    if (isUniformPayment) return 'uniform';
    return inferFeeCategoryCode(paymentPurpose || title || description || 'tuition');
  }, [isUniformPayment, paymentPurpose, title, description]);

  const [categoryCode, setCategoryCode] = useState<FeeCategoryCode>(autoCategoryCode);
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [paymentForMonth, setPaymentForMonth] = useState<Date | null>(() => (isUniformPayment ? autoPaymentForMonth : null));
  const [paymentReference, setPaymentReference] = useState('');
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPaymentForPicker, setShowPaymentForPicker] = useState(false);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [advanceMonths, setAdvanceMonths] = useState(1);

  /** Generate array of month-start dates this payment covers */
  const coversMonths = useMemo(() => {
    if (!paymentForMonth || advanceMonths <= 0) return [];
    return Array.from({ length: advanceMonths }, (_, i) => {
      const d = new Date(paymentForMonth.getFullYear(), paymentForMonth.getMonth() + i, 1);
      return d.toISOString().split('T')[0];
    });
  }, [paymentForMonth, advanceMonths]);

  useEffect(() => { setCategoryCode(autoCategoryCode); }, [autoCategoryCode]);

  const setFileFromImageAsset = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    setSelectedFile({
      uri: normalizeMediaUri(asset.uri),
      name: asset.fileName || `payment_receipt_${Date.now()}.jpg`,
      size: asset.fileSize,
      type: asset.type || 'image/jpeg',
      webFile: (asset as any).file,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recovered = await consumePendingCameraResult(POP_PAYMENT_CAMERA_CONTEXT);
      if (cancelled || !recovered || recovered.canceled || !recovered.assets?.[0]) return;
      setFileFromImageAsset(recovered.assets[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [setFileFromImageAsset]);

  const handleImagePicker = useCallback(async () => {
    try {
      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        showAlert({ title: t('common.error'), message: 'Camera roll permission is required to select images.' });
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
    } catch {
      showAlert({ title: t('common.error'), message: 'Failed to select image' });
    }
  }, [showAlert, t, setFileFromImageAsset]);

  const handleCameraPicker = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        showAlert({ title: t('common.error'), message: 'Camera permission is required to take photos.' });
        return;
      }
      const result = await launchCameraWithRecovery(POP_PAYMENT_CAMERA_CONTEXT, {
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
      showAlert({ title: t('common.error'), message: 'Failed to take photo' });
    }
  }, [showAlert, t, setFileFromImageAsset]);

  const handleDocumentPicker = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.name,
          size: asset.size || undefined,
          type: asset.mimeType || undefined,
          webFile: (asset as any).file,
        });
      }
    } catch {
      showAlert({ title: t('common.error'), message: 'Failed to select document' });
    }
  }, [showAlert, t]);

  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Title is required');
    if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push('Valid payment amount is required');
    if (!paymentMethod) errors.push('Payment method is required');
    if (!categoryCode) errors.push('Payment category is required');
    if (!paymentForMonth && !isUniformPayment) errors.push('Payment month is required');
    if (!selectedFile) errors.push('Payment receipt file is required');
    return errors;
  }, [title, amount, paymentMethod, categoryCode, paymentForMonth, isUniformPayment, selectedFile]);

  const handleSubmit = useCallback(async () => {
    const errors = validateForm();
    if (errors.length > 0) { showAlert({ title: t('common.error'), message: errors.join('\n') }); return; }
    if (!studentId || !selectedFile) return;

    const effectiveMonth = paymentForMonth ?? (isUniformPayment ? autoPaymentForMonth : null);
    if (isUniformPayment && !paymentForMonth && effectiveMonth) setPaymentForMonth(effectiveMonth);

    try {
      const uploadData: CreatePOPUploadData = {
        student_id: studentId,
        upload_type: 'proof_of_payment',
        title: title.trim(),
        description: description.trim() || undefined,
        file_uri: selectedFile.uri,
        file_name: selectedFile.name,
        web_file: selectedFile.webFile,
        payment_amount: parseFloat(amount),
        payment_method: paymentMethod,
        category_code: categoryCode,
        payment_date: paymentDate.toISOString().split('T')[0],
        payment_for_month: effectiveMonth
          ? new Date(effectiveMonth.getFullYear(), effectiveMonth.getMonth(), 1).toISOString().split('T')[0]
          : undefined,
        payment_reference: paymentReference.trim() || undefined,
        advance_months: advanceMonths > 1 ? advanceMonths : undefined,
        covers_months: coversMonths.length > 1 ? coversMonths : undefined,
      };
      await createUpload.mutateAsync(uploadData);
      showAlert({
        title: t('pop.uploadSuccess'),
        message: t('pop.uploadSuccessDesc'),
        buttons: [{ text: t('common.ok'), onPress: () => router.back() }],
      });
    } catch (error) {
      showAlert({ title: t('common.error'), message: error instanceof Error ? error.message : 'Upload failed' });
    }
  }, [validateForm, studentId, selectedFile, paymentForMonth, isUniformPayment, autoPaymentForMonth, title, description, amount, paymentMethod, categoryCode, paymentDate, paymentReference, advanceMonths, coversMonths, createUpload, showAlert, t]);

  return {
    title, setTitle, description, setDescription, amount, setAmount,
    paymentMethod, setPaymentMethod, categoryCode, setCategoryCode,
    paymentDate, setPaymentDate, paymentForMonth, setPaymentForMonth,
    paymentReference, setPaymentReference, selectedFile, setSelectedFile,
    showDatePicker, setShowDatePicker, showPaymentForPicker, setShowPaymentForPicker,
    showPaymentMethods, setShowPaymentMethods,
    advanceMonths, setAdvanceMonths, coversMonths,
    isUniformPayment, showPaymentForField, autoPaymentForMonth,
    createUpload, validateForm,
    handleImagePicker, handleCameraPicker, handleDocumentPicker, handleSubmit,
  };
}
