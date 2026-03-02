/**
 * Fee Breakdown Section Component
 * Shows monthly fee tiers, billing history, and allows principals to edit fees/dates.
 * Max ~350 lines (excl. StyleSheet) per WARP.md.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StudentDetail, StudentFee, formatCurrency } from './types';
import { formatAge } from './types';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { ModalLayer } from '@/components/ui/ModalLayer';

interface FeeBreakdownSectionProps {
  student: StudentDetail;
  theme: ThemeColors;
  isPrincipal?: boolean;
  onUpdateFee?: (feeId: string, updates: { amount?: number; due_date?: string }) => Promise<void>;
  onCorrectFee?: (studentId: string, billingMonth: string) => Promise<void>;
}

const STATUS_COLORS: Record<string, string> = {
  paid: '#10B981',
  pending: '#F59E0B',
  overdue: '#EF4444',
  waived: '#6B7280',
  partial: '#3B82F6',
};

const STATUS_ICONS: Record<string, string> = {
  paid: 'checkmark-circle',
  pending: 'time',
  overdue: 'alert-circle',
  waived: 'remove-circle',
  partial: 'ellipse',
};

export const FeeBreakdownSection: React.FC<FeeBreakdownSectionProps> = ({
  student,
  theme,
  isPrincipal = false,
  onUpdateFee,
  onCorrectFee,
}) => {
  const styles = createStyles(theme);
  const [editingFee, setEditingFee] = useState<StudentFee | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDueDate, setEditDueDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const tuitionFees = (student.student_fees || []).filter(f => f.category_code === 'tuition');
  const otherFees = (student.student_fees || []).filter(f => f.category_code !== 'tuition');

  const handleEditFee = useCallback((fee: StudentFee) => {
    setEditingFee(fee);
    setEditAmount(fee.amount.toString());
    setEditDueDate(fee.due_date ? new Date(fee.due_date) : new Date());
  }, []);

  const handleSaveFee = useCallback(async () => {
    if (!editingFee || !onUpdateFee) return;
    const newAmount = parseFloat(editAmount);
    if (isNaN(newAmount) || newAmount <= 0) return;

    try {
      setSaving(true);
      await onUpdateFee(editingFee.id, {
        amount: newAmount,
        due_date: editDueDate.toISOString().split('T')[0],
      });
      setEditingFee(null);
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  }, [editingFee, editAmount, editDueDate, onUpdateFee]);

  const handleCorrectFee = useCallback(async () => {
    if (!onCorrectFee || !student.id) return;
    const billingMonth = new Date();
    const monthStart = new Date(billingMonth.getFullYear(), billingMonth.getMonth(), 1);
    try {
      setSaving(true);
      await onCorrectFee(student.id, monthStart.toISOString().split('T')[0]);
    } finally {
      setSaving(false);
    }
  }, [onCorrectFee, student.id]);

  const formatMonth = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Fee Details</Text>

      {/* Current Fee Tier Card */}
      <View style={styles.tierCard}>
        <View style={styles.tierRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tierLabel}>Fee Tier</Text>
            <Text style={styles.tierValue}>{student.fee_tier_name || 'Not assigned'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.tierLabel}>Monthly</Text>
            <Text style={[styles.tierValue, { color: theme.primary }]}>
              {student.monthly_fee_amount ? formatCurrency(student.monthly_fee_amount) : '—'}
            </Text>
          </View>
        </View>
        <View style={styles.tierMeta}>
          <Ionicons name="person" size={14} color={theme.textSecondary} />
          <Text style={styles.tierMetaText}>
            Age: {formatAge(student.age_months, student.age_years)} · DOB: {new Date(student.date_of_birth).toLocaleDateString('en-ZA')}
          </Text>
        </View>
        {isPrincipal && onCorrectFee && (
          <TouchableOpacity style={styles.correctButton} onPress={handleCorrectFee} disabled={saving}>
            <Ionicons name="refresh" size={16} color={theme.primary} />
            <Text style={[styles.correctButtonText, { color: theme.primary }]}>
              Re-assess Fee for Age
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tuition Billing History */}
      {tuitionFees.length > 0 && (
        <View style={styles.feeList}>
          <Text style={styles.feeListTitle}>Tuition History</Text>
          {tuitionFees.map(fee => (
            <View key={fee.id} style={styles.feeRow}>
              <View style={styles.feeStatusDot}>
                <Ionicons
                  name={(STATUS_ICONS[fee.status] || 'ellipse') as any}
                  size={18}
                  color={STATUS_COLORS[fee.status] || theme.textSecondary}
                />
              </View>
              <View style={styles.feeInfo}>
                <Text style={styles.feeMonth}>{formatMonth(fee.billing_month)}</Text>
                <Text style={styles.feeDue}>
                  Due: {fee.due_date ? new Date(fee.due_date + 'T00:00:00').toLocaleDateString('en-ZA') : 'N/A'}
                </Text>
              </View>
              <View style={styles.feeAmounts}>
                <Text style={[styles.feeAmount, { color: STATUS_COLORS[fee.status] || theme.text }]}>
                  {formatCurrency(fee.amount)}
                </Text>
                {fee.amount_paid > 0 && fee.status !== 'paid' && (
                  <Text style={styles.feePaid}>
                    Paid: {formatCurrency(fee.amount_paid)}
                  </Text>
                )}
              </View>
              {isPrincipal && fee.status !== 'paid' && fee.status !== 'waived' && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleEditFee(fee)}
                >
                  <Ionicons name="create-outline" size={18} color={theme.primary} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Other Fees */}
      {otherFees.length > 0 && (
        <View style={styles.feeList}>
          <Text style={styles.feeListTitle}>Other Fees</Text>
          {otherFees.map(fee => (
            <View key={fee.id} style={styles.feeRow}>
              <View style={styles.feeStatusDot}>
                <Ionicons
                  name={(STATUS_ICONS[fee.status] || 'ellipse') as any}
                  size={18}
                  color={STATUS_COLORS[fee.status] || theme.textSecondary}
                />
              </View>
              <View style={styles.feeInfo}>
                <Text style={styles.feeMonth}>{fee.fee_name}</Text>
                <Text style={styles.feeDue}>{fee.category_code}</Text>
              </View>
              <Text style={[styles.feeAmount, { color: STATUS_COLORS[fee.status] || theme.text }]}>
                {formatCurrency(fee.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!student.student_fees?.length && (
        <Text style={styles.noFees}>No fees assigned yet</Text>
      )}

      {/* Edit Fee Modal */}
      <ModalLayer
        visible={editingFee !== null}
        animationType="slide"
        onRequestClose={() => setEditingFee(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Fee</Text>
              <TouchableOpacity onPress={() => setEditingFee(null)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {editingFee && (
              <>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  {editingFee.fee_name} — {formatMonth(editingFee.billing_month)}
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Amount (R)</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Due Date</Text>
                  <TouchableOpacity
                    style={[styles.dateButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={{ color: theme.text }}>
                      {editDueDate.toLocaleDateString('en-ZA')}
                    </Text>
                    <Ionicons name="calendar" size={20} color={theme.textSecondary} />
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={editDueDate}
                      mode="date"
                      onChange={(_, d) => {
                        setShowDatePicker(false);
                        if (d) setEditDueDate(d);
                      }}
                    />
                  )}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, { borderColor: theme.border }]}
                    onPress={() => setEditingFee(null)}
                  >
                    <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, { opacity: saving ? 0.6 : 1 }]}
                    onPress={handleSaveFee}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </ModalLayer>
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
  sectionTitle: { fontSize: 18, fontWeight: '600', color: theme.text, marginBottom: 12 },
  tierCard: {
    backgroundColor: theme.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  tierLabel: { fontSize: 12, color: theme.textSecondary, marginBottom: 2 },
  tierValue: { fontSize: 16, fontWeight: '700', color: theme.text },
  tierMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  tierMetaText: { fontSize: 12, color: theme.textSecondary },
  correctButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primary + '40',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  correctButtonText: { fontSize: 13, fontWeight: '600' },
  feeList: { marginTop: 8 },
  feeListTitle: { fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 8 },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 10,
  },
  feeStatusDot: { width: 24, alignItems: 'center' },
  feeInfo: { flex: 1 },
  feeMonth: { fontSize: 14, fontWeight: '500', color: theme.text },
  feeDue: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },
  feeAmounts: { alignItems: 'flex-end' },
  feeAmount: { fontSize: 15, fontWeight: '700' },
  feePaid: { fontSize: 11, color: '#10B981', marginTop: 1 },
  editButton: { padding: 6 },
  noFees: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', paddingVertical: 20, fontStyle: 'italic' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalSubtitle: { fontSize: 14, marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
