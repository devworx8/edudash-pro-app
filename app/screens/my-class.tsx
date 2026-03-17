/**
 * My Class Screen (Teacher-specific view)
 * 
 * Displays the teacher's assigned class and their students.
 * Teachers can view students in their class, take attendance, and manage class activities.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const TAG = 'MyClass';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface ClassInfo {
  id: string;
  name: string;
  grade_level: string;
  max_capacity: number;
  room_number?: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  avatar_url?: string;
}

export default function MyClassScreen() {
  const { profile, user } = useAuth();
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClassIndex, setSelectedClassIndex] = useState(0);

  const organizationId = profile?.preschool_id || profile?.organization_id;
  const teacherProfileId = profile?.id || null;
  const teacherAuthId = user?.id || null;

  // Fetch all of teacher's assigned classes
  const { 
    data: myClasses, 
    isLoading: classLoading, 
    refetch: refetchClass,
    error: classError 
  } = useQuery<ClassInfo[]>({
    queryKey: ['my-classes', teacherProfileId, teacherAuthId, organizationId],
    queryFn: async () => {
      if ((!teacherProfileId && !teacherAuthId) || !organizationId) return [];
      
      logger.debug(TAG, 'Fetching classes for teacher:', teacherProfileId || teacherAuthId, 'org:', organizationId);

      const client = assertSupabase();
      let joinedClassIds: string[] = [];

      if (teacherProfileId) {
        const { data: classTeacherRows, error: classTeacherError } = await client
          .from('class_teachers')
          .select('class_id, role')
          .eq('teacher_id', teacherProfileId);

        if (classTeacherError) {
          console.warn('[MyClass] class_teachers lookup warning:', classTeacherError);
        }

        joinedClassIds = (classTeacherRows || []).map((row: { class_id: string }) => row.class_id);
      }

      const combinedById = new Map<string, ClassInfo>();
      if (joinedClassIds.length > 0) {
        const { data: joinedClasses, error: joinedError } = await client
          .from('classes')
          .select('id, name, grade_level, max_capacity, room_number')
          .in('id', joinedClassIds)
          .eq('preschool_id', organizationId)
          .eq('active', true)
          .order('name', { ascending: true });

        if (joinedError) {
          console.error('[MyClass] Error fetching joined classes:', joinedError);
          throw joinedError;
        }

        (joinedClasses || []).forEach((cls: ClassInfo) => combinedById.set(cls.id, cls));
      }

      const legacyTeacherIds = Array.from(new Set([teacherAuthId, teacherProfileId].filter(Boolean)));
      if (legacyTeacherIds.length > 0) {
        const { data: legacyClasses, error: legacyError } = await client
          .from('classes')
          .select('id, name, grade_level, max_capacity, room_number')
          .in('teacher_id', legacyTeacherIds)
          .eq('preschool_id', organizationId)
          .eq('active', true)
          .order('name', { ascending: true });

        if (legacyError) {
          console.warn('[MyClass] Legacy class lookup warning:', legacyError);
        }

        (legacyClasses || []).forEach((cls: ClassInfo) => {
          if (!combinedById.has(cls.id)) {
            combinedById.set(cls.id, cls);
          }
        });
      }

      const data = Array.from(combinedById.values()).sort((a, b) => a.name.localeCompare(b.name));

      logger.debug(TAG, 'Found classes:', data.length || 0);
      return data;
    },
    enabled: (!!teacherProfileId || !!teacherAuthId) && !!organizationId,
  });

  // Get currently selected class
  const myClass = myClasses && myClasses.length > 0 ? myClasses[selectedClassIndex] : null;

  // Fetch students in teacher's class
  const { 
    data: students, 
    isLoading: studentsLoading, 
    refetch: refetchStudents 
  } = useQuery<Student[]>({
    queryKey: ['my-class-students', myClass?.id],
    queryFn: async () => {
      if (!myClass?.id) return [];
      
      const { data, error } = await assertSupabase()
        .from('students')
        .select('id, first_name, last_name, grade, avatar_url')
        .eq('class_id', myClass.id)
        .eq('is_active', true)
        .order('first_name', { ascending: true });

      if (error) {
        throw error;
      }
      
      // Deduplicate by student ID (safeguard against data issues)
      const seenIds = new Set<string>();
      const uniqueStudents = (data || []).filter((s: { id: string }) => {
        if (seenIds.has(s.id)) return false;
        seenIds.add(s.id);
        return true;
      });
      
      return uniqueStudents;
    },
    enabled: !!myClass?.id,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchClass(), refetchStudents()]);
    setRefreshing(false);
  }, [refetchClass, refetchStudents]);

  const isLoading = classLoading || studentsLoading;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#0a0a0f' : '#f8fafc',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: insets.bottom + 100,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 24,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#0f172a',
    },
    classSelector: {
      marginBottom: 16,
    },
    classSelectorItem: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
      marginRight: 8,
    },
    classSelectorItemActive: {
      backgroundColor: theme.primary,
    },
    classSelectorText: {
      fontSize: 14,
      fontWeight: '500',
      color: isDark ? '#94a3b8' : '#64748b',
    },
    classSelectorTextActive: {
      color: '#ffffff',
    },
    classCard: {
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    classHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    classIconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.primary + '20',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    classInfo: {
      flex: 1,
    },
    className: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#0f172a',
      marginBottom: 4,
    },
    classGrade: {
      fontSize: 14,
      color: isDark ? '#94a3b8' : '#64748b',
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      borderTopWidth: 1,
      borderTopColor: isDark ? '#334155' : '#e2e8f0',
      paddingTop: 16,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.primary,
    },
    statLabel: {
      fontSize: 12,
      color: isDark ? '#94a3b8' : '#64748b',
      marginTop: 4,
    },
    quickActions: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    quickActionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
      borderRadius: 12,
      padding: 14,
      gap: 8,
    },
    quickActionText: {
      color: '#ffffff',
      fontWeight: '600',
      fontSize: 14,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#0f172a',
      marginBottom: 16,
    },
    studentsGrid: {
      gap: 12,
    },
    studentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    studentAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? '#334155' : '#e2e8f0',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    studentInitials: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.primary,
    },
    studentInfo: {
      flex: 1,
    },
    studentName: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#0f172a',
    },
    studentGrade: {
      fontSize: 13,
      color: isDark ? '#94a3b8' : '#64748b',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#0f172a',
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: isDark ? '#94a3b8' : '#64748b',
      textAlign: 'center',
      maxWidth: 280,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  if (isLoading && !refreshing) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginTop: 12 }}>
            {t('common.loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!myClass) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ padding: 16 }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={isDark ? '#ffffff' : '#0f172a'} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('teacher.my_class', { defaultValue: 'My Class' })}</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="school-outline" size={40} color={isDark ? '#94a3b8' : '#64748b'} />
          </View>
          <Text style={styles.emptyTitle}>
            {t('teacher.no_class_assigned', { defaultValue: 'No Class Assigned' })}
          </Text>
          <Text style={styles.emptyText}>
            {t('teacher.no_class_description', { defaultValue: 'You haven\'t been assigned to a class yet. Please contact your principal for class assignment.' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={isDark ? '#ffffff' : '#0f172a'} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {myClasses && myClasses.length > 1 
              ? t('teacher.my_classes', { defaultValue: 'My Classes' })
              : t('teacher.my_class', { defaultValue: 'My Class' })}
          </Text>
        </View>

        {/* Class Selector (if multiple classes) */}
        {myClasses && myClasses.length > 1 && (
          <View style={styles.classSelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {myClasses.map((cls, index) => (
                <TouchableOpacity
                  key={cls.id}
                  style={[
                    styles.classSelectorItem,
                    selectedClassIndex === index && styles.classSelectorItemActive,
                  ]}
                  onPress={() => setSelectedClassIndex(index)}
                >
                  <Text style={[
                    styles.classSelectorText,
                    selectedClassIndex === index && styles.classSelectorTextActive,
                  ]}>
                    {cls.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Class Info Card */}
        <View style={styles.classCard}>
          <View style={styles.classHeader}>
            <View style={styles.classIconContainer}>
              <Ionicons name="school" size={28} color={theme.primary} />
            </View>
            <View style={styles.classInfo}>
              <Text style={styles.className}>{myClass.name}</Text>
              <Text style={styles.classGrade}>
                {myClass.grade_level}{myClass.room_number ? ` • Room ${myClass.room_number}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{students?.length || 0}</Text>
              <Text style={styles.statLabel}>{t('teacher.students', { defaultValue: 'Students' })}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myClass.max_capacity}</Text>
              <Text style={styles.statLabel}>{t('teacher.capacity', { defaultValue: 'Capacity' })}</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => router.push('/screens/attendance')}
          >
            <Ionicons name="checkmark-done" size={20} color="#ffffff" />
            <Text style={styles.quickActionText}>
              {t('teacher.take_attendance', { defaultValue: 'Take Attendance' })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.quickActionButton, { backgroundColor: '#ec4899' }]}
            onPress={() => router.push('/screens/start-live-lesson')}
          >
            <Ionicons name="videocam" size={20} color="#ffffff" />
            <Text style={styles.quickActionText}>
              {t('teacher.start_lesson', { defaultValue: 'Start Lesson' })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Students Section */}
        <Text style={styles.sectionTitle}>
          {t('teacher.students_in_class', { defaultValue: 'Students in My Class' })} ({students?.length || 0})
        </Text>
        
        {students && students.length > 0 ? (
          <View style={styles.studentsGrid}>
            {students.map((student) => (
              <TouchableOpacity
                key={student.id}
                style={styles.studentCard}
                onPress={() => router.push({ pathname: '/screens/student-profile', params: { id: student.id } } as any)}
                activeOpacity={0.7}
              >
                <View style={styles.studentAvatar}>
                  <Text style={styles.studentInitials}>
                    {getInitials(student.first_name, student.last_name)}
                  </Text>
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>
                    {student.first_name} {student.last_name}
                  </Text>
                  {student.grade && (
                    <Text style={styles.studentGrade}>{student.grade}</Text>
                  )}
                </View>
                <Ionicons 
                  name="chevron-forward" 
                  size={20} 
                  color={isDark ? '#64748b' : '#94a3b8'} 
                />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={40} color={isDark ? '#94a3b8' : '#64748b'} />
            </View>
            <Text style={styles.emptyTitle}>
              {t('teacher.no_students', { defaultValue: 'No Students Yet' })}
            </Text>
            <Text style={styles.emptyText}>
              {t('teacher.no_students_description', { defaultValue: 'No students have been added to your class yet.' })}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
