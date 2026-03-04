/**
 * Birthday Reminders Cron Job
 *
 * Runs daily to send birthday reminder notifications:
 * - 7 days before: Upcoming birthday reminder (sticky acknowledgment required)
 * - 5 days before: Upcoming birthday reminder (sticky acknowledgment required)
 * - 1 day before: Final reminder to parents + teacher reminder
 * - Day of: Birthday wishes to parents + teacher alert
 *
 * Also sends donation reminders at 28/21/14/7 days and tracks sends with idempotency logs.
 */

import { serve } from 'std/http/server.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || 'your-cron-secret'

const UPCOMING_REMINDER_DAYS = [7, 5]
const DONATION_REMINDER_DAYS = [28, 21, 14, 7]

interface StudentBirthday {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  class_id: string | null;
  parent_id: string | null;
  guardian_id: string | null;
  preschool_id: string;
  avatar_url: string | null;
  classes?:
    | {
        id: string;
        name: string;
        teacher_id: string | null;
      }
    | Array<{
        id: string;
        name: string;
        teacher_id: string | null;
      }>
    | null;
}

interface BirthdayReminder {
  studentId: string;
  studentName: string;
  daysUntil: number;
  age: number;
  classId: string | null;
  className: string | null;
  parentId: string | null;
  guardianId: string | null;
  teacherId: string | null;
  preschoolId: string;
  birthdayDate: string;
}

type ReminderStats = {
  sent: number;
  failed: number;
  skipped: number;
}

interface SendReminderOptions {
  supabase: SupabaseClient;
  schoolId: string;
  schoolName: string;
  studentId: string;
  studentName: string;
  birthdayDateIso: string;
  birthdayYear: number;
  eventType: string;
  reminderOffsetDays: number;
  recipients: string[];
  context: Record<string, unknown>;
  stats: ReminderStats;
  customPayload?: Record<string, unknown>;
}

let birthdayReminderLogsAvailable = true

function isMissingReminderLogsTable(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || '').toLowerCase()
  return message.includes('birthday_reminder_logs') && message.includes('does not exist')
}

function uniqueRecipients(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

// Calculate age they will be turning
function calculateAge(dateOfBirth: string, birthdayDate: Date): number {
  const dob = new Date(dateOfBirth)
  return birthdayDate.getFullYear() - dob.getFullYear()
}

// Get upcoming birthday date (this year, or next year if already passed)
function getThisYearsBirthday(dateOfBirth: string): Date {
  const dob = new Date(dateOfBirth)
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const birthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
  birthday.setHours(0, 0, 0, 0)

  if (birthday < today) {
    birthday.setFullYear(today.getFullYear() + 1)
  }

  return birthday
}

// Calculate days until birthday
function getDaysUntil(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

async function sendReminderWithIdempotency(options: SendReminderOptions): Promise<void> {
  const {
    supabase,
    schoolId,
    schoolName,
    studentId,
    studentName,
    birthdayDateIso,
    birthdayYear,
    eventType,
    reminderOffsetDays,
    recipients,
    context,
    stats,
    customPayload,
  } = options

  for (const recipientId of recipients) {
    if (birthdayReminderLogsAvailable) {
      const { data: existingLog, error: existingLogError } = await supabase
        .from('birthday_reminder_logs')
        .select('id')
        .eq('student_id', studentId)
        .eq('recipient_user_id', recipientId)
        .eq('event_type', eventType)
        .eq('reminder_offset_days', reminderOffsetDays)
        .eq('birthday_year', birthdayYear)
        .maybeSingle()

      if (existingLogError) {
        if (isMissingReminderLogsTable(existingLogError)) {
          birthdayReminderLogsAvailable = false
          console.warn('[birthday-reminders-cron] birthday_reminder_logs missing; continuing without idempotency')
        } else {
          console.error('[birthday-reminders-cron] Failed log pre-check:', existingLogError)
          stats.failed++
          continue
        }
      } else if (existingLog?.id) {
        stats.skipped++
        continue
      }
    }

    const { error: notifyError } = await supabase.functions.invoke('notifications-dispatcher', {
      body: {
        event_type: eventType,
        user_ids: [recipientId],
        preschool_id: schoolId,
        context,
        custom_payload: customPayload,
      },
    })

    if (notifyError) {
      console.error(`[birthday-reminders-cron] Failed ${eventType} for ${studentName}:`, notifyError)
      stats.failed++
      continue
    }

    if (birthdayReminderLogsAvailable) {
      const { error: logInsertError } = await supabase
        .from('birthday_reminder_logs')
        .insert({
          preschool_id: schoolId,
          student_id: studentId,
          recipient_user_id: recipientId,
          event_type: eventType,
          reminder_offset_days: reminderOffsetDays,
          birthday_year: birthdayYear,
          metadata: {
            school_name: schoolName,
            student_name: studentName,
            birthday_date: birthdayDateIso,
          },
        })

      if (logInsertError) {
        if (isMissingReminderLogsTable(logInsertError)) {
          birthdayReminderLogsAvailable = false
          console.warn('[birthday-reminders-cron] birthday_reminder_logs missing during insert; continuing without idempotency')
        } else {
          console.error('[birthday-reminders-cron] Failed log insert:', logInsertError)
          stats.failed++
          continue
        }
      }
    }

    stats.sent++
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
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
    const token = authHeader?.replace('Bearer ', '')

    const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY
    const isCronJob = token === CRON_SECRET

    let isValidServiceRole = false
    if (token && !isServiceRole && !isCronJob) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        isValidServiceRole = payload.role === 'service_role'
      } catch {
        // Ignore invalid JWT shape
      }
    }

    if (!isCronJob && !isServiceRole && !isValidServiceRole) {
      console.log('[birthday-reminders-cron] Authorization failed')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('[birthday-reminders-cron] Starting birthday reminder check...')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const upcoming7Day = { sent: 0, failed: 0, skipped: 0 } as ReminderStats
    const upcoming5Day = { sent: 0, failed: 0, skipped: 0 } as ReminderStats
    const donationReminders = { sent: 0, failed: 0, skipped: 0 } as ReminderStats

    const results = {
      // Backward-compatible key kept for existing dashboards/scripts.
      parentReminders7Day: upcoming7Day,
      // New explicit keys.
      upcomingReminders7Day: upcoming7Day,
      upcomingReminders5Day: upcoming5Day,
      donationReminders,
      parentReminders1Day: { sent: 0, failed: 0, skipped: 0 } as ReminderStats,
      teacherReminders: { sent: 0, failed: 0, skipped: 0 } as ReminderStats,
      birthdayWishes: { sent: 0, failed: 0, skipped: 0 } as ReminderStats,
      totalProcessed: 0,
    }

    const { data: schools, error: schoolsError } = await supabase
      .from('preschools')
      .select('id, name')
      .eq('is_active', true)

    if (schoolsError) {
      console.error('[birthday-reminders-cron] Error fetching schools:', schoolsError)
      throw schoolsError
    }

    console.log(`[birthday-reminders-cron] Processing ${schools?.length || 0} schools`)

    for (const school of schools || []) {
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select(`
          id,
          first_name,
          last_name,
          date_of_birth,
          class_id,
          parent_id,
          guardian_id,
          preschool_id,
          avatar_url,
          classes(id, name, teacher_id)
        `)
        .eq('preschool_id', school.id)
        .eq('is_active', true)
        .not('date_of_birth', 'is', null)

      if (studentsError) {
        console.error(`[birthday-reminders-cron] Error fetching students for school ${school.id}:`, studentsError)
        continue
      }

      for (const student of (students || []) as StudentBirthday[]) {
        const birthdayDate = getThisYearsBirthday(student.date_of_birth)
        const birthdayYear = birthdayDate.getFullYear()
        const daysUntil = getDaysUntil(birthdayDate)

        const shouldSendDonationReminder = DONATION_REMINDER_DAYS.includes(daysUntil)
        const shouldSendUpcomingReminder = UPCOMING_REMINDER_DAYS.includes(daysUntil)

        if (!shouldSendDonationReminder && !shouldSendUpcomingReminder && daysUntil !== 1 && daysUntil !== 0) {
          continue
        }

        results.totalProcessed++

        const classData = Array.isArray(student.classes) ? student.classes[0] : student.classes
        const age = calculateAge(student.date_of_birth, birthdayDate)
        const studentName = `${student.first_name} ${student.last_name}`
        const birthdayDateDisplay = birthdayDate.toLocaleDateString('en-ZA', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })

        const reminder: BirthdayReminder = {
          studentId: student.id,
          studentName,
          daysUntil,
          age,
          classId: student.class_id,
          className: classData?.name || null,
          parentId: student.parent_id,
          guardianId: student.guardian_id,
          teacherId: classData?.teacher_id || null,
          preschoolId: school.id,
          birthdayDate: birthdayDate.toISOString(),
        }

        const parentRecipients = uniqueRecipients([student.parent_id, student.guardian_id])

        if (shouldSendUpcomingReminder && parentRecipients.length > 0) {
          const isSevenDay = daysUntil === 7
          const eventType = isSevenDay ? 'birthday_reminder_week' : 'birthday_reminder_5_days'
          const stats = isSevenDay ? results.upcomingReminders7Day : results.upcomingReminders5Day

          await sendReminderWithIdempotency({
            supabase,
            schoolId: school.id,
            schoolName: school.name,
            studentId: reminder.studentId,
            studentName,
            birthdayDateIso: reminder.birthdayDate,
            birthdayYear,
            eventType,
            reminderOffsetDays: daysUntil,
            recipients: parentRecipients,
            context: {
              student_name: student.first_name,
              student_full_name: studentName,
              days_until: daysUntil,
              age,
              class_name: reminder.className,
              school_name: school.name,
              birthday_date: birthdayDateDisplay,
            },
            customPayload: {
              sticky_popup: true,
              requires_swipe_ack: true,
              reminder_kind: 'birthday_upcoming',
              reminder_offset_days: daysUntil,
            },
            stats,
          })
        }

        if (shouldSendDonationReminder && parentRecipients.length > 0) {
          await sendReminderWithIdempotency({
            supabase,
            schoolId: school.id,
            schoolName: school.name,
            studentId: reminder.studentId,
            studentName,
            birthdayDateIso: reminder.birthdayDate,
            birthdayYear,
            eventType: 'birthday_donation_reminder',
            reminderOffsetDays: daysUntil,
            recipients: parentRecipients,
            context: {
              child_name: studentName,
              student_name: student.first_name,
              student_full_name: studentName,
              days_until: daysUntil,
              age,
              donation_amount: 25,
              birthday_date: birthdayDateDisplay,
              class_name: reminder.className,
              school_name: school.name,
            },
            customPayload: {
              reminder_kind: 'birthday_donation',
              reminder_offset_days: daysUntil,
            },
            stats: results.donationReminders,
          })
        }

        if (daysUntil === 1 && parentRecipients.length > 0) {
          await sendReminderWithIdempotency({
            supabase,
            schoolId: school.id,
            schoolName: school.name,
            studentId: reminder.studentId,
            studentName,
            birthdayDateIso: reminder.birthdayDate,
            birthdayYear,
            eventType: 'birthday_reminder_tomorrow',
            reminderOffsetDays: 1,
            recipients: parentRecipients,
            context: {
              student_name: student.first_name,
              student_full_name: studentName,
              age,
              class_name: reminder.className,
              school_name: school.name,
            },
            customPayload: {
              reminder_kind: 'birthday_tomorrow',
              reminder_offset_days: 1,
            },
            stats: results.parentReminders1Day,
          })
        }

        if (daysUntil === 1 && reminder.teacherId) {
          await sendReminderWithIdempotency({
            supabase,
            schoolId: school.id,
            schoolName: school.name,
            studentId: reminder.studentId,
            studentName,
            birthdayDateIso: reminder.birthdayDate,
            birthdayYear,
            eventType: 'birthday_reminder_teacher',
            reminderOffsetDays: 1,
            recipients: [reminder.teacherId],
            context: {
              student_name: student.first_name,
              student_full_name: studentName,
              age,
              class_name: reminder.className,
              school_name: school.name,
            },
            customPayload: {
              reminder_kind: 'birthday_teacher',
              reminder_offset_days: 1,
            },
            stats: results.teacherReminders,
          })
        }

        if (daysUntil === 0 && parentRecipients.length > 0) {
          await sendReminderWithIdempotency({
            supabase,
            schoolId: school.id,
            schoolName: school.name,
            studentId: reminder.studentId,
            studentName,
            birthdayDateIso: reminder.birthdayDate,
            birthdayYear,
            eventType: 'birthday_today',
            reminderOffsetDays: 0,
            recipients: parentRecipients,
            context: {
              student_name: student.first_name,
              student_full_name: studentName,
              age,
              school_name: school.name,
            },
            customPayload: {
              reminder_kind: 'birthday_today',
              reminder_offset_days: 0,
            },
            stats: results.birthdayWishes,
          })
        }

        if (daysUntil === 0 && reminder.teacherId) {
          await sendReminderWithIdempotency({
            supabase,
            schoolId: school.id,
            schoolName: school.name,
            studentId: reminder.studentId,
            studentName,
            birthdayDateIso: reminder.birthdayDate,
            birthdayYear,
            eventType: 'birthday_today_teacher',
            reminderOffsetDays: 0,
            recipients: [reminder.teacherId],
            context: {
              student_name: student.first_name,
              student_full_name: studentName,
              age,
              class_name: reminder.className,
            },
            customPayload: {
              reminder_kind: 'birthday_today_teacher',
              reminder_offset_days: 0,
            },
            stats: results.teacherReminders,
          })
        }
      }
    }

    console.log('[birthday-reminders-cron] Completed:', results)

    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('[birthday-reminders-cron] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
})
