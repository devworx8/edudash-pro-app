// Teacher Year Plan Input Screen
// Allows teachers to submit suggestions through open input windows
// WARP.md compliant (≤500 lines)

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTeacherPlanInput } from '@/hooks/teacher/useTeacherPlanInput';
import {
  InputWindowCard,
  SubmissionCard,
  SubmissionForm,
  type InputWindow,
  type TeacherSubmission,
  type SubmissionFormData,
  STATUS_CONFIG,
} from '@/components/year-planner/input';

type Tab = 'windows' | 'submissions';

export default function TeacherYearPlanInputScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    windows,
    submissions,
    loading,
    refreshing,
    handleRefresh,
    handleSubmit,
  } = useTeacherPlanInput(showAlert);

  const [activeTab, setActiveTab] = useState<Tab>('windows');
  const [selectedWindow, setSelectedWindow] = useState<InputWindow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const handleWindowPress = useCallback((w: InputWindow) => {
    setSelectedWindow(w);
    setShowForm(true);
  }, []);

  const handleFormSubmit = useCallback(async (formData: SubmissionFormData) => {
    if (!selectedWindow) return;
    await handleSubmit({
      windowId: selectedWindow.id,
      category: formData.category,
      title: formData.title,
      description: formData.description,
      targetTermNumber: formData.targetTermNumber || undefined,
      targetMonth: formData.targetMonth || undefined,
      targetWeekNumber: formData.targetWeekNumber || undefined,
      suggestedDate: formData.suggestedDate || undefined,
      suggestedBucket: formData.suggestedBucket || undefined,
      learningObjectives: formData.learningObjectives,
      materialsNeeded: formData.materialsNeeded,
      estimatedCost: formData.estimatedCost || undefined,
      ageGroups: formData.ageGroups,
      priority: formData.priority,
    });
  }, [selectedWindow, handleSubmit]);

  const handleSubmissionPress = useCallback((s: TeacherSubmission) => {
    const statusLabel = STATUS_CONFIG[s.status]?.label || s.status;
    showAlert({
      title: s.title,
      message: `Status: ${statusLabel}${s.principal_notes ? `\n\nPrincipal's feedback:\n${s.principal_notes}` : ''}${s.description ? `\n\nYour description:\n${s.description}` : ''}`,
      type: 'info',
    });
  }, [showAlert]);

  // Counts for tabs
  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const reviewedCount = submissions.filter((s) => s.status !== 'pending').length;

  const content = (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Year Plan Input</Text>
        <Text style={styles.headerSubtitle}>
          Contribute your ideas to the school year plan
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'windows' && styles.tabActive]}
          onPress={() => setActiveTab('windows')}
        >
          <Ionicons
            name="folder-open-outline"
            size={16}
            color={activeTab === 'windows' ? '#3B82F6' : theme.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'windows' && styles.tabTextActive]}>
            Open Windows
          </Text>
          {windows.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{windows.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'submissions' && styles.tabActive]}
          onPress={() => setActiveTab('submissions')}
        >
          <Ionicons
            name="document-text-outline"
            size={16}
            color={activeTab === 'submissions' ? '#3B82F6' : theme.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'submissions' && styles.tabTextActive]}>
            My Submissions
          </Text>
          {submissions.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{submissions.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <EduDashSpinner />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'windows' ? (
            windows.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="time-outline" size={48} color={theme.textSecondary} />
                <Text style={styles.emptyTitle}>No Open Windows</Text>
                <Text style={styles.emptyText}>
                  Your principal hasn't opened a planning input window yet.{'\n'}
                  Check back later or ask your principal to open one.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionHint}>
                  Tap a window to submit your ideas and suggestions
                </Text>
                {windows.map((w) => {
                  const windowSubs = submissions.filter((s) => s.window_id === w.id).length;
                  return (
                    <InputWindowCard
                      key={w.id}
                      window={w}
                      submissionCount={windowSubs}
                      onPress={handleWindowPress}
                    />
                  );
                })}
              </>
            )
          ) : (
            submissions.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="document-outline" size={48} color={theme.textSecondary} />
                <Text style={styles.emptyTitle}>No Submissions Yet</Text>
                <Text style={styles.emptyText}>
                  Submit your first idea through an open planning window.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.statsRow}>
                  <View style={[styles.statChip, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.statCount, { color: '#F59E0B' }]}>{pendingCount}</Text>
                    <Text style={styles.statLabel}>Pending</Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: '#D1FAE5' }]}>
                    <Text style={[styles.statCount, { color: '#10B981' }]}>{reviewedCount}</Text>
                    <Text style={styles.statLabel}>Reviewed</Text>
                  </View>
                </View>
                {submissions.map((s) => (
                  <SubmissionCard
                    key={s.id}
                    submission={s}
                    onPress={handleSubmissionPress}
                  />
                ))}
              </>
            )
          )}
        </ScrollView>
      )}

      {/* Submission Form Modal */}
      {selectedWindow && (
        <SubmissionForm
          visible={showForm}
          window={selectedWindow}
          onClose={() => { setShowForm(false); setSelectedWindow(null); }}
          onSubmit={handleFormSubmit}
        />
      )}

      <AlertModal {...alertProps} />
    </View>
  );

  return (
    <DesktopLayout role="teacher" title="Year Plan Input" showBackButton mobileHeaderTopInsetOffset={4}>
      {content}
    </DesktopLayout>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 14, color: theme.textSecondary, marginTop: 4 },
  tabRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: theme.card,
  },
  tabActive: { backgroundColor: '#3B82F615' },
  tabText: { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
  tabTextActive: { color: '#3B82F6', fontWeight: '600' },
  tabBadge: {
    backgroundColor: '#3B82F6', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1,
  },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionHint: { fontSize: 13, color: theme.textSecondary, marginBottom: 12 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
  },
  statCount: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
});
