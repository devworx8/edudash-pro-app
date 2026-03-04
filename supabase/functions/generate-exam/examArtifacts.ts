import {
  getMinimumQuestionCount,
  normalizeText,
  sanitizeTopic,
} from './examShared.ts';
import type { ExamArtifact, ExamArtifactType, ExamContextSummary, StudyCoachPack } from './examTypes.ts';

export function resolveArtifactType(examType: string): ExamArtifactType {
  const normalized = String(examType || 'practice_test').toLowerCase();
  if (normalized === 'flashcards') return 'flashcards';
  if (normalized === 'revision_notes') return 'revision_notes';
  if (normalized === 'study_guide') return 'study_guide';
  return 'practice_test';
}

export function flattenExamQuestionsForArtifact(exam: any): Array<{
  id: string;
  question: string;
  answer: string;
  explanation: string;
}> {
  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  const out: Array<{ id: string; question: string; answer: string; explanation: string }> = [];

  sections.forEach((section: any, sectionIndex: number) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    questions.forEach((question: any, questionIndex: number) => {
      const id = String(question?.id || `q_${sectionIndex + 1}_${questionIndex + 1}`);
      const questionText = String(question?.question || question?.text || '').trim();
      const answer = String(question?.correctAnswer || question?.answer || '').trim();
      const explanation = String(question?.explanation || '').trim();
      out.push({
        id,
        question: questionText || `Concept ${questionIndex + 1}`,
        answer,
        explanation,
      });
    });
  });

  return out;
}

export function buildArtifactFromExam(params: {
  artifactType: ExamArtifactType;
  exam: any;
  grade: string;
  subject: string;
  contextSummary: ExamContextSummary;
  studyCoachPack: StudyCoachPack;
}): ExamArtifact | null {
  if (params.artifactType === 'practice_test') return null;

  const questions = flattenExamQuestionsForArtifact(params.exam);

  if (params.artifactType === 'flashcards') {
    const cards = questions.slice(0, 40).map((item, index) => ({
      id: item.id || `card_${index + 1}`,
      front: item.question,
      back: item.answer || item.explanation || 'Review this concept with class notes.',
      hint: item.explanation || undefined,
    }));

    return {
      type: 'flashcards',
      flashcards: {
        title: `${params.subject} Flashcards`,
        cards,
      },
    };
  }

  if (params.artifactType === 'revision_notes') {
    const sections = (Array.isArray(params.exam?.sections) ? params.exam.sections : []).map((section: any, sectionIndex: number) => {
      const sectionQuestions = Array.isArray(section?.questions) ? section.questions : [];
      const bullets = sectionQuestions
        .slice(0, 6)
        .map((question: any) => String(question?.explanation || question?.correctAnswer || question?.question || '').trim())
        .filter(Boolean);

      return {
        title: String(section?.title || section?.name || `Topic ${sectionIndex + 1}`),
        bullets: bullets.length > 0 ? bullets : ['Review this topic using classwork and homework examples.'],
      };
    });

    const keyPoints = questions
      .slice(0, 10)
      .map((item) => item.answer || item.explanation || item.question)
      .filter(Boolean);

    return {
      type: 'revision_notes',
      revisionNotes: {
        title: `${params.subject} Revision Notes`,
        keyPoints,
        sections,
      },
    };
  }

  const fallbackChecklist = [
    'Revise key formulas/definitions',
    'Practice at least one timed section daily',
    'Review mistakes from homework and classwork',
    'Sleep early before exam day',
  ];

  const daysFromCoach = Array.isArray(params.studyCoachPack?.days)
    ? params.studyCoachPack.days.map((day) => ({
        day: String(day.day || ''),
        focus: String(day.focus || ''),
        tasks: [
          `Reading: ${day.readingPiece || 'Read topic summary notes.'}`,
          `Paper drill: ${day.paperWritingDrill || 'Write one timed practice section.'}`,
          `Memory: ${day.memoryActivity || 'Summarize core terms from memory.'}`,
          `Parent tip: ${day.parentTip || 'Review progress and ask confidence questions.'}`,
        ],
      }))
    : [];

  const derivedDays = daysFromCoach.length > 0
    ? daysFromCoach
    : ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'].map((dayLabel, index) => {
        const question = questions[index] || questions[0];
        const weakTopic = params.contextSummary.weakTopics[index] || params.contextSummary.focusTopics[index];
        return {
          day: dayLabel,
          focus: weakTopic || `Reinforce ${params.subject} core concepts`,
          tasks: [
            `Practice: ${question?.question || `Complete one ${params.subject} mixed practice set.`}`,
            `Memo check: ${question?.answer || question?.explanation || 'Mark and correct one section.'}`,
            'Review your notes and write a short summary from memory.',
          ],
        };
      });

  return {
    type: 'study_guide',
    studyGuide: {
      title: `${params.subject} Study Guide`,
      days: derivedDays,
      checklist: params.studyCoachPack?.testDayChecklist?.length
        ? params.studyCoachPack.testDayChecklist
        : fallbackChecklist,
    },
  };
}

export function buildSupplementQuestion(
  index: number,
  subject: string,
  topic: string,
): {
  id: string;
  question: string;
  text: string;
  type: string;
  marks: number;
  options?: string[];
  correctAnswer: string;
  explanation: string;
} {
  const slot = index % 4;
  const safeTopic = sanitizeTopic(topic) || `${subject} concept`;

  if (slot === 0) {
    const question = `Which statement best describes ${safeTopic} in ${subject}?`;
    return {
      id: `q_auto_${index + 1}`,
      question,
      text: question,
      type: 'multiple_choice',
      marks: 2,
      options: [
        'A fact that is unrelated to the topic',
        'A concept explained with correct vocabulary and context',
        'A random guess with no evidence',
        'A misconception from another topic',
      ],
      correctAnswer: 'B',
      explanation: `The best answer uses correct subject terminology and applies it directly to ${safeTopic}.`,
    };
  }

  if (slot === 1) {
    const question = `${safeTopic} is always applied without checking context.`;
    return {
      id: `q_auto_${index + 1}`,
      question,
      text: question,
      type: 'true_false',
      marks: 2,
      options: ['True', 'False'],
      correctAnswer: 'False',
      explanation: `In ${subject}, learners must apply ${safeTopic} using context and reasoned steps.`,
    };
  }

  if (slot === 2) {
    const question = `Fill in the blank: A key idea in ${safeTopic} is ________.`;
    return {
      id: `q_auto_${index + 1}`,
      question,
      text: question,
      type: 'fill_in_blank',
      marks: 2,
      correctAnswer: `${safeTopic}`,
      explanation: `A valid answer identifies a core concept related to ${safeTopic} using grade-appropriate language.`,
    };
  }

  const question = `Write a short response showing how ${safeTopic} can be used to solve a problem in ${subject}.`;
  return {
    id: `q_auto_${index + 1}`,
    question,
    text: question,
    type: 'short_answer',
    marks: 3,
    correctAnswer: `A complete answer should define ${safeTopic}, apply it correctly, and justify the result with one clear example.`,
    explanation: `Use one definition, one correct example, and one reason why the method works.`,
  };
}

export function recalculateExamMarks(exam: any) {
  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  let totalMarks = 0;

  sections.forEach((section: any) => {
    const sectionQuestions = Array.isArray(section?.questions) ? section.questions : [];
    const sectionMarks = sectionQuestions.reduce((sum: number, question: any) => {
      const marks = Number(question?.marks ?? question?.points ?? 1);
      return sum + (Number.isFinite(marks) ? Math.max(1, marks) : 1);
    }, 0);

    section.totalMarks = sectionMarks;
    totalMarks += sectionMarks;
  });

  exam.totalMarks = totalMarks;
  return exam;
}

export function ensureMinimumQuestionCoverage(
  exam: any,
  payload: {
    grade: string;
    subject: string;
    examType: string;
    contextSummary: ExamContextSummary;
    minQuestionCount?: number;
  },
) {
  const minQuestions = Number.isFinite(Number(payload.minQuestionCount))
    ? Math.max(1, Number(payload.minQuestionCount))
    : getMinimumQuestionCount(payload.grade, payload.examType);
  const sections = Array.isArray(exam?.sections)
    ? exam.sections.filter((section: any) => section && Array.isArray(section.questions))
    : [];

  if (sections.length === 0) return exam;

  const currentQuestionCount = sections.reduce(
    (sum: number, section: any) => sum + section.questions.length,
    0,
  );

  if (currentQuestionCount >= minQuestions) {
    return recalculateExamMarks(exam);
  }

  const needed = minQuestions - currentQuestionCount;
  const topics = [
    ...payload.contextSummary.weakTopics,
    ...payload.contextSummary.focusTopics,
    `${payload.subject} fundamentals`,
    `${payload.subject} applications`,
    `${payload.subject} problem solving`,
  ].filter((topic) => sanitizeTopic(topic));

  const topicPool = topics.length > 0 ? topics : [payload.subject];

  let supplementSection = sections.find((section: any) =>
    normalizeText(String(section?.name || section?.title || '')).includes('extended practice'),
  );

  if (!supplementSection) {
    supplementSection = {
      id: `section_${sections.length + 1}`,
      name: 'Section C: Extended Practice',
      title: 'Section C: Extended Practice',
      questions: [],
      totalMarks: 0,
    };
    sections.push(supplementSection);
    exam.sections = sections;
  }

  for (let i = 0; i < needed; i += 1) {
    const topic = String(topicPool[i % topicPool.length] || payload.subject);
    supplementSection.questions.push(
      buildSupplementQuestion(currentQuestionCount + i, payload.subject, topic),
    );
  }

  return recalculateExamMarks(exam);
}

export function countQuestions(exam: any): number {
  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  return sections.reduce(
    (sum: number, section: any) => sum + (Array.isArray(section?.questions) ? section.questions.length : 0),
    0,
  );
}

export function enforceQuestionUpperBound(exam: any, maxQuestions: number) {
  if (!Number.isFinite(maxQuestions) || maxQuestions <= 0) return exam;
  let remaining = countQuestions(exam) - maxQuestions;
  if (remaining <= 0) return exam;

  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  for (let i = sections.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const questions = Array.isArray(sections[i]?.questions) ? sections[i].questions : [];
    if (questions.length === 0) continue;

    const cutCount = Math.min(remaining, Math.max(0, questions.length - 1));
    if (cutCount > 0) {
      sections[i].questions = questions.slice(0, questions.length - cutCount);
      remaining -= cutCount;
    }
  }

  if (remaining > 0) {
    for (let i = sections.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const questions = Array.isArray(sections[i]?.questions) ? sections[i].questions : [];
      if (questions.length === 0) continue;
      const cutCount = Math.min(remaining, questions.length);
      sections[i].questions = questions.slice(0, Math.max(0, questions.length - cutCount));
      remaining -= cutCount;
    }
  }

  return recalculateExamMarks(exam);
}
