/**
 * useStudentSchedule
 *
 * Fetches today's class schedule for K-12 students from enrolled classes.
 */

import { useEffect, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { FeatureItem } from '@/domains/k12/components/K12StudentFeatureScreen';

function parseScheduleTime(schedule: string | null): { label: string; sortKey: number } {
  if (!schedule) return { label: 'No time set', sortKey: 9999 };
  const match = schedule.match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return { label: schedule, sortKey: 9999 };
  const hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return { label: `${h12}:${String(min).padStart(2, '0')} ${ampm}`, sortKey: hour * 60 + min };
}

function getPeriodIcon(index: number): string {
  const icons = [
    'sunny-outline',
    'book-outline',
    'flask-outline',
    'calculator-outline',
    'globe-outline',
    'musical-notes-outline',
    'fitness-outline',
    'color-palette-outline',
  ];
  return icons[index % icons.length];
}

export function useStudentSchedule() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchSchedule = async () => {
      try {
        const supabase = assertSupabase();

        const { data, error } = await supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            classes (
              id,
              name,
              room,
              schedule,
              teacher_name
            )
          `)
          .eq('student_id', user.id)
          .eq('is_active', true);

        if (error || !data || cancelled) return;

        type EnrollmentRow = {
          id: string;
          class_id: string;
          classes: {
            id: string;
            name: string;
            room: string | null;
            schedule: string | null;
            teacher_name: string | null;
          } | null;
        };

        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        const currentTime = currentHour * 60 + currentMin;

        const mapped: (FeatureItem & { sortKey: number })[] = (data as unknown as EnrollmentRow[])
          .filter(e => e.classes)
          .map((e, idx) => {
            const c = e.classes!;
            const { label: timeLabel, sortKey } = parseScheduleTime(c.schedule);
            const isCurrent = sortKey !== 9999 && currentTime >= sortKey && currentTime < sortKey + 60;
            const isPast = sortKey !== 9999 && currentTime >= sortKey + 60;

            const parts: string[] = [timeLabel];
            if (c.room) parts.push(`Room ${c.room}`);
            if (c.teacher_name) parts.push(c.teacher_name);
            if (isCurrent) parts.push('• Now');
            else if (isPast) parts.push('• Done');

            return {
              id: c.id,
              title: c.name,
              subtitle: parts.join(' · '),
              icon: getPeriodIcon(idx) as any,
              tone: isCurrent ? '#10B981' : isPast ? '#9CA3AF' : '#6366F1',
              sortKey,
            };
          });

        mapped.sort((a, b) => a.sortKey - b.sortKey);
        setItems(mapped.map(({ sortKey: _, ...rest }) => rest));
      } catch {
        // Silently fail — empty list is shown
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSchedule();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { items, loading };
}
