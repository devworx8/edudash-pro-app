import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { derivePreschoolId } from '@/lib/roleUtils';
import { assertSupabase } from '@/lib/supabase';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { logger } from '@/lib/logger';
import {
  SIZE_OPTIONS, isUniformPaymentRecord,
  deriveUniformData, exportUniformPdf, useUniformMessaging,
  hasAssignedBackNumber, needsGeneratedBackNumber, normalizeBackNumber, parseBackNumber,
} from '@/hooks/principal-uniforms';
import type { UniformRow, StudentRow, DisplayRow, ParentProfile } from '@/hooks/principal-uniforms';

const isUniformAssignmentsTableMissing = (error: any): boolean => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01'
    || (message.includes('uniform_number_assignments') && message.includes('does not exist'));
};

const isUniformDeletePolicyMissing = (error: any): boolean => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42501' || message.includes('row-level security') || message.includes('permission denied');
};

const isUniqueConflictError = (error: any): boolean => {
  const code = String(error?.code || '');
  const status = String(error?.status || '');
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return code === '23505'
    || code === '409'
    || status === '409'
    || message.includes('duplicate key')
    || message.includes('unique constraint')
    || details.includes('already exists');
};

export default function PrincipalUniformsScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();
  const params = useLocalSearchParams<{ autoAction?: string | string[] }>();
  const autoAction = Array.isArray(params.autoAction) ? params.autoAction[0] : params.autoAction;
  const handledAutoActionRef = useRef<string | null>(null);

  const schoolId = derivePreschoolId(profile);

  const [rows, setRows] = useState<UniformRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'missing'>('all');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatingNumbers, setGeneratingNumbers] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [paymentStatusByStudent, setPaymentStatusByStudent] = useState<Map<string, 'paid' | 'pending' | 'unpaid'>>(
    () => new Map()
  );
  const [assignedBackNumberByStudent, setAssignedBackNumberByStudent] = useState<Map<string, string>>(
    () => new Map()
  );
  const [parentProfilesById, setParentProfilesById] = useState<Record<string, ParentProfile>>({});
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [editingNumberStudentId, setEditingNumberStudentId] = useState<string | null>(null);
  const [manualNumberInput, setManualNumberInput] = useState('');
  const [savingManualNumberStudentId, setSavingManualNumberStudentId] = useState<string | null>(null);

  const {
    bulkMessaging,
    singleMessagingTargetId,
    bulkMessageUnpaid,
    bulkMessageNoOrder,
    bulkMessageConfirmNumbers,
    messageSingleParent,
  } = useUniformMessaging({
    userId: user?.id,
    schoolId,
    profile,
    showAlert,
  });

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const supabase = assertSupabase();
      const [{ data, error }, { data: studentData, error: studentError }] = await Promise.all([
        supabase
          .from('uniform_requests')
          .select('id, child_name, age_years, tshirt_size, tshirt_quantity, shorts_quantity, tshirt_number, is_returning, sample_supplied, created_at, updated_at, student_id, parent_id, student:students!uniform_requests_student_id_fkey(first_name,last_name,student_id), parent:profiles!uniform_requests_parent_id_fkey(id, first_name,last_name,email,phone)')
          .eq('preschool_id', schoolId)
          .order('created_at', { ascending: false }),
        supabase
          .from('students')
          .select('id, first_name, last_name, student_id, class_id, parent_id, guardian_id, classroom:classes(id,name), parent:profiles!students_parent_id_fkey(id, first_name,last_name,email,phone), guardian:profiles!students_guardian_id_fkey(id, first_name,last_name,email,phone)')
          .or(`preschool_id.eq.${schoolId},organization_id.eq.${schoolId}`)
          .eq('is_active', true)
          .order('first_name'),
      ]);
      if (error) throw error;
      if (studentError) throw studentError;
      const uniformRows = ((data as any) || []) as UniformRow[];
      const studentRows = ((studentData as any) || []) as StudentRow[];
      setRows(uniformRows);
      setStudents(studentRows);

      const candidateParentIds = Array.from(new Set([
        ...uniformRows.map((row) => row.parent?.id || row.parent_id || '').filter(Boolean),
        ...studentRows.map((student) => student.parent?.id || student.parent_id || '').filter(Boolean),
        ...studentRows.map((student) => student.guardian?.id || student.guardian_id || '').filter(Boolean),
      ]));

      if (candidateParentIds.length > 0) {
        const { data: parentProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, phone')
          .in('id', candidateParentIds);
        const parentMap: Record<string, ParentProfile> = {};
        (parentProfiles || []).forEach((profileRow: any) => {
          if (!profileRow?.id) return;
          parentMap[profileRow.id] = profileRow as ParentProfile;
        });
        setParentProfilesById(parentMap);
      } else {
        setParentProfilesById({});
      }

      try {
        const { data: assignmentRows, error: assignmentError } = await supabase
          .from('uniform_number_assignments')
          .select('student_id, tshirt_number')
          .eq('preschool_id', schoolId);
        if (assignmentError) throw assignmentError;
        const nextAssignments = new Map<string, string>();
        (assignmentRows || []).forEach((row: any) => {
          if (!row?.student_id || !hasAssignedBackNumber(row?.tshirt_number)) return;
          nextAssignments.set(row.student_id, String(row.tshirt_number).trim());
        });
        setAssignedBackNumberByStudent(nextAssignments);
      } catch (assignmentError: any) {
        if (isUniformAssignmentsTableMissing(assignmentError)) {
          // Keep backward compatibility while migration is pending.
          setAssignedBackNumberByStudent(new Map());
        } else {
          throw assignmentError;
        }
      }

      const studentIds = (studentRows as any[] | null)?.map((s: any) => s.id).filter(Boolean) || [];
      if (studentIds.length) {
        const [{ data: popData }, { data: paymentsData }] = await Promise.all([
          supabase.from('pop_uploads')
            .select('student_id, status, description, title')
            .eq('preschool_id', schoolId).eq('upload_type', 'proof_of_payment').in('student_id', studentIds),
          supabase.from('payments')
            .select('student_id, status, description, metadata')
            .eq('preschool_id', schoolId).in('student_id', studentIds),
        ]);

        const nextMap = new Map<string, 'paid' | 'pending' | 'unpaid'>();
        studentIds.forEach((id: string) => nextMap.set(id, 'unpaid'));

        const { isUniformLabel } = await import('@/lib/utils/feeUtils');
        (popData || [])
          .filter((pop: any) => isUniformLabel(pop?.description) || isUniformLabel(pop?.title))
          .forEach((pop: any) => {
            const current = nextMap.get(pop.student_id) || 'unpaid';
            if (pop.status === 'approved') { nextMap.set(pop.student_id, 'paid'); return; }
            if (current !== 'paid' && ['pending', 'submitted'].includes(String(pop.status))) {
              nextMap.set(pop.student_id, 'pending');
            }
          });

        (paymentsData || []).filter(isUniformPaymentRecord).forEach((payment: any) => {
          if (!payment.student_id) return;
          if (['completed', 'approved'].includes(String(payment.status))) {
            nextMap.set(payment.student_id, 'paid');
          }
        });

        setPaymentStatusByStudent(nextMap);
      } else {
        setPaymentStatusByStudent(new Map());
      }
    } catch (e: any) {
      logger.error('PrincipalUniforms', 'Load uniform sizes failed', e);
      showAlert({ title: 'Error', message: e?.message || 'Failed to load uniform sizes', buttons: [{ text: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }, [schoolId, showAlert]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const derived = useMemo(
    () => deriveUniformData(rows, students, paymentStatusByStudent, assignedBackNumberByStudent, parentProfilesById),
    [rows, students, paymentStatusByStudent, assignedBackNumberByStudent, parentProfilesById]
  );

  const { submittedRows, missingRows, submittedCount, missingCount,
    missingContactableCount, unpaidContactableCount, sizeSummary, missingByClass } = derived;
  const submittedMissingNumberCount = useMemo(
    () => submittedRows.filter((row) => needsGeneratedBackNumber(row.tshirtNumber)).length,
    [submittedRows]
  );
  const missingSubmissionWithoutNumberCount = useMemo(
    () => missingRows.filter((row) => needsGeneratedBackNumber(row.tshirtNumber)).length,
    [missingRows]
  );
  const learnersWithoutNumberCount = submittedMissingNumberCount + missingSubmissionWithoutNumberCount;

  const displayRows: DisplayRow[] = useMemo(() => (
    statusFilter === 'submitted' ? submittedRows
      : statusFilter === 'missing' ? missingRows
        : [...submittedRows, ...missingRows]
  ), [missingRows, submittedRows, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return displayRows.filter((row) => {
      const searchableFields = [
        row.childName,
        row.studentCode,
        row.parentName,
        row.parentEmail,
        row.parentPhone,
        row.className,
        hasAssignedBackNumber(row.tshirtNumber) ? normalizeBackNumber(row.tshirtNumber) : '',
        row.paymentStatus,
      ].map((field) => String(field ?? '').toLowerCase());
      const matchesSearch = !q || searchableFields.some((field) => field.includes(q));
      const matchesSize = sizeFilter === 'all' || row.tshirtSize === sizeFilter || row.status === 'missing';
      return matchesSearch && matchesSize;
    });
  }, [displayRows, search, sizeFilter]);
  const safeFiltered = useMemo(() => (Array.isArray(filtered) ? filtered : []), [filtered]);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      await exportUniformPdf({ filtered, sizeSummary, missingByClass, showAlert });
    } catch (e: any) {
      showAlert({ title: 'Export Error', message: e?.message || 'Failed to export PDF', buttons: [{ text: 'OK' }] });
    } finally {
      setExporting(false);
    }
  }, [filtered, sizeSummary, missingByClass, showAlert]);

  const handleGenerateNumbers = useCallback(async () => {
    if (!schoolId) return;
    const supabase = assertSupabase();
    const { data: latestAssignments, error: latestAssignmentsError } = await supabase
      .from('uniform_number_assignments')
      .select('student_id, tshirt_number')
      .eq('preschool_id', schoolId);
    if (latestAssignmentsError) {
      logger.warn('[Uniforms] Failed to load latest number assignments, using local state', {
        error: latestAssignmentsError.message,
      });
    }
    const latestAssignedByStudent = new Map<string, string>(
      (latestAssignments || []).map((assignment: any) => [
        assignment.student_id,
        String(assignment.tshirt_number || ''),
      ])
    );
    const getCurrentAssignedNumber = (studentId: string): string => (
      latestAssignedByStudent.get(studentId)
      || assignedBackNumberByStudent.get(studentId)
      || ''
    );

    const studentsSorted = [...students].sort((a, b) => {
      const aName = `${a?.first_name || ''} ${a?.last_name || ''}`.trim().toLowerCase();
      const bName = `${b?.first_name || ''} ${b?.last_name || ''}`.trim().toLowerCase();
      return aName.localeCompare(bName);
    });
    const rowByStudentId = new Map(rows.map((row) => [row.student_id, row] as const));

    const seenNumbers = new Map<number, string>();
    const duplicateStudentIds = new Set<string>();
    const stableAssignedByStudent = new Map<string, string>();
    studentsSorted.forEach((student) => {
      const parsed = parseBackNumber(getCurrentAssignedNumber(student.id));
      if (parsed === null) return;
      if (seenNumbers.has(parsed)) {
        duplicateStudentIds.add(student.id);
        return;
      }
      seenNumbers.set(parsed, student.id);
      stableAssignedByStudent.set(student.id, String(parsed));
    });

    const studentsNeedingAssignment = studentsSorted.filter((student) => (
      !hasAssignedBackNumber(getCurrentAssignedNumber(student.id)) || duplicateStudentIds.has(student.id)
    ));

    if (studentsNeedingAssignment.length === 0) {
      showAlert({
        title: 'No Missing Numbers',
        message: 'All active learners already have valid unique T-shirt numbers.',
        type: 'info',
        buttons: [{ text: 'OK' }],
      });
      return;
    }

    const usedNumbers = new Set<number>();
    stableAssignedByStudent.forEach((value) => {
      const parsed = parseBackNumber(value);
      if (parsed === null) return;
      usedNumbers.add(parsed);
    });

    const availableNumbers: number[] = [];
    for (let i = 1; i <= 99; i += 1) {
      if (!usedNumbers.has(i)) availableNumbers.push(i);
    }

    if (availableNumbers.length === 0) {
      showAlert({
        title: 'Number Pool Full',
        message: 'All 1–2 digit numbers (1-99) are already used.',
        type: 'warning',
        buttons: [{ text: 'OK' }],
      });
      return;
    }

    const assignments: Array<{ studentId: string; parentId: string | null; number: string }> = [];
    studentsNeedingAssignment.forEach((student) => {
      const row = rowByStudentId.get(student.id);
      const rowNumber = parseBackNumber(row?.tshirt_number);
      const currentAssignedNumber = parseBackNumber(getCurrentAssignedNumber(student.id));
      let assignedNumber: number | null = null;

      if (currentAssignedNumber !== null && !usedNumbers.has(currentAssignedNumber)) {
        assignedNumber = currentAssignedNumber;
      } else if (rowNumber !== null && !usedNumbers.has(rowNumber)) {
        assignedNumber = rowNumber;
      } else {
        assignedNumber = availableNumbers.shift() ?? null;
      }

      if (assignedNumber === null) return;
      usedNumbers.add(assignedNumber);

      assignments.push({
        studentId: student.id,
        parentId: row?.parent_id
          || student.parent?.id
          || student.parent_id
          || student.guardian?.id
          || student.guardian_id
          || null,
        number: String(assignedNumber),
      });
    });
    const skippedCount = Math.max(studentsNeedingAssignment.length - assignments.length, 0);

    setGeneratingNumbers(true);
    try {
      const nowIso = new Date().toISOString();
      const takenNumbers = new Set<number>();
      stableAssignedByStudent.forEach((value) => {
        const parsed = parseBackNumber(value);
        if (parsed !== null) takenNumbers.add(parsed);
      });
      const getNextAvailableNumber = (): number | null => {
        for (let i = 1; i <= 99; i += 1) {
          if (!takenNumbers.has(i)) return i;
        }
        return null;
      };

      const successAssignments: Array<{ studentId: string; parentId: string | null; number: string }> = [];
      let failedCount = 0;
      let firstFailureMessage: string | null = null;

      for (const assignment of assignments) {
        let candidate = parseBackNumber(assignment.number);
        let assigned = false;
        let attempts = 0;
        let lastError: any = null;

        while (candidate !== null && attempts < 99) {
          attempts += 1;
          const payloadNumber = String(candidate);
          const { error } = await supabase
            .from('uniform_number_assignments')
            .upsert({
              student_id: assignment.studentId,
              parent_id: assignment.parentId,
              preschool_id: schoolId,
              tshirt_number: payloadNumber,
              assigned_by: profile?.id || null,
            }, { onConflict: 'student_id' });

          if (!error) {
            takenNumbers.add(candidate);
            successAssignments.push({ ...assignment, number: payloadNumber });
            assigned = true;
            break;
          }

          lastError = error;
          if (isUniqueConflictError(error)) {
            // Reserve conflicting number locally so we do not retry it again.
            takenNumbers.add(candidate);
            const replacement = getNextAvailableNumber();
            candidate = replacement;
            continue;
          }
          break;
        }

        if (!assigned) {
          failedCount += 1;
          if (!firstFailureMessage) {
            firstFailureMessage = String(lastError?.message || 'Unknown assignment error.');
          }
        }
      }

      const successCount = successAssignments.length;

      if (successCount > 0) {
        const successAssignmentMap = new Map(
          successAssignments.map((assignment) => [assignment.studentId, assignment.number] as const)
        );

        const updatesForSubmittedRows = rows
          .filter((row) => successAssignmentMap.has(row.student_id))
          .filter((row) => normalizeBackNumber(row.tshirt_number) !== successAssignmentMap.get(row.student_id));

        if (updatesForSubmittedRows.length > 0) {
          await Promise.allSettled(
            updatesForSubmittedRows.map(async (row) => {
              const { error } = await supabase
                .from('uniform_requests')
                .update({
                  tshirt_number: successAssignmentMap.get(row.student_id) || row.tshirt_number,
                  updated_at: nowIso,
                })
                .eq('id', row.id)
                .eq('preschool_id', schoolId);
              if (error) throw error;
            })
          );
        }

        // Keep UI/export in sync immediately, then rehydrate from DB.
        setAssignedBackNumberByStudent((prev) => {
          const next = new Map(prev);
          successAssignments.forEach((assignment) => next.set(assignment.studentId, assignment.number));
          return next;
        });
        setRows((prev) => prev.map((row) => (
          successAssignmentMap.has(row.student_id)
            ? {
              ...row,
              tshirt_number: successAssignmentMap.get(row.student_id) || row.tshirt_number,
              updated_at: nowIso,
            }
            : row
        )));

        // Notify parents to confirm newly assigned numbers
        const confirmTargets = submittedRows
          .filter((row) => successAssignmentMap.has(row.studentId))
          .map((row) => ({
            ...row,
            tshirtNumber: successAssignmentMap.get(row.studentId) || row.tshirtNumber,
          }));
        if (confirmTargets.length > 0) {
          await bulkMessageConfirmNumbers(confirmTargets);
        }
      }

      await load();

      if (successCount <= 0) {
        throw new Error('No numbers were assigned. Please try again.');
      }

      const notes: string[] = [`Assigned ${successCount} unique number(s).`];
      if (duplicateStudentIds.size > 0) {
        notes.push(`Resolved ${duplicateStudentIds.size} duplicate assignment(s).`);
      }
      if (skippedCount > 0) {
        notes.push(`${skippedCount} learner(s) were skipped because only 99 unique 1–2 digit numbers are available.`);
      }
      if (failedCount > 0) {
        notes.push(`${failedCount} update(s) failed. ${firstFailureMessage ? 'Example: ' + firstFailureMessage : 'Please retry.'}`);
      }

      showAlert({
        title: 'Numbers Generated',
        message: notes.join(' '),
        type: failedCount > 0 ? 'warning' : 'success',
        buttons: [{ text: 'OK' }],
      });
    } catch (e: any) {
      showAlert({
        title: 'Generation Failed',
        message: e?.message || 'Unable to generate numbers right now.',
        type: 'error',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setGeneratingNumbers(false);
    }
  }, [
    schoolId,
    rows,
    students,
    assignedBackNumberByStudent,
    load,
    showAlert,
    submittedRows,
    bulkMessageConfirmNumbers,
    profile?.id,
  ]);

  const handleGenerateNumbersPress = useCallback(() => {
    if (!schoolId) return;
    if (learnersWithoutNumberCount === 0 || generatingNumbers) {
      handleGenerateNumbers();
      return;
    }

    showAlert({
      title: 'Generate T-shirt Numbers',
      message: `Assign unique 1–2 digit numbers (1-99) to ${learnersWithoutNumberCount} learner(s) missing valid numbers?`,
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', onPress: handleGenerateNumbers },
      ],
    });
  }, [schoolId, learnersWithoutNumberCount, generatingNumbers, handleGenerateNumbers, showAlert]);

  const paymentStatusMeta = useCallback((status: DisplayRow['paymentStatus']) => {
    if (status === 'paid') return { label: 'Paid', bg: theme.success + '22', border: theme.success + '55', text: theme.success };
    if (status === 'pending') return { label: 'Pending', bg: theme.warning + '22', border: theme.warning + '55', text: theme.warning };
    return { label: 'Unpaid', bg: theme.error + '22', border: theme.error + '55', text: theme.error };
  }, [theme]);

  useEffect(() => {
    if (!autoAction || loading || !schoolId) return;
    if (handledAutoActionRef.current === autoAction) return;
    handledAutoActionRef.current = autoAction;
    if (autoAction === 'unpaid') {
      bulkMessageUnpaid(submittedRows).catch(() => {});
      return;
    }
    if (autoAction === 'no_order' || autoAction === 'missing') {
      bulkMessageNoOrder(missingRows).catch(() => {});
    }
  }, [autoAction, bulkMessageNoOrder, bulkMessageUnpaid, loading, missingRows, schoolId, submittedRows]);

  const handleSaveManualNumber = useCallback(async (item: DisplayRow) => {
    if (!schoolId) return;
    const parsed = parseBackNumber(manualNumberInput);
    if (parsed === null) {
      showAlert({
        title: 'Invalid Number',
        message: 'Enter a unique 1–2 digit number between 1 and 99.',
        type: 'warning',
        buttons: [{ text: 'OK' }],
      });
      return;
    }

    const normalized = String(parsed);
    const duplicateOwner = Array.from(assignedBackNumberByStudent.entries()).find(
      ([studentId, value]) => studentId !== item.studentId && normalizeBackNumber(value) === normalized
    );

    try {
      setSavingManualNumberStudentId(item.studentId);
      const supabase = assertSupabase();
      const { error: assignmentError } = await supabase
        .from('uniform_number_assignments')
        .upsert({
          student_id: item.studentId,
          parent_id: item.parentId || null,
          preschool_id: schoolId,
          tshirt_number: normalized,
          assigned_by: profile?.id || null,
        }, { onConflict: 'student_id' });
      if (assignmentError) throw assignmentError;

      if (item.status === 'submitted' && !String(item.id).startsWith('missing-')) {
        const { error: requestError } = await supabase
          .from('uniform_requests')
          .update({
            tshirt_number: normalized,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
          .eq('preschool_id', schoolId);
        if (requestError) throw requestError;
      }

      setAssignedBackNumberByStudent((prev) => {
        const next = new Map(prev);
        next.set(item.studentId, normalized);
        return next;
      });
      setRows((prev) => prev.map((row) => (
        row.student_id === item.studentId
          ? { ...row, tshirt_number: normalized, updated_at: new Date().toISOString() }
          : row
      )));
      setEditingNumberStudentId(null);
      setManualNumberInput('');
      await load();

      showAlert({
        title: 'Number Saved',
        message: duplicateOwner
          ? 'Number saved. A duplicate now exists on another learner. Tap Generate Numbers to resolve duplicates automatically.'
          : 'T-shirt number saved successfully.',
        type: duplicateOwner ? 'warning' : 'success',
        buttons: [{ text: 'OK' }],
      });
    } catch (e: any) {
      showAlert({
        title: 'Save Failed',
        message: e?.message || 'Unable to save the number right now.',
        type: 'error',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setSavingManualNumberStudentId(null);
    }
  }, [
    schoolId,
    manualNumberInput,
    assignedBackNumberByStudent,
    profile?.id,
    load,
    showAlert,
  ]);

  const renderDetail = useCallback((
    label: string,
    value: string | number | null | undefined,
    tone: 'default' | 'muted' = 'default',
  ) => (
    <Text style={tone === 'muted' ? styles.detailMuted : styles.detailText}>
      <Text style={styles.detailLabel}>{label}: </Text>
      <Text style={styles.detailValue}>{value ?? '-'}</Text>
    </Text>
  ), [styles]);

  const renderUniformCard = useCallback((item: DisplayRow) => (
    <View style={[styles.card, item.status === 'missing' && styles.missingCard]}>
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{item.childName}</Text>
        {item.status === 'submitted' && (
          <View style={[styles.paymentChip, {
            backgroundColor: paymentStatusMeta(item.paymentStatus).bg,
            borderColor: paymentStatusMeta(item.paymentStatus).border,
          }]}>
            <Text style={[styles.paymentChipText, { color: paymentStatusMeta(item.paymentStatus).text }]}>
              {paymentStatusMeta(item.paymentStatus).label}
            </Text>
          </View>
        )}
      </View>
      {item.status === 'missing' ? (
        <>
          <Text style={styles.muted}>No size submitted yet.</Text>
          {item.parentName || item.parentEmail || item.parentPhone ? (
            <>
              {item.parentName ? renderDetail('Parent', item.parentName) : null}
              {item.parentEmail ? renderDetail('Email', item.parentEmail) : null}
              {item.parentPhone ? renderDetail('Phone', item.parentPhone) : null}
            </>
          ) : (
            <Text style={styles.muted}>Parent not linked.</Text>
          )}
          {item.parentId ? (
            <TouchableOpacity
              style={[styles.inlineActionButton, { borderColor: theme.primary + '66', backgroundColor: theme.primary + '18' }]}
              onPress={() => messageSingleParent(item)}
              disabled={bulkMessaging !== null || singleMessagingTargetId === item.id}
            >
              <Ionicons name="person-add-outline" size={14} color={theme.primary} />
              <Text style={[styles.inlineActionButtonText, { color: theme.primary }]}>
                {singleMessagingTargetId === item.id ? 'Assigning...' : 'Assign to Parent'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : (
        <>
          {renderDetail('Age', item.ageYears ?? '-')}
          {renderDetail('Size', item.tshirtSize)}
          {renderDetail('T-shirts', item.tshirtQuantity ?? '-')}
          {renderDetail('Shorts', item.shortsQuantity ?? '-')}
          {renderDetail('Returning', item.isReturning ? 'Yes' : 'No')}
          {hasAssignedBackNumber(item.tshirtNumber)
            ? renderDetail('T-shirt Number', String(item.tshirtNumber).trim())
            : <Text style={styles.muted}>T-shirt Number: not assigned</Text>}
          {renderDetail('Sample supplied', item.sampleSupplied ? 'Yes' : 'No')}
          {item.studentCode ? renderDetail('Student Code', item.studentCode) : null}
          {renderDetail('Submitted by', item.parentName || 'Parent')}
          {item.parentEmail ? renderDetail('Email', item.parentEmail) : null}
          {renderDetail(
            'Last updated',
            item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-ZA') : item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-ZA') : '-',
            'muted',
          )}
          {item.parentId ? (
            <TouchableOpacity
              style={[styles.inlineActionButton, { borderColor: theme.primary + '66', backgroundColor: theme.primary + '18' }]}
              onPress={() => messageSingleParent(item)}
              disabled={bulkMessaging !== null || singleMessagingTargetId === item.id}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.primary} />
              <Text style={[styles.inlineActionButtonText, { color: theme.primary }]}>
                {singleMessagingTargetId === item.id ? 'Sending...' : 'Message Parent'}
              </Text>
            </TouchableOpacity>
          ) : null}
          {item.paymentStatus !== 'paid' && schoolId && (
            <TouchableOpacity
              style={[
                styles.inlineActionButton,
                { borderColor: theme.success + '66', backgroundColor: theme.success + '18', marginTop: 8 },
              ]}
              onPress={() => {
                if (markingPaidId) return;
                showAlert({
                  title: 'Mark Uniform Paid',
                  message:
                    `Mark ${item.childName}'s uniform as paid? This will add a uniform payment record and update dashboards.`,
                  type: 'info',
                  buttons: [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Mark Paid',
                      onPress: async () => {
                        try {
                          setMarkingPaidId(item.id);
                          const supabase = assertSupabase();
                          const { error } = await supabase
                            .from('payments')
                            .insert({
                              student_id: item.studentId,
                              preschool_id: schoolId,
                              amount: 0,
                              amount_cents: 0,
                              currency: 'ZAR',
                              status: 'completed',
                              description: `Uniform payment marked paid by school for ${item.childName}`,
                              metadata: {
                                payment_context: 'uniform',
                                fee_type: 'uniform',
                              },
                            })
                            .select('id')
                            .single();
                          if (error) {
                            throw error;
                          }
                          await load();
                        } catch (e: any) {
                          showAlert({
                            title: 'Payment Update Failed',
                            message: e?.message || 'Unable to mark uniform as paid right now.',
                            type: 'error',
                            buttons: [{ text: 'OK' }],
                          });
                        } finally {
                          setMarkingPaidId(null);
                        }
                      },
                    },
                  ],
                });
              }}
              disabled={markingPaidId === item.id || bulkMessaging !== null}
            >
              <Ionicons name="checkmark-done-outline" size={14} color={theme.success} />
              <Text style={[styles.inlineActionButtonText, { color: theme.success }]}>
                {markingPaidId === item.id ? 'Marking Paid...' : 'Mark Paid'}
              </Text>
            </TouchableOpacity>
          )}
          {item.status === 'submitted' && schoolId ? (
            <TouchableOpacity
              style={[
                styles.deleteActionButton,
                { borderColor: theme.error + '66', backgroundColor: theme.error + '18' },
              ]}
              onPress={() => {
                if (deletingRecordId) return;
                showAlert({
                  title: 'Delete Uniform Submission',
                  message: `Delete ${item.childName}'s uniform submission? This removes their submitted sizes from this list.`,
                  type: 'warning',
                  buttons: [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          setDeletingRecordId(item.id);
                          const supabase = assertSupabase();
                          const { error } = await supabase
                            .from('uniform_requests')
                            .delete()
                            .eq('id', item.id)
                            .eq('preschool_id', schoolId);
                          if (error) {
                            throw error;
                          }
                          await load();
                        } catch (e: any) {
                          const migrationHint = isUniformDeletePolicyMissing(e)
                            ? ' Delete policy is missing. Run migration 20260324003000_uniform_requests_delete_policy.sql.'
                            : '';
                          showAlert({
                            title: 'Delete Failed',
                            message: (e?.message || 'Unable to delete this uniform submission right now.') + migrationHint,
                            type: 'error',
                            buttons: [{ text: 'OK' }],
                          });
                        } finally {
                          setDeletingRecordId(null);
                        }
                      },
                    },
                  ],
                });
              }}
              disabled={deletingRecordId === item.id || bulkMessaging !== null}
            >
              <Ionicons name="trash-outline" size={14} color={theme.error} />
              <Text style={[styles.deleteActionText, { color: theme.error }]}>
                {deletingRecordId === item.id ? 'Deleting...' : 'Delete Record'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
      {schoolId ? (
        <View style={styles.manualNumberSection}>
          <Text style={styles.manualNumberLabel}>Back Number</Text>
          {editingNumberStudentId === item.studentId ? (
            <View style={styles.manualNumberEditor}>
              <TextInput
                style={styles.manualNumberInput}
                value={manualNumberInput}
                onChangeText={(value) => setManualNumberInput(value.replace(/[^\d]/g, '').slice(0, 2))}
                placeholder="1-99"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TouchableOpacity
                style={[styles.manualNumberButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                onPress={() => {
                  setEditingNumberStudentId(null);
                  setManualNumberInput('');
                }}
                disabled={savingManualNumberStudentId === item.studentId}
              >
                <Text style={[styles.manualNumberButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manualNumberButton, { borderColor: theme.primary, backgroundColor: theme.primary }]}
                onPress={() => handleSaveManualNumber(item)}
                disabled={savingManualNumberStudentId === item.studentId}
              >
                <Text style={[styles.manualNumberButtonText, { color: '#fff' }]}>
                  {savingManualNumberStudentId === item.studentId ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.manualNumberCta, {
                borderColor: (theme.info || '#60a5fa') + '66',
                backgroundColor: (theme.info || '#60a5fa') + '18',
              }]}
              onPress={() => {
                setEditingNumberStudentId(item.studentId);
                setManualNumberInput(hasAssignedBackNumber(item.tshirtNumber) ? normalizeBackNumber(item.tshirtNumber) : '');
              }}
            >
              <Ionicons name="create-outline" size={14} color={theme.info || '#60a5fa'} />
              <Text style={[styles.manualNumberCtaText, { color: theme.info || '#60a5fa' }]}>
                {hasAssignedBackNumber(item.tshirtNumber) ? 'Change Number' : 'Set Number'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  ), [
    bulkMessaging,
    editingNumberStudentId,
    deletingRecordId,
    handleSaveManualNumber,
    load,
    manualNumberInput,
    markingPaidId,
    messageSingleParent,
    paymentStatusMeta,
    savingManualNumberStudentId,
    schoolId,
    renderDetail,
    showAlert,
    singleMessagingTargetId,
    theme.error,
    theme.primary,
    theme.success,
    theme.warning,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Uniform Sizes', headerShown: false }} />
      {!schoolId ? (
        <Text style={styles.muted}>No school found on your profile.</Text>
      ) : (
        <>
          <View style={styles.headerBlock}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={2}>Uniform Sizes</Text>
              <Text style={styles.subtitle}>T-shirt size will be used for shorts. Returning numbers included.</Text>
            </View>
            <View style={styles.headerActionsRow}>
              <TouchableOpacity
                style={[styles.exportButton, styles.headerActionButton, { backgroundColor: theme.info || '#0EA5E9' }]}
                onPress={handleGenerateNumbersPress}
                disabled={generatingNumbers}
              >
                <Ionicons name="keypad-outline" size={18} color="#fff" />
                <Text style={styles.exportButtonText} numberOfLines={1} ellipsizeMode="tail">
                  {generatingNumbers
                    ? 'Generating...'
                    : learnersWithoutNumberCount > 0
                      ? `Generate Numbers (${learnersWithoutNumberCount})`
                      : 'Generate Numbers'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportButton, styles.headerActionButton, { backgroundColor: theme.primary }]}
                onPress={handleExportPdf}
                disabled={exporting || filtered.length === 0}
              >
                <Ionicons name="document-text-outline" size={18} color="#fff" />
                <Text style={styles.exportButtonText} numberOfLines={1} ellipsizeMode="tail">{exporting ? 'Exporting...' : 'Export PDF'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search child, parent, code, class, or back number"
              placeholderTextColor={theme.textSecondary}
            />
            {search.trim().length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClearButton}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.controlsRow}>
            <View style={styles.countChip}>
              <Ionicons name="checkmark-circle" size={14} color={theme.success || '#22c55e'} />
              <Text style={styles.countChipText}>{submittedCount} submitted</Text>
            </View>
            <View style={styles.countChip}>
              <Ionicons name="alert-circle" size={14} color={theme.warning || '#f59e0b'} />
              <Text style={styles.countChipText}>{missingCount} missing</Text>
            </View>
            <View style={styles.countChip}>
              <Ionicons name="keypad-outline" size={14} color={theme.info || '#60a5fa'} />
              <Text style={styles.countChipText}>{learnersWithoutNumberCount} without number</Text>
            </View>
            <TouchableOpacity
              style={[styles.bulkButton, { backgroundColor: theme.warning || '#f59e0b' }]}
              onPress={() => bulkMessageNoOrder(missingRows)}
              disabled={bulkMessaging !== null || missingContactableCount === 0}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
              <Text style={styles.bulkButtonText}>
                {bulkMessaging === 'no_order' ? 'Sending...' : 'Message No Order (' + missingContactableCount + ')'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkButton, { backgroundColor: theme.error || '#ef4444' }]}
              onPress={() => bulkMessageUnpaid(submittedRows)}
              disabled={bulkMessaging !== null || unpaidContactableCount === 0}
            >
              <Ionicons name="cash-outline" size={16} color="#fff" />
              <Text style={styles.bulkButtonText}>
                {bulkMessaging === 'unpaid' ? 'Sending...' : 'Message Unpaid (' + unpaidContactableCount + ')'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, showInsights && styles.toggleButtonActive]}
              onPress={() => setShowInsights((prev) => !prev)}
            >
              <Ionicons name="analytics-outline" size={16} color={showInsights ? '#fff' : theme.textSecondary} />
              <Text style={[styles.toggleButtonText, showInsights && styles.toggleButtonTextActive]}>Insights</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, showFilters && styles.toggleButtonActive]}
              onPress={() => setShowFilters((prev) => !prev)}
            >
              <Ionicons name="funnel-outline" size={16} color={showFilters ? '#fff' : theme.textSecondary} />
              <Text style={[styles.toggleButtonText, showFilters && styles.toggleButtonTextActive]}>Filters</Text>
            </TouchableOpacity>
          </View>

          {!showFilters && (
            <View style={styles.filterSummaryRow}>
              <Text style={styles.filterSummaryText}>
                Size: {sizeFilter === 'all' ? 'All' : sizeFilter} &bull; Status: {statusFilter === 'all' ? 'All' : statusFilter}
              </Text>
            </View>
          )}

          <View style={styles.filterSummaryRow}>
            <Text style={styles.filterSummaryText}>
              Showing {safeFiltered.length} result{safeFiltered.length === 1 ? '' : 's'}
            </Text>
          </View>

          {showFilters && (
            <View style={styles.filtersCard}>
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Size</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={sizeFilter} onValueChange={(value) => setSizeFilter(value)} style={styles.picker}>
                    <Picker.Item label="All sizes" value="all" />
                    {SIZE_OPTIONS.map((size: string) => (
                      <Picker.Item key={size} label={size} value={size} />
                    ))}
                  </Picker>
                </View>
              </View>
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Status</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={statusFilter} onValueChange={(value) => setStatusFilter(value)} style={styles.picker}>
                    <Picker.Item label="All" value="all" />
                    <Picker.Item label="Submitted" value="submitted" />
                    <Picker.Item label="Missing sizes" value="missing" />
                  </Picker>
                </View>
              </View>
            </View>
          )}

          {showInsights && (
            <View style={styles.insightsCard}>
              <View style={styles.insightBlock}>
                <Text style={styles.summaryTitle}>Size Summary</Text>
                {Object.keys(sizeSummary).length === 0 ? (
                  <Text style={styles.muted}>No submissions yet.</Text>
                ) : (
                  <View style={styles.summaryRow}>
                    {Object.entries(sizeSummary).map(([size, count]) => (
                      <View key={size} style={styles.summaryChip}>
                        <Text style={styles.summaryChipText}>{size}</Text>
                        <Text style={styles.summaryChipCount}>{count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.insightDivider} />
              <View style={styles.insightBlock}>
                <Text style={styles.summaryTitle}>Missing by Class</Text>
                {missingByClass.length === 0 ? (
                  <Text style={styles.muted}>No missing submissions.</Text>
                ) : (
                  <View style={styles.summaryRow}>
                    {missingByClass.map(({ name, count }: { name: string; count: number }) => (
                      <View key={name} style={styles.summaryChip}>
                        <Text style={styles.summaryChipText}>{name}</Text>
                        <Text style={styles.summaryChipCount}>{count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {Platform.OS === 'web' ? (
            <View style={styles.list}>
              <ScrollView
                style={styles.list}
                contentContainerStyle={[styles.listContent, safeFiltered.length === 0 && styles.listContentEmpty]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
              >
                {loading ? <Text style={styles.muted}>Loading...</Text> : null}
                {!loading && safeFiltered.length === 0 ? <Text style={styles.muted}>No uniform submissions found.</Text> : null}
                {!loading ? safeFiltered.map((item, index) => (
                  <View key={item?.id || `uniform-row-${index}`}>
                    {renderUniformCard(item)}
                  </View>
                )) : null}
              </ScrollView>
            </View>
          ) : (
            <FlatList
              data={safeFiltered}
              keyExtractor={(item, index) => item?.id || `uniform-row-${index}`}
              style={styles.list}
              contentContainerStyle={[styles.listContent, safeFiltered.length === 0 && styles.listContentEmpty]}
              removeClippedSubviews
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={8}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
              ListEmptyComponent={
                loading ? <Text style={styles.muted}>Loading...</Text> : <Text style={styles.muted}>No uniform submissions found.</Text>
              }
              renderItem={({ item }) => renderUniformCard(item)}
            />
          )}
        </>
      )}
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme?.background || '#0b1220', padding: 10 },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 20 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  headerBlock: { marginBottom: 8, gap: 8 },
  headerText: { width: '100%' },
  title: { color: theme?.text || '#fff', fontSize: 30, lineHeight: 34, fontWeight: '800', flexShrink: 1, letterSpacing: -0.3 },
  subtitle: { color: theme?.textSecondary || '#9CA3AF', fontSize: 13, marginTop: 4, lineHeight: 18, fontWeight: '500' },
  headerActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  headerActionButton: { flexGrow: 1, flexBasis: 164, maxWidth: '100%' },
  exportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, minHeight: 44, flexShrink: 1 },
  exportButtonText: { color: '#fff', fontWeight: '700', flexShrink: 1, fontSize: 14, letterSpacing: 0.1 },
  searchWrap: {
    backgroundColor: theme?.surface || '#111827',
    borderRadius: 10,
    borderColor: theme?.border || '#1f2937',
    borderWidth: 1,
    marginBottom: 6,
    paddingHorizontal: 10,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: theme?.text || '#fff', fontSize: 14, paddingVertical: 8, lineHeight: 20 },
  searchClearButton: { padding: 2 },
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 },
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme?.surface || '#111827', borderWidth: 1, borderColor: theme?.border || '#1f2937' },
  countChipText: { color: theme?.text || '#fff', fontSize: 13, fontWeight: '700' },
  bulkButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  bulkButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  toggleButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: theme?.border || '#1f2937', backgroundColor: theme?.surface || '#111827' },
  toggleButtonActive: { backgroundColor: theme?.primary || '#3b82f6', borderColor: theme?.primary || '#3b82f6' },
  toggleButtonText: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12, fontWeight: '700' },
  toggleButtonTextActive: { color: '#fff' },
  filterSummaryRow: { paddingVertical: 4, paddingHorizontal: 6, marginBottom: 6 },
  filterSummaryText: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12, fontWeight: '600' },
  filtersCard: { backgroundColor: theme?.cardBackground || '#111827', borderRadius: 12, padding: 10, borderColor: theme?.border || '#1f2937', borderWidth: 1, marginBottom: 8 },
  insightsCard: { backgroundColor: theme?.cardBackground || '#111827', borderRadius: 12, padding: 10, borderColor: theme?.border || '#1f2937', borderWidth: 1, marginBottom: 8 },
  insightBlock: { marginBottom: 10 },
  insightDivider: { height: 1, backgroundColor: theme?.border || '#1f2937', marginVertical: 6 },
  summaryTitle: { color: theme?.text || '#fff', fontWeight: '700', marginBottom: 8, fontSize: 12 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme?.surface || '#111827', borderWidth: 1, borderColor: theme?.border || '#1f2937' },
  summaryChipText: { color: theme?.text || '#fff', fontWeight: '600', fontSize: 12 },
  summaryChipCount: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  filterLabel: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12, fontWeight: '600' },
  pickerWrap: { flex: 1, borderWidth: 1, borderColor: theme?.border || '#1f2937', borderRadius: 10, overflow: 'hidden', backgroundColor: theme?.surface || '#111827' },
  picker: { color: theme?.text || '#fff' },
  card: { backgroundColor: theme?.cardBackground || '#111827', borderRadius: 12, padding: 12, borderColor: theme?.border || '#1f2937', borderWidth: 1, marginBottom: 10 },
  missingCard: { borderStyle: 'dashed', borderColor: theme?.warning || '#f59e0b' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { color: theme?.text || '#fff', fontWeight: '800', fontSize: 20, lineHeight: 26, marginBottom: 8, letterSpacing: -0.2 },
  paymentChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  paymentChipText: { fontSize: 12, fontWeight: '700' },
  inlineActionButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineActionButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  deleteActionButton: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  deleteActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  manualNumberSection: {
    marginTop: 10,
    gap: 6,
  },
  manualNumberLabel: {
    color: theme?.textSecondary || '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  manualNumberEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  manualNumberInput: {
    minWidth: 70,
    maxWidth: 90,
    borderWidth: 1,
    borderColor: theme?.border || '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme?.text || '#fff',
    backgroundColor: theme?.surface || '#111827',
    fontWeight: '700',
    textAlign: 'center',
  },
  manualNumberButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  manualNumberButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  manualNumberCta: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  manualNumberCtaText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailText: { color: theme?.text || '#fff', fontSize: 14, lineHeight: 21, marginBottom: 2 },
  detailMuted: { color: theme?.textSecondary || '#9CA3AF', fontSize: 13, lineHeight: 19, marginBottom: 2 },
  detailLabel: { color: theme?.textSecondary || '#9CA3AF', fontWeight: '700' },
  detailValue: { color: theme?.text || '#fff', fontWeight: '600' },
  text: { color: theme?.text || '#fff', fontSize: 13 },
  muted: { color: theme?.textSecondary || '#9CA3AF', paddingVertical: 8, fontSize: 13, lineHeight: 18 },
});
