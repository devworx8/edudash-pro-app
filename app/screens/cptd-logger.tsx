/**
 * SACE CPTD Activity Logger
 *
 * Teachers log Continuing Professional Teacher Development activities
 * for SACE points. Includes form entry + history list.
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

const SACE_CATEGORIES = [
  'Teacher-initiated',
  'School-initiated',
  'Employer-initiated',
  'SACE-approved',
  'Other',
] as const;

const ACTIVITY_TYPES = [
  'Workshop',
  'Conference',
  'Mentoring',
  'Research',
  'Self-study',
  'Online course',
  'Peer observation',
  'Community engagement',
  'Publication',
  'Other',
] as const;

const TAG = 'CPTDLogger';

export default function CPTDLoggerScreen() {
  const { profile } = useAuth();
  const { theme, isDark } = useTheme();
  const { schoolId } = useTeacherSchool();
  const { showAlert, alertProps } = useAlertModal();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  // Form state
  const [activityType, setActivityType] = useState<string>('Workshop');
  const [saceCategory, setSaceCategory] = useState<string>('Teacher-initiated');
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Fetch CPTD history
  const historyQuery = useQuery({
    queryKey: ['cptd_activities', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await assertSupabase()
        .from('cptd_activities')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('logged_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Calculate totals
  const totalHours = useMemo(() => {
    const activities = historyQuery.data || [];
    return activities.reduce((sum, a) => sum + Number(a.hours || 0), 0);
  }, [historyQuery.data]);

  const totalActivities = historyQuery.data?.length || 0;

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Not authenticated');
      const parsedHours = parseFloat(hours);
      if (!parsedHours || parsedHours <= 0) throw new Error('Hours must be a positive number');
      if (!description.trim()) throw new Error('Description is required');

      const { error } = await assertSupabase()
        .from('cptd_activities')
        .insert({
          teacher_id: profile.id,
          organization_id: schoolId || null,
          activity_type: activityType,
          hours: parsedHours,
          description: description.trim(),
          sace_category: saceCategory,
          activity_date: new Date().toISOString().split('T')[0],
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cptd_activities'] });
      setHours('');
      setDescription('');
      setShowForm(false);
      showAlert({ title: 'Activity Logged', message: 'CPTD activity recorded successfully.', type: 'success' });
      logger.info(TAG, 'CPTD activity saved');
    },
    onError: (err: Error) => {
      showAlert({ title: 'Save Failed', message: err.message, type: 'error' });
    },
  });

  const renderActivity = useCallback(
    ({ item }: { item: any }) => (
      <View style={[styles.activityCard, { borderColor: theme.border }]}>
        <View style={styles.activityHeader}>
          <View style={[styles.typeBadge, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.typeBadgeText, { color: theme.primary }]}>{item.activity_type}</Text>
          </View>
          <Text style={[styles.hoursText, { color: '#10B981' }]}>{item.hours}h</Text>
        </View>
        <Text style={[styles.descriptionText, { color: theme.text }]} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.activityFooter}>
          <Text style={[styles.categoryText, { color: theme.textSecondary }]}>
            {item.sace_category}
          </Text>
          <Text style={[styles.dateText, { color: theme.textSecondary }]}>
            {new Date(item.logged_at).toLocaleDateString('en-ZA')}
          </Text>
        </View>
      </View>
    ),
    [theme, styles]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ title: 'CPTD Activity Log', headerShown: true }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Summary */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: '#10B98120' }]}>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>{totalHours.toFixed(1)}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total Hours</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#3B82F620' }]}>
              <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>{totalActivities}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Activities</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#8B5CF620' }]}>
              <Text style={[styles.summaryValue, { color: '#8B5CF6' }]}>
                {Math.floor(totalHours / 15)}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>SACE Points*</Text>
            </View>
          </View>
          <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
            *Estimated (15 hours ≈ 1 SACE point). Verify with SACE.
          </Text>
        </View>

        {/* Add Button / Form Toggle */}
        {!showForm && (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={() => setShowForm(true)}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Log New Activity</Text>
          </TouchableOpacity>
        )}

        {/* Form */}
        {showForm && (
          <View style={[styles.formContainer, { borderColor: theme.border }]}>
            <Text style={[styles.formTitle, { color: theme.text }]}>New CPTD Activity</Text>

            {/* Activity Type Chips */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Activity Type</Text>
            <FlatList
              data={ACTIVITY_TYPES as unknown as string[]}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.chip, activityType === item && styles.chipActive]}
                  onPress={() => setActivityType(item)}
                >
                  <Text style={[styles.chipText, activityType === item && styles.chipTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
            />

            {/* SACE Category */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>SACE Category</Text>
            <FlatList
              data={SACE_CATEGORIES as unknown as string[]}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.chip, saceCategory === item && styles.chipActive]}
                  onPress={() => setSaceCategory(item)}
                >
                  <Text style={[styles.chipText, saceCategory === item && styles.chipTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
            />

            {/* Hours */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Hours</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={hours}
              onChangeText={setHours}
              keyboardType="decimal-pad"
              placeholder="e.g. 2.5"
              placeholderTextColor={theme.textSecondary}
            />

            {/* Description */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.border }]}
              value={description}
              onChangeText={setDescription}
              placeholder="What did you learn or do?"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
            />

            {/* Form Actions */}
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
                  <Text style={styles.saveText}>Save Activity</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* History List */}
        <View style={styles.historyHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Activity History</Text>
        </View>

        {historyQuery.isLoading ? (
          <View style={styles.center}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        ) : (historyQuery.data?.length || 0) === 0 ? (
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No CPTD activities logged yet
            </Text>
          </View>
        ) : (
          <FlatList
            data={historyQuery.data}
            keyExtractor={(item) => item.id}
            renderItem={renderActivity}
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
    summaryRow: { flexDirection: 'row', gap: 10 },
    summaryCard: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    summaryValue: { fontSize: 24, fontWeight: '800' },
    summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 4 },
    disclaimer: { fontSize: 11, marginTop: 8, textAlign: 'center' },
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
    multiline: { minHeight: 72, textAlignVertical: 'top' },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: isDark ? '#1f1f2e' : '#F3F4F6',
    },
    chipActive: {
      backgroundColor: theme.primary + '20',
      borderWidth: 1,
      borderColor: theme.primary,
    },
    chipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    chipTextActive: { color: theme.primary },
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
    activityCard: {
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 10,
      backgroundColor: isDark ? '#111' : '#fff',
    },
    activityHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    typeBadgeText: { fontSize: 12, fontWeight: '700' },
    hoursText: { fontSize: 18, fontWeight: '800' },
    descriptionText: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
    activityFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    categoryText: { fontSize: 12 },
    dateText: { fontSize: 12 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 15, textAlign: 'center' },
  });
