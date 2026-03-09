/**
 * Teacher Classes Screen
 * View classes assigned to a specific teacher
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { removeTeacherFromSchool } from '@/lib/services/teacherRemovalService';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface ClassInfo {
  id: string;
  name: string;
  grade_level: string;
  room_number: string | null;
  max_capacity: number;
  current_enrollment: number;
  active: boolean;
}

interface TeacherInfo {
  id: string;
  name: string;
  email: string;
  teacherRecordId?: string | null;
  teacherUserId?: string | null;
}

export default function TeacherClassesScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { teacherId } = useLocalSearchParams<{ teacherId: string }>();

  const [teacherInfo, setTeacherInfo] = useState<TeacherInfo | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const orgId = profile?.organization_id || (profile as any)?.preschool_id;

  const fetchData = useCallback(async () => {
    if (!teacherId) return;

    try {
      const supabase = assertSupabase();

      // Fetch teacher info
      const { data: teacherData, error: teacherError } = await supabase
        .from('profiles')
        .select('id, auth_user_id, first_name, last_name, email')
        .or(`id.eq.${teacherId},auth_user_id.eq.${teacherId}`)
        .maybeSingle();

      if (teacherError) throw teacherError;
      if (!teacherData) throw new Error('Teacher not found');

      const { data: teacherRecord } = await supabase
        .from('teachers')
        .select('id, user_id, auth_user_id')
        .or(`user_id.eq.${teacherId},auth_user_id.eq.${teacherId}`)
        .maybeSingle();

      setTeacherInfo({
        id: teacherData.id,
        name: `${teacherData.first_name || ''} ${teacherData.last_name || ''}`.trim() || 'Unknown',
        email: teacherData.email,
        teacherRecordId: teacherRecord?.id || null,
        teacherUserId: teacherRecord?.auth_user_id || teacherRecord?.user_id || teacherData.auth_user_id || teacherData.id,
      });

      const teacherRefIds = Array.from(
        new Set([teacherData.id, teacherData.auth_user_id].filter((v): v is string => Boolean(v)))
      );

      // Fetch classes assigned to this teacher
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('*')
        .in('teacher_id', teacherRefIds)
        .order('name', { ascending: true });

      if (classesError) throw classesError;

      // Get student counts for each class
      const classIds = (classesData || []).map((c: any) => c.id);
      let enrollmentCounts: Record<string, number> = {};

      if (classIds.length > 0) {
        const { data: enrollments } = await supabase
          .from('students')
          .select('class_id')
          .in('class_id', classIds);

        (enrollments || []).forEach((e: any) => {
          enrollmentCounts[e.class_id] = (enrollmentCounts[e.class_id] || 0) + 1;
        });
      }

      const transformedClasses: ClassInfo[] = (classesData || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        grade_level: c.grade_level,
        room_number: c.room_number,
        max_capacity: c.max_capacity || 0,
        current_enrollment: enrollmentCounts[c.id] || 0,
        active: c.active,
      }));

      setClasses(transformedClasses);
    } catch (error: any) {
      console.error('Error fetching teacher classes:', error);
      showAlert({ title: 'Error', message: 'Failed to load teacher information', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teacherId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const navigateBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/screens/class-teacher-management');
    }
  };

  const handleViewClassStudents = (classId: string) => {
    router.push(`/screens/class-students?classId=${classId}` as any);
  };

  const handleEditClass = (classId: string) => {
    router.push(`/screens/edit-class?classId=${classId}` as any);
  };

  const handleRemoveTeacher = () => {
    if (!orgId) {
      showAlert({ title: 'Error', message: 'No school found for this account.', type: 'error' });
      return;
    }
    if (!teacherId) {
      showAlert({ title: 'Error', message: 'Missing teacher identifier.', type: 'error' });
      return;
    }
    if (!teacherInfo?.teacherRecordId) {
      showAlert({ title: 'Error', message: 'Missing teacher record.', type: 'error' });
      return;
    }

    showAlert({
      title: 'Archive Teacher',
      message: `Archive ${teacherInfo?.name || 'this teacher'} from your school? Their class history will be kept and their seat will be revoked.`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeTeacherFromSchool({
                teacherRecordId: teacherInfo.teacherRecordId,
                organizationId: orgId,
                teacherUserId: teacherInfo.teacherUserId || teacherId,
                reason: 'Archived via teacher classes screen',
              });
              showAlert({ title: 'Success', message: 'Teacher archived', type: 'success', buttons: [{ text: 'OK', onPress: navigateBack }] });
            } catch (error) {
              console.error('Error removing teacher:', error);
              showAlert({ title: 'Error', message: 'Failed to archive teacher', type: 'error' });
            }
          },
        },
      ],
    });
  };

  const getEnrollmentColor = (current: number, max: number) => {
    if (max === 0) return theme.textSecondary;
    const ratio = current / max;
    if (ratio >= 1) return '#ef4444';
    if (ratio >= 0.8) return '#f59e0b';
    return '#10b981';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Teacher Classes', headerShown: true }} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading teacher information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!teacherInfo) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Teacher Classes', headerShown: true }} />
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color={theme.error} />
          <Text style={styles.errorText}>Teacher not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: teacherInfo.name,
          headerShown: true,
          headerLeft: () => (
            <TouchableOpacity onPress={navigateBack} style={styles.headerButton}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Teacher Info Card */}
        <View style={styles.teacherCard}>
          <View style={styles.teacherAvatar}>
            <Text style={styles.avatarText}>
              {teacherInfo.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </Text>
          </View>
          <View style={styles.teacherDetails}>
            <Text style={styles.teacherName}>{teacherInfo.name}</Text>
            <Text style={styles.teacherEmail}>{teacherInfo.email}</Text>
            <Text style={styles.classCount}>
              {classes.length} {classes.length === 1 ? 'Class' : 'Classes'} Assigned
            </Text>
          </View>
          <TouchableOpacity style={styles.removeButton} onPress={handleRemoveTeacher}>
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>

        {/* Classes List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assigned Classes</Text>

          {classes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="school-outline" size={48} color={theme.textSecondary} />
              <Text style={styles.emptyText}>No classes assigned</Text>
              <Text style={styles.emptySubtext}>
                Assign classes to this teacher from the Class Management screen
              </Text>
            </View>
          ) : (
            classes.map((classInfo) => (
              <View key={classInfo.id} style={styles.classCard}>
                <View style={styles.classHeader}>
                  <View style={styles.classInfo}>
                    <Text style={styles.className}>{classInfo.name}</Text>
                    <Text style={styles.gradeLevel}>{classInfo.grade_level}</Text>
                    {classInfo.room_number && (
                      <Text style={styles.roomNumber}>Room {classInfo.room_number}</Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: classInfo.active ? '#10b981' : '#ef4444' },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {classInfo.active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>

                <View style={styles.enrollmentRow}>
                  <Text style={styles.enrollmentLabel}>Enrollment:</Text>
                  <Text
                    style={[
                      styles.enrollmentValue,
                      {
                        color: getEnrollmentColor(
                          classInfo.current_enrollment,
                          classInfo.max_capacity
                        ),
                      },
                    ]}
                  >
                    {classInfo.current_enrollment}/{classInfo.max_capacity}
                  </Text>
                </View>

                <View style={styles.classActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleViewClassStudents(classInfo.id)}
                  >
                    <Ionicons name="people" size={18} color={theme.primary} />
                    <Text style={[styles.actionButtonText, { color: theme.primary }]}>
                      View Students
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleEditClass(classInfo.id)}
                  >
                    <Ionicons name="create-outline" size={18} color={theme.textSecondary} />
                    <Text style={[styles.actionButtonText, { color: theme.textSecondary }]}>
                      Edit
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollView: {
      flex: 1,
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
      padding: 24,
    },
    errorText: {
      fontSize: 18,
      color: theme.error,
      marginTop: 16,
    },
    backButton: {
      marginTop: 24,
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: theme.primary,
      borderRadius: 8,
    },
    backButtonText: {
      color: '#fff',
      fontWeight: '600',
    },
    headerButton: {
      padding: 8,
    },
    teacherCard: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: 16,
      padding: 16,
      backgroundColor: theme.card,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    teacherAvatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: 24,
      fontWeight: '600',
      color: '#fff',
    },
    teacherDetails: {
      flex: 1,
      marginLeft: 16,
    },
    teacherName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
    },
    teacherEmail: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 2,
    },
    classCount: {
      fontSize: 14,
      color: theme.primary,
      marginTop: 8,
      fontWeight: '500',
    },
    removeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.error,
      borderRadius: 8,
      gap: 4,
    },
    removeButtonText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    section: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 16,
    },
    emptyState: {
      alignItems: 'center',
      padding: 32,
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
      marginTop: 16,
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 8,
      textAlign: 'center',
    },
    classCard: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    classHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    classInfo: {
      flex: 1,
    },
    className: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    gradeLevel: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 2,
    },
    roomNumber: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '500',
      color: '#fff',
    },
    enrollmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    enrollmentLabel: {
      fontSize: 14,
      color: theme.textSecondary,
      marginRight: 8,
    },
    enrollmentValue: {
      fontSize: 14,
      fontWeight: '600',
    },
    classActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 12,
      gap: 16,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: '500',
    },
  });
