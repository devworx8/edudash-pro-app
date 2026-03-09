/**
 * Payment Flow Screen
 * 
 * Guides parents through the payment process:
 * 1. Shows school banking details
 * 2. Opens banking app for payment
 * 3. Prompts to upload proof of payment
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { PaymentUploadModal } from '@/components/payments';
import { BankDetailRow } from '@/components/payments/BankDetailRow';
import { BankingAppsPanel } from '@/components/payments/BankingAppsPanel';
import { usePaymentFlow } from '@/hooks/usePaymentFlow';
import { createStyles } from '@/styles/payment-flow.styles';
import type { PaymentChild } from '@/types/payments';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function PaymentFlowScreen() {
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Type the params
  const feeId = params.feeId as string | undefined;
  const feeDescription = params.feeDescription as string | undefined;
  const feeAmount = params.feeAmount as string | undefined;
  const feeDueDate = params.feeDueDate as string | undefined;
  const childId = params.childId as string | undefined;
  const childName = params.childName as string | undefined;
  const studentCode = params.studentCode as string | undefined;
  const preschoolId = params.preschoolId as string | undefined;
  const preschoolName = params.preschoolName as string | undefined;
  const openUpload = params.openUpload as string | undefined;

  const {
    loading,
    bankDetails,
    showUploadModal,
    setShowUploadModal,
    bankApps,
    bankHint,
    copiedField,
    formattedAmount,
    launchState,
    canUploadProof,
    copyToClipboard,
    openBankingApp,
    confirmManualPayment,
    sharePaymentDetails,
  } = usePaymentFlow({
    feeId,
    feeDescription,
    feeAmount,
    childId,
    childName,
    studentCode,
    preschoolId,
    preschoolName,
  });

  const styles = useMemo(() => createStyles(theme), [theme]);
  const uploadButtonLabel = launchState === 'idle' ? 'Complete Step 1 First' : 'Upload Proof of Payment';
  const manualConfirmLabel =
    launchState === 'manual_confirmed' ? 'Manual Payment Confirmed' : 'I Paid Manually';

  useEffect(() => {
    if (openUpload === '1') {
      setShowUploadModal(true);
    }
  }, [openUpload, setShowUploadModal]);

  const handleUploadSuccess = () => {
    showAlert({
      title: 'Payment Submitted! 🎉',
      message: 'Your proof of payment has been uploaded. The school will verify and confirm your payment within 24-48 hours.',
      type: 'success',
      buttons: [{ text: 'Done', onPress: () => router.back() }]
    });
  };

  // Build child object for upload modal
  const selectedChild: PaymentChild | undefined = childId ? {
    id: childId,
    first_name: childName?.split(' ')[0] || '',
    last_name: childName?.split(' ').slice(1).join(' ') || '',
    preschool_id: preschoolId || '',
    preschool_name: preschoolName,
    student_code: studentCode || '',
  } : undefined;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScreenHeader title="Make Payment" />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading payment details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="Make Payment" subtitle={preschoolName} />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Payment Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Ionicons name="receipt-outline" size={24} color={theme.primary} />
            <Text style={styles.summaryTitle}>Payment Summary</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>For</Text>
            <Text style={styles.summaryValue}>{feeDescription || 'School Fees'}</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Child</Text>
            <Text style={styles.summaryValue}>{childName || 'N/A'}</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Reference</Text>
            <View style={styles.referenceRow}>
              <Text style={[styles.summaryValue, styles.referenceText]}>{studentCode || 'N/A'}</Text>
              <TouchableOpacity 
                onPress={() => copyToClipboard(studentCode || '', 'reference')}
                style={styles.copyButton}
              >
                <Ionicons 
                  name={copiedField === 'reference' ? 'checkmark' : 'copy-outline'} 
                  size={16} 
                  color={theme.primary} 
                />
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={[styles.summaryRow, styles.amountRow]}>
            <Text style={styles.amountLabel}>Amount Due</Text>
            <Text style={styles.amountValue}>{formattedAmount}</Text>
          </View>
        </View>

        {/* Important Notice */}
        <View style={styles.noticeCard}>
          <Ionicons name="information-circle" size={20} color={theme.warning} />
          <Text style={styles.noticeText}>
            Always use your child's reference code ({studentCode}) when making payment
          </Text>
        </View>

        {/* Bank Details Card */}
        <View style={styles.bankCard}>
          <View style={styles.bankHeader}>
            <Ionicons name="business-outline" size={24} color={theme.text} />
            <Text style={styles.bankTitle}>School Banking Details</Text>
          </View>

          {bankDetails ? (
            <>
              <BankDetailRow 
                label="Bank" 
                value={bankDetails.bank_name} 
                onCopy={() => copyToClipboard(bankDetails.bank_name, 'bank')}
                copied={copiedField === 'bank'}
                theme={theme}
              />
              <BankDetailRow 
                label="Account Name" 
                value={bankDetails.account_name} 
                onCopy={() => copyToClipboard(bankDetails.account_name, 'name')}
                copied={copiedField === 'name'}
                theme={theme}
              />
              <BankDetailRow 
                label="Account Number" 
                value={bankDetails.account_number} 
                onCopy={() => copyToClipboard(bankDetails.account_number, 'account')}
                copied={copiedField === 'account'}
                theme={theme}
                highlight
              />
              {bankDetails.branch_code && (
                <BankDetailRow 
                  label="Branch Code" 
                  value={bankDetails.branch_code} 
                  onCopy={() => copyToClipboard(bankDetails.branch_code!, 'branch')}
                  copied={copiedField === 'branch'}
                  theme={theme}
                />
              )}
              <BankDetailRow 
                label="Reference" 
                value={studentCode || 'N/A'} 
                onCopy={() => copyToClipboard(studentCode || '', 'ref2')}
                copied={copiedField === 'ref2'}
                theme={theme}
                highlight
              />
            </>
          ) : (
            <View style={styles.noBankDetails}>
              <Ionicons name="alert-circle-outline" size={32} color={theme.textSecondary} />
              <Text style={styles.noBankDetailsText}>
                Bank details not available. Please contact the school directly for payment information.
              </Text>
            </View>
          )}

          {/* Share Button */}
          <TouchableOpacity style={styles.shareButton} onPress={sharePaymentDetails}>
            <Ionicons name="share-outline" size={18} color={theme.primary} />
            <Text style={[styles.shareButtonText, { color: theme.primary }]}>Share Payment Details</Text>
          </TouchableOpacity>
        </View>

        {/* Steps */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How to Pay</Text>
          
          <View style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Open Your Banking App</Text>
              <Text style={styles.stepDesc}>Use your bank's app or internet banking</Text>
            </View>
          </View>
          
          <View style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Make EFT Payment</Text>
              <Text style={styles.stepDesc}>Use the bank details above and your reference code</Text>
            </View>
          </View>
          
          <View style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Upload Proof of Payment</Text>
              <Text style={styles.stepDesc}>Share or screenshot your payment confirmation</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity 
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => openBankingApp()}
          >
            <Ionicons name="wallet-outline" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Open Banking App</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.secondaryButton, 
              { borderColor: canUploadProof ? theme.primary : theme.textSecondary },
              !canUploadProof && styles.disabledButton
            ]}
            onPress={() => canUploadProof && setShowUploadModal(true)}
            disabled={!canUploadProof}
          >
            <Ionicons 
              name="cloud-upload-outline" 
              size={20} 
              color={canUploadProof ? theme.primary : theme.textSecondary} 
            />
            <Text style={[
              styles.secondaryButtonText, 
              { color: canUploadProof ? theme.primary : theme.textSecondary }
            ]}>
              {uploadButtonLabel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.manualConfirmButton,
              {
                borderColor: launchState === 'manual_confirmed' ? theme.primary : theme.border,
                backgroundColor: launchState === 'manual_confirmed' ? theme.primary + '12' : 'transparent',
              },
            ]}
            onPress={confirmManualPayment}
          >
            <Ionicons
              name={launchState === 'manual_confirmed' ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={20}
              color={launchState === 'manual_confirmed' ? theme.primary : theme.textSecondary}
            />
            <Text
              style={[
                styles.manualConfirmButtonText,
                { color: launchState === 'manual_confirmed' ? theme.primary : theme.textSecondary },
              ]}
            >
              {manualConfirmLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {bankHint && (
          <View style={[styles.bankHint, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="information-circle" size={18} color={theme.primary} />
            <Text style={[styles.bankHintText, { color: theme.textSecondary }]}>{bankHint}</Text>
          </View>
        )}

        <BankingAppsPanel
          banks={bankApps}
          onSelect={(bank) => openBankingApp(bank)}
          emptyMessage="No banking apps available in the catalog. Open your banking app manually and return to upload POP."
        />

        <Text style={styles.bankHelperText}>
          Not seeing your bank? Open it manually and return here to upload proof of payment.
        </Text>

        {/* Help Text */}
        <Text style={styles.helpText}>
          After making payment, upload your proof of payment (screenshot or PDF). 
          The school will verify and update your account within 24-48 hours.
        </Text>
      </ScrollView>

      {/* Upload Modal */}
      <PaymentUploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={handleUploadSuccess}
        selectedChildId={childId || null}
        selectedChild={selectedChild}
        userId={user?.id || ''}
        preschoolId={preschoolId}
        feeId={feeId}
        initialAmount={feeAmount || ''}
        paymentPurpose={feeDescription || 'School Fees'}
        paymentForDate={feeDueDate}
        theme={theme}
      />

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
