/**
 * My Practice Exams Screen
 *
 * Card-grid layout with subject filters and coloured gradient headers,
 * matching the DashPro dark-navy design language.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, TextInput, Dimensions,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SubPageHeader } from '@/components/SubPageHeader';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { formatDistanceToNow } from 'date-fns';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';

interface SavedExam {
  id: string;
  display_title: string;
  grade: string;
  subject: string;
  generated_content: unknown;
  created_at: string;
  exam_type: string;
  progress?: {
    percentage: number;
    score_obtained: number;
    score_total: number;
    completed_at: string;
  }[];
}

// ─── Subject palette ─────────────────────────────────────────────────────────
const SUBJECT_META: Record<string, { colors: [string, string, string]; icon: string }> = {
  mathematics: { colors: ['#6366f1', '#4f46e5', '#3730a3'], icon: 'calculator-outline' },
  math:        { colors: ['#6366f1', '#4f46e5', '#3730a3'], icon: 'calculator-outline' },
  science:     { colors: ['#10b981', '#059669', '#047857'], icon: 'flask-outline' },
  biology:     { colors: ['#10b981', '#059669', '#047857'], icon: 'leaf-outline' },
  physics:     { colors: ['#06b6d4', '#0891b2', '#0e7490'], icon: 'planet-outline' },
  chemistry:   { colors: ['#f59e0b', '#d97706', '#b45309'], icon: 'flask-outline' },
  english:     { colors: ['#f59e0b', '#d97706', '#b45309'], icon: 'book-outline' },
  history:     { colors: ['#ef4444', '#dc2626', '#b91c1c'], icon: 'time-outline' },
  geography:   { colors: ['#06b6d4', '#0891b2', '#0e7490'], icon: 'globe-outline' },
  technology:  { colors: ['#8b5cf6', '#7c3aed', '#6d28d9'], icon: 'hardware-chip-outline' },
};

function subjectMeta(subject: string) {
  const key = (subject || '').toLowerCase().replace(/\s+/g, '');
  for (const k of Object.keys(SUBJECT_META)) {
    if (key.includes(k)) return SUBJECT_META[k];
  }
  return { colors: ['#8b5cf6', '#7c3aed', '#6d28d9'] as [string,string,string], icon: 'school-outline' };
}

function getScoreColor(pct: number) {
  if (pct >= 70) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = (SCREEN_W - 16 * 2 - 12) / 2;  // 2 columns, 16px side padding, 12px gap

// ─── Exam card ────────────────────────────────────────────────────────────────
function ExamCard({
  exam,
  theme,
  onOpen,
  onRetake,
}: {
  exam: SavedExam;
  theme: any;
  onOpen: () => void;
  onRetake: () => void;
}) {
  const sorted  = (exam.progress ?? []).sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  const latest  = sorted[0] ?? null;
  const done    = !!latest;
  const meta    = subjectMeta(exam.subject);
  const gradeLabel = exam.grade.replace(/grade_?/i, 'Gr ');

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onOpen}
      activeOpacity={0.88}
    >
      {/* Gradient header */}
      <LinearGradient
        colors={meta.colors}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      >
        <Ionicons name={meta.icon as any} size={36} color="rgba(255,255,255,0.92)" />
        {done && (
          <View style={[styles.scorePill, { backgroundColor: getScoreColor(latest.percentage) }]}>
            <Text style={styles.scorePillText}>{Math.round(latest.percentage)}%</Text>
          </View>
        )}
      </LinearGradient>

      {/* Body */}
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{exam.display_title}</Text>
        <Text style={[styles.cardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
          {gradeLabel} · {exam.subject}
        </Text>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: done ? getScoreColor(latest!.percentage) : meta.colors[0],
                width: `${done ? latest!.percentage : 0}%`,
              },
            ]}
          />
        </View>

        <View style={styles.cardFooter}>
          {done ? (
            <Text style={[styles.cardFooterText, { color: theme.textSecondary }]}>
              {sorted.length} attempt{sorted.length > 1 ? 's' : ''}
            </Text>
          ) : (
            <Text style={[styles.cardFooterText, { color: theme.textSecondary }]}>Not started</Text>
          )}
          <Text style={[styles.cardFooterText, { color: theme.textSecondary }]}>
            {formatDistanceToNow(new Date(exam.created_at), { addSuffix: true })}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.cardBtn, { backgroundColor: meta.colors[0] }]}
            onPress={onOpen}
          >
            <Ionicons name={done ? 'bar-chart' : 'create'} size={13} color="#fff" />
            <Text style={styles.cardBtnText}>{done ? 'Review' : 'Take'}</Text>
          </TouchableOpacity>

          {done && (
            <TouchableOpacity
              style={[styles.cardBtnOutline, { borderColor: meta.colors[0] }]}
              onPress={onRetake}
            >
              <Ionicons name="refresh" size={13} color={meta.colors[0]} />
              <Text style={[styles.cardBtnOutlineText, { color: meta.colors[0] }]}>Retake</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ParentMyExamsScreen() {
  const { theme } = useTheme();
  const { user }  = useAuth();
  const { t }     = useTranslation();
  const insets    = useSafeAreaInsets();
  const { showAlert, alertProps } = useAlertModal();

  const [search,  setSearch]  = useState('');
  const [subject, setSubject] = useState('All');

  const { data: exams = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-exams', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const supabase = assertSupabase();
      const { data, error } = await supabase
        .from('exam_generations')
        .select(`*, progress:exam_user_progress(percentage, score_obtained, score_total, completed_at)`)
        .order('created_at', { ascending: false });
      if (error) return [];
      return (data || []) as SavedExam[];
    },
    enabled: !!user?.id,
  });

  const subjects = useMemo(() => {
    const unique = Array.from(new Set(exams.map((e) => e.subject).filter(Boolean)));
    return ['All', ...unique];
  }, [exams]);

  const filtered = useMemo(() => {
    let list = exams;
    if (subject !== 'All') list = list.filter((e) => e.subject === subject);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.display_title?.toLowerCase().includes(q) ||
        e.subject?.toLowerCase().includes(q) ||
        e.grade?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [exams, subject, search]);

  const stats = useMemo(() => {
    const completed = exams.filter((e) => (e.progress ?? []).length > 0);
    const scores    = completed.flatMap((e) => (e.progress ?? []).map((p) => p.percentage));
    return {
      total:    completed.length,
      attempts: scores.length,
      avg:      scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      best:     scores.length ? Math.round(Math.max(...scores)) : 0,
    };
  }, [exams]);

  const handleOpen = useCallback((exam: SavedExam, retake = false) => {
    router.push({
      pathname: '/screens/exam-generation',
      params: { examId: exam.id, grade: exam.grade, subject: exam.subject, examType: exam.exam_type || 'practice_test', loadSaved: '1', ...(retake ? { retake: '1' } : {}) },
    });
  }, []);

  const handleRetake = useCallback((exam: SavedExam) => {
    showAlert({
      title: t('exam.retake_confirm_title', { defaultValue: 'Start fresh attempt?' }),
      message: t('exam.retake_confirm_message', { defaultValue: 'Your previous score will be saved. This will start a new attempt with blank answers.' }),
      type: 'info',
      buttons: [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('exam.retake_confirm_cta', { defaultValue: 'Retake exam' }), onPress: () => handleOpen(exam, true) },
      ],
    });
  }, [showAlert, t, handleOpen]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SubPageHeader title={t('parent.my_exams', { defaultValue: 'My Practice Exams' })} />

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading your exams…</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        >
          {/* ── Search bar ── */}
          <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search exams…"
              placeholderTextColor={theme.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Stats row ── */}
          {stats.total > 0 && (
            <View style={styles.statsRow}>
              {[
                { icon: 'checkmark-circle-outline', label: 'Completed', value: stats.total, color: theme.primary },
                { icon: 'stats-chart-outline',      label: 'Average',   value: `${stats.avg}%`, color: '#f59e0b' },
                { icon: 'trophy-outline',            label: 'Best',      value: `${stats.best}%`, color: '#10b981' },
              ].map((s) => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name={s.icon as any} size={20} color={s.color} />
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Subject filter pills ── */}
          {subjects.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {subjects.map((s) => {
                const active = s === subject;
                const col    = s === 'All' ? theme.primary : subjectMeta(s).colors[0];
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.pill,
                      { borderColor: active ? col : theme.border, backgroundColor: active ? col : theme.surface },
                    ]}
                    onPress={() => setSubject(s)}
                  >
                    <Text style={[styles.pillText, { color: active ? '#fff' : theme.textSecondary }]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* ── Grid ── */}
          {filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={56} color={theme.border} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {exams.length === 0 ? 'No Practice Exams Yet' : 'No matches found'}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {exams.length === 0
                  ? 'Generate your first practice exam using Dash AI'
                  : 'Try a different subject or search term'}
              </Text>
              {exams.length === 0 && (
                <TouchableOpacity
                  style={[styles.ctaBtn, { backgroundColor: theme.primary }]}
                  onPress={() => router.push('/screens/dash-assistant')}
                >
                  <Ionicons name="home" size={16} color="#fff" />
                  <Text style={styles.ctaBtnText}>Go to Dashboard</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.grid}>
              {filtered.map((exam) => (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  theme={theme}
                  onOpen={() => handleOpen(exam, false)}
                  onRetake={() => handleRetake(exam)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <AlertModal {...alertProps} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  scroll:      { paddingHorizontal: 16, gap: 16 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 12,
  },
  searchInput: { flex: 1, fontSize: 15 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, alignItems: 'center', gap: 4, padding: 12,
    borderRadius: 14, borderWidth: 1,
  },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },

  pillRow: { gap: 8, paddingVertical: 2 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1.5,
  },
  pillText: { fontSize: 13, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Card
  card: {
    width: CARD_W,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardGradient: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePill: {
    position: 'absolute',
    top: 8, right: 8,
    borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  scorePillText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  cardBody: { padding: 12, gap: 6 },
  cardTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardMeta:  { fontSize: 11, lineHeight: 15 },

  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 4, borderRadius: 2 },

  cardFooter:     { flexDirection: 'row', justifyContent: 'space-between' },
  cardFooterText: { fontSize: 10, fontWeight: '500' },

  cardActions: { flexDirection: 'row', gap: 6, marginTop: 2 },
  cardBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 7, borderRadius: 8,
  },
  cardBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1.5,
  },
  cardBtnOutlineText: { fontSize: 11, fontWeight: '700' },

  emptyWrap:  { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText:  { fontSize: 13, textAlign: 'center' },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8,
  },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});