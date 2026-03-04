/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { GenerationStatusChip } from '@/components/exam-prep/GenerationStatusChip';
import { ExamInteractiveView, type ExamResults } from '@/components/exam-prep/ExamInteractiveView';
import { ExamFlashcardsView } from '@/components/exam-prep/ExamFlashcardsView';
import { ExamRevisionNotesView } from '@/components/exam-prep/ExamRevisionNotesView';
import { ExamStudyGuideView } from '@/components/exam-prep/ExamStudyGuideView';
import { ExamGenerationAuditCard } from '@/features/exam-generation/ExamGenerationAuditCard';
import { ExamStudyCoachCard } from '@/features/exam-generation/ExamStudyCoachCard';
import { ModelProfileBadge } from '@/features/exam-generation/ModelProfileBadge';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type {
  ExamArtifact,
  ExamBlueprintAudit,
  ExamContextSummary,
  ExamGenerationResponse,
  ExamScopeDiagnostics,
  ExamStudyCoachPack,
  ExamTeacherAlignmentSummary,
} from '@/components/exam-prep/types';
import type { ParsedExam } from '@/lib/examParser';
import { examGenerationStyles as styles } from '@/features/exam-generation/styles';

type ReadyContentProps = {
  artifact: ExamArtifact | null;
  blueprintAudit: ExamBlueprintAudit | null;
  completionSummary: string | null;
  contextSummary: ExamContextSummary | null;
  exam: ParsedExam | null;
  examId: string;
  examLanguage: string;
  generationMode: 'ai' | 'outage_fallback';
  handleComplete: (results: ExamResults) => void;
  hasGenerationWarning: boolean;
  isPracticeArtifact: boolean;
  modelProfile: ExamGenerationResponse['modelProfile'] | null;
  modelUsed: string | null;
  pdfExportNotice: string | null;
  pdfExporting: boolean;
  persistenceWarning: string | null;
  qualityReport: ExamGenerationResponse['qualityReport'] | null;
  retakeMode: boolean;
  scopeDiagnostics: ExamScopeDiagnostics | null;
  showAudit: boolean;
  showGenerationStatus: boolean;
  studyCoachPack: ExamStudyCoachPack | null;
  studentId?: string;
  classId?: string;
  schoolId?: string;
  teacherAlignment: ExamTeacherAlignmentSummary | null;
  theme: ThemeColors;
  usesUploadedMaterial: boolean;
  setShowAudit: (value: boolean | ((prev: boolean) => boolean)) => void;
  setShowGenerationStatus: (value: boolean | ((prev: boolean) => boolean)) => void;
  onExportPdf: () => void;
  onBack: () => void;
};

export function ExamGenerationReadyContent({
  artifact,
  blueprintAudit,
  classId,
  completionSummary,
  contextSummary,
  exam,
  examId,
  examLanguage,
  generationMode,
  handleComplete,
  hasGenerationWarning,
  isPracticeArtifact,
  modelProfile,
  modelUsed,
  onBack,
  onExportPdf,
  pdfExportNotice,
  pdfExporting,
  persistenceWarning,
  qualityReport,
  retakeMode,
  schoolId,
  scopeDiagnostics,
  setShowAudit,
  setShowGenerationStatus,
  showAudit,
  showGenerationStatus,
  studentId,
  studyCoachPack,
  teacherAlignment,
  theme,
  usesUploadedMaterial,
}: ReadyContentProps) {
  const { width } = useWindowDimensions();
  const compactLayout = width < 520;

  const canShowAuditToggle =
    Boolean(contextSummary || teacherAlignment || blueprintAudit || studyCoachPack) &&
    (isPracticeArtifact ? Boolean(completionSummary) : true);

  return (
    <View style={styles.readyContent}>
      {(hasGenerationWarning || usesUploadedMaterial) && (
        <GenerationStatusChip
          theme={theme}
          hasGenerationWarning={hasGenerationWarning}
          showDetails={showGenerationStatus}
          onToggle={() => setShowGenerationStatus((prev) => !prev)}
          persistenceWarning={persistenceWarning}
          usesUploadedMaterial={usesUploadedMaterial}
          generationMode={generationMode}
          qualityRepaired={Boolean(qualityReport?.repaired)}
          compact={compactLayout}
        />
      )}

      <ModelProfileBadge
        compact={compactLayout}
        modelProfile={modelProfile}
        modelUsed={modelUsed}
        theme={theme}
      />

      {isPracticeArtifact && completionSummary && (
        <View
          style={[
            styles.completionBanner,
            compactLayout && styles.completionBannerCompact,
            { borderColor: `${theme.success}55`, backgroundColor: `${theme.success}18` },
          ]}
        >
          <View style={styles.completionBannerLeft}>
            <Ionicons name="checkmark-circle" size={18} color={theme.success} />
            <Text style={[styles.completionText, { color: theme.success }]}>
              Exam submitted. {completionSummary}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.doneButton, compactLayout && styles.doneButtonCompact, { borderColor: theme.success }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.doneButtonText, { color: theme.success }]}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {isPracticeArtifact && exam && (
        <View
          style={[
            styles.exportRow,
            compactLayout && styles.exportRowCompact,
            { borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.exportButton,
              {
                borderColor: theme.primary,
                backgroundColor: `${theme.primary}18`,
                opacity: pdfExporting ? 0.7 : 1,
              },
            ]}
            onPress={onExportPdf}
            disabled={pdfExporting}
          >
            <Ionicons
              name={pdfExporting ? 'sync-outline' : 'download-outline'}
              size={16}
              color={theme.primary}
            />
            <Text style={[styles.exportButtonText, { color: theme.primary }]}>
              {pdfExporting ? 'Exporting PDF...' : 'Export Exam to PDF'}
            </Text>
          </TouchableOpacity>
          {pdfExportNotice ? (
            <Text
              style={[
                styles.exportNotice,
                compactLayout && styles.exportNoticeCompact,
                { color: theme.muted },
              ]}
            >
              {pdfExportNotice}
            </Text>
          ) : null}
        </View>
      )}

      {canShowAuditToggle && (
        <View style={[styles.auditToggleRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={styles.auditToggleButton}
            onPress={() => setShowAudit((prev) => !prev)}
            activeOpacity={0.85}
          >
            <View style={styles.auditToggleLeft}>
              <Ionicons
                name={showAudit ? 'chevron-down' : 'information-circle-outline'}
                size={16}
                color={theme.primary}
              />
              <Text style={[styles.auditToggleLabel, { color: theme.text }]}>
                {showAudit ? 'Hide exam summary' : 'Show exam summary & study coach'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {showAudit ? (
        <>
          <ExamGenerationAuditCard
            blueprintAudit={blueprintAudit}
            contextSummary={contextSummary}
            scopeDiagnostics={scopeDiagnostics}
            teacherAlignment={teacherAlignment}
            theme={theme}
          />
          <ExamStudyCoachCard studyCoachPack={studyCoachPack} theme={theme} />
        </>
      ) : null}

      <View style={styles.examViewWrap}>
        {isPracticeArtifact && exam ? (
          <ExamInteractiveView
            exam={exam}
            examId={examId}
            examLanguage={examLanguage}
            studentId={studentId}
            classId={classId}
            schoolId={schoolId}
            retakeMode={retakeMode}
            onComplete={handleComplete}
            onExit={onBack}
          />
        ) : artifact?.type === 'flashcards' ? (
          <ExamFlashcardsView artifact={artifact.flashcards} theme={theme} />
        ) : artifact?.type === 'revision_notes' ? (
          <ExamRevisionNotesView artifact={artifact.revisionNotes} theme={theme} />
        ) : artifact?.type === 'study_guide' ? (
          <ExamStudyGuideView artifact={artifact.studyGuide} theme={theme} />
        ) : (
          <View style={styles.centerBlock}>
            <Text style={[styles.errorText, { color: theme.muted }]}>No study artifact to display.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
