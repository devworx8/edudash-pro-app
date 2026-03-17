/**
 * Class & Teacher Management Screen (Refactored)
 * Principal hub for managing classes and teachers
 *
 * WARP.md compliant: ~260 lines (target ≤500)
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  useClassTeacherManagement,
  ClassCard,
  ClassesEmptyState,
  TeacherCard,
  TeachersEmptyState,
  ClassModal,
  TeacherAssignmentModal,
} from '@/components/class-teacher-management';

export default function ClassTeacherManagementScreen() {
  const { theme, isDark } = useTheme();
  const { user, profile, profileLoading, loading: authLoading } = useAuth();
  const { t } = useTranslation();

  // Handle both organization_id (new RBAC) and preschool_id (legacy) fields
  const orgId = profile?.organization_id || (profile as any)?.preschool_id;
  const isStillLoading = authLoading || profileLoading;

  // RBAC Check: Only principals and admins can access this screen
  const allowedRoles = ['principal', 'admin', 'principal_admin', 'super_admin'];
  const userRole = profile?.role;
  const hasAccess = userRole && allowedRoles.includes(userRole);

  const {
    classes,
    teachers,
    loading,
    refreshing,
    showClassModal,
    showTeacherAssignment,
    selectedClass,
    assignmentTeacherId,
    assignmentRole,
    activeTab,
    classForm,
    roleUpdateTeacherId,
    activeTeachers,
    handleCreateClass,
    handleAssignTeacher,
    handleRemoveTeacher,
    handleDeleteTeacher,
    handleSetTeacherRole,
    handleToggleClassStatus,
    setShowClassModal,
    setShowTeacherAssignment,
    setSelectedClass,
    setAssignmentTeacherId,
    setAssignmentRole,
    setActiveTab,
    setClassForm,
    onRefresh,
    AlertModalComponent,
  } = useClassTeacherManagement({ orgId, userId: user?.id });

  const navigateBack = (fallback: string) => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace(fallback as any);
    } catch {
      router.replace(fallback as any);
    }
  };

  const navigateTo = {
    classStudents: (id: string) => router.push(`/screens/class-students?classId=${id}` as any),
    editClass: (id: string) => router.push(`/screens/edit-class?classId=${id}` as any),
    teacherClasses: (id: string) => router.push(`/screens/teacher-classes?teacherId=${id}` as any),
    editTeacher: (id: string) => router.push(`/screens/edit-teacher?teacherId=${id}` as any),
    addTeacher: () => router.push('/screens/hiring-hub' as any),
  };

  const styles = getStyles(theme);

  // Loading states
  if (isStillLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <Ionicons name="school-outline" size={48} color={theme.textSecondary} />
          <Text style={styles.loadingText}>
            {t('dashboard.loading_profile', { defaultValue: 'Loading your profile...' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Access Control: Redirect teachers to their dashboard
  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <Ionicons name="lock-closed-outline" size={48} color={theme.error} />
          <Text style={[styles.loadingText, { color: theme.error, marginTop: 16 }]}>
            Access Denied
          </Text>
          <Text style={[styles.loadingText, { fontSize: 14, marginTop: 8 }]}>
            Only principals and admins can manage classes and teachers
          </Text>
          <TouchableOpacity 
            style={{
              marginTop: 24,
              paddingHorizontal: 24,
              paddingVertical: 12,
              backgroundColor: theme.primary,
              borderRadius: 8,
            }}
            onPress={() => router.back()}
          >
            <Text style={{ color: theme.onPrimary, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!orgId) {
    if (!user) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
          <View style={styles.loadingContainer}>
            <Ionicons name="school-outline" size={48} color={theme.textSecondary} />
            <Text style={styles.loadingText}>
              {t('dashboard.loading_profile', { defaultValue: 'Loading your profile...' })}
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <Ionicons name="school-outline" size={48} color={theme.textSecondary} />
          <Text style={styles.loadingText}>
            {t('dashboard.no_school_found_redirect', {
              defaultValue: 'No school found. Redirecting to setup...',
            })}
          </Text>
          <TouchableOpacity onPress={() => router.replace('/screens/principal-onboarding' as any)}>
            <Text style={[styles.loadingText, { color: theme.primary, textDecorationLine: 'underline', marginTop: 12 }]}>
              {t('common.go_now', { defaultValue: 'Go Now' })}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <Ionicons name="school-outline" size={48} color={theme.textSecondary} />
          <Text style={styles.loadingText}>
            {t('class_management.loading', { defaultValue: 'Loading class and teacher data...' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateBack('/screens/principal-dashboard')}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Class & Teacher Management</Text>
        <TouchableOpacity onPress={() => setShowClassModal(true)}>
          <Ionicons name="add" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'classes' && styles.activeTab]}
          onPress={() => setActiveTab('classes')}
        >
          <Text style={[styles.tabText, activeTab === 'classes' && styles.activeTabText]}>
            Classes ({classes.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'teachers' && styles.activeTab]}
          onPress={() => setActiveTab('teachers')}
        >
          <Text style={[styles.tabText, activeTab === 'teachers' && styles.activeTabText]}>
            Teachers ({activeTeachers.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.content}>
          {activeTab === 'classes' ? (
            classes.length === 0 ? (
              <ClassesEmptyState theme={theme} onCreateClass={() => setShowClassModal(true)} />
            ) : (
              classes.map((classInfo) => (
                <ClassCard
                  key={classInfo.id}
                  classInfo={classInfo}
                  theme={theme}
                  onToggleStatus={handleToggleClassStatus}
                  onRemoveTeacher={handleRemoveTeacher}
                  onAssignTeacher={(cls) => {
                    setSelectedClass(cls);
                    setAssignmentTeacherId('');
                    setAssignmentRole(
                      cls.teacher_assignments.some((assignment) => assignment.role === 'lead') ? 'assistant' : 'lead'
                    );
                    setShowTeacherAssignment(true);
                  }}
                  onViewStudents={navigateTo.classStudents}
                  onEditClass={navigateTo.editClass}
                />
              ))
            )
          ) : teachers.length === 0 ? (
            <TeachersEmptyState theme={theme} onAddTeacher={navigateTo.addTeacher} />
          ) : (
            teachers.map((teacher) => (
              <TeacherCard
                key={teacher.id}
                teacher={teacher}
                theme={theme}
                onViewClasses={navigateTo.teacherClasses}
                onEditTeacher={navigateTo.editTeacher}
                onSetRole={handleSetTeacherRole}
                roleUpdateTeacherId={roleUpdateTeacherId}
                onDeleteTeacher={handleDeleteTeacher}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <ClassModal
        visible={showClassModal}
        theme={theme}
        classForm={classForm}
        activeTeachers={activeTeachers}
        onClose={() => setShowClassModal(false)}
        onSave={handleCreateClass}
        onFormChange={setClassForm}
      />

      <TeacherAssignmentModal
        visible={showTeacherAssignment}
        theme={theme}
        selectedClass={selectedClass}
        teacherId={assignmentTeacherId}
        role={assignmentRole}
        hasLead={Boolean(selectedClass?.teacher_assignments.some((assignment) => assignment.role === 'lead'))}
        activeTeachers={activeTeachers}
        onClose={() => setShowTeacherAssignment(false)}
        onAssign={handleAssignTeacher}
        onTeacherChange={setAssignmentTeacherId}
        onRoleChange={setAssignmentRole}
      />
      <AlertModalComponent />
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
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
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 16,
      paddingHorizontal: 24,
      alignItems: 'center',
    },
    activeTab: {
      borderBottomWidth: 2,
      borderBottomColor: theme.primary,
    },
    tabText: {
      fontSize: 16,
      color: theme.textSecondary,
    },
    activeTabText: {
      color: theme.primary,
      fontWeight: '600',
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 16,
    },
  });
