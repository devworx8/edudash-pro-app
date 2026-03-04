/**
 * Hiring Hub — Upgraded
 * 
 * Enhanced principal hiring dashboard with:
 * - Quick action cards (Create Job, Bulk CV Import, Workshops)
 * - Enhanced stats with icons
 * - Pipeline progress visualization
 * - Improved application cards with avatar, status, resume indicator
 * - AlertModal instead of Alert.alert
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import HiringHubService from '@/lib/services/HiringHubService';
import type { JobPosting, ApplicationWithDetails } from '@/types/hiring';
import {
  ApplicationStatus,
  JobPostingStatus,
  getApplicationStatusColor,
  getApplicationStatusLabel,
  formatSalaryRange,
} from '@/types/hiring';
import { useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { BasicHiringProcedureChecklist } from '@/components/hiring/BasicHiringProcedureChecklist';

type TabType = 'new' | 'under_review' | 'shortlisted' | 'interview' | 'offered';

export default function HiringHubScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, AlertModalComponent } = useAlertModal();

  const preschoolId = profile?.organization_id || (profile as any)?.preschool_id;
  const [activeTab, setActiveTab] = useState<TabType>('new');

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['hiring-hub-stats', preschoolId],
    queryFn: () => HiringHubService.getHiringHubStats(preschoolId!),
    enabled: !!preschoolId,
  });

  const { data: jobPostings, isLoading: postingsLoading, refetch: refetchPostings } = useQuery({
    queryKey: ['job-postings', preschoolId],
    queryFn: () => HiringHubService.getJobPostings(preschoolId!),
    enabled: !!preschoolId,
  });

  const { data: applications, isLoading: appsLoading, refetch: refetchApps } = useQuery({
    queryKey: ['applications', preschoolId],
    queryFn: () => HiringHubService.getApplicationsForSchool(preschoolId!),
    enabled: !!preschoolId,
  });

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchPostings(), refetchApps()]);
    setRefreshing(false);
  }, [refetchStats, refetchPostings, refetchApps]);

  const filteredApplications = useMemo(() => {
    if (!applications) return [];
    const statusMap: Record<TabType, ApplicationStatus> = {
      new: ApplicationStatus.NEW,
      under_review: ApplicationStatus.UNDER_REVIEW,
      shortlisted: ApplicationStatus.SHORTLISTED,
      interview: ApplicationStatus.INTERVIEW_SCHEDULED,
      offered: ApplicationStatus.OFFERED,
    };
    return applications.filter((app) => app.status === statusMap[activeTab]);
  }, [applications, activeTab]);

  const tabs: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: 'new', label: 'New', icon: 'mail-unread-outline', count: stats?.pending_reviews || 0 },
    { key: 'under_review', label: 'Reviewing', icon: 'eye-outline', count: 0 },
    { key: 'shortlisted', label: 'Shortlisted', icon: 'star-outline', count: stats?.shortlisted_candidates || 0 },
    { key: 'interview', label: 'Interview', icon: 'calendar-outline', count: stats?.scheduled_interviews || 0 },
    { key: 'offered', label: 'Offered', icon: 'document-text-outline', count: stats?.pending_offers || 0 },
  ];

  const quickActions = [
    { label: 'Create Job', icon: 'add-circle-outline' as const, color: '#3B82F6', route: '/screens/job-posting-create' },
    { label: 'Bulk Import', icon: 'cloud-upload-outline' as const, color: '#8B5CF6', route: '/screens/bulk-cv-import' },
    { label: 'Workshops', icon: 'school-outline' as const, color: '#EC4899', route: '/screens/online-workshops' },
    { label: 'Teacher Mgmt', icon: 'people-outline' as const, color: '#10B981', route: '/screens/teacher-management' },
  ];

  if (!preschoolId) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Hiring Hub', headerShown: false }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.error} />
          <Text style={styles.errorText}>No school found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Hiring Hub', headerShown: false }} />
      <AlertModalComponent />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hiring Hub</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.backButton}>
          <Ionicons name="refresh-outline" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredApplications}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <>
            {/* Stats Cards */}
            <View style={styles.statsContainer}>
              <StatCard icon="briefcase-outline" value={stats?.active_job_postings || 0} label="Active Jobs" color="#3B82F6" theme={theme} />
              <StatCard icon="people-outline" value={stats?.total_applications || 0} label="Applications" color="#8B5CF6" theme={theme} />
              <StatCard icon="hourglass-outline" value={stats?.pending_reviews || 0} label="Pending" color="#F59E0B" theme={theme} />
            </View>

            {/* Quick Actions */}
            <View style={styles.quickActions}>
              {quickActions.map((action) => (
                <TouchableOpacity key={action.label} style={styles.quickActionBtn} onPress={() => router.push(action.route as any)}>
                  <View style={[styles.quickActionIcon, { backgroundColor: action.color + '15' }]}>
                    <Ionicons name={action.icon} size={22} color={action.color} />
                  </View>
                  <Text style={styles.quickActionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Basic Hiring Procedure Checklist */}
            <BasicHiringProcedureChecklist theme={theme} defaultCollapsed={true} />

            {/* Job Postings Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Job Postings</Text>
                <TouchableOpacity onPress={() => router.push('/screens/job-posting-create')}>
                  <Text style={styles.linkText}>+ New Job</Text>
                </TouchableOpacity>
              </View>
              {postingsLoading ? (
                <View style={{ paddingVertical: 16 }}><EduDashSpinner size="small" color={theme.primary} /></View>
              ) : (
                <FlatList
                  horizontal
                  data={(jobPostings || []).slice(0, 5)}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item }) => <JobPostingCard job={item} theme={theme} />}
                  ListEmptyComponent={
                    <TouchableOpacity style={styles.emptyJobCard} onPress={() => router.push('/screens/job-posting-create')}>
                      <Ionicons name="add-circle-outline" size={32} color={theme.primary} />
                      <Text style={styles.emptyJobText}>Post your first job</Text>
                    </TouchableOpacity>
                  }
                />
              )}
            </View>

            {/* Pipeline Tabs */}
            <View style={styles.pipelineHeader}>
              <Text style={styles.sectionTitle}>Applicant Pipeline</Text>
              <Text style={styles.pipelineCount}>{applications?.length || 0} total</Text>
            </View>
            <View style={styles.tabsContainer}>
              <FlatList
                horizontal
                data={tabs}
                keyExtractor={(item) => item.key}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.tab, activeTab === item.key && styles.tabActive]}
                    onPress={() => setActiveTab(item.key)}
                  >
                    <Ionicons
                      name={item.icon}
                      size={14}
                      color={activeTab === item.key ? '#FFFFFF' : theme.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.tabText, activeTab === item.key && styles.tabTextActive]}>
                      {item.label}
                    </Text>
                    {item.count > 0 && (
                      <View style={[styles.badge, activeTab === item.key && styles.badgeActive]}>
                        <Text style={[styles.badgeText, activeTab === item.key && styles.badgeTextActive]}>{item.count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </>
        }
        renderItem={({ item }) => <ApplicationCard application={item} theme={theme} />}
        ListEmptyComponent={
          appsLoading ? (
            <View style={styles.loadingContainer}><EduDashSpinner size="large" color={theme.primary} /></View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color={theme.textSecondary} />
              <Text style={styles.emptyText}>No applications in this category</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/screens/job-posting-create')}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function StatCard({ icon, value, label, color, theme }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string; color: string; theme: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
      <Ionicons name={icon} size={20} color={color} style={{ marginBottom: 6 }} />
      <Text style={{ fontSize: 22, fontWeight: '700', color }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

function JobPostingCard({ job, theme }: { job: JobPosting; theme: any }) {
  const statusColor =
    job.status === JobPostingStatus.ACTIVE
      ? '#10B981'
      : job.status === JobPostingStatus.DRAFT
        ? '#F59E0B'
        : '#6B7280';
  return (
    <TouchableOpacity
      style={{ width: 210, padding: 16, borderRadius: 14, marginRight: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
      onPress={() => router.push({ pathname: '/screens/job-posting-create', params: { jobId: job.id } })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor, textTransform: 'uppercase' }}>{job.status}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 4 }} numberOfLines={2}>{job.title}</Text>
      <Text style={{ fontSize: 13, color: theme.primary, fontWeight: '600', marginBottom: 8 }}>
        {formatSalaryRange(job.salary_range_min, job.salary_range_max)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
        <Text style={{ fontSize: 12, color: theme.textSecondary, flex: 1 }} numberOfLines={1}>{job.location || 'Location TBD'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ApplicationCard({ application, theme }: { application: ApplicationWithDetails; theme: any }) {
  const statusColor = getApplicationStatusColor(application.status);
  const initial = (application.candidate_name || 'U')[0].toUpperCase();

  return (
    <TouchableOpacity
      style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border }}
      onPress={() => router.push(`/screens/application-review?id=${application.id}`)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: statusColor + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: statusColor }}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{application.candidate_name}</Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}>{application.job_title}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: statusColor + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: statusColor }}>{getApplicationStatusLabel(application.status)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: theme.textSecondary }}>{new Date(application.applied_at).toLocaleDateString()}</Text>
            {application.has_resume && <Ionicons name="document-attach" size={14} color={theme.primary} />}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
    backButton: { padding: 8 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
    statsContainer: { flexDirection: 'row', padding: 16, gap: 10 },
    quickActions: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
    quickActionBtn: { flex: 1, alignItems: 'center', gap: 6 },
    quickActionIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    quickActionLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary, textAlign: 'center' },
    section: { paddingHorizontal: 16, marginBottom: 16 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    linkText: { fontSize: 13, color: theme.primary, fontWeight: '700' },
    emptyJobCard: { width: 200, height: 120, borderRadius: 14, borderWidth: 2, borderColor: theme.primary + '30', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 8 },
    emptyJobText: { fontSize: 13, color: theme.primary, fontWeight: '600' },
    pipelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
    pipelineCount: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
    tabsContainer: { paddingHorizontal: 16, marginBottom: 12 },
    tab: { paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderRadius: 20, backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border },
    tabActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    tabText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    tabTextActive: { color: '#FFFFFF' },
    badge: { marginLeft: 6, backgroundColor: theme.primary + '20', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
    badgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
    badgeText: { fontSize: 11, fontWeight: '700', color: theme.primary },
    badgeTextActive: { color: '#FFFFFF' },
    listContent: { paddingHorizontal: 16, paddingBottom: 80 },
    fab: { position: 'absolute', right: 16, bottom: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
    loadingContainer: { padding: 32, alignItems: 'center' },
    emptyContainer: { padding: 40, alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 14, color: theme.textSecondary },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { fontSize: 16, color: theme.error, marginTop: 12 },
  });
