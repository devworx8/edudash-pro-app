import { Platform } from 'react-native';
import NotificationService from '@/lib/NotificationService';
import type { TeacherDashboardData } from '@/types/dashboard';

function parseTimeToMinutes(value?: string | null): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function buildTodayDateForMinutes(minutes: number): Date {
  const target = new Date();
  target.setSeconds(0, 0);
  target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return target;
}

export async function scheduleTeacherRoutineReminders(
  routine: TeacherDashboardData['todayRoutine']
): Promise<{ scheduled: number; skipped: number }> {
  if (!routine || !Array.isArray(routine.blocks) || routine.blocks.length === 0) {
    return { scheduled: 0, skipped: 0 };
  }
  if (Platform.OS === 'web') {
    return { scheduled: 0, skipped: routine.blocks.length };
  }

  const notificationService = NotificationService.getInstance();
  await notificationService.initialize();

  const scheduledNotifications = await notificationService.getScheduledNotifications();
  const existingForProgram = scheduledNotifications.filter((notification) => {
    const data = (notification?.content?.data || {}) as Record<string, unknown>;
    return (
      String(data.type || '') === 'teacher_routine' &&
      String(data.weekly_program_id || '') === routine.weeklyProgramId
    );
  });

  for (const notification of existingForProgram) {
    try {
      await notificationService.cancelNotification(notification.identifier);
    } catch {
      // Best effort cancellation.
    }
  }

  const now = Date.now();
  let scheduled = 0;
  let skipped = 0;

  for (const block of routine.blocks) {
    const startMinutes = parseTimeToMinutes(block.startTime || null);
    if (startMinutes === null) {
      skipped += 1;
      continue;
    }

    const reminderDate = buildTodayDateForMinutes(Math.max(0, startMinutes - 10));
    if (reminderDate.getTime() <= now) {
      skipped += 1;
      continue;
    }

    try {
      await notificationService.scheduleLocalNotification(
        {
          id: `teacher_routine_${routine.weeklyProgramId}_${block.id}`,
          title: `Routine reminder: ${block.title}`,
          body: `Starts at ${block.startTime || 'scheduled time'}.`,
          data: {
            type: 'teacher_routine',
            weekly_program_id: routine.weeklyProgramId,
            block_id: block.id,
            block_title: block.title,
            block_start_time: block.startTime,
          },
          priority: 'high',
        },
        { date: reminderDate } as any
      );
      scheduled += 1;
    } catch {
      skipped += 1;
    }
  }

  return { scheduled, skipped };
}
