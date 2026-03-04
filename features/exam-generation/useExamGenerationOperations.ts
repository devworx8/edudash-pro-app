import { useCallback } from 'react';
import { exportExamToPdf } from '@/lib/exam-prep/exportExamPdf';
import type { ParsedExam } from '@/lib/examParser';
import type { ExamArtifactType } from '@/components/exam-prep/types';
import type {
  ExamGenerationControllerSetters,
  UseExamGenerationControllerParams,
} from '@/features/exam-generation/controllerTypes';
import {
  runGenerateExam,
  runLoadSavedExam,
} from '@/features/exam-generation/examGenerationOperationHandlers';

type UseExamGenerationOperationsParams = {
  artifactType: ExamArtifactType;
  customPrompt: string;
  exam: ParsedExam | null;
  params: UseExamGenerationControllerParams;
  setters: ExamGenerationControllerSetters;
};

export function useExamGenerationOperations({
  artifactType,
  customPrompt,
  exam,
  params,
  setters,
}: UseExamGenerationOperationsParams) {
  const { childName, savedExamId } = params;

  const generateExam = useCallback(async () => {
    await runGenerateExam({
      customPrompt,
      params,
      setters,
    });
  }, [customPrompt, params, setters]);

  const loadSavedExam = useCallback(async () => {
    await runLoadSavedExam({
      savedExamId,
      setters,
    });
  }, [savedExamId, setters]);

  const handleExportPdf = useCallback(async () => {
    if (!exam || artifactType !== 'practice_test') return;
    setters.setPdfExporting(true);
    setters.setPdfExportNotice(null);
    try {
      const result = await exportExamToPdf({
        exam,
        childName,
        generatedAt: new Date(),
      });
      if (!result.ok) {
        setters.setPdfExportNotice(result.message || 'Could not export exam PDF right now.');
        return;
      }
      setters.setPdfExportNotice('PDF ready. You can now review or share it.');
    } finally {
      setters.setPdfExporting(false);
    }
  }, [artifactType, childName, exam, setters]);

  return {
    generateExam,
    handleExportPdf,
    loadSavedExam,
  };
}

