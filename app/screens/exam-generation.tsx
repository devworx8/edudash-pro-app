/**
 * Exam Generation Screen (React Native)
 *
 * Structured generation flow powered by the generate-exam edge function.
 * Handles loading, error+retry, then renders interactive exam view.
 */

import React, { useCallback, useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { examGenerationStyles as styles } from '@/features/exam-generation/styles';
import { ExamGenerationReadyContent } from '@/features/exam-generation/ExamGenerationReadyContent';
import { ExamGenerationStatusState } from '@/features/exam-generation/ExamGenerationStatusState';
import { useExamGenerationController } from '@/features/exam-generation/useExamGenerationController';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';

type ExamGenerationParams = {
  grade?: string;
  subject?: string;
  examType?: string;
  type?: string;
  language?: string;
  studentId?: string;
  classId?: string;
  schoolId?: string;
  childName?: string;
  useTeacherContext?: string;
  fallbackPolicy?: string;
  qualityMode?: string;
  allowOverQuota?: string;
  draftId?: string;
  examId?: string;
  loadSaved?: string;
  retake?: string;
};

function toSafeParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

export default function ExamGenerationScreen() {
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams<ExamGenerationParams>();

  const grade = toSafeParam(params.grade);
  const subject = toSafeParam(params.subject);
  const examType = toSafeParam(params.examType) || toSafeParam(params.type) || 'practice_test';
  const language = toSafeParam(params.language) || 'en-ZA';
  const studentId = toSafeParam(params.studentId);
  const classId = toSafeParam(params.classId);
  const schoolId = toSafeParam(params.schoolId);
  const childName = toSafeParam(params.childName);
  const useTeacherContext = toBool(toSafeParam(params.useTeacherContext), true);
  const fallbackPolicy = toSafeParam(params.fallbackPolicy) || 'provider_outage_only';
  const qualityMode = toSafeParam(params.qualityMode) || 'standard';
  const allowOverQuota = toBool(toSafeParam(params.allowOverQuota), false);
  const draftId = toSafeParam(params.draftId);
  const savedExamId = toSafeParam(params.examId);
  const loadSaved = toBool(toSafeParam(params.loadSaved), false);
  const retakeMode = toBool(toSafeParam(params.retake), false);

  const controllerParams = useMemo(
    () => ({
      grade,
      subject,
      examType,
      language,
      studentId,
      classId,
      schoolId,
      childName,
      useTeacherContext,
      fallbackPolicy,
      qualityMode,
      allowOverQuota,
      draftId,
      savedExamId,
      loadSaved,
    }),
    [
      grade,
      subject,
      examType,
      language,
      studentId,
      classId,
      schoolId,
      childName,
      useTeacherContext,
      fallbackPolicy,
      qualityMode,
      allowOverQuota,
      draftId,
      savedExamId,
      loadSaved,
    ],
  );

  const controller = useExamGenerationController(controllerParams);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleUpgrade = useCallback(() => {
    navigateToUpgrade({ source: 'exam_generation', reason: 'limit_reached' });
  }, []);

  if (controller.readyWithPayload) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.contentWrap}>
          <View style={styles.contentInner}>
            <ExamGenerationReadyContent
              artifact={controller.artifact}
              blueprintAudit={controller.blueprintAudit}
              completionSummary={controller.completionSummary}
              contextSummary={controller.contextSummary}
              exam={controller.exam}
              examId={controller.examId}
              examLanguage={language}
              generationMode={controller.generationMode}
              handleComplete={controller.handleComplete}
              hasGenerationWarning={controller.hasGenerationWarning}
              isPracticeArtifact={controller.isPracticeArtifact}
              modelProfile={controller.modelProfile}
              modelUsed={controller.modelUsed}
              pdfExportNotice={controller.pdfExportNotice}
              pdfExporting={controller.pdfExporting}
              persistenceWarning={controller.persistenceWarning}
              qualityReport={controller.qualityReport}
              retakeMode={retakeMode}
              scopeDiagnostics={controller.scopeDiagnostics}
              showAudit={controller.showAudit}
              showGenerationStatus={controller.showGenerationStatus}
              studyCoachPack={controller.studyCoachPack}
              studentId={studentId}
              classId={classId}
              schoolId={schoolId}
              teacherAlignment={controller.teacherAlignment}
              theme={theme}
              usesUploadedMaterial={controller.usesUploadedMaterial}
              setShowAudit={controller.setShowAudit}
              setShowGenerationStatus={controller.setShowGenerationStatus}
              onExportPdf={controller.handleExportPdf}
              onBack={handleBack}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={isDark ? ['#0f172a', '#111827'] : ['#eff6ff', '#f8fafc']}
        style={[styles.header, { borderBottomColor: theme.border }]}
      >
        <TouchableOpacity
          style={[styles.backButton, { borderColor: theme.border }]}
          onPress={handleBack}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Generating Exam</Text>
          <Text style={[styles.headerSubtitle, { color: theme.muted }]}>
            {childName ? `For ${childName}` : 'Structured CAPS exam pipeline'}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.contentWrap}>
        <View style={styles.contentInner}>
          <ExamGenerationStatusState
            contextSummary={controller.contextSummary}
            error={controller.error}
            examQuotaLimit={controller.examQuotaLimit}
            examQuotaUsed={controller.examQuotaUsed}
            examQuotaWarning={controller.examQuotaWarning}
            generationLabel={controller.generationLabel}
            isQuotaExhausted={controller.isQuotaExhausted}
            state={controller.state}
            theme={theme}
            useTeacherContext={controller.useTeacherContext}
            onBack={handleBack}
            onRetry={controller.generateExam}
            onUpgradePlan={handleUpgrade}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
