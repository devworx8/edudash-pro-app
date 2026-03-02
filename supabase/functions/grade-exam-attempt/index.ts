/**
 * grade-exam-attempt edge function
 *
 * Deterministic grading pipeline with weighted marks:
 * - objective questions (MCQ / true-false / fill in blank)
 * - rubric-style heuristic grading for short and extended responses
 *
 * Persists canonical attempt data into exam_sessions.session_data.
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

type JsonRecord = Record<string, unknown>;

type ProfileRow = {
  id: string;
  role: string | null;
  organization_id: string | null;
  preschool_id: string | null;
  auth_user_id: string | null;
};

type StudentRow = {
  id: string;
  parent_id: string | null;
  guardian_id: string | null;
  class_id: string | null;
  organization_id: string | null;
  preschool_id: string | null;
  student_id: string | null;
};

type ExamQuestion = {
  id: string;
  type?: string;
  question?: string;
  text?: string;
  marks?: number;
  points?: number;
  options?: Array<string | { id?: string; text?: string; label?: string; value?: string }>;
  correctOptionId?: string;
  correct_option_id?: string;
  correctAnswer?: string;
  correct_answer?: string;
  answer?: string;
  explanation?: string;
  rubric?: string;
  topic?: string;
};

type ExamSection = {
  id?: string;
  title?: string;
  name?: string;
  questions?: ExamQuestion[];
};

type ExamPayload = {
  title?: string;
  grade?: string;
  subject?: string;
  totalMarks?: number;
  sections?: ExamSection[];
};

type GradeFeedback = {
  isCorrect: boolean;
  marksAwarded: number;
  maxMarks: number;
  feedback: string;
  explanation?: string;
  gradingMode: 'deterministic' | 'heuristic';
};

type SectionBreakdown = {
  sectionId: string;
  title: string;
  earnedMarks: number;
  totalMarks: number;
  questionCount: number;
  correctCount: number;
};

type TopicFeedback = {
  topic: string;
  earnedMarks: number;
  totalMarks: number;
  percentage: number;
  priority: 'high' | 'medium' | 'low';
};

type ParsedAnswer = {
  answer: string;
  selectedOptionId?: string;
};

function jsonResponse(body: JsonRecord, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\s*[a-d]\s*[\.\)\-:]\s*/i, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMathSymbols(value: string): string {
  return String(value || '')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\left|\\right/gi, '')
    .replace(/\\times/gi, '*')
    .replace(/\\cdot/gi, '*')
    .replace(/[×xX]/g, '*')
    .replace(/\\div/gi, '/')
    .replace(/[÷]/g, '/')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/gi, '($1)/($2)')
    .replace(/\\sqrt\s*\{([^{}]+)\}/gi, 'sqrt($1)')
    .replace(/[{}]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/,/g, '.')
    .trim();
}

function extractEquationExpressions(value: string): Array<{ left: string; right: string }> {
  const source = normalizeMathSymbols(value);
  const matches = source.match(/([^=,\n]{1,80})=([^=,\n]{1,80})/g) || [];
  return matches
    .map((entry) => {
      const [left, right] = entry.split('=');
      return {
        left: String(left || '').trim(),
        right: String(right || '').trim(),
      };
    })
    .filter((item) => item.left.length > 0 && item.right.length > 0);
}

function safeEvalMathExpression(value: string): number | null {
  const normalized = normalizeMathSymbols(value)
    .replace(/sqrt\(([^()]+)\)/gi, 'Math.sqrt($1)')
    .replace(/\s+/g, '');
  if (!normalized) return null;
  if (!/^[0-9+\-*/().Mathsqrt]+$/i.test(normalized)) return null;

  try {
    const result = Function(`"use strict"; return (${normalized});`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function isEquationNumericallyTrue(value: string): boolean {
  const equations = extractEquationExpressions(value);
  if (equations.length === 0) return false;
  return equations.some((equation) => {
    const left = safeEvalMathExpression(equation.left);
    const right = safeEvalMathExpression(equation.right);
    if (left === null || right === null) return false;
    return Math.abs(left - right) < 1e-6;
  });
}

function extractNumericTokens(value: string): Set<string> {
  return new Set((String(value || '').match(/-?\d+(?:\.\d+)?/g) || []).map((token) => token.trim()));
}

function hasEquivalentMathSentence(student: string, expected: string): boolean {
  const studentEquations = extractEquationExpressions(student);
  if (studentEquations.length === 0) return false;
  if (!isEquationNumericallyTrue(student)) return false;

  const expectedNumbers = extractNumericTokens(expected);
  if (expectedNumbers.size === 0) return false;

  const studentNumbers = extractNumericTokens(student);
  const overlap = [...expectedNumbers].filter((token) => studentNumbers.has(token)).length;
  const overlapRatio = overlap / expectedNumbers.size;
  return overlapRatio >= 0.6;
}

function computeNumericOverlapRatio(student: string, expected: string): number {
  const expectedNumbers = extractNumericTokens(expected);
  if (expectedNumbers.size === 0) return 0;
  const studentNumbers = extractNumericTokens(student);
  const overlap = [...expectedNumbers].filter((token) => studentNumbers.has(token)).length;
  return overlap / expectedNumbers.size;
}

function isLikelyMathVerificationPrompt(questionText: string, expected: string): boolean {
  const raw = `${questionText} ${expected}`.toLowerCase();
  if (/[0-9].*[=+\-*/×÷]/.test(raw)) return true;
  return (
    /\b(check|verify|confirm|prove|calculate|solve|equation|sentence|multiplication|division|quotient|remainder)\b/.test(raw) ||
    /\b(hoekom|hoe|bereken|kontroleer|bevestig|vergelyking|maal|deel)\b/.test(raw)
  );
}

function normalizeQuestionType(value: unknown): string {
  const raw = String(value || 'short_answer').toLowerCase();
  if (raw === 'fill_in_blank' || raw === 'fillblank' || raw === 'fill_blank') return 'fill_in_blank';
  if (raw.includes('true') || raw.includes('false')) return 'true_false';
  if (raw.includes('multiple')) return 'multiple_choice';
  if (raw.includes('essay') || raw.includes('extended')) return 'essay';
  if (raw.includes('short')) return 'short_answer';
  return 'short_answer';
}

function sanitizeOption(option: string): string {
  return String(option || '')
    .replace(/^\s*[A-D]\s*[\.\)\-:]\s*/i, '')
    .trim();
}

function optionIdFromIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

function normalizeOptionId(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const direct = raw.match(/^[A-Za-z0-9_-]{1,12}$/);
  if (direct?.[0]) return direct[0].toUpperCase();
  const letter = extractChoiceLetter(raw);
  if (letter) return letter.toUpperCase();
  return null;
}

function normalizeOptionObjects(rawOptions: ExamQuestion['options']) {
  if (!Array.isArray(rawOptions)) return [] as Array<{ id: string; text: string }>;
  return rawOptions
    .map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const text = sanitizeOption(
          String(item.text ?? item.label ?? item.value ?? ''),
        );
        if (!text) return null;
        return {
          id: normalizeOptionId(item.id) || optionIdFromIndex(index),
          text,
        };
      }
      const text = sanitizeOption(String(item || ''));
      if (!text) return null;
      return {
        id: optionIdFromIndex(index),
        text,
      };
    })
    .filter((item): item is { id: string; text: string } => Boolean(item));
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

function optionLetterFromIndex(index: number): string {
  return optionIdFromIndex(index).toLowerCase();
}

function resolveChoiceLetter(value: string, options: string[]): string | null {
  const direct = extractChoiceLetter(value);
  if (direct) return direct;

  const normalizedValue = normalizeText(sanitizeOption(value));
  if (!normalizedValue) return null;

  const idx = options.findIndex((option) => normalizeText(sanitizeOption(option)) === normalizedValue);
  return idx >= 0 ? optionLetterFromIndex(idx) : null;
}

function formatCorrectChoice(correctRaw: string, options: string[]): string {
  const raw = String(correctRaw || '').trim();
  if (!raw || options.length === 0) return raw;

  const letter = resolveChoiceLetter(raw, options);
  if (!letter) return raw;

  const idx = letter.charCodeAt(0) - 97;
  const option = options[idx];
  if (!option) return raw;
  return `${letter.toUpperCase()}. ${sanitizeOption(option)}`;
}

function parseBooleanToken(value: string): 'true' | 'false' | null {
  const token = normalizeText(value);
  if (!token) return null;
  if (['t', 'true', 'yes', 'y', 'correct', 'right', '1', 'waar', 'ewe', 'qiniso'].includes(token)) {
    return 'true';
  }
  if (['f', 'false', 'no', 'n', 'incorrect', 'wrong', '0', 'onwaar', 'amanga'].includes(token)) {
    return 'false';
  }
  return null;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 4),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseSubmittedAnswer(value: unknown): ParsedAnswer {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const payload = value as Record<string, unknown>;
    return {
      answer: String(payload.answer || ''),
      selectedOptionId: normalizeOptionId(payload.selectedOptionId),
    };
  }
  return {
    answer: String(value || ''),
  };
}

function gradeObjective(question: ExamQuestion, parsedAnswer: ParsedAnswer): GradeFeedback {
  const maxMarks = Math.max(1, Number(question.marks ?? question.points ?? 1) || 1);
  const qType = normalizeQuestionType(question.type);
  const answerRaw = parsedAnswer.answer;
  const answer = normalizeText(answerRaw);
  const explanation = String(question.explanation || '').trim() || undefined;
  const questionCorrectOptionId = normalizeOptionId(question.correctOptionId ?? question.correct_option_id);

  const correctRaw =
    String(question.correctAnswer || question.correct_answer || question.answer || '').trim();
  const correct = normalizeText(correctRaw);

  if (!correct && !questionCorrectOptionId) {
    return {
      isCorrect: false,
      marksAwarded: 0,
      maxMarks,
      feedback: 'Answer saved. This item needs teacher review.',
      explanation,
      gradingMode: 'heuristic',
    };
  }

  if (qType === 'multiple_choice') {
    const optionObjects = normalizeOptionObjects(question.options);
    const options = optionObjects.map((item) => item.text);
    const selectedOptionId = normalizeOptionId(parsedAnswer.selectedOptionId);
    const correctOptionId = questionCorrectOptionId;
    const effectiveCorrectRaw = correctRaw || correctOptionId || '';
    const studentLetter = resolveChoiceLetter(answerRaw, options);
    const correctLetter = resolveChoiceLetter(effectiveCorrectRaw, options);

    const studentOptionIndex = studentLetter ? studentLetter.charCodeAt(0) - 97 : -1;
    const correctOptionIndex = correctLetter ? correctLetter.charCodeAt(0) - 97 : -1;
    const studentOptionText =
      studentOptionIndex >= 0 && options[studentOptionIndex]
        ? normalizeText(options[studentOptionIndex])
        : '';
    const correctOptionText =
      correctOptionIndex >= 0 && options[correctOptionIndex]
        ? normalizeText(options[correctOptionIndex])
        : '';

    const directMatch = answer === normalizeText(effectiveCorrectRaw);
    const letterMatch = Boolean(studentLetter && correctLetter && studentLetter === correctLetter);
    const optionMatch = Boolean(studentOptionText && correctOptionText && studentOptionText === correctOptionText);
    const canonicalOptionMatch = Boolean(
      selectedOptionId && correctOptionId && selectedOptionId === correctOptionId,
    );
    const isCorrect = canonicalOptionMatch || directMatch || letterMatch || optionMatch;
    const displayCorrect = formatCorrectChoice(effectiveCorrectRaw, options) || effectiveCorrectRaw;

    return {
      isCorrect,
      marksAwarded: isCorrect ? maxMarks : 0,
      maxMarks,
      feedback: isCorrect
        ? explanation || 'Correct. Good job.'
        : explanation || `Incorrect. The correct answer is ${displayCorrect}.`,
      explanation,
      gradingMode: 'deterministic',
    };
  }

  if (qType === 'true_false') {
    const normalizedStudent = answer === 't' ? 'true' : answer === 'f' ? 'false' : answer;
    const normalizedCorrect = correct === 't' ? 'true' : correct === 'f' ? 'false' : correct;
    const studentBool = parseBooleanToken(answerRaw);
    const correctBool = parseBooleanToken(correctRaw);
    const isCorrect =
      normalizedStudent === normalizedCorrect ||
      (studentBool !== null && correctBool !== null && studentBool === correctBool);
    return {
      isCorrect,
      marksAwarded: isCorrect ? maxMarks : 0,
      maxMarks,
      feedback: isCorrect
        ? explanation || 'Correct.'
        : explanation || `Incorrect. The correct answer is ${correctRaw}.`,
      explanation,
      gradingMode: 'deterministic',
    };
  }

  const isCorrect = answer === correct;
  return {
    isCorrect,
    marksAwarded: isCorrect ? maxMarks : 0,
    maxMarks,
    feedback: isCorrect
      ? explanation || 'Correct.'
      : explanation || `Incorrect. The correct answer is ${correctRaw}.`,
    explanation,
    gradingMode: 'deterministic',
  };
}

function gradeOpenResponse(question: ExamQuestion, answerRaw: string): GradeFeedback {
  const maxMarks = Math.max(1, Number(question.marks ?? question.points ?? 1) || 1);
  const answer = normalizeText(answerRaw);
  const explanation = String(question.explanation || '').trim() || undefined;

  if (!answer) {
    return {
      isCorrect: false,
      marksAwarded: 0,
      maxMarks,
      feedback: 'No answer provided.',
      explanation,
      gradingMode: 'heuristic',
    };
  }

  const expectedSource = [
    String(question.correctAnswer || question.correct_answer || question.answer || ''),
    String(question.rubric || ''),
    String(question.explanation || ''),
  ]
    .join(' ')
    .trim();
  const mathExpectationSource = [
    String(question.correctAnswer || question.correct_answer || question.answer || ''),
    String(question.question || question.text || ''),
  ]
    .join(' ')
    .trim();
  const mathVerificationPrompt = isLikelyMathVerificationPrompt(
    String(question.question || question.text || ''),
    mathExpectationSource,
  );

  const equationIsTrue = isEquationNumericallyTrue(answerRaw);
  const numericOverlap = computeNumericOverlapRatio(answerRaw, mathExpectationSource);
  if (mathVerificationPrompt && equationIsTrue && numericOverlap >= 0.45) {
    return {
      isCorrect: true,
      marksAwarded: maxMarks,
      maxMarks,
      feedback: explanation || 'Correct. Your multiplication/division check is valid.',
      explanation,
      gradingMode: 'deterministic',
    };
  }
  if (mathVerificationPrompt && equationIsTrue && numericOverlap >= 0.3) {
    return {
      isCorrect: false,
      marksAwarded: Math.max(1, Math.round(maxMarks * 0.75)),
      maxMarks,
      feedback:
        explanation ||
        `Partially correct (${Math.round(numericOverlap * 100)}% numeric match). Add the final conclusion sentence.`,
      explanation,
      gradingMode: 'deterministic',
    };
  }

  if (hasEquivalentMathSentence(answerRaw, mathExpectationSource)) {
    return {
      isCorrect: true,
      marksAwarded: maxMarks,
      maxMarks,
      feedback: explanation || 'Correct mathematical sentence.',
      explanation,
      gradingMode: 'deterministic',
    };
  }

  const expectedTokens = tokenSet(expectedSource);
  const studentTokens = tokenSet(answer);
  const matches = [...expectedTokens].filter((token) => studentTokens.has(token)).length;
  const coverage = expectedTokens.size > 0 ? matches / expectedTokens.size : 0;
  const clarityBonus = answer.split(' ').length >= 8 ? 0.1 : 0;
  const weighted = clamp(coverage + clarityBonus, 0, 1);

  const awarded = clamp(Math.round(maxMarks * weighted), 0, maxMarks);
  const isCorrect = weighted >= 0.65;

  let feedback = '';
  if (isCorrect) {
    feedback = explanation || 'Good response. You covered the key ideas.';
  } else if (weighted >= 0.35) {
    feedback =
      explanation ||
      'Partially correct. Add more key terms and link your answer to the main concept.';
  } else {
    feedback =
      explanation ||
      'Needs improvement. Re-read the topic and include clearer key concepts in your answer.';
  }

  return {
    isCorrect,
    marksAwarded: awarded,
    maxMarks,
    feedback,
    explanation,
    gradingMode: 'heuristic',
  };
}

async function fetchProfileByAuthUser(
  supabase: ReturnType<typeof createClient>,
  authUserId: string,
): Promise<ProfileRow | null> {
  const byAuth = await supabase
    .from('profiles')
    .select('id, role, organization_id, preschool_id, auth_user_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (!byAuth.error && byAuth.data) return byAuth.data as ProfileRow;

  const byId = await supabase
    .from('profiles')
    .select('id, role, organization_id, preschool_id, auth_user_id')
    .eq('id', authUserId)
    .maybeSingle();
  if (!byId.error && byId.data) return byId.data as ProfileRow;

  return null;
}

async function resolveStudentForRequest(
  supabase: ReturnType<typeof createClient>,
  studentId: string,
): Promise<StudentRow | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, parent_id, guardian_id, class_id, organization_id, preschool_id, student_id')
    .eq('id', studentId)
    .maybeSingle();
  if (error || !data) return null;
  return data as StudentRow;
}

async function isParentLinkedToStudent(
  supabase: ReturnType<typeof createClient>,
  parentProfileId: string,
  studentId: string,
): Promise<boolean> {
  const studentResult = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .or(`parent_id.eq.${parentProfileId},guardian_id.eq.${parentProfileId}`)
    .maybeSingle();
  if (!studentResult.error && studentResult.data) return true;

  const relationResult = await supabase
    .from('student_parent_relationships')
    .select('id')
    .eq('student_id', studentId)
    .eq('parent_id', parentProfileId)
    .maybeSingle();
  return !relationResult.error && !!relationResult.data;
}

function normalizeRole(value: unknown): string {
  return String(value || '').toLowerCase().trim();
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').toLowerCase().trim();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401, corsHeaders);
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401, corsHeaders);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Invalid session' }, 401, corsHeaders);
    }

    const body = (await req.json()) as {
      examId?: string;
      exam?: ExamPayload;
      answers?: Record<string, unknown>;
      studentId?: string;
      classId?: string;
      schoolId?: string;
      preserveInProgress?: boolean;
    };

    const examId = String(body.examId || '').trim();
    const exam = body.exam;
    const answerMap = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const requestedStudentId = String(body.studentId || '').trim() || null;
    const requestedSchoolId = String(body.schoolId || '').trim() || null;

    if (!examId || !exam || !Array.isArray(exam.sections) || exam.sections.length === 0) {
      return jsonResponse({ success: false, error: 'Invalid exam payload' }, 400, corsHeaders);
    }

    const profile = await fetchProfileByAuthUser(supabase, user.id);
    if (!profile) {
      return jsonResponse({ success: false, error: 'Profile not found' }, 403, corsHeaders);
    }

    const role = normalizeRole(profile.role);
    const isParent = role === 'parent' || role === 'guardian' || role === 'sponsor';
    const isStudent = role === 'student' || role === 'learner';
    const isStaff =
      role === 'teacher' ||
      role === 'principal' ||
      role === 'principal_admin' ||
      role === 'admin' ||
      role === 'school_admin';
    const isSuperAdmin = role === 'super_admin';

    let student: StudentRow | null = null;
    if (requestedStudentId) {
      student = await resolveStudentForRequest(supabase, requestedStudentId);
      if (!student) {
        return jsonResponse({ success: false, error: 'Student not found' }, 404, corsHeaders);
      }
    }

    if (student && isParent) {
      const linked = await isParentLinkedToStudent(supabase, profile.id, student.id);
      if (!linked) {
        return jsonResponse(
          { success: false, error: 'Parent can only grade linked learner attempts' },
          403,
          corsHeaders,
        );
      }
    }

    if (student && isStudent) {
      const matchesSelf =
        student.id === profile.id || student.student_id === profile.id || student.student_id === user.id;
      if (!matchesSelf) {
        return jsonResponse(
          { success: false, error: 'Student can only grade own attempts' },
          403,
          corsHeaders,
        );
      }
    }

    if (student && isStaff && !isSuperAdmin) {
      const profileOrg = profile.organization_id || profile.preschool_id || null;
      const studentOrg = student.organization_id || student.preschool_id || null;
      if (profileOrg && studentOrg && profileOrg !== studentOrg) {
        return jsonResponse(
          { success: false, error: 'Staff can only grade within school scope' },
          403,
          corsHeaders,
        );
      }
    }

    const effectiveSchoolId =
      requestedSchoolId ||
      student?.organization_id ||
      student?.preschool_id ||
      profile.organization_id ||
      profile.preschool_id ||
      null;

    const sections = exam.sections || [];
    const questionFeedback: Record<string, GradeFeedback> = {};
    const sectionBreakdown: SectionBreakdown[] = [];
    const topicAccumulator = new Map<string, { earned: number; total: number }>();

    let earnedMarks = 0;
    let totalMarks = 0;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const section = sections[sectionIndex];
      const sectionQuestions = Array.isArray(section.questions) ? section.questions : [];

      let sectionEarned = 0;
      let sectionTotal = 0;
      let sectionCorrectCount = 0;

      for (let questionIndex = 0; questionIndex < sectionQuestions.length; questionIndex += 1) {
        const question = sectionQuestions[questionIndex];
        const qId = String(question.id || `q_${sectionIndex + 1}_${questionIndex + 1}`);
        const qType = normalizeQuestionType(question.type);
        const parsedAnswer = parseSubmittedAnswer(answerMap[qId]);
        const answer = parsedAnswer.answer;
        const marks = Math.max(1, Number(question.marks ?? question.points ?? 1) || 1);

        const feedback =
          qType === 'multiple_choice' || qType === 'true_false' || qType === 'fill_in_blank'
            ? gradeObjective(question, parsedAnswer)
            : gradeOpenResponse(question, answer);

        questionFeedback[qId] = feedback;
        sectionEarned += feedback.marksAwarded;
        sectionTotal += marks;
        if (feedback.isCorrect) sectionCorrectCount += 1;

        const topic = String(question.topic || section.title || section.name || 'General').trim() || 'General';
        const existing = topicAccumulator.get(topic) || { earned: 0, total: 0 };
        topicAccumulator.set(topic, {
          earned: existing.earned + feedback.marksAwarded,
          total: existing.total + marks,
        });
      }

      sectionBreakdown.push({
        sectionId: String(section.id || `section_${sectionIndex + 1}`),
        title: String(section.title || section.name || `Section ${sectionIndex + 1}`),
        earnedMarks: sectionEarned,
        totalMarks: sectionTotal,
        questionCount: sectionQuestions.length,
        correctCount: sectionCorrectCount,
      });

      earnedMarks += sectionEarned;
      totalMarks += sectionTotal;
    }

    if (Number.isFinite(Number(exam.totalMarks)) && Number(exam.totalMarks) > totalMarks) {
      totalMarks = Number(exam.totalMarks);
    }

    const percentage = totalMarks > 0 ? Math.round((earnedMarks / totalMarks) * 100) : 0;

    const topicFeedback: TopicFeedback[] = [...topicAccumulator.entries()]
      .map(([topic, stats]) => {
        const pct = stats.total > 0 ? Math.round((stats.earned / stats.total) * 100) : 0;
        return {
          topic,
          earnedMarks: stats.earned,
          totalMarks: stats.total,
          percentage: pct,
          priority: pct < 45 ? 'high' : pct < 70 ? 'medium' : 'low',
        };
      })
      .sort((a, b) => a.percentage - b.percentage);

    const weakTopics = topicFeedback.filter((item) => item.priority !== 'low').slice(0, 3);
    const recommendedPractice = [
      ...weakTopics.map(
        (item) => `Revise "${item.topic}" with 10 minutes of active recall and one written practice response.`,
      ),
    ];
    if (recommendedPractice.length === 0) {
      recommendedPractice.push('Great performance. Attempt a mixed revision paper to stretch mastery.');
    }

    const gradingStatus =
      Object.values(questionFeedback).some((entry) => entry.gradingMode === 'heuristic')
        ? 'completed_with_heuristic'
        : 'completed_deterministic';

    const sessionData = {
      examId,
      examSnapshot: exam,
      answers: answerMap,
      questionFeedback,
      sectionBreakdown,
      topicFeedback,
      recommendedPractice,
      gradingStatus,
      gradedAt: new Date().toISOString(),
    };

    let sessionId: string | null = null;
    let persistenceWarning: string | null = null;
    const preserveInProgress = toBoolean(body.preserveInProgress);

    try {
      const { data: existing } = await supabase
        .from('exam_sessions')
        .select('id, started_at')
        .eq('exam_id', examId)
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .maybeSingle();

      const updatePayload = {
        session_data: sessionData,
        status: preserveInProgress ? 'in_progress' : 'completed',
        completed_at: preserveInProgress ? null : new Date().toISOString(),
        total_marks: totalMarks,
        earned_marks: earnedMarks,
        preschool_id: effectiveSchoolId,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { data: updated, error: updateError } = await supabase
          .from('exam_sessions')
          .update(updatePayload)
          .eq('id', existing.id)
          .select('id')
          .single();
        if (updateError) throw updateError;
        sessionId = updated?.id || existing.id;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('exam_sessions')
          .insert({
            exam_id: examId,
            user_id: user.id,
            preschool_id: effectiveSchoolId,
            session_data: sessionData,
            status: preserveInProgress ? 'in_progress' : 'completed',
            started_at: new Date().toISOString(),
            completed_at: preserveInProgress ? null : new Date().toISOString(),
            total_marks: totalMarks,
            earned_marks: earnedMarks,
          })
          .select('id')
          .single();
        if (insertError) throw insertError;
        sessionId = inserted?.id || null;
      }
    } catch (persistError) {
      console.error('[grade-exam-attempt] failed to persist exam session', persistError);
      persistenceWarning = 'Attempt was graded, but cloud persistence failed.';
    }

    return jsonResponse(
      {
        success: true,
        examId,
        sessionId,
        earnedMarks,
        totalMarks,
        percentage,
        gradingStatus,
        questionFeedback,
        sectionBreakdown,
        topicFeedback,
        recommendedPractice,
        persistenceWarning,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error('[grade-exam-attempt] error', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500,
      corsHeaders,
    );
  }
});
