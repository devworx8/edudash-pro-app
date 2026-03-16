import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { DashboardCard } from './DashboardCard';
import { useTerm } from '@/contexts/TerminologyContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';

interface ScheduleItem {
  time: string;
  title: string;
  location: string;
}

export function ScheduleCard() {
  const sessionTerm = useTerm('session');
  const { theme } = useTheme();
  const { user } = useAuth();
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = assertSupabase();
        const { data } = await supabase
          .from('student_enrollments')
          .select('classes(name, schedule, room)')
          .eq('student_id', user.id);

        if (cancelled) return;
        const mapped = (data ?? [])
          .filter((e: any) => e.classes)
          .map((e: any) => ({
            time: e.classes.schedule || '',
            title: `${e.classes.name} ${sessionTerm}`,
            location: e.classes.room || '',
          }));
        setScheduleItems(mapped);
      } catch { /* graceful fallback */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, sessionTerm]);

  return (
    <DashboardCard title="Today's Schedule" icon="calendar-outline">
      <View style={styles.list}>
        {scheduleItems.map((item, idx) => (
          <View
            key={idx}
            style={[
              styles.item,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <Text style={[styles.time, { color: theme.text }]}>{item.time}</Text>
            <View style={styles.details}>
              <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
              <Text style={[styles.location, { color: theme.textSecondary }]}>{item.location}</Text>
            </View>
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
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  time: {
    fontSize: 13,
    fontWeight: '600',
    width: 80,
  },
  details: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  location: {
    fontSize: 12,
    opacity: 0.6,
  },
});
