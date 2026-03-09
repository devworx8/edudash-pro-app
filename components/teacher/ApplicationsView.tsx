/**
 * ApplicationsView
 *
 * Displays job applications received for the principal's school.
 * Allows review, shortlisting, and status updates.
 * ≤400 lines per WARP.md.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { HiringHubService } from '@/lib/services/HiringHubService';
import { assertSupabase } from '@/lib/supabase';
import type { ApplicationWithDetails } from '@/types/hiring';
import {
  ApplicationStatus,
  getApplicationStatusLabel,
  getApplicationStatusColor,
  formatSalaryRange,
  getExperienceLabel,
} from '@/types/hiring';
import type { AlertButton } from '@/components/ui/AlertModal';

interface ApplicationsViewProps {
  preschoolId: string | null;
  userId?: string;
  theme?: ThemeColors;
  showAlert: (cfg: {
    title: string;
    message?: string;
    type?: 'info' | 'warning' | 'success' | 'error';
    buttons?: AlertButton[];
  }) => void;
  onCreateAccount?: (email: string, name: string) => void;
}

export function ApplicationsView({
  preschoolId,
  userId,
  theme,
  showAlert,
  onCreateAccount,
}: ApplicationsViewProps) {
  const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const hasNotifiedErrorRef = React.useRef(false);
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const fetchApplications = useCallback(async () => {
    if (!preschoolId) {
      setApplications([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      const data = await HiringHubService.getApplicationsForSchool(preschoolId);
      setApplications(data);
      hasNotifiedErrorRef.current = false;
    } catch (err) {
      console.error('[ApplicationsView] fetch error:', err);
      const rawMessage = err instanceof Error ? err.message : 'Failed to load applications.';
      const friendlyMessage = rawMessage.toLowerCase().includes('permission denied for table users')
        ? 'Applications are temporarily unavailable due to a database policy issue.'
        : rawMessage;
      setLoadError(friendlyMessage);
      if (!hasNotifiedErrorRef.current) {
        showAlert({
          title: 'Applications Unavailable',
          message: friendlyMessage,
          type: 'warning',
        });
        hasNotifiedErrorRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [preschoolId, showAlert]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const filtered =
    filter === 'all'
      ? applications
      : applications.filter((a) => a.status === filter);

  const handleUpdateStatus = useCallback(
    (app: ApplicationWithDetails, newStatus: ApplicationStatus) => {
      showAlert({
        title: 'Update Status',
        message: `Move ${app.candidate_name}'s application to "${getApplicationStatusLabel(newStatus)}"?`,
        type: 'info',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              try {
                await HiringHubService.reviewApplication(
                  { application_id: app.id, status: newStatus },
                  userId || ''
                );
                await fetchApplications();
                showAlert({
                  title: 'Updated',
                  message: `Application moved to ${getApplicationStatusLabel(newStatus)}.`,
                  type: 'success',
                });
              } catch (err) {
                console.error('[ApplicationsView] status update error:', err);
                showAlert({
                  title: 'Error',
                  message: 'Failed to update application status.',
                  type: 'error',
                });
              }
            },
          },
        ],
      });
    },
    [userId, fetchApplications, showAlert]
  );

  const handleViewResume = useCallback(
    async (resumePath: string) => {
      try {
        const { data } = await assertSupabase()
          .storage.from('candidate-resumes')
          .createSignedUrl(resumePath, 3600);
        if (data?.signedUrl) {
          Linking.openURL(data.signedUrl);
        } else {
          showAlert({ title: 'Error', message: 'Could not generate resume link.', type: 'error' });
        }
      } catch {
        showAlert({ title: 'Error', message: 'Failed to open resume.', type: 'error' });
      }
    },
    [showAlert]
  );

  const statusActions = (app: ApplicationWithDetails): { label: string; status: ApplicationStatus; color: string }[] => {
    const s = app.status;
    const actions: { label: string; status: ApplicationStatus; color: string }[] = [];
    if (s === ApplicationStatus.NEW) {
      actions.push({ label: 'Review', status: ApplicationStatus.UNDER_REVIEW, color: '#F59E0B' });
      actions.push({ label: 'Reject', status: ApplicationStatus.REJECTED, color: '#EF4444' });
    }
    if (s === ApplicationStatus.UNDER_REVIEW) {
      actions.push({ label: 'Shortlist', status: ApplicationStatus.SHORTLISTED, color: '#8B5CF6' });
      actions.push({ label: 'Reject', status: ApplicationStatus.REJECTED, color: '#EF4444' });
    }
    if (s === ApplicationStatus.SHORTLISTED) {
      actions.push({ label: 'Schedule Interview', status: ApplicationStatus.INTERVIEW_SCHEDULED, color: '#EC4899' });
      actions.push({ label: 'Reject', status: ApplicationStatus.REJECTED, color: '#EF4444' });
    }
    if (s === ApplicationStatus.INTERVIEW_SCHEDULED) {
      actions.push({ label: 'Send Offer', status: ApplicationStatus.OFFERED, color: '#10B981' });
      actions.push({ label: 'Reject', status: ApplicationStatus.REJECTED, color: '#EF4444' });
    }
    if (s === ApplicationStatus.OFFERED) {
      actions.push({ label: 'Mark Accepted', status: ApplicationStatus.ACCEPTED, color: '#059669' });
    }
    return actions;
  };

  const renderApplication = ({ item }: { item: ApplicationWithDetails }) => {
    const statusColor = getApplicationStatusColor(item.status);
    const actions = statusActions(item);

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.avatar, { backgroundColor: statusColor + '20' }]}>
              <Ionicons name="person" size={20} color={statusColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.candidateName}>{item.candidate_name}</Text>
              <Text style={styles.candidateEmail}>{item.candidate_email}</Text>
              {item.candidate_phone ? (
                <Text style={styles.candidatePhone}>{item.candidate_phone}</Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getApplicationStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="briefcase-outline" size={14} color={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.detailText}>{item.job_title || 'Unknown Position'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="time-outline" size={14} color={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.detailText}>
              {getExperienceLabel(item.candidate_experience_years)}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={14} color={theme?.textSecondary || '#6b7280'} />
            <Text style={styles.detailText}>
              {new Date(item.applied_at).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {/* Cover letter excerpt */}
        {item.cover_letter ? (
          <Text style={styles.coverLetter} numberOfLines={2}>
            {item.cover_letter}
          </Text>
        ) : null}

        {/* Resume + Actions */}
        <View style={styles.actionsRow}>
          {item.has_resume && item.resume_file_path ? (
            <TouchableOpacity
              style={styles.resumeBtn}
              onPress={() => handleViewResume(item.resume_file_path!)}
            >
              <Ionicons name="document-text-outline" size={16} color="#4F46E5" />
              <Text style={styles.resumeBtnText}>View Resume</Text>
            </TouchableOpacity>
          ) : null}

          {item.status === ApplicationStatus.ACCEPTED && onCreateAccount ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#10B981' + '15' }]}
              onPress={() => onCreateAccount(item.candidate_email, item.candidate_name)}
            >
              <Ionicons name="person-add-outline" size={14} color="#10B981" />
              <Text style={[styles.actionBtnText, { color: '#10B981', marginLeft: 4 }]}>Create Account</Text>
            </TouchableOpacity>
          ) : null}

          {actions.map((a) => (
            <TouchableOpacity
              key={a.status}
              style={[styles.actionBtn, { backgroundColor: a.color + '15' }]}
              onPress={() => handleUpdateStatus(item, a.status)}
            >
              <Text style={[styles.actionBtnText, { color: a.color }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const filterChips: { label: string; value: ApplicationStatus | 'all' }[] = [
    { label: 'All', value: 'all' },
    { label: 'New', value: ApplicationStatus.NEW },
    { label: 'Reviewing', value: ApplicationStatus.UNDER_REVIEW },
    { label: 'Shortlisted', value: ApplicationStatus.SHORTLISTED },
    { label: 'Offered', value: ApplicationStatus.OFFERED },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Job Applications</Text>
        <Text style={styles.sectionSubtitle}>
          {applications.length} application{applications.length !== 1 ? 's' : ''}
        </Text>
      </View>
      {loadError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color="#B45309" />
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </View>
      ) : null}

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {filterChips.map((c) => (
          <TouchableOpacity
            key={c.value}
            style={[styles.filterChip, filter === c.value && styles.filterChipActive]}
            onPress={() => setFilter(c.value)}
          >
            <Text style={[styles.filterChipText, filter === c.value && styles.filterChipTextActive]}>
              {c.label}
              {c.value !== 'all'
                ? ` (${applications.filter((a) => a.status === c.value).length})`
                : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlashList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderApplication}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchApplications} />}
        estimatedItemSize={120}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={theme?.primary || '#4F46E5'} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={theme?.textSecondary || '#9ca3af'} />
              <Text style={styles.emptyTitle}>No Applications Yet</Text>
              <Text style={styles.emptyText}>
                When teachers apply through your job postings, they'll appear here.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const createStyles = (theme?: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 16 },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      marginTop: 8,
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: theme?.text || '#111827' },
    sectionSubtitle: { fontSize: 14, color: theme?.textSecondary || '#6b7280' },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: '#F59E0B',
      backgroundColor: '#FEF3C7',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 10,
    },
    errorBannerText: {
      flex: 1,
      color: '#92400E',
      fontSize: 12,
      fontWeight: '600',
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
      flexWrap: 'wrap',
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme?.border || '#334155',
      backgroundColor: theme?.surface || '#1e293b',
    },
    filterChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
    filterChipText: { color: theme?.textSecondary || '#9ca3af', fontSize: 12, fontWeight: '600' },
    filterChipTextActive: { color: '#fff', fontWeight: '700' },
    listContent: { paddingBottom: 24 },
    card: {
      backgroundColor: theme?.cardBackground || '#1e293b',
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme?.border || '#334155',
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    candidateName: { fontSize: 16, fontWeight: '700', color: theme?.text || '#f1f5f9' },
    candidateEmail: { fontSize: 13, color: theme?.textSecondary || '#94a3b8', marginTop: 1 },
    candidatePhone: { fontSize: 12, color: theme?.textSecondary || '#94a3b8', marginTop: 1 },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: '700' },
    detailsRow: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 10,
      flexWrap: 'wrap',
    },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    detailText: { fontSize: 12, color: theme?.textSecondary || '#94a3b8' },
    coverLetter: {
      fontSize: 13,
      color: theme?.textSecondary || '#94a3b8',
      fontStyle: 'italic',
      marginBottom: 10,
      lineHeight: 18,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 4,
    },
    resumeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#4F46E5' + '15',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    resumeBtnText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    actionBtnText: { fontSize: 12, fontWeight: '700' },
    emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: theme?.text || '#f1f5f9' },
    emptyText: { fontSize: 13, color: theme?.textSecondary || '#94a3b8', textAlign: 'center', maxWidth: 260 },
  });

export default ApplicationsView;
