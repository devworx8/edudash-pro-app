/**
 * Exam Parser Utility
 * 
 * Parses AI-generated exam content (markdown or structured JSON)
 * into a standardized exam structure for interactive display.
 * 
 * Ported from web app for native app usage.
 */

export interface ExamQuestion {
  id: string;
  type:
    | 'multiple_choice'
    | 'short_answer'
    | 'essay'
    | 'true_false'
    | 'fill_blank'
    | 'fill_in_blank'
    | 'matching';
  question: string;
  marks: number;
  options?: string[];
  correctAnswer?: string;
  rubric?: string;
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  topic?: string;
  bloomsLevel?: string;
  visual?: {
    mode: 'diagram' | 'image';
    altText?: string;
    imageUrl?: string;
    diagramSpec?: Record<string, unknown>;
  };
}

export interface ExamSection {
  id: string;
  title: string;
  instructions?: string;
  readingPassage?: string;
  questions: ExamQuestion[];
  totalMarks: number;
}

export interface ParsedExam {
  title: string;
  grade: string;
  subject: string;
  duration?: number;
  totalMarks: number;
  instructions?: string;
  sections: ExamSection[];
  metadata?: {
    curriculum?: string;
    examType?: string;
    generatedAt?: string;
  };
}

/**
 * Parse markdown exam content into structured format
 */
export function parseExamMarkdown(content: string): ParsedExam | null {
  if (!content || typeof content !== 'string') return null;

  try {
    // Try parsing as JSON first
    if (content.trim().startsWith('{')) {
      const parsed = JSON.parse(content);
      if (parsed.sections || parsed.questions) {
        return normalizeExamStructure(parsed);
      }
    }

    // Parse markdown format
    const lines = content.split('\n');
    let title = '';
    let grade = '';
    let subject = '';
    let duration: number | undefined;
    let instructions = '';
    let currentSection: ExamSection | null = null;
    const sections: ExamSection[] = [];
    let currentQuestion: Partial<ExamQuestion> | null = null;
    let questionCounter = 0;
    let sectionCounter = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Extract title (first # heading)
      if (!title && line.startsWith('# ')) {
        title = line.replace(/^#\s+/, '').trim();
        continue;
      }

      // Extract metadata
      if (line.match(/grade:\s*(.+)/i)) {
        grade = line.split(':')[1].trim();
        continue;
      }
      if (line.match(/subject:\s*(.+)/i)) {
        subject = line.split(':')[1].trim();
        continue;
      }
      if (line.match(/duration:\s*(\d+)/i)) {
        duration = parseInt(line.split(':')[1].trim());
        continue;
      }

      // Section headers (## heading)
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentSection && currentQuestion) {
          currentSection.questions.push(normalizeQuestion(currentQuestion, questionCounter));
          currentQuestion = null;
        }
        if (currentSection) {
          sections.push(currentSection);
        }

        // Start new section
        sectionCounter++;
        currentSection = {
          id: `section_${sectionCounter}`,
          title: line.replace(/^##\s+/, '').trim(),
          questions: [],
          totalMarks: 0,
        };
        continue;
      }

      // Question patterns
      const questionMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (questionMatch) {
        // Save previous question
        if (currentSection && currentQuestion) {
          currentSection.questions.push(normalizeQuestion(currentQuestion, questionCounter));
        }

        // Start new question
        questionCounter++;
        currentQuestion = {
          id: `q_${questionCounter}`,
          question: questionMatch[2].trim(),
          marks: 1,
          type: 'short_answer',
        };
        continue;
      }

      // Parse question marks
      if (currentQuestion && line.match(/\[(\d+)\s*marks?\]/i)) {
        const marksMatch = line.match(/\[(\d+)\s*marks?\]/i);
        if (marksMatch) {
          currentQuestion.marks = parseInt(marksMatch[1]);
        }
        continue;
      }

      // Parse options (A, B, C, D format)
      if (currentQuestion && line.match(/^[A-D]\)\s+(.+)/)) {
        if (!currentQuestion.options) {
          currentQuestion.options = [];
          currentQuestion.type = 'multiple_choice';
        }
        currentQuestion.options.push(line.substring(3).trim());
        continue;
      }

      // Collect question text if we're in a question
      if (currentQuestion && line && !line.startsWith('#') && !line.startsWith('---')) {
        currentQuestion.question = (currentQuestion.question || '') + ' ' + line;
      }
    }

    // Save last question and section
    if (currentSection && currentQuestion) {
      currentSection.questions.push(normalizeQuestion(currentQuestion, questionCounter));
    }
    if (currentSection) {
      sections.push(currentSection);
    }

    // Calculate section marks
    sections.forEach(section => {
      section.totalMarks = section.questions.reduce((sum, q) => sum + q.marks, 0);
    });

    const totalMarks = sections.reduce((sum, s) => sum + s.totalMarks, 0);

    return {
      title: title || 'Generated Exam',
      grade: grade || '',
      subject: subject || '',
      duration,
      totalMarks,
      instructions,
      sections,
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[ExamParser] Failed to parse exam:', error);
    return null;
  }
}

/**
 * Normalize question structure
 */
function normalizeQuestion(partial: Partial<ExamQuestion>, id: number): ExamQuestion {
  const raw = partial as Record<string, any>;
  const rawType = String(partial.type || raw.type || 'short_answer');
  const normalizedType: ExamQuestion['type'] =
    rawType === 'multiple_choice' ||
    rawType === 'short_answer' ||
    rawType === 'essay' ||
    rawType === 'true_false' ||
    rawType === 'matching'
      ? (rawType as ExamQuestion['type'])
      : rawType === 'fill_in_blank' || rawType === 'fill_blank'
      ? 'fill_blank'
      : 'short_answer';
  const normalizedMarks = Number(partial.marks ?? raw.points ?? 1);

  const rawOptions = partial.options ?? raw.options;
  const options = Array.isArray(rawOptions)
    ? rawOptions.map((item: unknown) =>
        String(item || '')
          .replace(/^(?:\s*[A-D]\s*[\.\)\-:]\s*)+/i, '')
          .trim(),
      )
    : undefined;

  return {
    id: partial.id || `q_${id}`,
    type: normalizedType,
    question: String(partial.question ?? raw.text ?? '').trim(),
    marks: Number.isFinite(normalizedMarks) ? normalizedMarks : 1,
    options,
    correctAnswer: partial.correctAnswer ?? raw.correct_answer ?? raw.answer,
    rubric: partial.rubric,
    explanation: partial.explanation,
    difficulty: partial.difficulty,
    topic: partial.topic,
    bloomsLevel: partial.bloomsLevel,
    visual: raw.visual && typeof raw.visual === 'object' ? (raw.visual as ExamQuestion['visual']) : undefined,
  };
}

/**
 * Normalize exam structure from various formats
 */
function normalizeExamStructure(data: any): ParsedExam {
  // Handle direct sections format
  if (Array.isArray(data.sections)) {
    return {
      title: data.title || 'Generated Exam',
      grade: data.grade || '',
      subject: data.subject || '',
      duration: data.duration,
      totalMarks: data.totalMarks || calculateTotalMarks(data.sections),
      instructions: data.instructions,
      sections: data.sections.map((s: any, i: number) => ({
        id: s.id || `section_${i + 1}`,
        title: s.title || s.name || `Section ${i + 1}`,
        instructions: s.instructions,
        readingPassage:
          typeof s.readingPassage === 'string'
            ? s.readingPassage
            : typeof s.reading_passage === 'string'
            ? s.reading_passage
            : undefined,
        questions: s.questions?.map((q: any, j: number) => normalizeQuestion(q, j + 1)) || [],
        totalMarks: s.totalMarks || calculateSectionMarks(s.questions || []),
      })),
      metadata: data.metadata || {},
    };
  }

  // Handle flat questions format
  if (Array.isArray(data.questions)) {
    const section: ExamSection = {
      id: 'section_1',
      title: 'Questions',
      questions: data.questions.map((q: any, i: number) => normalizeQuestion(q, i + 1)),
      totalMarks: calculateSectionMarks(data.questions),
    };

    return {
      title: data.title || 'Generated Exam',
      grade: data.grade || '',
      subject: data.subject || '',
      duration: data.duration,
      totalMarks: section.totalMarks,
      instructions: data.instructions,
      sections: [section],
      metadata: data.metadata || {},
    };
  }

  throw new Error('Invalid exam structure');
}

function calculateTotalMarks(sections: any[]): number {
  return sections.reduce((sum, s) => sum + (s.totalMarks || calculateSectionMarks(s.questions || [])), 0);
}

function calculateSectionMarks(questions: any[]): number {
  return questions.reduce((sum, q) => sum + (q.marks || 1), 0);
}

function sanitizeChoiceText(value: string): string {
  return String(value || '')
    .replace(/^(?:\s*[A-D]\s*[\.\)\-:]\s*)+/i, '')
    .trim();
}

function extractChoiceLetter(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const exact = raw.match(/^\s*([A-D])\s*$/i);
  if (exact?.[1]) return exact[1].toLowerCase();

  const prefixed = raw.match(/^\s*([A-D])\s*[\.\)\-:]/i);
  if (prefixed?.[1]) return prefixed[1].toLowerCase();

  const labeled = raw.match(/\b(?:option|answer|correct(?:\s+answer)?)\s*[:\-]?\s*([A-D])\b/i);
  if (labeled?.[1]) return labeled[1].toLowerCase();

  return null;
}

function toChoiceLetter(index: number): string {
  return String.fromCharCode(97 + index);
}

function resolveChoiceLetter(value: string, options?: string[]): string | null {
  const direct = extractChoiceLetter(value);
  if (direct) return direct;

  if (!Array.isArray(options) || options.length === 0) return null;
  const normalizedValue = normalizeComparableText(sanitizeChoiceText(value));
  if (!normalizedValue) return null;

  const idx = options.findIndex(
    (option) => normalizeComparableText(sanitizeChoiceText(option)) === normalizedValue,
  );
  return idx >= 0 ? toChoiceLetter(idx) : null;
}

function formatCorrectChoice(question: ExamQuestion): string {
  const raw = String(question.correctAnswer || '').trim();
  if (!raw) return '';
  if (!Array.isArray(question.options) || question.options.length === 0) return raw;

  const letter = resolveChoiceLetter(raw, question.options);
  if (!letter) return raw;

  const optionIndex = letter.charCodeAt(0) - 97;
  const option = question.options[optionIndex];
  if (!option) return raw;
  return `${letter.toUpperCase()}. ${sanitizeChoiceText(option)}`;
}

function normalizeComparableText(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^(?:\s*[a-d]\s*[\.\)\-:]\s*)+/i, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMathExpression(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\left|\\right/gi, '')
    .replace(/\\times/gi, '*')
    .replace(/\\cdot/gi, '*')
    .replace(/\\div/gi, '/')
    .replace(/\\pm/gi, '+/-')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/gi, '($1)/($2)')
    .replace(/\\sqrt\s*\{([^{}]+)\}/gi, 'sqrt($1)')
    .replace(/[{}]/g, '')
    .replace(/\(([\p{L}\p{N}.\-+]+)\)/gu, '$1')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function areMathEquivalent(a: string, b: string): boolean {
  const normalizedA = normalizeMathExpression(a);
  const normalizedB = normalizeMathExpression(b);
  if (!normalizedA || !normalizedB) return false;
  return normalizedA === normalizedB;
}

/**
 * Grade student answer against correct answer
 */
export function gradeAnswer(
  question: ExamQuestion,
  studentAnswer: string
): { isCorrect: boolean; feedback: string; marks: number } {
  if (!studentAnswer || !studentAnswer.trim()) {
    return {
      isCorrect: false,
      feedback: 'No answer provided.',
      marks: 0,
    };
  }

  const answer = studentAnswer.trim();
  const normalize = (value: string) => normalizeComparableText(value);

  // Multiple choice - flexible matching
  if (question.type === 'multiple_choice' && question.correctAnswer) {
    const correctRaw = question.correctAnswer;
    const correctNormalized = normalize(correctRaw);
    const answerNormalized = normalize(answer);
    const answerLetter = resolveChoiceLetter(answer, question.options);
    const correctLetter = resolveChoiceLetter(correctRaw, question.options);

    const answerOptionIndex = answerLetter ? answerLetter.charCodeAt(0) - 97 : -1;
    const correctOptionIndex = correctLetter ? correctLetter.charCodeAt(0) - 97 : -1;
    const answerOptionText =
      answerOptionIndex >= 0 && question.options?.[answerOptionIndex]
        ? normalize(sanitizeChoiceText(question.options[answerOptionIndex]))
        : '';
    const correctOptionText =
      correctOptionIndex >= 0 && question.options?.[correctOptionIndex]
        ? normalize(sanitizeChoiceText(question.options[correctOptionIndex]))
        : '';

    const isCorrect =
      answerNormalized === correctNormalized ||
      areMathEquivalent(answer, correctRaw) ||
      (!!answerLetter && !!correctLetter && answerLetter === correctLetter) ||
      (!!answerOptionText && !!correctOptionText && answerOptionText === correctOptionText);

    const displayCorrect = formatCorrectChoice(question) || question.correctAnswer;

    return {
      isCorrect,
      feedback: isCorrect
        ? question.explanation || 'Correct!'
        : question.explanation
        ? `Incorrect. ${question.explanation}`
        : `Incorrect. The correct answer is ${displayCorrect}.`,
      marks: isCorrect ? question.marks : 0,
    };
  }

  // True/false - flexible matching (t/f, true/false, yes/no, correct/incorrect)
  if (question.type === 'true_false' && question.correctAnswer) {
    const normalizedAnswer = normalize(answer);
    const normalizedCorrect = normalize(question.correctAnswer);
    const mapToBool = (s: string): 'true' | 'false' | null => {
      if (['t', 'true', 'yes', 'y', 'correct', 'right', '1', 'waar', 'ewe', 'qiniso'].includes(s)) return 'true';
      if (['f', 'false', 'no', 'n', 'incorrect', 'wrong', '0', 'onwaar', 'amanga'].includes(s)) return 'false';
      return null;
    };
    const studentBool = mapToBool(normalizedAnswer);
    const targetBool = mapToBool(normalizedCorrect);
    const isCorrect =
      (studentBool !== null && targetBool !== null && studentBool === targetBool) ||
      normalizedAnswer === normalizedCorrect;

    return {
      isCorrect,
      feedback: isCorrect
        ? question.explanation || 'Correct!'
        : question.explanation
        ? `Incorrect. ${question.explanation}`
        : `Incorrect. The correct answer is ${question.correctAnswer}.`,
      marks: isCorrect ? question.marks : 0,
    };
  }

  if ((question.type === 'fill_blank' || question.type === 'fill_in_blank') && question.correctAnswer) {
    const normalizedAnswer = normalize(answer);
    const normalizedCorrect = normalize(question.correctAnswer);
    const isExact = normalizedAnswer === normalizedCorrect || areMathEquivalent(answer, question.correctAnswer);
    // Accommodate spelling: Levenshtein-like tolerance (1-2 char diff for short words, more for longer)
    const maxEditDistance = Math.max(1, Math.floor(normalizedCorrect.length / 4));
    const editDistance = (a: string, b: string): number => {
      const m = a.length;
      const n = b.length;
      const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
      }
      return dp[m][n];
    };
    const isSpellingClose = !isExact
      && normalizedCorrect.length >= 2
      && normalizedAnswer.length > 0
      && editDistance(normalizedAnswer, normalizedCorrect) <= maxEditDistance;
    const isPrefixMatch = !isExact
      && normalizedCorrect.length > 3
      && (normalizedAnswer.startsWith(normalizedCorrect) || normalizedCorrect.startsWith(normalizedAnswer));

    if (isExact || isSpellingClose || isPrefixMatch) {
      return {
        isCorrect: true,
        feedback: question.explanation || (isSpellingClose ? `Correct (spelling variation accepted). Expected: ${question.correctAnswer}` : 'Correct!'),
        marks: question.marks,
      };
    }
    return {
      isCorrect: false,
      feedback: question.explanation
        ? `Incorrect. ${question.explanation}`
        : `Incorrect. The correct answer is ${question.correctAnswer}.`,
      marks: 0,
    };
  }

  if ((question.type === 'short_answer' || question.type === 'essay') && question.correctAnswer) {
    const normalizedExpected = normalize(question.correctAnswer);
    const normalizedStudent = normalize(answer);
    const expectedTokens = normalizedExpected.split(' ').filter((token) => token.length >= 2);
    const studentTokens = normalizedStudent.split(' ');

    const fuzzyMatch = (expected: string, student: string): boolean => {
      if (expected === student) return true;
      if (expected.length <= 2 && student.length <= 2) return expected === student;
      if (student.startsWith(expected) || expected.startsWith(student)) return true;
      const maxDist = Math.max(1, Math.floor(expected.length / 4));
      let dist = 0;
      const longer = expected.length >= student.length ? expected : student;
      const shorter = expected.length < student.length ? expected : student;
      if (Math.abs(longer.length - shorter.length) > maxDist) return false;
      for (let i = 0; i < longer.length; i++) {
        if ((shorter[i] ?? '') !== longer[i]) dist++;
        if (dist > maxDist) return false;
      }
      return true;
    };

    const matched = expectedTokens.filter((token) =>
      studentTokens.some((st) => fuzzyMatch(token, st))
    ).length;
    const coverage = expectedTokens.length > 0 ? matched / expectedTokens.length : 0;

    const isEssay = question.type === 'essay';
    const wordCount = studentTokens.length;
    const lengthBonus = isEssay && wordCount >= 15 ? 0.12 : isEssay && wordCount >= 8 ? 0.08 : 0;
    const adjustedCoverage = Math.min(1, coverage + lengthBonus);
    const awarded = Math.min(question.marks, Math.max(0, Math.round(question.marks * adjustedCoverage)));

    const correctThreshold = isEssay ? 0.5 : 0.55;
    const partialThreshold = 0.25;
    const minimumAward = partialThreshold > 0 ? Math.floor(question.marks * partialThreshold) : 0;

    if (adjustedCoverage >= correctThreshold) {
      return {
        isCorrect: true,
        feedback: question.explanation || 'Good answer. Key ideas are covered.',
        marks: awarded,
      };
    } else if (adjustedCoverage >= partialThreshold) {
      return {
        isCorrect: false,
        feedback: question.explanation
          ? `Partially correct (${Math.round(adjustedCoverage * 100)}% coverage). ${question.explanation}`
          : `Partially correct (${Math.round(adjustedCoverage * 100)}% coverage). Include more key terms and elaborate on your reasoning.`,
        marks: Math.max(awarded, minimumAward),
      };
    } else {
      return {
        isCorrect: false,
        feedback: question.explanation
          ? `Needs improvement. ${question.explanation}`
          : 'Needs improvement. Review the topic and focus on key concepts.',
        marks: awarded,
      };
    }
  }

  return {
    isCorrect: false,
    feedback: question.explanation || 'This answer requires teacher review.',
    marks: 0,
  };
}
