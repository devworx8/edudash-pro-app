import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useParentPayments } from '@/hooks/useParentPayments';
import type { PaymentTabType, StudentFee } from '@/types/payments';
import { assertSupabase } from '@/lib/supabase';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';

// Import components
import {
  ChildSelector,
  SelectedChildCard,
  BalanceCard,
  NextPaymentCard,
  RegistrationCard,
  UpcomingFeesList,
  FeeStructureList,
  PaymentHistoryList,
  POPUploadSection,
  PaymentUploadModal,
  PendingDocumentsCard,
} from '@/components/payments';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';
export default function ParentPaymentsScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const { showAlert, alertProps } = useAlertModal();
  const { tab, childId, studentId, ref: prefillRef, amount: prefillAmount, purpose: prefillPurpose } = useLocalSearchParams<{
    tab?: string;
    childId?: string;
    studentId?: string;
    ref?: string;
    amount?: string;
    purpose?: string;
  }>();
  const normalizedTab: PaymentTabType | undefined =
    tab === 'upcoming' || tab === 'history' || tab === 'upload' ? (tab as PaymentTabType) : undefined;
  const requestedChildId = childId || studentId;
  const hasConsumedPrefillRef = React.useRef(false);
  
  // Data hook
  const {
    loading,
    refreshing,
    children,
    selectedChildId,
    setSelectedChildId,
    selectedChild,
    feeStructure,
    popUploads,
    upcomingFees,
    paidFees,
    pendingVerificationFees,
    outstandingBalance,
    onRefresh,
    reloadFees,
  } = useParentPayments();

  // Local UI state
  const [activeTab, setActiveTab] = useState<PaymentTabType>(normalizedTab || 'upcoming');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFeeAmount, setSelectedFeeAmount] = useState('');
  const [selectedFeeReference, setSelectedFeeReference] = useState('');
  const [selectedPaymentPurpose, setSelectedPaymentPurpose] = useState('');
  const [selectedFeeId, setSelectedFeeId] = useState<string | undefined>(undefined);
  const [selectedFeeDueDate, setSelectedFeeDueDate] = useState<string | undefined>(undefined);

  // Refresh data when screen comes into focus (e.g., from notification tap)
  useFocusEffect(
    useCallback(() => {
      logger.debug('[ParentPayments] Screen focused, refreshing data...');
      reloadFees();
    }, [reloadFees])
  );

  React.useEffect(() => {
    if (normalizedTab && normalizedTab !== activeTab) {
      setActiveTab(normalizedTab);
    }
  }, [normalizedTab, activeTab]);

  React.useEffect(() => {
    if (!requestedChildId || children.length === 0) return;
    const exists = children.some(child => child.id === requestedChildId);
    if (exists) {
      setSelectedChildId(requestedChildId);
    }
  }, [requestedChildId, children, setSelectedChildId]);

  React.useEffect(() => {
    if (hasConsumedPrefillRef.current) return;
    if (normalizedTab !== 'upload') return;
    if (!selectedChildId || !selectedChild) return;
    if (!prefillRef && !prefillAmount && !prefillPurpose) return;

    setSelectedFeeAmount(prefillAmount ? String(prefillAmount) : '');
    setSelectedFeeReference(prefillRef ? String(prefillRef) : '');
    setSelectedPaymentPurpose(prefillPurpose ? String(prefillPurpose) : 'Registration Fee');
    setSelectedFeeId(undefined);
    setSelectedFeeDueDate(undefined);
    setShowUploadModal(true);
    hasConsumedPrefillRef.current = true;
  }, [normalizedTab, selectedChildId, selectedChild, prefillRef, prefillAmount, prefillPurpose]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const openUploadForFee = (fee: StudentFee) => {
    setSelectedFeeAmount(fee.amount.toString());
    setSelectedFeeReference('');
    setSelectedPaymentPurpose(fee.description || 'School Fees');
    setSelectedFeeId(fee.id);
    setSelectedFeeDueDate(fee.due_date);
    setShowUploadModal(true);
  };

  const openRegistrationUpload = () => {
    if (!selectedChild) return;
    setSelectedFeeAmount((selectedChild.registration_fee_amount || 0).toString());
    setSelectedFeeReference('');
    setSelectedPaymentPurpose('Registration Fee');
    setSelectedFeeId(undefined);
    setSelectedFeeDueDate(undefined);
    setShowUploadModal(true);
  };

  const handlePayNow = (fee: StudentFee) => {
    if (!selectedChildId || !selectedChild) {
      showAlert({ title: 'Error', message: 'Please select a child first' });
      return;
    }

    // Navigate to payment flow screen with fee details
    router.push({
      pathname: '/screens/payment-flow',
      params: {
        feeId: fee.id,
        feeDescription: fee.description,
        feeAmount: fee.amount.toString(),
        feeDueDate: fee.due_date,
        childId: selectedChildId,
        childName: `${selectedChild.first_name} ${selectedChild.last_name}`,
        studentCode: selectedChild.student_code,
        preschoolId: selectedChild.preschool_id,
        preschoolName: selectedChild.preschool_name || '',
      },
    });
  };

  const openReceipt = useCallback(async (fee: StudentFee) => {
    try {
      let receiptUrl = fee.receipt_url || null;
      if (!receiptUrl && fee.receipt_storage_path) {
        const { data, error } = await assertSupabase().storage
          .from('generated-pdfs')
          .createSignedUrl(fee.receipt_storage_path, 3600);
        if (error) {
          throw error;
        }
        receiptUrl = data?.signedUrl || null;
      }

      if (!receiptUrl) {
        showAlert({
          title: 'Receipt unavailable',
          message: 'This payment does not have a receipt yet.',
          type: 'info',
          buttons: [{ text: 'OK' }],
        });
        return;
      }

      const isPdf = /\.pdf(\?|$)/i.test(receiptUrl);
      if (isPdf) {
        router.push({ pathname: '/screens/pdf-viewer', params: { url: receiptUrl, title: 'Receipt' } });
        return;
      }

      await Linking.openURL(receiptUrl);
    } catch (error: any) {
      showAlert({
        title: 'Receipt error',
        message: error?.message || 'Unable to open receipt.',
        type: 'error',
        buttons: [{ text: 'OK' }],
      });
    }
  }, [router, showAlert]);

  const handleUploadSuccess = () => {
    logger.debug('[ParentPayments] Upload success - reloading all payment data');
    // Force a complete refresh of all payment data
    reloadFees();
    // Also trigger a full refresh including children data
    onRefresh();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScreenHeader title="Fees & Payments" subtitle={selectedChild?.preschool_name} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading payment information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScreenHeader title="Fees & Payments" subtitle={selectedChild?.preschool_name} />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Child Selector */}
        <ChildSelector 
          children={children}
          selectedChildId={selectedChildId}
          onSelectChild={setSelectedChildId}
          theme={theme}
        />

        {/* Selected Child Card */}
        {selectedChild && (
          <SelectedChildCard child={selectedChild} theme={theme} />
        )}

        {/* Balance Overview */}
        <BalanceCard 
          outstandingBalance={outstandingBalance} 
          upcomingFeesCount={upcomingFees.length}
          pendingVerificationCount={pendingVerificationFees.length}
          upcomingFees={upcomingFees}
          theme={theme} 
        />

        {/* Always-visible Upload POP button */}
        {selectedChild && (
          <TouchableOpacity
            style={[styles.uploadPopButton, { backgroundColor: theme.primary }]}
            onPress={() => {
              setSelectedFeeAmount('');
              setSelectedFeeReference('');
              setSelectedPaymentPurpose('School Fees');
              setSelectedFeeId(undefined);
              setSelectedFeeDueDate(undefined);
              setShowUploadModal(true);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16 }}>📸</Text>
              </View>
              <Text style={styles.uploadPopButtonText}>Upload Proof of Payment</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Next Payment */}
        <NextPaymentCard upcomingFees={upcomingFees} theme={theme} />

        {/* Registration Fee */}
        {selectedChild && (
          <RegistrationCard
            child={selectedChild}
            theme={theme}
            onUploadPress={openRegistrationUpload}
          />
        )}

        {/* Pending Documents - Shows if any documents are missing */}
        {selectedChild && (
          <PendingDocumentsCard
            studentId={selectedChild.id}
            theme={theme}
          />
        )}

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          {(['upcoming', 'history', 'upload'] as PaymentTabType[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'upcoming' ? 'Upcoming' : tab === 'history' ? 'History' : 'Upload'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'upcoming' && (
            <>
              <Text style={styles.sectionTitle}>Upcoming Payments</Text>
              <UpcomingFeesList 
                fees={upcomingFees} 
                onUploadPress={openUploadForFee}
                onPayPress={handlePayNow}
                theme={theme} 
              />
              <FeeStructureList feeStructure={feeStructure} theme={theme} />
            </>
          )}

          {activeTab === 'history' && (
            <>
              <Text style={styles.sectionTitle}>Payment History</Text>
              <PaymentHistoryList paidFees={paidFees} theme={theme} onViewReceipt={openReceipt} />
            </>
          )}

          {activeTab === 'upload' && (
            <>
              <Text style={styles.sectionTitle}>Upload Proof of Payment</Text>
              <POPUploadSection 
                popUploads={popUploads}
                onUploadPress={() => {
                  setSelectedFeeAmount('');
                  setSelectedFeeReference('');
                  setSelectedPaymentPurpose('');
                  setSelectedFeeId(undefined);
                  setSelectedFeeDueDate(undefined);
                  setShowUploadModal(true);
                }}
                theme={theme}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* Upload Modal */}
      <PaymentUploadModal
        visible={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setSelectedFeeAmount('');
          setSelectedFeeReference('');
          setSelectedPaymentPurpose('');
          setSelectedFeeId(undefined);
          setSelectedFeeDueDate(undefined);
        }}
        onSuccess={handleUploadSuccess}
        selectedChildId={selectedChildId}
        selectedChild={selectedChild}
        userId={user?.id || ''}
        preschoolId={profile?.preschool_id}
        feeId={selectedFeeId}
        initialAmount={selectedFeeAmount}
        initialReference={selectedFeeReference}
        paymentPurpose={selectedPaymentPurpose}
        paymentForDate={selectedFeeDueDate}
        theme={theme}
      />
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: theme.textSecondary,
    fontSize: 14,
  },
  uploadPopButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 12,
  },
  uploadPopButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: theme.primary,
  },
  tabText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  tabContent: {
    minHeight: 200,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 12,
  },
});
