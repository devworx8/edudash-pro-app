'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import {
  BellRing,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  RefreshCw,
  Route,
  Sparkles,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { buildReminderEventsFromBlocks, useNextActivityReminder } from '@/hooks/useNextActivityReminder';

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  preschool_id: string | null;
  classes?: {
    name: string | null;
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
  start_date: string;
  daysUntil: number;
  nextReminderLabel: string | null;
};

const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
};

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getDayOfWeekMondayFirst(value: Date): number {
  return value.getDay() === 0 ? 7 : value.getDay();
}

function normalizeTime(value: string | null): string | null {
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

function formatWeekRange(weekStartDate: string, weekEndDate: string): string {
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

function blockTypeMeta(blockType: string | null): { label: string; Icon: typeof Route } {
  const normalized = String(blockType || '').trim().toLowerCase();
  if (normalized === 'assessment') return { label: 'Assessment', Icon: ClipboardList };
  if (normalized === 'circle_time') return { label: 'Circle Time', Icon: Sparkles };
  if (normalized === 'transition') return { label: 'Transition', Icon: Route };
  return {
    label: normalized ? normalized.replace(/_/g, ' ') : 'routine',
    Icon: Route,
  };
}

function ParentDailyProgramPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useTranslation();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [blocksByDay, setBlocksByDay] = useState<Record<number, BlockRow[]>>({});
  const [upcomingReminders, setUpcomingReminders] = useState<ReminderRow[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(getDayOfWeekMondayFirst(new Date()));
  const [expandedBlockIds, setExpandedBlockIds] = useState<Record<string, boolean>>({});

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) || null,
    [children, selectedChildId],
  );

  const dayOptions = useMemo(
    () => [1, 2, 3, 4, 5].map((day) => ({ day, label: DAY_LABELS[day] })),
    [],
  );

  const dayBlocks = useMemo(() => blocksByDay[selectedDay] || [], [blocksByDay, selectedDay]);

  const nextBlock = useMemo(() => {
    const todayDay = getDayOfWeekMondayFirst(new Date());
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

  const loadChildren = useCallback(async (activeUserId: string) => {
    const { data, error: childrenError } = await supabase
      .from('students')
      .select('id, first_name, last_name, class_id, preschool_id, classes(name)')
      .or(`parent_id.eq.${activeUserId},guardian_id.eq.${activeUserId}`)
      .eq('is_active', true)
      .order('first_name', { ascending: true });

    if (childrenError) {
      throw new Error(childrenError.message || 'Failed to load children');
    }

    const rows = (data || []) as ChildRow[];
    setChildren(rows);

    const requestedChildId = String(params.get('childId') || '').trim();
    const requestedChild = rows.find((row) => row.id === requestedChildId);
    const fallback = rows[0];

    const nextId = requestedChild?.id || fallback?.id || '';
    setSelectedChildId(nextId);

    return { rows, nextId };
  }, [params, supabase]);

  const loadProgram = useCallback(async (child: ChildRow | null) => {
    if (!child?.preschool_id) {
      setProgram(null);
      setBlocksByDay({});
      setUpcomingReminders([]);
      return;
    }

    const todayIso = toDateOnly(new Date());
    const todayDay = getDayOfWeekMondayFirst(new Date());

    const { data: programRows, error: programsError } = await supabase
      .from('weekly_programs')
      .select('id, class_id, title, summary, week_start_date, week_end_date, status, published_at, updated_at, created_at')
      .eq('preschool_id', child.preschool_id)
      .lte('week_start_date', todayIso)
      .gte('week_end_date', todayIso)
      .order('published_at', { ascending: false })
      .order('updated_at', { ascending: false });

    if (programsError) {
      throw new Error(programsError.message || 'Failed to load routine');
    }

    const candidates = (programRows || []) as ProgramRow[];
    if (candidates.length === 0) {
      setProgram(null);
      setBlocksByDay({});
      setUpcomingReminders([]);
      return;
    }

    candidates.sort((a, b) => {
      const aClassMatch = a.class_id && child.class_id && a.class_id === child.class_id ? 15 : 0;
      const bClassMatch = b.class_id && child.class_id && b.class_id === child.class_id ? 15 : 0;
      const aScore = statusScore(a.status) + aClassMatch;
      const bScore = statusScore(b.status) + bClassMatch;
      if (aScore !== bScore) return bScore - aScore;
      const aUpdated = new Date(String(a.updated_at || a.created_at || 0)).getTime();
      const bUpdated = new Date(String(b.updated_at || b.created_at || 0)).getTime();
      return bUpdated - aUpdated;
    });

    const selectedProgram = candidates[0] || null;
    if (!selectedProgram?.id) {
      setProgram(null);
      setBlocksByDay({});
      setUpcomingReminders([]);
      return;
    }

    const { data: blockRows, error: blockError } = await supabase
      .from('daily_program_blocks')
      .select('id, title, block_type, start_time, end_time, day_of_week, block_order, objectives, materials, transition_cue, notes')
      .eq('weekly_program_id', selectedProgram.id)
      .order('day_of_week', { ascending: true })
      .order('block_order', { ascending: true });

    if (blockError) {
      throw new Error(blockError.message || 'Failed to load routine blocks');
    }

    const grouped: Record<number, BlockRow[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

    for (const row of (blockRows || []) as BlockRow[]) {
      if (row.day_of_week >= 1 && row.day_of_week <= 5) {
        if (!grouped[row.day_of_week]) grouped[row.day_of_week] = [];
        grouped[row.day_of_week].push({
          ...row,
          start_time: normalizeTime(row.start_time),
          end_time: normalizeTime(row.end_time),
          objectives: toStringList((row as any).objectives),
          materials: toStringList((row as any).materials),
          transition_cue: String((row as any).transition_cue || '').trim() || null,
          notes: String((row as any).notes || '').trim() || null,
        });
      }
    }

    setProgram(selectedProgram);
    setBlocksByDay(grouped);
    if (todayDay >= 1 && todayDay <= 5) {
      setSelectedDay(todayDay);
    } else {
      setSelectedDay(1);
    }

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const future = new Date(todayDate);
    future.setDate(future.getDate() + 21);

    const { data: eventsData } = await supabase
      .from('school_events')
      .select('id, title, start_date')
      .eq('preschool_id', child.preschool_id)
      .gte('start_date', todayDate.toISOString().slice(0, 10))
      .lte('start_date', future.toISOString().slice(0, 10))
      .order('start_date', { ascending: true })
      .limit(6);

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
    const reminders = (eventsData || []).map((event: any) => {
      const eventDate = String(event.start_date || '');
      const date = new Date(`${eventDate}T00:00:00`);
      date.setHours(0, 0, 0, 0);
      const daysUntil = Math.max(0, Math.ceil((date.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)));
      const sent = sentByEvent.get(String(event.id)) || new Set<number>();
      const next = thresholds.find((threshold) => threshold <= daysUntil && !sent.has(threshold)) || null;
      return {
        id: String(event.id),
        title: String(event.title || 'Upcoming event'),
        start_date: eventDate,
        daysUntil,
        nextReminderLabel: next ? `${next} day${next === 1 ? '' : 's'}` : null,
      };
    });
    setUpcomingReminders(reminders);
  }, [supabase]);

  const hydrate = useCallback(async (activeUserId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { rows, nextId } = await loadChildren(activeUserId);
      const target = rows.find((row) => row.id === nextId) || null;
      await loadProgram(target);
    } catch (hydrateError) {
      setError(hydrateError instanceof Error ? hydrateError.message : 'Failed to load daily program.');
    } finally {
      setLoading(false);
    }
  }, [loadChildren, loadProgram]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/sign-in');
        return;
      }

      if (!mounted) return;
      setUserId(user.id);
      await hydrate(user.id);
    };

    init();

    return () => {
      mounted = false;
    };
  }, [hydrate, router, supabase]);

  useEffect(() => {
    if (!selectedChildId || children.length === 0) return;

    const target = children.find((child) => child.id === selectedChildId) || null;
    if (!target) return;

    setRefreshing(true);
    setError(null);
    loadProgram(target)
      .catch((programError) => {
        setError(programError instanceof Error ? programError.message : 'Failed to refresh daily program.');
      })
      .finally(() => setRefreshing(false));
  }, [children, loadProgram, selectedChildId]);

  const handleRefresh = async () => {
    if (!userId) return;
    await hydrate(userId);
  };

  const totalBlocks = useMemo(() => {
    return Object.values(blocksByDay).reduce((sum, list) => sum + list.length, 0);
  }, [blocksByDay]);

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

  return (
    <ParentShell hideHeader={true}>
      {overlay ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reminder-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={dismissOverlay}
        >
          <div
            className="card"
            style={{
              minWidth: 260,
              padding: 24,
              textAlign: 'center',
              border: '1px solid var(--primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="reminder-title" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--textSecondary)', margin: 0 }}>
              Reminder
            </p>
            <p style={{ fontSize: 40, fontWeight: 900, marginTop: 8 }}>{overlay.threshold} min</p>
            <p style={{ fontSize: 17, fontWeight: 700, marginTop: 12 }}>{overlay.title}</p>
            <p style={{ fontSize: 12, marginTop: 4, color: 'var(--textSecondary)' }}>Prepare transition now.</p>
            <button type="button" className="btn btnSecondary" onClick={dismissOverlay} style={{ marginTop: 16 }}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="section" style={{ display: 'grid', gap: 16 }}>
        <div className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 className="h1" style={{ marginBottom: 6 }}>
                {t('dashboard.parent.daily_program.title', { defaultValue: 'Daily Program' })}
              </h1>
              <p style={{ color: 'var(--textLight)', margin: 0 }}>
                {t('dashboard.parent.daily_program.subtitle', {
                  defaultValue: 'View your child\'s published school routine, timings, and next transitions.',
                })}
              </p>
            </div>
            <button className="btn btnSecondary" onClick={handleRefresh} disabled={loading || refreshing}>
              <RefreshCw className="icon16" />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--textLight)', fontWeight: 600 }}>Child</span>
              <select
                value={selectedChildId}
                onChange={(event) => setSelectedChildId(event.target.value)}
                disabled={children.length === 0 || loading}
                style={{
                  width: '100%',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  fontSize: 14,
                }}
              >
                {children.length === 0 ? (
                  <option value="">No linked children</option>
                ) : (
                  children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.first_name} {child.last_name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="card" style={{ padding: 12, display: 'grid', gap: 6, background: 'var(--surface)' }}>
              <div style={{ fontSize: 12, color: 'var(--textLight)', fontWeight: 600 }}>Class</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <User className="icon16" />
                <span>{formatClassName(selectedChild)}</span>
              </div>
            </div>
            <div className="card" style={{ padding: 12, display: 'grid', gap: 6, background: 'var(--surface)' }}>
              <div style={{ fontSize: 12, color: 'var(--textLight)', fontWeight: 600 }}>Weekly blocks</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <Route className="icon16" />
                <span>{totalBlocks}</span>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: 12, color: 'var(--textLight)' }}>Loading daily program...</p>
          </div>
        ) : error ? (
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Unable to load daily program</div>
            <p style={{ color: 'var(--textLight)', margin: 0 }}>{error}</p>
          </div>
        ) : !selectedChild ? (
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No linked child found</div>
            <p style={{ color: 'var(--textLight)', margin: 0 }}>
              Add or link a child profile to view the school routine from the parent dashboard.
            </p>
          </div>
        ) : !program ? (
          <div className="card" style={{ padding: 20, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <CalendarDays className="icon18" />
              <span>No published routine yet</span>
            </div>
            <p style={{ color: 'var(--textLight)', margin: 0 }}>
              The principal has not published this week\'s routine yet. Once published, it appears here automatically.
            </p>
            <button className="btn btnSecondary" onClick={() => router.push('/dashboard/parent/announcements')}>
              Open Announcements
            </button>
          </div>
        ) : (
          <>
            <div className="card" style={{ padding: 18, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {program.title || t('dashboard.parent.daily_program.default_title', { defaultValue: 'Published Daily Routine' })}
                </div>
                <div className="chip" style={{ fontWeight: 700 }}>
                  {String(program.status || 'published').toUpperCase()}
                </div>
              </div>
              <div style={{ color: 'var(--textLight)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarDays className="icon16" />
                <span>{formatWeekRange(program.week_start_date, program.week_end_date)}</span>
              </div>
              {nextBlock ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 180,
                        border: '1px solid var(--primary)',
                        background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Clock3 className="icon16" style={{ color: 'var(--primary)' }} />
                      <div style={{ fontSize: 14 }}>
                        <strong>Next block:</strong> {nextBlock.title} ({formatTimeRange(nextBlock.start_time, nextBlock.end_time)})
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btnSecondary"
                      onClick={() => setReminderSoundEnabled((prev) => !prev)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 12px',
                        fontSize: 12,
                        borderColor: reminderSoundEnabled ? 'var(--primary)' : 'var(--border)',
                      }}
                    >
                      {reminderSoundEnabled ? <Volume2 className="icon16" /> : <VolumeX className="icon16" />}
                      {reminderSoundEnabled ? 'Sound on' : 'Sound off'}
                    </button>
                  </div>
                  {notice ? (
                    <div
                      style={{
                        border: '1px solid var(--primary)',
                        background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                        borderRadius: 10,
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <BellRing className="icon16" style={{ color: 'var(--primary)' }} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{notice}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {program.summary ? (
                <p style={{ color: 'var(--textLight)', margin: 0, whiteSpace: 'pre-wrap' }}>{program.summary}</p>
              ) : null}
            </div>

            <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Upcoming Reminders (7/3/1)</div>
              {upcomingReminders.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--textLight)' }}>
                  No reminders are queued yet for the next 3 weeks.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {upcomingReminders.map((reminder) => (
                    <div key={reminder.id} className="card" style={{ padding: 10, background: 'var(--surface)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 600 }}>{reminder.title}</div>
                        <span className="chip">{reminder.daysUntil} day{reminder.daysUntil === 1 ? '' : 's'}</span>
                      </div>
                      <div style={{ marginTop: 4, color: 'var(--textLight)', fontSize: 13 }}>
                        Event: {new Date(`${reminder.start_date}T00:00:00`).toLocaleDateString('en-ZA')} • Next reminder: {reminder.nextReminderLabel || 'complete'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {dayOptions.map(({ day, label }) => {
                  const isActive = selectedDay === day;
                  const count = blocksByDay[day]?.length || 0;
                  return (
                    <button
                      key={day}
                      className="btn"
                      onClick={() => setSelectedDay(day)}
                      style={{
                        borderRadius: 999,
                        padding: '8px 12px',
                        border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: isActive ? 'color-mix(in srgb, var(--primary) 16%, transparent)' : 'transparent',
                        color: isActive ? 'var(--text)' : 'var(--textLight)',
                        fontWeight: isActive ? 700 : 500,
                        minWidth: 110,
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{label}</span>
                      <span style={{ opacity: 0.9 }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {dayBlocks.length === 0 ? (
                <div className="card" style={{ padding: 16, background: 'var(--surface)' }}>
                  <p style={{ margin: 0, color: 'var(--textLight)' }}>
                    No routine blocks were scheduled for {DAY_LABELS[selectedDay] || 'this day'}.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {dayBlocks.map((block, index) => (
                    <div
                      key={block.id || `${selectedDay}-${index}`}
                      className="card"
                      style={{
                        padding: '12px 14px',
                        display: 'grid',
                        gap: 8,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBlockIds((prev) => ({
                            ...prev,
                            [String(block.id || `${selectedDay}-${index}`)]: !prev[String(block.id || `${selectedDay}-${index}`)],
                          }))
                        }
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                        aria-expanded={!!expandedBlockIds[String(block.id || `${selectedDay}-${index}`)]}
                      >
                        <div style={{ display: 'grid', gap: 5, textAlign: 'left', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 800 }}>
                              {index + 1}. {block.title}
                            </div>
                            <div className="chip" style={{ textTransform: 'capitalize' }}>
                              {blockTypeMeta(block.block_type).label}
                            </div>
                          </div>
                          <div style={{ color: 'var(--textLight)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock3 className="icon14" />
                            <span>{formatTimeRange(block.start_time, block.end_time)}</span>
                          </div>
                        </div>
                        <div style={{ color: 'var(--textLight)' }}>
                          {expandedBlockIds[String(block.id || `${selectedDay}-${index}`)] ? <ChevronUp className="icon16" /> : <ChevronDown className="icon16" />}
                        </div>
                      </button>
                      {expandedBlockIds[String(block.id || `${selectedDay}-${index}`)] && (
                        <div
                          style={{
                            display: 'grid',
                            gap: 8,
                            borderTop: '1px solid var(--border)',
                            paddingTop: 8,
                          }}
                        >
                          {Array.isArray(block.objectives) && block.objectives.length > 0 ? (
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--textLight)' }}>Objectives</div>
                              <div style={{ fontSize: 13 }}>
                                {block.objectives.join(' • ')}
                              </div>
                            </div>
                          ) : null}
                          {Array.isArray(block.materials) && block.materials.length > 0 ? (
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--textLight)' }}>Materials</div>
                              <div style={{ fontSize: 13 }}>
                                {block.materials.join(' • ')}
                              </div>
                            </div>
                          ) : null}
                          {block.transition_cue ? (
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--textLight)' }}>Transition Cue</div>
                              <div style={{ fontSize: 13 }}>{block.transition_cue}</div>
                            </div>
                          ) : null}
                          {block.notes ? (
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--textLight)' }}>Teacher Notes</div>
                              <div style={{ fontSize: 13 }}>{block.notes}</div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ParentShell>
  );
}

export default function ParentDailyProgramPage() {
  return (
    <Suspense
      fallback={
        <ParentShell hideHeader={true}>
          <div className="section">
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
              <p style={{ marginTop: 12, color: 'var(--textLight)' }}>Loading daily program...</p>
            </div>
          </div>
        </ParentShell>
      }
    >
      <ParentDailyProgramPageContent />
    </Suspense>
  );
}
