import React, { useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTeacherDashboard } from '@/hooks/useDashboardData';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { buildReminderEventsFromBlocks, useNextActivityReminder } from '@/hooks/useNextActivityReminder';
import { resolveSchoolTypeFromProfile } from '@/lib/schoolTypeResolver';

function toWeekdayMondayFirst(value: Date): number {
  return value.getDay() === 0 ? 7 : value.getDay();
}

const formatRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return 'Time not set';
  if (start && end) return `${start} - ${end}`;
  return start || end || 'Time not set';
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const buildRoutineContext = (routine: {
  title?: string | null;
  blocks: Array<{ title: string; blockType: string; startTime?: string | null; endTime?: string | null }>;
}) => {
  const topBlocks = (routine.blocks || []).slice(0, 8);
  const lines = topBlocks.map((block) => {
    const timeLabel = block.startTime && block.endTime
      ? `${block.startTime}-${block.endTime}`
      : block.startTime || 'TBD';
    return `${timeLabel} [${block.blockType}] ${block.title}`;
  });
  return [
    `Weekly routine context: ${String(routine.title || 'Published routine')}`,
    ...lines,
  ].join('\n');
};

export default function TeacherDailyProgramPlannerScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const { data, loading, refresh } = useTeacherDashboard();
  const routine = data?.todayRoutine || null;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const isCompact = width < 760;
  const [reminderSoundEnabled, setReminderSoundEnabled] = useState(true);
  const resolvedSchoolType = useMemo(() => resolveSchoolTypeFromProfile(profile), [profile]);
  const alignedLessonRoute = resolvedSchoolType === 'k12_school'
    ? '/screens/ai-lesson-generator'
    : '/screens/preschool-lesson-generator';

  const alignedLessonParams = useMemo(() => {
    const routineTopic = routine?.nextBlockTitle || routine?.title || 'Today routine focus';
    const objectiveSeed = (routine?.blocks || [])
      .slice(0, 4)
      .map((block) => block.title)
      .filter(Boolean)
      .join('; ');
    return {
      mode: 'quick',
      topic: routineTopic,
      objectives: objectiveSeed,
      weeklyProgramId: routine?.weeklyProgramId || '',
      weekStartDate: routine?.weekStartDate || '',
      classId: routine?.classId || '',
      termId: routine?.termId || '',
      themeId: routine?.themeId || '',
      routineContext: routine ? buildRoutineContext(routine) : '',
    };
  }, [routine]);

  const reminderBlocksByDay = useMemo(() => {
    if (!routine?.blocks?.length) return {};
    const todayDay = toWeekdayMondayFirst(new Date());
    const blocks = routine.blocks.map((b) => ({
      id: b.id,
      title: b.title,
      start_time: b.startTime ?? null,
    }));
    return { [todayDay]: blocks };
  }, [routine?.blocks]);

  const reminderEvents = useMemo(
    () => buildReminderEventsFromBlocks(reminderBlocksByDay),
    [reminderBlocksByDay],
  );

  const { overlay, notice, dismissOverlay } = useNextActivityReminder({
    events: reminderEvents,
    soundEnabled: reminderSoundEnabled,
    enabled: !!routine && reminderEvents.length > 0,
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      {overlay ? (
        <Modal visible={true} transparent animationType="fade" onRequestClose={dismissOverlay}>
          <TouchableOpacity style={styles.reminderOverlayBackdrop} activeOpacity={1} onPress={dismissOverlay}>
            <View style={[styles.reminderOverlayContent, isCompact && styles.reminderOverlayContentCompact, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
              <Text style={[styles.reminderOverlayLabel, { color: theme.textSecondary }]}>Reminder</Text>
              <Text style={[styles.reminderOverlayMinutes, { color: theme.text }]}>{overlay.threshold} min</Text>
              <Text style={[styles.reminderOverlayTitle, { color: theme.text }]}>{overlay.title}</Text>
              <Text style={[styles.reminderOverlayHint, { color: theme.textSecondary }]}>Prepare transition now.</Text>
              <TouchableOpacity
                style={[styles.reminderOverlayButton, { borderColor: theme.primary, backgroundColor: `${theme.primary}22` }]}
                onPress={dismissOverlay}
              >
                <Text style={[styles.reminderOverlayButtonText, { color: theme.primary }]}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}

      <View style={styles.header}>
        <View style={styles.headerShell}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Daily Routine</Text>
            <Text style={styles.headerSubtitle}>Teacher view only: routine is managed by principal/admin.</Text>
          </View>
        </View>
      </View>

      {loading && !routine ? (
        <View style={styles.loadingWrap}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Loading today's routine...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.pageShell}>
          {routine ? (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{routine.title || 'Published school routine'}</Text>
                <Text style={styles.cardMeta}>
                  {formatDate(routine.weekStartDate)} - {formatDate(routine.weekEndDate)} • {routine.blockCount} blocks
                </Text>
                {routine.nextBlockTitle ? (
                  <>
                    <View style={styles.nextBlockRow}>
                      <View style={styles.nextBlockPill}>
                        <Ionicons name="time-outline" size={14} color="#fff" />
                        <Text style={styles.nextBlockText}>
                          Next: {routine.nextBlockTitle}
                          {routine.nextBlockStart ? ` at ${routine.nextBlockStart}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.reminderSoundToggle, { borderColor: reminderSoundEnabled ? theme.primary : theme.border }]}
                        onPress={() => setReminderSoundEnabled((prev) => !prev)}
                      >
                        <Ionicons
                          name={reminderSoundEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
                          size={14}
                          color={reminderSoundEnabled ? theme.primary : theme.textSecondary}
                        />
                        <Text style={[styles.reminderSoundToggleText, { color: reminderSoundEnabled ? theme.primary : theme.textSecondary }]}>
                          {reminderSoundEnabled ? 'Sound on' : 'Sound off'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {notice ? (
                      <View style={[styles.reminderNotice, { backgroundColor: `${theme.primary}18`, borderColor: theme.primary }]}>
                        <Ionicons name="notifications-outline" size={12} color={theme.primary} />
                        <Text style={[styles.reminderNoticeText, { color: theme.text }]}>{notice}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>

              <View style={styles.blockListCard}>
                <Text style={styles.sectionTitle}>Today's blocks</Text>
                {routine.blocks.map((block, index) => (
                  <View key={block.id} style={styles.blockRow}>
                    <View style={styles.blockIndex}>
                      <Text style={styles.blockIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.blockBody}>
                      <Text style={styles.blockTitle}>{block.title}</Text>
                      <Text style={styles.blockMeta}>
                        {formatRange(block.startTime, block.endTime)} • {block.blockType}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No published routine yet</Text>
              <Text style={styles.cardMeta}>
                Ask your principal/admin to publish the daily routine. It will appear here automatically.
              </Text>
            </View>
          )}

          <View style={styles.actionsCard}>
            <Text style={styles.sectionTitle}>Lesson tools</Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push({ pathname: alignedLessonRoute as any, params: alignedLessonParams } as any)}
            >
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Generate lesson from routine</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/screens/teacher-lessons')}>
              <Ionicons name="book-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Open lesson plans</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/screens/assign-lesson')}>
              <Ionicons name="link-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Assign lessons to today's blocks</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/screens/room-display-connect')}>
              <Ionicons name="tv-outline" size={18} color={theme.text} />
              <Text style={styles.secondaryText}>Open Room Display link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                router.push({
                  pathname: '/screens/teacher-routine-requests',
                  params: {
                    requestType: 'daily_routine',
                    weekStartDate: routine?.weekStartDate || '',
                    classId: routine?.classId || '',
                    themeTitle: routine?.title || '',
                  },
                })
              }
            >
              <Ionicons name="clipboard-outline" size={18} color={theme.text} />
              <Text style={styles.secondaryText}>Request new routine/program</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
              <Ionicons name="refresh-outline" size={16} color={theme.primary} />
              <Text style={styles.refreshText}>Refresh routine</Text>
            </TouchableOpacity>
          </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerShell: {
      width: '100%',
      maxWidth: 980,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextWrap: {
      flex: 1,
    },
    headerTitle: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '800',
    },
    headerSubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      marginTop: 3,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
    scrollContent: {
      padding: 16,
      gap: 14,
      paddingBottom: 20,
    },
    pageShell: {
      width: '100%',
      maxWidth: 980,
      alignSelf: 'center',
      gap: 14,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 8,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
    },
    cardMeta: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    nextBlockRow: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    nextBlockPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: 999,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    nextBlockText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    reminderSoundToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    reminderSoundToggleText: {
      fontSize: 11,
      fontWeight: '600',
    },
    reminderNotice: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    reminderNoticeText: {
      flex: 1,
      fontSize: 11,
      fontWeight: '600',
    },
    reminderOverlayBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    reminderOverlayContent: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      minWidth: 260,
      width: '100%',
      maxWidth: 380,
    },
    reminderOverlayContentCompact: {
      minWidth: 0,
      paddingHorizontal: 18,
      paddingVertical: 20,
    },
    reminderOverlayLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    reminderOverlayMinutes: {
      fontSize: 40,
      fontWeight: '900',
      marginTop: 8,
    },
    reminderOverlayTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginTop: 12,
      textAlign: 'center',
    },
    reminderOverlayHint: {
      fontSize: 12,
      marginTop: 4,
    },
    reminderOverlayButton: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
      marginTop: 16,
    },
    reminderOverlayButtonText: {
      fontSize: 14,
      fontWeight: '700',
    },
    blockListCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    blockRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 10,
      backgroundColor: theme.background,
    },
    blockIndex: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
    },
    blockIndexText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '800',
    },
    blockBody: {
      flex: 1,
      gap: 2,
    },
    blockTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
    },
    blockMeta: {
      color: theme.textSecondary,
      fontSize: 12,
      textTransform: 'capitalize',
    },
    actionsCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    actionButton: {
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: theme.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    actionText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    secondaryButton: {
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    secondaryText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    refreshButton: {
      marginTop: 4,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    refreshText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '700',
    },
  });
