/**
 * Principal Registrations Screen
 * 
 * Allows principals to view, search, approve/reject child registration requests.
 * Data comes from registration_requests table (synced from EduSitePro).
 * Feature-flagged: Only active when registrations_enabled is true.
 * 
 * Refactored per WARP.md standards:
 * - Hook: useRegistrations (state, logic)
 * - Components: RegistrationCard, RegistrationHeader, RegistrationFilters
 */

import React from 'react';
import { Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { useRegistrations, Registration } from '@/hooks/useRegistrations';
import { RegistrationCard, RegistrationHeader, RegistrationFilters } from '@/components/registrations';
import { AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function PrincipalRegistrationsScreen() {
  const { theme } = useTheme();
  const colors = theme;
  const insets = useSafeAreaInsets();
  
  // Feature flag check
  const flags = getFeatureFlagsSync();
  const isEnabled = flags.registrations_enabled !== false;
  
  // All state and logic from hook
  const {
    filteredRegistrations,
    alertProps,
    showAlert,
    loading,
    refreshing,
    syncing,
    processing,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    rejectModalVisible,
    rejectionReason,
    setRejectionReason,
    confirmReject,
    cancelReject,
    rejectingRegistration,
    fetchRegistrations,
    onRefresh,
    handleSyncWithEduSite,
    handleApprove,
    handleReject,
    handleVerifyPayment,
    sendPaymentReminder,
    sendingReminder,
    sendPopUploadLink,
    sendingPopLink,
    canApprove,
    usesEdusiteSync,
    pendingCount,
    approvedCount,
    rejectedCount,
  } = useRegistrations();

  // Render registration card
  const renderRegistration = ({ item }: { item: Registration }) => (
    <RegistrationCard
      item={item}
      isProcessing={processing === item.id}
      onApprove={handleApprove}
      onReject={handleReject}
      onVerifyPayment={handleVerifyPayment}
      canApprove={canApprove}
      onSendReminder={sendPaymentReminder}
      isSendingReminder={sendingReminder === item.id}
      onSendPopUploadLink={sendPopUploadLink}
      isSendingPopLink={sendingPopLink === item.id}
      showAlert={showAlert}
    />
  );

  // Feature flag disabled state
  if (!isEnabled) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Registrations' }} />
        <View style={styles.centerContainer}>
          <Ionicons name="lock-closed" size={64} color={colors.textSecondary} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>
            Registrations Not Available
          </Text>
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            This feature is currently disabled. Please contact support.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Registrations', headerShown: false }} />
        <RegistrationHeader
          pendingCount={0}
          approvedCount={0}
          rejectedCount={0}
          syncing={false}
          onSync={() => {}}
          topInset={insets.top}
          usesEdusiteSync={usesEdusiteSync}
        />
        <View style={styles.centerContainer}>
          <EduDashSpinner size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading registrations...
          </Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Registrations', headerShown: false }} />
        <RegistrationHeader
          pendingCount={pendingCount}
          approvedCount={approvedCount}
          rejectedCount={rejectedCount}
          syncing={syncing}
          onSync={handleSyncWithEduSite}
          topInset={insets.top}
          usesEdusiteSync={usesEdusiteSync}
        />
        <View style={styles.centerContainer}>
          <Ionicons name="warning" size={48} color="#EF4444" />
          <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={fetchRegistrations}
          >
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Empty state
  const isEmpty = filteredRegistrations.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Registrations', headerShown: false }} />

      {/* Header with Stats */}
      <RegistrationHeader
        pendingCount={pendingCount}
        approvedCount={approvedCount}
        rejectedCount={rejectedCount}
        syncing={syncing}
        onSync={handleSyncWithEduSite}
        topInset={insets.top}
        usesEdusiteSync={usesEdusiteSync}
      />

      {/* Search & Filter */}
      <RegistrationFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        pendingCount={pendingCount}
      />

      {/* Content */}
      {isEmpty ? (
        <View style={styles.centerContainer}>
          <Ionicons 
            name={statusFilter === 'pending' ? 'checkmark-done-circle' : 'document-text-outline'} 
            size={64} 
            color={colors.textSecondary} 
          />
          <Text style={[styles.centerTitle, { color: colors.text }]}>
            {statusFilter === 'pending' 
              ? 'No Pending Registrations'
              : searchTerm 
                ? 'No Matching Registrations'
                : 'No Registrations Found'}
          </Text>
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            {statusFilter === 'pending'
              ? 'All registrations have been processed'
              : 'Registration requests will appear here when parents apply'}
          </Text>
        </View>
      ) : (
        <FlashList
          data={filteredRegistrations}
          renderItem={renderRegistration}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          estimatedItemSize={120}
        />
      )}

      <Modal
        visible={rejectModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={cancelReject}
      >
        <View style={[styles.rejectionModalContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.rejectionModalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={cancelReject}>
              <Text style={[styles.rejectionModalCancel, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.rejectionModalTitle, { color: colors.text }]}>Reject Registration</Text>
            <TouchableOpacity onPress={confirmReject}>
              <Text style={[styles.rejectionModalSubmit, { color: '#EF4444' }]}>Reject</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rejectionModalContent}>
            <Text style={[styles.rejectionModalLabel, { color: colors.textSecondary }]}>
              {`Enter reason for rejecting ${rejectingRegistration?.student_first_name ?? 'this student'}'s registration:`}
            </Text>
            <TextInput
              style={[styles.rejectionModalInput, {
                backgroundColor: colors.surface,
                color: colors.text,
                borderColor: colors.border,
              }]}
              placeholder="Enter rejection reason..."
              placeholderTextColor={colors.textSecondary}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>
      </Modal>

      <AlertModal {...alertProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  centerText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  rejectionModalContainer: {
    flex: 1,
  },
  rejectionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rejectionModalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rejectionModalCancel: {
    fontSize: 14,
  },
  rejectionModalSubmit: {
    fontSize: 14,
    fontWeight: '600',
  },
  rejectionModalContent: {
    padding: 16,
    gap: 12,
  },
  rejectionModalLabel: {
    fontSize: 13,
  },
  rejectionModalInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
  },
});
