/**
 * Teacher Approval Screen
 * 
 * Allows principals to review and approve teachers who have accepted invitations.
 * Integrates with seat management for proper teacher activation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, RefreshControl, Modal, ScrollView, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import {
  getPendingTeachers,
  approveTeacher,
  rejectTeacher,
  getApprovalStats,
  type PendingTeacher,
  type TeacherApprovalStats,
} from '@/lib/services/teacherApprovalService';
import { createStyles } from '@/lib/screen-styles/teacher-approval.styles';
import { logger } from '@/lib/logger';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function TeacherApprovalScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();
  
  const [pendingTeachers, setPendingTeachers] = useState<PendingTeacher[]>([]);
  const [stats, setStats] = useState<TeacherApprovalStats>({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<PendingTeacher | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  
  const organizationId = profile?.organization_id || profile?.preschool_id;
  
  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    
    try {
      const [teachers, statsData] = await Promise.all([
        getPendingTeachers(organizationId),
        getApprovalStats(organizationId),
      ]);
      
      setPendingTeachers(teachers);
      setStats(statsData);
    } catch (err) {
      logger.error('[TeacherApproval] Fetch error:', err);
      showAlert({ title: 'Error', message: 'Failed to load pending teachers', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, showAlert]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);
  
  const handleApprove = async (teacher: PendingTeacher) => {
    if (!user?.id || !organizationId) return;
    
    showAlert({
      title: 'Approve Teacher',
      message: `Approve ${teacher.first_name} ${teacher.last_name} as a teacher?\n\nThis will:\n• Assign a teacher seat\n• Grant teaching permissions\n• Send welcome notification`,
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setProcessing(teacher.id);
            try {
              const result = await approveTeacher(
                teacher.user_id,
                organizationId,
                user.id,
                { assignSeat: true }
              );
              
              if (result.success) {
                showAlert({ title: 'Success', message: result.message, type: 'success' });
                fetchData();
              } else {
                showAlert({ title: 'Error', message: result.message, type: 'error' });
              }
            } catch (err) {
              logger.error('[TeacherApproval] Approve error:', err);
              showAlert({ title: 'Error', message: 'Failed to approve teacher', type: 'error' });
            } finally {
              setProcessing(null);
            }
          },
        },
      ],
    });
  };
  
  const handleReject = async () => {
    if (!selectedTeacher || !user?.id || !organizationId) return;
    
    setProcessing(selectedTeacher.id);
    try {
      const result = await rejectTeacher(
        selectedTeacher.user_id,
        organizationId,
        user.id,
        rejectionReason || undefined
      );
      
      if (result.success) {
        showAlert({ title: 'Rejected', message: 'Teacher application has been rejected', type: 'info' });
        setShowRejectionModal(false);
        setSelectedTeacher(null);
        setRejectionReason('');
        fetchData();
      } else {
        showAlert({ title: 'Error', message: result.message, type: 'error' });
      }
    } catch (err) {
      logger.error('[TeacherApproval] Reject error:', err);
      showAlert({ title: 'Error', message: 'Failed to reject teacher', type: 'error' });
    } finally {
      setProcessing(null);
    }
  };
  
  const openRejectionModal = (teacher: PendingTeacher) => {
    setSelectedTeacher(teacher);
    setRejectionReason('');
    setShowRejectionModal(true);
  };
  
  const renderTeacher = ({ item }: { item: PendingTeacher }) => {
    const initials = `${item.first_name?.[0] || ''}${item.last_name?.[0] || ''}`.toUpperCase();
    const isProcessing = processing === item.id;
    
    return (
      <View style={styles.teacherCard}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.teacherName}>
              {item.first_name} {item.last_name}
            </Text>
            <Text style={styles.teacherEmail}>{item.email}</Text>
            {item.phone && (
              <Text style={styles.teacherPhone}>{item.phone}</Text>
            )}
          </View>
        </View>
        
        <View style={styles.cardMeta}>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
            <Text style={styles.metaText}>
              Applied: {new Date(item.requested_at).toLocaleDateString()}
            </Text>
          </View>
          {item.invite_accepted_at && (
            <View style={styles.metaRow}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
              <Text style={styles.metaText}>
                Invite accepted: {new Date(item.invite_accepted_at).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => openRejectionModal(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <EduDashSpinner size="small" color="#EF4444" />
            ) : (
              <>
                <Ionicons name="close" size={18} color="#EF4444" />
                <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Reject</Text>
              </>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => handleApprove(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <EduDashSpinner size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[styles.actionButtonText, { color: '#fff' }]}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <EduDashSpinner size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading pending approvals...</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <LinearGradient
        colors={['#06B6D4', '#0891B2']}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Teacher Approvals</Text>
            <Text style={styles.headerSubtitle}>Review pending applications</Text>
          </View>
        </View>
        
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.approved}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.rejected}</Text>
            <Text style={styles.statLabel}>Rejected</Text>
          </View>
        </View>
      </LinearGradient>
      
      {/* List */}
      <FlashList
        data={pendingTeachers}
        keyExtractor={item => item.id}
        renderItem={renderTeacher}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        estimatedItemSize={100}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={theme.textSecondary} />
            <Text style={styles.emptyTitle}>No Pending Approvals</Text>
            <Text style={styles.emptyText}>
              Teachers who accept your invitations will appear here for approval.
            </Text>
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={() => router.push('/screens/teacher-management')}
            >
              <Ionicons name="person-add" size={20} color="#fff" />
              <Text style={styles.inviteButtonText}>Invite Teachers</Text>
            </TouchableOpacity>
          </View>
        }
      />
      
      {/* Rejection Modal */}
      <Modal
        visible={showRejectionModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRejectionModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Reject Application</Text>
            <TouchableOpacity onPress={() => setShowRejectionModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            {selectedTeacher && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Teacher</Text>
                <Text style={styles.modalText}>
                  {selectedTeacher.first_name} {selectedTeacher.last_name}
                </Text>
                <Text style={styles.modalTextSecondary}>{selectedTeacher.email}</Text>
              </View>
            )}
            
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Reason (Optional)</Text>
              <TextInput
                style={styles.reasonInput}
                value={rejectionReason}
                onChangeText={setRejectionReason}
                placeholder="Enter reason for rejection..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={() => setShowRejectionModal(false)}
              >
                <Text style={styles.cancelModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.confirmRejectButton}
                onPress={handleReject}
                disabled={processing === selectedTeacher?.id}
              >
                {processing === selectedTeacher?.id ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                    <Text style={styles.confirmRejectButtonText}>Reject Application</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
      
      <AlertModal {...alertProps} />
    </View>
  );
}
