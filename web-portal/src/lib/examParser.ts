/**
 * Web exam parser
 *
 * Normalizes generated exam payloads from JSON/markdown into a stable shape for
 * interactive exam components and grading helpers.
 */

export interface ExamQuestion {
  id: string;
  type: 'multiple_choice' | 'short_answer' | 'essay' | 'numeric' | 'true_false' | 'fill_blank';
  text: string;
  question?: string;
  marks: number;
  options?: string[];
  correctAnswer?: string | number;
  sectionTitle?: string;
  explanation?: string;
  rubric?: string;
  topic?: string;
  visual?: {
    mode: 'diagram' | 'image';
    altText?: string;
    imageUrl?: string;
    diagramSpec?: Record<string, unknown>;
  };
  diagram?: {
    type: 'chart' | 'mermaid' | 'svg' | 'image';
    data: unknown;
    title?: string;
    caption?: string;
  };
}

export interface ParsedExam {
  title: string;
  grade?: string;
  subject?: string;
  duration?: string;
  schoolName?: string;
  instructions: string[];
  sections: {
    id: string;
    title: string;
    instructions?: string;
    readingPassage?: string;
    questions: ExamQuestion[];
    totalMarks: number;
  }[];
  totalMarks: number;
  hasMemo: boolean;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^(?:\s*[a-d]\s*[\.\)\-:]\s*)+/i, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuestionType(value: unknown): ExamQuestion['type'] {
  const raw = String(value || 'short_answer').toLowerCase();
  if (raw.includes('multiple')) return 'multiple_choice';
  if (raw.includes('true') || raw.includes('false')) return 'true_false';
  if (raw === 'fill_in_blank' || raw === 'fill_blank' || raw === 'fillblank') return 'fill_blank';
  if (raw.includes('essay') || raw.includes('extended')) return 'essay';
  if (raw.includes('numeric') || raw.includes('calculation')) return 'numeric';
  return 'short_answer';
}

function sanitizeOption(value: unknown): string {
  return String(value || '')
    .replace(/^(?:\s*[A-D]\s*[\.\)\-:]\s*)+/i, '')
    .trim();
}

function normalizeDiagramFromVisual(visual: unknown): ExamQuestion['diagram'] | undefined {
  if (!visual || typeof visual !== 'object') return undefined;
  const record = visual as Record<string, unknown>;
  const mode = String(record.mode || '').toLowerCase();

  if (mode === 'image') {
    return {
      type: 'image',
      data: record.imageUrl || '',
      title: String(record.altText || 'Question image'),
      caption: String(record.altText || ''),
    };
  }

  if (mode === 'diagram') {
    return {
      type: 'chart',
      data: record.diagramSpec || {},
      title: String(record.altText || 'Supporting diagram'),
      caption: String(record.altText || ''),
    };
  }

  return undefined;
}

function normalizeQuestion(input: Record<string, unknown>, fallbackId: string, sectionTitle: string): ExamQuestion {
  const rawType = normalizeQuestionType(input.type);
  const marksRaw = Number(input.marks ?? input.points ?? 1);
  const marks = Number.isFinite(marksRaw) ? Math.max(1, marksRaw) : 1;
  const text = String(input.text ?? input.question ?? '').trim();

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const options =
    rawType === 'multiple_choice'
      ? [...new Set(rawOptions.map(sanitizeOption).filter((option) => option.length > 0))]
      : undefined;

  const visual =
    input.visual && typeof input.visual === 'object'
      ? {
          mode:
            String((input.visual as Record<string, unknown>).mode || '').toLowerCase() === 'image'
              ? ('image' as const)
              : ('diagram' as const),
          altText: String((input.visual as Record<string, unknown>).altText || ''),
          imageUrl: String((input.visual as Record<string, unknown>).imageUrl || ''),
          diagramSpec:
            (input.visual as Record<string, unknown>).diagramSpec &&
            typeof (input.visual as Record<string, unknown>).diagramSpec === 'object'
              ? ((input.visual as Record<string, unknown>).diagramSpec as Record<string, unknown>)
              : undefined,
        }
      : undefined;

  return {
    id: String(input.id || fallbackId),
    type: rawType,
    text,
    question: text,
    marks,
    options,
    correctAnswer:
      typeof input.correctAnswer === 'string' || typeof input.correctAnswer === 'number'
        ? input.correctAnswer
        : typeof input.correct_answer === 'string' || typeof input.correct_answer === 'number'
        ? (input.correct_answer as string | number)
        : typeof input.answer === 'string' || typeof input.answer === 'number'
        ? (input.answer as string | number)
        : undefined,
    sectionTitle,
    explanation: String(input.explanation || '').trim() || undefined,
    rubric: String(input.rubric || '').trim() || undefined,
    topic: String(input.topic || '').trim() || undefined,
    visual,
    diagram: normalizeDiagramFromVisual(visual),
  };
}

function calculateSectionMarks(questions: ExamQuestion[]): number {
  return questions.reduce((sum, q) => sum + Number(q.marks || 0), 0);
}

function normalizeExamStructure(data: Record<string, unknown>): ParsedExam {
  const rawSections = Array.isArray(data.sections)
    ? (data.sections as Array<Record<string, unknown>>)
    : Array.isArray(data.questions)
    ? [
        {
          id: 'section_1',
          title: 'Section A',
          questions: data.questions,
        },
      ]
    : [];

  const sections = rawSections.map((section, sectionIndex) => {
    const title = String(section.title || section.name || `Section ${sectionIndex + 1}`);
    const rawQuestions = Array.isArray(section.questions)
      ? (section.questions as Array<Record<string, unknown>>)
      : [];
    const questions = rawQuestions.map((question, questionIndex) =>
      normalizeQuestion(question, `q_${sectionIndex + 1}_${questionIndex + 1}`, title),
    );

    return {
      id: String(section.id || `section_${sectionIndex + 1}`),
      title,
      instructions: String(section.instructions || '').trim() || undefined,
      readingPassage:
        String(section.readingPassage || section.reading_passage || '').trim() || undefined,
      questions,
      totalMarks: calculateSectionMarks(questions),
    };
  });

  const totalMarksFromSections = sections.reduce((sum, section) => sum + section.totalMarks, 0);
  const totalMarksRaw = Number(data.totalMarks ?? data.total_marks ?? totalMarksFromSections);
  const totalMarks = Number.isFinite(totalMarksRaw) ? totalMarksRaw : totalMarksFromSections;

  return {
    title: String(data.title || 'Practice Exam'),
    grade: String(data.grade || ''),
    subject: String(data.subject || ''),
    duration: String(data.duration || ''),
    schoolName: String(data.schoolName || data.school_name || ''),
    instructions: Array.isArray(data.instructions)
      ? (data.instructions as unknown[]).map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    sections,
    totalMarks,
    hasMemo: Boolean(data.hasMemo),
  };
}

function parseLegacyMarkdown(content: string): ParsedExam | null {
  const lines = content.split('\n');
  let title = '';
  const sections: ParsedExam['sections'] = [];
  let currentSection: ParsedExam['sections'][number] | null = null;
  let currentQuestion: Partial<ExamQuestion> | null = null;
  let counter = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!title && line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '').trim();
      continue;
    }

    if (line.startsWith('## ')) {
      if (currentSection && currentQuestion?.text) {
        currentSection.questions.push(
          normalizeQuestion(currentQuestion as Record<string, unknown>, `q_${counter}`, currentSection.title),
        );
      }
      if (currentSection) {
        currentSection.totalMarks = calculateSectionMarks(currentSection.questions);
        sections.push(currentSection);
      }

      currentSection = {
        id: `section_${sections.length + 1}`,
        title: line.replace(/^##\s+/, '').trim(),
        questions: [],
        totalMarks: 0,
      };
      currentQuestion = null;
      continue;
    }

    const qMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (qMatch && currentSection) {
      if (currentQuestion?.text) {
        currentSection.questions.push(
          normalizeQuestion(currentQuestion as Record<string, unknown>, `q_${counter}`, currentSection.title),
        );
      }
      counter += 1;
      currentQuestion = {
        id: `q_${counter}`,
        text: qMatch[2],
        type: 'short_answer',
        marks: 1,
      };
      continue;
    }

    const optMatch = line.match(/^[A-Da-d][\.\)]\s+(.+)$/);
    if (optMatch && currentQuestion) {
      if (!Array.isArray(currentQuestion.options)) {
        currentQuestion.options = [];
        currentQuestion.type = 'multiple_choice';
      }
      currentQuestion.options.push(optMatch[1]);
      continue;
    }
  }

  if (currentSection && currentQuestion?.text) {
    currentSection.questions.push(
      normalizeQuestion(currentQuestion as Record<string, unknown>, `q_${counter}`, currentSection.title),
    );
  }
  if (currentSection) {
    currentSection.totalMarks = calculateSectionMarks(currentSection.questions);
    sections.push(currentSection);
  }

  if (sections.length === 0) return null;

  const totalMarks = sections.reduce((sum, section) => sum + section.totalMarks, 0);
  return {
    title: title || 'Practice Exam',
    instructions: [],
    sections,
    totalMarks,
    hasMemo: false,
  };
}

export function parseExamMarkdown(content: string): ParsedExam | null {
  if (!content || typeof content !== 'string') return null;

  try {
    const trimmed = content.trim();

    if (trimmed.startsWith('{')) {
      return normalizeExamStructure(JSON.parse(trimmed));
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      const candidate = fenced[1].trim();
      if (candidate.startsWith('{')) {
        return normalizeExamStructure(JSON.parse(candidate));
      }
    }

    const jsonBlock = trimmed.match(/\{[\s\S]*\}/);
    if (jsonBlock?.[0]) {
      return normalizeExamStructure(JSON.parse(jsonBlock[0]));
    }

    return parseLegacyMarkdown(trimmed);
  } catch (error) {
    console.error('[web.examParser] Failed to parse exam:', error);
    return null;
  }
}

export function gradeAnswer(
  question: ExamQuestion,
  studentAnswer: string,
): { isCorrect: boolean; feedback: string; marks: number } {
  const answer = normalizeText(studentAnswer);
  const maxMarks = Math.max(1, Number(question.marks || 1));
  const explanation = question.explanation || '';

  if (!answer) {
    return { isCorrect: false, feedback: 'No answer provided.', marks: 0 };
  }

  const correctRaw = question.correctAnswer;
  const correct = normalizeText(correctRaw);
  const type = normalizeQuestionType(question.type);

  if (type === 'multiple_choice') {
    const studentLetter = answer.match(/^[a-d]$/)?.[0];
    let correctLetter = correct.match(/^[a-d]$/)?.[0];
    if (!correctLetter && question.options?.length) {
      const index = question.options.findIndex((option) => normalizeText(option) === correct);
      if (index >= 0) correctLetter = String.fromCharCode(97 + index);
    }

    const isCorrect =
      answer === correct ||
      Boolean(studentLetter && correctLetter && studentLetter === correctLetter);

    return {
      isCorrect,
      feedback: isCorrect
        ? explanation || 'Correct.'
        : explanation || `Incorrect. The correct answer is ${String(correctRaw || '').trim()}.`,
      marks: isCorrect ? maxMarks : 0,
    };
  }

  if (type === 'true_false') {
    const normalizedStudent = answer === 't' ? 'true' : answer === 'f' ? 'false' : answer;
    const normalizedCorrect = correct === 't' ? 'true' : correct === 'f' ? 'false' : correct;
    const isCorrect = normalizedStudent === normalizedCorrect;
    return {
      isCorrect,
      feedback: isCorrect
        ? explanation || 'Correct.'
        : explanation || `Incorrect. The correct answer is ${String(correctRaw || '').trim()}.`,
      marks: isCorrect ? maxMarks : 0,
    };
  }

  if (type === 'fill_blank') {
    const isCorrect = answer === correct;
    return {
      isCorrect,
      feedback: isCorrect
        ? explanation || 'Correct.'
        : explanation || `Incorrect. The correct answer is ${String(correctRaw || '').trim()}.`,
      marks: isCorrect ? maxMarks : 0,
    };
  }

  if (correct) {
    const expectedTokens = normalizeText(correctRaw)
      .split(' ')
      .filter((token) => token.length >= 4);
    const studentTokens = answer.split(' ');
    const matched = expectedTokens.filter((token) => studentTokens.includes(token)).length;
    const coverage = expectedTokens.length > 0 ? matched / expectedTokens.length : 0;
    const awarded = Math.min(maxMarks, Math.max(0, Math.round(maxMarks * coverage)));

    return {
      isCorrect: coverage >= 0.6,
      feedback:
        coverage >= 0.6
          ? explanation || 'Good answer. Key ideas are covered.'
          : explanation || 'Partially correct. Add more key concepts.',
      marks: awarded,
    };
  }

  return {
    isCorrect: false,
    feedback: explanation || 'This answer requires teacher review.',
    marks: 0,
  };
}
