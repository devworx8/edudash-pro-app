/**
 * EditTeacherModal Component
 *
 * Full-form modal for editing teacher HR details:
 * Personal info, employment, compensation, emergency contact, notes.
 * ≤400 lines (excl. imports/types). Styles in EditTeacherModal.styles.ts.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { Teacher, TeacherStatus, ContractType } from '@/types/teacher-management';
import { createStyles } from './EditTeacherModal.styles';

export interface TeacherUpdatePayload {
  [key: string]: string | number | null | undefined;
  employee_id?: string | null;
  phone?: string | null;
  address?: string | null;
  id_number?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  employment_status?: string;
  contract_type?: string;
  hire_date?: string | null;
  contract_end_date?: string | null;
  position_title?: string | null;
  department?: string | null;
  salary_basic?: number | null;
  salary_allowances?: number | null;
  salary_deductions?: number | null;
  pay_scale?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  notes?: string | null;
}

interface EditTeacherModalProps {
  visible: boolean;
  teacher: Teacher;
  onClose: () => void;
  onSave: (teacherId: string, payload: TeacherUpdatePayload) => Promise<void>;
}

const STATUS_OPTIONS: { value: TeacherStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
  { value: 'probation', label: 'Probation' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'terminated', label: 'Terminated' },
];

const CONTRACT_OPTIONS: { value: ContractType; label: string }[] = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'substitute', label: 'Substitute' },
  { value: 'probationary', label: 'Probationary' },
  { value: 'intern', label: 'Intern' },
  { value: 'volunteer', label: 'Volunteer' },
];

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

export function EditTeacherModal({ visible, teacher, onClose, onSave }: EditTeacherModalProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [saving, setSaving] = useState(false);

  // Form state — seeded from teacher prop
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState<TeacherStatus>('active');
  const [contractType, setContractType] = useState<ContractType>('permanent');
  const [hireDate, setHireDate] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [salaryBasic, setSalaryBasic] = useState('');
  const [salaryAllowances, setSalaryAllowances] = useState('');
  const [salaryDeductions, setSalaryDeductions] = useState('');
  const [payScale, setPayScale] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [notes, setNotes] = useState('');

  // Seed form when teacher changes or modal opens
  useEffect(() => {
    if (!visible) return;
    setPhone(teacher.phone || '');
    setAddress(teacher.address || '');
    setIdNumber(teacher.idNumber || '');
    setDateOfBirth(teacher.dateOfBirth || '');
    setGender(teacher.gender || '');
    setEmployeeId(teacher.employeeId || '');
    setStatus(teacher.status || 'active');
    setContractType(teacher.contractType || 'permanent');
    setHireDate(teacher.hireDate || '');
    setContractEndDate(teacher.contractEndDate || '');
    setPositionTitle(teacher.positionTitle || '');
    setDepartment(teacher.department || '');
    setSalaryBasic(teacher.salary?.basic ? String(teacher.salary.basic) : '');
    setSalaryAllowances(teacher.salary?.allowances ? String(teacher.salary.allowances) : '');
    setSalaryDeductions(teacher.salary?.deductions ? String(teacher.salary.deductions) : '');
    setPayScale(teacher.salary?.payScale || '');
    setEmergencyName(teacher.emergencyContact?.name || '');
    setEmergencyPhone(teacher.emergencyContact?.phone || '');
    setEmergencyRelationship(teacher.emergencyContact?.relationship || '');
    setNotes(teacher.notes || '');
  }, [visible, teacher]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload: TeacherUpdatePayload = {
        employee_id: employeeId.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        id_number: idNumber.trim() || null,
        date_of_birth: dateOfBirth.trim() || null,
        gender: gender.trim() || null,
        employment_status: status,
        contract_type: contractType,
        hire_date: hireDate.trim() || null,
        contract_end_date: contractEndDate.trim() || null,
        position_title: positionTitle.trim() || null,
        department: department.trim() || null,
        salary_basic: salaryBasic ? parseInt(salaryBasic, 10) || null : null,
        salary_allowances: salaryAllowances ? parseInt(salaryAllowances, 10) || null : null,
        salary_deductions: salaryDeductions ? parseInt(salaryDeductions, 10) || null : null,
        pay_scale: payScale.trim() || null,
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
        emergency_contact_relationship: emergencyRelationship.trim() || null,
        notes: notes.trim() || null,
      };
      await onSave(teacher.id, payload);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [
    teacher.id, employeeId, phone, address, idNumber, dateOfBirth, gender,
    status, contractType, hireDate, contractEndDate, positionTitle, department,
    salaryBasic, salaryAllowances, salaryDeductions, payScale,
    emergencyName, emergencyPhone, emergencyRelationship, notes, onSave, onClose,
  ]);

  const fullName = `${teacher.firstName} ${teacher.lastName}`.trim();

  const renderChips = <T extends string>(
    options: { value: T; label: string }[],
    selected: T,
    onSelect: (v: T) => void,
  ) => (
    <View style={styles.pickerRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.chip, selected === opt.value && styles.chipActive]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[styles.chipText, selected === opt.value && styles.chipTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="create" size={22} color={theme.primary} />
              <Text style={styles.headerTitle}>Edit {fullName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ────── Personal Information ────── */}
            <View style={[styles.sectionHeader, styles.sectionHeaderFirst]}>
              <Ionicons name="person" size={16} color={theme.textSecondary} />
              <Text style={styles.sectionLabel}>Personal Information</Text>
              <View style={styles.sectionDivider} />
            </View>

            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={teacher.firstName}
                  editable={false}
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={teacher.lastName}
                  editable={false}
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={teacher.email}
              editable={false}
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 0821234567"
              keyboardType="phone-pad"
              placeholderTextColor={theme.textSecondary}
            />

            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>Date of Birth</Text>
                <TextInput
                  style={styles.input}
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>ID Number</Text>
                <TextInput
                  style={styles.input}
                  value={idNumber}
                  onChangeText={setIdNumber}
                  placeholder="SA ID Number"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            <Text style={styles.label}>Gender</Text>
            <View style={styles.pickerRow}>
              {GENDER_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.chip, gender === g && styles.chipActive]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={address}
              onChangeText={setAddress}
              placeholder="Full address"
              multiline
              placeholderTextColor={theme.textSecondary}
            />

            {/* ────── Employment Details ────── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="briefcase" size={16} color={theme.textSecondary} />
              <Text style={styles.sectionLabel}>Employment</Text>
              <View style={styles.sectionDivider} />
            </View>

            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>Employee ID</Text>
                <TextInput
                  style={styles.input}
                  value={employeeId}
                  onChangeText={setEmployeeId}
                  placeholder="EMP001"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Position Title</Text>
                <TextInput
                  style={styles.input}
                  value={positionTitle}
                  onChangeText={setPositionTitle}
                  placeholder="e.g. Grade 4 Teacher"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            <Text style={styles.label}>Department</Text>
            <TextInput
              style={styles.input}
              value={department}
              onChangeText={setDepartment}
              placeholder="e.g. Foundation Phase"
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={styles.label}>Status</Text>
            {renderChips(STATUS_OPTIONS, status, (v) => setStatus(v))}

            <Text style={styles.label}>Contract Type</Text>
            {renderChips(CONTRACT_OPTIONS, contractType, (v) => setContractType(v))}

            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>Hire Date</Text>
                <TextInput
                  style={styles.input}
                  value={hireDate}
                  onChangeText={setHireDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Contract End Date</Text>
                <TextInput
                  style={styles.input}
                  value={contractEndDate}
                  onChangeText={setContractEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            {/* ────── Compensation ────── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="card" size={16} color={theme.textSecondary} />
              <Text style={styles.sectionLabel}>Compensation</Text>
              <View style={styles.sectionDivider} />
            </View>

            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>Basic Salary (R)</Text>
                <TextInput
                  style={styles.input}
                  value={salaryBasic}
                  onChangeText={setSalaryBasic}
                  placeholder="25000"
                  keyboardType="numeric"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Pay Scale</Text>
                <TextInput
                  style={styles.input}
                  value={payScale}
                  onChangeText={setPayScale}
                  placeholder="e.g. Level 3"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>Allowances (R)</Text>
                <TextInput
                  style={styles.input}
                  value={salaryAllowances}
                  onChangeText={setSalaryAllowances}
                  placeholder="0"
                  keyboardType="numeric"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Deductions (R)</Text>
                <TextInput
                  style={styles.input}
                  value={salaryDeductions}
                  onChangeText={setSalaryDeductions}
                  placeholder="0"
                  keyboardType="numeric"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            {/* ────── Emergency Contact ────── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="medkit" size={16} color={theme.textSecondary} />
              <Text style={styles.sectionLabel}>Emergency Contact</Text>
              <View style={styles.sectionDivider} />
            </View>

            <Text style={styles.label}>Contact Name</Text>
            <TextInput
              style={styles.input}
              value={emergencyName}
              onChangeText={setEmergencyName}
              placeholder="Full name"
              placeholderTextColor={theme.textSecondary}
            />

            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>Contact Phone</Text>
                <TextInput
                  style={styles.input}
                  value={emergencyPhone}
                  onChangeText={setEmergencyPhone}
                  placeholder="0821234567"
                  keyboardType="phone-pad"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Relationship</Text>
                <TextInput
                  style={styles.input}
                  value={emergencyRelationship}
                  onChangeText={setEmergencyRelationship}
                  placeholder="e.g. Spouse"
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            </View>

            {/* ────── Admin Notes ────── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text" size={16} color={theme.textSecondary} />
              <Text style={styles.sectionLabel}>Admin Notes</Text>
              <View style={styles.sectionDivider} />
            </View>

            <TextInput
              style={[styles.input, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Internal notes about this teacher..."
              multiline
              placeholderTextColor={theme.textSecondary}
            />
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, saving && styles.submitDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              )}
              <Text style={styles.submitText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
