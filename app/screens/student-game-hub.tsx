/**
 * Student Game Hub — EduDash Arena
 *
 * XP banner, today's challenges, free play library, class leaderboard.
 * ≤500 lines excl. StyleSheet (WARP).
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { K12_GAMES, K12_GAMES_BY_ID } from '@/lib/activities/k12Games.data';
import type { K12Subject, K12Game } from '@/lib/activities/k12Activities.types';
import { SUBJECT_LABELS, GRADE_RANGE_LABELS, xpForNextLevel } from '@/lib/activities/k12Activities.types';
import { clampPercent, percentWidth } from '@/lib/progress/clampPercent';
import {
  useMyAssignments,
  useMyXP,
  useClassLeaderboard,
} from '@/hooks/k12/useStudentGameHub';

// ── Filter chips ──────────────────────────────────────────────

const SUBJECT_CHIPS: { key: K12Subject | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mathematics', label: '🔢 Maths' },
  { key: 'english', label: '📖 English' },
  { key: 'life_science', label: '🧬 Science' },
  { key: 'geography', label: '🌍 Geo' },
  { key: 'history', label: '📜 History' },
  { key: 'general', label: '🎯 Other' },
];

// ── Screen ────────────────────────────────────────────────────

export default function StudentGameHubScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [subjectFilter, setSubjectFilter] = useState<K12Subject | 'all'>('all');

  const { data: myXP } = useMyXP();
  const { data: assignments = [] } = useMyAssignments();
  const { data: leaderboard = [] } = useClassLeaderboard();

  const bg = theme.background;
  const cardBg = theme.surface;
  const txt = theme.text;
  const sub = theme.textSecondary;
  const border = theme.border;
  const accent = '#06b6d4';

  const level = myXP?.level ?? 1;
  const totalXP = myXP?.total_xp ?? 0;
  const nextXP = xpForNextLevel(level);
  const prevXP = xpForNextLevel(level - 1);
  const progress = nextXP > prevXP ? (totalXP - prevXP) / (nextXP - prevXP) : 0;
  const progressPercent = clampPercent(progress * 100, {
    source: 'app/screens/student-game-hub.xp-progress',
  });
  const streak = myXP?.current_streak ?? 0;

  const filteredGames =
    subjectFilter === 'all'
      ? K12_GAMES
      : K12_GAMES.filter(g => g.subject === subjectFilter);

  const activeAssignments = assignments.filter(
    a => a.attempts_used < a.max_attempts,
  );

  const navigateToGame = useCallback(
    (gameId: string, assignmentId?: string) => {
      router.push({
        pathname: '/screens/k12-game-player',
        params: { gameId, ...(assignmentId ? { assignmentId } : {}) },
      } as any);
    },
    [router],
  );

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={txt} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: txt }]}>🎮 EduDash Arena</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* ── XP Banner ─────────────────────────────────── */}
        <LinearGradient
          colors={['#4F46E5', '#7C3AED']}
          style={s.xpBanner}
        >
          <View style={s.xpRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.xpLevel}>Level {level}</Text>
              <View style={s.xpBarOuter}>
                <View
                  style={[
                    s.xpBarInner,
                    { width: percentWidth(progressPercent) },
                  ]}
                />
              </View>
              <Text style={s.xpText}>
                {totalXP} / {nextXP} XP
              </Text>
            </View>
            <View style={s.streakBox}>
              <Text style={s.streakNum}>🔥 {streak}</Text>
              <Text style={s.streakLabel}>day streak</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Today's Challenges ─────────────────────────── */}
        {activeAssignments.length > 0 && (
          <>
            <Text style={[s.section, { color: txt }]}>
              📋 Today's Challenges
            </Text>
            {activeAssignments.map(a => {
              const game = K12_GAMES_BY_ID[a.game_id];
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[s.challengeCard, { backgroundColor: cardBg, borderColor: border }]}
                  onPress={() => navigateToGame(a.game_id, a.id)}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 28 }}>{game?.emoji || '🎮'}</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[s.challengeTitle, { color: txt }]}>
                      {game?.title || a.game_id}
                    </Text>
                    <Text style={[s.challengeSub, { color: sub }]}>
                      {a.difficulty} · {a.attempts_used}/{a.max_attempts} attempts
                      {a.is_challenge ? ' · 🏆' : ''}
                    </Text>
                    {a.due_date && (
                      <Text style={[s.challengeDue, { color: '#f59e0b' }]}>
                        Due: {new Date(a.due_date).toLocaleDateString('en-ZA')}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="play-circle" size={32} color={accent} />
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Free Play ──────────────────────────────────── */}
        <Text style={[s.section, { color: txt }]}>🎮 Free Play</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterRow}
        >
          {SUBJECT_CHIPS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[
                s.chip,
                { borderColor: border },
                subjectFilter === f.key && {
                  backgroundColor: accent,
                  borderColor: accent,
                },
              ]}
              onPress={() => setSubjectFilter(f.key)}
            >
              <Text
                style={[
                  s.chipText,
                  { color: subjectFilter === f.key ? '#fff' : sub },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.gamesRow}>
          {filteredGames.map(game => (
            <TouchableOpacity
              key={game.id}
              style={[s.freeCard, { backgroundColor: cardBg, borderColor: border }]}
              onPress={() => navigateToGame(game.id)}
              activeOpacity={0.8}
            >
              <LinearGradient colors={game.gradient} style={s.freeGradient}>
                <Text style={s.freeEmoji}>{game.emoji}</Text>
              </LinearGradient>
              <Text style={[s.freeTitle, { color: txt }]} numberOfLines={1}>
                {game.title}
              </Text>
              <Text style={[s.freeMeta, { color: sub }]}>
                {GRADE_RANGE_LABELS[game.gradeRange]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Leaderboard ────────────────────────────────── */}
        {leaderboard.length > 0 && (
          <>
            <Text style={[s.section, { color: txt }]}>
              🏆 Class Leaderboard
            </Text>
            {leaderboard.slice(0, 10).map((entry, i) => (
              <View
                key={entry.studentId}
                style={[s.lbRow, { backgroundColor: cardBg, borderColor: border }]}
              >
                <Text style={[s.lbRank, { color: i < 3 ? '#f59e0b' : sub }]}>
                  #{i + 1}
                </Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[s.lbName, { color: txt }]}>
                    {entry.studentId === user?.id ? 'You' : entry.name}
                  </Text>
                  <Text style={[s.lbXP, { color: sub }]}>
                    Level {entry.level} · {entry.totalXp} XP
                  </Text>
                </View>
                {i === 0 && <Text style={{ fontSize: 20 }}>👑</Text>}
              </View>
            ))}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  scroll: { padding: 16 },

  // XP banner
  xpBanner: { borderRadius: 16, padding: 16, marginBottom: 20 },
  xpRow: { flexDirection: 'row', alignItems: 'center' },
  xpLevel: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  xpBarOuter: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  xpBarInner: { height: 8, backgroundColor: '#fff', borderRadius: 4 },
  xpText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  streakBox: { alignItems: 'center', marginLeft: 16 },
  streakNum: { fontSize: 20, fontWeight: '700', color: '#fff' },
  streakLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },

  // Sections
  section: { fontSize: 17, fontWeight: '700', marginBottom: 10, marginTop: 8 },

  // Challenge card
  challengeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  challengeTitle: { fontSize: 15, fontWeight: '600' },
  challengeSub: { fontSize: 12, marginTop: 2 },
  challengeDue: { fontSize: 11, marginTop: 2 },

  // Filters
  filterScroll: { marginBottom: 12 },
  filterRow: { gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13 },

  // Free play grid
  gamesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  freeCard: {
    width: '47%' as any,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  freeGradient: {
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeEmoji: { fontSize: 30 },
  freeTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8, paddingTop: 8 },
  freeMeta: { fontSize: 11, paddingHorizontal: 8, paddingBottom: 8, paddingTop: 2 },

  // Leaderboard
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  lbRank: { fontSize: 16, fontWeight: '700', width: 32 },
  lbName: { fontSize: 14, fontWeight: '600' },
  lbXP: { fontSize: 12, marginTop: 2 },
});
