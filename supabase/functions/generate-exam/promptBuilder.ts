import {
  getQuestionCountPolicy,
  isMathSubject,
  normalizeLanguageLocale,
  normalizeText,
  resolveLanguageName,
} from './examUtils.ts';

export type ExamContextSummary = {
  assignmentCount: number;
  lessonCount: number;
  focusTopics: string[];
  weakTopics: string[];
  sourceAssignmentIds: string[];
  sourceLessonIds: string[];
  intentTaggedCount?: number;
};
export function getSubjectSectionStructure(subject: string, grade: string, examType: string): string | null {
  const s = normalizeText(subject);

  // Afrikaans (Home Language & First Additional)
  if (s.includes('afrikaans')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Afrikaans - CAPS/DBE):
- Section A: Leesbegrip (Reading Comprehension) – include a short passage/story in section instructions, then comprehension questions. Target ~15 marks.
- Section B: Taalstrukture en -konvensies (Language Structures and Conventions) – grammar, punctuation, sentence structure. Target ~15 marks.
- Section C: Woordeskat (Vocabulary) – word meaning, synonyms, context, idioms. Target ~10 marks.
- Section D: Skryfwerk (Writing) – short written task (paragraph, letter, or descriptive piece). Target ~10 marks.
- Total ~50 marks, 60 minutes. Questions and passage in Afrikaans where appropriate. Provide correctAnswer and explanation for each question.`;
  }

  // English (Home Language & First Additional)
  if (s.includes('english')) {
    return `SUBJECT-SPECIFIC STRUCTURE (English - CAPS/DBE):
- Section A: Reading Comprehension – include a short passage/story in section instructions, then comprehension questions. Target ~15 marks.
- Section B: Language Structures and Conventions – grammar, punctuation, sentence structure. Target ~15 marks.
- Section C: Vocabulary – word meaning, synonyms, context, idioms. Target ~10 marks.
- Section D: Writing – short written task (paragraph, letter, or descriptive piece). Target ~10 marks.
- Total ~50 marks, 60 minutes. Provide correctAnswer and explanation for each question.`;
  }

  // isiZulu, isiXhosa, Sepedi (Home Language & First Additional)
  if (s.includes('isizulu') || s.includes('isixhosa') || s.includes('sepedi')) {
    const langName = s.includes('isizulu') ? 'isiZulu' : s.includes('isixhosa') ? 'isiXhosa' : 'Sepedi';
    return `SUBJECT-SPECIFIC STRUCTURE (${langName} - CAPS/DBE):
- Section A: Ukufunda nokuqonda / Ukuqonda okufundiweyo / Tlhaloso ya go bala (Reading Comprehension) – include a short passage/story in section instructions. Target ~15 marks.
- Section B: Izakhiwo zolimi / Iindlela zolimi / Dikopano tša polelo (Language Structures and Conventions) – grammar, punctuation. Target ~15 marks.
- Section C: Amagama / Amazwi / Mantšu (Vocabulary) – word meaning, context. Target ~10 marks.
- Section D: Ukubhala / Ukubhala / Go ngwala (Writing) – short written task. Target ~10 marks.
- Total ~50 marks, 60 minutes. Questions and passage in ${langName} where appropriate. Provide correctAnswer and explanation for each question.`;
  }

  // Mathematics & Mathematical Literacy
  if (s.includes('mathematic') && !s.includes('literacy')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Mathematics - CAPS/DBE):
- Section A: Multiple Choice – short objective questions covering core topics. Target ~40% of marks.
- Section B: Short Questions – calculations, working must be shown. Target ~35% of marks.
- Section C: Problem Solving / Long Questions – multi-step problems, reasoning, proofs where applicable. Target ~25% of marks.
- Include mark allocation per question. Use age-appropriate cognitive level. Provide correctAnswer and explanation for each question.`;
  }
  if (s.includes('mathematical') && s.includes('literacy')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Mathematical Literacy - CAPS/DBE):
- Section A: Multiple Choice – real-world contexts (budgets, maps, data). Target ~40% of marks.
- Section B: Short Questions – calculations in context. Target ~35% of marks.
- Section C: Long Questions – extended real-life scenarios. Target ~25% of marks.
- Use South African contexts. Provide correctAnswer and explanation for each question.`;
  }

  // Natural Sciences, Physical Sciences, Life Sciences
  if (s.includes('physical science') || s.includes('life science') || (s.includes('natural science') && !s.includes('technology'))) {
    const subj = s.includes('physical') ? 'Physical Sciences' : s.includes('life science') ? 'Life Sciences' : 'Natural Sciences';
    return `SUBJECT-SPECIFIC STRUCTURE (${subj} - CAPS/DBE):
- Section A: Multiple Choice – concepts, definitions, recall. Target ~40% of marks.
- Section B: Short Questions – calculations, diagrams, short explanations. Target ~35% of marks.
- Section C: Long Questions / Data Response – extended reasoning, experiments, data analysis. Target ~25% of marks.
- Include correctAnswer and explanation for each question. Use scientific terminology.`;
  }
  if (s.includes('natural science') && s.includes('technology')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Natural Sciences & Technology - CAPS/DBE):
- Section A: Multiple Choice – science and technology concepts. Target ~40% of marks.
- Section B: Short Questions – practical applications, simple investigations. Target ~35% of marks.
- Section C: Design/Problem Solving – technology task or extended science question. Target ~25% of marks.
- Provide correctAnswer and explanation for each question.`;
  }

  // History
  if (s.includes('history')) {
    return `SUBJECT-SPECIFIC STRUCTURE (History - CAPS/DBE):
- Section A: Source-based Questions – analyse sources (text, image, map). Target ~50% of marks.
- Section B: Essay / Extended Writing – structured essay from given topics. Target ~50% of marks.
- Include source material in section instructions where applicable. Provide correctAnswer and explanation for each question.`;
  }

  // Geography
  if (s.includes('geography')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Geography - CAPS/DBE):
- Section A: Map Work & Short Questions – map skills, calculations, short answers. Target ~45% of marks.
- Section B: Data Response & Essay – data interpretation, extended writing. Target ~55% of marks.
- Include map/data contexts. Provide correctAnswer and explanation for each question.`;
  }

  // Economic & Management Sciences (EMS - Senior Phase) - check before Economics
  if (s.includes('economic') && s.includes('management')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Economic & Management Sciences - CAPS/DBE):
- Section A: Multiple Choice – EMS concepts. Target ~30% of marks.
- Section B: Short Questions – economy, entrepreneurship, accounting basics. Target ~40% of marks.
- Section C: Case / Extended – integrated EMS task. Target ~30% of marks.
- Provide correctAnswer and explanation for each question.`;
  }

  // Accounting
  if (s.includes('accounting')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Accounting - CAPS/DBE):
- Section A: Multiple Choice – concepts, theory. Target ~25% of marks.
- Section B: Short Questions – calculations, ledger entries, ratios. Target ~40% of marks.
- Section C: Case Study / Long Questions – integrated tasks, financial statements. Target ~35% of marks.
- Provide correctAnswer and explanation for each question.`;
  }

  // Business Studies & Economics
  if (s.includes('business study') || s.includes('economic')) {
    const subj = s.includes('business') ? 'Business Studies' : 'Economics';
    return `SUBJECT-SPECIFIC STRUCTURE (${subj} - CAPS/DBE):
- Section A: Multiple Choice – concepts, definitions. Target ~30% of marks.
- Section B: Short Questions – case snippets, calculations. Target ~40% of marks.
- Section C: Essay / Extended – case study or essay. Target ~30% of marks.
- Use South African business/economic contexts. Provide correctAnswer and explanation for each question.`;
  }

  // Technology, CAT, IT
  if (s.includes('technology') || s.includes('computer application') || s.includes('information technology')) {
    const subj = s.includes('computer') ? 'Computer Applications Technology' : s.includes('information') ? 'Information Technology' : 'Technology';
    return `SUBJECT-SPECIFIC STRUCTURE (${subj} - CAPS/DBE):
- Section A: Multiple Choice – theory, terminology, concepts. Target ~40% of marks.
- Section B: Short Questions – practical applications, problem solving. Target ~35% of marks.
- Section C: Extended / Scenario – real-world task or project-type question. Target ~25% of marks.
- Provide correctAnswer and explanation for each question.`;
  }

  // Life Orientation & Life Skills
  if (s.includes('life orientation') || s.includes('life skill')) {
    const subj = s.includes('orientation') ? 'Life Orientation' : 'Life Skills';
    return `SUBJECT-SPECIFIC STRUCTURE (${subj} - CAPS/DBE):
- Section A: Multiple Choice – development, health, citizenship, study skills. Target ~40% of marks.
- Section B: Short Questions – scenario-based, reflective. Target ~35% of marks.
- Section C: Extended – project-type or essay on life skills topics. Target ~25% of marks.
- Use age-appropriate, inclusive contexts. Provide correctAnswer and explanation for each question.`;
  }

  // Creative Arts
  if (s.includes('creative art')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Creative Arts - CAPS/DBE):
- Section A: Multiple Choice – art forms, terminology, theory. Target ~40% of marks.
- Section B: Short Questions – analysis, practical knowledge. Target ~35% of marks.
- Section C: Extended – creative task or analysis. Target ~25% of marks.
- Cover performing and visual arts. Provide correctAnswer and explanation for each question.`;
  }

  // Tourism
  if (s.includes('tourism')) {
    return `SUBJECT-SPECIFIC STRUCTURE (Tourism - CAPS/DBE):
- Section A: Multiple Choice – tourism concepts, destinations. Target ~40% of marks.
- Section B: Short Questions – map work, calculations, scenarios. Target ~35% of marks.
- Section C: Extended – case study, itinerary, report. Target ~25% of marks.
- Use South African and global contexts. Provide correctAnswer and explanation for each question.`;
  }

  return null;
}

export function buildUserPrompt(payload: {
  grade: string;
  subject: string;
  examType: string;
  language: string;
  customPrompt?: string;
  contextSummary: ExamContextSummary;
  useTeacherContext: boolean;
  fullPaperMode: boolean;
  guidedMode: 'guided_first' | 'memo_first';
}) {
  const countPolicy = getQuestionCountPolicy(payload.grade, payload.examType);
  const locale = normalizeLanguageLocale(payload.language);
  const languageName = resolveLanguageName(payload.language);
  const base = [
    `Generate a ${payload.examType} exam for ${payload.grade}.`,
    `Subject: ${payload.subject}.`,
    `Language: ${languageName} (${locale}).`,
    `Write ALL learner-facing content in ${languageName} only (questions, options, section headings, instructions, and memorandum text).`,
    `Do not mix learner-facing languages. If target language is not English, avoid English filler words, labels, or prefixes.`,
    `Minimum total questions required: ${countPolicy.min}.`,
    `Maximum total questions allowed: ${countPolicy.max}.`,
    'Align strictly to CAPS/DBE outcomes and cognitive level for this grade.',
    'Include a balanced progression from foundational to challenging items.',
    payload.fullPaperMode
      ? 'Full-paper mode is ON: include formal section progression and realistic exam pacing.'
      : 'Use compact paper mode with high quality question diversity.',
    'Target mark distribution: objective 45-60%, short response 25-35%, extended response 10-20%.',
    'For language subjects with comprehension, include a passage/story in section instructions.',
    'Never use locale codes (like en-ZA/af-ZA) inside learner-facing instructions or questions.',
    'Do not duplicate option letters inside option strings.',
    'Always include explanation for each answer key item.',
  ];

  if (isMathSubject(payload.subject)) {
    base.push(
      'For mathematical notation, wrap inline maths in $...$ and display maths in $$...$$.',
      'Use KaTeX-compatible LaTeX (e.g., \\frac{a}{b}, \\sqrt{x}, x^2, \\times, \\div).',
      'Render fractions using \\frac{numerator}{denominator}; avoid malformed stacked text or plain slash fractions when mathematical fractions are intended.',
      'Ensure each equation/expression is syntactically valid KaTeX and can render without parse errors.',
      'Do not place plain-language words inside math delimiters.',
    );
  }

  const subjectStructure = getSubjectSectionStructure(payload.subject, payload.grade, payload.examType);
  if (subjectStructure) {
    base.push(subjectStructure);
  }

  if (payload.useTeacherContext) {
    const focus = payload.contextSummary.focusTopics.length > 0
      ? payload.contextSummary.focusTopics.join(', ')
      : 'No explicit focus topics available';
    const weak = payload.contextSummary.weakTopics.length > 0
      ? payload.contextSummary.weakTopics.join(', ')
      : 'No weak-topic signals available';

    base.push(
      `Teacher artifacts discovered: ${payload.contextSummary.assignmentCount} assignments and ${payload.contextSummary.lessonCount} lessons.`,
      `Prioritize these taught/assigned focus topics: ${focus}.`,
      `Reinforce these weak topics with scaffolded questions: ${weak}.`,
      'Weight about 70% of marks to taught artifacts and 30% to broader CAPS mastery checks.',
    );
  } else {
    base.push('Teacher artifact context is disabled. Build from CAPS baseline only.');
  }

  base.push(
    payload.guidedMode === 'guided_first'
      ? 'Guided-first policy: hints should be prioritized before full memo style explanations.'
      : 'Memo-first mode allowed.',
  );

  if (payload.customPrompt) {
    const hasUploadedMaterial =
      payload.customPrompt.includes('Study material extracted') ||
      payload.customPrompt.includes('uploaded images') ||
      payload.customPrompt.includes('uploaded material') ||
      payload.customPrompt.includes('Study Notes');
    if (hasUploadedMaterial) {
      base.push(
        'CRITICAL: You MUST base all questions STRICTLY on the provided study material, images, and PDFs. Do NOT introduce content from generic CAPS curriculum that is not present in the provided material. All questions must be answerable from the uploaded context alone. Prioritize the provided teacher context and uploaded material over general knowledge.',
        'Do NOT include OCR scaffolding labels in learner-facing content (e.g., "Topics to revise", "Key facts/formulas", "Common mistakes", "Suggested question angles", source filenames, or page markers).',
        'If the source contains dialogue/classwork lines, convert them into clean learner-friendly passage text before asking comprehension questions.',
        'Do not include translation helper notes like "(Teacher: ...)" or "(Class: ...)" in the final exam.',
      );
    }
    base.push(`Additional instructions: ${payload.customPrompt}`);
  }

  base.push('Return only strict JSON matching the required schema. Do not use trailing commas. Output valid JSON with no markdown wrapping or extra text.');

  return base.join('\n');
}
