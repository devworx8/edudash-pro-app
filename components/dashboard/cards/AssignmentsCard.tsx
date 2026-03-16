import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { DashboardCard } from './DashboardCard';
import { useTerm } from '@/contexts/TerminologyContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';

interface Assignment {
  title: string;
  dueDate: string;
  status: string;
}

export function AssignmentsCard() {
  const taskTerm = useTerm('task');
  const { theme } = useTheme();
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = assertSupabase();
        const todayStr = new Date().toISOString().slice(0, 10);

        // Fetch upcoming homework assignments for this student's classes
        const { data: subs } = await supabase
          .from('homework_submissions')
          .select('assignment_id')
          .eq('student_id', user.id);
        const submittedIds = new Set((subs ?? []).map(s => s.assignment_id).filter(Boolean));

        const { data } = await supabase
          .from('homework_assignments')
          .select('id, title, due_date, status')
          .gte('due_date', todayStr)
          .in('status', ['active', 'published', 'assigned'])
          .order('due_date', { ascending: true })
          .limit(5);

        if (cancelled) return;
        const mapped = (data ?? [])
          .filter(a => !submittedIds.has(a.id))
          .map(a => ({
            title: a.title,
            dueDate: a.due_date ? formatRelativeDate(a.due_date) : '',
            status: 'pending',
          }));
        setAssignments(mapped);
      } catch { /* graceful fallback to empty */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return theme.colors?.warning || theme.warning || '#f59e0b';
      case 'in_progress':
        return theme.colors?.info || theme.info || '#3b82f6';
      case 'completed':
        return theme.colors?.success || theme.success || '#10b981';
      default:
        return theme.text;
    }
  };

  return (
    <DashboardCard title={`My ${taskTerm}s`} icon="document-text-outline">
      <View style={styles.list}>
        {assignments.map((item, idx) => (
          <View
            key={idx}
            style={[styles.item, { borderLeftColor: getStatusColor(item.status) }]}
          >
            <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
            <Text style={[styles.dueDate, { color: theme.textSecondary }]}>{item.dueDate}</Text>
          </View>
        ))}
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  item: {
    paddingLeft: 12,
    paddingVertical: 8,
    borderLeftWidth: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  dueDate: {
    fontSize: 12,
    opacity: 0.6,
  },
});

function formatRelativeDate(dateStr: string): string {
  const due = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Due Today';
  if (diffDays === 1) return 'Due Tomorrow';
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return `Due ${due.toLocaleDateString()}`;
}
