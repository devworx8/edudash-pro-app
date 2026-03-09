/**
 * PayrollView
 *
 * Teacher salary management + payment recording for principals.
 * Reads/writes teacher_salaries and teacher_payments tables.
 * Logs payments to financial_transactions for unified finance tracking.
 * ≤400 lines per WARP.md.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import type { Teacher } from '@/types/teacher-management';
import type { AlertButton } from '@/components/ui/AlertModal';

interface TeacherSalary {
  id: string;
  teacher_id: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  pay_scale: string | null;
  effective_date: string;
  notes: string | null;
}

interface TeacherPayment {
  id: string;
  teacher_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
}

interface PayrollViewProps {
  teachers: Teacher[];
  preschoolId: string | null;
  userId?: string;
  theme?: ThemeColors;
  showAlert: (cfg: {
    title: string;
    message?: string;
    type?: 'info' | 'warning' | 'success' | 'error';
    buttons?: AlertButton[];
  }) => void;
}

export function PayrollView({ teachers, preschoolId, userId, theme, showAlert }: PayrollViewProps) {
  const [salaries, setSalaries] = useState<Record<string, TeacherSalary>>({});
  const [payments, setPayments] = useState<Record<string, TeacherPayment[]>>({});
  const [loading, setLoading] = useState(false);
  // Salary edit modal
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [editBasic, setEditBasic] = useState('');
  const [editAllowances, setEditAllowances] = useState('');
  const [editDeductions, setEditDeductions] = useState('');
  const [editPayScale, setEditPayScale] = useState('');
  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [payType, setPayType] = useState<'salary' | 'advance' | 'loan' | 'bonus' | 'reimbursement' | 'other'>('salary');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // Principal self-payment
  const [showPrincipalPayModal, setShowPrincipalPayModal] = useState(false);
  const [principalAmount, setPrincipalAmount] = useState('');
  const [principalMethod, setPrincipalMethod] = useState('bank_transfer');
  const [principalType, setPrincipalType] = useState<'salary' | 'advance' | 'loan' | 'bonus' | 'reimbursement' | 'other'>('salary');
  const [principalRef, setPrincipalRef] = useState('');
  const [principalNotes, setPrincipalNotes] = useState('');
  const styles = useMemo(() => createStyles(theme), [theme]);

  const fetchData = useCallback(async () => {
    if (!preschoolId) return;
    try {
      setLoading(true);
      const sb = assertSupabase();
      const [salRes, payRes] = await Promise.all([
        sb.from('teacher_salaries').select('*').eq('preschool_id', preschoolId),
        sb.from('teacher_payments').select('*').eq('preschool_id', preschoolId).order('payment_date', { ascending: false }).limit(100),
      ]);
      if (!salRes.error) {
        const map: Record<string, TeacherSalary> = {};
        (salRes.data || []).forEach((s: TeacherSalary) => { map[s.teacher_id] = s; });
        setSalaries(map);
      }
      if (!payRes.error) {
        const grouped: Record<string, TeacherPayment[]> = {};
        (payRes.data || []).forEach((p: TeacherPayment) => {
          if (!grouped[p.teacher_id]) grouped[p.teacher_id] = [];
          grouped[p.teacher_id].push(p);
        });
        setPayments(grouped);
      }
    } catch (err) {
      console.error('[PayrollView] fetch error:', err);
    } finally { setLoading(false); }
  }, [preschoolId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openSalaryEdit = (t: Teacher) => {
    const s = salaries[t.id];
    setEditTeacher(t);
    setEditBasic(s ? String(s.basic_salary) : '');
    setEditAllowances(s ? String(s.allowances) : '0');
    setEditDeductions(s ? String(s.deductions) : '0');
    setEditPayScale(s?.pay_scale || '');
    setShowSalaryModal(true);
  };

  const handleSaveSalary = useCallback(async () => {
    if (!editTeacher || !preschoolId || !userId) return;
    const basic = parseFloat(editBasic) || 0;
    const allow = parseFloat(editAllowances) || 0;
    const deduct = parseFloat(editDeductions) || 0;
    try {
      setSaving(true);
      const sb = assertSupabase();
      const existing = salaries[editTeacher.id];
      if (existing) {
        const { error } = await sb.from('teacher_salaries').update({ basic_salary: basic, allowances: allow, deductions: deduct, pay_scale: editPayScale || null, updated_by: userId }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('teacher_salaries').insert({ teacher_id: editTeacher.id, preschool_id: preschoolId, basic_salary: basic, allowances: allow, deductions: deduct, pay_scale: editPayScale || null, updated_by: userId });
        if (error) throw error;
      }
      setShowSalaryModal(false);
      await fetchData();
      showAlert({ title: 'Salary Updated', message: `Salary for ${editTeacher.firstName} ${editTeacher.lastName} saved.`, type: 'success' });
    } catch (err) {
      console.error('[PayrollView] salary save error:', err);
      showAlert({ title: 'Error', message: 'Failed to save salary.', type: 'error' });
    } finally { setSaving(false); }
  }, [editTeacher, preschoolId, userId, editBasic, editAllowances, editDeductions, editPayScale, salaries, fetchData, showAlert]);

  const openPayment = (t: Teacher) => {
    const s = salaries[t.id];
    setEditTeacher(t);
    setPayAmount(s ? String(s.net_salary) : '');
    setPayMethod('bank_transfer');
    setPayType('salary');
    setPayRef('');
    setPayNotes('');
    setShowPaymentModal(true);
  };

  const handleRecordPayment = useCallback(async () => {
    if (!editTeacher || !preschoolId || !userId) return;
    const amount = parseFloat(payAmount) || 0;
    if (amount <= 0) { showAlert({ title: 'Invalid', message: 'Enter a valid amount.', type: 'warning' }); return; }
    try {
      setSaving(true);
      const sb = assertSupabase();
      const typeLabel = payType === 'salary' ? 'salary' : payType;
      // 1. Log to financial_transactions
      const { data: ftx, error: ftxErr } = await sb.from('financial_transactions').insert({
        preschool_id: preschoolId,
        type: 'expense',
        amount,
        description: `Teacher ${typeLabel} - ${editTeacher.firstName} ${editTeacher.lastName}`,
        payment_method: payMethod,
        payment_reference: payRef || null,
        status: 'completed',
        created_by: userId,
        metadata: { teacher_id: editTeacher.id, category: `teacher_${typeLabel}`, payment_type: payType },
      }).select('id').single();
      if (ftxErr) throw ftxErr;
      // 2. Log to teacher_payments
      const { error: payErr } = await sb.from('teacher_payments').insert({
        teacher_id: editTeacher.id,
        preschool_id: preschoolId,
        amount,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: payMethod,
        payment_type: payType,
        recipient_role: 'teacher',
        reference_number: payRef || null,
        notes: payNotes || null,
        financial_tx_id: ftx?.id || null,
        recorded_by: userId,
      });
      if (payErr) throw payErr;
      setShowPaymentModal(false);
      await fetchData();
      showAlert({ title: 'Payment Recorded', message: `R${amount.toLocaleString()} paid to ${editTeacher.firstName} ${editTeacher.lastName}.`, type: 'success' });
    } catch (err) {
      console.error('[PayrollView] payment error:', err);
      showAlert({ title: 'Error', message: 'Failed to record payment.', type: 'error' });
    } finally { setSaving(false); }
  }, [editTeacher, preschoolId, userId, payAmount, payMethod, payType, payRef, payNotes, fetchData, showAlert]);

  const handleRecordPrincipalPayment = useCallback(async () => {
    if (!preschoolId || !userId) return;
    const amount = parseFloat(principalAmount) || 0;
    if (amount <= 0) { showAlert({ title: 'Invalid', message: 'Enter a valid amount.', type: 'warning' }); return; }
    try {
      setSaving(true);
      const sb = assertSupabase();
      const typeLabel = principalType === 'salary' ? 'salary' : principalType;
      const { data: ftx, error: ftxErr } = await sb.from('financial_transactions').insert({
        preschool_id: preschoolId,
        type: 'expense',
        amount,
        description: `Principal ${typeLabel} payment`,
        payment_method: principalMethod,
        payment_reference: principalRef || null,
        status: 'completed',
        created_by: userId,
        metadata: { category: `principal_${typeLabel}`, payment_type: principalType, recipient_role: 'principal' },
      }).select('id').single();
      if (ftxErr) throw ftxErr;
      // Also record in teacher_payments for unified tracking (teacher_id nullable for principal)
      await sb.from('teacher_payments').insert({
        teacher_id: null,
        preschool_id: preschoolId,
        amount,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: principalMethod,
        payment_type: principalType,
        recipient_role: 'principal',
        recipient_name: 'Principal',
        reference_number: principalRef || null,
        notes: principalNotes || null,
        financial_tx_id: ftx?.id || null,
        recorded_by: userId,
      });
      setShowPrincipalPayModal(false);
      await fetchData();
      showAlert({ title: 'Payment Recorded', message: `R${amount.toLocaleString()} principal ${typeLabel} recorded.`, type: 'success' });
    } catch (err) {
      console.error('[PayrollView] principal payment error:', err);
      showAlert({ title: 'Error', message: 'Failed to record payment.', type: 'error' });
    } finally { setSaving(false); }
  }, [preschoolId, userId, teachers, principalAmount, principalMethod, principalType, principalRef, principalNotes, fetchData, showAlert]);

  const totalMonthly = Object.values(salaries).reduce((s, sal) => s + Number(sal.net_salary), 0);

  const renderTeacher = ({ item: t }: { item: Teacher }) => {
    const sal = salaries[t.id];
    const tPay = payments[t.id] || [];
    const lastPay = tPay[0];
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}><Text style={styles.teacherName}>{t.firstName} {t.lastName}</Text><Text style={styles.teacherEmail}>{t.email}</Text></View>
          <TouchableOpacity style={styles.editBtn} onPress={() => openSalaryEdit(t)}><Ionicons name="create-outline" size={18} color="#4F46E5" /><Text style={styles.editBtnText}>Edit</Text></TouchableOpacity>
        </View>
        {sal ? (
          <View style={styles.salarySection}>
            {sal.pay_scale ? <Text style={styles.payScale}>{sal.pay_scale}</Text> : null}
            <View style={styles.salaryRow}><Text style={styles.salaryLabel}>Basic</Text><Text style={styles.salaryValue}>R{Number(sal.basic_salary).toLocaleString()}</Text></View>
            <View style={styles.salaryRow}><Text style={styles.salaryLabel}>Allowances</Text><Text style={[styles.salaryValue, { color: '#10B981' }]}>+R{Number(sal.allowances).toLocaleString()}</Text></View>
            <View style={styles.salaryRow}><Text style={styles.salaryLabel}>Deductions</Text><Text style={[styles.salaryValue, { color: '#EF4444' }]}>-R{Number(sal.deductions).toLocaleString()}</Text></View>
            <View style={[styles.salaryRow, styles.netRow]}><Text style={styles.netLabel}>Net Salary</Text><Text style={styles.netValue}>R{Number(sal.net_salary).toLocaleString()}</Text></View>
          </View>
        ) : (
          <View style={styles.noSalary}><Text style={styles.noSalaryText}>No salary configured — tap Edit to set up</Text></View>
        )}
        {lastPay ? (
          <View style={styles.lastPayment}><Ionicons name="checkmark-circle" size={14} color="#10B981" /><Text style={styles.lastPayText}>Last paid R{Number(lastPay.amount).toLocaleString()} on {new Date(lastPay.payment_date).toLocaleDateString()}</Text></View>
        ) : null}
        <TouchableOpacity style={styles.payBtn} onPress={() => openPayment(t)} disabled={!sal}>
          <Ionicons name="cash-outline" size={18} color="#fff" /><Text style={styles.payBtnText}>Record Payment</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View><Text style={styles.sectionTitle}>Payroll Management</Text><Text style={styles.sectionSubtitle}>{teachers.length} teachers</Text></View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.principalPayBtn} onPress={() => { setPrincipalAmount(''); setPrincipalMethod('bank_transfer'); setPrincipalType('salary'); setPrincipalRef(''); setPrincipalNotes(''); setShowPrincipalPayModal(true); }}>
            <Ionicons name="person-outline" size={16} color="#4F46E5" />
            <Text style={styles.principalPayBtnText}>Principal Pay</Text>
          </TouchableOpacity>
          <View style={styles.totalBadge}><Text style={styles.totalLabel}>Monthly Total</Text><Text style={styles.totalValue}>R{totalMonthly.toLocaleString()}</Text></View>
        </View>
      </View>
      <FlashList data={teachers} keyExtractor={(t) => t.id} renderItem={renderTeacher} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />} estimatedItemSize={100}
        ListEmptyComponent={<View style={styles.emptyContainer}><Ionicons name="card-outline" size={48} color={theme?.textSecondary || '#9ca3af'} /><Text style={styles.emptyTitle}>No Teachers</Text><Text style={styles.emptyText}>Add teachers to manage payroll.</Text></View>} />

      {/* Salary Edit Modal */}
      <Modal visible={showSalaryModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Edit Salary — {editTeacher?.firstName} {editTeacher?.lastName}</Text><TouchableOpacity onPress={() => setShowSalaryModal(false)}><Ionicons name="close" size={24} color={theme?.text || '#f1f5f9'} /></TouchableOpacity></View>
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>Basic Salary (R)</Text>
            <TextInput style={styles.input} value={editBasic} onChangeText={setEditBasic} keyboardType="numeric" placeholder="0" placeholderTextColor={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.inputLabel}>Allowances (R)</Text>
            <TextInput style={styles.input} value={editAllowances} onChangeText={setEditAllowances} keyboardType="numeric" placeholder="0" placeholderTextColor={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.inputLabel}>Deductions (R)</Text>
            <TextInput style={styles.input} value={editDeductions} onChangeText={setEditDeductions} keyboardType="numeric" placeholder="0" placeholderTextColor={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.inputLabel}>Pay Scale / Grade</Text>
            <TextInput style={styles.input} value={editPayScale} onChangeText={setEditPayScale} placeholder="e.g. Level 3" placeholderTextColor={theme?.textSecondary || '#6b7280'} />
            <View style={styles.netPreview}><Text style={styles.netPreviewLabel}>Net Salary</Text><Text style={styles.netPreviewValue}>R{((parseFloat(editBasic) || 0) + (parseFloat(editAllowances) || 0) - (parseFloat(editDeductions) || 0)).toLocaleString()}</Text></View>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSaveSalary} disabled={saving}><Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Salary'}</Text></TouchableOpacity>
          </ScrollView>
        </View></View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Record Payment — {editTeacher?.firstName} {editTeacher?.lastName}</Text><TouchableOpacity onPress={() => setShowPaymentModal(false)}><Ionicons name="close" size={24} color={theme?.text || '#f1f5f9'} /></TouchableOpacity></View>
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>Payment Type</Text>
            <View style={styles.methodRow}>
              {([['salary', 'Salary'], ['advance', 'Advance'], ['loan', 'Loan'], ['bonus', 'Bonus'], ['reimbursement', 'Reimburse'], ['other', 'Other']] as const).map(([key, label]) => (
                <TouchableOpacity key={key} style={[styles.methodChip, payType === key && styles.methodChipActive]} onPress={() => setPayType(key)}>
                  <Text style={[styles.methodChipText, payType === key && styles.methodChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Amount (R)</Text>
            <TextInput style={styles.input} value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.inputLabel}>Payment Method</Text>
            <View style={styles.methodRow}>
              {['bank_transfer', 'eft', 'cash', 'cheque'].map((m) => (
                <TouchableOpacity key={m} style={[styles.methodChip, payMethod === m && styles.methodChipActive]} onPress={() => setPayMethod(m)}>
                  <Text style={[styles.methodChipText, payMethod === m && styles.methodChipTextActive]}>{m.replace('_', ' ').toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Reference Number</Text>
            <TextInput style={styles.input} value={payRef} onChangeText={setPayRef} placeholder="Optional" placeholderTextColor={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} value={payNotes} onChangeText={setPayNotes} placeholder="Optional" placeholderTextColor={theme?.textSecondary || '#6b7280'} multiline />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#059669' }, saving && { opacity: 0.6 }]} onPress={handleRecordPayment} disabled={saving}><Text style={styles.saveBtnText}>{saving ? 'Recording...' : 'Record Payment'}</Text></TouchableOpacity>
          </ScrollView>
        </View></View>
      </Modal>

      {/* Principal Self-Payment Modal */}
      <Modal visible={showPrincipalPayModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Principal Payment</Text><TouchableOpacity onPress={() => setShowPrincipalPayModal(false)}><Ionicons name="close" size={24} color={theme?.text || '#f1f5f9'} /></TouchableOpacity></View>
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>Payment Type</Text>
            <View style={styles.methodRow}>
              {([['salary', 'Salary'], ['advance', 'Advance'], ['loan', 'Loan'], ['bonus', 'Bonus'], ['reimbursement', 'Reimburse'], ['other', 'Other']] as const).map(([key, label]) => (
                <TouchableOpacity key={key} style={[styles.methodChip, principalType === key && styles.methodChipActive]} onPress={() => setPrincipalType(key)}>
                  <Text style={[styles.methodChipText, principalType === key && styles.methodChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Amount (R)</Text>
            <TextInput style={styles.input} value={principalAmount} onChangeText={setPrincipalAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.inputLabel}>Payment Method</Text>
            <View style={styles.methodRow}>
              {['bank_transfer', 'eft', 'cash', 'cheque'].map((m) => (
                <TouchableOpacity key={m} style={[styles.methodChip, principalMethod === m && styles.methodChipActive]} onPress={() => setPrincipalMethod(m)}>
                  <Text style={[styles.methodChipText, principalMethod === m && styles.methodChipTextActive]}>{m.replace('_', ' ').toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Reference Number</Text>
            <TextInput style={styles.input} value={principalRef} onChangeText={setPrincipalRef} placeholder="Optional" placeholderTextColor={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} value={principalNotes} onChangeText={setPrincipalNotes} placeholder="Optional" placeholderTextColor={theme?.textSecondary || '#6b7280'} multiline />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#4F46E5' }, saving && { opacity: 0.6 }]} onPress={handleRecordPrincipalPayment} disabled={saving}><Text style={styles.saveBtnText}>{saving ? 'Recording...' : 'Record Principal Payment'}</Text></TouchableOpacity>
          </ScrollView>
        </View></View>
      </Modal>
    </View>
  );
}

const createStyles = (theme?: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 16 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: theme?.text || '#111827' },
    sectionSubtitle: { fontSize: 14, color: theme?.textSecondary || '#6b7280' },
    totalBadge: { alignItems: 'flex-end', backgroundColor: '#059669' + '15', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
    totalLabel: { fontSize: 10, color: theme?.textSecondary || '#6b7280', textTransform: 'uppercase', fontWeight: '600' },
    totalValue: { fontSize: 16, fontWeight: '800', color: '#059669' },
    listContent: { paddingBottom: 24 },
    card: { backgroundColor: theme?.cardBackground || '#1e293b', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: theme?.border || '#334155' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    teacherName: { fontSize: 16, fontWeight: '700', color: theme?.text || '#f1f5f9' },
    teacherEmail: { fontSize: 13, color: theme?.textSecondary || '#94a3b8', marginTop: 2 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#4F46E5' + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    editBtnText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
    salarySection: { backgroundColor: (theme?.surface || '#0f172a') + '60', borderRadius: 10, padding: 12, marginBottom: 10 },
    payScale: { fontSize: 12, fontWeight: '600', color: theme?.textSecondary || '#94a3b8', marginBottom: 8 },
    salaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    salaryLabel: { fontSize: 13, color: theme?.textSecondary || '#94a3b8' },
    salaryValue: { fontSize: 13, fontWeight: '600', color: theme?.text || '#e2e8f0' },
    netRow: { borderTopWidth: 1, borderTopColor: theme?.border || '#334155', paddingTop: 8, marginTop: 4 },
    netLabel: { fontSize: 14, fontWeight: '700', color: theme?.text || '#f1f5f9' },
    netValue: { fontSize: 14, fontWeight: '800', color: '#059669' },
    noSalary: { backgroundColor: (theme?.surface || '#0f172a') + '40', borderRadius: 10, padding: 16, marginBottom: 10, alignItems: 'center' },
    noSalaryText: { fontSize: 13, color: theme?.textSecondary || '#94a3b8', fontStyle: 'italic' },
    lastPayment: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    lastPayText: { fontSize: 12, color: theme?.textSecondary || '#94a3b8' },
    payBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', backgroundColor: '#059669', paddingVertical: 10, borderRadius: 10 },
    payBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: theme?.text || '#f1f5f9' },
    emptyText: { fontSize: 13, color: theme?.textSecondary || '#94a3b8', textAlign: 'center' },
    principalPayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#4F46E5' + '15', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    principalPayBtnText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: theme?.cardBackground || '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: theme?.border || '#334155' },
    modalTitle: { fontSize: 16, fontWeight: '700', color: theme?.text || '#f1f5f9', flex: 1 },
    modalBody: { padding: 20 },
    inputLabel: { fontSize: 13, fontWeight: '600', color: theme?.text || '#e2e8f0', marginBottom: 6, marginTop: 12 },
    input: { backgroundColor: theme?.inputBackground || '#0f172a', borderWidth: 1, borderColor: theme?.inputBorder || '#334155', borderRadius: 10, padding: 12, fontSize: 14, color: theme?.inputText || '#f1f5f9', minHeight: 44 },
    netPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#059669' + '15', padding: 14, borderRadius: 10, marginTop: 16 },
    netPreviewLabel: { fontSize: 14, fontWeight: '600', color: theme?.text || '#e2e8f0' },
    netPreviewValue: { fontSize: 18, fontWeight: '800', color: '#059669' },
    methodRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
    methodChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme?.border || '#334155', backgroundColor: theme?.surface || '#0f172a' },
    methodChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    methodChipText: { fontSize: 11, fontWeight: '600', color: theme?.textSecondary || '#94a3b8' },
    methodChipTextActive: { color: '#fff' },
    saveBtn: { backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20, marginBottom: 40 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });

export default PayrollView;
