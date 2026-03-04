import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { examPrepWizardStyles as styles } from '@/components/exam-prep/examPrepWizard.styles';

type ExamPrepQuickLaunchCardProps = {
  quickLaunchLabel: string;
  theme: ThemeColors;
  onPress: () => void;
};

export function ExamPrepQuickLaunchCard({
  quickLaunchLabel,
  theme,
  onPress,
}: ExamPrepQuickLaunchCardProps) {
  return (
    <View style={[styles.quickLaunchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.quickLaunchHeader}>
        <Ionicons name="flash-outline" size={18} color={theme.primary} />
        <Text style={[styles.quickLaunchTitle, { color: theme.text }]}>Quick Live Session</Text>
      </View>
      <Text style={[styles.quickLaunchSubtitle, { color: theme.muted }]}>
        Open interactive in-canvas practice for {quickLaunchLabel} with instant correct/incorrect
        markers and explanations.
      </Text>
      <TouchableOpacity
        style={[styles.quickLaunchButton, { backgroundColor: theme.primary }]}
        onPress={onPress}
      >
        <Ionicons name="play-circle" size={18} color="#ffffff" />
        <Text style={styles.quickLaunchButtonText}>
          Start Live Practice: {quickLaunchLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
