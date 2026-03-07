/**
 * Gradebook Screen
 * Teachers view and enter grades per student per subject for a class.
 * Route params: classId (required), className (display only)
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { toast } from '@/components/ui/ToastProvider';

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  grades: { subject: string; score: number | null; submissionId: string | null }[];
}

async function fetchGradebook(classId: string) {
  const sb = assertSupabase();
  const { data: enrollments, error: enrErr } = await sb
    .from('class_enrollments')
    .select('student:students(id, first_name, last_name)')
    .eq('class_id', classId);
  if (enrErr) throw enrErr;

  const students = (enrollments ?? []).map((e: any) => e.student).filter(Boolean);
  if (!students.length) return { students: [], subjects: [] };

  const studentIds = students.map((s: any) => s.id);
  const { data: submissions, error: subErr } = await sb
    .from('homework_submissions')
    .select('id, student_id, grade, homework_assignments!inner(subject, class_id)')
    .in('student_id', studentIds)
    .eq('homework_assignments.class_id', classId)
    .order('created_at', { ascending: false });
  if (subErr) throw subErr;

  const subjectSet = new Set<string>();
  const gradeMap = new Map<string, { score: number | null; submissionId: string }>();
  for (const sub of (submissions ?? []) as any[]) {
    const subject = sub.homework_assignments?.subject || 'General';
    subjectSet.add(subject);
    const key = `${sub.student_id}::${subject}`;
    if (!gradeMap.has(key)) {
      gradeMap.set(key, { score: sub.grade, submissionId: sub.id });
    }
  }

  const subjects = Array.from(subjectSet).sort();
  const rows: StudentRow[] = students.map((s: any) => ({
    id: s.id,
    firstName: s.first_name || '',
    lastName: s.last_name || '',
    grades: subjects.map(subject => {
      const entry = gradeMap.get(`${s.id}::${subject}`);
      return { subject, score: entry?.score ?? null, submissionId: entry?.submissionId ?? null };
    }),
  }));

  return { students: rows, subjects };
}

export default function GradebookScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { classId, className } = useLocalSearchParams<{ classId: string; className?: string }>();
  const queryClient = useQueryClient();
  const { showAlert, alertProps } = useAlertModal();
  const [editCell, setEditCell] = useState<{ studentId: string; subject: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['gradebook', classId],
    queryFn: () => fetchGradebook(classId!),
    enabled: !!classId,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ submissionId, score }: { submissionId: string; score: number }) => {
      const { error } = await assertSupabase()
        .from('homework_submissions')
        .update({ grade: score, graded_at: new Date().toISOString(), graded_by: profile?.id })
        .eq('id', submissionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gradebook', classId] });
      toast.success('Grade saved');
      setEditCell(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save grade'),
  });

  const handleCellPress = useCallback((studentId: string, subject: string, current: number | null) => {
    setEditCell({ studentId, subject });
    setEditValue(current !== null ? String(current) : '');
  }, []);

  const handleSave = useCallback((submissionId: string | null) => {
    const score = parseFloat(editValue);
    if (isNaN(score) || score < 0 || score > 100) {
      showAlert({ title: 'Invalid Grade', message: 'Enter a number between 0 and 100.', type: 'warning' });
      return;
    }
    if (!submissionId) {
      showAlert({ title: 'No Submission', message: 'This learner has no submission for this assignment yet.', type: 'info' });
      return;
    }
    saveMutation.mutate({ submissionId, score });
  }, [editValue, saveMutation, showAlert]);

  const s = styles(theme);

  if (isLoading) return (
    <SafeAreaView style={s.container}>
      <Stack.Screen options={{ title: className || 'Gradebook', headerShown: true }} />
      <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
    </SafeAreaView>
  );

  if (error || !data) return (
    <SafeAreaView style={s.container}>
      <Stack.Screen options={{ title: className || 'Gradebook', headerShown: true }} />
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.error} />
        <Text style={[s.errorText, { color: theme.text }]}>Failed to load gradebook</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
          <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const { students, subjects } = data;

  return (
    <SafeAreaView style={s.container}>
      <Stack.Screen
        options={{
          title: className || 'Gradebook',
          headerShown: true,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 12 }}>
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
          ),
        }}
      />
      {students.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="school-outline" size={48} color={theme.primary} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>No learners enrolled</Text>
          <Text style={[s.emptySubtitle, { color: theme.textSecondary }]}>Enrol learners in this class to start tracking grades.</Text>
        </View>
      ) : subjects.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="document-text-outline" size={48} color={theme.primary} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>No graded assignments yet</Text>
          <Text style={[s.emptySubtitle, { color: theme.textSecondary }]}>Grades will appear here once homework submissions are marked.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} />}
        >
          <ScrollView>
            {/* Header row */}
            <View style={s.headerRow}>
              <View style={[s.nameCell, s.headerCell]}>
                <Text style={[s.headerText, { color: theme.textSecondary }]}>Learner</Text>
              </View>
              {subjects.map(sub => (
                <View key={sub} style={[s.gradeCell, s.headerCell]}>
                  <Text style={[s.headerText, { color: theme.textSecondary }]} numberOfLines={2}>{sub}</Text>
                </View>
              ))}
            </View>

            {/* Student rows */}
            {students.map((student, idx) => (
              <View key={student.id} style={[s.row, { backgroundColor: idx % 2 === 0 ? theme.surface : theme.background }]}>
                <View style={s.nameCell}>
                  <Text style={[s.nameText, { color: theme.text }]} numberOfLines={1}>
                    {student.firstName} {student.lastName}
                  </Text>
                </View>
                {student.grades.map(g => {
                  const isEditing = editCell?.studentId === student.id && editCell?.subject === g.subject;
                  return (
                    <TouchableOpacity
                      key={g.subject}
                      style={[s.gradeCell, isEditing && { backgroundColor: theme.primaryContainer }]}
                      onPress={() => handleCellPress(student.id, g.subject, g.score)}
                    >
                      {isEditing ? (
                        <View style={s.editRow}>
                          <TextInput
                            style={[s.gradeInput, { color: theme.text, borderColor: theme.primary }]}
                            value={editValue}
                            onChangeText={setEditValue}
                            keyboardType="numeric"
                            maxLength={3}
                            autoFocus
                            selectTextOnFocus
                          />
                          <TouchableOpacity onPress={() => handleSave(g.submissionId)}>
                            <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Text style={[s.scoreText, { color: g.score !== null ? theme.text : theme.textSecondary }]}>
                          {g.score !== null ? `${g.score}%` : '—'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      )}
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const styles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorText: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  retryBtn: { backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: theme.border },
  headerCell: { paddingVertical: 10 },
  headerText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  nameCell: { width: 130, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  nameText: { fontSize: 13, fontWeight: '600' },
  gradeCell: { width: 90, paddingHorizontal: 6, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  scoreText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gradeInput: { width: 44, borderBottomWidth: 1.5, fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 2 },
});
