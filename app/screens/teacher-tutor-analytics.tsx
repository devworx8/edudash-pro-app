/**
 * teacher-tutor-analytics.tsx
 *
 * Teacher-facing screen showing AI Tutor analytics per class.
 * Features:
 *  - Class picker (all classes assigned to the teacher)
 *  - Heatmap grid (students × subjects by accuracy)
 *  - Student drilldown: session history modal
 *  - Time-range filter (7d / 30d / 90d)
 *
 * ≤ 500 lines (WARP.md — screen limit)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { fetchTeacherClassIds } from '@/lib/dashboard/fetchTeacherClassIds';
import { logger } from '@/lib/logger';
import { useClassTutorAnalytics, type TutorSessionSummary } from '@/hooks/useClassTutorAnalytics';
import ClassTutorHeatmap from '@/components/teacher/ClassTutorHeatmap';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassOption {
  id: string;
  name: string;
  grade_level?: string;
}

const TIME_RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function TeacherTutorAnalyticsScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(30);
  const [classesLoading, setClassesLoading] = useState(true);

  // Student drilldown modal
  const [drillStudent, setDrillStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [sessions, setSessions] = useState<TutorSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const { data: analytics, loading, error, refetch, fetchStudentSessions } =
    useClassTutorAnalytics(selectedClassId, sinceDays);

  // Load teacher classes
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const supabase = assertSupabase();
        // Use class_teachers + legacy merge to include assistant teacher assignments
        const classIds = await fetchTeacherClassIds(user.id);
        if (classIds.length === 0) {
          if (!cancelled) {
            setClasses([]);
            setClassesLoading(false);
          }
          return;
        }

        const { data: classRows } = await supabase
          .from('classes')
          .select('id, name, grade_level')
          .in('id', classIds)
          .order('name');

        if (cancelled) return;
        const items = (classRows ?? []) as ClassOption[];
        setClasses(items);
        if (items.length > 0 && !selectedClassId) {
          setSelectedClassId(items[0].id);
        }
      } catch (err) {
        logger.error('[TeacherTutorAnalytics] load classes', err);
      } finally {
        if (!cancelled) setClassesLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Student drilldown
  const handleStudentPress = useCallback(async (studentId: string, studentName: string) => {
    setDrillStudent({ id: studentId, name: studentName });
    setSessionsLoading(true);
    const result = await fetchStudentSessions(studentId);
    setSessions(result);
    setSessionsLoading(false);
  }, [fetchStudentSessions]);

  const closeDrilldown = useCallback(() => {
    setDrillStudent(null);
    setSessions([]);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Tutor Analytics',
          headerTintColor: theme.colors.text,
          headerStyle: { backgroundColor: theme.colors.cardBackground },
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Class Picker */}
        {classesLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : classes.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.colors.cardBackground }]}>
            <Ionicons name="school-outline" size={32} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              No classes assigned to you yet.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Class</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {classes.map((c) => {
                const active = c.id === selectedClassId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.chip,
                      active
                        ? { backgroundColor: theme.colors.primary }
                        : { backgroundColor: theme.colors.cardBackground },
                    ]}
                    onPress={() => setSelectedClassId(c.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? '#fff' : theme.colors.text },
                      ]}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Time range selector */}
            <View style={styles.timeRow}>
              {TIME_RANGES.map((r) => {
                const active = r.days === sinceDays;
                return (
                  <TouchableOpacity
                    key={r.days}
                    style={[
                      styles.timeChip,
                      active
                        ? { backgroundColor: theme.colors.primary + '22', borderColor: theme.colors.primary }
                        : { borderColor: theme.colors.border },
                    ]}
                    onPress={() => setSinceDays(r.days)}
                  >
                    <Text
                      style={[
                        styles.timeChipText,
                        { color: active ? theme.colors.primary : theme.colors.textSecondary },
                      ]}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity onPress={refetch} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Heatmap */}
            {loading ? (
              <ActivityIndicator style={styles.loader} />
            ) : error ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.colors.cardBackground }]}>
                <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : analytics ? (
              <ClassTutorHeatmap analytics={analytics} onStudentPress={handleStudentPress} />
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Student Drilldown Modal */}
      <Modal visible={!!drillStudent} animationType="slide" transparent onRequestClose={closeDrilldown}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {drillStudent?.name ?? 'Student'} — Sessions
              </Text>
              <TouchableOpacity onPress={closeDrilldown}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {sessionsLoading ? (
              <ActivityIndicator style={styles.loader} />
            ) : sessions.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                No tutor sessions found.
              </Text>
            ) : (
              <ScrollView style={styles.sessionList}>
                {sessions.map((s) => (
                  <SessionCard key={s.session_id} session={s} theme={theme} />
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Session Card ────────────────────────────────────────────────────────────

const SessionCard = React.memo(function SessionCard({
  session,
  theme,
}: {
  session: TutorSessionSummary;
  theme: any;
}) {
  const dateStr = new Date(session.started_at).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const accuracyColor =
    session.accuracy_pct >= 80 ? '#22c55e' :
    session.accuracy_pct >= 50 ? '#eab308' : '#ef4444';

  return (
    <View style={[styles.sessionCard, { borderLeftColor: accuracyColor }]}>
      <View style={styles.sessionRow}>
        <Text style={[styles.sessionSubject, { color: theme.colors.text }]}>
          {session.subject || 'General'} — {session.topic || session.mode}
        </Text>
        <Text style={[styles.sessionAccuracy, { color: accuracyColor }]}>
          {session.accuracy_pct}%
        </Text>
      </View>
      <Text style={styles.sessionMeta}>
        {session.correct_answers}/{session.total_questions} correct · {session.mode} · {dateStr}
      </Text>
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' },
  chipRow: { marginBottom: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  timeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  timeChipText: { fontSize: 12, fontWeight: '500' },
  refreshBtn: { marginLeft: 'auto', padding: 4 },
  loader: { marginTop: 40 },
  emptyCard: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 14, textAlign: 'center' },
  errorText: { fontSize: 13, color: '#ef4444', textAlign: 'center', marginTop: 6 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  sessionList: { marginBottom: 16 },
  sessionCard: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionSubject: { fontSize: 14, fontWeight: '600', flex: 1 },
  sessionAccuracy: { fontSize: 16, fontWeight: '700' },
  sessionMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
});
