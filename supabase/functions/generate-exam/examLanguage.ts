import { normalizeText, sanitizeTopic } from './examShared.ts';

export function isLanguageSubject(subject: string): boolean {
  const normalized = normalizeText(subject);
  return (
    normalized.includes('language') ||
    normalized.includes('english') ||
    normalized.includes('afrikaans') ||
    normalized.includes('isizulu') ||
    normalized.includes('isixhosa') ||
    normalized.includes('sepedi')
  );
}

export function isMathSubject(subject: string): boolean {
  const normalized = normalizeText(subject);
  return (
    normalized.includes('mathematic') ||
    normalized.includes('algebra') ||
    normalized.includes('geometry') ||
    normalized.includes('trigonometry') ||
    normalized.includes('calculus')
  );
}

const LANGUAGE_ALIASES_TO_BCP47: Record<string, string> = {
  en: 'en-ZA',
  'en-za': 'en-ZA',
  english: 'en-ZA',
  af: 'af-ZA',
  'af-za': 'af-ZA',
  afrikaans: 'af-ZA',
  zu: 'zu-ZA',
  'zu-za': 'zu-ZA',
  isizulu: 'zu-ZA',
  xh: 'xh-ZA',
  'xh-za': 'xh-ZA',
  isixhosa: 'xh-ZA',
  nso: 'nso-ZA',
  'nso-za': 'nso-ZA',
  sepedi: 'nso-ZA',
  tn: 'tn-ZA',
  'tn-za': 'tn-ZA',
  setswana: 'tn-ZA',
  st: 'st-ZA',
  'st-za': 'st-ZA',
  sesotho: 'st-ZA',
  nr: 'nr-ZA',
  'nr-za': 'nr-ZA',
  ss: 'ss-ZA',
  'ss-za': 'ss-ZA',
  ve: 've-ZA',
  've-za': 've-ZA',
  ts: 'ts-ZA',
  'ts-za': 'ts-ZA',
};

const LOCALE_TO_LANGUAGE_NAME: Record<string, string> = {
  'en-ZA': 'English',
  'af-ZA': 'Afrikaans',
  'zu-ZA': 'isiZulu',
  'xh-ZA': 'isiXhosa',
  'nso-ZA': 'Sepedi',
  'tn-ZA': 'Setswana',
  'st-ZA': 'Sesotho',
  'nr-ZA': 'isiNdebele',
  'ss-ZA': 'Siswati',
  've-ZA': 'Tshivenda',
  'ts-ZA': 'Xitsonga',
};

export const LANGUAGE_MARKERS: Record<string, string[]> = {
  'en-ZA': ['the', 'and', 'with', 'they', 'read', 'answer', 'questions', 'story'],
  'af-ZA': [
    'die',
    'en',
    'met',
    'hulle',
    'lees',
    'beantwoord',
    'vrae',
    'storie',
    'afrikaans',
    'asseblief',
    'goeie',
    'juffrou',
    'klas',
    'baie',
    'dankie',
    'sorgvuldig',
    'antwoord',
    'sin',
  ],
  'zu-ZA': ['funda', 'umbhalo', 'indaba', 'imibuzo', 'kanye', 'bona', 'ngoba', 'kule'],
  'xh-ZA': ['funda', 'ibali', 'imibuzo', 'kwaye', 'bona', 'kuba', 'kule', 'ngoko'],
  'nso-ZA': ['bala', 'kanegelo', 'dipotso', 'gomme', 'bona', 'ka', 'go', 'le'],
  'tn-ZA': ['bala', 'potso', 'mme', 'bona', 'go', 'le', 'leina', 'palo'],
  'st-ZA': ['bala', 'dipotso', 'mme', 'bona', 'ho', 'le', 'pale', 'kahoo'],
  'nr-ZA': ['funda', 'ibali', 'imibuzo', 'kanye', 'ngaphambi', 'ekhaya', 'bahleka', 'ndawonye'],
  'ss-ZA': ['fundza', 'indzaba', 'imibuto', 'kanye', 'babuya', 'ekhaya', 'bahleka', 'ndzawonye'],
  've-ZA': ['vhala', 'bugu', 'mbudziso', 'na', 'hayani', 'murahu', 'vho', 'fhedza'],
  'ts-ZA': ['hlaya', 'xitori', 'swivutiso', 'naswona', 'ekhaya', 'va', 'endzhaku', 'hlekile'],
};

export const STRICT_LANGUAGE_VALIDATION_LOCALES = new Set(Object.keys(LANGUAGE_MARKERS));

export function normalizeLanguageLocale(language: string): string {
  const raw = String(language || '').trim();
  if (!raw) return 'en-ZA';
  if (LOCALE_TO_LANGUAGE_NAME[raw]) return raw;
  const lower = raw.toLowerCase();
  return LANGUAGE_ALIASES_TO_BCP47[lower] || 'en-ZA';
}

export function resolveLanguageName(language: string): string {
  const locale = normalizeLanguageLocale(language);
  return LOCALE_TO_LANGUAGE_NAME[locale] || 'English';
}

const LEGACY_MIA_TUMI_MARKERS = [
  'mia en haar broer, tumi',
  'mia and her brother, tumi',
  'oupa se plaas',
  "grandfather's farm",
  'waarheen het mia en tumi',
  'where did mia and tumi',
];

export function looksLikeLegacyMiaTumiPassage(value: string): boolean {
  const normalized = normalizeText(value || '');
  if (!normalized) return false;

  if (LEGACY_MIA_TUMI_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  const hasNames = normalized.includes('mia') && normalized.includes('tumi');
  const hasLegacySetting =
    normalized.includes('plaas') ||
    normalized.includes('farm') ||
    normalized.includes('veranda') ||
    normalized.includes('stoep');

  return hasNames && hasLegacySetting;
}

function resolveFallbackFocusTopic(focusTopics: string[] | undefined, locale: string): string {
  const candidate = (focusTopics || [])
    .map((topic) => sanitizeTopic(topic))
    .find((topic): topic is string => Boolean(topic && topic.length >= 3));

  if (candidate) return candidate;
  return locale === 'af-ZA' ? 'klaswerk en taalvaardighede' : 'classwork and language skills';
}

export function getLanguageReadingFallback(
  language: string,
  options?: { focusTopics?: string[]; grade?: string },
): { passage: string; instruction: string } {
  const locale = normalizeLanguageLocale(language);
  const safeLanguageLabel = resolveLanguageName(locale);
  const focusTopic = resolveFallbackFocusTopic(options?.focusTopics, locale);
  const gradeLabel = String(options?.grade || '').replace(/_/g, ' ').trim();

  if (locale === 'af-ZA') {
    const gradeSentence = gradeLabel
      ? `Hierdie leesstuk is aangepas vir ${gradeLabel}.`
      : 'Hierdie leesstuk is aangepas vir die leerder se graadvlak.';
    return {
      passage: `Lees die klaswerkteks hieronder en beantwoord die vrae wat volg.

Die klas fokus hierdie week op ${focusTopic}. ${gradeSentence}
Leerders hersien notas, oefen sleutelwoordeskat en verduidelik antwoorde in volledige sinne.
Hulle werk saam in pare om antwoorde te vergelyk, foute reg te stel en beleefde klasgesprekke te oefen.
Aan die einde van die les skryf elke leerder een kort refleksie oor wat verbeter het en wat nog hersien moet word.`,
      instruction: 'Lees die teks sorgvuldig en antwoord in Afrikaans.',
    };
  }

  const gradeSentence = gradeLabel
    ? `This passage is aligned to ${gradeLabel}.`
    : 'This passage is aligned to the learner grade level.';
  return {
    passage: `Read the classwork passage below and answer the questions that follow.

This week the class is focusing on ${focusTopic}. ${gradeSentence}
Learners review notes, practise key vocabulary, and explain answers using full sentences.
They work in pairs to compare ideas, correct mistakes, and improve respectful classroom communication.
At the end of the lesson, each learner writes a brief reflection on what improved and what still needs revision.`,
    instruction: `Read the passage carefully and answer in ${safeLanguageLabel}.`,
  };
}

function extractFallbackTopicsFromSeed(seed: string): string[] {
  const candidates = String(seed || '')
    .split(/\r?\n|[.;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^[-*]\s*/, '').trim())
    .map((part) => sanitizeTopic(part))
    .filter((part): part is string => Boolean(part));
  return [...new Set(candidates)].slice(0, 6);
}

export function ensureLanguageReadingPassage(exam: any, subject: string, grade: string, language: string) {
  if (!isLanguageSubject(subject)) return exam;

  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  if (sections.length === 0) return exam;

  const first = sections[0];
  const sectionTitle = normalizeText(first?.title || first?.name || '');
  const needsPassage =
    sectionTitle.includes('lees') ||
    sectionTitle.includes('read') ||
    sectionTitle.includes('comprehension') ||
    sectionTitle.includes('begrip') ||
    sections.some((section: any) => normalizeText(section?.title || '').includes('lees')) ||
    sections.some((section: any) => normalizeText(section?.title || '').includes('read'));

  if (!needsPassage) return exam;

  const existingPassage = String(
    first?.readingPassage || first?.reading_passage || first?.instructions || '',
  ).trim();
  const hasLegacyPassage = looksLikeLegacyMiaTumiPassage(existingPassage);
  if (existingPassage.length >= 120 && !hasLegacyPassage) return exam;

  const topicSeedText = [
    String(first?.title || first?.name || ''),
    String(first?.instructions || ''),
    ...(Array.isArray(first?.questions)
      ? first.questions.slice(0, 6).map((question: any) => String(question?.question || question?.text || ''))
      : []),
  ]
    .filter(Boolean)
    .join('\n');

  const fallbackTopics = extractFallbackTopicsFromSeed(topicSeedText);
  const fallback = getLanguageReadingFallback(language, { focusTopics: fallbackTopics, grade });
  first.readingPassage = `${fallback.passage}\n\n${fallback.instruction}`;
  first.instructions = fallback.instruction;
  return exam;
}
