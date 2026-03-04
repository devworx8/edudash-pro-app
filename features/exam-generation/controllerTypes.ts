import type { Dispatch, SetStateAction } from 'react';
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

export type GenerationState = 'loading' | 'error' | 'ready';

export type UseExamGenerationControllerParams = {
  grade?: string;
  subject?: string;
  examType: string;
  language: string;
  studentId?: string;
  classId?: string;
  schoolId?: string;
  childName?: string;
  useTeacherContext: boolean;
  fallbackPolicy: string;
  qualityMode: string;
  draftId?: string;
  savedExamId?: string;
  loadSaved: boolean;
};

export type ExamGenerationControllerSetters = {
  setArtifact: Dispatch<SetStateAction<ExamArtifact | null>>;
  setArtifactType: Dispatch<SetStateAction<ExamArtifactType>>;
  setBlueprintAudit: Dispatch<SetStateAction<ExamBlueprintAudit | null>>;
  setContextSummary: Dispatch<SetStateAction<ExamContextSummary | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setExam: Dispatch<SetStateAction<ParsedExam | null>>;
  setExamId: Dispatch<SetStateAction<string>>;
  setGenerationMode: Dispatch<SetStateAction<'ai' | 'outage_fallback'>>;
  setModelProfile: Dispatch<SetStateAction<ExamGenerationResponse['modelProfile'] | null>>;
  setModelUsed: Dispatch<SetStateAction<string | null>>;
  setPdfExportNotice: Dispatch<SetStateAction<string | null>>;
  setPdfExporting: Dispatch<SetStateAction<boolean>>;
  setPersistenceWarning: Dispatch<SetStateAction<string | null>>;
  setQualityReport: Dispatch<SetStateAction<ExamGenerationResponse['qualityReport'] | null>>;
  setScopeDiagnostics: Dispatch<SetStateAction<ExamScopeDiagnostics | null>>;
  setShowGenerationStatus: Dispatch<SetStateAction<boolean>>;
  setState: Dispatch<SetStateAction<GenerationState>>;
  setStudyCoachPack: Dispatch<SetStateAction<ExamStudyCoachPack | null>>;
  setTeacherAlignment: Dispatch<SetStateAction<ExamTeacherAlignmentSummary | null>>;
};

