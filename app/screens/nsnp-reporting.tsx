/**
 * NSNP (National School Nutrition Programme) Reporting
 *
 * Teachers record daily meal counts per class.
 * Principals/admins see school-wide summaries.
 *
 * ≤500 lines (WARP.md compliant for screens)
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTeacherSchool } from '@/hooks/useTeacherSchool';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

const TAG = 'NSNPReporting';

export default function NSNPReportingScreen() {
  const { profile } = useAuth();
  const { theme, isDark } = useTheme();
  const { schoolId } = useTeacherSchool();
  const { showAlert, alertProps } = useAlertModal();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  // Form state
  const [mealsServed, setMealsServed] = useState('');
  const [fundedCount, setFundedCount] = useState('');
  const [menuDescription, setMenuDescription] = useState('');
  const [showForm, setShowForm] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  // Fetch NSNP records
  const recordsQuery = useQuery({
    queryKey: ['nsnp_records', schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await assertSupabase()
        .from('nsnp_records')
        .select('*')
        .eq('organization_id', schoolId)
        .order('date', { ascending: false })
        .limit(60);
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Aggregate stats
  const stats = useMemo(() => {
    const records = recordsQuery.data || [];
    const thisMonth = records.filter((r) => r.date?.startsWith(todayStr.slice(0, 7)));
    const totalMeals = thisMonth.reduce((s, r) => s + Number(r.meals_served || 0), 0);
    const totalFunded = thisMonth.reduce((s, r) => s + Number(r.funded_count || 0), 0);
    return { totalMeals, totalFunded, daysLogged: thisMonth.length };
  }, [recordsQuery.data, todayStr]);

  // Check if already logged today
  const todayRecord = useMemo(() => {
    return (recordsQuery.data || []).find((r) => r.date === todayStr && r.recorded_by === profile?.id);
  }, [recordsQuery.data, todayStr, profile?.id]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !schoolId) throw new Error('Not authenticated or no school');
      const meals = parseInt(mealsServed, 10);
      const funded = parseInt(fundedCount, 10);
      if (!meals || meals < 0) throw new Error('Meals served must be a positive number');
      if (funded < 0) throw new Error('Funded count cannot be negative');
      if (funded > meals) throw new Error('Funded count cannot exceed meals served');

      const { error } = await assertSupabase().from('nsnp_records').insert({
        organization_id: schoolId,
        date: todayStr,
        meals_served: meals,
        funded_count: funded || 0,
        menu_description: menuDescription.trim() || null,
        recorded_by: profile.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nsnp_records'] });
      setMealsServed('');
      setFundedCount('');
      setMenuDescription('');
      setShowForm(false);
      showAlert({ title: 'Recorded', message: 'NSNP meal record saved for today.', type: 'success' });
      logger.info(TAG, 'NSNP record saved');
    },
    onError: (err: Error) => {
      showAlert({ title: 'Save Failed', message: err.message, type: 'error' });
    },
  });

  const renderRecord = useCallback(
    ({ item }: { item: any }) => (
      <View style={[styles.recordCard, { borderColor: theme.border }]}>
        <View style={styles.recordHeader}>
          <Text style={[styles.recordDate, { color: theme.text }]}>
            {new Date(item.date).toLocaleDateString('en-ZA', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </Text>
          <View style={[styles.mealsBadge, { backgroundColor: '#F5920020' }]}>
            <Ionicons name="restaurant" size={14} color="#F59200" />
            <Text style={[styles.mealsText, { color: '#F59200' }]}>{item.meals_served}</Text>
          </View>
        </View>
        {item.menu_description ? (
          <Text style={[styles.menuText, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.menu_description}
          </Text>
        ) : null}
        <View style={styles.recordFooter}>
          <Text style={[styles.fundedText, { color: theme.textSecondary }]}>
            Funded: {item.funded_count || 0}
          </Text>
        </View>
      </View>
    ),
    [theme, styles]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ title: 'NSNP Meal Reporting', headerShown: true }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Monthly Summary */}
        <View style={styles.summarySection}>
          <Text style={[styles.monthLabel, { color: theme.textSecondary }]}>
            {new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
          </Text>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: '#F5920020' }]}>
              <Text style={[styles.summaryValue, { color: '#F59200' }]}>{stats.totalMeals}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Meals</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#10B98120' }]}>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>{stats.totalFunded}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Funded</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#3B82F620' }]}>
              <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>{stats.daysLogged}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Days Logged</Text>
            </View>
          </View>
        </View>

        {/* Today Status / Add Button */}
        {todayRecord ? (
          <View style={[styles.todayBanner, { backgroundColor: '#10B98120' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={[styles.todayText, { color: '#10B981' }]}>
              Today recorded: {todayRecord.meals_served} meals served
            </Text>
          </View>
        ) : !showForm ? (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={() => setShowForm(true)}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Record Today&apos;s Meals</Text>
          </TouchableOpacity>
        ) : null}

        {/* Form */}
        {showForm && !todayRecord && (
          <View style={[styles.formContainer, { borderColor: theme.border }]}>
            <Text style={[styles.formTitle, { color: theme.text }]}>Today&apos;s Meal Record</Text>

            <Text style={[styles.label, { color: theme.textSecondary }]}>Meals Served</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={mealsServed}
              onChangeText={setMealsServed}
              keyboardType="number-pad"
              placeholder="Total meals served"
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>Funded Learners Fed</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={fundedCount}
              onChangeText={setFundedCount}
              keyboardType="number-pad"
              placeholder="NSNP-funded count"
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>Menu (optional)</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={menuDescription}
              onChangeText={setMenuDescription}
              placeholder="e.g. Pap and beans, fruit"
              placeholderTextColor={theme.textSecondary}
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => setShowForm(false)}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.primary }]}
                onPress={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Save Record</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* History List */}
        <View style={styles.historyHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Records</Text>
        </View>

        {recordsQuery.isLoading ? (
          <View style={styles.center}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        ) : (recordsQuery.data?.length || 0) === 0 ? (
          <View style={styles.center}>
            <Ionicons name="nutrition-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No NSNP records yet
            </Text>
          </View>
        ) : (
          <FlatList
            data={recordsQuery.data}
            keyExtractor={(item) => item.id}
            renderItem={renderRecord}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          />
        )}
      </KeyboardAvoidingView>

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    summarySection: { padding: 16, paddingBottom: 8 },
    monthLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
    summaryRow: { flexDirection: 'row', gap: 10 },
    summaryCard: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    summaryValue: { fontSize: 24, fontWeight: '800' },
    summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 4 },
    todayBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 12,
      borderRadius: 10,
    },
    todayText: { fontSize: 14, fontWeight: '600' },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
      paddingVertical: 12,
      borderRadius: 10,
    },
    addButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    formContainer: {
      marginHorizontal: 16,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 12,
      backgroundColor: isDark ? '#111' : '#FAFAFA',
    },
    formTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
    input: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    formActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
    },
    cancelText: { fontSize: 15, fontWeight: '600' },
    saveButton: {
      flex: 2,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    historyHeader: { paddingHorizontal: 16, paddingTop: 8 },
    sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
    recordCard: {
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 10,
      backgroundColor: isDark ? '#111' : '#fff',
    },
    recordHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    recordDate: { fontSize: 15, fontWeight: '700' },
    mealsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    mealsText: { fontSize: 14, fontWeight: '700' },
    menuText: { fontSize: 13, marginBottom: 6 },
    recordFooter: { flexDirection: 'row' },
    fundedText: { fontSize: 12 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 15, textAlign: 'center' },
  });
