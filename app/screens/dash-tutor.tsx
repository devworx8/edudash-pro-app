/**
 * Dash Tutor Screen — #NEXT-GEN Cosmic Learning Environment
 *
 * Dedicated interactive tutoring screen with age-adaptive theming
 * and ZA-inspired cosmic gradient backgrounds. Provides a focused
 * learning experience separate from the general Dash AI chat.
 *
 * Route: /screens/dash-tutor
 * Params:
 *   - mode?: TutorMode ('explain' | 'practice' | 'quiz' | 'play' | 'diagnostic')
 *   - subject?: string
 *   - grade?: string
 *   - initialMessage?: string
 *   - conversationId?: string
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import DashAssistant from '@/components/ai/DashAssistant';
import { getTutorTheme, isPreschoolBand } from '@/lib/dash-ai/tutorTheme';
import { resolveAgeBand } from '@/lib/dash-ai/learnerContext';
import { normalizeRole } from '@/lib/rbac';
import { resolveDashboardFallback } from '@/lib/dashboard/resolveDashboardFallback';
import type { TutorMode } from '@/hooks/dash-assistant/tutorTypes';

// ─── ZA Cosmic Palette ───────────────────────────────────────────────────────

const ZA_COSMIC = {
  gold: '#FFD700',
  goldSoft: '#FFC83D',
  emerald: '#00C853',
  teal: '#00BCD4',
  deepBlue: '#002395',
} as const;

export default function DashTutorScreen() {
  const { theme: appTheme, isDark } = useTheme();
  const { profile, user } = useAuth();
  const params = useLocalSearchParams<{
    mode?: string;
    subject?: string;
    grade?: string;
    initialMessage?: string;
    conversationId?: string;
    ageBand?: string;
    slowLearner?: string;
  }>();
  const slowLearnerMode = useMemo(
    () => String(params?.slowLearner || '').toLowerCase() === 'true',
    [params?.slowLearner]
  );

  // Resolve age band from params, profile, or default
  const ageBand = useMemo(() => {
    if (params?.ageBand) return params.ageBand;
    // Try to get from profile metadata
    const ageYears = (profile as any)?.age_years ?? (profile as any)?.ageYears ?? null;
    const grade = params?.grade ?? (profile as any)?.grade ?? null;
    return resolveAgeBand(ageYears, grade) || '9-12';
  }, [params?.ageBand, params?.grade, profile]);

  const tutorTheme = useMemo(() => getTutorTheme(ageBand), [ageBand]);
  const isPreschool = isPreschoolBand(ageBand);

  // Build initial message based on mode
  const initialMessage = useMemo(() => {
    if (params?.initialMessage) return params.initialMessage;

    const mode = params?.mode as TutorMode | undefined;
    const subject = params?.subject || '';
    const grade = params?.grade || '';

    switch (mode) {
      case 'play':
        return "Let's play a learning game! 🎮";
      case 'practice':
        return subject
          ? `Let's practice ${subject}${grade ? ` for Grade ${grade}` : ''}`
          : "Let's practice! What subject?";
      case 'quiz':
        return subject
          ? `Quiz me on ${subject}${grade ? ` Grade ${grade}` : ''}`
          : 'Quiz me! What subject?';
      case 'diagnostic':
        return subject
          ? `Diagnose my ${subject} level${grade ? ` for Grade ${grade}` : ''}`
          : 'Check my level — diagnose me!';
      case 'explain':
        return subject
          ? `Explain ${subject}${grade ? ` at Grade ${grade} level` : ''}`
          : 'Teach me something! What topic?';
      default:
        return isPreschool
          ? "Hi Dash! Let's learn together! 🌟"
          : undefined;
    }
  }, [params?.initialMessage, params?.mode, params?.subject, params?.grade, isPreschool]);

  const conversationId = typeof params?.conversationId === 'string' ? params.conversationId : undefined;
  const stableTutorConfig = useMemo(
    () => ({
      subject: params?.subject,
      grade: params?.grade,
      slowLearner: slowLearnerMode,
    }),
    [params?.subject, params?.grade, slowLearnerMode]
  );

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(resolveDashboardFallback(profile) as any);
    }
  }, [profile]);

  // Compute header title based on mode
  const headerTitle = useMemo(() => {
    const mode = params?.mode as TutorMode | undefined;
    switch (mode) {
      case 'play': return 'Play & Learn';
      case 'practice': return 'Practice';
      case 'quiz': return 'Quiz Time';
      case 'diagnostic': return 'Level Check';
      case 'explain': return 'Learn';
      default: return isPreschool ? 'Play & Learn' : 'Dash Tutor';
    }
  }, [params?.mode, isPreschool]);

  // Age-band badge
  const ageBadge = useMemo(() => {
    switch (ageBand) {
      case '3-5': return '👶 Ages 3-5';
      case '6-8': return '🧒 Grade R-3';
      case '9-12': return '📚 Grade 4-6';
      case '13-15': return '📖 Grade 7-9';
      case '16-18': return '🎓 Grade 10-12';
      default: return '';
    }
  }, [ageBand]);

  // Cosmic background gradients
  const bgBase: [string, string, string] = isDark
    ? ['#0B1020', '#0F172A', '#131B2E']
    : ['#F0F4FF', '#E8EEFF', '#F8FAFC'];
  const glowA: [string, string, string] = isDark
    ? ['rgba(139,92,246,0.20)', 'rgba(99,102,241,0.06)', 'transparent']
    : ['rgba(139,92,246,0.15)', 'rgba(99,102,241,0.04)', 'transparent'];
  const glowB: [string, string, string] = isDark
    ? ['rgba(0,200,83,0.15)', 'rgba(0,188,212,0.04)', 'transparent']
    : ['rgba(0,200,83,0.10)', 'rgba(0,188,212,0.03)', 'transparent'];
  
  // Header gradient
  const headerGradient: [string, string] = isDark
    ? ['#0B1020', tutorTheme.colors.surface + 'CC']
    : [tutorTheme.colors.surface, tutorTheme.colors.surface + 'E0'];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Cosmic background layer */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient colors={bgBase} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={glowA}
          style={styles.glowA}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <LinearGradient
          colors={glowB}
          style={styles.glowB}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </View>

      <Stack.Screen
        options={{
          title: headerTitle,
          headerShown: true,
          headerStyle: {
            backgroundColor: 'transparent',
          },
          headerBackground: () => (
            <LinearGradient
              colors={headerGradient}
              style={StyleSheet.absoluteFill}
            />
          ),
          headerTitleStyle: {
            color: isDark ? '#E2E8F0' : '#1E293B',
            fontSize: tutorTheme.typography.headingSize - 4,
            fontWeight: '700',
          },
          headerTintColor: tutorTheme.colors.primary,
          headerRight: () => (
            <View style={styles.headerRight}>
              {ageBadge ? (
                <LinearGradient
                  colors={isDark
                    ? [tutorTheme.colors.primary + '25', tutorTheme.colors.primary + '10']
                    : [tutorTheme.colors.primary + '18', tutorTheme.colors.primary + '08']}
                  style={styles.ageBadge}
                >
                  <Text style={[styles.ageBadgeText, { color: tutorTheme.colors.primary }]}>
                    {ageBadge}
                  </Text>
                </LinearGradient>
              ) : null}
            </View>
          ),
        }}
      />

      {/* Mascot greeting for preschool */}
      {tutorTheme.layout.showMascot && !conversationId && (
        <View style={styles.mascotBanner}>
          <LinearGradient
            colors={isDark
              ? [tutorTheme.colors.mascotGlow + '15', tutorTheme.colors.mascotGlow + '05']
              : [tutorTheme.colors.mascotGlow + '12', tutorTheme.colors.mascotGlow + '04']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.mascotEmoji}>{tutorTheme.mascot.emoji}</Text>
          <View style={styles.mascotTextWrap}>
            <Text
              style={[
                styles.mascotGreeting,
                {
                  color: isDark ? '#E2E8F0' : '#1E293B',
                  fontSize: tutorTheme.typography.bodySize,
                },
              ]}
            >
              {isPreschool
                ? "Hi there! I'm Dash! Let's play and learn together!"
                : `Hey! I'm ${tutorTheme.mascot.name}. Ready to learn?`}
            </Text>
          </View>
          <Ionicons name="sparkles" size={16} color={ZA_COSMIC.gold} />
        </View>
      )}

      {/* Main chat area — re-uses DashAssistant with tutor context */}
      <View style={styles.chatArea}>
        <DashAssistant
          initialMessage={initialMessage}
          conversationId={conversationId}
          handoffSource="tutor"
          uiMode="tutor"
          disableTts
          disableQuickChips
          onClose={handleClose}
          tutorMode={(params?.mode as TutorMode) || null}
          tutorConfig={stableTutorConfig}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glowA: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '70%',
    height: '50%',
    borderBottomRightRadius: 300,
  },
  glowB: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '60%',
    height: '40%',
    borderTopLeftRadius: 300,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  ageBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  ageBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  mascotBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    overflow: 'hidden',
  },
  mascotEmoji: {
    fontSize: 36,
  },
  mascotTextWrap: {
    flex: 1,
  },
  mascotGreeting: {
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  chatArea: {
    flex: 1,
  },
});
