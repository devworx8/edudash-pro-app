import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  FlatList, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { useTeacherManagement } from '@/hooks/useTeacherManagement';
import { useTeacherInvites } from '@/hooks/useTeacherInvites';
import TeacherCard from '@/components/teacher/TeacherCard';
import { HiringView } from '@/components/teacher/HiringView';
import { ApplicationsView } from '@/components/teacher/ApplicationsView';
import { PerformanceView } from '@/components/teacher/PerformanceView';
import { PayrollView } from '@/components/teacher/PayrollView';
import { TeacherProfileView } from '@/components/teacher/TeacherProfileView';
import { AddTeacherActionSheet } from '@/components/teacher/AddTeacherActionSheet';
import { InviteTeacherModal } from '@/components/teacher/InviteTeacherModal';
import { InviteShareModal } from '@/components/teacher/InviteShareModal';
import { CreateTeacherModal } from '@/components/teacher/CreateTeacherModal';
import { useTeacherDocUpload } from '@/hooks/useTeacherDocUpload';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import type { Teacher } from '@/types/teacher-management';
import { createStyles } from '@/lib/screen-styles/teacher-management.styles';

export default function TeacherManagementScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const {
    teachers, loading, fetchTeachers, getPreschoolId,
    invites, loadInvites,
    inviteEmail, setInviteEmail,
    showInviteModal, setShowInviteModal,
    isUploadingDoc,
    availableTeachers, fetchAvailableCandidates,
    searchQuery, setSearchQuery,
    filterStatus, setFilterStatus,
    hiringSearch, setHiringSearch,
    radiusKm, setRadiusKm,
    currentView, setCurrentView,
    selectedTeacher, setSelectedTeacher,
    teacherDocsMap,
    isAssigning, isRevoking,
    handleAssignSeat, handleRevokeSeat,
    isUpdatingRole, updatingRoleTeacherId, handleSetTeacherRole,
    shouldDisableAssignment,
    selectedTeacherHasSeat,
    seatUsageDisplay,
  } = useTeacherManagement({ showAlert });
  const router = useRouter();
  const schoolName = (profile as any)?.preschool_name
    || (profile as any)?.organization_name
    || (profile as any)?.school_name
    || 'Our School';
  const inviterName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
    || user?.email
    || 'School Admin';
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    inviteLoading, inviteShare, showInviteShareModal, closeInviteShareModal,
    handleShareInvite, handleInviteTeacher, handleCopyInviteLink,
    handleDeleteInvite, handleDeleteTeacher, handleInviteShareAction,
  } = useTeacherInvites({
    getPreschoolId, userId: user?.id, schoolName, inviterName,
    invites, loadInvites, fetchTeachers, showAlert,
  });

  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showCreateTeacherModal, setShowCreateTeacherModal] = useState(false);
  const [createTeacherPrefill, setCreateTeacherPrefill] = useState<{ email?: string; name?: string }>({});

  const { isUploading: isDocUploading, showAttachDocActionSheet } = useTeacherDocUpload({
    getPreschoolId, userId: user?.id, showAlert, fetchTeachers,
  });

  const filteredTeachers = useMemo(() => {
    let result = teachers || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t: Teacher) =>
        (`${t.firstName} ${t.lastName}`).toLowerCase().includes(q) || t.email?.toLowerCase()?.includes(q)
      );
    }
    return filterStatus !== 'all' ? result.filter((t: Teacher) => t.status === filterStatus) : result;
  }, [teachers, searchQuery, filterStatus]);

  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'people' as const },
    { key: 'hiring', label: 'Hiring', icon: 'briefcase' as const },
    { key: 'applications', label: 'Applications', icon: 'document-text' as const },
    { key: 'performance', label: 'Performance', icon: 'bar-chart' as const },
    { key: 'payroll', label: 'Payroll', icon: 'wallet' as const },
  ] as const;

  const renderTeacher = useCallback(({ item }: { item: Teacher }) => {
    const invite = invites.find((inv: any) => inv.email?.toLowerCase() === item.email?.toLowerCase());

    return (
      <TeacherCard
        teacher={item}
        theme={theme}
        onPress={(teacher) => { setSelectedTeacher(teacher); setCurrentView('profile'); }}
        onAssignSeat={handleAssignSeat}
        onRevokeSeat={handleRevokeSeat}
        onInvite={(teacher) => teacher.email
          ? void handleInviteTeacher(teacher.email)
          : showAlert({ title: 'Missing Email', message: 'This teacher has no email address for invite delivery.', type: 'warning' })
        }
        onCopyInviteLink={() => void handleCopyInviteLink()}
        onDeleteInvite={(inviteId) => void handleDeleteInvite(inviteId)}
        onDeleteTeacher={(teacher) => void handleDeleteTeacher(
          teacher.teacherUserId || teacher.id,
          `${teacher.firstName} ${teacher.lastName}`.trim() || teacher.email
        )}
        inviteStatus={invite?.status}
        inviteToken={invite?.token}
        inviteId={invite?.id}
        isAssigning={isAssigning}
        isRevoking={isRevoking}
        isUpdatingRole={isUpdatingRole}
        updatingRoleTeacherId={updatingRoleTeacherId}
        onSetRole={(teacher, role) => void handleSetTeacherRole(teacher, role)}
        shouldDisableAssignment={shouldDisableAssignment}
      />
    );
  }, [invites, theme, setSelectedTeacher, setCurrentView, handleAssignSeat, handleRevokeSeat,
    handleInviteTeacher, handleCopyInviteLink, handleDeleteInvite, handleDeleteTeacher,
    isAssigning, isRevoking, isUpdatingRole, updatingRoleTeacherId, handleSetTeacherRole,
    shouldDisableAssignment, showAlert]);

  const list = teachers || [];
  const activeTeachers = list.filter((t: any) => t.status === 'active').length;
  const onLeaveTeachers = list.filter((t: any) => t.status === 'on_leave').length;
  const pendingInvites = (invites || []).filter((i: any) => i.status === 'pending').length;

  if (loading && !teachers?.length) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <EduDashSpinner size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#4338ca', '#6366F1', '#818cf8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Teacher Management</Text>
              <Text style={styles.headerSubtitle}>{schoolName}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => router.push('/screens/class-teacher-management')}
              >
                <Ionicons name="school-outline" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.settingsButton, { marginLeft: 8 }]}
                onPress={() => router.push('/screens/principal-seat-management')}
              >
                <Ionicons name="settings-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{list.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{activeTeachers}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{onLeaveTeachers}</Text>
              <Text style={styles.statLabel}>On Leave</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{pendingInvites}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Navigation Tabs */}
        <View style={styles.tabsContainer}>
          <FlatList
            horizontal
            data={tabs}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.tab, currentView === item.key && styles.activeTab]}
                onPress={() => setCurrentView(item.key as any)}
              >
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={currentView === item.key ? 'white' : theme?.textSecondary || '#9ca3af'}
                />
                <Text style={[styles.tabText, currentView === item.key && styles.activeTabText]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* FAB */}
        {currentView === 'overview' && (
          <TouchableOpacity style={styles.fab} onPress={() => setShowAddTeacherModal(true)}>
            <Ionicons name="add" size={28} color="white" />
          </TouchableOpacity>
        )}

        {/* Modals */}
        <AddTeacherActionSheet
          visible={showAddTeacherModal}
          onClose={() => setShowAddTeacherModal(false)}
          onDirectAdd={() => setShowCreateTeacherModal(true)}
          onInviteByEmail={() => setShowInviteModal(true)}
          onCopyInviteLink={handleCopyInviteLink}
          onCreateAccount={() => setShowCreateTeacherModal(true)}
          styles={styles}
          theme={theme}
        />
        <InviteTeacherModal
          visible={showInviteModal}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          onClose={() => { setShowInviteModal(false); setInviteEmail(''); }}
          onInvite={() => handleInviteTeacher(inviteEmail)}
          inviteLoading={inviteLoading}
          styles={styles}
          theme={theme}
        />
        <InviteShareModal
          visible={showInviteShareModal}
          inviteShare={inviteShare}
          onClose={closeInviteShareModal}
          onAction={handleInviteShareAction}
          styles={styles}
          theme={theme}
        />

        {/* Content */}
        <View style={styles.contentContainer}>
          {currentView === 'overview' && (
            <View style={styles.overviewContainer}>
              <View style={styles.searchFilterBar}>
                <View style={styles.searchInputContainer}>
                  <Ionicons name="search" size={18} color={theme?.textSecondary || '#6b7280'} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search teachers..."
                    placeholderTextColor={theme?.textSecondary || '#9ca3af'}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Ionicons name="close-circle" size={18} color={theme?.textSecondary || '#6b7280'} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.filterButton}
                  onPress={() => {
                    showAlert({
                      title: 'Filter Teachers',
                      message: 'Select status filter',
                      type: 'info',
                      buttons: [
                        { text: 'All', onPress: () => setFilterStatus('all') },
                        { text: 'Active', onPress: () => setFilterStatus('active') },
                        { text: 'On Leave', onPress: () => setFilterStatus('on_leave') },
                        { text: 'Inactive', onPress: () => setFilterStatus('inactive') },
                        { text: 'Cancel', style: 'cancel' },
                      ],
                    });
                  }}
                >
                  <Ionicons name="filter" size={18} color={theme?.primary || '#6366F1'} />
                  {filterStatus !== 'all' && (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterBadgeText}>1</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {seatUsageDisplay?.isOverLimit && (
                <View style={styles.warningBanner}>
                  <Ionicons name="warning" size={20} color="#dc2626" />
                  <Text style={styles.warningText}>
                    {"You've exceeded your seat limit (" + seatUsageDisplay.displayText + ")."}
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/screens/principal-seat-management')}>
                    <Text style={styles.warningLink}>Manage Seats</Text>
                  </TouchableOpacity>
                </View>
              )}

              <FlatList
                data={filteredTeachers}
                renderItem={renderTeacher}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={loading}
                    onRefresh={fetchTeachers}
                    colors={['#6366F1']}
                    tintColor="#6366F1"
                  />
                }
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconContainer}><Ionicons name="people-outline" size={48} color="#6366F1" /></View>
                    <Text style={styles.emptyTitle}>No Teachers Yet</Text>
                    <Text style={styles.emptyText}>Start building your teaching team by adding your first teacher.</Text>
                    <TouchableOpacity style={styles.emptyButton} onPress={() => setShowAddTeacherModal(true)}>
                      <Ionicons name="add-circle" size={20} color="white" />
                      <Text style={styles.emptyButtonText}>Add First Teacher</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            </View>
          )}

          {currentView === 'hiring' && (
            <HiringView
              availableTeachers={availableTeachers}
              invites={invites}
              hiringSearch={hiringSearch}
              radiusKm={radiusKm}
              loading={loading}
              theme={theme}
              userId={user?.id}
              preschoolId={getPreschoolId()}
              onSearchChange={setHiringSearch}
              onRadiusChange={(km: number) => { setRadiusKm(km); fetchAvailableCandidates(); }}
              onRefresh={fetchAvailableCandidates}
              onLoadInvites={loadInvites}
              schoolName={schoolName}
              inviterName={inviterName}
              showAlert={showAlert}
              onHireTeacher={(teacher) => {
                setCreateTeacherPrefill({ email: teacher.email, name: teacher.name });
                setShowCreateTeacherModal(true);
              }}
            />
          )}

          {currentView === 'applications' && (
            <ApplicationsView
              preschoolId={getPreschoolId()}
              userId={user?.id}
              theme={theme}
              showAlert={showAlert}
              onCreateAccount={(email, name) => {
                setCreateTeacherPrefill({ email, name });
                setShowCreateTeacherModal(true);
              }}
            />
          )}

          {currentView === 'performance' && (
            <PerformanceView
              teachers={filteredTeachers}
              preschoolId={getPreschoolId()}
              userId={user?.id}
              theme={theme}
              showAlert={showAlert}
            />
          )}

          {currentView === 'payroll' && (
            <PayrollView
              teachers={filteredTeachers}
              preschoolId={getPreschoolId()}
              userId={user?.id}
              theme={theme}
              showAlert={showAlert}
            />
          )}

          {currentView === 'profile' && selectedTeacher && (
            <TeacherProfileView
              teacher={selectedTeacher}
              teacherDocsMap={teacherDocsMap}
              isUploadingDoc={isDocUploading || isUploadingDoc}
              selectedTeacherHasSeat={selectedTeacherHasSeat}
              shouldDisableAssignment={shouldDisableAssignment}
              isAssigning={isAssigning}
              isRevoking={isRevoking}
              theme={theme}
              onBack={() => setCurrentView('overview')}
              onMessage={() => showAlert({
                title: 'Messaging',
                message: 'Teacher communications coming soon',
                type: 'info',
              })}
              onAssignSeat={handleAssignSeat}
              onRevokeSeat={handleRevokeSeat}
              onAttachDocument={() => showAttachDocActionSheet(selectedTeacher.id)}
              onDeleteTeacher={(teacher) => {
                const fullName = `${teacher.firstName} ${teacher.lastName}`.trim() || teacher.email;
                void handleDeleteTeacher(teacher.teacherUserId || teacher.id, fullName);
              }}
            />
          )}
        </View>

        <AlertModal {...alertProps} />
        <CreateTeacherModal
          visible={showCreateTeacherModal}
          schoolId={getPreschoolId()}
          onClose={() => { setShowCreateTeacherModal(false); setCreateTeacherPrefill({}); }}
          onSuccess={(result) => {
            const messageParts: string[] = [];
            if (result.message) {
              messageParts.push(result.message);
            }
            if (result.temp_password) {
              messageParts.push(`Temporary Password: ${result.temp_password}`);
              void Clipboard.setStringAsync(result.temp_password).catch(() => {});
              messageParts.push('Temporary password copied to clipboard.');
            }
            if (result.email_sent === false) {
              messageParts.push('Email delivery failed. Share the temporary password manually.');
            }
            if (result.login_method_hint) {
              messageParts.push(result.login_method_hint);
            }
            if (Array.isArray(result.provisioning_warnings) && result.provisioning_warnings.length > 0) {
              messageParts.push(`Warnings: ${result.provisioning_warnings.join(' | ')}`);
            }
            showAlert({
              title: result.is_existing_user ? 'Teacher Linked' : 'Account Created',
              message: messageParts.join('\n\n') || 'Teacher account is ready.',
              type: result.email_sent === false ? 'warning' : 'success',
            });
            fetchTeachers();
            loadInvites();
          }}
          showAlert={showAlert}
          prefillEmail={createTeacherPrefill.email}
          prefillName={createTeacherPrefill.name}
          schoolType={(profile as any)?.organization_membership?.school_type}
        />
      </SafeAreaView>
    </View>
  );
}
