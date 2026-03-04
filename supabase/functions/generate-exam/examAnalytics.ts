import {
  getQuestionCountPolicy,
  normalizeQuestionType,
  normalizeText,
} from './examShared.ts';
import { countQuestions } from './examArtifacts.ts';
import type {
  ExamBlueprintAudit,
  ExamContextSummary,
  ExamTeacherAlignmentSummary,
  StudyCoachDayPlan,
  StudyCoachPack,
} from './examTypes.ts';
import { resolveLanguageName } from './examLanguage.ts';

export function computeBlueprintAudit(exam: any, grade: string, examType: string): ExamBlueprintAudit {
  const policy = getQuestionCountPolicy(grade, examType);
  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  let objectiveMarks = 0;
  let shortMarks = 0;
  let extendedMarks = 0;

  sections.forEach((section: any) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    questions.forEach((question: any) => {
      const marks = Number(question?.marks ?? 1);
      const safeMarks = Number.isFinite(marks) ? Math.max(1, marks) : 1;
      const type = normalizeQuestionType(question?.type);
      if (type === 'multiple_choice' || type === 'true_false' || type === 'fill_in_blank') {
        objectiveMarks += safeMarks;
      } else if (type === 'short_answer') {
        shortMarks += safeMarks;
      } else {
        extendedMarks += safeMarks;
      }
    });
  });

  const totalMarks = Number(exam?.totalMarks || objectiveMarks + shortMarks + extendedMarks || 1);
  const actualQuestions = countQuestions(exam);
  const denominator = totalMarks > 0 ? totalMarks : 1;

  return {
    minQuestions: policy.min,
    maxQuestions: policy.max,
    actualQuestions,
    totalMarks,
    objectiveMarks,
    shortMarks,
    extendedMarks,
    objectiveRatio: Number((objectiveMarks / denominator).toFixed(3)),
    shortRatio: Number((shortMarks / denominator).toFixed(3)),
    extendedRatio: Number((extendedMarks / denominator).toFixed(3)),
  };
}

export function computeTeacherAlignmentSummary(contextSummary: ExamContextSummary): ExamTeacherAlignmentSummary {
  const intentTaggedCount = Number(contextSummary.intentTaggedCount || 0);
  const taughtSignals = contextSummary.assignmentCount + contextSummary.lessonCount + intentTaggedCount;
  const weakSignals = contextSummary.weakTopics.length;
  const coverageScore = Math.max(
    0,
    Math.min(100, Math.round((taughtSignals / Math.max(1, taughtSignals + weakSignals)) * 100)),
  );

  return {
    assignmentCount: contextSummary.assignmentCount,
    lessonCount: contextSummary.lessonCount,
    intentTaggedCount,
    coverageScore,
  };
}

export function buildStudyCoachPack(
  grade: string,
  subject: string,
  language: string,
  contextSummary: ExamContextSummary,
): StudyCoachPack {
  const focus = contextSummary.focusTopics.length > 0
    ? contextSummary.focusTopics
    : [`${subject} foundations`, `${subject} problem solving`, `${subject} vocabulary`];

  const days: StudyCoachDayPlan[] = [
    {
      day: 'Day 1',
      focus: `Understand core concepts: ${focus[0] || subject}`,
      readingPiece: `Read a short ${subject} passage and underline 5 key words. Summarize it in 5 sentences in ${resolveLanguageName(language)}.`,
      paperWritingDrill: 'Write definitions by hand, then explain one example in your own words.',
      memoryActivity: 'Use 10-minute active recall: close notes and write everything remembered.',
      parentTip: 'Ask the learner to teach you the concept in 2 minutes.',
    },
    {
      day: 'Day 2',
      focus: `Practice with guided questions: ${focus[1] || subject}`,
      readingPiece: 'Read one worked example slowly and identify each solving step.',
      paperWritingDrill: 'Do 8 mixed questions on paper with full working.',
      memoryActivity: 'Create 6 flash cards and self-test twice (morning/evening).',
      parentTip: 'Check if steps are written clearly, not only final answers.',
    },
    {
      day: 'Day 3',
      focus: `Fix weak areas: ${contextSummary.weakTopics[0] || focus[2] || subject}`,
      readingPiece: 'Read a short explanatory text and answer 4 comprehension prompts.',
      paperWritingDrill: 'Write one paragraph explaining a common mistake and how to avoid it.',
      memoryActivity: 'Spaced recall block: 5-5-5 minute review (now, later, before sleep).',
      parentTip: 'Encourage corrections in a different pen color to build reflection.',
    },
    {
      day: 'Day 4',
      focus: 'Timed exam rehearsal',
      readingPiece: 'Skim instructions first, then read questions in order of confidence.',
      paperWritingDrill: 'Complete a timed mini paper and mark with memo hints.',
      memoryActivity: 'Rapid retrieval: list formulas/keywords without notes in 3 minutes.',
      parentTip: 'Simulate a calm test environment with no interruptions.',
    },
  ];

  return {
    mode: 'guided_first',
    planTitle: `${grade} ${subject} - 4 Day Study Coach + Test Day`,
    days,
    testDayChecklist: [
      'Sleep early and review only summary notes.',
      'Start with easiest section to build confidence.',
      'Show full working and label answers clearly.',
      'Leave 10 minutes to review skipped or uncertain questions.',
    ],
  };
}

export function augmentQuestionVisuals(exam: any, visualMode: 'off' | 'hybrid') {
  if (visualMode !== 'hybrid') return exam;
  const sections = Array.isArray(exam?.sections) ? exam.sections : [];

  sections.forEach((section: any) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    questions.forEach((question: any) => {
      const text = normalizeText(question?.question || question?.text || '');
      if (!text) return;

      if (question?.visual) return;
      if (!(text.includes('diagram') || text.includes('graph') || text.includes('chart') || text.includes('table'))) {
        return;
      }

      question.visual = {
        mode: 'diagram',
        altText: `Supporting visual for question: ${String(question.question || '').slice(0, 90)}`,
        diagramSpec: {
          type: 'flow',
          title: 'Concept Flow',
          nodes: ['Input', 'Process', 'Output'],
          edges: [
            { from: 'Input', to: 'Process' },
            { from: 'Process', to: 'Output' },
          ],
        },
      };
    });
  });

  return exam;
}
