import { normalizeText } from './examShared.ts';
import {
  isLanguageSubject,
  LANGUAGE_MARKERS,
  normalizeLanguageLocale,
  resolveLanguageName,
  STRICT_LANGUAGE_VALIDATION_LOCALES,
} from './examLanguage.ts';

function stripOrdinalPrefix(line: string): string {
  return line.replace(/^\(?\d+\)?[.)\-:\s]+/, '').trim();
}

function stripInlineTeacherTranslations(line: string): string {
  return line
    .replace(/\((?:teacher|class|translation|english)\s*:[^)]*\)/gi, '')
    .replace(/\[(?:teacher|class|translation|english)\s*:[^\]]*\]/gi, '')
    .trim();
}

function isLikelySourceMetaLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed === '---') return true;
  if (/^\d{6,}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(trimmed)) return true;
  if (/^page\s+\d+$/i.test(trimmed) || /^part\s+\d+$/i.test(trimmed)) return true;
  if (/^source:\s*$/i.test(trimmed)) return true;

  const noPrefix = stripOrdinalPrefix(trimmed).toLowerCase();
  return [
    'topics to revise',
    'key facts/formulas',
    'common mistakes',
    'suggested question angles',
  ].includes(noPrefix);
}

const META_QUESTION_PATTERNS = [
  /read (the )?(passage|story|text)/i,
  /answer (the )?questions? (that )?follow/i,
  /lees die (storie|teks)/i,
  /beantwoord die vrae wat volg/i,
  /funda (umbhalo|ibali)/i,
  /phendula imibuzo/i,
  /bala kanegelo/i,
  /arabja dipotso/i,
];

export function isMetaPromptQuestion(qText: string): boolean {
  const trimmed = String(qText || '').trim();
  if (trimmed.length > 200) return false;
  return META_QUESTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function stripMetaPromptQuestions(exam: any): any {
  if (!exam?.sections?.length) return exam;
  const sections = exam.sections.map((section: any) => {
    const questions = Array.isArray(section?.questions)
      ? section.questions.filter((q: any) => !isMetaPromptQuestion(String(q?.question || q?.text || '').trim()))
      : section.questions || [];
    return { ...section, questions };
  });
  return { ...exam, sections };
}

function cleanLearnerFacingLine(line: string): string {
  return stripInlineTeacherTranslations(
    stripOrdinalPrefix(String(line || '').replace(/^source:\s*/i, '').trim()),
  )
    .replace(/\b(?:en|af|zu|xh|nso|tn|st|nr|ss|ve|ts)-za\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanLearnerFacingBlock(value: unknown): string {
  const lines = String(value || '')
    .split(/\r?\n/)
    .map((line) => cleanLearnerFacingLine(line))
    .filter(Boolean)
    .filter((line) => !isLikelySourceMetaLine(line));

  if (lines.length === 0) return '';
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function sanitizeLearnerFacingExamContent(exam: any): any {
  if (!exam || !Array.isArray(exam.sections)) return exam;

  const sections = exam.sections.map((section: any) => {
    const cleanedInstructions = cleanLearnerFacingBlock(section?.instructions);
    const cleanedPassage = cleanLearnerFacingBlock(section?.readingPassage || section?.reading_passage);
    const questions = Array.isArray(section?.questions)
      ? section.questions.map((question: any) => {
          const cleanedQuestion = cleanLearnerFacingBlock(question?.question || question?.text);
          const cleanedOptions = Array.isArray(question?.options)
            ? question.options.map((option: unknown) => cleanLearnerFacingLine(String(option || ''))).filter(Boolean)
            : question?.options;
          return {
            ...question,
            question: cleanedQuestion || String(question?.question || question?.text || '').trim(),
            options: cleanedOptions,
            correctAnswer:
              cleanLearnerFacingBlock(
                question?.correctAnswer || question?.correct_answer || question?.answer,
              ) ||
              question?.correctAnswer ||
              question?.correct_answer ||
              question?.answer,
            explanation: cleanLearnerFacingBlock(question?.explanation) || question?.explanation,
          };
        })
      : section?.questions;

    return {
      ...section,
      instructions: cleanedInstructions || section?.instructions,
      readingPassage: cleanedPassage || section?.readingPassage || section?.reading_passage,
      questions,
    };
  });

  return { ...exam, sections };
}

const COMMON_STOP_WORDS = new Set([
  'the', 'and', 'with', 'from', 'that', 'this', 'then', 'they', 'were', 'their', 'have', 'has', 'had',
  'for', 'into', 'over', 'under', 'after', 'before', 'while', 'when', 'what', 'which', 'where',
  'die', 'het', 'vir', 'hulle', 'ons', 'was', 'met', 'wat', 'wie', 'waar',
  'funda', 'bala', 'story', 'passage', 'storie', 'teks', 'question', 'questions', 'vrae', 'imibuzo', 'dipotso',
]);

export function tokenizeLanguageText(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export function detectLikelyLocale(text: string): string | null {
  const tokens = new Set(tokenizeLanguageText(text));
  let bestLocale: string | null = null;
  let bestScore = 0;

  Object.entries(LANGUAGE_MARKERS).forEach(([locale, markers]) => {
    const score = markers.reduce((sum, marker) => sum + (tokens.has(marker) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestLocale = locale;
    }
  });

  return bestScore >= 2 ? bestLocale : null;
}

function hasEnoughLanguageSignal(text: string): boolean {
  const tokens = tokenizeLanguageText(text);
  const alphaTokens = tokens.filter((token) => /[a-z]{3,}/i.test(token));
  return alphaTokens.length >= 5;
}

export function getPassageKeywords(passage: string): Set<string> {
  return new Set(
    tokenizeLanguageText(passage).filter((token) => token.length >= 4 && !COMMON_STOP_WORDS.has(token)),
  );
}

export function hasKeywordOverlap(text: string, keywords: Set<string>): boolean {
  if (!keywords.size) return true;
  const tokens = tokenizeLanguageText(text);
  return tokens.some((token) => keywords.has(token));
}

function isInferentialComprehensionQuestion(questionText: string): boolean {
  const normalized = normalizeText(questionText);
  if (!normalized) return false;

  const inferentialPatterns = [
    /\bwhy\b/,
    /\bhow\b/,
    /\bmain idea\b/,
    /\bbest title\b/,
    /\blesson\b/,
    /\bmoral\b/,
    /\bsummary\b/,
    /\bgevoel\b/,
    /\bstemming\b/,
    /\bboodskap\b/,
    /\bhoekom\b/,
    /\bhoe\b/,
    /\bhoofgedagte\b/,
    /\bopsom\b/,
    /\baflei\b/,
    /\bverduidelik\b/,
    /\bexplain\b/,
    /\binfer\b/,
  ];

  return inferentialPatterns.some((pattern) => pattern.test(normalized));
}

export function validateComprehensionIntegrity(exam: any, subject: string, language: string): string[] {
  const issues: string[] = [];
  if (!isLanguageSubject(subject)) return issues;

  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  if (sections.length === 0) return ['No sections found for language exam.'];

  const first = sections[0];
  const sectionTitle = normalizeText(first?.title || first?.name || '');
  const isComprehensionSection =
    sectionTitle.includes('comprehension') ||
    sectionTitle.includes('lees') ||
    sectionTitle.includes('read') ||
    sectionTitle.includes('begrip') ||
    sectionTitle.includes('funda') ||
    sectionTitle.includes('bala');

  const passage = String(first?.readingPassage || first?.reading_passage || '').trim();
  if (isComprehensionSection && passage.length < 120) {
    issues.push('Comprehension section is missing a valid reading passage.');
  }

  if (passage.length < 120) return issues;

  const expectedLocale = normalizeLanguageLocale(language);
  const detectedLocale = detectLikelyLocale(passage);
  if (STRICT_LANGUAGE_VALIDATION_LOCALES.has(expectedLocale) && detectedLocale && detectedLocale !== expectedLocale) {
    issues.push(`Reading passage language mismatch: expected ${expectedLocale}, detected ${detectedLocale}.`);
  }

  const passageKeywords = getPassageKeywords(passage);
  const supportsGroundingCheck = passageKeywords.size >= 12;
  const questions = Array.isArray(first?.questions) ? first.questions.slice(0, 6) : [];
  const factualOptionGroundingMisses: number[] = [];
  let factualOptionQuestionCount = 0;

  questions.forEach((question: any, index: number) => {
    const qText = String(question?.question || question?.text || '').trim();
    if (!qText) {
      issues.push(`Question ${index + 1} in comprehension section is empty.`);
      return;
    }
    if (isMetaPromptQuestion(qText)) {
      issues.push(`Question ${index + 1} is an instruction/meta prompt, not a real comprehension item.`);
    }

    const options = Array.isArray(question?.options) ? question.options : [];
    if (options.length === 0 || isInferentialComprehensionQuestion(qText) || !supportsGroundingCheck) return;

    factualOptionQuestionCount += 1;
    const combined = `${qText} ${options.map((option: unknown) => String(option || '')).join(' ')}`;
    if (!hasKeywordOverlap(combined, passageKeywords)) {
      factualOptionGroundingMisses.push(index + 1);
    }
  });

  const groundingMissRatio =
    factualOptionQuestionCount > 0 ? factualOptionGroundingMisses.length / factualOptionQuestionCount : 0;
  if (factualOptionQuestionCount >= 4 && factualOptionGroundingMisses.length >= 4 && groundingMissRatio >= 0.85) {
    const labels = factualOptionGroundingMisses.slice(0, 4).map((q) => `Q${q}`).join(', ');
    issues.push(`Comprehension options are weakly grounded in passage context (${labels}).`);
  }

  return issues;
}

export function softenWeakGroundingComprehensionOptions(exam: any, language: string): any {
  if (!exam || !Array.isArray(exam.sections) || exam.sections.length === 0) return exam;

  const locale = normalizeLanguageLocale(language);
  const sectionIndex = exam.sections.findIndex((section: any) => {
    const sectionTitle = normalizeText(section?.title || section?.name || '');
    return (
      sectionTitle.includes('comprehension') ||
      sectionTitle.includes('lees') ||
      sectionTitle.includes('read') ||
      sectionTitle.includes('begrip') ||
      sectionTitle.includes('funda') ||
      sectionTitle.includes('bala')
    );
  });
  if (sectionIndex < 0) return exam;

  const target = exam.sections[sectionIndex];
  const passage = String(target?.readingPassage || target?.reading_passage || '').trim();
  const passageKeywords = getPassageKeywords(passage);
  if (passageKeywords.size < 12) return exam;

  let changed = 0;
  const questions = Array.isArray(target?.questions) ? target.questions : [];
  const repairedQuestions = questions.map((question: any) => {
    const qText = String(question?.question || question?.text || '').trim();
    const options = Array.isArray(question?.options) ? question.options : [];
    if (!qText || options.length === 0 || isInferentialComprehensionQuestion(qText)) return question;

    const combined = `${qText} ${options.map((option: unknown) => String(option || '')).join(' ')}`;
    if (hasKeywordOverlap(combined, passageKeywords)) return question;

    changed += 1;
    const updated = { ...question } as Record<string, unknown>;
    delete updated.options;
    delete updated.optionObjects;
    delete updated.correctOptionId;
    delete updated.correct_option_id;

    const promptPrefix =
      locale === 'af-ZA' ? 'Gebruik inligting uit die leesstuk om te antwoord:' : 'Use evidence from the passage to answer:';

    updated.type = 'short_answer';
    updated.question = `${promptPrefix} ${qText}`.replace(/\s+/g, ' ').trim();
    updated.correctAnswer =
      locale === 'af-ZA'
        ? 'Enige antwoord wat korrekte teksbewyse uit die leesstuk gebruik.'
        : 'Any answer that uses accurate text evidence from the passage.';
    updated.explanation =
      locale === 'af-ZA'
        ? 'Krediet word gegee vir relevante bewyse uit die leesstuk en logiese verduideliking.'
        : 'Award credit for relevant passage evidence and a logical explanation.';
    return updated;
  });

  if (changed === 0) return exam;

  const sections = [...exam.sections];
  sections[sectionIndex] = {
    ...target,
    questions: repairedQuestions,
  };
  return { ...exam, sections };
}

export function validateLearnerLanguageConsistency(
  exam: any,
  subject: string,
  language: string,
  qualityMode: 'strict' | 'standard' = 'standard',
): string[] {
  const issues: string[] = [];
  if (!isLanguageSubject(subject)) return issues;

  const expectedLocale = normalizeLanguageLocale(language);
  if (!STRICT_LANGUAGE_VALIDATION_LOCALES.has(expectedLocale)) return issues;

  const samples: Array<{ label: string; text: string }> = [];
  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  sections.forEach((section: any, sectionIndex: number) => {
    if (section?.instructions) {
      samples.push({ label: `Section ${sectionIndex + 1} instructions`, text: String(section.instructions) });
    }
    if (section?.readingPassage || section?.reading_passage) {
      samples.push({
        label: `Section ${sectionIndex + 1} passage`,
        text: String(section.readingPassage || section.reading_passage),
      });
    }

    const questions = Array.isArray(section?.questions) ? section.questions : [];
    questions.slice(0, 12).forEach((question: any, questionIndex: number) => {
      if (question?.question || question?.text) {
        samples.push({ label: `Question ${sectionIndex + 1}.${questionIndex + 1}`, text: String(question.question || question.text) });
      }
      if (Array.isArray(question?.options) && question.options.length > 0) {
        samples.push({
          label: `Question ${sectionIndex + 1}.${questionIndex + 1} options`,
          text: question.options.map((option: unknown) => String(option || '')).join(' '),
        });
      }
    });
  });

  let mismatchCount = 0;
  for (const sample of samples) {
    const text = String(sample.text || '').trim();
    if (text.length < 24 || !hasEnoughLanguageSignal(text)) continue;

    const detectedLocale = detectLikelyLocale(text);
    if (detectedLocale && detectedLocale !== expectedLocale) {
      mismatchCount += 1;
      if (issues.length < 3) {
        issues.push(
          `${sample.label} appears to be ${resolveLanguageName(detectedLocale)} instead of ${resolveLanguageName(expectedLocale)}.`,
        );
      }
    }
  }

  if (qualityMode === 'strict') {
    return mismatchCount >= 1 ? issues : [];
  }
  return mismatchCount >= 3 ? issues : [];
}
