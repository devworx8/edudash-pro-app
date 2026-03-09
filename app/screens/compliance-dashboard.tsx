/**
 * Compliance Dashboard Screen
 *
 * Principals can track regulatory compliance items (DSD, health & safety,
 * fire certificates, food hygiene, staff qualifications, etc.).
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

interface ComplianceCheck {
  id: string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  completed_date: string | null;
  expiry_date: string | null;
  inspector_name: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  compliant: { color: '#10B981', icon: 'checkmark-circle', label: 'Compliant' },
  non_compliant: { color: '#EF4444', icon: 'alert-circle', label: 'Non-Compliant' },
  pending_review: { color: '#F59E0B', icon: 'time-outline', label: 'Pending Review' },
  expired: { color: '#EF4444', icon: 'warning', label: 'Expired' },
  not_applicable: { color: '#6B7280', icon: 'remove-circle', label: 'N/A' },
};

const CATEGORY_ICONS: Record<string, string> = {
  health_safety: '🏥',
  dsd_registration: '📋',
  fire_certificate: '🔥',
  building_compliance: '🏗️',
  food_hygiene: '🍽️',
  staff_qualifications: '🎓',
  first_aid: '⛑️',
  insurance: '🛡️',
  curriculum: '📚',
  child_protection: '👶',
  other: '📎',
};

const CATEGORY_LABELS: Record<string, string> = {
  health_safety: 'Health & Safety',
  dsd_registration: 'DSD Registration',
  fire_certificate: 'Fire Certificate',
  building_compliance: 'Building Compliance',
  food_hygiene: 'Food Hygiene',
  staff_qualifications: 'Staff Qualifications',
  first_aid: 'First Aid',
  insurance: 'Insurance',
  curriculum: 'Curriculum',
  child_protection: 'Child Protection',
  other: 'Other',
};

export default function ComplianceDashboardScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const styles = createStyles(theme);
  const organizationId = extractOrganizationId(profile);

  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChecks = useCallback(async () => {
    if (!organizationId) return;
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('school_compliance_checks')
        .select('*')
        .eq('school_id', organizationId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setChecks((data as ComplianceCheck[]) || []);
    } catch (err) {
      logger.error('[Compliance]', 'Failed to load checks', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { fetchChecks(); }, [fetchChecks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChecks();
  }, [fetchChecks]);

  // Summary counts
  const compliant = checks.filter((c) => c.status === 'compliant').length;
  const issues = checks.filter((c) => c.status === 'non_compliant' || c.status === 'expired').length;
  const pending = checks.filter((c) => c.status === 'pending_review').length;
  const total = checks.filter((c) => c.status !== 'not_applicable').length;
  const score = total > 0 ? Math.round((compliant / total) * 100) : 0;

  const renderItem = ({ item }: { item: ComplianceCheck }) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending_review;
    const categoryIcon = CATEGORY_ICONS[item.category] || '📎';
    const isOverdue = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'compliant';

    return (
      <View style={[styles.card, isOverdue && styles.cardOverdue]}>
        <View style={styles.cardHeader}>
          <Text style={styles.categoryIcon}>{categoryIcon}</Text>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.category}>{CATEGORY_LABELS[item.category] || item.category}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${config.color}20` }]}>
            <Ionicons name={config.icon as any} size={12} color={config.color} />
            <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>

        {item.description && <Text style={styles.description} numberOfLines={2}>{item.description}</Text>}

        <View style={styles.metaRow}>
          {item.due_date && (
            <Text style={[styles.metaText, isOverdue && { color: '#EF4444' }]}>
              {isOverdue ? '⚠️ Overdue: ' : '📅 Due: '}
              {new Date(item.due_date).toLocaleDateString()}
            </Text>
          )}
          {item.expiry_date && (
            <Text style={styles.metaText}>
              🔄 Expires: {new Date(item.expiry_date).toLocaleDateString()}
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <DesktopLayout role="principal" title="Compliance">
        <Stack.Screen options={{ title: 'Compliance', headerShown: false }} />
        <View style={styles.center}><EduDashSpinner /></View>
      </DesktopLayout>
    );
  }

  return (
    <DesktopLayout role="principal" title="Compliance Dashboard">
      <Stack.Screen options={{ title: 'Compliance', headerShown: false }} />

      <View style={styles.container}>
        <Text style={styles.heading}>Compliance Dashboard</Text>
        <Text style={styles.subtitle}>Track regulatory requirements and certifications</Text>

        {/* Score Overview */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreCircle}>
            <Text style={[styles.scoreValue, { color: score >= 80 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444' }]}>
              {score}%
            </Text>
          </View>
          <View style={styles.scoreMeta}>
            <Text style={styles.scoreLabel}>Compliance Score</Text>
            <View style={styles.scoreDetails}>
              <Text style={[styles.scoreDetail, { color: '#10B981' }]}>✓ {compliant} compliant</Text>
              {issues > 0 && <Text style={[styles.scoreDetail, { color: '#EF4444' }]}>✗ {issues} issues</Text>}
              {pending > 0 && <Text style={[styles.scoreDetail, { color: '#F59E0B' }]}>⏳ {pending} pending</Text>}
            </View>
          </View>
        </View>

        <FlashList
          data={checks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          estimatedItemSize={80}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark-outline" size={48} color={theme.textSecondary} />
              <Text style={styles.emptyText}>No compliance items tracked</Text>
              <Text style={styles.emptyHint}>Add your first compliance check</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      </View>

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
    subtitle: { fontSize: 14, color: theme.textSecondary, marginBottom: 16 },
    scoreCard: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 16, padding: 16, marginBottom: 16,
      borderWidth: 1, borderColor: theme.border,
    },
    scoreCircle: {
      width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center',
      borderWidth: 3, borderColor: theme.border,
    },
    scoreValue: { fontSize: 22, fontWeight: '800' },
    scoreMeta: { flex: 1 },
    scoreLabel: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 },
    scoreDetails: { gap: 2 },
    scoreDetail: { fontSize: 13, fontWeight: '600' },
    card: {
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: theme.border,
    },
    cardOverdue: { borderColor: '#EF444450' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    categoryIcon: { fontSize: 20 },
    cardHeaderInfo: { flex: 1 },
    title: { fontSize: 15, fontWeight: '600', color: theme.text },
    category: { fontSize: 12, color: theme.textSecondary },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    statusText: { fontSize: 11, fontWeight: '700' },
    description: { fontSize: 13, color: theme.textSecondary, marginBottom: 6 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
    metaText: { fontSize: 12, color: theme.textSecondary },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, fontWeight: '600', color: theme.text, marginTop: 12 },
    emptyHint: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
    fab: {
      position: 'absolute', right: 20, bottom: 28, width: 56, height: 56,
      borderRadius: 28, justifyContent: 'center', alignItems: 'center',
      elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2, shadowRadius: 5,
    },
  });
