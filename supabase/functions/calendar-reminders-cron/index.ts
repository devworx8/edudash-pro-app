/**
 * Calendar Reminders Cron - Meetings & Excursions
 *
 * Sends 7/3/1 day reminders for school_meetings and school_excursions.
 * Events are handled by event-reminders-cron.
 * Idempotency: school_meeting_reminder_logs, school_excursion_reminder_logs.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || 'your-cron-secret'
const DEFAULT_TIMEZONE = 'Africa/Johannesburg'

const REMINDER_THRESHOLDS = [
  { offsetDays: 7 as const, label: '7 days' },
  { offsetDays: 3 as const, label: '3 days' },
  { offsetDays: 1 as const, label: '1 day' },
]

// Excursions get weekly reminders so parents stay informed
const EXCURSION_REMINDER_THRESHOLDS = [
  { offsetDays: 28, label: '4 weeks' },
  { offsetDays: 21, label: '3 weeks' },
  { offsetDays: 14, label: '2 weeks' },
  { offsetDays: 7, label: '1 week' },
  { offsetDays: 3, label: '3 days' },
  { offsetDays: 1, label: 'Tomorrow' },
]
// Twice weekly (weekdays only). Adjust if the school prefers different days.
const EXCURSION_WEEKLY_DAYS = new Set(['Mon', 'Thu'])

interface SchoolMeeting {
  id: string;
  title: string;
  meeting_date: string;
  meeting_type: string;
  preschool_id: string;
}
interface SchoolExcursion {
  id: string;
  title: string;
  excursion_date: string;
  preschool_id: string;
}

function formatDateInTimezone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function formatWeekdayInTimezone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(value)
}

function normalizeDateOnly(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const candidate = raw.includes('T') ? raw.split('T')[0] : raw
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : ''
}

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return dateOnly
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function diffDays(fromDateOnly: string, toDateOnly: string): number {
  const from = new Date(`${fromDateOnly}T00:00:00.000Z`)
  const to = new Date(`${toDateOnly}T00:00:00.000Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Number.NaN
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

function meetingTargetAudience(meetingType: string): string[] {
  const t = String(meetingType || '').toLowerCase()
  if (t === 'parent' || t === 'pta') return ['parents']
  return ['teachers', 'principals']
}
function excursionTargetAudience(): string[] {
  return ['parents', 'teachers', 'principals']
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const isCronJob = authHeader === `Bearer ${CRON_SECRET}`
    const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`

    if (!isCronJob && !isServiceRole) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const today = formatDateInTimezone(new Date(), DEFAULT_TIMEZONE)
    const maxWindowDate = addDays(today, 8)
    const excursionMaxWindowDate = addDays(today, 29) // 28 days + buffer for excursion weekly reminders
    const todayWeekday = formatWeekdayInTimezone(new Date(), DEFAULT_TIMEZONE)

    const results = {
      thresholds: {
        fourWeek: { sent: 0, skipped: 0, failed: 0 },
        threeWeek: { sent: 0, skipped: 0, failed: 0 },
        twoWeek: { sent: 0, skipped: 0, failed: 0 },
        sevenDay: { sent: 0, skipped: 0, failed: 0 },
        threeDay: { sent: 0, skipped: 0, failed: 0 },
        oneDay: { sent: 0, skipped: 0, failed: 0 },
        weekly: { sent: 0, skipped: 0, failed: 0 },
      },
      meetingsProcessed: 0,
      excursionsProcessed: 0,
      remindersSent: 0,
      remindersSkipped: 0,
      remindersFailed: 0,
    }

    const { data: meetings, error: meetingsError } = await supabase
      .from('school_meetings')
      .select('id, title, meeting_date, meeting_type, preschool_id')
      .in('status', ['scheduled', 'draft'])
      .gte('meeting_date', today)
      .lte('meeting_date', maxWindowDate)

    if (meetingsError) {
      console.error('[calendar-reminders-cron] Error fetching meetings:', meetingsError)
      return new Response(JSON.stringify({ error: meetingsError.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: excursions, error: excursionsError } = await supabase
      .from('school_excursions')
      .select('id, title, excursion_date, preschool_id')
      .in('status', ['approved', 'pending_approval'])
      .gte('excursion_date', today)
      .lte('excursion_date', excursionMaxWindowDate)

    if (excursionsError) {
      console.error('[calendar-reminders-cron] Error fetching excursions:', excursionsError)
      return new Response(JSON.stringify({ error: excursionsError.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const thresholdKey = (days: number): string | null => {
      if (days === 28) return 'fourWeek'
      if (days === 21) return 'threeWeek'
      if (days === 14) return 'twoWeek'
      if (days === 7) return 'sevenDay'
      if (days === 3) return 'threeDay'
      if (days === 1) return 'oneDay'
      return null
    }

    const processItem = async (
      id: string,
      title: string,
      dateStr: string,
      preschoolId: string,
      eventType: 'school_meeting_reminder' | 'school_excursion_reminder',
      targetAudience: string[],
      logTable: string,
      idColumn: string,
      thresholds = REMINDER_THRESHOLDS,
      weeklyDays?: Set<string>,
    ) => {
      const itemDate = normalizeDateOnly(dateStr)
      if (!itemDate) return
      const daysUntil = diffDays(today, itemDate)
      if (!Number.isFinite(daysUntil) || daysUntil < 0) return

      const baseThreshold = thresholds.find((t) => t.offsetDays === daysUntil)
      const shouldSendWeekly = !baseThreshold
        && !!weeklyDays
        && daysUntil > 0
        && weeklyDays.has(todayWeekday)

      const threshold = baseThreshold || (shouldSendWeekly ? {
        offsetDays: daysUntil,
        label: `${todayWeekday} reminder`,
      } : null)

      if (!threshold || targetAudience.length === 0) return

      const { data: existing } = await supabase.from(logTable).select('id').eq(idColumn, id).eq('reminder_offset_days', threshold.offsetDays).eq('target_role', 'all').maybeSingle()
      if (existing?.id) {
        const key = thresholdKey(threshold.offsetDays)
        if (key && (results.thresholds as any)[key]) {
          (results.thresholds as any)[key].skipped += 1
        } else if (shouldSendWeekly) {
          results.thresholds.weekly.skipped += 1
        }
        results.remindersSkipped += 1
        return
      }

      const { error: notifyErr } = await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type,
          [eventType === 'school_meeting_reminder' ? 'meeting_id' : 'excursion_id']: id,
          preschool_id: preschoolId,
          target_audience: targetAudience,
          context: { reminder_offset_days: threshold.offsetDays, reminder_label: threshold.label, target_role: 'all' },
        },
      })

      if (notifyErr) {
        const key = thresholdKey(threshold.offsetDays)
        if (key && (results.thresholds as any)[key]) {
          (results.thresholds as any)[key].failed += 1
        } else if (shouldSendWeekly) {
          results.thresholds.weekly.failed += 1
        }
        results.remindersFailed += 1
        return
      }

      await supabase.from(logTable).insert({
        [idColumn]: id,
        preschool_id: preschoolId,
        reminder_offset_days: threshold.offsetDays,
        reminder_label: threshold.label,
        target_role: 'all',
        metadata: { event_title: title, event_date: itemDate },
      })

      const sentKey = thresholdKey(threshold.offsetDays)
      if (sentKey && (results.thresholds as any)[sentKey]) {
        (results.thresholds as any)[sentKey].sent += 1
      } else if (shouldSendWeekly) {
        results.thresholds.weekly.sent += 1
      }
      results.remindersSent += 1
      await new Promise((r) => setTimeout(r, 120))
    }

    for (const m of (meetings || []) as SchoolMeeting[]) {
      results.meetingsProcessed += 1
      await processItem(m.id, m.title, m.meeting_date, m.preschool_id, 'school_meeting_reminder',
        meetingTargetAudience(m.meeting_type), 'school_meeting_reminder_logs', 'meeting_id')
    }
    for (const x of (excursions || []) as SchoolExcursion[]) {
      results.excursionsProcessed += 1
      await processItem(x.id, x.title, x.excursion_date, x.preschool_id, 'school_excursion_reminder',
        excursionTargetAudience(), 'school_excursion_reminder_logs', 'excursion_id',
        EXCURSION_REMINDER_THRESHOLDS, EXCURSION_WEEKLY_DAYS)
    }

    return new Response(
      JSON.stringify({
        message: 'Calendar reminders (meetings & excursions) completed',
        timestamp: new Date().toISOString(),
        timezone: DEFAULT_TIMEZONE,
        window: { from: today, to: maxWindowDate },
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
    )
  } catch (err: unknown) {
    console.error('[calendar-reminders-cron] Fatal error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
