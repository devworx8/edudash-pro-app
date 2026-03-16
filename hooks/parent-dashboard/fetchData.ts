/** Standalone data-fetching function for the parent dashboard */
import { assertSupabase } from '@/lib/supabase';
import { offlineCacheService } from '@/lib/services/offlineCacheService';
import { log, logError, warn } from '@/lib/debug';
import { sanitizeAvatarUrl } from '@/lib/utils/avatar';
import type { ParentDashboardData } from '@/types/dashboard';
import { formatDueDate, formatEventTime, createEmptyParentData } from '@/lib/dashboard/utils';

export interface FetchResult {
  data: ParentDashboardData;
  fromCache: boolean;
}

export async function fetchParentDashboardData(
  userId: string,
  authLoading: boolean,
  forceRefresh = false,
): Promise<FetchResult | null> {
  if (authLoading) {
    log('🔄 Waiting for auth to complete...');
    return null;
  }
  // Cache check
  if (!forceRefresh) {
    const cached = await offlineCacheService.getParentDashboard(userId);
    if (cached) {
      log('📱 Loading parent data from cache...');
      return { data: cached, fromCache: true };
    }
  }
  const supabase = assertSupabase();
  const { data: authCheck } = await supabase.auth.getUser();
  if (!authCheck.user) {
    // During account switch, auth can transiently be unavailable.
    // Return null so the caller can retry without crashing the dashboard.
    warn('Parent dashboard auth check returned no user (transient)');
    return null;
  }
  if (authCheck.user.id !== userId) {
    warn('Parent dashboard user mismatch during switch transition', {
      requestedUserId: userId,
      activeUserId: authCheck.user.id,
    });
    return null;
  }

  // Fetch parent profile (dual lookup)
  let parentUser = await fetchParentProfile(supabase, userId);
  if (!parentUser) return { data: createEmptyParentData(), fromCache: false };

  const schoolId = (parentUser as any).preschool_id || (parentUser as any).organization_id;
  const schoolName = await resolveSchoolName(supabase, schoolId);


  // Fetch children ----------------------------------------------------------------
  const parentIds = new Set<string>([parentUser.id, userId].filter(Boolean));
  const parentFilters = Array.from(parentIds).flatMap(id => [`parent_id.eq.${id}`, `guardian_id.eq.${id}`]);

  const { data: childrenData } = await supabase
    .from('students')
    .select('id, first_name, last_name, student_id, preschool_id, date_of_birth, grade_level, avatar_url, classes!students_class_id_fkey(id, name, teacher_id)')
    .or(parentFilters.join(','));

  const teacherMap = await buildTeacherMap(supabase, childrenData || []);
  const children = (childrenData || []).map((c: any) => mapChild(c, schoolId, teacherMap));
  const childIds = children.map(c => c.id);

  // Parallel fetches ---------------------------------------------------------------
  const today = new Date().toISOString().split('T')[0];
  const [feesDueSoon, todayAttendance, assignmentsData, eventsData] = await Promise.all([
    fetchFeesDueSoon(supabase, childIds, today),
    fetchTodayAttendance(supabase, childIds, today),
    fetchAssignments(supabase),
    fetchEvents(supabase, schoolId),
  ]);

  // Process results ----------------------------------------------------------------
  const totalChildren = children.length;
  const presentToday = todayAttendance.filter(a => a.status === 'present').length;
  const attendanceRate = totalChildren > 0 ? Math.round((presentToday / totalChildren) * 100) : 0;

  const feesDue = buildFeesDueSoon(feesDueSoon, children, today);
  const recentHomework = buildRecentHomework(assignmentsData, childIds, children);
  const upcomingEvents = buildUpcomingEvents(eventsData);

  // Fetch unread message count
  let unreadMessages = 0;
  try {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    unreadMessages = count ?? 0;
  } catch { /* graceful fallback */ }

  const dashboardData: ParentDashboardData = {
    schoolName, totalChildren, feesDueSoon: feesDue,
    children, attendanceRate, presentToday,
    recentHomework, upcomingEvents, unreadMessages,
  };

  if (schoolId) {
    await offlineCacheService.cacheParentDashboard(userId, dashboardData);
    log('💾 Parent dashboard data cached for offline use');
  }
  return { data: dashboardData, fromCache: false };
}

// ── helpers ──────────────────────────────────────────────────────────────────────

async function fetchParentProfile(supabase: any, userId: string) {
  const fields = 'id, preschool_id, first_name, last_name, role, organization_id';
  let { data, error } = await supabase.from('profiles').select(fields).eq('auth_user_id', userId).maybeSingle();
  if (error) {
    const msg = String((error as any)?.message || error);
    const code = String((error as any)?.code || '');
    // Treat transient auth races as warnings to avoid noisy Sentry spam.
    if (code.startsWith('PGRST') || msg.toLowerCase().includes('jwt') || msg.toLowerCase().includes('session')) {
      warn('Parent user fetch warning:', { code, message: msg });
    } else {
      logError('Parent user fetch error:', { code, message: msg });
    }
  }
  if (!data) {
    const r = await supabase.from('profiles').select(fields).eq('id', userId).maybeSingle();
    if (r.error) {
      const msg = String((r.error as any)?.message || r.error);
      const code = String((r.error as any)?.code || '');
      if (code.startsWith('PGRST') || msg.toLowerCase().includes('jwt') || msg.toLowerCase().includes('session')) {
        warn('Parent user fetch (id) warning:', { code, message: msg });
      } else {
        logError('Parent user fetch (id) error:', { code, message: msg });
      }
    }
    data = r.data;
  }
  return data;
}

async function resolveSchoolName(supabase: any, schoolId: string | null) {
  if (!schoolId) return 'Unknown School';
  const { data: school } = await supabase.from('preschools').select('name').eq('id', schoolId).maybeSingle();
  if (school?.name) return school.name;
  const { data: org } = await supabase.from('organizations').select('name').eq('id', schoolId).maybeSingle();
  return org?.name || 'Unknown School';
}

async function buildTeacherMap(supabase: any, childrenData: any[]) {
  const teacherIds = childrenData.map((c: any) => c.classes?.teacher_id).filter(Boolean);
  if (!teacherIds.length) return {} as Record<string, string>;
  const { data } = await supabase.from('profiles').select('id, first_name, last_name').in('id', teacherIds);
  const map: Record<string, string> = {};
  (data || []).forEach((t: any) => { map[t.id] = `${t.first_name || ''} ${t.last_name || ''}`.trim(); });
  return map;
}

function mapChild(c: any, fallbackSchoolId: string | null, teacherMap: Record<string, string>) {
  return {
    id: c.id, firstName: c.first_name, lastName: c.last_name,
    studentCode: c.student_id ?? null, preschoolId: c.preschool_id ?? fallbackSchoolId,
    avatarUrl: sanitizeAvatarUrl(c.avatar_url ?? null), dateOfBirth: c.date_of_birth ?? null,
    grade: c.grade_level || 'Grade R', className: c.classes?.name || 'No Class',
    classId: c.classes?.id || null,
    teacher: c.classes?.teacher_id ? (teacherMap[c.classes.teacher_id] || 'No Teacher Assigned') : 'No Teacher Assigned',
  };
}

async function fetchFeesDueSoon(supabase: any, childIds: string[], today: string) {
  if (!childIds.length) return [];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setDate(end.getDate() + 3);
  const { data } = await supabase.from('student_fees')
    .select('student_id, due_date, amount, final_amount, status')
    .in('student_id', childIds).in('status', ['pending', 'overdue', 'partially_paid'])
    .gte('due_date', today).lte('due_date', end.toISOString().split('T')[0])
    .order('due_date', { ascending: true }).limit(1);
  return data || [];
}

async function fetchTodayAttendance(supabase: any, childIds: string[], today: string) {
  if (!childIds.length) return [];
  const { data } = await supabase.from('attendance').select('student_id, status').in('student_id', childIds).eq('attendance_date', today);
  return data || [];
}

async function fetchAssignments(supabase: any) {
  const { data } = await supabase.from('homework_assignments')
    .select(`
      id,
      title,
      due_date,
      subject,
      description,
      class_id,
      preschool_id,
      homework_submissions!homework_submissions_assignment_id_fkey(id, status, student_id)
    `)
    .eq('is_published', true).order('due_date', { ascending: false }).limit(10);
  return data || [];
}

async function fetchEvents(supabase: any, schoolId: string | null) {
  if (!schoolId) return [];
  const today = new Date().toISOString().slice(0, 10);

  const schoolEventsQuery = await supabase
    .from('school_events')
    .select('id, title, start_date, end_date, event_type, description')
    .eq('preschool_id', schoolId)
    .gte('start_date', today)
    .order('start_date', { ascending: true })
    .limit(10);

  let rows = (schoolEventsQuery.data || []).map((event: any) => ({
    id: event.id,
    title: event.title,
    event_date: event.start_date,
    event_type: event.event_type,
    description: event.description || '',
    source: 'school_events',
  }));

  if ((schoolEventsQuery.error || rows.length === 0) && !rows.length) {
    const legacyEventsQuery = await supabase
      .from('events')
      .select('id, title, event_date, event_type, description')
      .eq('preschool_id', schoolId)
      .gte('event_date', new Date().toISOString())
      .order('event_date', { ascending: true })
      .limit(10);

    rows = (legacyEventsQuery.data || []).map((event: any) => ({
      ...event,
      source: 'events',
    }));
  }

  const schoolEventIds = rows
    .filter((event: any) => event.source === 'school_events')
    .map((event: any) => event.id);

  if (schoolEventIds.length === 0) {
    return rows;
  }

  const { data: reminderLogs } = await supabase
    .from('school_event_reminder_logs')
    .select('event_id, reminder_offset_days, target_role')
    .in('event_id', schoolEventIds)
    .eq('target_role', 'parent');

  const sentThresholdsByEvent = new Map<string, Set<number>>();
  (reminderLogs || []).forEach((log: any) => {
    const eventId = String(log.event_id || '');
    if (!eventId) return;
    if (!sentThresholdsByEvent.has(eventId)) {
      sentThresholdsByEvent.set(eventId, new Set<number>());
    }
    sentThresholdsByEvent.get(eventId)?.add(Number(log.reminder_offset_days) || 0);
  });

  return rows.map((row: any) => ({
    ...row,
    sent_thresholds: Array.from(sentThresholdsByEvent.get(String(row.id)) || []),
  }));
}

function buildFeesDueSoon(fees: any[], children: any[], today: string): ParentDashboardData['feesDueSoon'] {
  const dueFee = fees[0];
  if (!dueFee?.due_date) return null;
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const dueDate = new Date(dueFee.due_date);
  const daysUntil = Math.ceil((dueDate.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
  const child = children.find(c => c.id === dueFee.student_id);
  return {
    amount: Number(dueFee.final_amount ?? dueFee.amount ?? 0),
    dueDate: dueFee.due_date,
    daysUntil: Number.isNaN(daysUntil) ? 0 : daysUntil,
    childName: child ? `${child.firstName} ${child.lastName}`.trim() : null,
  };
}

function buildRecentHomework(assignments: any[], childIds: string[], children: any[]) {
  return assignments.map((a: any) => {
    const subs = a.homework_submissions || [];
    const sub = subs.find((s: any) => childIds.includes(s.student_id));
    if (!sub) return null;
    const child = children.find(c => c.id === sub.student_id);
    const dueDateRaw = a.due_date || new Date().toISOString().split('T')[0];
    return {
      id: a.id,
      title: a.title,
      dueDate: formatDueDate(dueDateRaw),
      due_date: dueDateRaw,
      status: (sub.status || 'not_submitted') as 'submitted' | 'graded' | 'not_submitted',
      studentName: child?.firstName || 'Unknown',
      child_name: child ? `${child.firstName} ${child.lastName}`.trim() : undefined,
      student_id: sub.student_id,
      subject: a.subject || 'Take-home',
      description: a.description || null,
      class_id: a.class_id || null,
      preschool_id: a.preschool_id || null,
    };
  }).filter(Boolean).slice(0, 5);
}

function buildUpcomingEvents(events: any[]) {
  const thresholdSteps: Array<7 | 3 | 1> = [7, 3, 1];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return events.map((e: any) => ({
    id: e.id,
    title: e.title,
    time: formatEventTime(new Date(e.event_date)),
    type: (String(e.event_type || '').includes('meeting') ? 'meeting' : 'activity') as 'meeting' | 'activity' | 'assessment',
    eventDate: e.event_date || null,
    daysUntil: (() => {
      const date = new Date(String(e.event_date || '').slice(0, 10));
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      return Math.max(0, Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
    })(),
    reminderOffsetDays: (() => {
      const sentSet = new Set<number>(
        Array.isArray(e.sent_thresholds) ? e.sent_thresholds.map((item: any) => Number(item) || 0) : []
      );
      const date = new Date(String(e.event_date || '').slice(0, 10));
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      const daysUntil = Math.max(0, Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
      const nextThreshold = thresholdSteps.find((threshold) => threshold <= daysUntil && !sentSet.has(threshold));
      return nextThreshold || null;
    })(),
    reminderLabel: (() => {
      const sentSet = new Set<number>(
        Array.isArray(e.sent_thresholds) ? e.sent_thresholds.map((item: any) => Number(item) || 0) : []
      );
      const date = new Date(String(e.event_date || '').slice(0, 10));
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      const daysUntil = Math.max(0, Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
      const nextThreshold = thresholdSteps.find((threshold) => threshold <= daysUntil && !sentSet.has(threshold));
      return nextThreshold ? `${nextThreshold} day${nextThreshold === 1 ? '' : 's'}` : null;
    })(),
  }));
}
