// Principal Input Windows Management Screen
// Create, manage, and monitor teacher input windows
// WARP.md compliant (≤500 lines)

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useInputWindows } from '@/hooks/principal/useInputWindows';
import {
  InputWindowCard,
  InputWindowFormModal,
  type InputWindow,
  type InputWindowFormData,
} from '@/components/year-planner/input';

export default function PrincipalInputWindowsScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    windows,
    counts,
    loading,
    refreshing,
    handleRefresh,
    handleCreate,
    handleToggleActive,
  } = useInputWindows(showAlert);

  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all');

  const filteredWindows = useMemo(() => {
    if (filter === 'all') return windows;
    if (filter === 'active') return windows.filter((w) => w.is_active);
    return windows.filter((w) => !w.is_active);
  }, [windows, filter]);

  const handleFormSubmit = useCallback(async (data: InputWindowFormData) => {
    await handleCreate({
      title: data.title,
      description: data.description || undefined,
      windowType: data.windowType,
      academicYear: data.academicYear,
      targetTermId: data.targetTermId || undefined,
      opensAt: data.opensAt.toISOString(),
      closesAt: data.closesAt.toISOString(),
      allowedCategories: data.allowedCategories,
    });
  }, [handleCreate]);

  const handleWindowPress = useCallback((w: InputWindow) => {
    // Navigate to the review screen filtered by this window
    router.push(`/screens/principal-teacher-input-review?windowId=${w.id}` as any);
  }, []);

  const handleManage = useCallback((w: InputWindow) => {
    showAlert({
      title: w.title,
      message: `Status: ${w.is_active ? 'Active' : 'Closed'}\nType: ${w.window_type}\nYear: ${w.academic_year}`,
      type: 'info',
      buttons: [
        {
          text: w.is_active ? 'Close Window' : 'Reopen Window',
          onPress: () => handleToggleActive(w),
          style: w.is_active ? 'destructive' : 'default',
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [handleToggleActive, showAlert]);

  const activeCount = windows.filter((w) => w.is_active).length;
  const closedCount = windows.filter((w) => !w.is_active).length;

  const content = (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Input Windows</Text>
          <Text style={styles.headerSubtitle}>
            Manage planning input periods for your teachers
          </Text>
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.createBtnText}>New Window</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {counts && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.statCount, { color: '#F59E0B' }]}>{counts.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
            <Text style={[styles.statCount, { color: '#10B981' }]}>{counts.approved}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#DBEAFE' }]}>
            <Text style={[styles.statCount, { color: '#3B82F6' }]}>{counts.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>
      )}

      {/* Filter */}
      <View style={styles.filterRow}>
        {([
          { key: 'all', label: `All (${windows.length})` },
          { key: 'active', label: `Active (${activeCount})` },
          { key: 'closed', label: `Closed (${closedCount})` },
        ] as const).map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
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
          {filteredWindows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={48} color={theme.textSecondary} />
              <Text style={styles.emptyTitle}>
                {filter === 'all' ? 'No Input Windows' : `No ${filter} Windows`}
              </Text>
              <Text style={styles.emptyText}>
                Create an input window to start collecting teacher ideas for your year plan.
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowForm(true)}>
                <Ionicons name="add-circle-outline" size={18} color="#3B82F6" />
                <Text style={styles.emptyBtnText}>Create First Window</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredWindows.map((w) => (
              <InputWindowCard
                key={w.id}
                window={w}
                onPress={handleWindowPress}
                onManage={handleManage}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Create Form Modal */}
      <InputWindowFormModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleFormSubmit}
      />

      <AlertModal {...alertProps} />
    </View>
  );

  return (
    <DesktopLayout role="principal" title="Input Windows" showBackButton mobileHeaderTopInsetOffset={4}>
      {content}
    </DesktopLayout>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 14, color: theme.textSecondary, marginTop: 4 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
  },
  statCount: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
  },
  filterChipActive: { backgroundColor: '#3B82F615', borderColor: '#3B82F6' },
  filterText: { fontSize: 13, color: theme.textSecondary, fontWeight: '500' },
  filterTextActive: { color: '#3B82F6', fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#3B82F610', borderWidth: 1, borderColor: '#3B82F640',
  },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: '#3B82F6' },
});
