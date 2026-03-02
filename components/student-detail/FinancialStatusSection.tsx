/**
 * Financial Status Section Component
 * Shows outstanding fees, payment status, and transaction history
 * Principals can mark payments as paid (cash/EFT/other)
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StudentDetail, Transaction, formatCurrency } from './types';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { AlertModal, type AlertButton } from '@/components/ui/AlertModal';
import { ModalLayer } from '@/components/ui/ModalLayer';

interface FinancialStatusSectionProps {
  student: StudentDetail;
  transactions: Transaction[];
  showDetails: boolean;
  onToggleDetails: () => void;
  theme: ThemeColors;
  /** Whether the current user is a principal (can mark payments) */
  isPrincipal?: boolean;
  /** Callback when a payment is marked as received */
  onMarkPaymentReceived?: (amount: number, paymentMethod: string, notes: string) => Promise<void>;
}

export const FinancialStatusSection: React.FC<FinancialStatusSectionProps> = ({
  student,
  transactions,
  showDetails,
  onToggleDetails,
  theme,
  isPrincipal = false,
  onMarkPaymentReceived,
}) => {
  const styles = createStyles(theme);
  type PaymentMethod = 'cash' | 'eft' | 'card' | 'other';
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertState, setAlertState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'error';
    buttons: AlertButton[];
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const showAlert = (
    title: string,
    message: string,
    type: 'info' | 'warning' | 'success' | 'error' = 'info',
    buttons: AlertButton[] = [{ text: 'OK', style: 'default' }],
  ) => {
    setAlertState({ visible: true, title, message, type, buttons });
  };

  const hideAlert = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
  };

  const outstandingAmount = student.outstanding_fees || 0;

  const handleMarkAsPaid = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid payment amount', 'warning');
      return;
    }

    if (!onMarkPaymentReceived) {
      showAlert('Error', 'Payment recording is not available', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      await onMarkPaymentReceived(amount, paymentMethod, paymentNotes);
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      setPaymentMethod('cash');
      showAlert('Success', `Payment of ${formatCurrency(amount)} recorded successfully`, 'success');
    } catch (error) {
      console.error('Error recording payment:', error);
      showAlert('Error', 'Failed to record payment. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentMethods: { id: PaymentMethod; label: string; icon: string }[] = [
    { id: 'cash', label: 'Cash', icon: 'cash-outline' },
    { id: 'eft', label: 'EFT', icon: 'swap-horizontal-outline' },
    { id: 'card', label: 'Card', icon: 'card-outline' },
    { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
  ];

  return (
    <View style={styles.section}>
      <TouchableOpacity 
        style={styles.sectionHeader}
        onPress={onToggleDetails}
      >
        <Text style={styles.sectionTitle}>Financial Status</Text>
        <Ionicons 
          name={showDetails ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={theme.primary} 
        />
      </TouchableOpacity>
      
      <View style={styles.financialCard}>
        <View style={styles.feeInfo}>
          <Text style={styles.feeLabel}>Outstanding Fees</Text>
          <Text style={[
            styles.feeAmount,
            { color: outstandingAmount > 0 ? '#EF4444' : '#10B981' }
          ]}>
            {formatCurrency(outstandingAmount)}
          </Text>
        </View>
        <View style={[
          styles.paymentStatus,
          { backgroundColor: student.payment_status === 'current' ? '#10B981' : '#EF4444' }
        ]}>
          <Text style={styles.paymentStatusText}>
            {student.payment_status === 'current' ? 'Up to Date' : 'Overdue'}
          </Text>
        </View>
      </View>

      {/* Principal: Mark as Paid Button */}
      {isPrincipal && outstandingAmount > 0 && (
        <TouchableOpacity 
          style={styles.markPaidButton}
          onPress={() => {
            setPaymentAmount(outstandingAmount.toString());
            setShowPaymentModal(true);
          }}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          <Text style={styles.markPaidButtonText}>Record Payment Received</Text>
        </TouchableOpacity>
      )}

      {/* Transaction History (Expandable) */}
      {showDetails && (
        <View style={styles.transactionHistory}>
          <Text style={styles.transactionHistoryTitle}>Recent Transactions</Text>
          {transactions.length > 0 ? (
            transactions.map((transaction) => (
              <View key={transaction.id} style={styles.transactionItem}>
                <View style={styles.transactionLeft}>
                  <Text style={styles.transactionType}>{transaction.type.replace('_', ' ')}</Text>
                  <Text style={styles.transactionDate}>
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[
                  styles.transactionAmount,
                  { color: transaction.type.includes('payment') ? '#10B981' : '#EF4444' }
                ]}>
                  {transaction.type.includes('payment') ? '+' : '-'}
                  {formatCurrency(Math.abs(transaction.amount))}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.noTransactions}>No transaction history</Text>
          )}
        </View>
      )}

      {/* Payment Recording Modal */}
      <ModalLayer
        visible={showPaymentModal}
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Record Payment</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Recording payment for {student.first_name} {student.last_name}
            </Text>

            {/* Amount Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Amount (R)</Text>
              <TextInput
                style={[styles.textInput, { 
                  backgroundColor: theme.background, 
                  color: theme.text,
                  borderColor: theme.border 
                }]}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            {/* Payment Method Selection */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Payment Method</Text>
              <View style={styles.methodGrid}>
                {paymentMethods.map((method) => (
                  <TouchableOpacity
                    key={method.id}
                    style={[
                      styles.methodButton,
                      { 
                        backgroundColor: paymentMethod === method.id ? theme.primary : theme.background,
                        borderColor: paymentMethod === method.id ? theme.primary : theme.border,
                      }
                    ]}
                    onPress={() => setPaymentMethod(method.id)}
                  >
                    <Ionicons 
                      name={method.icon as any} 
                      size={20} 
                      color={paymentMethod === method.id ? '#fff' : theme.textSecondary} 
                    />
                    <Text style={[
                      styles.methodButtonText,
                      { color: paymentMethod === method.id ? '#fff' : theme.text }
                    ]}>
                      {method.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notes Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Notes (optional)</Text>
              <TextInput
                style={[styles.textInput, styles.notesInput, { 
                  backgroundColor: theme.background, 
                  color: theme.text,
                  borderColor: theme.border 
                }]}
                value={paymentNotes}
                onChangeText={setPaymentNotes}
                placeholder="e.g., Received at parent meeting"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => setShowPaymentModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, { opacity: isSubmitting ? 0.6 : 1 }]}
                onPress={handleMarkAsPaid}
                disabled={isSubmitting}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.confirmButtonText}>
                  {isSubmitting ? 'Recording...' : 'Record Payment'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ModalLayer>

      <AlertModal
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        buttons={alertState.buttons}
        onClose={hideAlert}
      />
    </View>
  );
};

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  section: {
    margin: 16,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: theme.shadow || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  financialCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeInfo: {
    flex: 1,
  },
  feeLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  feeAmount: {
    fontSize: 18,
    fontWeight: '600',
  },
  paymentStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  paymentStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  transactionHistory: {
    marginTop: 16,
    padding: 12,
    backgroundColor: theme.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  transactionHistoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 12,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  transactionLeft: {
    flex: 1,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.text,
    textTransform: 'capitalize',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  noTransactions: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    padding: 16,
    fontStyle: 'italic',
  },
  // Mark as Paid button
  markPaidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  markPaidButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  notesInput: {
    height: 60,
    textAlignVertical: 'top',
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
