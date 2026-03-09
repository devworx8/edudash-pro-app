import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import type { AttendanceLifecyclePolicy } from '@/lib/services/SchoolSettingsService';
import LearnerLifecycleService, {
  type LearnerLifecycleSummary,
  type StudentInactivityCase,
  type StudentInactivityAction,
} from '@/lib/services/LearnerLifecycleService';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

const ACTION_LABELS: Record<StudentInactivityAction, string> = {
  contacted: 'Mark contacted',
  extend_grace: 'Extend 7 days',
  keep_active: 'Keep active',
  dismiss: 'Dismiss',
  force_inactivate: 'Inactivate now',
};

export default function PrincipalLearnerActivityControlScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();
  const schoolId = profile?.organization_id || profile?.preschool_id || null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [policy, setPolicy] = useState<AttendanceLifecyclePolicy | null>(null);
  const [summary, setSummary] = useState<LearnerLifecycleSummary | null>(null);

  const loadData = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      const [policyData, summaryData] = await Promise.all([
        LearnerLifecycleService.getPolicy(schoolId),
        LearnerLifecycleService.getSummary(schoolId),
      ]);
      setPolicy(policyData);
      setSummary(summaryData);
    } catch (error) {
      showAlert({ title: 'Error', message: error instanceof Error ? error.message : 'Failed to load learner activity controls', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  const updatePolicyField = useCallback(<K extends keyof AttendanceLifecyclePolicy>(key: K, value: AttendanceLifecyclePolicy[K]) => {
    setPolicy((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const updateNotifyChannel = useCallback(
    (channel: keyof AttendanceLifecyclePolicy['notify_channels'], value: boolean) => {
      setPolicy((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notify_channels: {
            ...prev.notify_channels,
            [channel]: value,
          },
        };
      });
    },
    []
  );

  const savePolicy = useCallback(async () => {
    if (!schoolId || !policy) return;
    setSavingPolicy(true);
    try {
      const next = await LearnerLifecycleService.updatePolicy(schoolId, policy);
      setPolicy(next);
      showAlert({ title: 'Saved', message: 'Learner lifecycle policy updated.', type: 'success' });
    } catch (error) {
      showAlert({ title: 'Save failed', message: error instanceof Error ? error.message : 'Could not save policy', type: 'error' });
    } finally {
      setSavingPolicy(false);
    }
  }, [schoolId, policy]);

  const runMonitorNow = useCallback(async () => {
    if (!schoolId) return;
    setRunningNow(true);
    try {
      const result = await LearnerLifecycleService.runMonitorNow(schoolId);
      if (!result.success) {
        throw new Error(result.error || 'Monitor run failed');
      }
      showAlert({ title: 'Monitor started', message: 'Attendance lifecycle evaluator ran successfully.', type: 'success' });
      await loadData();
    } catch (error) {
      showAlert({ title: 'Run failed', message: error instanceof Error ? error.message : 'Failed to run monitor', type: 'error' });
    } finally {
      setRunningNow(false);
    }
  }, [loadData, schoolId]);

  const notifyAtRiskParents = useCallback(async () => {
    if (!schoolId || !summary?.atRiskCases?.length) {
      showAlert({ title: 'No at-risk parents', message: 'There are no at-risk learners to notify.', type: 'info' });
      return;
    }

    setNotifying(true);
    try {
      const result = await LearnerLifecycleService.notifyAtRiskParents(schoolId, summary.atRiskCases);
      showAlert({ title: 'Notifications sent', message: `Sent reminder notifications to ${result.sentTo} parent accounts.`, type: 'success' });
    } catch (error) {
      showAlert({ title: 'Notification failed', message: error instanceof Error ? error.message : 'Failed to notify parents', type: 'error' });
    } finally {
      setNotifying(false);
    }
  }, [schoolId, summary?.atRiskCases]);

  const applyAction = useCallback(
    async (caseItem: StudentInactivityCase, action: StudentInactivityAction) => {
      try {
        const options: { notes?: string; extendDays?: number } = {};
        if (action === 'extend_grace') {
          options.extendDays = 7;
          options.notes = 'Extended from principal control panel';
        }
        await LearnerLifecycleService.applyAction(caseItem.id, action, options);
        await loadData();
      } catch (error) {
        showAlert({ title: 'Action failed', message: error instanceof Error ? error.message : 'Could not apply action', type: 'error' });
      }
    },
    [loadData]
  );

  const confirmAction = useCallback(
    (caseItem: StudentInactivityCase, action: StudentInactivityAction) => {
      showAlert({
        title: ACTION_LABELS[action],
        message: `Apply "${ACTION_LABELS[action]}" to ${caseLabel(caseItem)}?`,
        type: action === 'force_inactivate' ? 'warning' : 'info',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            style: action === 'force_inactivate' ? 'destructive' : 'default',
            onPress: () => {
              void applyAction(caseItem, action);
            },
          },
        ],
      });
    },
    [applyAction]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <EduDashSpinner size="large" color={theme.primary} />
      </View>
    );
  }

  if (!schoolId || !policy || !summary) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No school context found for this account.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { flex: 1 }]} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Learner Activity Control',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text },
        }}
      />
      <View style={{ flex: 1 }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.heroRow}>
            <TouchableOpacity style={styles.heroBtn} onPress={runMonitorNow} disabled={runningNow}>
              {runningNow ? <EduDashSpinner color={theme.onPrimary} /> : <Text style={styles.heroBtnText}>Run now</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.heroBtn, styles.heroBtnAlt]} onPress={notifyAtRiskParents} disabled={notifying}>
              {notifying ? <EduDashSpinner color={theme.primary} /> : <Text style={styles.heroBtnTextAlt}>Message at-risk parents</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Policy</Text>
            {renderSwitchRow(styles, 'Automation enabled', policy.enabled, (value) => updatePolicyField('enabled', value))}
            {renderStepperRow(styles, 'Trigger absences', policy.trigger_absent_days, (next) => updatePolicyField('trigger_absent_days', next))}
            {renderStepperRow(styles, 'Grace days', policy.grace_days, (next) => updatePolicyField('grace_days', next))}
            {renderSwitchRow(
              styles,
              'Require principal approval',
              policy.require_principal_approval,
              (value) => updatePolicyField('require_principal_approval', value)
            )}
            {renderSwitchRow(
              styles,
              'Auto-unassign class on inactive',
              policy.auto_unassign_class_on_inactive,
              (value) => updatePolicyField('auto_unassign_class_on_inactive', value)
            )}
            <Text style={styles.subheading}>Notify channels</Text>
            {renderSwitchRow(styles, 'Push', policy.notify_channels.push, (v) => updateNotifyChannel('push', v))}
            {renderSwitchRow(styles, 'Email', policy.notify_channels.email, (v) => updateNotifyChannel('email', v))}
            {renderSwitchRow(styles, 'SMS', policy.notify_channels.sms, (v) => updateNotifyChannel('sms', v))}
            {renderSwitchRow(styles, 'WhatsApp', policy.notify_channels.whatsapp, (v) => updateNotifyChannel('whatsapp', v))}

            <TouchableOpacity style={styles.saveBtn} onPress={savePolicy} disabled={savingPolicy}>
              {savingPolicy ? <EduDashSpinner color={theme.onPrimary} /> : <Text style={styles.saveBtnText}>Save policy</Text>}
            </TouchableOpacity>
          </View>

          <QueueCard
            title={`At-risk queue (${summary.atRiskCases.length})`}
            cases={summary.atRiskCases}
            styles={styles}
            onAction={confirmAction}
            onOpenStudent={(studentId) => router.push(`/screens/student-detail?studentId=${studentId}` as any)}
          />

          <QueueCard
            title={`Due today (${summary.dueTodayCases.length})`}
            cases={summary.dueTodayCases}
            styles={styles}
            onAction={confirmAction}
            onOpenStudent={(studentId) => router.push(`/screens/student-detail?studentId=${studentId}` as any)}
          />

          <QueueCard
            title={`Recently inactivated (${summary.recentlyInactivatedCases.length})`}
            cases={summary.recentlyInactivatedCases}
            styles={styles}
            onAction={confirmAction}
            onOpenStudent={(studentId) => router.push(`/screens/student-detail?studentId=${studentId}` as any)}
          />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Data quality queue</Text>
            <Text style={styles.metricLine}>Status mismatches: {summary.mismatchCount}</Text>
            <Text style={styles.metricLine}>Duplicate candidates: {summary.duplicateGroupCount}</Text>
            <Text style={styles.metricHint}>
              Last report: {summary.lastReportDate || 'No report yet'}
            </Text>
          </View>
        </ScrollView>
      </View>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

function caseLabel(item: StudentInactivityCase): string {
  const first = item.student?.first_name || '';
  const last = item.student?.last_name || '';
  const joined = `${first} ${last}`.trim();
  return joined || 'learner';
}

function QueueCard({
  title,
  cases,
  styles,
  onAction,
  onOpenStudent,
}: {
  title: string;
  cases: StudentInactivityCase[];
  styles: ReturnType<typeof createStyles>;
  onAction: (item: StudentInactivityCase, action: StudentInactivityAction) => void;
  onOpenStudent: (studentId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {cases.length === 0 ? (
        <Text style={styles.metricHint}>No learners in this queue.</Text>
      ) : (
        cases.map((item) => (
          <View key={item.id} style={styles.caseCard}>
            <View style={styles.caseHeader}>
              <Text style={styles.caseName}>{caseLabel(item)}</Text>
              <Text style={styles.caseMeta}>Streak {item.trigger_absence_streak}</Text>
            </View>
            <Text style={styles.caseMeta}>
              Deadline: {item.warning_deadline_at ? new Date(item.warning_deadline_at).toLocaleDateString() : '—'}
            </Text>
            <Text style={styles.caseMeta}>Class: {item.student?.class_name || 'Unassigned'}</Text>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionPill} onPress={() => onAction(item, 'contacted')}>
                <Text style={styles.actionText}>Contacted</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionPill} onPress={() => onAction(item, 'extend_grace')}>
                <Text style={styles.actionText}>Extend</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionPill} onPress={() => onAction(item, 'keep_active')}>
                <Text style={styles.actionText}>Keep active</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionPill, styles.actionDanger]} onPress={() => onAction(item, 'force_inactivate')}>
                <Text style={[styles.actionText, styles.actionDangerText]}>Inactivate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionPill} onPress={() => onOpenStudent(item.student_id)}>
                <Text style={styles.actionText}>Move/Reassign</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function renderSwitchRow(
  styles: ReturnType<typeof createStyles>,
  label: string,
  value: boolean,
  onChange: (next: boolean) => void
) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function renderStepperRow(
  styles: ReturnType<typeof createStyles>,
  label: string,
  value: number,
  onChange: (next: number) => void
) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.max(1, value - 1))}>
          <Ionicons name="remove" size={16} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.stepValue}>{value}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(value + 1)}>
          <Ionicons name="add" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    emptyText: { color: theme.textSecondary, fontSize: 14 },
    heroRow: { flexDirection: 'row', gap: 10 },
    heroBtn: {
      flex: 1,
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    heroBtnAlt: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    heroBtnText: { color: theme.onPrimary, fontWeight: '700' },
    heroBtnTextAlt: { color: theme.primary, fontWeight: '700' },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    subheading: { marginTop: 4, fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { color: theme.text, fontSize: 14, flex: 1, paddingRight: 12 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
    },
    stepValue: { minWidth: 24, textAlign: 'center', color: theme.text, fontWeight: '700' },
    saveBtn: {
      marginTop: 8,
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 42,
    },
    saveBtnText: { color: theme.onPrimary, fontWeight: '700' },
    metricLine: { color: theme.text, fontSize: 14 },
    metricHint: { color: theme.textSecondary, fontSize: 13 },
    caseCard: {
      backgroundColor: theme.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 6,
    },
    caseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    caseName: { color: theme.text, fontSize: 14, fontWeight: '700' },
    caseMeta: { color: theme.textSecondary, fontSize: 12 },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    actionPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    actionText: { color: theme.text, fontSize: 12, fontWeight: '600' },
    actionDanger: { borderColor: '#EF4444', backgroundColor: '#EF444422' },
    actionDangerText: { color: '#DC2626' },
  });
