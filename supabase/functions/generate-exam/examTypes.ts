export type ExamContextSummary = {
  assignmentCount: number;
  lessonCount: number;
  focusTopics: string[];
  weakTopics: string[];
  sourceAssignmentIds: string[];
  sourceLessonIds: string[];
  intentTaggedCount?: number;
};

export type ExamTeacherAlignmentSummary = {
  assignmentCount: number;
  lessonCount: number;
  intentTaggedCount: number;
  coverageScore: number;
};

export type ExamBlueprintAudit = {
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
};

export type StudyCoachDayPlan = {
  day: string;
  focus: string;
  readingPiece: string;
  paperWritingDrill: string;
  memoryActivity: string;
  parentTip: string;
};

export type StudyCoachPack = {
  mode: 'guided_first';
  planTitle: string;
  days: StudyCoachDayPlan[];
  testDayChecklist: string[];
};

export type ExamArtifactType = 'practice_test' | 'flashcards' | 'revision_notes' | 'study_guide';

type FlashcardItem = {
  id: string;
  front: string;
  back: string;
  hint?: string;
};

type FlashcardsArtifact = {
  title: string;
  cards: FlashcardItem[];
};

type RevisionNotesSection = {
  title: string;
  bullets: string[];
};

type RevisionNotesArtifact = {
  title: string;
  keyPoints: string[];
  sections: RevisionNotesSection[];
};

type StudyGuideArtifact = {
  title: string;
  days: Array<{ day: string; focus: string; tasks: string[] }>;
  checklist: string[];
};

export type ExamArtifact =
  | { type: 'flashcards'; flashcards: FlashcardsArtifact }
  | { type: 'revision_notes'; revisionNotes: RevisionNotesArtifact }
  | { type: 'study_guide'; studyGuide: StudyGuideArtifact };
