import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QuotaRingWithStatus } from '@/components/ui/CircularQuotaRing';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { examPrepWizardStyles as styles } from '@/components/exam-prep/examPrepWizard.styles';
import { ExamPrepReviewStep } from '@/components/exam-prep/ExamPrepWizardReviewStep';
import { ExamPrepStudyMaterialCard } from '@/components/exam-prep/ExamPrepStudyMaterialCard';
import type { SouthAfricanLanguage, ExamContextSummary } from '@/components/exam-prep/types';
import type { PdfSplitProgress, StudyMaterial } from '@/hooks/exam-prep/useStudyMaterialPipeline';

type ExamPrepReviewSectionProps = {
  childName?: string;
  classId?: string;
  contextError: string | null;
  contextLoading: boolean;
  contextPreview: ExamContextSummary | null;
  customPromptText: string;
  examQuotaLimit: number;
  examQuotaUsed: number;
  examQuotaWarning: string | null;
  failedMaterialCount: number;
  gradeLabel: string;
  handleStartGeneration: (withTeacherContext: boolean) => void;
  hasBlockingMaterialErrors: boolean;
  isDark: boolean;
  isMaterialPipelineBusy: boolean;
  materialPipelineLabel: string;
  onBack: () => void;
  onCancelQueue: () => void;
  onPickImage: () => Promise<void>;
  onPickPdf: () => Promise<void>;
  onRemoveMaterial: (materialId: string) => void;
  onResumeQueue: () => void;
  onRetryFailedMaterials: () => void;
  onRetryMaterial: (materialId: string) => void;
  onSetCustomPromptText: (value: string) => void;
  onSetUseTeacherContext: (value: boolean) => void;
  pausedMaterialCount: number;
  pdfSplitProgress: PdfSplitProgress | null;
  readyMaterialSummaries: string[];
  schoolId?: string;
  selectedExamType: string;
  selectedExamTypeLabel: string;
  selectedGrade: string;
  selectedLanguage: SouthAfricanLanguage;
  selectedSubject: string;
  splitProgressPercent: number;
  studentId?: string;
  studyMaterials: StudyMaterial[];
  theme: ThemeColors;
  useTeacherContext: boolean;
};

export function ExamPrepReviewSection({
  childName,
  contextError,
  contextLoading,
  contextPreview,
  customPromptText,
  examQuotaLimit,
  examQuotaUsed,
  examQuotaWarning,
  failedMaterialCount,
  gradeLabel,
  handleStartGeneration,
  hasBlockingMaterialErrors,
  isDark,
  isMaterialPipelineBusy,
  materialPipelineLabel,
  onBack,
  onCancelQueue,
  onPickImage,
  onPickPdf,
  onRemoveMaterial,
  onResumeQueue,
  onRetryFailedMaterials,
  onRetryMaterial,
  onSetCustomPromptText,
  onSetUseTeacherContext,
  pausedMaterialCount,
  pdfSplitProgress,
  readyMaterialSummaries,
  selectedExamType,
  selectedExamTypeLabel,
  selectedGrade,
  selectedLanguage,
  selectedSubject,
  splitProgressPercent,
  studyMaterials,
  theme,
  useTeacherContext,
}: ExamPrepReviewSectionProps) {
  return (
    <>
      {examQuotaLimit > 0 ? (
        <View style={[styles.usageCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.usageCardHeader}>
            <Ionicons name="sparkles-outline" size={16} color={theme.primary} />
            <Text style={[styles.usageCardTitle, { color: theme.text }]}>AI Usage This Month</Text>
          </View>
          <View style={styles.usageRingWrap}>
            <QuotaRingWithStatus
              featureName="Exam prep"
              used={examQuotaUsed}
              limit={examQuotaLimit}
              size={66}
            />
          </View>
          <Text style={[styles.usageCardHint, { color: theme.muted }]}>
            {examQuotaUsed}/{examQuotaLimit} exam-related AI actions used this month.
          </Text>
        </View>
      ) : null}

      {examQuotaWarning ? (
        <View
          style={[
            styles.usageWarning,
            { borderColor: `${theme.warning}55`, backgroundColor: `${theme.warning}12` },
          ]}
        >
          <Ionicons name="warning-outline" size={15} color={theme.warning} />
          <Text style={[styles.usageWarningText, { color: theme.warning }]}>{examQuotaWarning}</Text>
        </View>
      ) : null}

      <ExamPrepReviewStep
        theme={theme}
        childName={childName}
        gradeLabel={gradeLabel}
        selectedGrade={selectedGrade}
        selectedSubject={selectedSubject}
        selectedExamTypeLabel={selectedExamTypeLabel}
        selectedExamType={selectedExamType}
        selectedLanguage={selectedLanguage}
        useTeacherContext={useTeacherContext}
        contextPreview={contextPreview}
        contextLoading={contextLoading}
        contextError={contextError}
        onBack={onBack}
        onSetUseTeacherContext={onSetUseTeacherContext}
        hideGenerateButtons
      />

      <ExamPrepStudyMaterialCard
        theme={theme}
        isDark={isDark}
        readyMaterialSummaries={readyMaterialSummaries}
        pdfSplitProgress={pdfSplitProgress}
        splitProgressPercent={splitProgressPercent}
        studyMaterials={studyMaterials}
        isMaterialPipelineBusy={isMaterialPipelineBusy}
        hasBlockingMaterialErrors={hasBlockingMaterialErrors}
        failedMaterialCount={failedMaterialCount}
        pausedMaterialCount={pausedMaterialCount}
        materialPipelineLabel={materialPipelineLabel}
        customPromptText={customPromptText}
        selectedExamTypeLabel={selectedExamTypeLabel}
        onSetCustomPromptText={onSetCustomPromptText}
        onPickImage={onPickImage}
        onPickPdf={onPickPdf}
        onRemoveMaterial={onRemoveMaterial}
        onRetryMaterial={onRetryMaterial}
        onRetryFailed={onRetryFailedMaterials}
        onResumeQueue={onResumeQueue}
        onCancelQueue={onCancelQueue}
        onGenerate={() => handleStartGeneration(useTeacherContext)}
        onGenerateWithoutContext={() => handleStartGeneration(false)}
      />
    </>
  );
}
