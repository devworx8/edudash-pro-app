import type { SouthAfricanLanguage } from '@/components/exam-prep/types/languageAndGrades';

export interface ExamContextSummary {
  assignmentCount: number;
  lessonCount: number;
  focusTopics: string[];
  weakTopics: string[];
  sourceAssignmentIds?: string[];
  sourceLessonIds?: string[];
}

export interface ExamTeacherAlignmentSummary {
  assignmentCount: number;
  lessonCount: number;
  intentTaggedCount: number;
  coverageScore: number;
}

export interface ExamBlueprintAudit {
  minQuestions: number;
  maxQuestions: number;
  actualQuestions: number;
  totalMarks: number;
  objectiveMarks: number;
  shortMarks: number;
  extendedMarks: number;
  objectiveRatio: number;
  shortRatio: number;
  extendedRatio: number;
}

export interface StudyCoachDayPlan {
  day: string;
  focus: string;
  readingPiece: string;
  paperWritingDrill: string;
  memoryActivity: string;
  parentTip: string;
}

export interface ExamStudyCoachPack {
  mode: 'guided_first';
  planTitle: string;
  days: StudyCoachDayPlan[];
  testDayChecklist: string[];
}

export type ExamArtifactType = 'practice_test' | 'flashcards' | 'revision_notes' | 'study_guide';
export type ExamFallbackPolicy = 'provider_outage_only' | 'always' | 'never';
export type ExamQualityMode = 'strict' | 'standard';

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  hint?: string;
}

export interface FlashcardsArtifact {
  title: string;
  cards: FlashcardItem[];
}

export interface RevisionNotesSection {
  title: string;
  bullets: string[];
}

export interface RevisionNotesArtifact {
  title: string;
  keyPoints: string[];
  sections: RevisionNotesSection[];
}

export interface StudyGuideDay {
  day: string;
  focus: string;
  tasks: string[];
}

export interface StudyGuideArtifact {
  title: string;
  days: StudyGuideDay[];
  checklist: string[];
}

export type ExamArtifact =
  | { type: 'flashcards'; flashcards: FlashcardsArtifact }
  | { type: 'revision_notes'; revisionNotes: RevisionNotesArtifact }
  | { type: 'study_guide'; studyGuide: StudyGuideArtifact };

export interface ExamScopeDiagnostics {
  requestedStudentId: string | null;
  requestedClassId: string | null;
  requestedSchoolId: string | null;
  effectiveStudentId: string | null;
  effectiveClassId: string | null;
  effectiveSchoolId: string | null;
  useTeacherContext: boolean;
}

export interface ExamPrepConfig {
  grade: string;
  subject: string;
  examType: string;
  language: SouthAfricanLanguage;
  customPrompt?: string;
  enableInteractive?: boolean;
  /** CAPS term (1–4) to scope content to a specific school term */
  term?: 1 | 2 | 3 | 4;
  /** Specific topics to focus on within the subject */
  topics?: string[];
  contextSummary?: ExamContextSummary | null;
  useTeacherContext?: boolean;
  studentId?: string;
  classId?: string;
  schoolId?: string;
  lookbackDays?: number;
}

export interface ExamGenerationRequest {
  grade: string;
  subject: string;
  examType: string;
  customPrompt?: string;
  language?: SouthAfricanLanguage;
  fallbackPolicy?: ExamFallbackPolicy;
  qualityMode?: ExamQualityMode;
  studentId?: string;
  classId?: string;
  schoolId?: string;
  useTeacherContext?: boolean;
  lookbackDays?: number;
  previewContext?: boolean;
  examIntentMode?: 'teacher_weighted' | 'caps_only';
  fullPaperMode?: boolean;
  visualMode?: 'off' | 'hybrid';
  guidedMode?: 'guided_first' | 'memo_first';
}

export interface ExamGenerationResponse {
  success: boolean;
  examId: string;
  exam?: unknown;
  artifactType?: ExamArtifactType;
  artifact?: ExamArtifact;
  modelUsed?: string;
  modelProfile?: {
    code: 'starter_premium' | 'starter_standard' | 'default' | 'fallback';
    label: string;
    colorKey: 'success' | 'info' | 'warning';
    usage?: {
      used: number;
      limit: number;
      remaining: number;
    };
  };
  generationMode?: 'ai' | 'outage_fallback';
  qualityReport?: {
    passed: boolean;
    issues: string[];
    repaired: boolean;
  };
  retryable?: boolean;
  scopeDiagnostics?: ExamScopeDiagnostics;
  contextSummary?: ExamContextSummary;
  teacherAlignment?: ExamTeacherAlignmentSummary;
  examBlueprintAudit?: ExamBlueprintAudit;
  studyCoachPack?: ExamStudyCoachPack;
  persistenceWarning?: string;
  error?: string;
}

export interface GeneratedExam {
  id: string;
  config: ExamPrepConfig;
  content: string;
  generatedAt: Date;
  userId?: string;
}
