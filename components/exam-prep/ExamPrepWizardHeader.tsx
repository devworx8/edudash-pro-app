import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { examPrepWizardStyles as styles } from '@/components/exam-prep/examPrepWizard.styles';

type ExamPrepWizardHeaderProps = {
  currentStep: number;
  isDark: boolean;
  theme: ThemeColors;
};

export function ExamPrepWizardHeader({ currentStep, isDark, theme }: ExamPrepWizardHeaderProps) {
  return (
    <LinearGradient
      colors={isDark ? ['#1e293b', '#0f172a'] : ['#f0f9ff', '#e0f2fe']}
      style={styles.header}
    >
      <View style={styles.headerContent}>
        <Ionicons name="school" size={32} color={theme.primary} />
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>AI-Powered Exam Prep</Text>
          <Text style={[styles.headerSubtitle, { color: theme.muted }]}>
            Structured CAPS-aligned generation from real teacher artifacts.
          </Text>
        </View>
      </View>

      <View style={styles.progressSteps}>
        {['Grade', 'Subject', 'Type', 'Review'].map((label, index) => {
          const stepNum = index + 1;
          const isActive = stepNum <= currentStep;
          return (
            <View key={label} style={styles.progressStep}>
              <View
                style={[
                  styles.progressDot,
                  { backgroundColor: isActive ? theme.primary : theme.border },
                ]}
              >
                {stepNum < currentStep ? (
                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                ) : null}
              </View>
              <Text style={[styles.progressLabel, { color: isActive ? theme.primary : theme.muted }]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </LinearGradient>
  );
}
