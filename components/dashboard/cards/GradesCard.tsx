import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { DashboardCard } from './DashboardCard';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';

interface GradeItem {
  subject: string;
  grade: string;
  percentage: number;
}

export function GradesCard() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [grades, setGrades] = useState<GradeItem[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = assertSupabase();
        // Fetch recently graded homework submissions with subject info
        const { data } = await supabase
          .from('homework_submissions')
          .select('grade, homework_assignments(subject)')
          .eq('student_id', user.id)
          .not('grade', 'is', null)
          .order('submitted_at', { ascending: false })
          .limit(5);

        if (cancelled) return;
        const mapped = (data ?? []).map((s: any) => {
          const pct = Math.round(Number(s.grade) || 0);
          return {
            subject: s.homework_assignments?.subject || 'General',
            grade: percentToLetter(pct),
            percentage: pct,
          };
        });
        setGrades(mapped);
      } catch { /* graceful fallback */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return theme.colors?.success || theme.success || '#10b981';
    if (percentage >= 80) return theme.colors?.info || theme.info || '#3b82f6';
    if (percentage >= 70) return theme.colors?.warning || theme.warning || '#f59e0b';
    return theme.colors?.error || theme.error || '#ef4444';
  };

  return (
    <DashboardCard title="Recent Grades" icon="school-outline">
      <View style={styles.list}>
        {grades.map((item, idx) => (
          <View key={idx} style={styles.item}>
            <View style={styles.subjectRow}>
              <Text style={[styles.subject, { color: theme.text }]}>{item.subject}</Text>
              <View style={styles.gradeContainer}>
                <Text
                  style={[styles.grade, { color: getGradeColor(item.percentage) }]}
                >
                  {item.grade}
                </Text>
                <Text style={[styles.percentage, { color: theme.textSecondary }]}>({item.percentage}%)</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  item: {
    paddingVertical: 4,
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subject: {
    fontSize: 14,
    fontWeight: '500',
  },
  gradeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  grade: {
    fontSize: 16,
    fontWeight: '700',
  },
  percentage: {
    fontSize: 12,
    opacity: 0.6,
  },
});

function percentToLetter(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B+';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}
