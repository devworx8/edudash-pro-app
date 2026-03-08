import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { consumeExamGenerationDraft } from '@/lib/exam-prep/generationDraftStore';
import type { ParsedExam } from '@/lib/examParser';
import type {
  ExamArtifact,
  ExamArtifactType,
  ExamBlueprintAudit,
  ExamContextSummary,
  ExamGenerationResponse,
  ExamScopeDiagnostics,
  ExamStudyCoachPack,
  ExamTeacherAlignmentSummary,
} from '@/components/exam-prep/types';
import type {
  GenerationState,
  UseExamGenerationControllerParams,
} from '@/features/exam-generation/controllerTypes';
import { useExamGenerationOperations } from '@/features/exam-generation/useExamGenerationOperations';
import { useExamQuotaStatus } from '@/features/exam-generation/useExamQuotaStatus';

export type { GenerationState, UseExamGenerationControllerParams };

export function useExamGenerationController(params: UseExamGenerationControllerParams) {
  const {
    grade,
    subject,
    allowOverQuota,
    draftId,
    loadSaved,
    savedExamId,
    useTeacherContext,
  } = params;

  const [generationDraft] = useState(() => consumeExamGenerationDraft(draftId));
  const customPrompt = generationDraft?.customPrompt?.trim() || '';
  const usesUploadedMaterial = useMemo(
    () =>
      Boolean(
        customPrompt &&
          (customPrompt.includes('Study material extracted') ||
            customPrompt.includes('uploaded images') ||
            customPrompt.includes('uploaded material') ||
            customPrompt.includes('Study Notes')),
      ),
    [customPrompt],
  );

  const [state, setState] = useState<GenerationState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<ParsedExam | null>(null);
  const [artifactType, setArtifactType] = useState<ExamArtifactType>('practice_test');
  const [artifact, setArtifact] = useState<ExamArtifact | null>(null);
  const [examId, setExamId] = useState('');
  const [contextSummary, setContextSummary] = useState<ExamContextSummary | null>(null);
  const [scopeDiagnostics, setScopeDiagnostics] = useState<ExamScopeDiagnostics | null>(null);
  const [teacherAlignment, setTeacherAlignment] = useState<ExamTeacherAlignmentSummary | null>(null);
  const [blueprintAudit, setBlueprintAudit] = useState<ExamBlueprintAudit | null>(null);
  const [studyCoachPack, setStudyCoachPack] = useState<ExamStudyCoachPack | null>(null);
  const [generationMode, setGenerationMode] = useState<'ai' | 'outage_fallback'>('ai');
  const [qualityReport, setQualityReport] = useState<ExamGenerationResponse['qualityReport'] | null>(
    null,
  );
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [modelProfile, setModelProfile] = useState<ExamGenerationResponse['modelProfile'] | null>(
    null,
  );
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [completionSummary, setCompletionSummary] = useState<string | null>(null);
  const [showGenerationStatus, setShowGenerationStatus] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfExportNotice, setPdfExportNotice] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const hasTriggeredGenerationRef = useRef(false);

  const { examQuotaLimit, examQuotaUsed, examQuotaWarning } = useExamQuotaStatus();

  const operationSetters = useMemo(
    () => ({
      setArtifact,
      setArtifactType,
      setBlueprintAudit,
      setContextSummary,
      setError,
      setExam,
      setExamId,
      setGenerationMode,
      setModelProfile,
      setModelUsed,
      setPdfExportNotice,
      setPdfExporting,
      setPersistenceWarning,
      setQualityReport,
      setScopeDiagnostics,
      setShowGenerationStatus,
      setState,
      setStudyCoachPack,
      setTeacherAlignment,
    }),
    [],
  );

  const { generateExam, handleExportPdf, loadSavedExam } = useExamGenerationOperations({
    artifactType,
    customPrompt,
    exam,
    params,
    setters: operationSetters,
  });

  const isPracticeArtifact = artifactType === 'practice_test';
  const hasGenerationWarning = useMemo(
    () =>
      Boolean(
        (persistenceWarning && persistenceWarning.trim().length > 0) ||
          generationMode === 'outage_fallback' ||
          qualityReport?.repaired,
      ),
    [persistenceWarning, generationMode, qualityReport],
  );

  const generationLabel = useMemo(() => {
    if (!grade || !subject) return 'Preparing generation request...';
    return `Generating ${grade.replace('grade_', 'Grade ')} ${subject}`;
  }, [grade, subject]);
  const isQuotaExhausted = examQuotaLimit > 0 && examQuotaUsed >= examQuotaLimit;

  useEffect(() => {
    if (hasTriggeredGenerationRef.current) return;

    if (loadSaved && savedExamId) {
      hasTriggeredGenerationRef.current = true;
      loadSavedExam();
      return;
    }
    if (isQuotaExhausted && !allowOverQuota) {
      hasTriggeredGenerationRef.current = true;
      setState('error');
      setError('Monthly exam quota exhausted. Upgrade your plan, or continue anyway from Exam Prep.');
      return;
    }
    hasTriggeredGenerationRef.current = true;
    generateExam();
  }, [allowOverQuota, generateExam, isQuotaExhausted, loadSaved, loadSavedExam, savedExamId]);

  const handleComplete = useCallback(
    (results: { percentage: number; earnedMarks: number; totalMarks: number }) => {
      setCompletionSummary(`Score: ${results.percentage}% (${results.earnedMarks}/${results.totalMarks})`);
    },
    [],
  );

  const readyWithPayload =
    state === 'ready' &&
    ((isPracticeArtifact && Boolean(exam)) || (!isPracticeArtifact && Boolean(artifact)));

  return {
    artifact,
    artifactType,
    blueprintAudit,
    completionSummary,
    contextSummary,
    error,
    exam,
    examId,
    examQuotaLimit,
    examQuotaUsed,
    examQuotaWarning,
    generateExam,
    generationLabel,
    generationMode,
    handleComplete,
    handleExportPdf,
    hasGenerationWarning,
    isQuotaExhausted,
    isPracticeArtifact,
    loadSavedExam,
    modelProfile,
    modelUsed,
    pdfExportNotice,
    pdfExporting,
    persistenceWarning,
    qualityReport,
    readyWithPayload,
    scopeDiagnostics,
    setShowAudit,
    setShowGenerationStatus,
    showAudit,
    showGenerationStatus,
    state,
    studyCoachPack,
    teacherAlignment,
    useTeacherContext,
    usesUploadedMaterial,
  };
}
