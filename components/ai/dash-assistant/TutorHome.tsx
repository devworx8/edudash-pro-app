import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getAgeBandsForOrgType, normalizeSchoolType } from '@/lib/tenant/compat';
import { getTutorChallengePlan } from '@/features/dash-assistant/tutorChallengePolicy';
import { ratioToPercent, percentWidth } from '@/lib/progress/clampPercent';

interface TutorHomeProps {
  styles: any;
  theme: any;
  onSendMessage?: (text: string) => void;
  onAgeBandChange?: (ageBand: string) => void;
  learnerContext?: {
    learnerName?: string | null;
    grade?: string | null;
    ageBand?: string | null;
    schoolType?: string | null;
    role?: string | null;
  } | null;
}

interface LearningStats {
  streak: number;
  sessionsToday: number;
  sessionsGoal: number;
  weekSessions: number;
  weekQuestions: number;
  weekAccuracy: number;
  xp: number;
  level: number;
  weekDays: boolean[];
  lastTopic?: string | null;
  lastSubject?: string | null;
}

const TUTOR_HOME_COLLAPSE_KEY = '@dash_ai_tutor_home_collapsed';
const LEARNING_STATS_KEY = '@dash_learning_stats';

const DEFAULT_STATS: LearningStats = {
  streak: 0,
  sessionsToday: 0,
  sessionsGoal: 3,
  weekSessions: 0,
  weekQuestions: 0,
  weekAccuracy: 0,
  xp: 0,
  level: 1,
  weekDays: [false, false, false, false, false, false, false],
  lastTopic: null,
  lastSubject: null,
};

type GradePhase = 'foundation' | 'intermediate' | 'senior' | 'fet';

interface SubjectCard {
  emoji: string;
  label: string;
  prompt: string;
}

function getGradePhase(grade: string | null | undefined): GradePhase {
  if (!grade) return 'intermediate';
  const num = parseInt(grade.replace(/[^0-9]/g, ''), 10);
  if (isNaN(num) || num <= 3) return 'foundation';
  if (num <= 6) return 'intermediate';
  if (num <= 9) return 'senior';
  return 'fet';
}

function getPhaseLabel(phase: GradePhase): string {
  switch (phase) {
    case 'foundation': return 'Foundation Phase';
    case 'intermediate': return 'Intermediate Phase';
    case 'senior': return 'Senior Phase';
    case 'fet': return 'FET Phase';
  }
}

function getSubjectsForPhase(phase: GradePhase): SubjectCard[] {
  const socratic = (subject: string) =>
    `Let's work on ${subject}. First, let me ask you a quick question to see where you are...`;

  switch (phase) {
    case 'foundation':
      return [
        { emoji: '🔢', label: 'Counting', prompt: socratic('Counting') },
        { emoji: '📖', label: 'Reading', prompt: socratic('Reading') },
        { emoji: '🎨', label: 'Life Skills', prompt: socratic('Life Skills') },
        { emoji: '🔤', label: 'Phonics', prompt: socratic('Phonics') },
      ];
    case 'intermediate':
      return [
        { emoji: '📐', label: 'Fractions', prompt: socratic('Fractions') },
        { emoji: '📝', label: 'Grammar', prompt: socratic('Grammar') },
        { emoji: '🔬', label: 'Science', prompt: socratic('Natural Sciences') },
        { emoji: '📊', label: 'Data Handling', prompt: socratic('Data Handling') },
        { emoji: '🗺️', label: 'History', prompt: socratic('Social Sciences - History') },
      ];
    case 'senior':
      return [
        { emoji: '📐', label: 'Algebra', prompt: socratic('Algebra') },
        { emoji: '📝', label: 'Essay Writing', prompt: socratic('Essay Writing') },
        { emoji: '⚗️', label: 'Science', prompt: socratic('Natural Sciences') },
        { emoji: '💰', label: 'EMS', prompt: socratic('Economic and Management Sciences') },
        { emoji: '📐', label: 'Geometry', prompt: socratic('Geometry') },
      ];
    case 'fet':
      return [
        { emoji: '📈', label: 'Calculus', prompt: socratic('Calculus') },
        { emoji: '⚗️', label: 'Chemistry', prompt: socratic('Physical Sciences - Chemistry') },
        { emoji: '🧬', label: 'Biology', prompt: socratic('Life Sciences') },
        { emoji: '💼', label: 'Accounting', prompt: socratic('Accounting') },
        { emoji: '📊', label: 'Business', prompt: socratic('Business Studies') },
      ];
  }
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const CTA_GRADIENTS: [string, string][] = [
  ['#6366f1', '#818cf8'],
  ['#f59e0b', '#fbbf24'],
  ['#10b981', '#34d399'],
  ['#ef4444', '#f87171'],
];

const SUBJECT_GRADIENTS: [string, string][] = [
  ['#1e1b4b', '#312e81'],
  ['#1a2e05', '#365314'],
  ['#1c1917', '#44403c'],
  ['#0c4a6e', '#075985'],
  ['#3b0764', '#581c87'],
  ['#7c2d12', '#9a3412'],
];

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const TutorHome: React.FC<TutorHomeProps> = ({
  styles,
  theme,
  onSendMessage,
  onAgeBandChange,
  learnerContext,
}) => {
  const [ageBand, setAgeBand] = useState('auto');
  const [ageBandLoaded, setAgeBandLoaded] = useState(false);
  const [lastConversationId, setLastConversationId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(Dimensions.get('window').width < 420);
  const [learningStats, setLearningStats] = useState<LearningStats>(DEFAULT_STATS);

  const normalizedSchool = (learnerContext?.schoolType || '').toLowerCase();
  const orgType = normalizeSchoolType(normalizedSchool || 'preschool');
  const isPreschool = orgType === 'preschool';
  const roleValue = (learnerContext?.role || '').toLowerCase();
  const isStaff = ['teacher', 'principal', 'admin', 'manager', 'staff'].includes(roleValue);
  const lockAgeBand = !!learnerContext?.ageBand && (learnerContext?.role === 'student' || learnerContext?.role === 'learner');

  const gradePhase = useMemo(() => getGradePhase(learnerContext?.grade), [learnerContext?.grade]);
  const phaseLabel = useMemo(() => getPhaseLabel(gradePhase), [gradePhase]);
  const subjectCards = useMemo(() => getSubjectsForPhase(gradePhase), [gradePhase]);

  const visibleAgeChips = useMemo(() => getAgeBandsForOrgType(orgType), [orgType]);

  useEffect(() => {
    let mounted = true;
    const loadLastConversation = async () => {
      try {
        const storedId = await AsyncStorage.getItem('@dash_ai_current_conversation_id');
        if (mounted) {
          setLastConversationId(storedId || null);
        }
      } catch {
        if (mounted) setLastConversationId(null);
      }
    };
    loadLastConversation();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadCollapsePref = async () => {
      try {
        const stored = await AsyncStorage.getItem(TUTOR_HOME_COLLAPSE_KEY);
        if (!mounted) return;
        if (stored !== null) {
          setCollapsed(stored === 'true');
        }
      } catch {
        // keep default
      }
    };
    loadCollapsePref();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadStats = async () => {
      try {
        const raw = await AsyncStorage.getItem(LEARNING_STATS_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw);
          setLearningStats({ ...DEFAULT_STATS, ...parsed });
        }
      } catch {
        // keep defaults
      }
    };
    loadStats();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      AsyncStorage.setItem(TUTOR_HOME_COLLAPSE_KEY, next ? 'true' : 'false').catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadAgeBand = async () => {
      try {
        const storedAge = await AsyncStorage.getItem('@dash_ai_age_band');
        if (storedAge && visibleAgeChips.some((chip) => chip.id === storedAge)) {
          if (mounted) setAgeBand(storedAge);
        }
      } catch {
        // ignore, keep default
      } finally {
        if (mounted) setAgeBandLoaded(true);
      }
    };
    loadAgeBand();
    return () => {
      mounted = false;
    };
  }, [visibleAgeChips]);

  useEffect(() => {
    if (!learnerContext?.ageBand) return;
    if (lockAgeBand) {
      setAgeBand(learnerContext.ageBand);
      return;
    }
    setAgeBand(prev => (prev === 'auto' ? learnerContext.ageBand || prev : prev));
  }, [learnerContext?.ageBand, lockAgeBand]);

  useEffect(() => {
    if (!ageBandLoaded) return;
    if (!lockAgeBand) {
      AsyncStorage.setItem('@dash_ai_age_band', ageBand).catch(() => {});
      onAgeBandChange?.(ageBand);
      return;
    }
    if (learnerContext?.ageBand) {
      onAgeBandChange?.(learnerContext.ageBand);
    }
  }, [ageBand, ageBandLoaded, onAgeBandChange, lockAgeBand, learnerContext?.ageBand]);

  const buildPrompt = (intent: string, topic?: string) => {
    const ageLabel = visibleAgeChips.find((chip) => chip.id === ageBand)?.label || ageBand;
    const agePrefix = lockAgeBand || ageBand === 'auto' ? '' : `Age group: ${ageLabel}. `;
    const topicPrefix = topic ? `Topic: ${topic}. ` : '';
    return `${agePrefix}${topicPrefix}${intent}`;
  };

  const sendTutorIntent = (intent: string, topic?: string) => {
    onSendMessage?.(buildPrompt(intent, topic));
  };

  const defaultQuickStart = useMemo(() => (
    isPreschool
      ? 'Use a short story and ask one simple question to get started.'
      : 'Ask me one short diagnostic question first, then explain step-by-step in simple language.'
  ), [isPreschool]);

  const quizChallengeTarget = useMemo(() => {
    const effectiveAgeBand =
      lockAgeBand
        ? learnerContext?.ageBand
        : ageBand !== 'auto'
          ? ageBand
          : learnerContext?.ageBand;
    const plan = getTutorChallengePlan({
      mode: 'quiz',
      difficulty: 2,
      learnerContext: {
        ageBand: effectiveAgeBand || null,
        grade: learnerContext?.grade || null,
        schoolType: learnerContext?.schoolType || null,
      },
    });
    return plan.maxQuestions;
  }, [ageBand, lockAgeBand, learnerContext?.ageBand, learnerContext?.grade, learnerContext?.schoolType]);

  const staffActions = useMemo(() => {
    if (!isStaff) return [];
    const base = isPreschool
      ? 'Use ECD language and play-based activities suitable for ages 3-6.'
      : 'Use CAPS-aligned structure with clear objectives and lesson outcomes.';
    return [
      {
        id: 'brainstorm-theme',
        label: 'Theme & routines',
        icon: 'sparkles-outline',
        prompt: `Brainstorm a weekly theme plan with daily activities, circle time ideas, and parent tips. ${base}`,
      },
      {
        id: 'daily-routine',
        label: 'Daily routine',
        icon: 'time-outline',
        prompt: `Create a structured daily routine with transitions and classroom management cues. ${base}`,
      },
      {
        id: 'interactive-lesson',
        label: 'Interactive activity',
        icon: 'hand-left-outline',
        prompt: `Design a hands-on interactive activity that aligns with today's class lesson. Include materials, steps, and assessment. ${base}`,
      },
      {
        id: 'class-performance',
        label: 'Class Performance',
        icon: 'stats-chart-outline',
        prompt: `Give me a summary of class performance metrics. Show trends, highlight struggling students, and suggest interventions. ${base}`,
      },
    ];
  }, [isStaff, isPreschool]);

  const lessonBuilderRoute = useMemo(() => {
    if (!isStaff) return null;
    return isPreschool ? '/screens/preschool-lesson-generator' : '/screens/ai-lesson-generator';
  }, [isStaff, isPreschool]);

  const { profile } = useAuth();
  const displayName =
    learnerContext?.learnerName || profile?.full_name || profile?.first_name || 'there';
  const greeting = getTimeGreeting();
  const dailyProgressPercent = ratioToPercent(
    learningStats.sessionsToday,
    learningStats.sessionsGoal,
    {
      source: 'TutorHome.dailyProgress',
    },
  );

  if (collapsed) {
    return (
      <View style={[styles.emptyStateContainer, { paddingBottom: 8 }]}>
        <LinearGradient
          colors={['#0b1220', '#101b2d', '#0b1220']}
          style={[styles.emptyStateHero, { borderColor: theme.border, paddingVertical: 16, marginBottom: 8 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={[styles.emptyStateLogo, { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary }]}>
                <Ionicons name="sparkles" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.emptyStateTitle, { color: theme.text, fontSize: 18, marginBottom: 2 }]}>
                  Tutor mode
                </Text>
                <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary, fontSize: 12 }]}>
                  {isPreschool ? 'Play‑based help in seconds.' : 'Quick help, clear steps, focused practice.'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={toggleCollapsed}
              accessibilityLabel="Expand tutor mode"
              style={{
                padding: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surfaceVariant,
              }}
            >
              <Ionicons name="chevron-down" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={[
                styles.primaryCta,
                { backgroundColor: theme.primary, flexBasis: 'auto', flexGrow: 0, paddingHorizontal: 14, paddingVertical: 8 },
              ]}
              onPress={() => sendTutorIntent(defaultQuickStart)}
            >
              <Ionicons name="play" size={16} color={theme.onPrimary || '#fff'} />
              <Text style={[styles.primaryCtaText, { color: theme.onPrimary || '#fff' }]}>Start</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryCta,
                { backgroundColor: theme.surfaceVariant, borderWidth: 1, borderColor: theme.border, flexBasis: 'auto', flexGrow: 0, paddingHorizontal: 14, paddingVertical: 8 },
              ]}
              onPress={toggleCollapsed}
            >
              <Ionicons name="options-outline" size={16} color={theme.text} />
              <Text style={[styles.primaryCtaText, { color: theme.text }]}>Customize</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.emptyStateContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ============================================================ */}
      {/* HERO SECTION — Personalized greeting + streak + progress     */}
      {/* ============================================================ */}
      <LinearGradient
        colors={['#0b1220', '#131d33', '#0e1628']}
        style={[styles.emptyStateHero, { borderColor: theme.border }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={[styles.emptyStateHeroTop, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={[styles.emptyStateLogo, { backgroundColor: theme.primary }]}>
              <Ionicons name="sparkles" size={28} color="#fff" />
            </View>
            <View style={styles.emptyStateHeroText}>
              <Text style={[styles.emptyStateTitle, { color: theme.text, marginBottom: 2 }]}>
                {greeting}, {displayName}! 🌟
              </Text>
              {!isPreschool && learnerContext?.grade && (
                <View style={localStyles.gradeBadgeRow}>
                  <View style={[localStyles.gradeBadge, { backgroundColor: theme.primary + '22', borderColor: theme.primary + '44' }]}>
                    <Text style={[localStyles.gradeBadgeText, { color: theme.primary }]}>
                      Grade {learnerContext.grade} · {phaseLabel}
                    </Text>
                  </View>
                </View>
              )}
              {isPreschool && (
                <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary }]}>
                  Tell me what your child is learning. I'll use stories and simple questions.
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={toggleCollapsed}
            accessibilityLabel="Collapse tutor mode"
            style={{
              padding: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surfaceVariant,
            }}
          >
            <Ionicons name="chevron-up" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Streak + Daily Progress Row */}
        <View style={localStyles.streakProgressRow}>
          <View style={localStyles.streakBadge}>
            <Text style={localStyles.streakText}>
              🔥 {learningStats.streak}-day streak
            </Text>
          </View>
          <View style={localStyles.dailyProgressWrap}>
            <Text style={[localStyles.dailyProgressLabel, { color: theme.textSecondary }]}>
              {learningStats.sessionsToday}/{learningStats.sessionsGoal} sessions today
            </Text>
            <View style={[localStyles.progressBarBg, { backgroundColor: theme.border }]}>
              <View
                style={[
                  localStyles.progressBarFill,
                  { width: percentWidth(dailyProgressPercent), backgroundColor: theme.primary },
                ]}
              />
            </View>
          </View>
        </View>

        {/* ============================================================ */}
        {/* PRIMARY CTAs — 2x2 grid                                      */}
        {/* ============================================================ */}
        <View style={localStyles.ctaGrid}>
          <TouchableOpacity
            style={localStyles.ctaCard}
            activeOpacity={0.8}
            onPress={() => router.push('/screens/dash-voice')}
          >
            <LinearGradient
              colors={CTA_GRADIENTS[0]}
              style={localStyles.ctaCardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={localStyles.ctaEmoji}>📸</Text>
              <Text style={localStyles.ctaLabel}>Scan Homework</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={localStyles.ctaCard}
            activeOpacity={0.8}
            onPress={() => sendTutorIntent(
              isPreschool
                ? 'Use a short story and ask one simple question to get started.'
                : 'Ask me one short diagnostic question first, then explain step-by-step in simple language.'
            )}
          >
            <LinearGradient
              colors={CTA_GRADIENTS[1]}
              style={localStyles.ctaCardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={localStyles.ctaEmoji}>💡</Text>
              <Text style={localStyles.ctaLabel}>Explain a Topic</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={localStyles.ctaCard}
            activeOpacity={0.8}
            onPress={() => sendTutorIntent(
              isPreschool
                ? 'Give one playful practice question. Wait for the answer before continuing.'
                : 'Give me one practice question to diagnose my level. Wait for my answer before continuing.'
            )}
          >
            <LinearGradient
              colors={CTA_GRADIENTS[2]}
              style={localStyles.ctaCardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={localStyles.ctaEmoji}>✏️</Text>
              <Text style={localStyles.ctaLabel}>Practice Questions</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={localStyles.ctaCard}
            activeOpacity={0.8}
            onPress={() => sendTutorIntent(
              isPreschool
                ? `Quiz with about ${quizChallengeTarget} very easy questions using colors, shapes, or counting.`
                : `Quiz me with about ${quizChallengeTarget} questions, starting easy and getting harder.`
            )}
          >
            <LinearGradient
              colors={CTA_GRADIENTS[3]}
              style={localStyles.ctaCardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={localStyles.ctaEmoji}>🎯</Text>
              <Text style={localStyles.ctaLabel}>Quiz Me</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ============================================================ */}
      {/* AGE & GRADE SECTION                                          */}
      {/* ============================================================ */}
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Age & grade</Text>
        {learnerContext && (learnerContext.grade || learnerContext.learnerName || learnerContext.schoolType) && (
          <View style={[styles.profileHint, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="person-circle-outline" size={16} color={theme.primary} />
            <Text style={[styles.profileHintText, { color: theme.textSecondary }]}>
              {learnerContext.learnerName ? `${learnerContext.learnerName}` : 'Learner profile'}
              {learnerContext.grade ? ` · Grade ${learnerContext.grade}` : ''}
              {learnerContext.schoolType ? ` · ${learnerContext.schoolType}` : ''}
            </Text>
          </View>
        )}
        <View style={styles.chipRow}>
          {visibleAgeChips.map((chip) => {
            const active = chip.id === ageBand;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.ageChip,
                  { borderColor: active ? theme.primary : theme.border },
                  active && { backgroundColor: theme.primary + '22' },
                ]}
                onPress={() => {
                  if (lockAgeBand) return;
                  setAgeBand(chip.id);
                }}
                disabled={lockAgeBand}
              >
                <Text style={[styles.ageChipText, { color: active ? theme.primary : theme.textSecondary }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ============================================================ */}
      {/* GRADE-AWARE CAPS SUBJECT CARDS                               */}
      {/* ============================================================ */}
      {!isPreschool && (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            {phaseLabel} subjects
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={localStyles.subjectScrollContent}
          >
            {subjectCards.map((card, idx) => (
              <TouchableOpacity
                key={card.label}
                activeOpacity={0.8}
                onPress={() => sendTutorIntent(card.prompt)}
                style={localStyles.subjectCardWrap}
              >
                <LinearGradient
                  colors={SUBJECT_GRADIENTS[idx % SUBJECT_GRADIENTS.length]}
                  style={localStyles.subjectCard}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={localStyles.subjectEmoji}>{card.emoji}</Text>
                  <Text style={localStyles.subjectLabel}>{card.label}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ============================================================ */}
      {/* PROGRESS CARD — Weekly stats + heatmap + XP                  */}
      {/* ============================================================ */}
      <View style={[styles.journeyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.journeyHeader}>
          <Ionicons name="stats-chart-outline" size={18} color={theme.primary} />
          <Text style={[styles.journeyTitle, { color: theme.text }]}>This week</Text>
          <View style={[localStyles.xpBadge, { backgroundColor: theme.primary + '22' }]}>
            <Text style={[localStyles.xpBadgeText, { color: theme.primary }]}>
              ⚡ {learningStats.xp} XP · Lv {learningStats.level}
            </Text>
          </View>
        </View>

        <Text style={[localStyles.weekStatsText, { color: theme.textSecondary }]}>
          📊 {learningStats.weekSessions} sessions · {learningStats.weekQuestions} questions · {learningStats.weekAccuracy}% accuracy
        </Text>

        {/* 7-day heatmap */}
        <View style={localStyles.heatmapRow}>
          {DAY_LABELS.map((day, idx) => (
            <View key={`${day}-${idx}`} style={localStyles.heatmapDayCol}>
              <View
                style={[
                  localStyles.heatmapDot,
                  {
                    backgroundColor: learningStats.weekDays[idx]
                      ? theme.primary
                      : (theme.border || '#333'),
                  },
                ]}
              />
              <Text style={[localStyles.heatmapDayLabel, { color: theme.textSecondary }]}>
                {day}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.journeyButton, { backgroundColor: theme.primary }]}
          onPress={() => sendTutorIntent('Start a 5-minute mini lesson. Ask me what topic to focus on.')}
        >
          <Text style={[styles.journeyButtonText, { color: theme.onPrimary || '#fff' }]}>Start a mini lesson</Text>
          <Ionicons name="arrow-forward" size={16} color={theme.onPrimary || '#fff'} />
        </TouchableOpacity>
      </View>

      {/* ============================================================ */}
      {/* RESUME CARD — Continue + Past Sessions                       */}
      {/* ============================================================ */}
      {lastConversationId && (
        <View style={[styles.resumeCard, { borderColor: theme.border, backgroundColor: theme.surface, flexDirection: 'column', alignItems: 'stretch' }]}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            onPress={() => router.push({ pathname: '/screens/dash-assistant', params: { conversationId: lastConversationId } })}
          >
            <View style={styles.resumeLeft}>
              <Ionicons name="time-outline" size={18} color={theme.primary} />
              <View>
                <Text style={[styles.resumeText, { color: theme.text }]}>Continue your last conversation</Text>
                {(learningStats.lastTopic || learningStats.lastSubject) && (
                  <Text style={[localStyles.resumeTopicLabel, { color: theme.textSecondary }]}>
                    {learningStats.lastSubject ? `${learningStats.lastSubject}` : ''}{learningStats.lastSubject && learningStats.lastTopic ? ' · ' : ''}{learningStats.lastTopic || ''}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={localStyles.pastSessionsLink}
            onPress={() => router.push('/screens/dash-assistant')}
          >
            <Ionicons name="library-outline" size={14} color={theme.primary} />
            <Text style={[localStyles.pastSessionsText, { color: theme.primary }]}>
              📚 Past Sessions
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dedicated tutor mode link */}
      <TouchableOpacity
        style={[styles.resumeCard, { borderColor: theme.primary + '40', backgroundColor: theme.primary + '08' }]}
        onPress={() => router.push({
          pathname: '/screens/dash-tutor',
          params: {
            ageBand: ageBand !== 'auto' ? ageBand : undefined,
            mode: isPreschool ? 'play' : undefined,
          },
        })}
      >
        <View style={styles.resumeLeft}>
          <Ionicons name="school-outline" size={18} color={theme.primary} />
          <Text style={[styles.resumeText, { color: theme.primary, fontWeight: '600' }]}>
            {isPreschool ? 'Open play & learn mode' : 'Open focused tutor mode'}
          </Text>
        </View>
        <Ionicons name="open-outline" size={16} color={theme.primary} />
      </TouchableOpacity>

      {/* ============================================================ */}
      {/* STAFF SECTION — Planning, brainstorm, + Class Performance    */}
      {/* ============================================================ */}
      {isStaff && (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Planning & brainstorm</Text>
          <View style={styles.quickActionsContainer}>
            {staffActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={[styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                activeOpacity={0.7}
                onPress={() => sendTutorIntent(action.prompt)}
              >
                <View style={styles.actionButtonContent}>
                  <Ionicons name={action.icon as any} size={20} color={theme.primary} />
                  <Text style={[styles.actionButtonText, { color: theme.text }]}>{action.label}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            ))}
            {lessonBuilderRoute && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                activeOpacity={0.7}
                onPress={() => router.push(lessonBuilderRoute as any)}
              >
                <View style={styles.actionButtonContent}>
                  <Ionicons name="book-outline" size={20} color={theme.primary} />
                  <Text style={[styles.actionButtonText, { color: theme.text }]}>Open lesson builder</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              activeOpacity={0.7}
              onPress={() => router.push('/screens/brainstorm-room')}
            >
              <View style={styles.actionButtonContent}>
                <Ionicons name="people-outline" size={20} color={theme.primary} />
                <Text style={[styles.actionButtonText, { color: theme.text }]}>Open brainstorm room</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={theme.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              activeOpacity={0.7}
              onPress={() => router.push('/screens/teacher-activity-builder')}
            >
              <View style={styles.actionButtonContent}>
                <Ionicons name="extension-puzzle-outline" size={20} color={theme.primary} />
                <Text style={[styles.actionButtonText, { color: theme.text }]}>Build activity</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const localStyles = StyleSheet.create({
  gradeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  gradeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  gradeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  streakProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  streakBadge: {
    backgroundColor: '#f59e0b22',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fbbf24',
  },
  dailyProgressWrap: {
    flex: 1,
    minWidth: 120,
    gap: 4,
  },
  dailyProgressLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  ctaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  ctaCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 72,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaCardGradient: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  ctaEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  ctaLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  subjectScrollContent: {
    gap: 10,
    paddingRight: 4,
  },
  subjectCardWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  subjectCard: {
    width: 100,
    height: 88,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subjectEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  subjectLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e2e8f0',
    textAlign: 'center',
  },
  xpBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  xpBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  weekStatsText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  heatmapRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  heatmapDayCol: {
    alignItems: 'center',
    gap: 4,
  },
  heatmapDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  heatmapDayLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  resumeTopicLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  pastSessionsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ffffff15',
  },
  pastSessionsText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default TutorHome;
