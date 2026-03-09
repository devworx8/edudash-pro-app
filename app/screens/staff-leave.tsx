/**
 * Staff Leave Management Screen
 *
 * Principals can view, approve, and reject staff leave requests.
 * Staff can submit leave requests and track their status.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface LeaveRequest {
  id: string;
  staff_id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  staff_name?: string;
}

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  pending: { color: '#F59E0B', icon: 'time-outline', label: 'Pending' },
  approved: { color: '#10B981', icon: 'checkmark-circle', label: 'Approved' },
  rejected: { color: '#EF4444', icon: 'close-circle', label: 'Rejected' },
  cancelled: { color: '#6B7280', icon: 'ban', label: 'Cancelled' },
};

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  family_responsibility: 'Family Responsibility',
  maternity: 'Maternity Leave',
  unpaid: 'Unpaid Leave',
  study: 'Study Leave',
  compassionate: 'Compassionate Leave',
  other: 'Other',
};

type FilterTab = 'pending' | 'all';

export default function StaffLeaveScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const styles = createStyles(theme);
  const organizationId = extractOrganizationId(profile);
  const isPrincipal = profile?.role === 'principal' || profile?.role === 'admin' || profile?.role === 'principal_admin';

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('pending');

  const fetchRequests = useCallback(async () => {
    if (!organizationId) return;
    try {
      const supabase = assertSupabase();
      let query = supabase
        .from('staff_leave_requests')
        .select('*')
        .eq('school_id', organizationId)
        .order('created_at', { ascending: false });

      // Non-principals see only their own
      if (!isPrincipal) {
        query = query.eq('staff_id', user?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests((data as LeaveRequest[]) || []);
    } catch (err) {
      logger.error('[StaffLeave]', 'Failed to load leave requests', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, isPrincipal, user?.id]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRequests();
  }, [fetchRequests]);

  const handleAction = useCallback(async (id: string, action: 'approved' | 'rejected') => {
    try {
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('staff_leave_requests')
        .update({ status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      fetchRequests();
    } catch (err) {
      logger.error('[StaffLeave]', `Failed to ${action} request`, err);
    }
  }, [user?.id, fetchRequests]);

  const filtered = filter === 'pending'
    ? requests.filter((r) => r.status === 'pending')
    : requests;

  const renderItem = ({ item }: { item: LeaveRequest }) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: `${config.color}20` }]}>
            <Ionicons name={config.icon as any} size={14} color={config.color} />
            <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
          </View>
          <Text style={styles.daysTag}>{item.days_requested}d</Text>
        </View>
        <Text style={styles.leaveType}>{LEAVE_LABELS[item.leave_type] || item.leave_type}</Text>
        <Text style={styles.dateRange}>
          {new Date(item.start_date).toLocaleDateString()} – {new Date(item.end_date).toLocaleDateString()}
        </Text>
        {item.reason && <Text style={styles.reason} numberOfLines={2}>{item.reason}</Text>}
        {isPrincipal && item.status === 'pending' && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleAction(item.id, 'approved')}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleAction(item.id, 'rejected')}>
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <DesktopLayout role="principal" title="Staff Leave">
        <Stack.Screen options={{ title: 'Staff Leave', headerShown: false }} />
        <View style={styles.center}><EduDashSpinner /></View>
      </DesktopLayout>
    );
  }

  return (
    <DesktopLayout role="principal" title="Staff Leave">
      <Stack.Screen options={{ title: 'Staff Leave', headerShown: false }} />

      <View style={styles.container}>
        <Text style={styles.heading}>Staff Leave</Text>
        <Text style={styles.subtitle}>
          {isPrincipal ? 'Review and manage staff leave requests' : 'View your leave requests'}
        </Text>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          {(['pending', 'all'] as FilterTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.filterTab, filter === tab && styles.filterTabActive]}
              onPress={() => setFilter(tab)}
            >
              <Text style={[styles.filterText, filter === tab && styles.filterTextActive]}>
                {tab === 'pending' ? `Pending (${requests.filter((r) => r.status === 'pending').length})` : 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          estimatedItemSize={80}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
              <Text style={styles.emptyText}>No leave requests</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      </View>

      {/* FAB — Submit Leave Request */}
      <TouchableOpacity style={[styles.fab, { backgroundColor: theme.primary }]} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, padding: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    heading: { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 4 },
    subtitle: { fontSize: 14, color: theme.textSecondary, marginBottom: 12 },
    filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    filterTab: {
      paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
      borderWidth: 1, borderColor: theme.border,
      backgroundColor: theme.cardBackground || theme.surface,
    },
    filterTabActive: { backgroundColor: `${theme.primary}15`, borderColor: theme.primary },
    filterText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    filterTextActive: { color: theme.primary },
    card: {
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: theme.border,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    badgeText: { fontSize: 12, fontWeight: '700' },
    daysTag: { fontSize: 13, fontWeight: '700', color: theme.primary },
    leaveType: { fontSize: 15, fontWeight: '600', color: theme.text },
    dateRange: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
    reason: { fontSize: 13, color: theme.textSecondary, marginTop: 6, fontStyle: 'italic' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
    actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    approveBtn: { backgroundColor: '#10B981' },
    rejectBtn: { backgroundColor: '#EF4444' },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, fontWeight: '600', color: theme.text, marginTop: 12 },
    fab: {
      position: 'absolute', right: 20, bottom: 28, width: 56, height: 56,
      borderRadius: 28, justifyContent: 'center', alignItems: 'center',
      elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2, shadowRadius: 5,
    },
  });
