import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { addDays, getWeekStart, toDateKey } from '@/lib/cleaning-roster/constants';
import { useMyCleaningTasks } from '@/hooks/cleaning-roster';

function formatDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export default function TeacherCleaningTasksScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const organizationId = profile?.organization_id || profile?.preschool_id || null;
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});

  const { tasks, loading, savingTaskId, error, loadTasks, startTask, completeTask } = useMyCleaningTasks({
    organizationId,
    userId: user?.id || null,
  });

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const rangeFrom = useMemo(() => toDateKey(weekStart), [weekStart]);
  const rangeTo = useMemo(() => toDateKey(weekEnd), [weekEnd]);

  const refresh = useCallback(async () => {
    await loadTasks({ from: rangeFrom, to: rangeTo });
  }, [loadTasks, rangeFrom, rangeTo]);

  useEffect(() => {
    if (!organizationId || !user?.id) return;
    void refresh();
  }, [organizationId, refresh, user?.id]);

  const handleStart = useCallback(async (assignmentId: string) => {
    try {
      await startTask(assignmentId);
      await refresh();
    } catch (err) {
      showAlert({ title: 'Could not start task', message: err instanceof Error ? err.message : 'Try again.', type: 'error' });
    }
  }, [refresh, startTask]);

  const handleComplete = useCallback(async (assignmentId: string) => {
    try {
      await completeTask(assignmentId, completionNotes[assignmentId]);
      setCompletionNotes((prev) => ({ ...prev, [assignmentId]: '' }));
      await refresh();
    } catch (err) {
      showAlert({ title: 'Could not complete task', message: err instanceof Error ? err.message : 'Try again.', type: 'error' });
    }
  }, [completeTask, completionNotes, refresh]);

  if (!organizationId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerMessage}>
          <Ionicons name="business-outline" size={28} color={theme.warning} />
          <Text style={styles.centerTitle}>No School Linked</Text>
          <Text style={styles.centerSubtitle}>Join a school to receive assigned cleaning tasks.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Cleaning Tasks</Text>
        <TouchableOpacity onPress={refresh} style={styles.iconButton}>
          <Ionicons name="refresh" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.weekNav}>
          <TouchableOpacity style={styles.weekButton} onPress={() => setWeekStart((current) => addDays(current, -7))}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.weekLabelWrap}>
            <Text style={styles.weekLabel}>{formatDateLabel(rangeFrom)} - {formatDateLabel(rangeTo)}</Text>
            <Text style={styles.weekHint}>Assigned for this week</Text>
          </View>
          <TouchableOpacity style={styles.weekButton} onPress={() => setWeekStart((current) => addDays(current, 7))}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.loadingText}>Loading tasks...</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {tasks.length === 0 && !loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No tasks assigned</Text>
            <Text style={styles.emptySubtitle}>Your assigned cleaning shifts will appear here.</Text>
          </View>
        ) : null}

        {tasks.map((task) => {
          const isSaving = savingTaskId === task.assignmentId;
          const isCompleted = task.status === 'completed';
          return (
            <View key={task.assignmentId} style={styles.taskCard}>
              <Text style={styles.taskTitle}>{task.areaName}</Text>
              <Text style={styles.taskMeta}>{formatDateLabel(task.shiftDate)} - {task.shiftSlot}</Text>
              <Text style={styles.taskStatus}>Status: {task.status}</Text>
              {task.completionNote ? (
                <Text style={styles.taskNote}>Note: {task.completionNote}</Text>
              ) : null}
              {!isCompleted ? (
                <>
                  <TextInput
                    style={styles.input}
                    value={completionNotes[task.assignmentId] || ''}
                    onChangeText={(text) => setCompletionNotes((prev) => ({ ...prev, [task.assignmentId]: text }))}
                    placeholder="Optional completion note"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <View style={styles.taskActions}>
                    <TouchableOpacity
                      style={[styles.secondaryButton, isSaving && styles.buttonDisabled]}
                      disabled={isSaving}
                      onPress={() => handleStart(task.assignmentId)}
                    >
                      <Text style={styles.secondaryButtonText}>Start</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
                      disabled={isSaving}
                      onPress={() => handleComplete(task.assignmentId)}
                    >
                      {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Complete</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={styles.completedText}>Completed {task.completedAt ? `on ${new Date(task.completedAt).toLocaleString('en-ZA')}` : ''}</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 26,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 10,
  },
  weekButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.background,
  },
  weekLabelWrap: {
    flex: 1,
    alignItems: 'center',
  },
  weekLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  weekHint: {
    marginTop: 2,
    color: theme.textSecondary,
    fontSize: 12,
  },
  loadingBox: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  errorText: {
    color: theme.error,
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    marginTop: 4,
    color: theme.textSecondary,
    fontSize: 13,
  },
  taskCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  taskTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  taskMeta: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  taskStatus: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  taskNote: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    backgroundColor: theme.background,
  },
  taskActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: theme.background,
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: theme.primary,
  },
  primaryButtonText: {
    color: theme.onPrimary || '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completedText: {
    color: theme.success,
    fontSize: 12,
    fontWeight: '700',
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  centerTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  centerSubtitle: {
    color: theme.textSecondary,
    textAlign: 'center',
  },
});
