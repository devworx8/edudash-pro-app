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
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  fetchStudentData,
  listStudentChangeRequests,
  markPaymentReceived,
  reviewStudentChangeRequest,
  submitStudentChangeRequest,
  type StudentChangeRequest,
} from '@/lib/screen-data/student-detail.helpers';
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

type StudentChangeDraft = Record<string, string>;

const STUDENT_CHANGE_FIELD_CONFIG: Array<{
  key: keyof StudentChangeDraft;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { key: 'first_name', label: 'First Name', placeholder: 'First name' },
  { key: 'last_name', label: 'Last Name', placeholder: 'Last name' },
  { key: 'gender', label: 'Gender', placeholder: 'Gender' },
  { key: 'date_of_birth', label: 'Date of Birth', placeholder: 'YYYY-MM-DD' },
  { key: 'home_address', label: 'Home Address', placeholder: 'Home address', multiline: true },
  { key: 'home_phone', label: 'Home Phone', placeholder: 'Home phone' },
  { key: 'medical_conditions', label: 'Medical Conditions', placeholder: 'Medical conditions', multiline: true },
  { key: 'allergies', label: 'Allergies', placeholder: 'Allergies', multiline: true },
  { key: 'medication', label: 'Medication', placeholder: 'Medication', multiline: true },
  { key: 'emergency_contact_name', label: 'Emergency Contact Name', placeholder: 'Emergency contact name' },
  { key: 'emergency_contact_phone', label: 'Emergency Contact Phone', placeholder: 'Emergency contact phone' },
  { key: 'emergency_contact_relation', label: 'Emergency Contact Relation', placeholder: 'Emergency contact relation' },
];

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
  const [studentChangeRequests, setStudentChangeRequests] = useState<StudentChangeRequest[]>([]);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [changeRequestNote, setChangeRequestNote] = useState('');
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
  const [changeDraft, setChangeDraft] = useState<StudentChangeDraft>({});
  
  // Role-based checks
  const normalizedRole = normalizeRole(profile?.role || '') ?? 'parent';
  const isPrincipal = normalizedRole === 'principal_admin' || normalizedRole === 'super_admin';
  const isTeacher = normalizedRole === 'teacher';
  const isParent = normalizedRole === 'parent';
  const canEditStudent = isPrincipal || isTeacher;
  const canAssignClass = isPrincipal;
  const canViewParentContact = !isParent;
  const canViewFinancial = isPrincipal;
  const canManageChangeRequests = isPrincipal;
  const canSubmitChangeRequest = isParent;

  const fieldLabelMap = React.useMemo(
    () => STUDENT_CHANGE_FIELD_CONFIG.reduce<Record<string, string>>((acc, field) => {
      acc[field.key] = field.label;
      return acc;
    }, {}),
    [],
  );

  const getDefaultChangeDraft = React.useCallback((target?: StudentDetail | null): StudentChangeDraft => {
    if (!target) return {};
    return STUDENT_CHANGE_FIELD_CONFIG.reduce<StudentChangeDraft>((acc, field) => {
      const rawValue = (target as any)?.[field.key];
      acc[field.key] = rawValue == null ? '' : String(rawValue);
      return acc;
    }, {});
  }, []);

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
      setChangeDraft(getDefaultChangeDraft(result.student));

      if (canSubmitChangeRequest || canManageChangeRequests) {
        try {
          const requests = await listStudentChangeRequests({
            studentId,
            userId: user.id,
            isPrincipal: canManageChangeRequests,
          });
          setStudentChangeRequests(requests);
        } catch (changeRequestError: any) {
          logger.warn(TAG, 'Continuing without student change requests:', changeRequestError);
          setStudentChangeRequests([]);
        }
      } else {
        setStudentChangeRequests([]);
      }
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

  const normalizeRequestedValue = (fieldKey: string, value: unknown): string | null => {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (fieldKey === 'date_of_birth') return text.slice(0, 10);
    return text;
  };

  const buildRequestedChanges = () => {
    if (!student) return {};
    return STUDENT_CHANGE_FIELD_CONFIG.reduce<Record<string, string | null>>((acc, field) => {
      const nextValue = normalizeRequestedValue(field.key, changeDraft[field.key]);
      const currentValue = normalizeRequestedValue(field.key, (student as any)[field.key]);
      if (nextValue !== currentValue) {
        acc[field.key] = nextValue;
      }
      return acc;
    }, {});
  };

  const openChangeRequestModal = () => {
    if (!student) return;
    setChangeDraft(getDefaultChangeDraft(student));
    setChangeRequestNote('');
    setShowChangeRequestModal(true);
  };

  const handleSubmitChangeRequest = async () => {
    if (!student || !user) return;
    const pendingExists = studentChangeRequests.some((request) => request.status === 'pending');
    if (pendingExists) {
      showAlert(
        'Pending Request Exists',
        'You already have a pending student detail request. Please wait for the principal to review it.',
        'warning',
      );
      return;
    }

    const requestedChanges = buildRequestedChanges();
    const schoolId =
      profile?.organization_id
      || profile?.preschool_id
      || (student as any)?.organization_id
      || student.preschool_id;

    if (!schoolId) {
      showAlert('Error', 'No school is linked to this student profile.', 'error');
      return;
    }

    try {
      setSubmittingChangeRequest(true);
      await submitStudentChangeRequest({
        studentId: student.id,
        schoolId,
        requestedBy: user.id,
        requestedChanges,
        requestNote: changeRequestNote,
      });
      setShowChangeRequestModal(false);
      showAlert(
        'Request Submitted',
        'Your update request was sent to the principal for review.',
        'success',
      );
      await loadStudentData();
    } catch (error) {
      logger.error(TAG, 'Error submitting student change request:', error);
      showAlert(
        'Request Failed',
        error instanceof Error ? error.message : 'Could not submit request. Please try again.',
        'error',
      );
    } finally {
      setSubmittingChangeRequest(false);
    }
  };

  const handleReviewChangeRequest = (request: StudentChangeRequest, decision: 'approved' | 'rejected') => {
    if (!user) return;
    const decisionLabel = decision === 'approved' ? 'Approve' : 'Reject';
    const message = decision === 'approved'
      ? 'Approve this request and apply the requested student detail changes?'
      : 'Reject this request? The student profile will remain unchanged.';

    showAlert(
      `${decisionLabel} Request`,
      message,
      decision === 'approved' ? 'warning' : 'error',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decisionLabel,
          style: decision === 'approved' ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setSavingMessage(`${decisionLabel}ing request...`);
              setSaving(true);
              await reviewStudentChangeRequest({
                requestId: request.id,
                reviewerId: user.id,
                decision,
              });
              showAlert(
                'Request Updated',
                `Request ${decision === 'approved' ? 'approved and applied' : 'rejected'} successfully.`,
                'success',
              );
              await loadStudentData();
            } catch (error) {
              logger.error(TAG, 'Error reviewing student change request:', error);
              showAlert(
                'Update Failed',
                error instanceof Error ? error.message : 'Could not review request. Please try again.',
                'error',
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const summarizeRequestedChanges = (request: StudentChangeRequest): string => {
    const entries = Object.entries(request.requested_changes || {});
    if (!entries.length) return request.request_note?.trim() ? 'No field updates (note only).' : 'No field updates provided.';
    return entries
      .map(([key, value]) => `${fieldLabelMap[key] || key.replace(/_/g, ' ')}: ${value ?? '(clear)'}`)
      .join('\n');
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

        {canSubmitChangeRequest && (
          <View style={styles.requestSection}>
            <View style={styles.requestSectionHeader}>
              <Text style={styles.requestSectionTitle}>Need to update student details?</Text>
              <TouchableOpacity
                style={styles.requestActionButton}
                onPress={openChangeRequestModal}
                disabled={submittingChangeRequest || studentChangeRequests.some((request) => request.status === 'pending')}
              >
                <Ionicons name="create-outline" size={14} color={theme.primary} />
                <Text style={styles.requestActionText}>
                  {studentChangeRequests.some((request) => request.status === 'pending') ? 'Pending review' : 'Request change'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.requestHint}>
              Parents submit correction requests here. The principal must approve before details are changed.
            </Text>
            {studentChangeRequests.length > 0 && (
              <View style={styles.requestList}>
                {studentChangeRequests.slice(0, 4).map((request) => (
                  <View key={request.id} style={styles.requestListItem}>
                    <Text style={styles.requestListStatus}>
                      {request.status.toUpperCase()} • {new Date(request.created_at).toLocaleDateString()}
                    </Text>
                    <Text style={styles.requestListBody} numberOfLines={2}>
                      {summarizeRequestedChanges(request)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {canManageChangeRequests && studentChangeRequests.length > 0 && (
          <View style={styles.requestSection}>
            <Text style={styles.requestSectionTitle}>Pending parent detail requests</Text>
            <Text style={styles.requestHint}>
              Approve to apply requested fields directly to this student profile.
            </Text>
            {studentChangeRequests.map((request) => (
              <View key={request.id} style={styles.principalRequestCard}>
                <View style={styles.principalRequestHeader}>
                  <Text style={styles.requestListStatus}>
                    {request.status.toUpperCase()} • {new Date(request.created_at).toLocaleString()}
                  </Text>
                  {request.status === 'pending' && (
                    <View style={styles.requestButtonsRow}>
                      <TouchableOpacity
                        style={styles.principalApproveBtn}
                        onPress={() => handleReviewChangeRequest(request, 'approved')}
                      >
                        <Ionicons name="checkmark-circle-outline" size={14} color={theme.success} />
                        <Text style={styles.principalApproveText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.principalRejectBtn}
                        onPress={() => handleReviewChangeRequest(request, 'rejected')}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={theme.error} />
                        <Text style={styles.principalRejectText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <Text style={styles.requestListBody}>{summarizeRequestedChanges(request)}</Text>
                {request.request_note ? (
                  <Text style={styles.requestMetaText}>Parent note: {request.request_note}</Text>
                ) : null}
                {request.review_note ? (
                  <Text style={styles.requestMetaText}>Review note: {request.review_note}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

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

      <Modal
        visible={showChangeRequestModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChangeRequestModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request student detail changes</Text>
              <TouchableOpacity onPress={() => setShowChangeRequestModal(false)}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              {STUDENT_CHANGE_FIELD_CONFIG.map((field) => (
                <View key={field.key} style={styles.modalFieldWrap}>
                  <Text style={styles.modalFieldLabel}>{field.label}</Text>
                  <TextInput
                    value={changeDraft[field.key] || ''}
                    onChangeText={(text) => setChangeDraft((prev) => ({ ...prev, [field.key]: text }))}
                    style={[styles.modalInput, field.multiline && styles.modalInputMultiline]}
                    placeholder={field.placeholder}
                    placeholderTextColor={theme.textSecondary}
                    multiline={field.multiline}
                    numberOfLines={field.multiline ? 3 : 1}
                  />
                </View>
              ))}
              <View style={styles.modalFieldWrap}>
                <Text style={styles.modalFieldLabel}>Reason / context (optional)</Text>
                <TextInput
                  value={changeRequestNote}
                  onChangeText={setChangeRequestNote}
                  style={[styles.modalInput, styles.modalInputMultiline]}
                  placeholder="Explain what should be corrected"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowChangeRequestModal(false)}
                disabled={submittingChangeRequest}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleSubmitChangeRequest}
                disabled={submittingChangeRequest}
              >
                {submittingChangeRequest ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  requestSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  requestSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  requestSectionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    minWidth: 180,
  },
  requestHint: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  requestActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.primary + '55',
    backgroundColor: theme.primary + '14',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  requestActionText: {
    color: theme.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  requestList: {
    gap: 8,
    marginTop: 2,
  },
  requestListItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.background,
    padding: 10,
    gap: 5,
  },
  principalRequestCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.background,
    padding: 10,
    gap: 8,
  },
  principalRequestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  requestButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  principalApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.success + '66',
    backgroundColor: theme.success + '14',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  principalApproveText: {
    color: theme.success,
    fontSize: 12,
    fontWeight: '700',
  },
  principalRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.error + '66',
    backgroundColor: theme.error + '14',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  principalRejectText: {
    color: theme.error,
    fontSize: 12,
    fontWeight: '700',
  },
  requestListStatus: {
    color: theme.text,
    fontSize: 11,
    fontWeight: '700',
  },
  requestListBody: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  requestMetaText: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '92%',
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  modalScroll: {
    maxHeight: 520,
  },
  modalContent: {
    gap: 10,
    paddingBottom: 4,
  },
  modalFieldWrap: {
    gap: 6,
  },
  modalFieldLabel: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.background,
    color: theme.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalInputMultiline: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 2,
  },
  modalCancelButton: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.background,
  },
  modalCancelText: {
    color: theme.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitButton: {
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary,
  },
  modalSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
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
