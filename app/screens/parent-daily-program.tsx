import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SubPageHeader } from '@/components/SubPageHeader';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import {
  buildReminderEventsFromBlocks,
  useNextActivityReminder,
} from '@/hooks/useNextActivityReminder';
import { getRoutineBlockTypePresentation } from '@/lib/routines/blockTypePresentation';

type ChildRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  class_id?: string | null;
  preschool_id?: string | null;
  classes?: {
    name?: string | null;
  } | null;
};

type ProgramRow = {
  id: string;
  class_id: string | null;
  title: string | null;
  summary: string | null;
  week_start_date: string;
  week_end_date: string;
  status: string | null;
  published_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type BlockRow = {
  id: string;
  title: string;
  block_type: string | null;
  start_time: string | null;
  end_time: string | null;
  day_of_week: number;
  block_order: number;
  objectives?: string[] | null;
  materials?: string[] | null;
  transition_cue?: string | null;
  notes?: string | null;
};

type ReminderRow = {
  id: string;
  title: string;
  startDate: string;
  daysUntil: number;
  nextReminderLabel: string | null;
};

const WEEKDAYS: Array<{ day: number; label: string }> = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
];

const EMPTY_BLOCKS_BY_DAY: Record<number, BlockRow[]> = {
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
};

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toWeekdayMondayFirst(value: Date): number {
  return value.getDay() === 0 ? 7 : value.getDay();
}

function normalizeTime(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseMinutes(value: string | null): number | null {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTimeRange(start: string | null, end: string | null): string {
  const normalizedStart = normalizeTime(start);
  const normalizedEnd = normalizeTime(end);
  if (normalizedStart && normalizedEnd) return `${normalizedStart} - ${normalizedEnd}`;
  if (normalizedStart) return normalizedStart;
  if (normalizedEnd) return normalizedEnd;
  return 'Time TBD';
}

function statusScore(status: string | null): number {
  const value = String(status || '').toLowerCase();
  if (value === 'published') return 50;
  if (value === 'approved') return 40;
  if (value === 'submitted') return 30;
  if (value === 'draft') return 20;
  return 10;
}

function formatWeekRange(weekStartDate?: string | null, weekEndDate?: string | null): string {
  if (!weekStartDate || !weekEndDate) return 'Week not available';

  const start = new Date(`${weekStartDate}T00:00:00`);
  const end = new Date(`${weekEndDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${weekStartDate} - ${weekEndDate}`;
  }

  return `${start.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })} - ${end.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

function formatChildName(child: ChildRow | null): string {
  if (!child) return 'No child selected';
  const firstName = String(child.first_name || '').trim();
  const lastName = String(child.last_name || '').trim();
  return `${firstName} ${lastName}`.trim() || 'Child';
}

function formatClassName(child: ChildRow | null): string {
  if (!child) return 'Class not selected';
  return child.classes?.name || 'Whole school routine';
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,;|]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export default function ParentDailyProgramScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const supabase = useMemo(() => assertSupabase(), []);
  const styles = useMemo(() => createStyles(theme), [theme]);

  const parentId = (profile as any)?.id || user?.id || null;

  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');

  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [blocksByDay, setBlocksByDay] = useState<Record<number, BlockRow[]>>(EMPTY_BLOCKS_BY_DAY);
  const [upcomingReminders, setUpcomingReminders] = useState<ReminderRow[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(toWeekdayMondayFirst(new Date()));
  const [expandedBlockIds, setExpandedBlockIds] = useState<Record<string, boolean>>({});

  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingProgram, setLoadingProgram] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderSoundEnabled, setReminderSoundEnabled] = useState(true);

  const reminderEvents = useMemo(
    () => buildReminderEventsFromBlocks(blocksByDay, toDateOnly(new Date())),
    [blocksByDay],
  );

  const { overlay, notice, dismissOverlay } = useNextActivityReminder({
    events: reminderEvents,
    soundEnabled: reminderSoundEnabled,
    enabled: !!program && reminderEvents.length > 0,
  });

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) || null,
    [children, selectedChildId],
  );

  const dayBlocks = useMemo(() => blocksByDay[selectedDay] || [], [blocksByDay, selectedDay]);

  const totalBlocks = useMemo(
    () => Object.values(blocksByDay).reduce((sum, list) => sum + list.length, 0),
    [blocksByDay],
  );

  const nextBlock = useMemo(() => {
    const todayDay = toWeekdayMondayFirst(new Date());
    if (todayDay < 1 || todayDay > 5) return null;

    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const todayBlocks = blocksByDay[todayDay] || [];

    return (
      todayBlocks.find((block) => {
        const start = parseMinutes(block.start_time);
        return start !== null && start >= nowMinutes;
      }) || null
    );
  }, [blocksByDay]);

  const loadChildren = useCallback(async () => {
    if (!parentId) {
      setChildren([]);
      setSelectedChildId('');
      return { rows: [] as ChildRow[], nextSelectedId: '' };
    }

    const parentFilters = [`parent_id.eq.${parentId}`, `guardian_id.eq.${parentId}`];
    if (user?.id && user.id !== parentId) {
      parentFilters.push(`parent_id.eq.${user.id}`, `guardian_id.eq.${user.id}`);
    }

    const { data, error: childrenError } = await supabase
      .from('students')
      .select('id, first_name, last_name, class_id, preschool_id, classes(name)')
      .or(parentFilters.join(','))
      .eq('is_active', true)
      .order('first_name', { ascending: true });

    if (childrenError) {
      throw new Error(childrenError.message || 'Failed to load children');
    }

    const rows = (data || []) as ChildRow[];
    setChildren(rows);

    const nextSelectedId = rows.some((row) => row.id === selectedChildId)
      ? selectedChildId
      : rows[0]?.id || '';
    setSelectedChildId(nextSelectedId);

    return { rows, nextSelectedId };
  }, [parentId, selectedChildId, supabase, user?.id]);

  const loadProgram = useCallback(
    async (child: ChildRow | null) => {
      // Resolve school ID — prefer preschool_id, fall back to organization_id
      const schoolId = child?.preschool_id || (child as any)?.organization_id || null;
      if (!schoolId) {
        setProgram(null);
        setBlocksByDay(EMPTY_BLOCKS_BY_DAY);
        setUpcomingReminders([]);
        return;
      }

      const today = new Date();
      const todayIso = toDateOnly(today);
      const todayDay = toWeekdayMondayFirst(today);

      // Use a ±7 day window so parents can see:
      // - This week's routine (today falls within the week)
      // - Next week's routine if the principal published it on a weekend
      // - Last week's routine as a fallback if nothing is current
      const windowStart = new Date(today);
      windowStart.setDate(windowStart.getDate() - 7);
      const windowEnd = new Date(today);
      windowEnd.setDate(windowEnd.getDate() + 7);
      const windowStartIso = toDateOnly(windowStart);
      const windowEndIso = toDateOnly(windowEnd);

      const { data: programRows, error: programError } = await supabase
        .from('weekly_programs')
        .select('id, class_id, title, summary, week_start_date, week_end_date, status, published_at, updated_at, created_at')
        .eq('preschool_id', schoolId)
        .eq('status', 'published')
        .gte('week_end_date', windowStartIso)
        .lte('week_start_date', windowEndIso)
        .order('week_start_date', { ascending: false })
        .order('published_at', { ascending: false });

      if (programError) {
        throw new Error(programError.message || 'Failed to load daily routine');
      }

      const candidates = (programRows || []) as ProgramRow[];
      if (candidates.length === 0) {
        setProgram(null);
        setBlocksByDay(EMPTY_BLOCKS_BY_DAY);
        setUpcomingReminders([]);
        return;
      }

      candidates.sort((a, b) => {
        // Highest priority: class-specific match for the child
        const aClassMatch = a.class_id && child?.class_id && a.class_id === child.class_id ? 20 : 0;
        const bClassMatch = b.class_id && child?.class_id && b.class_id === child.class_id ? 20 : 0;

        // Next: prefer the program whose week contains today
        const containsToday = (p: ProgramRow) =>
          p.week_start_date <= todayIso && p.week_end_date >= todayIso;
        // Then: prefer upcoming week over past week
        const isFuture = (p: ProgramRow) => p.week_start_date > todayIso;
        const isPast = (p: ProgramRow) => p.week_end_date < todayIso;

        const weekBonus = (p: ProgramRow) =>
          containsToday(p) ? 30 : isFuture(p) ? 10 : isPast(p) ? 0 : 0;

        const aScore = statusScore(a.status) + aClassMatch + weekBonus(a);
        const bScore = statusScore(b.status) + bClassMatch + weekBonus(b);
        if (aScore !== bScore) return bScore - aScore;

        // Finally: most recently published wins
        const aUpdated = new Date(String(a.published_at || a.updated_at || a.created_at || 0)).getTime();
        const bUpdated = new Date(String(b.published_at || b.updated_at || b.created_at || 0)).getTime();
        return bUpdated - aUpdated;
      });

      const selectedProgram = candidates[0] || null;
      if (!selectedProgram?.id) {
        setProgram(null);
        setBlocksByDay(EMPTY_BLOCKS_BY_DAY);
        setUpcomingReminders([]);
        return;
      }

      const { data: blockRows, error: blocksError } = await supabase
        .from('daily_program_blocks')
        .select('id, title, block_type, start_time, end_time, day_of_week, block_order, objectives, materials, transition_cue, notes')
        .eq('weekly_program_id', selectedProgram.id)
        .order('day_of_week', { ascending: true })
        .order('block_order', { ascending: true });

      if (blocksError) {
        throw new Error(blocksError.message || 'Failed to load routine blocks');
      }

      const grouped: Record<number, BlockRow[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      for (const block of (blockRows || []) as BlockRow[]) {
        if (block.day_of_week < 1 || block.day_of_week > 5) continue;
        grouped[block.day_of_week].push({
          ...block,
          start_time: normalizeTime(block.start_time),
          end_time: normalizeTime(block.end_time),
          objectives: toStringList((block as any).objectives),
          materials: toStringList((block as any).materials),
          transition_cue: String((block as any).transition_cue || '').trim() || null,
          notes: String((block as any).notes || '').trim() || null,
        });
      }

      setProgram(selectedProgram);
      setBlocksByDay(grouped);
      setSelectedDay(todayDay >= 1 && todayDay <= 5 ? todayDay : 1);

      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const horizon = new Date(todayDate);
      horizon.setDate(horizon.getDate() + 21);

      const { data: eventsData } = await supabase
        .from('school_events')
        .select('id, title, start_date')
        .eq('preschool_id', child.preschool_id)
        .gte('start_date', todayDate.toISOString().slice(0, 10))
        .lte('start_date', horizon.toISOString().slice(0, 10))
        .order('start_date', { ascending: true })
        .limit(5);

      const eventIds = (eventsData || []).map((event: any) => event.id);
      const sentByEvent = new Map<string, Set<number>>();
      if (eventIds.length > 0) {
        const { data: logsData } = await supabase
          .from('school_event_reminder_logs')
          .select('event_id, reminder_offset_days')
          .in('event_id', eventIds)
          .eq('target_role', 'parent');
        (logsData || []).forEach((log: any) => {
          const key = String(log.event_id || '');
          if (!key) return;
          if (!sentByEvent.has(key)) sentByEvent.set(key, new Set());
          sentByEvent.get(key)?.add(Number(log.reminder_offset_days) || 0);
        });
      }

      const thresholds: Array<7 | 3 | 1> = [7, 3, 1];
      const reminders: ReminderRow[] = (eventsData || []).map((event: any) => {
        const startDate = String(event.start_date || '');
        const date = new Date(`${startDate}T00:00:00`);
        date.setHours(0, 0, 0, 0);
        const daysUntil = Math.max(0, Math.ceil((date.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)));
        const sent = sentByEvent.get(String(event.id)) || new Set<number>();
        const next = thresholds.find((threshold) => threshold <= daysUntil && !sent.has(threshold)) || null;
        return {
          id: String(event.id),
          title: String(event.title || 'Upcoming event'),
          startDate,
          daysUntil,
          nextReminderLabel: next ? `${next} day${next === 1 ? '' : 's'}` : null,
        };
      });
      setUpcomingReminders(reminders);
    },
    [supabase],
  );

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      setLoadingChildren(true);
      setError(null);
      try {
        const { rows, nextSelectedId } = await loadChildren();
        if (!active) return;
        const initialChild = rows.find((row) => row.id === nextSelectedId) || null;
        setLoadingProgram(true);
        await loadProgram(initialChild);
      } catch (hydrateError: any) {
        if (!active) return;
        setError(hydrateError?.message || 'Unable to load daily program.');
      } finally {
        if (!active) return;
        setLoadingProgram(false);
        setLoadingChildren(false);
      }
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [loadChildren, loadProgram]);

  useEffect(() => {
    if (!selectedChildId || children.length === 0) return;

    let active = true;
    const child = children.find((entry) => entry.id === selectedChildId) || null;
    if (!child) return;

    const refreshProgram = async () => {
      setLoadingProgram(true);
      setError(null);
      try {
        await loadProgram(child);
      } catch (programError: any) {
        if (!active) return;
        setError(programError?.message || 'Unable to refresh daily program.');
      } finally {
        if (active) setLoadingProgram(false);
      }
    };

    void refreshProgram();

    return () => {
      active = false;
    };
  }, [children, loadProgram, selectedChildId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { rows, nextSelectedId } = await loadChildren();
      const nextChild = rows.find((row) => row.id === (nextSelectedId || selectedChildId)) || null;
      await loadProgram(nextChild);
    } catch (refreshError: any) {
      setError(refreshError?.message || 'Could not refresh routine.');
    } finally {
      setRefreshing(false);
    }
  }, [loadChildren, loadProgram, selectedChildId]);

  const loading = loadingChildren || loadingProgram;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {overlay ? (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={dismissOverlay}
        >
          <TouchableOpacity
            style={styles.reminderOverlayBackdrop}
            activeOpacity={1}
            onPress={dismissOverlay}
          >
            <View style={[styles.reminderOverlayContent, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
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

      <SubPageHeader
        title="Daily Program"
        subtitle="Published school routine and timings"
        rightAction={{
          icon: 'megaphone-outline',
          onPress: () => router.push('/screens/parent-announcements'),
          label: 'Announcements',
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Child</Text>
          {children.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No linked child profile found.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childChips}>
              {children.map((child) => {
                const selected = selectedChildId === child.id;
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.childChip,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? `${theme.primary}22` : theme.background,
                      },
                    ]}
                    onPress={() => setSelectedChildId(child.id)}
                  >
                    <Text style={[styles.childChipText, { color: selected ? theme.primary : theme.text }]}>
                      {formatChildName(child)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Class</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{formatClassName(selectedChild)}</Text>
            </View>
            <View style={[styles.summaryCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Weekly blocks</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{totalBlocks}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading daily program...</Text>
          </View>
        ) : error ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.error }]}>
            <Text style={[styles.sectionTitle, { color: theme.error }]}>Could not load routine</Text>
            <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{error}</Text>
          </View>
        ) : !selectedChild ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>No linked child</Text>
            <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
              Add or link your child profile to view the daily routine.
            </Text>
          </View>
        ) : !program ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>No published routine yet</Text>
            <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
              The principal has not published this week's routine. It will appear here automatically once published.
            </Text>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={() => router.push('/screens/parent-announcements')}
            >
              <Ionicons name="megaphone-outline" size={16} color={theme.text} />
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Open Announcements</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.programHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {program.title || 'Published Daily Routine'}
                  </Text>
                  <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                    {formatWeekRange(program.week_start_date, program.week_end_date)}
                  </Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: `${theme.primary}1f` }]}>
                  <Text style={[styles.statusChipText, { color: theme.primary }]}>
                    {String(program.status || 'published').toUpperCase()}
                  </Text>
                </View>
              </View>

              {nextBlock ? (
                <>
                  <View style={styles.nextBlockRow}>
                    <View style={[styles.nextBlockCard, { borderColor: theme.primary, backgroundColor: `${theme.primary}15` }]}>
                      <Ionicons name="time-outline" size={16} color={theme.primary} />
                      <Text style={[styles.nextBlockText, { color: theme.text }]}>
                        Next: {nextBlock.title} ({formatTimeRange(nextBlock.start_time, nextBlock.end_time)})
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.reminderSoundToggle, { borderColor: reminderSoundEnabled ? theme.primary : theme.border }]}
                      onPress={() => setReminderSoundEnabled((prev) => !prev)}
                    >
                      <Ionicons
                        name={reminderSoundEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
                        size={16}
                        color={reminderSoundEnabled ? theme.primary : theme.textSecondary}
                      />
                      <Text style={[styles.reminderSoundToggleText, { color: reminderSoundEnabled ? theme.primary : theme.textSecondary }]}>
                        {reminderSoundEnabled ? 'Sound on' : 'Sound off'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {notice ? (
                    <View style={[styles.reminderNotice, { backgroundColor: `${theme.primary}18`, borderColor: theme.primary }]}>
                      <Ionicons name="notifications-outline" size={14} color={theme.primary} />
                      <Text style={[styles.reminderNoticeText, { color: theme.text }]}>{notice}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              {program.summary ? (
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{program.summary}</Text>
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming Reminders (7/3/1)</Text>
              {upcomingReminders.length === 0 ? (
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  No reminder events are queued for the next 3 weeks.
                </Text>
              ) : (
                <View style={styles.reminderList}>
                  {upcomingReminders.map((event) => (
                    <View key={event.id} style={[styles.reminderCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                      <View style={styles.reminderHeader}>
                        <Text style={[styles.reminderTitle, { color: theme.text }]}>{event.title}</Text>
                        <Text style={[styles.reminderBadge, { color: theme.primary }]}>
                          {event.daysUntil}d
                        </Text>
                      </View>
                      <Text style={[styles.blockTime, { color: theme.textSecondary }]}>
                        {new Date(`${event.startDate}T00:00:00`).toLocaleDateString('en-ZA')} • Next reminder: {event.nextReminderLabel || 'complete'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
                {WEEKDAYS.map(({ day, label }) => {
                  const active = day === selectedDay;
                  const count = blocksByDay[day]?.length || 0;
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayTab,
                        {
                          borderColor: active ? theme.primary : theme.border,
                          backgroundColor: active ? `${theme.primary}18` : theme.background,
                        },
                      ]}
                      onPress={() => setSelectedDay(day)}
                    >
                      <Text style={[styles.dayTabLabel, { color: active ? theme.primary : theme.text }]}>{label}</Text>
                      <Text style={[styles.dayTabCount, { color: active ? theme.primary : theme.textSecondary }]}>{count}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {dayBlocks.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No routine blocks are scheduled for this day.
                </Text>
              ) : (
                <View style={styles.blockList}>
                  {dayBlocks.map((block, index) => {
                    const blockType = getRoutineBlockTypePresentation(block.block_type);
                    return (
                      <View
                        key={block.id}
                        style={[
                          styles.blockCard,
                          {
                            borderColor: theme.border,
                            backgroundColor: theme.background,
                            borderLeftColor: blockType.textColor,
                          },
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.blockHeader}
                          activeOpacity={0.85}
                          onPress={() =>
                            setExpandedBlockIds((prev) => ({
                              ...prev,
                              [block.id]: !prev[block.id],
                            }))
                          }
                        >
                          <View style={styles.blockHeaderMain}>
                            <Text style={[styles.blockTitle, { color: theme.text }]}>
                              {index + 1}. {block.title}
                            </Text>
                            <View
                              style={[
                                styles.blockTypeChip,
                                {
                                  backgroundColor: blockType.backgroundColor,
                                  borderColor: blockType.borderColor,
                                },
                              ]}
                            >
                              <Text style={[styles.blockTypeText, { color: blockType.textColor }]}>
                                {blockType.label}
                              </Text>
                            </View>
                          </View>
                          <Ionicons
                            name={expandedBlockIds[block.id] ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={theme.textSecondary}
                          />
                        </TouchableOpacity>
                        <Text style={[styles.blockTime, { color: theme.textSecondary }]}>
                          {formatTimeRange(block.start_time, block.end_time)}
                        </Text>
                        {expandedBlockIds[block.id] ? (
                          <View style={[styles.blockDetails, { borderTopColor: theme.border }]}>
                            {Array.isArray(block.objectives) && block.objectives.length > 0 ? (
                              <View style={styles.blockDetailSection}>
                                <Text style={[styles.blockDetailLabel, { color: theme.textSecondary }]}>Objectives</Text>
                                <Text style={[styles.blockDetailText, { color: theme.text }]}>
                                  {block.objectives.join(' • ')}
                                </Text>
                              </View>
                            ) : null}
                            {Array.isArray(block.materials) && block.materials.length > 0 ? (
                              <View style={styles.blockDetailSection}>
                                <Text style={[styles.blockDetailLabel, { color: theme.textSecondary }]}>Materials</Text>
                                <Text style={[styles.blockDetailText, { color: theme.text }]}>
                                  {block.materials.join(' • ')}
                                </Text>
                              </View>
                            ) : null}
                            {block.transition_cue ? (
                              <View style={styles.blockDetailSection}>
                                <Text style={[styles.blockDetailLabel, { color: theme.textSecondary }]}>Transition Cue</Text>
                                <Text style={[styles.blockDetailText, { color: theme.text }]}>{block.transition_cue}</Text>
                              </View>
                            ) : null}
                            {block.notes ? (
                              <View style={styles.blockDetailSection}>
                                <Text style={[styles.blockDetailLabel, { color: theme.textSecondary }]}>Notes</Text>
                                <Text style={[styles.blockDetailText, { color: theme.text }]}>{block.notes}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: 16,
      gap: 12,
      paddingBottom: 40,
    },
    card: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      gap: 10,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
    },
    bodyText: {
      fontSize: 14,
      lineHeight: 20,
    },
    childChips: {
      gap: 8,
      paddingBottom: 2,
    },
    childChip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    childChipText: {
      fontSize: 13,
      fontWeight: '700',
    },
    summaryGrid: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    summaryCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      gap: 4,
    },
    metaLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    metaValue: {
      fontSize: 14,
      fontWeight: '700',
    },
    loadingWrap: {
      paddingVertical: 30,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: '600',
    },
    secondaryButton: {
      marginTop: 6,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      alignSelf: 'flex-start',
    },
    secondaryButtonText: {
      fontSize: 13,
      fontWeight: '700',
    },
    programHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statusChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statusChipText: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    nextBlockRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    nextBlockCard: {
      flex: 1,
      minWidth: 140,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    nextBlockText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
    },
    reminderSoundToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    reminderSoundToggleText: {
      fontSize: 12,
      fontWeight: '600',
    },
    reminderNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 4,
    },
    reminderNoticeText: {
      flex: 1,
      fontSize: 12,
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
    reminderList: {
      gap: 8,
    },
    reminderCard: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 6,
    },
    reminderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    reminderTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
    },
    reminderBadge: {
      fontSize: 12,
      fontWeight: '800',
    },
    dayTabs: {
      gap: 8,
      paddingBottom: 2,
    },
    dayTab: {
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
      minWidth: 110,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    dayTabLabel: {
      fontSize: 12,
      fontWeight: '700',
    },
    dayTabCount: {
      fontSize: 12,
      fontWeight: '700',
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 20,
    },
    blockList: {
      gap: 8,
    },
    blockCard: {
      borderWidth: 1,
      borderLeftWidth: 3,
      borderLeftColor: 'transparent',
      borderRadius: 10,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 6,
    },
    blockHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    blockHeaderMain: {
      flex: 1,
      gap: 6,
    },
    blockTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
    },
    blockTypeChip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    blockTypeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    blockTime: {
      fontSize: 13,
      fontWeight: '600',
    },
    blockDetails: {
      marginTop: 4,
      borderTopWidth: 1,
      paddingTop: 8,
      gap: 8,
    },
    blockDetailSection: {
      gap: 3,
    },
    blockDetailLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.35,
    },
    blockDetailText: {
      fontSize: 13,
      lineHeight: 19,
    },
  });
