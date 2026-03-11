/**
 * Budget Management Screen
 *
 * Principals can view budget allocations, track spending, and monitor
 * petty cash alongside organization-level budgets.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { assertSupabase } from '@/lib/supabase';
import { usePettyCashDashboard } from '@/hooks/usePettyCashDashboard';
import { formatCurrencyCompact } from '@/lib/utils/payment-utils';
import { logger } from '@/lib/logger';
import { percentWidth } from '@/lib/progress/clampPercent';

interface BudgetItem {
  id: string;
  category: string;
  fiscal_year: string;
  budgeted_amount: number;
  allocated_amount: number;
  spent_amount: number;
  remaining_amount: number;
  utilization_percent: number;
  period_type: string;
  department: string | null;
  status: string;
}

export default function BudgetManagementScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const styles = createStyles(theme);
  const organizationId = extractOrganizationId(profile);

  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { metrics: pettyCash, loading: pettyCashLoading } = usePettyCashDashboard();

  const fetchBudgets = useCallback(async () => {
    if (!organizationId) return;
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('organization_budgets')
        .select('*')
        .eq('organization_id', organizationId)
        .order('category', { ascending: true });

      if (error) throw error;
      setBudgets((data as BudgetItem[]) || []);
    } catch (err) {
      logger.error('[Budget]', 'Failed to load budgets', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBudgets();
  }, [fetchBudgets]);

  // Aggregates
  const totalBudgeted = budgets.reduce((sum, b) => sum + (b.budgeted_amount || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spent_amount || 0), 0);
  const totalRemaining = budgets.reduce((sum, b) => sum + (b.remaining_amount || 0), 0);
  const overallUtil = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  if (loading || pettyCashLoading) {
    return (
      <DesktopLayout role="principal" title="Budget">
        <Stack.Screen options={{ title: 'Budget', headerShown: false }} />
        <View style={styles.center}><EduDashSpinner /></View>
      </DesktopLayout>
    );
  }

  return (
    <DesktopLayout role="principal" title="Budget Management">
      <Stack.Screen options={{ title: 'Budget', headerShown: false }} />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.heading}>Budget & Finance</Text>
        <Text style={styles.subtitle}>Monitor budgets, expenses, and petty cash</Text>

        {/* Overview Cards */}
        <View style={styles.overviewRow}>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Total Budget</Text>
            <Text style={[styles.overviewValue, { color: '#3B82F6' }]}>
              {formatCurrencyCompact(totalBudgeted)}
            </Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Spent</Text>
            <Text style={[styles.overviewValue, { color: '#EF4444' }]}>
              {formatCurrencyCompact(totalSpent)}
            </Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Remaining</Text>
            <Text style={[styles.overviewValue, { color: '#10B981' }]}>
              {formatCurrencyCompact(totalRemaining)}
            </Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Utilization</Text>
            <Text style={[styles.overviewValue, { color: overallUtil > 90 ? '#EF4444' : '#F59E0B' }]}>
              {overallUtil}%
            </Text>
          </View>
        </View>

        {/* Petty Cash Section */}
        {pettyCash && (
          <TouchableOpacity
            style={styles.pettyCashCard}
            onPress={() => router.push('/screens/petty-cash')}
            activeOpacity={0.8}
          >
            <View style={styles.pettyCashHeader}>
              <Text style={styles.sectionTitle}>💵 Petty Cash</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </View>
            <View style={styles.pettyCashGrid}>
              <View style={styles.pettyCashItem}>
                <Text style={styles.pettyCashLabel}>Balance</Text>
                <Text style={[styles.pettyCashValue, { color: '#10B981' }]}>
                  {formatCurrencyCompact(pettyCash.currentBalance || 0)}
                </Text>
              </View>
              <View style={styles.pettyCashItem}>
                <Text style={styles.pettyCashLabel}>Monthly Spend</Text>
                <Text style={[styles.pettyCashValue, { color: '#F59E0B' }]}>
                  {formatCurrencyCompact(pettyCash.monthlyExpenses || 0)}
                </Text>
              </View>
              <View style={styles.pettyCashItem}>
                <Text style={styles.pettyCashLabel}>Pending</Text>
                <Text style={styles.pettyCashValue}>
                  {pettyCash.pendingTransactionsCount || 0}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Budget Categories */}
        <Text style={styles.sectionTitle}>Budget Categories</Text>
        {budgets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color={theme.textSecondary} />
            <Text style={styles.emptyText}>No budgets configured</Text>
            <Text style={styles.emptyHint}>Set up budget categories for your school</Text>
          </View>
        ) : (
          budgets.map((item) => {
            const util = item.utilization_percent || 0;
            const barColor = util > 90 ? '#EF4444' : util > 70 ? '#F59E0B' : '#10B981';
            return (
              <View key={item.id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetCategory}>{item.category}</Text>
                  <Text style={[styles.budgetUtil, { color: barColor }]}>{util}%</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: percentWidth(Math.min(util, 100)), backgroundColor: barColor }]} />
                </View>
                <View style={styles.budgetMeta}>
                  <Text style={styles.budgetMetaText}>
                    {formatCurrencyCompact(item.spent_amount)} / {formatCurrencyCompact(item.budgeted_amount)}
                  </Text>
                  <Text style={styles.budgetMetaText}>
                    {formatCurrencyCompact(item.remaining_amount)} left
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {/* Quick Links */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.qaBtn} onPress={() => router.push('/screens/log-expense')}>
            <Ionicons name="add-circle" size={20} color={theme.primary} />
            <Text style={styles.qaBtnText}>Log Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qaBtn} onPress={() => router.push('/screens/finance-control-center?tab=overview')}>
            <Ionicons name="bar-chart" size={20} color={theme.primary} />
            <Text style={styles.qaBtnText}>Finance Center</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, padding: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    heading: { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 4 },
    subtitle: { fontSize: 14, color: theme.textSecondary, marginBottom: 16 },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginTop: 16, marginBottom: 10 },
    overviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
    overviewCard: {
      flex: 1, minWidth: '45%', backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border,
    },
    overviewLabel: { fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
    overviewValue: { fontSize: 18, fontWeight: '700' },
    pettyCashCard: {
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12, padding: 14, marginTop: 8,
      borderWidth: 1, borderColor: theme.border,
    },
    pettyCashHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    pettyCashGrid: { flexDirection: 'row', gap: 12 },
    pettyCashItem: { flex: 1 },
    pettyCashLabel: { fontSize: 12, color: theme.textSecondary },
    pettyCashValue: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 2 },
    budgetCard: {
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: theme.border,
    },
    budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    budgetCategory: { fontSize: 15, fontWeight: '600', color: theme.text, textTransform: 'capitalize' },
    budgetUtil: { fontSize: 14, fontWeight: '700' },
    progressBar: { height: 6, backgroundColor: `${theme.border}`, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    budgetMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    budgetMetaText: { fontSize: 12, color: theme.textSecondary },
    quickActions: { flexDirection: 'row', gap: 10 },
    qaBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1,
      backgroundColor: theme.cardBackground || theme.surface,
      borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border,
    },
    qaBtnText: { fontSize: 14, fontWeight: '600', color: theme.text },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, fontWeight: '600', color: theme.text, marginTop: 12 },
    emptyHint: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
  });
