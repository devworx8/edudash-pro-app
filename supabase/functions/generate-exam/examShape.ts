import { normalizeQuestionType } from './examShared.ts';

function normalizeOptionText(value: unknown): string {
  return String(value || '')
    .replace(/^(?:\s*[A-D]\s*[\.\)\-:]\s*)+/i, '')
    .trim();
}

function normalizeComparableOption(value: unknown): string {
  return normalizeOptionText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractChoiceLetter(value: unknown): string | null {
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

function resolveChoiceLetter(value: unknown, options: string[]): string | null {
  const direct = extractChoiceLetter(value);
  if (direct) return direct;
  if (!Array.isArray(options) || options.length === 0) return null;
  const normalizedValue = normalizeComparableOption(value);
  if (!normalizedValue) return null;
  const idx = options.findIndex((option) => normalizeComparableOption(option) === normalizedValue);
  return idx >= 0 ? String.fromCharCode(97 + idx) : null;
}

export function normalizeExamShape(rawExam: any, grade: string, subject: string, examType: string) {
  const rawSections = Array.isArray(rawExam?.sections)
    ? rawExam.sections
    : Array.isArray(rawExam?.questions)
    ? [{ name: 'Section A', questions: rawExam.questions }]
    : [];

  let questionCounter = 0;
  const sections = rawSections.map((section: any, sectionIndex: number) => {
    const rawQuestions = Array.isArray(section?.questions) ? section.questions : [];
    const normalizedQuestions = rawQuestions.map((question: any, questionIndex: number) => {
      questionCounter += 1;
      const marks = Number(question?.marks ?? question?.points ?? question?.score ?? 1);
      const type = normalizeQuestionType(question?.type);
      const normalizedOptionObjects = Array.isArray(question?.options)
        ? question.options
            .map((item: unknown, optionIndex: number) => {
              if (item && typeof item === 'object' && !Array.isArray(item)) {
                const rawItem = item as Record<string, unknown>;
                const text = String(rawItem.text ?? rawItem.label ?? rawItem.value ?? '')
                  .replace(/^(?:\s*[A-D]\s*[\.\)\-:]\s*)+/i, '')
                  .trim();
                if (!text) return null;
                const explicitId = String(rawItem.id || '').trim().toUpperCase();
                return {
                  id: explicitId || String.fromCharCode(65 + optionIndex),
                  text,
                };
              }
              const text = String(item || '')
                .replace(/^(?:\s*[A-D]\s*[\.\)\-:]\s*)+/i, '')
                .trim();
              if (!text) return null;
              return {
                id: String.fromCharCode(65 + optionIndex),
                text,
              };
            })
            .filter((item): item is { id: string; text: string } => Boolean(item))
        : [];
      const options = normalizedOptionObjects.length > 0
        ? normalizedOptionObjects.map((option) => option.text)
        : undefined;
      const prompt = String(question?.question ?? question?.text ?? '').trim();
      const correctAnswer = String(question?.correctAnswer ?? question?.correct_answer ?? question?.answer ?? '');
      const inferredCorrectLetter = options
        ? resolveChoiceLetter(correctAnswer, options)
        : null;
      const explicitCorrectOptionId = String(question?.correctOptionId ?? question?.correct_option_id ?? '')
        .trim()
        .toUpperCase();
      const correctOptionId = explicitCorrectOptionId || (inferredCorrectLetter ? inferredCorrectLetter.toUpperCase() : undefined);

      return {
        id: String(question?.id || `q_${sectionIndex + 1}_${questionIndex + 1}`),
        question: prompt,
        text: prompt,
        type,
        marks: Number.isFinite(marks) ? Math.max(1, marks) : 1,
        options,
        optionObjects: normalizedOptionObjects.length > 0 ? normalizedOptionObjects : undefined,
        correctOptionId,
        correctAnswer,
        explanation: String(question?.explanation || '').trim() || undefined,
        visual:
          question?.visual && typeof question.visual === 'object'
            ? question.visual
            : undefined,
      };
    });

    const sectionMarks = normalizedQuestions.reduce((sum: number, question: any) => sum + Number(question.marks || 0), 0);

    return {
      id: String(section?.id || `section_${sectionIndex + 1}`),
      name: String(section?.name || section?.title || `Section ${sectionIndex + 1}`),
      title: String(section?.title || section?.name || `Section ${sectionIndex + 1}`),
      instructions: String(section?.instructions || '').trim() || undefined,
      readingPassage:
        String(section?.readingPassage || section?.reading_passage || '').trim() || undefined,
      questions: normalizedQuestions,
      totalMarks: sectionMarks,
    };
  });

  const totalMarks = sections.reduce((sum: number, section: any) => sum + Number(section.totalMarks || 0), 0);

  return {
    title: String(rawExam?.title || `${subject} ${examType.replace(/_/g, ' ')}`),
    grade,
    subject,
    duration: String(rawExam?.duration || '90 minutes'),
    totalMarks,
    sections,
  };
}
