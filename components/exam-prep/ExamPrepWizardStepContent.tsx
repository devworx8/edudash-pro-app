import React from 'react';
import type { ThemeColors } from '@/contexts/ThemeContext';
import {
  ExamPrepGradeStep,
  ExamPrepSubjectStep,
  ExamPrepTypeStep,
} from '@/components/exam-prep/ExamPrepWizardSteps';
import { ExamPrepReviewSection } from '@/components/exam-prep/ExamPrepReviewSection';
import type { ExamContextSummary, SouthAfricanLanguage } from '@/components/exam-prep/types';
import type { SubjectCategory, WizardStep } from '@/components/exam-prep/examPrepWizard.helpers';
import type { PdfSplitProgress, StudyMaterial } from '@/hooks/exam-prep/useStudyMaterialPipeline';

type ExamPrepWizardStepContentProps = {
  childName?: string;
  contextError: string | null;
  contextLoading: boolean;
  contextPreview: ExamContextSummary | null;
  customPromptText: string;
  examQuotaLimit: number;
  examQuotaUsed: number;
  examQuotaWarning: string | null;
  failedMaterialCount: number;
  filteredSubjects: string[];
  gradeLabel: string;
  handleSelectGrade: (grade: string) => void;
  handleStartGeneration: (withTeacherContext: boolean) => void;
  hasBlockingMaterialErrors: boolean;
  isDark: boolean;
  isMaterialPipelineBusy: boolean;
  materialPipelineLabel: string;
  pausedMaterialCount: number;
  pdfSplitProgress: PdfSplitProgress | null;
  readyMaterialSummaries: string[];
  selectedExamType: string;
  selectedExamTypeLabel: string;
  selectedGrade: string;
  selectedLanguage: SouthAfricanLanguage;
  selectedSubject: string;
  splitProgressPercent: number;
  step: WizardStep;
  studyMaterials: StudyMaterial[];
  subjectCategory: SubjectCategory;
  subjectSearch: string;
  theme: ThemeColors;
  useTeacherContext: boolean;
  onMoveToStep: (step: WizardStep) => void;
  onPickMaterialImage: () => Promise<void>;
  onPickMaterialPdf: () => Promise<void>;
  onRemoveMaterial: (materialId: string) => void;
  onResumeQueue: () => void;
  onRetryFailedMaterials: () => void;
  onRetryMaterial: (materialId: string) => void;
  onCancelQueue: () => void;
  onSetCustomPromptText: (value: string) => void;
  onSetSelectedExamType: (value: string) => void;
  onSetSelectedLanguage: (value: SouthAfricanLanguage) => void;
  onSetSelectedSubject: (value: string) => void;
  onSetSubjectCategory: (value: SubjectCategory) => void;
  onSetSubjectSearch: (value: string) => void;
  onSetUseTeacherContext: (value: boolean) => void;
};

export function ExamPrepWizardStepContent({
  childName,
  contextError,
  contextLoading,
  contextPreview,
  customPromptText,
  examQuotaLimit,
  examQuotaUsed,
  examQuotaWarning,
  failedMaterialCount,
  filteredSubjects,
  gradeLabel,
  handleSelectGrade,
  handleStartGeneration,
  hasBlockingMaterialErrors,
  isDark,
  isMaterialPipelineBusy,
  materialPipelineLabel,
  onCancelQueue,
  onMoveToStep,
  onPickMaterialImage,
  onPickMaterialPdf,
  onRemoveMaterial,
  onResumeQueue,
  onRetryFailedMaterials,
  onRetryMaterial,
  onSetCustomPromptText,
  onSetSelectedExamType,
  onSetSelectedLanguage,
  onSetSelectedSubject,
  onSetSubjectCategory,
  onSetSubjectSearch,
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
  step,
  studyMaterials,
  subjectCategory,
  subjectSearch,
  theme,
  useTeacherContext,
}: ExamPrepWizardStepContentProps) {
  if (step === 'grade') {
    return (
      <ExamPrepGradeStep
        theme={theme}
        selectedGrade={selectedGrade}
        onSelectGrade={handleSelectGrade}
        onNext={() => onMoveToStep('subject')}
      />
    );
  }

  if (step === 'subject') {
    return (
      <ExamPrepSubjectStep
        theme={theme}
        gradeLabel={gradeLabel}
        selectedSubject={selectedSubject}
        filteredSubjects={filteredSubjects}
        subjectSearch={subjectSearch}
        subjectCategory={subjectCategory}
        onSubjectSearchChange={onSetSubjectSearch}
        onSubjectCategoryChange={onSetSubjectCategory}
        onSelectSubject={onSetSelectedSubject}
        onBack={() => onMoveToStep('grade')}
        onNext={() => onMoveToStep('type')}
      />
    );
  }

  if (step === 'type') {
    return (
      <ExamPrepTypeStep
        theme={theme}
        gradeLabel={gradeLabel}
        selectedSubject={selectedSubject}
        selectedExamType={selectedExamType}
        selectedLanguage={selectedLanguage}
        onSelectExamType={onSetSelectedExamType}
        onSelectLanguage={onSetSelectedLanguage}
        onBack={() => onMoveToStep('subject')}
        onNext={() => onMoveToStep('review')}
      />
    );
  }

  return (
    <ExamPrepReviewSection
      childName={childName}
      contextError={contextError}
      contextLoading={contextLoading}
      contextPreview={contextPreview}
      customPromptText={customPromptText}
      examQuotaLimit={examQuotaLimit}
      examQuotaUsed={examQuotaUsed}
      examQuotaWarning={examQuotaWarning}
      failedMaterialCount={failedMaterialCount}
      gradeLabel={gradeLabel}
      handleStartGeneration={handleStartGeneration}
      hasBlockingMaterialErrors={hasBlockingMaterialErrors}
      isDark={isDark}
      isMaterialPipelineBusy={isMaterialPipelineBusy}
      materialPipelineLabel={materialPipelineLabel}
      onBack={() => onMoveToStep('type')}
      onCancelQueue={onCancelQueue}
      onPickImage={onPickMaterialImage}
      onPickPdf={onPickMaterialPdf}
      onRemoveMaterial={onRemoveMaterial}
      onResumeQueue={onResumeQueue}
      onRetryFailedMaterials={onRetryFailedMaterials}
      onRetryMaterial={onRetryMaterial}
      onSetCustomPromptText={onSetCustomPromptText}
      onSetUseTeacherContext={onSetUseTeacherContext}
      pausedMaterialCount={pausedMaterialCount}
      pdfSplitProgress={pdfSplitProgress}
      readyMaterialSummaries={readyMaterialSummaries}
      selectedExamType={selectedExamType}
      selectedExamTypeLabel={selectedExamTypeLabel}
      selectedGrade={selectedGrade}
      selectedLanguage={selectedLanguage}
      selectedSubject={selectedSubject}
      splitProgressPercent={splitProgressPercent}
      studyMaterials={studyMaterials}
      theme={theme}
      useTeacherContext={useTeacherContext}
    />
  );
}
