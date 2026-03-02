/**
 * Individual Student Detail Screen
 * 
 * Features:
 * - View comprehensive student information
 * - Assign/change student class (Principal functionality)
 * - Update student details
 * - View attendance and academic records
 * - Contact parent/guardian
 * - Financial records and fee management
 * 
 * Refactored to use shared components from components/student-detail/
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { fetchStudentData, markPaymentReceived } from '@/lib/screen-data/student-detail.helpers';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { AlertModal, type AlertButton } from '@/components/ui/AlertModal';
import { normalizeRole } from '@/lib/rbac/profile-utils';

// Shared components
import {
  StudentDetail,
  Class,
  Transaction,
  ProfileCard,
  StudentDetailsSection,
  ClassInfoSection,
  AcademicPerformanceSection,
  ParentContactSection,
  ProgressReportsSection,
  FinancialStatusSection,
  FeeBreakdownSection,
  MedicalInfoSection,
  ClassAssignmentModal,
} from '@/components/student-detail';

export default function StudentDetailScreen() {
  const TAG = 'StudentDetail';
  const STUDENT_DELETE_RETENTION_DAYS = 30;
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ studentId?: string; id?: string }>();
  const studentId = params.studentId || params.id;

  interface AlertState {
    visible: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'error';
    buttons: AlertButton[];
  }

  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const showAlert = (
    title: string,
    message: string,
    type: AlertState['type'] = 'info',
    buttons: AlertButton[] = [{ text: 'OK', style: 'default' }],
  ) => {
    setAlertState({ visible: true, title, message, type, buttons });
  };

  const hideAlert = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
  };
  
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showClassAssignment, setShowClassAssignment] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editedStudent, setEditedStudent] = useState<Partial<StudentDetail>>({});
  const [saving, setSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState('Processing...');
  
  // Financial details state
  const [showFinancialDetails, setShowFinancialDetails] = useState(false);
  const [childTransactions, setChildTransactions] = useState<Transaction[]>([]);
  
  // Role-based checks
  const normalizedRole = normalizeRole(profile?.role || '') ?? 'parent';
  const isPrincipal = normalizedRole === 'principal_admin' || normalizedRole === 'super_admin';
  const isTeacher = normalizedRole === 'teacher';
  const isParent = normalizedRole === 'parent';
  const canEditStudent = isPrincipal || isTeacher;
  const canAssignClass = isPrincipal;
  const canViewParentContact = !isParent;
  const canViewFinancial = isPrincipal;

  const loadStudentData = async () => {
    if (!studentId || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await fetchStudentData({
        studentId,
        userId: user.id,
        profileId: profile?.id,
        preschoolId: profile?.preschool_id,
        organizationId: profile?.organization_id,
        isParent,
        canAssignClass,
        canViewFinancial,
        profileRole: profile?.role,
      });
      setStudent(result.student);
      setClasses(result.classes);
      setChildTransactions(result.transactions);
    } catch (error: any) {
      logger.error(TAG, 'Error loading student data:', error);
      showAlert('Error', error.message || 'Failed to load student information', 'error',
        error.message === 'No school assigned to your account'
          ? [{ text: 'OK', style: 'default' as const }]
          : [{ text: 'OK', style: 'default' as const, onPress: () => router.back() }]
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAssignClass = async () => {
    if (!selectedClassId || !student) return;

    try {
      setSavingMessage('Updating class assignment...');
      setSaving(true);
      const { error } = await assertSupabase()
        .from('students')
        .update({ class_id: selectedClassId })
        .eq('id', student.id);

      if (error) {
        showAlert('Error', 'Failed to assign class', 'error');
        return;
      }

      showAlert('Success', 'Student successfully assigned to class', 'success');
      setShowClassAssignment(false);
      loadStudentData();
    } catch {
      showAlert('Error', 'Failed to assign class', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditToggle = () => {
    if (!canEditStudent) return;
    if (editMode) {
      setEditMode(false);
      setEditedStudent({});
    } else {
      setEditMode(true);
      setEditedStudent({
        first_name: student?.first_name,
        last_name: student?.last_name,
        medical_conditions: student?.medical_conditions,
        allergies: student?.allergies,
        medication: student?.medication,
        emergency_contact_name: student?.emergency_contact_name,
        emergency_contact_phone: student?.emergency_contact_phone,
        emergency_contact_relation: student?.emergency_contact_relation,
      });
    }
  };

  const handleSave = async () => {
    if (!canEditStudent) return;
    if (!student || !editedStudent) return;

    try {
      setSavingMessage('Saving student details...');
      setSaving(true);

      const { error } = await assertSupabase()
        .from('students')
        .update({
          first_name: editedStudent.first_name,
          last_name: editedStudent.last_name,
          medical_conditions: editedStudent.medical_conditions,
          allergies: editedStudent.allergies,
          medication: editedStudent.medication,
          emergency_contact_name: editedStudent.emergency_contact_name,
          emergency_contact_phone: editedStudent.emergency_contact_phone,
          emergency_contact_relation: editedStudent.emergency_contact_relation,
        })
        .eq('id', student.id);

      if (error) {
        showAlert('Error', 'Failed to save student details', 'error');
        return;
      }

      showAlert('Success', 'Student details updated successfully', 'success');
      setEditMode(false);
      setEditedStudent({});
      loadStudentData();
    } catch (error) {
      logger.error(TAG, 'Error saving student:', error);
      showAlert('Error', 'Failed to save student details', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveStudent = async () => {
    if (!student) return;

    showAlert(
      'Remove Student',
      `Are you sure you want to remove ${student.first_name} ${student.last_name} from the school?\n\nThis will:\n- deactivate the student\n- keep records for ${STUDENT_DELETE_RETENTION_DAYS} days before permanent deletion\n- allow reactivation during the retention window`,
      'warning',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              hideAlert();
              setSavingMessage('Removing student...');
              setSaving(true);
              const nowIso = new Date().toISOString();
              const retentionDate = new Date();
              retentionDate.setDate(retentionDate.getDate() + STUDENT_DELETE_RETENTION_DAYS);
              const retentionIso = retentionDate.toISOString();
              const retentionLabel = retentionDate.toLocaleDateString('en-ZA', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });

              // Call the deactivate_student function
              const { error } = await assertSupabase()
                .rpc('deactivate_student', {
                  student_uuid: student.id,
                  reason: `Removed by principal - left school (retention ${STUDENT_DELETE_RETENTION_DAYS} days)`,
                });

              if (error) {
                logger.warn(TAG, 'RPC deactivate_student failed, falling back to direct update:', error);
                let { error: updateError } = await assertSupabase()
                  .from('students')
                  .update({
                    is_active: false,
                    status: 'inactive',
                    class_id: null,
                    deleted_at: nowIso,
                    delete_reason: `Removed by principal - left school (retention ${STUDENT_DELETE_RETENTION_DAYS} days)`,
                    permanent_delete_after: retentionIso,
                    updated_at: nowIso,
                  } as any)
                  .eq('id', student.id);

                if (updateError && /column .* does not exist|schema cache/i.test(updateError.message || '')) {
                  const { error: minimalError } = await assertSupabase()
                    .from('students')
                    .update({
                      is_active: false,
                      status: 'inactive',
                      class_id: null,
                      updated_at: nowIso,
                    })
                    .eq('id', student.id);
                  updateError = minimalError;
                }

                if (updateError) {
                  logger.error(TAG, 'Error deactivating student (fallback):', updateError);
                  showAlert('Error', 'Failed to remove student. Please try again.', 'error');
                  return;
                }
              }

              showAlert(
                'Student Removed',
                `${student.first_name} ${student.last_name} is now inactive and can be restored before ${retentionLabel}. Permanent deletion is scheduled after ${STUDENT_DELETE_RETENTION_DAYS} days.`,
                'success',
                [
                  {
                    text: 'OK',
                    style: 'default',
                    onPress: () => router.back(),
                  },
                ]
              );
            } catch (error) {
              logger.error(TAG, 'Error removing student:', error);
              showAlert('Error', 'Failed to remove student. Please try again.', 'error');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // Handle marking a payment as received (Principal only)
  const handleMarkPaymentReceived = async (amount: number, paymentMethod: string, notes: string) => {
    if (!student || !user || !isPrincipal) {
      throw new Error('Unauthorized or missing data');
    }
    await markPaymentReceived(student.id, user.id, amount, paymentMethod, notes);
    await loadStudentData();
  };

  // Handle updating a specific fee (Principal only)
  const handleUpdateFee = async (feeId: string, updates: { amount?: number; due_date?: string }) => {
    if (!user || !isPrincipal) throw new Error('Unauthorized');
    const supabase = assertSupabase();

    const updatePayload: Record<string, any> = {};
    if (updates.amount != null) {
      updatePayload.amount = updates.amount;
      updatePayload.final_amount = updates.amount;
      // Recalculate outstanding based on current paid amount
      const { data: current } = await supabase
        .from('student_fees')
        .select('amount_paid')
        .eq('id', feeId)
        .single();
      updatePayload.amount_outstanding = updates.amount - (current?.amount_paid ?? 0);
    }
    if (updates.due_date) {
      updatePayload.due_date = updates.due_date;
    }

    const { error } = await supabase
      .from('student_fees')
      .update(updatePayload)
      .eq('id', feeId);

    if (error) {
      showAlert('Error', 'Failed to update fee: ' + error.message, 'error');
      throw error;
    }
    showAlert('Success', 'Fee updated successfully', 'success');
    await loadStudentData();
  };

  // Handle re-assessing fee for student's current age (Principal only)
  const handleCorrectFee = async (studentId: string, billingMonth: string) => {
    if (!user || !isPrincipal) throw new Error('Unauthorized');
    const supabase = assertSupabase();

    const { data, error } = await supabase
      .rpc('assign_correct_fee_for_student', {
        p_student_id: studentId,
        p_billing_month: billingMonth,
      });

    if (error) {
      showAlert('Error', 'Failed to correct fee: ' + error.message, 'error');
      throw error;
    }

    const result = data as any;
    if (result?.error) {
      showAlert('Error', result.error, 'error');
      return;
    }

    showAlert('Success', `Fee ${result?.action || 'updated'}: ${result?.fee_name || ''} — ${result?.amount ? 'R' + result.amount : ''}`, 'success');
    await loadStudentData();
  };

  useEffect(() => {
    loadStudentData();
  }, [studentId, user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadStudentData();
  };

  const styles = React.useMemo(() => createStyles(theme), [theme]);

  // Loading state
  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="person-outline" size={48} color={theme.textSecondary} />
          <Text style={styles.loadingText}>Loading student details...</Text>
        </View>
        <AlertModal
          visible={alertState.visible}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
          buttons={alertState.buttons}
          onClose={hideAlert}
        />
      </SafeAreaView>
    );
  }

  // Error state
  if (!student) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="person-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>Student not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
        <AlertModal
          visible={alertState.visible}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
          buttons={alertState.buttons}
          onClose={hideAlert}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Student Details</Text>
        {editMode ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={handleEditToggle} disabled={saving}>
              <Ionicons name="close" size={24} color={theme.error} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Ionicons name="checkmark" size={24} color={theme.success} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {canEditStudent && (
              <TouchableOpacity onPress={handleEditToggle}>
                <Ionicons name="create" size={24} color={theme.primary} />
              </TouchableOpacity>
            )}
            {isPrincipal && (
              <TouchableOpacity onPress={handleRemoveStudent} disabled={saving}>
                <Ionicons name="person-remove-outline" size={24} color={theme.error} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <ScrollView 
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Profile Card */}
        <ProfileCard
          student={student}
          theme={theme}
          editMode={editMode}
          canExpandPhoto={isPrincipal || isTeacher}
          editedStudent={editedStudent}
          onEditChange={setEditedStudent}
        />

        {/* Student Details */}
        <StudentDetailsSection
          student={student}
          theme={theme}
        />

        {/* Class Information */}
        <ClassInfoSection
          student={student}
          classes={classes}
          theme={theme}
          canAssignClass={canAssignClass}
          onAssignClass={() => setShowClassAssignment(true)}
        />

        {/* Academic Performance */}
        <AcademicPerformanceSection
          student={student}
          theme={theme}
        />

        {/* Parent/Guardian Contact */}
        {canViewParentContact && (
          <ParentContactSection
            student={student}
            theme={theme}
            canManageGuardian={canAssignClass}
            onGuardianLinked={loadStudentData}
          />
        )}

        {/* Progress Reports */}
        <ProgressReportsSection
          student={student}
          mode={isPrincipal ? 'principal' : isTeacher ? 'teacher' : 'parent'}
          theme={theme}
        />

        {/* Financial Status */}
        {canViewFinancial && (
          <FinancialStatusSection
            student={student}
            transactions={childTransactions}
            showDetails={showFinancialDetails}
            onToggleDetails={() => setShowFinancialDetails(!showFinancialDetails)}
            theme={theme}
            isPrincipal={isPrincipal}
            onMarkPaymentReceived={handleMarkPaymentReceived}
          />
        )}

        {/* Fee Breakdown — visible to principals AND parents */}
        {(canViewFinancial || isParent) && (
          <FeeBreakdownSection
            student={student}
            theme={theme}
            isPrincipal={isPrincipal}
            onUpdateFee={isPrincipal ? handleUpdateFee : undefined}
            onCorrectFee={isPrincipal ? handleCorrectFee : undefined}
          />
        )}

        {/* Medical & Emergency Information */}
        <MedicalInfoSection
          student={student}
          theme={theme}
          editMode={editMode && canEditStudent}
          editedStudent={editedStudent}
          onEditChange={setEditedStudent}
        />
      </ScrollView>

      {/* Class Assignment Modal */}
      {canAssignClass && (
        <ClassAssignmentModal
          visible={showClassAssignment}
          student={student}
          classes={classes}
          selectedClassId={selectedClassId}
          onSelectClass={setSelectedClassId}
          onSave={handleAssignClass}
          onClose={() => setShowClassAssignment(false)}
          theme={theme}
        />
      )}

      {saving && (
        <View style={styles.savingOverlay} pointerEvents="auto">
          <View style={styles.savingCard}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.savingMessage}>{savingMessage}</Text>
          </View>
        </View>
      )}

      <AlertModal
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        buttons={alertState.buttons}
        onClose={hideAlert}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
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
    marginTop: 16,
    fontSize: 16,
    color: theme.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: theme.error,
    marginTop: 16,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  savingCard: {
    minWidth: 220,
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  savingMessage: {
    marginTop: 12,
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
  },
  scrollView: {
    flex: 1,
  },
});
