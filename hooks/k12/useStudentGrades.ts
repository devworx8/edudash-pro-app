/**
 * useStudentGrades
 *
 * Aggregates grades from homework_submissions grouped by subject for K-12 students.
 */

import { useEffect, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { FeatureItem } from '@/domains/k12/components/K12StudentFeatureScreen';

const SUBJECT_ICONS: Record<string, string> = {
  mathematics: 'calculator-outline',
  math: 'calculator-outline',
  english: 'book-outline',
  science: 'flask-outline',
  physics: 'flash-outline',
  history: 'time-outline',
  geography: 'globe-outline',
  technology: 'laptop-outline',
  art: 'color-palette-outline',
  music: 'musical-notes-outline',
  life: 'heart-outline',
};

const GRADE_TONES: Record<string, string> = {
  A: '#10B981',
  B: '#3B82F6',
  C: '#F59E0B',
  D: '#F97316',
  F: '#EF4444',
};

function getSubjectIcon(subject: string): string {
  const lower = subject.toLowerCase();
  for (const [key, icon] of Object.entries(SUBJECT_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return 'document-text-outline';
}

function getGradeTone(avg: number): string {
  if (avg >= 80) return GRADE_TONES.A;
  if (avg >= 60) return GRADE_TONES.B;
  if (avg >= 50) return GRADE_TONES.C;
  if (avg >= 40) return GRADE_TONES.D;
  return GRADE_TONES.F;
}

export function useStudentGrades() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchGrades = async () => {
      try {
        const supabase = assertSupabase();

        // Fetch graded submissions with assignment subject
        const { data, error } = await supabase
          .from('homework_submissions')
          .select(`
            id,
            grade,
            submitted_at,
            assignment:homework_assignments!homework_submissions_assignment_id_fkey (
              subject
            )
          `)
          .eq('student_id', user.id)
          .not('grade', 'is', null)
          .order('submitted_at', { ascending: false })
          .limit(100);

        if (error || !data || cancelled) return;

        // Group by subject and compute average
        const bySubject = new Map<string, number[]>();

        for (const row of data as any[]) {
          const assignment = Array.isArray(row.assignment) ? row.assignment[0] : row.assignment;
          const subject = assignment?.subject || 'General';
          const grade = typeof row.grade === 'number' ? row.grade : parseFloat(row.grade);
          if (isNaN(grade)) continue;

          if (!bySubject.has(subject)) bySubject.set(subject, []);
          bySubject.get(subject)!.push(grade);
        }

        const mapped: FeatureItem[] = Array.from(bySubject.entries()).map(([subject, grades]) => {
          const avg = Math.round(grades.reduce((s, v) => s + v, 0) / grades.length);
          return {
            id: subject,
            title: subject,
            subtitle: `Average: ${avg}% · ${grades.length} graded`,
            icon: getSubjectIcon(subject) as any,
            tone: getGradeTone(avg),
          };
        });

        // Sort by subject name
        mapped.sort((a, b) => a.title.localeCompare(b.title));
        setItems(mapped);
      } catch {
        // Silently fail — empty list is shown
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchGrades();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { items, loading };
}
