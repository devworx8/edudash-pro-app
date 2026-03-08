/**
 * Teacher Game Control — EduDash Arena
 *
 * ≤500 lines excl. StyleSheet (WARP). Hooks extracted to hooks/k12/.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useTheme } from '@/contexts/ThemeContext';
import { K12_GAMES_BY_ID } from '@/lib/activities/k12Games.data';
import type { K12Game, K12Subject, K12GradeRange } from '@/lib/activities/k12Activities.types';
import { SUBJECT_LABELS, GRADE_RANGE_LABELS } from '@/lib/activities/k12Activities.types';
import { clampPercent } from '@/lib/progress/clampPercent';
import type { AssignmentWithStats, AssignGamePayload } from '@/hooks/k12/useTeacherGameControl';
import {
  useFilteredGames,
  useTeacherClasses,
  useTeacherAssignments,
  useAssignmentLeaderboard,
  useAssignGame,
  useCloseAssignment,
} from '@/hooks/k12/useTeacherGameControl';
import AssignGameModal from '@/components/k12/AssignGameModal';

// ── Sub-components ────────────────────────────────────────────

function GameCard({
  game,
  onAssign,
  theme,
}: {
  game: K12Game;
  onAssign: (game: K12Game) => void;
  theme: { text: string; textSecondary: string; surface: string; border: string };
}) {
  return (
    <TouchableOpacity
      onPress={() => onAssign(game)}
      style={[styles.gameCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.8}
    >
      <View style={[styles.gameCardGradientBadge, { backgroundColor: game.gradient[0] + '22' }]}>
        <Text style={styles.gameCardEmoji}>{game.emoji}</Text>
      </View>
      <View style={styles.gameCardInfo}>
        <Text style={[styles.gameCardTitle, { color: theme.text }]} numberOfLines={1}>
          {game.title}
        </Text>
        <Text style={[styles.gameCardMeta, { color: theme.textSecondary }]}>
          {GRADE_RANGE_LABELS[game.gradeRange]} · {SUBJECT_LABELS[game.subject].label}
        </Text>
        <View style={styles.gameCardTags}>
          <View style={[styles.diffBadge, { backgroundColor: game.gradient[0] + '33' }]}>
            <Text style={[styles.diffBadgeText, { color: game.gradient[0] }]}>
              {game.difficulty.toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.gameCardDuration, { color: theme.textSecondary }]}>
            {game.durationMinutes} min
          </Text>
        </View>
      </View>
      <View style={styles.assignBtn}>
        <Ionicons name="add-circle" size={28} color={game.gradient[0]} />
      </View>
    </TouchableOpacity>
  );
}

function AssignmentRow({
  assignment,
  onLeaderboard,
  onClose,
  theme,
}: {
  assignment: AssignmentWithStats;
  onLeaderboard: (id: string) => void;
  onClose: (id: string) => void;
  theme: { text: string; textSecondary: string; surface: string; border: string };
}) {
  const game = K12_GAMES_BY_ID[assignment.game_id];
  const pct = assignment.studentCount > 0
    ? Math.round((assignment.completedCount / assignment.studentCount) * 100)
    : 0;
  const progressPercent = clampPercent(pct, {
    source: 'app/screens/teacher-game-control.assignment-progress',
  });

  return (
    <View style={[styles.assignmentRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={styles.assignmentEmoji}>{game?.emoji ?? '🎮'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.assignmentTitle, { color: theme.text }]} numberOfLines={1}>
          {game?.title ?? assignment.game_id}
        </Text>
        <Text style={[styles.assignmentClass, { color: theme.textSecondary }]}>
          {(assignment.class as any)?.name ?? '—'} · {assignment.difficulty}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPercent}%`,
                backgroundColor: progressPercent === 100 ? '#16A34A' : '#4F46E5',
              },
            ]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>
          {assignment.completedCount}/{assignment.studentCount} students · {progressPercent}%
        </Text>
      </View>
      <View style={styles.assignmentActions}>
        {assignment.show_leaderboard && (
          <TouchableOpacity onPress={() => onLeaderboard(assignment.id)} style={styles.iconBtn}>
            <Ionicons name="trophy-outline" size={20} color="#F59E0B" />
          </TouchableOpacity>
        )}
        {assignment.status === 'active' && (
          <TouchableOpacity onPress={() => onClose(assignment.id)} style={styles.iconBtn}>
            <Ionicons name="close-circle-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Leaderboard Modal ─────────────────────────────────────────

function LeaderboardModal({
  assignmentId,
  visible,
  onClose,
  theme,
}: {
  assignmentId: string | null;
  visible: boolean;
  onClose: () => void;
  theme: { text: string; textSecondary: string; card: string; border: string };
}) {
  const { data: entries, isLoading } = useAssignmentLeaderboard(assignmentId);

  const rankEmoji = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
          <View style={styles.modalHeader}>
            <Ionicons name="trophy" size={24} color="#F59E0B" />
            <Text style={[styles.modalTitle, { color: theme.text, marginLeft: 10 }]}>
              Class Leaderboard
            </Text>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#4F46E5" />
          ) : !entries?.length ? (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No completions yet
            </Text>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={{ paddingTop: 12 }}
              renderItem={({ item, index }) => (
                <View style={[styles.lbRow, { borderColor: theme.border }]}>
                  <Text style={styles.lbRank}>{rankEmoji(index)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lbName, { color: theme.text }]}>
                      {(item.profiles as any)?.display_name ?? 'Student'}
                    </Text>
                    <Text style={[styles.lbMeta, { color: theme.textSecondary }]}>
                      ⭐ {item.stars} stars · {item.time_spent_seconds}s
                    </Text>
                  </View>
                  <Text style={[styles.lbScore, { color: '#4F46E5' }]}>{item.score}pts</Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────

export default function TeacherGameControlScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'library' | 'active'>('active');
  const [subjectFilter, setSubjectFilter] = useState<K12Subject | 'all'>('all');
  const [gradeFilter, setGradeFilter] = useState<K12GradeRange | 'all'>('all');
  const [assignTarget, setAssignTarget] = useState<K12Game | null>(null);
  const [leaderboardId, setLeaderboardId] = useState<string | null>(null);

  const { data: classes = [] } = useTeacherClasses();
  const { data: assignments = [], isLoading: loadingAssignments } = useTeacherAssignments();
  const assignGame = useAssignGame();
  const closeAssignment = useCloseAssignment();

  const filteredGames = useFilteredGames(subjectFilter, gradeFilter);

  const handleAssignSubmit = useCallback(
    (payload: Parameters<typeof assignGame.mutate>[0]) => {
      assignGame.mutate(payload, {
        onSuccess: () => {
          setAssignTarget(null);
          setActiveTab('active');
        },
        onError: () => {},
      });
    },
    [assignGame],
  );

  const handleClose = useCallback(
    (id: string) => {
      closeAssignment.mutate(id);
    },
    [closeAssignment],
  );

  const subjects = useMemo(
    () => Object.entries(SUBJECT_LABELS) as [K12Subject, (typeof SUBJECT_LABELS)[K12Subject]][],
    [],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Game Control</Text>
          <Text style={[styles.headerSub, { color: theme.textSecondary }]}>EduDash Arena</Text>
        </View>
        <Ionicons name="game-controller" size={28} color="#4F46E5" />
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {(['active', 'library'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? '#4F46E5' : theme.textSecondary }]}>
              {tab === 'active' ? 'Active Assignments' : 'Game Library'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'active' ? (
        /* ── Active assignments ── */
        <ScrollView contentContainerStyle={styles.content}>
          {loadingAssignments ? (
            <ActivityIndicator style={{ marginTop: 60 }} color="#4F46E5" />
          ) : !assignments.length ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48 }}>🎮</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No active games</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                Switch to Game Library to assign your first challenge.
              </Text>
              <TouchableOpacity onPress={() => setActiveTab('library')} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Browse Library</Text>
              </TouchableOpacity>
            </View>
          ) : (
            assignments.map(a => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                onLeaderboard={setLeaderboardId}
                onClose={handleClose}
                theme={theme}
              />
            ))
          )}
        </ScrollView>
      ) : (
        /* ── Game library ── */
        <View style={{ flex: 1 }}>
          {/* Filters */}
          <View style={[styles.filterBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => setSubjectFilter('all')}
                style={[styles.filterPill, subjectFilter === 'all' && styles.filterPillActive]}
              >
                <Text style={{ color: subjectFilter === 'all' ? '#fff' : theme.textSecondary, fontSize: 12 }}>
                  All subjects
                </Text>
              </TouchableOpacity>
              {subjects.map(([key, val]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSubjectFilter(key === subjectFilter ? 'all' : key)}
                  style={[styles.filterPill, subjectFilter === key && styles.filterPillActive]}
                >
                  <Text style={{ color: subjectFilter === key ? '#fff' : theme.textSecondary, fontSize: 12 }}>
                    {val.emoji} {val.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={filteredGames}
            keyExtractor={g => g.id}
            contentContainerStyle={styles.content}
            renderItem={({ item }) => (
              <GameCard game={item} onAssign={setAssignTarget} theme={theme} />
            )}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.textSecondary, marginTop: 40 }]}>
                No games match the current filters.
              </Text>
            }
          />
        </View>
      )}

      {/* Assign modal */}
      <AssignGameModal
        game={assignTarget}
        classes={classes}
        visible={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        onSubmit={handleAssignSubmit}
        colors={theme}
      />

      {/* Leaderboard modal */}
      <LeaderboardModal
        assignmentId={leaderboardId}
        visible={!!leaderboardId}
        onClose={() => setLeaderboardId(null)}
        theme={theme}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4F46E5',
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  content: { padding: 16, gap: 12 },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'transparent',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  // Game card
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  gameCardGradientBadge: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameCardEmoji: { fontSize: 26 },
  gameCardInfo: { flex: 1 },
  gameCardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  gameCardMeta: { fontSize: 12, marginBottom: 6 },
  gameCardTags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  diffBadgeText: { fontSize: 10, fontWeight: '700' },
  gameCardDuration: { fontSize: 11 },
  assignBtn: { padding: 4 },
  // Assignment row
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  assignmentEmoji: { fontSize: 28 },
  assignmentTitle: { fontSize: 14, fontWeight: '600' },
  assignmentClass: { fontSize: 12, marginTop: 2, marginBottom: 6 },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: 4, borderRadius: 2 },
  progressLabel: { fontSize: 11 },
  assignmentActions: { gap: 6 },
  iconBtn: { padding: 4 },
  // Modals
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSub: { fontSize: 12, marginTop: 2 },
  // Leaderboard
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  lbRank: { fontSize: 22, width: 36, textAlign: 'center' },
  lbName: { fontSize: 14, fontWeight: '600' },
  lbMeta: { fontSize: 12, marginTop: 2 },
  lbScore: { fontSize: 16, fontWeight: '700' },
  // Empty states
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  emptyBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyText: { textAlign: 'center', fontSize: 14 },
});
