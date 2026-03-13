import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { extractOrganizationId } from '@/lib/tenant/compat';
import type { WeeklyPlan } from '@/types/ecd-planning';

type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

type DailyPlanDraft = Record<Weekday, { activities: string; objectives: string }>;

type WeeklyPlanForm = {
  weekStartDate: string;
  weekNumber: string;
  weeklyFocus: string;
  weeklyObjectives: string;
  materials: string;
  daily: DailyPlanDraft;
};

const isoDate = (value: Date) => value.toISOString().split('T')[0];
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
};
const csvToArray = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const makeEmptyDaily = (): DailyPlanDraft => ({
  monday: { activities: '', objectives: '' },
  tuesday: { activities: '', objectives: '' },
  wednesday: { activities: '', objectives: '' },
  thursday: { activities: '', objectives: '' },
  friday: { activities: '', objectives: '' },
});

const createEmptyForm = (): WeeklyPlanForm => {
  const today = new Date();
  const day = today.getDay(); // 0 sunday .. 6 saturday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + mondayOffset);
  return {
    weekStartDate: isoDate(today),
    weekNumber: '1',
    weeklyFocus: '',
    weeklyObjectives: '',
    materials: '',
    daily: makeEmptyDaily(),
  };
};

const mapDailyPlanToDraft = (dailyPlans: WeeklyPlan['daily_plans'] | undefined): DailyPlanDraft => {
  const next = makeEmptyDaily();
  if (!dailyPlans) return next;
  WEEKDAYS.forEach((day) => {
    const dayPlan = dailyPlans[day] || { activities: [], learning_objectives: [] };
    next[day] = {
      activities: (dayPlan.activities || []).join(', '),
      objectives: (dayPlan.learning_objectives || []).join(', '),
    };
  });
  return next;
};

export default function PrincipalWeeklyPlansScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();
  const organizationId = extractOrganizationId(profile);
  const createdBy = (profile as any)?.id || user?.id;

  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WeeklyPlan | null>(null);
  const [form, setForm] = useState<WeeklyPlanForm>(createEmptyForm());

  const fetchPlans = useCallback(async () => {
    if (!organizationId) {
      setPlans([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('weekly_plans')
        .select('*')
        .eq('preschool_id', organizationId)
        .order('week_start_date', { ascending: false });

      if (error) throw error;
      setPlans((data || []) as WeeklyPlan[]);
    } catch (error: any) {
      showAlert({ title: 'Error', message: error?.message || 'Failed to load weekly plans', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPlans();
  };

  const openCreateModal = () => {
    setEditingPlan(null);
    setForm(createEmptyForm());
    setModalVisible(true);
  };

  const openEditModal = (plan: WeeklyPlan) => {
    setEditingPlan(plan);
    setForm({
      weekStartDate: plan.week_start_date,
      weekNumber: String(plan.week_number || 1),
      weeklyFocus: plan.weekly_focus || '',
      weeklyObjectives: (plan.weekly_objectives || []).join(', '),
      materials: (plan.materials_list || []).join(', '),
      daily: mapDailyPlanToDraft(plan.daily_plans),
    });
    setModalVisible(true);
  };

  const savePlan = async () => {
    if (!organizationId || !createdBy) {
      showAlert({ title: 'Missing profile', message: 'Unable to identify your school profile.', type: 'error' });
      return;
    }
    if (!form.weekStartDate) {
      showAlert({ title: 'Validation', message: 'Week start date is required (YYYY-MM-DD).', type: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const supabase = assertSupabase();
      const dailyPlans = WEEKDAYS.reduce((acc, day) => {
        acc[day] = {
          activities: csvToArray(form.daily[day].activities),
          learning_objectives: csvToArray(form.daily[day].objectives),
        };
        return acc;
      }, {} as WeeklyPlan['daily_plans']);

      const payload = {
        preschool_id: organizationId,
        created_by: createdBy,
        week_number: Math.max(1, Number(form.weekNumber) || 1),
        week_start_date: form.weekStartDate,
        week_end_date: addDays(form.weekStartDate, 4),
        weekly_focus: form.weeklyFocus.trim() || null,
        weekly_objectives: csvToArray(form.weeklyObjectives),
        materials_list: csvToArray(form.materials),
        daily_plans: dailyPlans,
      };

      if (editingPlan) {
        const { error } = await supabase.from('weekly_plans').update(payload).eq('id', editingPlan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('weekly_plans').insert({ ...payload, status: 'draft' });
        if (error) throw error;
      }

      setModalVisible(false);
      setEditingPlan(null);
      setForm(createEmptyForm());
      await fetchPlans();
    } catch (error: any) {
      showAlert({ title: 'Save failed', message: error?.message || 'Unable to save weekly plan.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (plan: WeeklyPlan, status: WeeklyPlan['status']) => {
    try {
      const supabase = assertSupabase();
      const updates: Record<string, any> = { status };
      if (status === 'submitted') updates.submitted_at = new Date().toISOString();
      if (status === 'approved') {
        updates.approved_at = new Date().toISOString();
        updates.approved_by = createdBy;
      }
      const { error } = await supabase.from('weekly_plans').update(updates).eq('id', plan.id);
      if (error) throw error;
      await fetchPlans();
    } catch (error: any) {
      showAlert({ title: 'Status update failed', message: error?.message || 'Unable to update plan status.', type: 'error' });
    }
  };

  const statusColor = (status: WeeklyPlan['status']) => {
    if (status === 'published') return '#3b82f6';
    if (status === 'approved') return '#10b981';
    if (status === 'submitted') return '#f59e0b';
    return theme.textSecondary;
  };

  const renderItem = ({ item }: { item: WeeklyPlan }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Week {item.week_number}</Text>
        <View style={[styles.badge, { backgroundColor: `${statusColor(item.status)}33` }]}>
          <Text style={styles.badgeText}>{item.status}</Text>
        </View>
      </View>

      <Text style={styles.meta}>
        {item.week_start_date} to {item.week_end_date}
      </Text>
      {!!item.weekly_focus && <Text style={styles.focus}>Focus: {item.weekly_focus}</Text>}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={16} color={theme.primary} />
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        {item.status === 'draft' ? (
          <TouchableOpacity style={styles.actionBtn} onPress={() => updateStatus(item, 'submitted')}>
            <Ionicons name="send-outline" size={16} color={theme.primary} />
            <Text style={styles.actionText}>Submit</Text>
          </TouchableOpacity>
        ) : null}
        {item.status === 'submitted' ? (
          <TouchableOpacity style={styles.actionBtn} onPress={() => updateStatus(item, 'approved')}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#10b981" />
            <Text style={[styles.actionText, { color: '#10b981' }]}>Approve</Text>
          </TouchableOpacity>
        ) : null}
        {item.status === 'approved' ? (
          <TouchableOpacity style={styles.actionBtn} onPress={() => updateStatus(item, 'published')}>
            <Ionicons name="megaphone-outline" size={16} color="#3b82f6" />
            <Text style={[styles.actionText, { color: '#3b82f6' }]}>Publish</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <DesktopLayout role="principal" title="Weekly Plans" showBackButton>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            Draft and approve class weekly plans before publishing parent-facing summaries.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={openCreateModal}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>New Weekly Plan</Text>
          </TouchableOpacity>
        </View>

        <FlashList
          data={plans}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          estimatedItemSize={150}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
                <Text style={styles.emptyTitle}>No weekly plans yet</Text>
                <Text style={styles.emptySubtitle}>Create your first weekly plan.</Text>
              </View>
            ) : null
          }
        />

        <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editingPlan ? 'Edit Weekly Plan' : 'Create Weekly Plan'}</Text>

              <View style={styles.inlineRow}>
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  placeholder="Week start (YYYY-MM-DD)"
                  placeholderTextColor={theme.textSecondary}
                  value={form.weekStartDate}
                  onChangeText={(weekStartDate) => setForm((prev) => ({ ...prev, weekStartDate }))}
                />
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  placeholder="Week #"
                  placeholderTextColor={theme.textSecondary}
                  value={form.weekNumber}
                  keyboardType="number-pad"
                  onChangeText={(weekNumber) => setForm((prev) => ({ ...prev, weekNumber }))}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Weekly focus"
                placeholderTextColor={theme.textSecondary}
                value={form.weeklyFocus}
                onChangeText={(weeklyFocus) => setForm((prev) => ({ ...prev, weeklyFocus }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Weekly objectives (comma-separated)"
                placeholderTextColor={theme.textSecondary}
                value={form.weeklyObjectives}
                onChangeText={(weeklyObjectives) => setForm((prev) => ({ ...prev, weeklyObjectives }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Materials (comma-separated)"
                placeholderTextColor={theme.textSecondary}
                value={form.materials}
                onChangeText={(materials) => setForm((prev) => ({ ...prev, materials }))}
              />

              <View style={styles.dailySection}>
                {WEEKDAYS.map((day) => (
                  <View key={day} style={styles.dailyCard}>
                    <Text style={styles.dailyTitle}>{day.charAt(0).toUpperCase() + day.slice(1)}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Activities (comma-separated)"
                      placeholderTextColor={theme.textSecondary}
                      value={form.daily[day].activities}
                      onChangeText={(activities) =>
                        setForm((prev) => ({
                          ...prev,
                          daily: {
                            ...prev.daily,
                            [day]: { ...prev.daily[day], activities },
                          },
                        }))
                      }
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Learning objectives (comma-separated)"
                      placeholderTextColor={theme.textSecondary}
                      value={form.daily[day].objectives}
                      onChangeText={(objectives) =>
                        setForm((prev) => ({
                          ...prev,
                          daily: {
                            ...prev.daily,
                            [day]: { ...prev.daily[day], objectives },
                          },
                        }))
                      }
                    />
                  </View>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnSecondary]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtn} onPress={savePlan} disabled={saving}>
                  <Text style={styles.modalBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <AlertModal {...alertProps} />
      </View>
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      padding: 16,
      gap: 12,
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    primaryBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
    },
    primaryBtnText: {
      color: '#fff',
      fontWeight: '700',
    },
    listContent: {
      padding: 16,
      paddingTop: 0,
      gap: 12,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 6,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      flex: 1,
    },
    meta: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    focus: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 6,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    actionText: {
      color: theme.primary,
      fontWeight: '600',
      fontSize: 12,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 8,
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    emptySubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      textAlign: 'center',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      padding: 16,
    },
    modal: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 16,
      gap: 10,
      maxHeight: '90%',
    },
    modalTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 6,
    },
    input: {
      backgroundColor: theme.background,
      color: theme.text,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    inlineRow: {
      flexDirection: 'row',
      gap: 10,
    },
    inlineInput: {
      flex: 1,
    },
    dailySection: {
      gap: 10,
      marginTop: 4,
    },
    dailyCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 10,
      gap: 8,
    },
    dailyTitle: {
      color: theme.text,
      fontWeight: '700',
      fontSize: 13,
      textTransform: 'capitalize',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 6,
    },
    modalBtn: {
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
    },
    modalBtnSecondary: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalBtnText: {
      color: '#fff',
      fontWeight: '700',
    },
    modalBtnSecondaryText: {
      color: theme.text,
      fontWeight: '700',
    },
  });
