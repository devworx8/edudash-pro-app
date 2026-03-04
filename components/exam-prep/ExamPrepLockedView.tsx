import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { examPrepWizardStyles as styles } from '@/components/exam-prep/examPrepWizard.styles';

type ExamPrepLockedViewProps = {
  requiredExamTier: string | null;
  theme: ThemeColors;
};

export function ExamPrepLockedView({ requiredExamTier, theme }: ExamPrepLockedViewProps) {
  return (
    <View style={styles.disabledContainer}>
      <Ionicons name="lock-closed-outline" size={64} color={theme.muted} />
      <Text style={[styles.disabledText, { color: theme.text }]}>Exam Prep is locked</Text>
      <Text style={[styles.disabledSubtext, { color: theme.muted }]}>
        Upgrade to {requiredExamTier || 'Starter'} to unlock exam practice features.
      </Text>
      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: theme.primary }]}
        onPress={() => router.push('/screens/manage-subscription')}
      >
        <Text style={styles.backButtonText}>Manage Plan</Text>
      </TouchableOpacity>
    </View>
  );
}
