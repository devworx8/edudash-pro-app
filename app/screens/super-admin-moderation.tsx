import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isPlatformStaff } from '@/lib/roleUtils';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { createStyles, getSeverityColor, getStatusColor, getTypeIcon } from '@/lib/screen-styles/super-admin-moderation.styles';
import { useSuperAdminModeration } from '@/hooks/useSuperAdminModeration';

export default function SuperAdminModerationScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    profile,
    loading,
    refreshing,
    filteredItems,
    filters,
    setFilters,
    showDetailModal,
    selectedItem,
    reviewNotes,
    setReviewNotes,
    processing,
    onRefresh,
    openDetail,
    closeDetail,
    moderateItem,
  } = useSuperAdminModeration(showAlert);

  if (!profile || (!isPlatformStaff(profile.role))) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Content Moderation', headerShown: false }} />
        <StatusBar style="light" />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Content Moderation', headerShown: false }} />
      <StatusBar style="light" />
      
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#00f5ff" />
          </TouchableOpacity>
          <Text style={styles.title}>Content Moderation</Text>
          <View style={styles.placeholder} />
        </View>
        
        {/* Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {filteredItems.length} items • {filteredItems.filter(i => i.status === 'pending').length} pending review
          </Text>
        </View>
      </SafeAreaView>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
          {(['all', 'pending', 'flagged', 'approved', 'rejected'] as const).map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.filterTab, filters.status === status && styles.filterTabActive]}
              onPress={() => setFilters(prev => ({ ...prev, status }))}
            >
              <Text style={[styles.filterTabText, filters.status === status && styles.filterTabTextActive]}>
                {status === 'all' ? 'All Status' : status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
          {(['all', 'lesson', 'homework', 'message', 'comment', 'announcement'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterTab, filters.type === type && styles.filterTabActive]}
              onPress={() => setFilters(prev => ({ ...prev, type }))}
            >
              <Text style={[styles.filterTabText, filters.type === type && styles.filterTabTextActive]}>
                {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00f5ff" />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color="#00f5ff" />
            <Text style={styles.loadingText}>Loading moderation queue...</Text>
          </View>
        ) : (
          <>
            {filteredItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => openDetail(item)}
              >
                <View style={styles.itemHeader}>
                  <View style={styles.itemInfo}>
                    <View style={styles.typeIcon}>
                      <Ionicons name={getTypeIcon(item.type) as any} size={20} color="#00f5ff" />
                    </View>
                    <View style={styles.itemDetails}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.itemAuthor}>{item.author_name} • {item.school_name}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.itemMeta}>
                    <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(item.severity) + '20', borderColor: getSeverityColor(item.severity) }]}>
                      <Text style={[styles.severityText, { color: getSeverityColor(item.severity) }]}>
                        {item.severity.toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20', borderColor: getStatusColor(item.status) }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.itemContent} numberOfLines={2}>
                  {item.content}
                </Text>

                <View style={styles.itemFooter}>
                  <View style={styles.itemFlags}>
                    {item.flags.slice(0, 2).map((flag, index) => (
                      <View key={index} style={styles.flagChip}>
                        <Text style={styles.flagChipText}>{flag.replace('_', ' ')}</Text>
                      </View>
                    ))}
                    {item.flags.length > 2 && (
                      <View style={styles.flagChip}>
                        <Text style={styles.flagChipText}>+{item.flags.length - 2} more</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.itemStats}>
                    {item.report_count > 0 && (
                      <Text style={styles.reportCount}>
                        <Ionicons name="flag" size={12} color="#ef4444" /> {item.report_count}
                      </Text>
                    )}
                    <Text style={styles.itemDate}>
                      {new Date(item.flagged_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {filteredItems.length === 0 && (
              <View style={styles.emptyContainer}>
                <Ionicons name="shield-checkmark" size={48} color="#6b7280" />
                <Text style={styles.emptyText}>No items to moderate</Text>
                <Text style={styles.emptySubText}>All content is currently clean</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDetail}
      >
        {selectedItem && (
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeDetail}>
                <Ionicons name="close" size={24} color="#00f5ff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Content Review</Text>
              <View style={styles.placeholder} />
            </View>

            <ScrollView style={styles.modalContent}>
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Content Details</Text>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Type</Text>
                  <Text style={styles.modalInfoValue}>{selectedItem.type}</Text>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Title</Text>
                  <Text style={styles.modalInfoValue}>{selectedItem.title}</Text>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Author</Text>
                  <Text style={styles.modalInfoValue}>{selectedItem.author_name}</Text>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>School</Text>
                  <Text style={styles.modalInfoValue}>{selectedItem.school_name}</Text>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedItem.status) + '20', borderColor: getStatusColor(selectedItem.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(selectedItem.status) }]}>
                      {selectedItem.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Severity</Text>
                  <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(selectedItem.severity) + '20', borderColor: getSeverityColor(selectedItem.severity) }]}>
                    <Text style={[styles.severityText, { color: getSeverityColor(selectedItem.severity) }]}>
                      {selectedItem.severity.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Content</Text>
                <Text style={styles.contentText}>{selectedItem.content}</Text>
              </View>

              {selectedItem.flags.length > 0 && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Flags</Text>
                  <View style={styles.flagsList}>
                    {selectedItem.flags.map((flag, index) => (
                      <View key={index} style={styles.flagItem}>
                        <Text style={styles.flagItemText}>{flag.replace('_', ' ')}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Review Notes</Text>
                <TextInput
                  style={styles.reviewNotesInput}
                  value={reviewNotes}
                  onChangeText={setReviewNotes}
                  placeholder="Add your review notes here..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                />
              </View>

              {selectedItem.reviewed_by && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Previous Review</Text>
                  <Text style={styles.previousReview}>
                    Reviewed on {new Date(selectedItem.reviewed_at!).toLocaleDateString()}
                  </Text>
                  <Text style={styles.previousReviewNotes}>
                    {selectedItem.review_notes}
                  </Text>
                </View>
              )}
            </ScrollView>

            {selectedItem.status === 'pending' && (
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalActionButton, styles.approveButton]}
                  onPress={() => moderateItem(selectedItem, 'approve')}
                  disabled={processing}
                >
                  {processing ? (
                    <EduDashSpinner size="small" color="#16a34a" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  )}
                  <Text style={[styles.modalActionText, { color: '#16a34a' }]}>Approve</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalActionButton, styles.rejectButton]}
                  onPress={() => moderateItem(selectedItem, 'reject')}
                  disabled={processing}
                >
                  {processing ? (
                    <EduDashSpinner size="small" color="#dc2626" />
                  ) : (
                    <Ionicons name="close-circle" size={20} color="#dc2626" />
                  )}
                  <Text style={[styles.modalActionText, { color: '#dc2626' }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </SafeAreaView>
        )}
      </Modal>
      <AlertModal {...alertProps} />
    </View>
  );
}