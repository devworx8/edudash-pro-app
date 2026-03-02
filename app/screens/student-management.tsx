/**
 * Comprehensive Student Management System
 * Age-appropriate for preschools vs K-12 schools
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, RefreshControl, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import {
  useStudentManagement,
  getStudentInitials,
  formatAge,
  getAgeGroupColor,
  getSchoolTypeDisplay,
} from '@/hooks/student-management';
import { getFeatureFlagsSync } from '@/lib/featureFlags';

const toNonEmptyText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

export default function StudentManagementScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const lifecycleEnabled = useMemo(
    () => getFeatureFlagsSync().learner_activity_lifecycle_v1 !== false,
    []
  );
  const { showAlert, alertProps } = useAlertModal();
  const showAlertLegacy = React.useCallback((
    title: string,
    message: string,
    type?: 'success' | 'error' | 'warning' | 'info',
    buttons?: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }>,
  ) => {
    showAlert({ title, message, type, buttons });
  }, [showAlert]);

  const {
    user,
    orgId,
    isStillLoading,
    filteredStudents,
    students,
    schoolInfo,
    classes,
    ageGroupStats,
    loading,
    refreshing,
    showFilters,
    setShowFilters,
    autoAssigning,
    filters,
    setFilters,
    onRefresh,
    handlePrintIdCards,
    handleAutoAssignByDob,
    handleStudentPress,
    handleAddStudent,
  } = useStudentManagement({ showAlert: showAlertLegacy });

  // ---------- Early returns ----------

  if (isStillLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>{t('dashboard.loading_profile', { defaultValue: 'Loading your profile...' })}</Text>
        </View>
      </View>
    );
  }

  if (!orgId) {
    if (!user) {
      return (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={styles.loadingText}>{t('dashboard.loading_profile', { defaultValue: 'Loading your profile...' })}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
          <Text style={styles.loadingText}>{t('dashboard.no_school_found_redirect', { defaultValue: 'No school found. Redirecting to setup...' })}</Text>
          <TouchableOpacity onPress={() => {
            try { router.replace('/screens/principal-onboarding'); } catch { /* non-fatal */ }
          }}>
            <Text style={[styles.loadingText, { color: theme.primary, textDecorationLine: 'underline', marginTop: 12 }]}>{t('common.go_now', { defaultValue: 'Go Now' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
          <Text style={styles.loadingText}>{t('student_management.loading', { defaultValue: 'Loading students...' })}</Text>
        </View>
      </View>
    );
  }

  // ---------- Main render ----------

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{t('student_management.title', { defaultValue: 'Student Management' })}</Text>
            <Text style={styles.headerSubtitle}>
              {schoolInfo?.name} • {getSchoolTypeDisplay(schoolInfo?.school_type || 'preschool')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setShowFilters(true)} style={styles.filterButton}>
            <Ionicons name="filter" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{filteredStudents.length}</Text>
            <Text style={styles.statLabel}>{t('student_management.total_students', { defaultValue: 'Total Students' })}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{Object.keys(ageGroupStats).length}</Text>
            <Text style={styles.statLabel}>{t('student_management.age_groups', { defaultValue: 'Age Groups' })}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{classes.length}</Text>
            <Text style={styles.statLabel}>{t('student_management.classes', { defaultValue: 'Classes' })}</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('student_management.search_placeholder', { defaultValue: 'Search students...' })}
            placeholderTextColor={theme.textSecondary}
            value={filters.searchTerm}
            onChangeText={(text) => setFilters({ ...filters, searchTerm: text })}
          />
          {filters.searchTerm ? (
            <TouchableOpacity onPress={() => setFilters({ ...filters, searchTerm: '' })} style={styles.searchIcon}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} style={styles.searchIcon} />
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={[styles.autoAssignButton, autoAssigning ? styles.autoAssignButtonDisabled : null]}
          onPress={handleAutoAssignByDob}
          disabled={autoAssigning}
        >
          <Ionicons name="sparkles-outline" size={16} color={theme.onPrimary} style={styles.autoAssignIcon} />
          <Text style={styles.autoAssignButtonText}>
            {autoAssigning ? 'Assigning...' : 'Auto-assign DOB'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.printCardsButton} onPress={handlePrintIdCards}>
          <Ionicons name="print-outline" size={16} color={theme.text} style={styles.autoAssignIcon} />
          <Text style={styles.printCardsButtonText}>Print ID Cards</Text>
        </TouchableOpacity>
        {lifecycleEnabled ? (
          <TouchableOpacity
            style={styles.lifecycleButton}
            onPress={() => router.push('/screens/principal-learner-activity-control')}
          >
            <Ionicons name="pulse-outline" size={16} color={theme.primary} style={styles.autoAssignIcon} />
            <Text style={styles.lifecycleButtonText}>Lifecycle</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Age Group Overview for Preschools */}
      {schoolInfo?.school_type === 'preschool' && (
        <View style={styles.ageGroupOverview}>
          <View style={styles.ageGroupSectionHeader}>
            <Text style={styles.sectionTitle}>Age Group Distribution</Text>
            <TouchableOpacity
              onPress={() => router.push('/screens/class-teacher-management')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.manageAgeGroupsLink}>Manage</Text>
            </TouchableOpacity>
          </View>
          {Object.keys(ageGroupStats).length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.ageGroupsRow}>
              {Object.entries(ageGroupStats).map(([groupName, count]) => (
                <TouchableOpacity
                  key={groupName}
                  style={[
                    styles.ageGroupChip,
                    { backgroundColor: getAgeGroupColor(groupName, schoolInfo.school_type) + '20' },
                    { borderColor: getAgeGroupColor(groupName, schoolInfo.school_type) },
                  ]}
                  onPress={() => {
                    const newFilter = filters.ageGroup === groupName ? '' : groupName;
                    setFilters({ ...filters, ageGroup: newFilter });
                  }}
                >
                  <Text style={[styles.ageGroupName, { color: getAgeGroupColor(groupName, schoolInfo.school_type) }]}>
                    {groupName}
                  </Text>
                  <Text style={styles.ageGroupCount}>{count}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          ) : (
            <Text style={styles.ageGroupEmptyHint}>
              Configure classes or age groups under Manage to see distribution.
            </Text>
          )}
        </View>
      )}

      {/* Students List */}
      <ScrollView
        style={styles.studentsList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredStudents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>
              {students.length === 0 ? 'No Students Enrolled' : 'No Students Match Filters'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {students.length === 0
                ? `Add your first student to this ${getSchoolTypeDisplay(schoolInfo?.school_type || 'preschool').toLowerCase()}`
                : 'Try adjusting your search or filter criteria'}
            </Text>
            {students.length === 0 && (
              <TouchableOpacity style={styles.addButton} onPress={handleAddStudent}>
                <Ionicons name="add" size={20} color="white" />
                <Text style={styles.addButtonText}>Add Student</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.studentsGrid}>
            {filteredStudents.map((student) => {
              const statusKey = String(student.status || 'active').toLowerCase();
              const ageGroupName = toNonEmptyText(student.age_group_name);
              const className = toNonEmptyText(student.class_name);
              const parentName = toNonEmptyText(student.parent_name);
              const statusTone =
                statusKey === 'inactive'
                  ? { bg: '#DC262622', border: '#DC262655', text: '#B91C1C' }
                  : statusKey === 'pending'
                  ? { bg: '#F59E0B22', border: '#F59E0B55', text: '#B45309' }
                  : { bg: '#05966922', border: '#05966955', text: '#047857' };

              return (
                <TouchableOpacity
                  key={student.id}
                  style={styles.studentCard}
                  onPress={() => handleStudentPress(student)}
                >
                  <View style={styles.idTagPunchHole} />
                  <View style={styles.idTagGlow} />
                  <View style={styles.studentHeader}>
                    <View style={styles.studentAvatarShell}>
                      {student.avatar_url ? (
                        <Image source={{ uri: student.avatar_url }} style={styles.studentAvatarImage} />
                      ) : (
                        <View style={[
                          styles.studentAvatar,
                          { backgroundColor: getAgeGroupColor(ageGroupName || '', schoolInfo?.school_type || 'preschool') },
                        ]}>
                          <Text style={styles.studentInitials}>{getStudentInitials(student)}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.studentInfo}>
                      <Text style={styles.studentName} numberOfLines={1}>
                        {student.first_name} {student.last_name}
                      </Text>
                      <Text style={styles.studentAge}>
                        {formatAge(student.age_months, student.age_years, schoolInfo?.school_type || 'preschool')}
                      </Text>
                    </View>
                    <View style={styles.studentIdBadge}>
                      <Text style={styles.studentIdBadgeText}>
                        {(student.student_id || student.id).slice(0, 8).toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.studentDetails}>
                    {ageGroupName ? (
                      <View style={[
                        styles.ageGroupBadge,
                        { backgroundColor: getAgeGroupColor(ageGroupName, schoolInfo?.school_type || 'preschool') + '20' },
                      ]}>
                        <Text style={[
                          styles.ageGroupBadgeText,
                          { color: getAgeGroupColor(ageGroupName, schoolInfo?.school_type || 'preschool') },
                        ]}>
                          {ageGroupName}
                        </Text>
                      </View>
                    ) : null}
                    {className ? <Text style={styles.classInfo}>📚 {className}</Text> : null}
                    {parentName ? <Text style={styles.parentInfo}>👨‍👩‍👧‍👦 {parentName}</Text> : null}
                  </View>

                  <View style={styles.studentCardFooter}>
                    <View style={[styles.statusPill, { backgroundColor: statusTone.bg, borderColor: statusTone.border }]}>
                      <Text style={[styles.statusPillText, { color: statusTone.text }]}>
                        {(student.status || 'active').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.cardSerialText}>#{student.id.slice(0, 8).toUpperCase()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAddStudent}>
        <Ionicons name="add" size={24} color={theme.onPrimary} />
      </TouchableOpacity>

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.filterModal}>
          <View style={styles.filterHeader}>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <Text style={styles.filterCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.filterTitle}>Filter Students</Text>
            <TouchableOpacity
              onPress={() => {
                setFilters({ searchTerm: '', ageGroup: '', status: '', classId: '' });
                setShowFilters(false);
              }}
            >
              <Text style={styles.filterClear}>Clear</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.filterContent}>
            <Text style={styles.filterNote}>
              Filter by age group, class, or status to find specific students.
              {schoolInfo?.school_type === 'preschool'
                ? ' Age groups are designed for developmental stages.'
                : ' Grades follow the South African education system.'}
            </Text>
          </ScrollView>
        </View>
      </Modal>

      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background,
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.textSecondary,
  },
  header: {
    backgroundColor: theme.primary,
    paddingTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backButton: {
    marginRight: 10,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.onPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: theme.onPrimary + 'CC',
    marginTop: 2,
  },
  filterButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.onPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: theme.onPrimary + 'CC',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: theme.shadow || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.text,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  autoAssignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    minHeight: 40,
  },
  autoAssignIcon: {
    marginRight: 6,
  },
  autoAssignButtonDisabled: {
    opacity: 0.6,
  },
  autoAssignButtonText: {
    color: theme.onPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  printCardsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    minHeight: 40,
  },
  printCardsButtonText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: '600',
  },
  lifecycleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primary + '55',
    backgroundColor: theme.primary + '12',
    minHeight: 40,
  },
  lifecycleButtonText: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  ageGroupOverview: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  ageGroupSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  manageAgeGroupsLink: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  ageGroupEmptyHint: {
    fontSize: 13,
    color: theme.textSecondary,
    fontStyle: 'italic',
  },
  ageGroupsRow: {
    flexDirection: 'row',
    paddingRight: 20,
  },
  ageGroupChip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  ageGroupName: {
    fontSize: 14,
    fontWeight: '600',
  },
  ageGroupCount: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  studentsList: {
    flex: 1,
  },
  studentsGrid: {
    padding: 20,
    paddingTop: 0,
  },
  studentCard: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border + 'AA',
    shadowColor: theme.shadow || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  idTagPunchHole: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: theme.text + '30',
    backgroundColor: theme.background,
    zIndex: 2,
  },
  idTagGlow: {
    position: 'absolute',
    right: -16,
    top: -12,
    width: 86,
    height: 86,
    borderRadius: 999,
    backgroundColor: theme.primary + '1F',
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentAvatarShell: {
    width: 56,
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.surfaceVariant || theme.primary + '18',
    marginRight: 12,
    borderWidth: 1,
    borderColor: theme.border + '88',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarImage: {
    width: '100%',
    height: '100%',
  },
  studentAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentInitials: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  studentAge: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 2,
  },
  studentIdBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.primary + '66',
    backgroundColor: theme.primary + '12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 104,
  },
  studentIdBadgeText: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  studentDetails: {
    gap: 8,
    marginBottom: 10,
  },
  ageGroupBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ageGroupBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  classInfo: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  parentInfo: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  studentCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.border + '80',
    paddingTop: 8,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: '#05966922',
    borderWidth: 1,
    borderColor: '#05966955',
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusPillText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardSerialText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.textSecondary,
    letterSpacing: 0.8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  addButtonText: {
    color: theme.onPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.shadow || '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  filterModal: {
    flex: 1,
    backgroundColor: theme.background,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  filterCancel: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  filterClear: {
    fontSize: 16,
    color: theme.primary,
    fontWeight: '600',
  },
  filterContent: {
    flex: 1,
    padding: 20,
  },
  filterNote: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
});
