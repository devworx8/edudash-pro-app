/**
 * DashHeader Component
 * 
 * Header bar for Dash AI Assistant with title, tier badge, and action buttons.
 * Extracted from DashAssistant for WARP.md compliance.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TierBadge } from '@/components/ui/TierBadge';
import { useTheme } from '@/contexts/ThemeContext';
import { percentWidth } from '@/lib/progress/clampPercent';

type Theme = ReturnType<typeof useTheme>['theme'];

const { width: screenWidth } = Dimensions.get('window');

interface RoleCopy {
  title: string;
  subtitle: string;
}

interface TutorSession {
  id: string;
  mode: string;
  questionIndex: number;
  totalQuestions: number;
  correctCount: number;
  maxQuestions: number;
}

interface DashHeaderProps {
  tutorSession?: TutorSession | null;
  roleCopy: RoleCopy;
  activeModeLabel?: string;
  activeModeHint?: string;
  tier: string | null;
  subReady: boolean;
  isSpeaking: boolean;
  showAdvancedControls: boolean;
  showOrbLink?: boolean;
  showWakeWordToggle: boolean;
  wakeWordEnabled: boolean;
  wakeWordLoaded: boolean;
  onClose?: () => void;
  stopSpeaking: () => void;
  handleNewChat: () => void;
  toggleWakeWord: () => void;
  cleanup?: () => void;
  styles: any;
  theme: Theme;
}

export const DashHeader: React.FC<DashHeaderProps> = ({
  roleCopy,
  activeModeLabel,
  activeModeHint,
  tier,
  subReady,
  isSpeaking,
  showAdvancedControls,
  showOrbLink,
  showWakeWordToggle,
  wakeWordEnabled,
  wakeWordLoaded,
  tutorSession,
  onClose,
  stopSpeaking,
  handleNewChat,
  toggleWakeWord,
  cleanup,
  styles,
  theme,
}) => {
  const iconSize = screenWidth < 400 ? 18 : 20;
  const actionBg = theme.surfaceVariant || theme.surface;
  const actionBorder = theme.border;
  const actionFg = theme.text;
  // Parents/students get a ultra-clean header — no tier badge, no Live pill, minimal icons
  const isSimplifiedView = !showAdvancedControls;

  return (
    <View style={[styles.header, { backgroundColor: 'transparent' }]}>
      <View style={[styles.headerShell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerTopRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.headerAccentDot, { backgroundColor: theme.primary }]} />
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {roleCopy.title}
            </Text>
            {!isSimplifiedView && subReady && tier && (
              <TierBadge tier={tier as any} size="sm" />
            )}
          </View>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            {roleCopy.subtitle}
          </Text>
          {tutorSession && tutorSession.maxQuestions > 0 && (
            <View>
              <View style={styles.tutorMetaRow}>
                <Text style={[styles.tutorMetaText, { color: theme.textSecondary }]}>
                  Question {tutorSession.totalQuestions + 1} / {tutorSession.maxQuestions}
                </Text>
                <Text style={[styles.tutorMetaText, { color: theme.success }]}>
                  {tutorSession.correctCount} correct
                </Text>
              </View>
              <View style={[styles.tutorTrack, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.tutorTrackFill,
                    {
                      width: percentWidth(Math.min(100, (tutorSession.totalQuestions / tutorSession.maxQuestions) * 100)),
                      backgroundColor: theme.primary,
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.actionRail, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
          {isSpeaking && (
            <TouchableOpacity
              style={[
                styles.iconButton,
                styles.iconButtonDanger,
                { backgroundColor: theme.error, borderColor: theme.error },
              ]}
              accessibilityLabel="Stop speaking"
              onPress={stopSpeaking}
            >
              <Ionicons name="stop" size={iconSize} color={theme.onError || theme.background} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: actionBg, borderColor: actionBorder }]}
            accessibilityLabel="New chat"
            onPress={handleNewChat}
          >
            <Ionicons name="add-circle-outline" size={iconSize} color={actionFg} />
          </TouchableOpacity>
          {!isSimplifiedView && (
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: actionBg, borderColor: actionBorder }]}
            accessibilityLabel="Conversations"
            onPress={() => router.push('/screens/dash-conversations-history')}
          >
            <Ionicons name="time-outline" size={iconSize} color={actionFg} />
          </TouchableOpacity>
          )}
          {(showAdvancedControls || showOrbLink) && (
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: actionBg, borderColor: actionBorder }]}
              accessibilityLabel="Open Dash Orb"
              onPress={() => router.push('/screens/dash-voice?mode=orb')}
            >
              <Ionicons name="planet-outline" size={iconSize} color={actionFg} />
            </TouchableOpacity>
          )}
          {!isSimplifiedView && (
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: actionBg, borderColor: actionBorder }]}
            accessibilityLabel="Settings"
            onPress={() => router.push('/screens/dash-ai-settings')}
          >
            <Ionicons name="settings-outline" size={iconSize} color={actionFg} />
          </TouchableOpacity>
          )}
          {onClose && (
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: actionBg, borderColor: actionBorder }]}
              onPress={async () => {
                await stopSpeaking();
                cleanup?.();
                onClose();
              }}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={screenWidth < 400 ? 20 : 22} color={actionFg} />
            </TouchableOpacity>
          )}
          </View>
        </View>
      </View>
      <View style={styles.headerStatusRow}>
        {!!activeModeLabel && (
          <View style={[styles.headerStatusPill, { borderColor: theme.primary + '55', backgroundColor: theme.primary + '16' }]}>
            <Ionicons name="sparkles-outline" size={12} color={theme.primary} />
            <Text style={[styles.headerStatusText, { color: theme.primary }]}>{activeModeLabel}</Text>
          </View>
        )}
        {!!activeModeHint && (
          <View style={[styles.headerStatusPill, { borderColor: theme.border, backgroundColor: theme.surfaceVariant }]}>
            <Text numberOfLines={1} style={[styles.headerStatusSubtle, { color: theme.textSecondary }]}>
              {activeModeHint}
            </Text>
          </View>
        )}
        {showWakeWordToggle && (
          <TouchableOpacity
            style={[styles.headerStatusPill, { borderColor: wakeWordEnabled ? theme.success : theme.border, backgroundColor: theme.surfaceVariant }]}
            accessibilityLabel="Toggle wake word"
            onPress={toggleWakeWord}
            disabled={!wakeWordLoaded}
          >
            <Ionicons
              name={wakeWordEnabled ? 'ear' : 'ear-outline'}
              size={12}
              color={wakeWordEnabled ? theme.success : theme.text}
            />
            <Text style={[styles.headerStatusSubtle, { color: wakeWordEnabled ? theme.success : theme.textSecondary }]}>
              {wakeWordEnabled ? 'Wake word on' : 'Wake word off'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      </View>
    </View>
  );
};
