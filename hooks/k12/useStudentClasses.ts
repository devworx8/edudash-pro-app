/**
 * useStudentClasses
 *
 * Fetches enrolled classes for K-12 student via student_enrollments + classes join.
 */

import { useEffect, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { FeatureItem } from '@/domains/k12/components/K12StudentFeatureScreen';

const CLASS_TYPE_ICONS: Record<string, string> = {
  math: 'calculator-outline',
  mathematics: 'calculator-outline',
  english: 'book-outline',
  science: 'flask-outline',
  history: 'time-outline',
  geography: 'globe-outline',
  technology: 'laptop-outline',
  art: 'color-palette-outline',
  music: 'musical-notes-outline',
  life: 'heart-outline',
  physical: 'fitness-outline',
};

function getClassIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(CLASS_TYPE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return 'school-outline';
}

export function useStudentClasses() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchClasses = async () => {
      try {
        const supabase = assertSupabase();

        const { data, error } = await supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            is_active,
            classes (
              id,
              name,
              room,
              schedule,
              grade_level,
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
            grade_level: string | null;
            teacher_name: string | null;
          } | null;
        };

        const mapped: FeatureItem[] = (data as unknown as EnrollmentRow[])
          .filter(e => e.classes)
          .map(e => {
            const c = e.classes!;
            const parts: string[] = [];
            if (c.teacher_name) parts.push(c.teacher_name);
            if (c.room) parts.push(`Room ${c.room}`);
            if (c.schedule) parts.push(c.schedule);

            return {
              id: c.id,
              title: c.name,
              subtitle: parts.join(' · ') || 'No details yet',
              icon: getClassIcon(c.name) as any,
              tone: '#3B82F6',
            };
          });

        setItems(mapped);
      } catch {
        // Silently fail — empty list is shown
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchClasses();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { items, loading };
}
