/**
 * K-12 Game Player — EduDash Arena
 *
 * Plays a game round-by-round: MCQ or Memory Matrix.
 * ≤500 lines excl. StyleSheet (WARP).
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { useTheme } from '@/contexts/ThemeContext';
import { K12_GAMES_BY_ID } from '@/lib/activities/k12Games.data';
import { SUBJECT_LABELS } from '@/lib/activities/k12Activities.types';
import { ratioToPercent } from '@/lib/progress/clampPercent';
import { useGamePlayer } from '@/hooks/k12/useGamePlayer';

// ── Screen ────────────────────────────────────────────────────

export default function K12GamePlayerScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ gameId: string; assignmentId?: string }>();

  const game = K12_GAMES_BY_ID[params.gameId || ''] ?? null;

  // Memory matrix local state
  const [matrixPhase, setMatrixPhase] = useState<'showing' | 'guessing' | 'result'>('showing');
  const [matrixSelections, setMatrixSelections] = useState<boolean[]>([]);
  const matrixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hook must be called unconditionally — passes null if game not found
  const {
    state,
    currentGameRound,
    startGame,
    answerRound,
    answerMatrix,
    nextRound,
    finishGame,
    submitResults,
    isAnswerCorrect,
    isSubmitting,
  } = useGamePlayer(game, params.assignmentId || null);

  const bg = theme.background;
  const cardBg = theme.surface;
  const txt = theme.text;
  const sub = theme.textSecondary;
  const border = theme.border;
  const accent = '#06b6d4';

  // ── Memory matrix: show pattern 3 s then hide ──────────────
  useEffect(() => {
    if (state.phase === 'playing' && currentGameRound?.matrixPattern) {
      setMatrixPhase('showing');
      setMatrixSelections(new Array(currentGameRound.matrixPattern.length).fill(false));
      matrixTimer.current = setTimeout(() => setMatrixPhase('guessing'), 3000);
      return () => {
        if (matrixTimer.current) clearTimeout(matrixTimer.current);
      };
    }
  }, [state.currentRound, state.phase]);

  const toggleMatrixCell = useCallback((idx: number) => {
    setMatrixSelections(prev => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }, []);

  const handleMatrixCheck = useCallback(() => {
    if (!currentGameRound?.matrixPattern) return;
    const correct = matrixSelections.every(
      (sel, i) => sel === currentGameRound.matrixPattern![i],
    );
    setMatrixPhase('result');
    answerMatrix(correct);
  }, [matrixSelections, currentGameRound, answerMatrix]);

  // ── Not found ───────────────────────────────────────────────
  if (!game) {
    return (
      <View style={[s.root, { backgroundColor: bg }]}>
        <Text style={[s.notFound, { color: '#ef4444' }]}>
          Game not found.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={s.notFoundBtn}>
          <Text style={{ color: accent, fontSize: 16 }}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Ready phase ─────────────────────────────────────────────
  if (state.phase === 'ready') {
    return (
      <View style={[s.root, { backgroundColor: bg }]}>
        <LinearGradient colors={game.gradient} style={s.readyGradient}>
          <Text style={s.readyEmoji}>{game.emoji}</Text>
          <Text style={s.readyTitle}>{game.title}</Text>
          <Text style={s.readyDesc}>{game.description}</Text>
          <Text style={s.readyMeta}>
            {game.rounds.length} questions · {game.durationMinutes} min
            {game.globalTimeLimitSeconds
              ? ` · ⏱ ${game.globalTimeLimitSeconds}s limit`
              : ''}
          </Text>
          <TouchableOpacity style={s.startBtn} onPress={startGame} activeOpacity={0.85}>
            <Ionicons name="play" size={24} color="#fff" />
            <Text style={s.startBtnText}>Start Game</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={s.readyBack}>← Back to Hub</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  // ── Complete phase ──────────────────────────────────────────
  if (state.phase === 'complete') {
    const pct =
      game.rounds.length > 0
        ? Math.round((state.correctCount / game.rounds.length) * 100)
        : 0;
    const starsArr = Array.from({ length: 3 }, (_, i) => i < state.stars);
    const grade =
      pct >= 90
        ? 'Excellent!'
        : pct >= 70
          ? 'Great Job!'
          : pct >= 50
            ? 'Good Try!'
            : 'Keep Practising!';

    return (
      <View style={[s.root, { backgroundColor: bg }]}>
        <ScrollView contentContainerStyle={s.completeWrap}>
          <View style={s.starsRow}>
            {starsArr.map((filled, i) => (
              <Text key={i} style={{ fontSize: 40, opacity: filled ? 1 : 0.2 }}>
                ⭐
              </Text>
            ))}
          </View>
          <Text style={[s.completeGrade, { color: txt }]}>{grade}</Text>
          <Text style={[s.completeScore, { color: txt }]}>
            {state.correctCount}/{game.rounds.length} correct · {pct}%
          </Text>
          <Text style={[s.completeTime, { color: sub }]}>
            Time: {state.timeElapsed}s
          </Text>
          <LinearGradient colors={['#4F46E5', '#7C3AED']} style={s.xpBox}>
            <Text style={s.xpBoxText}>+{state.totalXP} XP earned</Text>
          </LinearGradient>

          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: accent, opacity: isSubmitting ? 0.7 : 1 }]}
            onPress={async () => {
              await submitResults();
              router.back();
            }}
            disabled={isSubmitting}
          >
            <Text style={s.saveBtnText}>
              {isSubmitting ? 'Saving…' : 'Save & Exit'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.retryBtn, { borderColor: accent }]} onPress={startGame}>
            <Text style={[s.retryBtnText, { color: accent }]}>Play Again</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Playing / Reviewing phase ───────────────────────────────
  const round = currentGameRound;
  if (!round) return null;

  const isMatrix = !!round.matrixPattern;
  const isReview = state.phase === 'reviewing';
  const selectedAnswer = state.answers[round.id];

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      {/* Top bar */}
      <View style={[s.topBar, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={txt} />
        </TouchableOpacity>
        <Text style={[s.topProgress, { color: txt }]}>
          {state.currentRound + 1} / {game.rounds.length}
        </Text>
        <Text style={[s.topXP, { color: accent }]}>⚡ {state.totalXP}</Text>
      </View>

      {/* Timer bar */}
      {game.globalTimeLimitSeconds != null && (
        <View style={s.timerOuter}>
          <View
            style={[
              s.timerInner,
              {
                width: `${ratioToPercent(
                  game.globalTimeLimitSeconds - state.timeElapsed,
                  game.globalTimeLimitSeconds,
                  { source: 'app/screens/k12-game-player.timer' },
                )}%`,
                backgroundColor:
                  state.timeElapsed > game.globalTimeLimitSeconds * 0.75
                    ? '#ef4444'
                    : accent,
              },
            ]}
          />
        </View>
      )}

      <ScrollView contentContainerStyle={s.questionWrap}>
        <Text style={[s.questionText, { color: txt }]}>{round.question}</Text>
        {round.subText && (
          <Text style={[s.subText, { color: sub }]}>{round.subText}</Text>
        )}

        {/* MCQ options */}
        {!isMatrix && round.options && (
          <View style={s.optionsGrid}>
            {round.options.map(opt => {
              const isSel = selectedAnswer === opt.id;
              let optBg = cardBg;
              let optBorder = border;
              if (isReview) {
                if (opt.isCorrect) {
                  optBg = '#dcfce7';
                  optBorder = '#22c55e';
                } else if (isSel && !opt.isCorrect) {
                  optBg = '#fef2f2';
                  optBorder = '#ef4444';
                }
              } else if (isSel) {
                optBg = accent + '20';
                optBorder = accent;
              }
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.optionBtn, { backgroundColor: optBg, borderColor: optBorder }]}
                  onPress={() => !isReview && answerRound(opt.id)}
                  disabled={isReview}
                  activeOpacity={0.8}
                >
                  <Text style={[s.optionText, { color: txt }]}>{opt.label}</Text>
                  {isReview && opt.isCorrect && (
                    <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                  )}
                  {isReview && isSel && !opt.isCorrect && (
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Memory matrix */}
        {isMatrix && round.matrixPattern && (
          <View style={s.matrixWrap}>
            <Text style={[s.matrixHint, { color: matrixPhase === 'guessing' ? accent : sub }]}>
              {matrixPhase === 'showing'
                ? 'Memorise this pattern…'
                : matrixPhase === 'guessing'
                  ? 'Now recreate it!'
                  : 'Result:'}
            </Text>
            <View style={[s.matrixGrid, { width: (round.matrixSize || 3) * 56 }]}>
              {round.matrixPattern.map((cell, i) => {
                const active =
                  matrixPhase === 'showing'
                    ? cell
                    : matrixPhase === 'guessing'
                      ? matrixSelections[i]
                      : cell;
                const wrong =
                  matrixPhase === 'result' && matrixSelections[i] !== cell;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      s.matrixCell,
                      {
                        backgroundColor: active
                          ? wrong
                            ? '#fef2f2'
                            : '#4F46E5'
                          : theme.surfaceVariant || '#e2e8f0',
                      },
                      wrong && { borderColor: '#ef4444', borderWidth: 2 },
                    ]}
                    onPress={() =>
                      matrixPhase === 'guessing' && toggleMatrixCell(i)
                    }
                    disabled={matrixPhase !== 'guessing'}
                  />
                );
              })}
            </View>
            {matrixPhase === 'guessing' && (
              <TouchableOpacity
                style={[s.matrixCheckBtn, { backgroundColor: accent }]}
                onPress={handleMatrixCheck}
              >
                <Text style={s.matrixCheckText}>Check Pattern</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Review feedback */}
        {isReview && round.explanation && (
          <View style={[s.explanationBox, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}>
            <Ionicons name="bulb" size={16} color="#22c55e" />
            <Text style={[s.explanationText, { color: txt }]}>
              {round.explanation}
            </Text>
          </View>
        )}
        {isReview && (
          <TouchableOpacity
            style={[s.nextBtn, { backgroundColor: accent }]}
            onPress={nextRound}
            activeOpacity={0.85}
          >
            <Text style={s.nextBtnText}>
              {state.currentRound + 1 >= game.rounds.length
                ? 'See Results'
                : 'Next Question →'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: 48 },
  notFound: { textAlign: 'center', marginTop: 80, fontSize: 16 },
  notFoundBtn: { alignSelf: 'center', marginTop: 20 },

  // Ready
  readyGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  readyEmoji: { fontSize: 60, marginBottom: 16 },
  readyTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  readyDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center', marginBottom: 8, maxWidth: 300 },
  readyMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 24 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
  },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  readyBack: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },

  // Complete
  completeWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  completeGrade: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  completeScore: { fontSize: 16, marginBottom: 4 },
  completeTime: { fontSize: 14, marginBottom: 20 },
  xpBox: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginBottom: 24 },
  xpBoxText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  saveBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  retryBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  retryBtnText: { fontSize: 16, fontWeight: '700' },

  // Playing
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  topProgress: { fontSize: 15, fontWeight: '600' },
  topXP: { fontSize: 15, fontWeight: '700' },
  timerOuter: { height: 4, backgroundColor: '#e2e8f0' },
  timerInner: { height: 4 },
  questionWrap: { padding: 20 },
  questionText: { fontSize: 18, fontWeight: '600', marginBottom: 8, lineHeight: 26 },
  subText: { fontSize: 14, marginBottom: 16, lineHeight: 20 },

  // Options
  optionsGrid: { gap: 10, marginTop: 12 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  optionText: { fontSize: 16, fontWeight: '500', flex: 1 },

  // Memory matrix
  matrixWrap: { alignItems: 'center', marginTop: 16 },
  matrixHint: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  matrixGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  matrixCell: { width: 50, height: 50, borderRadius: 8 },
  matrixCheckBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  matrixCheckText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Review
  explanationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
  },
  explanationText: { fontSize: 13, lineHeight: 18, flex: 1 },
  nextBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
