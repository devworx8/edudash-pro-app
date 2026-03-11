/**
 * TeacherProfileView Component
 * 
 * Displays detailed teacher profile with documents and actions.
 * Extracted from app/screens/teacher-management.tsx per WARP.md standards.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { TeacherDocumentsService, TeacherDocument } from '@/lib/services/TeacherDocumentsService';
import { EditTeacherModal, type TeacherUpdatePayload } from './EditTeacherModal';
import type { Teacher } from '@/types/teacher-management';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface TeacherProfileViewProps {
  teacher: Teacher;
  teacherDocsMap: Record<string, TeacherDocument | undefined>;
  isUploadingDoc: boolean;
  selectedTeacherHasSeat: boolean;
  shouldDisableAssignment: boolean;
  isAssigning: boolean;
  isRevoking: boolean;
  theme?: ThemeColors;
  onBack: () => void;
  onMessage: () => void;
  onAssignSeat: (teacherUserId: string, teacherName: string) => void;
  onRevokeSeat: (teacherUserId: string, teacherName: string) => void;
  onAttachDocument: () => void;
  onEditTeacher?: (teacherId: string, payload: TeacherUpdatePayload) => Promise<void>;
  onDeleteTeacher?: (teacher: Teacher) => void;
}

export function TeacherProfileView({
  teacher,
  teacherDocsMap,
  isUploadingDoc,
  selectedTeacherHasSeat,
  shouldDisableAssignment,
  isAssigning,
  isRevoking,
  theme,
  onBack,
  onMessage,
  onAssignSeat,
  onRevokeSeat,
  onAttachDocument,
  onEditTeacher,
  onDeleteTeacher,
}: TeacherProfileViewProps) {
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [editModalVisible, setEditModalVisible] = React.useState(false);
  const fullName = `${teacher.firstName} ${teacher.lastName}`;

  const handleOpenDocument = async (docKey: string) => {
    const existing = teacherDocsMap[docKey];
    if (!existing) {
      Alert.alert('No File', 'No file is currently attached for this document.');
      return;
    }
    try {
      const url = await TeacherDocumentsService.getSignedUrl(existing.file_path);
      if (!url) {
        Alert.alert('Error', 'Failed to open document.');
        return;
      }
      // Prefer in-app browser when available
      if (WebBrowser && WebBrowser.openBrowserAsync) {
        await WebBrowser.openBrowserAsync(url);
      } else {
        await Linking.openURL(url);
      }
    } catch (_e) {
      Alert.alert('Error', 'Could not open document.');
    }
  };

  const documentItems = [
    { key: 'cv', label: 'CV', complete: !!teacher.documents.cv },
    { key: 'qualifications', label: 'Qualifications', complete: !!teacher.documents.qualifications },
    { key: 'id_copy', label: 'ID Copy', complete: !!teacher.documents.id_copy },
    { key: 'contracts', label: 'Contracts', complete: !!teacher.documents.contracts },
  ];

  const completedDocs = documentItems.filter((d) => d.complete || teacherDocsMap[d.key]).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={theme?.text || '#333'} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{fullName}</Text>
          <Text style={styles.headerSubtitle}>{teacher.email}</Text>
        </View>
        {onEditTeacher && (
          <TouchableOpacity onPress={() => setEditModalVisible(true)} style={styles.editButton}>
            <Ionicons name="create-outline" size={20} color={theme?.primary || '#6366f1'} />
          </TouchableOpacity>
        )}
      </View>

      {/* Profile Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile</Text>
        <Text style={styles.cardText}>Phone: {teacher.phone || '—'}</Text>
        <Text style={styles.cardText}>Employee ID: {teacher.employeeId || '—'}</Text>
        <Text style={styles.cardText}>Status: {teacher.status}</Text>
        <Text style={styles.cardText}>Contract: {teacher.contractType}</Text>
        <Text style={styles.cardText}>Hire Date: {teacher.hireDate || '—'}</Text>
        {!!teacher.positionTitle && (
          <Text style={styles.cardText}>Position: {teacher.positionTitle}</Text>
        )}
        {!!teacher.department && (
          <Text style={styles.cardText}>Department: {teacher.department}</Text>
        )}
        {!!teacher.contractEndDate && (
          <Text style={styles.cardText}>Contract End: {teacher.contractEndDate}</Text>
        )}
        {!!teacher.gender && (
          <Text style={styles.cardText}>Gender: {teacher.gender}</Text>
        )}
        {!!teacher.idNumber && (
          <Text style={styles.cardText}>ID Number: {teacher.idNumber}</Text>
        )}
        {!!teacher.address && (
          <Text style={styles.cardText}>Address: {teacher.address}</Text>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionButton, styles.messageButton]} onPress={onMessage}>
            <Ionicons name="chatbubbles" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>
              {selectedTeacherHasSeat ? 'Message (Has Seat)' : 'Message (No Seat)'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.referenceButton]}
            onPress={() =>
              router.push({
                pathname: '/screens/teacher-reference-create',
                params: { teacherUserId: teacher.teacherUserId, teacherName: fullName },
              })
            }
          >
            <Ionicons name="star" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Leave Reference</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.seatActionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.assignButton]}
            onPress={() => onAssignSeat(teacher.teacherUserId, fullName)}
            disabled={isAssigning}
          >
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Assign Seat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.revokeButton]}
            onPress={() => onRevokeSeat(teacher.teacherUserId, fullName)}
            disabled={isRevoking}
          >
            <Ionicons name="remove-circle" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Revoke Seat</Text>
          </TouchableOpacity>
        </View>

        {onDeleteTeacher && (
          <View style={styles.dangerZone}>
            <View style={styles.dangerZoneHeader}>
              <Ionicons name="warning-outline" size={16} color="#dc2626" />
              <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
            </View>
            <Text style={styles.dangerZoneDesc}>
              This will permanently remove {teacher.firstName || 'this teacher'} from your school, unassign their classes, and revoke their seat.
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => onDeleteTeacher(teacher)}
            >
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
              <Text style={styles.deleteButtonText}>Remove Teacher from School</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Documents Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardTitle}>Documents</Text>
            <Text style={styles.cardSubtitle}>{completedDocs}/4 complete</Text>
          </View>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={onAttachDocument}
            disabled={isUploadingDoc}
          >
            <Ionicons name="cloud-upload" size={16} color="#fff" />
            <Text style={styles.attachButtonText}>{isUploadingDoc ? 'Uploading...' : 'Attach'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.documentGrid}>
          {documentItems.map((doc) => (
            <TouchableOpacity
              key={doc.key}
              style={[styles.docItem, (doc.complete || teacherDocsMap[doc.key]) && styles.docComplete]}
              onPress={() => handleOpenDocument(doc.key)}
            >
              <Ionicons
                name={doc.complete || teacherDocsMap[doc.key] ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={doc.complete || teacherDocsMap[doc.key] ? '#065f46' : '#6b7280'}
              />
              <Text
                style={[
                  styles.docText,
                  (doc.complete || teacherDocsMap[doc.key]) && styles.docCompleteText,
                ]}
              >
                {doc.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Classes Card - Shows assigned classes with management option */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardTitle}>Classes</Text>
            <Text style={styles.cardSubtitle}>
              {teacher.classes.length > 0 
                ? `${teacher.classes.length} class${teacher.classes.length > 1 ? 'es' : ''} assigned` 
                : 'No classes assigned'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.manageClassesButton}
            onPress={() => router.push('/screens/class-teacher-management' as any)}
          >
            <Ionicons name="settings" size={16} color="#fff" />
            <Text style={styles.manageClassesText}>Manage</Text>
          </TouchableOpacity>
        </View>
        {teacher.classes.length > 0 ? (
          <View style={styles.classesGrid}>
            {teacher.classes.map((className, index) => (
              <View key={index} style={styles.classChip}>
                <Ionicons name="school" size={14} color={theme?.primary || '#6366f1'} />
                <Text style={styles.classChipText}>{className}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyClasses}>
            <Ionicons name="school-outline" size={32} color={theme?.textSecondary || '#9ca3af'} />
            <Text style={styles.emptyClassesText}>No classes assigned yet</Text>
            <TouchableOpacity
              style={styles.assignClassButton}
              onPress={() => router.push('/screens/class-teacher-management' as any)}
            >
              <Text style={styles.assignClassButtonText}>Go to Class Management</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.studentsInfo}>
          <Ionicons name="people" size={16} color={theme?.textSecondary || '#6b7280'} />
          <Text style={styles.studentsInfoText}>
            {teacher.studentCount || 0} student{(teacher.studentCount || 0) !== 1 ? 's' : ''} total
          </Text>
        </View>
      </View>

      {/* Performance Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Performance</Text>
        <View style={styles.performanceRow}>
          <Text style={styles.performanceLabel}>Rating:</Text>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>{teacher.performance.rating}/5.0</Text>
          </View>
        </View>
        <Text style={styles.cardText}>Last Review: {teacher.performance.lastReviewDate}</Text>
        {teacher.performance.strengths.length > 0 && (
          <>
            <Text style={styles.listLabel}>Strengths:</Text>
            <Text style={styles.listText}>{teacher.performance.strengths.join(', ')}</Text>
          </>
        )}
        {teacher.performance.goals.length > 0 && (
          <>
            <Text style={styles.listLabel}>Goals:</Text>
            <Text style={styles.listText}>{teacher.performance.goals.join(', ')}</Text>
          </>
        )}
      </View>

      {/* Attendance Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendance</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{teacher.attendance.daysPresent}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{teacher.attendance.daysAbsent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{teacher.attendance.lateArrivals}</Text>
            <Text style={styles.statLabel}>Late</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{teacher.attendance.leaveBalance}</Text>
            <Text style={styles.statLabel}>Leave Balance</Text>
          </View>
        </View>
      </View>

      {/* Workload Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Workload</Text>
        <Text style={styles.cardText}>Teaching Hours: {teacher.workload.teachingHours}/week</Text>
        {teacher.workload.adminDuties.length > 0 && (
          <>
            <Text style={styles.listLabel}>Admin Duties:</Text>
            <Text style={styles.listText}>{teacher.workload.adminDuties.join(', ')}</Text>
          </>
        )}
        {teacher.workload.extraCurricular.length > 0 && (
          <>
            <Text style={styles.listLabel}>Extra-curricular:</Text>
            <Text style={styles.listText}>{teacher.workload.extraCurricular.join(', ')}</Text>
          </>
        )}
      </View>

      {/* Emergency Contact Card */}
      {(teacher.emergencyContact?.name || teacher.emergencyContact?.phone) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Emergency Contact</Text>
          {!!teacher.emergencyContact.name && (
            <Text style={styles.cardText}>Name: {teacher.emergencyContact.name}</Text>
          )}
          {!!teacher.emergencyContact.phone && (
            <Text style={styles.cardText}>Phone: {teacher.emergencyContact.phone}</Text>
          )}
          {!!teacher.emergencyContact.relationship && (
            <Text style={styles.cardText}>Relationship: {teacher.emergencyContact.relationship}</Text>
          )}
        </View>
      )}

      {/* Admin Notes Card */}
      {!!teacher.notes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Admin Notes</Text>
          <Text style={styles.cardText}>{teacher.notes}</Text>
        </View>
      )}

      {/* Edit Modal */}
      {onEditTeacher && (
        <EditTeacherModal
          visible={editModalVisible}
          teacher={teacher}
          onClose={() => setEditModalVisible(false)}
          onSave={onEditTeacher}
        />
      )}
    </ScrollView>
  );
}

const createStyles = (theme?: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.background || '#f8fafc',
    },
    contentContainer: {
      paddingBottom: 100,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: theme?.surface || 'white',
      borderBottomWidth: 1,
      borderBottomColor: theme?.border || '#f3f4f6',
    },
    backButton: {
      paddingRight: 12,
      paddingVertical: 4,
    },
    editButton: {
      padding: 8,
      marginLeft: 8,
    },
    headerInfo: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme?.text || '#333',
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme?.textSecondary || '#6b7280',
      marginTop: 2,
    },
    card: {
      backgroundColor: theme?.cardBackground || 'white',
      borderRadius: 16,
      padding: 20,
      marginHorizontal: 16,
      marginTop: 12,
      shadowColor: theme?.shadow || '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
      borderWidth: 1,
      borderColor: theme?.border || '#f3f4f6',
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    cardHeaderInfo: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme?.text || '#111827',
      marginBottom: 8,
    },
    cardSubtitle: {
      fontSize: 13,
      color: theme?.textSecondary || '#6b7280',
    },
    cardText: {
      fontSize: 14,
      color: theme?.textSecondary || '#6b7280',
      marginBottom: 4,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    seatActionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    removeRow: {
      marginTop: 8,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      gap: 6,
    },
    messageButton: {
      backgroundColor: '#2563eb',
    },
    referenceButton: {
      backgroundColor: '#f59e0b',
    },
    assignButton: {
      backgroundColor: '#059669',
    },
    revokeButton: {
      backgroundColor: '#dc2626',
    },
    // Danger Zone
    dangerZone: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: 'rgba(220, 38, 38, 0.2)',
    },
    dangerZoneHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    dangerZoneTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: '#dc2626',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    dangerZoneDesc: {
      fontSize: 12,
      color: theme?.textSecondary || '#6b7280',
      lineHeight: 17,
      marginBottom: 10,
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#dc2626',
      borderStyle: 'dashed',
      backgroundColor: 'rgba(220, 38, 38, 0.06)',
    },
    deleteButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#dc2626',
    },
    actionButtonText: {
      color: 'white',
      fontSize: 13,
      fontWeight: '700',
    },
    attachButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#2563eb',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      gap: 6,
    },
    attachButtonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 13,
    },
    documentGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    docItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme?.surfaceVariant || '#f9fafb',
      minWidth: '45%',
      flex: 1,
    },
    docComplete: {
      backgroundColor: '#d1fae5',
    },
    docText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme?.textSecondary || '#6b7280',
      marginLeft: 6,
    },
    docCompleteText: {
      color: '#065f46',
    },
    performanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    performanceLabel: {
      fontSize: 14,
      color: theme?.textSecondary || '#6b7280',
      marginRight: 8,
    },
    ratingBadge: {
      backgroundColor: theme?.primary + '15' || '#dbeafe',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    ratingText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme?.primary || '#007AFF',
    },
    listLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme?.text || '#333',
      marginTop: 8,
      marginBottom: 2,
    },
    listText: {
      fontSize: 13,
      color: theme?.textSecondary || '#6b7280',
      lineHeight: 18,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 18,
      fontWeight: '700',
      color: theme?.text || '#111827',
    },
    statLabel: {
      fontSize: 11,
      color: theme?.textSecondary || '#6b7280',
      marginTop: 2,
    },
    // Classes card styles
    manageClassesButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.primary || '#6366f1',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      gap: 4,
    },
    manageClassesText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    classesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    classChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.surfaceVariant || '#f3f4f6',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 6,
    },
    classChipText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme?.text || '#374151',
    },
    emptyClasses: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    emptyClassesText: {
      fontSize: 13,
      color: theme?.textSecondary || '#9ca3af',
      marginTop: 8,
    },
    assignClassButton: {
      marginTop: 12,
      backgroundColor: theme?.primary || '#6366f1',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    assignClassButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
    },
    studentsInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme?.border || '#e5e7eb',
    },
    studentsInfoText: {
      fontSize: 13,
      color: theme?.textSecondary || '#6b7280',
    },
  });

export default TeacherProfileView;
