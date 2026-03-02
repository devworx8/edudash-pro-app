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

const SUPPORTED_QUESTION_TYPES = new Set([
  'multiple_choice',
  'true_false',
  'short_answer',
  'fill_in_blank',
]);

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
  if (!trimmed) return true;
  if (trimmed === '---') return true;
  if (/^\d{6,}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(trimmed)) return true;
  if (/^page\s+\d+$/i.test(trimmed)) return true;
  if (/^part\s+\d+$/i.test(trimmed)) return true;
  if (/^source:\s*$/i.test(trimmed)) return true;

  const noPrefix = stripOrdinalPrefix(trimmed).toLowerCase();
  return [
    'topics to revise',
    'key facts/formulas',
    'common mistakes',
    'suggested question angles',
  ].includes(noPrefix);
}

function extractUploadedStudyMaterialExcerpt(customPrompt?: string): string | null {
  const raw = String(customPrompt || '').trim();
  if (!raw) return null;

  const marker = 'study material extracted from uploaded images/pdfs:';
  const lower = raw.toLowerCase();
  const markerIndex = lower.indexOf(marker);
  if (markerIndex === -1) return null;

  let block = raw.slice(markerIndex + marker.length);
  const lowerBlock = block.toLowerCase();
  const stopMarkers = [
    '\n\nkeep all learner-facing content strictly in',
    '\n\nwhen generated content includes non-english terminology',
  ];
  let cutIndex = block.length;
  stopMarkers.forEach((stopMarker) => {
    const idx = lowerBlock.indexOf(stopMarker);
    if (idx >= 0) {
      cutIndex = Math.min(cutIndex, idx);
    }
  });

  block = block.slice(0, cutIndex).trim();
  if (!block) return null;

  const sourceLabelPattern = /^source:\s*/i;

  const lines = block
    .split(/\r?\n/)
    .map((line) => line.replace(sourceLabelPattern, '').trim())
    .map((line) => stripOrdinalPrefix(line))
    .map((line) => stripInlineTeacherTranslations(line))
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .filter((line) => !isLikelySourceMetaLine(line))
    .filter(Boolean);

  if (lines.length === 0) return null;

  const deduped: string[] = [];
  const seen = new Set<string>();
  lines.forEach((line) => {
    const normalized = normalizeText(line);
    if (normalized.length < 4 || seen.has(normalized)) return;
    seen.add(normalized);
    deduped.push(line);
  });

  const excerpt = deduped.join('\n').trim();
  if (excerpt.length < 60) return null;
  return excerpt.slice(0, 1400);
}

function extractUploadedMaterialFocusTopics(materialExcerpt: string | null): string[] {
  if (!materialExcerpt) return [];

  const candidates = materialExcerpt
    .split(/\r?\n|[.;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^[-*]\s*/, '').trim())
    .filter((part) => part.length >= 8 && part.length <= 80)
    .map((part) => sanitizeTopic(part))
    .filter((part): part is string => Boolean(part));

  return [...new Set(candidates)].slice(0, 6);
}
export function toUserFacingGenerationWarning(reason: string): string {
  const raw = String(reason || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return '';
  if (lower.includes('failed language/comprehension checks')) {
    return 'Quality checks found issues in the first draft, so Dash used a safer CAPS-aligned exam version.';
  }
  if (lower.includes('freemium plan limit reached')) {
    return 'You have reached your premium exam generation limit for this cycle, so a basic CAPS fallback was used.';
  }
  if (lower.includes('credits are currently depleted') || lower.includes('providers are currently unavailable')) {
    return 'AI provider capacity is temporarily limited, so Dash used a fallback exam version.';
  }
  if (lower.includes('malformed exam json')) {
    return 'The first draft could not be parsed correctly, so Dash used a fallback exam version.';
  }
  return raw;
}

export function buildLocalFallbackExam(
  grade: string,
  subject: string,
  examType: string,
  language: string,
  contextSummary: ExamContextSummary,
  customPrompt?: string,
) {
  const uploadedMaterialExcerpt = extractUploadedStudyMaterialExcerpt(customPrompt);
  if (isLanguageSubject(subject)) {
    const locale = normalizeLanguageLocale(language);
    const isAfrikaans = locale === 'af-ZA';
    const langLabel = resolveLanguageName(language);
    const materialTopics = extractUploadedMaterialFocusTopics(uploadedMaterialExcerpt);
    const fallbackFocusTopics = [...contextSummary.focusTopics, ...materialTopics]
      .map((topic) => sanitizeTopic(topic))
      .filter((topic): topic is string => Boolean(topic))
      .slice(0, 4);
    const hasLegacyUploadedPassage = looksLikeLegacyMiaTumiPassage(uploadedMaterialExcerpt);
    const useMaterialDrivenComprehension = Boolean(uploadedMaterialExcerpt) && !hasLegacyUploadedPassage;
    const readingFallback = getLanguageReadingFallback(language, { focusTopics: fallbackFocusTopics, grade });
    const comprehensionInstruction = useMaterialDrivenComprehension
      ? isAfrikaans
        ? 'Lees die klaswerkteks hieronder. Beantwoord die vrae met inligting uit die teks en jou klasnotas.'
        : 'Read the classwork text below. Answer questions using evidence from the text and class notes.'
      : readingFallback.instruction;
    const comprehensionPassage = useMaterialDrivenComprehension
      ? String(uploadedMaterialExcerpt || '').trim()
      : readingFallback.passage;
    const comprehensionQuestions = useMaterialDrivenComprehension
      ? isAfrikaans
        ? [
            {
              id: 'A1',
              type: 'short_answer',
              marks: 3,
              question: 'Wat is die hoofonderwerp van hierdie klaswerkteks?',
              correctAnswer: 'Noem die kerntema (bv. luister en praat/beleefde klasgesprek) met een kort verduideliking.',
              explanation: 'Die antwoord moet duidelik wys wat die lesinhoud en doel van die gesprek is.',
            },
            {
              id: 'A2',
              type: 'short_answer',
              marks: 3,
              question: 'Skryf twee beleefde uitdrukkings uit die teks neer.',
              correctAnswer: "Enige twee korrekte uitdrukkings direk uit die teks, bv. 'Goeie more', 'Baie dankie', 'Mag ek asseblief...'.",
              explanation: 'Krediet word gegee vir korrekte, teksgebaseerde beleefde frases.',
            },
            {
              id: 'A3',
              type: 'short_answer',
              marks: 3,
              question: "Waarom is die frase 'Mag ek asseblief' belangrik in die klas?",
              correctAnswer: 'Dit wys respek, goeie maniere en toepaslike versoektaal in die klas.',
              explanation: 'Die leerder moet die taalgebruik aan klasgedrag en respek koppel.',
            },
            {
              id: 'A4',
              type: 'short_answer',
              marks: 3,
              question: "Gee een voorbeeld uit die teks van 'n vraag en een voorbeeld van 'n antwoord.",
              correctAnswer: "Enige korrekte vraag-en-antwoord paar uit die klasdialoog, bv. 'Hoe gaan dit met julle?' / 'Goed dankie...'.",
              explanation: 'Antwoord moet uit die gegewe teks kom en beide dele bevat.',
            },
            {
              id: 'A5',
              type: 'short_answer',
              marks: 3,
              question: 'Skryf jou eie beleefde klaskamer-sin in dieselfde styl as die teks.',
              correctAnswer: "Enige grammatikaal korrekte, beleefde klaskamer-sin, bv. 'Juffrou, mag ek asseblief my boek gaan haal?'",
              explanation: 'Krediet vir toepaslike woordkeuse, beleefdheid en korrekte sinbou.',
            },
          ]
        : [
            {
              id: 'A1',
              type: 'short_answer',
              marks: 3,
              question: 'What is the main topic of this classwork text?',
              correctAnswer: 'State the core topic and explain it briefly using text evidence.',
              explanation: 'Answer should identify the lesson focus from the passage.',
            },
            {
              id: 'A2',
              type: 'short_answer',
              marks: 3,
              question: 'Write down two polite expressions from the text.',
              correctAnswer: 'Any two correct polite expressions quoted from the text.',
              explanation: 'Responses must be grounded in the provided classwork text.',
            },
            {
              id: 'A3',
              type: 'short_answer',
              marks: 3,
              question: "Why is the phrase 'May I please' important in classroom communication?",
              correctAnswer: 'It shows respect, good manners, and appropriate request language.',
              explanation: 'Learner should connect the phrase to respectful classroom behavior.',
            },
            {
              id: 'A4',
              type: 'short_answer',
              marks: 3,
              question: 'Give one example of a question and one example of an answer from the text.',
              correctAnswer: 'Any correct question-answer pair from the dialogue.',
              explanation: 'Both the question and answer must come from the passage.',
            },
            {
              id: 'A5',
              type: 'short_answer',
              marks: 3,
              question: 'Write your own polite classroom sentence in the same style as the text.',
              correctAnswer: 'Any grammatically correct and polite classroom sentence.',
              explanation: 'Credit for respectful language and correct sentence structure.',
            },
          ]
      : [
          {
            id: 'A1',
            type: 'multiple_choice',
            marks: 2,
            question: isAfrikaans
              ? 'Wat is die hoofonderwerp van die leesstuk?'
              : 'What is the main topic of the passage?',
            options: isAfrikaans
              ? ['Hoe om te reis', 'Klaswerk en samewerking', 'Sportuitslae', 'Winkelsentrum-reels']
              : ['How to travel', 'Classwork and teamwork', 'Sports results', 'Shopping mall rules'],
            correctAnswer: 'B',
            explanation: isAfrikaans
              ? 'Die teks fokus op klasaktiwiteite, studiegewoontes en samewerking.'
              : 'The passage focuses on classroom activities, study habits, and teamwork.',
          },
          {
            id: 'A2',
            type: 'multiple_choice',
            marks: 2,
            question: isAfrikaans
              ? 'Wat gebeur eerste in die teks?'
              : 'What happens first in the passage?',
            options: isAfrikaans
              ? ['Leerders hersien klaswerk', 'Leerders verlaat die klas', 'Leerders ontvang sertifikate', 'Leerders skryf eksamens klaar']
              : ['Learners review classwork', 'Learners leave class', 'Learners receive certificates', 'Learners finish final exams'],
            correctAnswer: 'A',
            explanation: isAfrikaans
              ? 'Die leesstuk begin met voorbereiding en hersiening van klaswerk.'
              : 'The reading starts with preparation and revision of classwork.',
          },
          {
            id: 'A3',
            type: 'multiple_choice',
            marks: 2,
            question: isAfrikaans
              ? 'Waarom werk die leerders in pare of groepe?'
              : 'Why do learners work in pairs or groups?',
            options: isAfrikaans
              ? ['Om vinniger klaar te maak sonder begrip', 'Om idees te deel en mekaar te help verstaan', 'Om minder vrae te beantwoord', 'Om huiswerk te vermy']
              : [
                  'To finish quickly without understanding',
                  'To share ideas and support understanding',
                  'To answer fewer questions',
                  'To avoid homework',
                ],
            correctAnswer: 'B',
            explanation: isAfrikaans
              ? 'Die teks beklemtoon samewerking en verduideliking van antwoorde.'
              : 'The passage emphasizes collaboration and explaining answers.',
          },
          {
            id: 'A4',
            type: 'short_answer',
            marks: 3,
            question: isAfrikaans
              ? 'Noem twee dinge wat die leerders doen om beter voor te berei.'
              : 'Name two things learners do to prepare better.',
            correctAnswer: isAfrikaans
              ? 'Enige twee korrekte antwoorde uit die teks, bv. hersiening, woordeskat-oefening, vrae beantwoord.'
              : 'Any two correct actions from the text, e.g. revision, vocabulary practice, answering questions.',
            explanation: isAfrikaans
              ? 'Antwoorde moet direk uit die leesstuk kom.'
              : 'Answers must be directly grounded in the passage.',
          },
          {
            id: 'A5',
            type: 'short_answer',
            marks: 3,
            question: isAfrikaans
              ? `Som die teks in ${langLabel} op in 2-3 sinne.`
              : `Summarize the passage in ${langLabel} using 2-3 sentences.`,
            correctAnswer: isAfrikaans
              ? 'n Kort, akkurate opsomming van die hoofpunte in die teks.'
              : 'A concise, accurate summary of the key ideas in the passage.',
            explanation: isAfrikaans
              ? "n Sterk antwoord noem voorbereiding, samewerking en taalgebruik."
              : 'A strong answer mentions preparation, collaboration, and language use.',
          },
        ];
    const examTypeLabel = (() => {
      const type = String(examType || 'practice_test').toLowerCase();
      if (isAfrikaans) {
        if (type === 'practice_test') return 'Oefentoets';
        if (type === 'flashcards') return 'Flitskaarte';
        if (type === 'revision_notes') return 'Hersieningsnotas';
        if (type === 'study_guide') return 'Studiegids';
      } else {
        if (type === 'practice_test') return 'Practice Test';
        if (type === 'flashcards') return 'Flashcards';
        if (type === 'revision_notes') return 'Revision Notes';
        if (type === 'study_guide') return 'Study Guide';
      }
      return examType.replace(/_/g, ' ');
    })();

    return {
      title: `${subject} ${examTypeLabel} ${isAfrikaans ? '(Terugval)' : '(Fallback)'}`,
      grade,
      subject,
      duration: '60 minutes',
      totalMarks: 50,
      sections: [
        {
          name: isAfrikaans ? 'Afdeling A: Leesbegrip' : 'Section A: Reading Comprehension',
          instructions: `${isAfrikaans ? 'Graad' : 'Grade'}: ${grade}. ${comprehensionInstruction}`,
          readingPassage: `${comprehensionPassage}\n\n${comprehensionInstruction}`,
          questions: comprehensionQuestions,
        },
        {
          name: isAfrikaans ? 'Afdeling B: Taalvaardighede' : 'Section B: Language Skills',
          questions: [
            {
              id: 'B1',
              type: 'multiple_choice',
              marks: 2,
              question: isAfrikaans
                ? 'Kies die beste sinoniem vir "noukeurig".'
                : 'Choose the best synonym for "carefully".',
              options: isAfrikaans
                ? ['Vinnig', 'Slordig', 'Met aandag', 'Luidrugtig']
                : ['Quickly', 'Carelessly', 'With attention', 'Loudly'],
              correctAnswer: 'C',
              explanation: isAfrikaans
                ? '"Noukeurig" beteken om iets met aandag te doen.'
                : 'Carefully means doing something with attention.',
            },
            {
              id: 'B2',
              type: 'fill_in_blank',
              marks: 2,
              question: isAfrikaans
                ? 'Voltooi die sin: In die leesstuk werk leerders _____ om mekaar te help.'
                : 'Complete the sentence: In the passage, learners work _____ to help one another.',
              correctAnswer: isAfrikaans ? 'saam' : 'together',
              explanation: isAfrikaans
                ? 'Die korrekte woord wys samewerking in die klas.'
                : 'The correct word reflects classroom collaboration.',
            },
            {
              id: 'B3',
              type: 'true_false',
              marks: 2,
              question: isAfrikaans
                ? 'Die leesstuk wys dat beplanning en oefening belangrik is vir leer.'
                : 'The passage shows that planning and practice are important for learning.',
              options: isAfrikaans ? ['Waar', 'Onwaar'] : ['True', 'False'],
              correctAnswer: isAfrikaans ? 'Waar' : 'True',
              explanation: isAfrikaans
                ? 'Die teks koppel voorbereiding aan beter begrip.'
                : 'The text links preparation to stronger understanding.',
            },
            {
              id: 'B4',
              type: 'short_answer',
              marks: 3,
              question: isAfrikaans
                ? 'Skryf een sin met die woord "saam".'
                : 'Write one sentence using the word "together".',
              correctAnswer: isAfrikaans
                ? 'Enige grammatikaal korrekte sin wat "saam" reg gebruik.'
                : 'Any grammatical sentence that correctly uses "together".',
              explanation: isAfrikaans
                ? 'Die sin moet betekenisvol en grammatikaal korrek wees.'
                : 'The sentence should be meaningful and grammatically correct.',
            },
            {
              id: 'B5',
              type: 'short_answer',
              marks: 3,
              question: isAfrikaans
                ? 'Verduidelik die stemming aan die einde van die storie.'
                : 'Explain the mood at the end of the story.',
              correctAnswer: isAfrikaans
                ? 'Die stemming is positief omdat die leerders selfvertroue bou en mekaar ondersteun.'
                : 'The mood is positive because learners build confidence and support one another.',
              explanation: isAfrikaans
                ? 'Krediet vir antwoorde wat toon hoe samewerking tot sukses lei.'
                : 'Credit for answers showing how collaboration leads to progress.',
            },
          ],
        },
        ...(fallbackFocusTopics.length > 0
          ? [
              {
                name: isAfrikaans
                  ? 'Afdeling C: Fokus uit jou studiemateriaal'
                  : 'Section C: Focus from your study material',
                questions: fallbackFocusTopics.map((topic, index) => ({
                  id: `C${index + 1}`,
                  type: 'short_answer',
                  marks: 2,
                  question: isAfrikaans
                    ? `Skryf 2 sinne oor "${topic}" en verbind dit met wat jy in klas geleer het.`
                    : `Write 2 sentences about "${topic}" and connect it to what you learned in class.`,
                  correctAnswer: isAfrikaans
                    ? `Noem "${topic}", verduidelik dit kortliks en gee een korrekte voorbeeld uit klaswerk.`
                    : `Mention "${topic}", explain it briefly, and give one correct classwork example.`,
                  explanation: isAfrikaans
                    ? 'Sterk antwoorde gebruik vakterme uit die leerder se studiemateriaal.'
                    : "Strong answers should use learner-specific study terminology from the provided material.",
                })),
              },
            ]
          : []),
      ],
    };
  }

  const focusTopics = contextSummary.focusTopics.length > 0
    ? contextSummary.focusTopics.slice(0, 10)
    : [
        `${subject} fundamentals`,
        `core ${subject} concepts`,
        `problem solving in ${subject}`,
      ];

  const weakTopics = contextSummary.weakTopics.slice(0, 3);
  const revisionTopics = [...new Set([...weakTopics, ...focusTopics])].slice(0, 10);

  const sectionAQuestions = focusTopics.slice(0, 10).map((topic, index) => ({
    id: `A${index + 1}`,
    type: 'multiple_choice',
    marks: 2,
    question: `Which option best matches a correct CAPS-level understanding of ${topic} in ${subject}?`,
    options: [
      `A basic fact without clear reasoning`,
      `A concept explained with correct terms and a clear example`,
      `An unrelated idea from another topic`,
      `A guess without subject vocabulary`,
    ],
    correctAnswer: 'B',
    explanation: `A strong CAPS-aligned answer should include accurate terminology and an example tied to ${topic}.`,
  }));

  const sectionBQuestions = revisionTopics.slice(0, 10).map((topic, index) => ({
    id: `B${index + 1}`,
    type: 'short_answer',
    marks: 3,
    question: `Write a short answer explaining one key idea about ${topic} and how it applies in ${subject}.`,
    correctAnswer: `A valid answer should define ${topic}, include one correct subject example, and use grade-appropriate vocabulary.`,
    explanation: `Use one definition, one worked/contextual example, and one sentence linking the idea back to ${subject}.`,
  }));

  return {
    title: `${subject} ${examType.replace(/_/g, ' ')} (Fallback)`,
    grade,
    subject,
    duration: '60 minutes',
    totalMarks: 50,
    sections: [
      {
        name: 'Section A: Multiple Choice',
        questions: sectionAQuestions,
      },
      {
        name: 'Section B: Short Answers',
        questions: sectionBQuestions,
      },
    ],
  };
}

export function parseGradeNumber(grade: string): number {
  const normalized = String(grade || '').toLowerCase().trim();
  if (!normalized) return 6;
  if (normalized === 'grade_r' || normalized === 'grader' || normalized === 'r') return 0;
  const match = normalized.match(/grade[_\s-]*(\d{1,2})/);
  if (match?.[1]) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }
  return 6;
}

export function getQuestionCountPolicy(grade: string, examType: string): { min: number; max: number } {
  const level = parseGradeNumber(grade);
  const type = String(examType || 'practice_test').toLowerCase();

  if (type === 'practice_test') {
    if (level >= 10) return { min: 28, max: 40 };
    if (level >= 7) return { min: 22, max: 30 };
    if (level >= 4) return { min: 20, max: 24 };
    return { min: 20, max: 24 };
  }

  if (type === 'flashcards') {
    if (level >= 10) return { min: 20, max: 32 };
    if (level >= 7) return { min: 20, max: 24 };
    return { min: 20, max: 24 };
  }

  if (type === 'study_guide') {
    if (level >= 10) return { min: 20, max: 24 };
    return { min: 20, max: 24 };
  }

  if (type === 'revision_notes') {
    if (level >= 10) return { min: 20, max: 24 };
    if (level >= 7) return { min: 20, max: 24 };
    return { min: 20, max: 24 };
  }

  return { min: 20, max: 24 };
}

export function getMinimumQuestionCount(grade: string, examType: string): number {
  return getQuestionCountPolicy(grade, examType).min;
}

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
    const cards: FlashcardItem[] = questions.slice(0, 40).map((item, index) => ({
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

export function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesSubject(candidate: string | null | undefined, requested: string): boolean {
  const c = normalizeText(candidate);
  const r = normalizeText(requested);

  if (!c || !r) return false;
  if (c.includes(r) || r.includes(c)) return true;

  const tokens = r.split(' ').filter((token) => token.length >= 4);
  if (tokens.length === 0) return false;
  return tokens.some((token) => c.includes(token));
}

export function parseDateValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isRecent(row: { due_date?: string | null; assigned_at?: string | null; created_at?: string | null }, lookbackMs: number): boolean {
  const values = [
    parseDateValue(row.due_date || null),
    parseDateValue(row.assigned_at || null),
    parseDateValue(row.created_at || null),
  ].filter((item): item is number => item !== null);

  if (values.length === 0) return true;
  return values.some((value) => value >= lookbackMs);
}

export function sanitizeTopic(value: string | null | undefined): string | null {
  const cleaned = String(value || '')
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 3) return null;
  if (cleaned.length > 80) return `${cleaned.slice(0, 77)}...`;
  return cleaned;
}

export function pickTopTopics(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}

export function normalizeQuestionType(type: string | null | undefined): string {
  const raw = String(type || 'short_answer').toLowerCase();
  if (raw === 'fill_blank') return 'fill_in_blank';
  if (raw === 'fill-in-the-blank') return 'fill_in_blank';
  if (raw === 'fillintheblank') return 'fill_in_blank';
  if (SUPPORTED_QUESTION_TYPES.has(raw)) return raw;
  if (raw.includes('true')) return 'true_false';
  if (raw.includes('multiple')) return 'multiple_choice';
  return 'short_answer';
}

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

const LANGUAGE_MARKERS: Record<string, string[]> = {
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
const STRICT_LANGUAGE_VALIDATION_LOCALES = new Set(Object.keys(LANGUAGE_MARKERS));

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

/** True if question text looks like a section instruction, not a real question */
export function isMetaPromptQuestion(qText: string): boolean {
  const trimmed = String(qText || '').trim();
  if (trimmed.length > 200) return false;
  return META_QUESTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Remove instruction/meta questions from sections; returns new exam. */
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

/**
 * Remove OCR/meta noise from learner-facing exam fields before integrity validation.
 * This reduces false language mismatches caused by helper labels and source markers.
 */
export function sanitizeLearnerFacingExamContent(exam: any): any {
  if (!exam || !Array.isArray(exam.sections)) return exam;

  const sections = exam.sections.map((section: any) => {
    const cleanedInstructions = cleanLearnerFacingBlock(section?.instructions);
    const cleanedPassage = cleanLearnerFacingBlock(section?.readingPassage || section?.reading_passage);
    const questions = Array.isArray(section?.questions)
      ? section.questions.map((question: any) => {
          const cleanedQuestion = cleanLearnerFacingBlock(question?.question || question?.text);
          const cleanedOptions = Array.isArray(question?.options)
            ? question.options
                .map((option: unknown) => cleanLearnerFacingLine(String(option || '')))
                .filter(Boolean)
            : question?.options;
          return {
            ...question,
            question: cleanedQuestion || String(question?.question || question?.text || '').trim(),
            options: cleanedOptions,
            correctAnswer: cleanLearnerFacingBlock(question?.correctAnswer || question?.correct_answer || question?.answer)
              || question?.correctAnswer
              || question?.correct_answer
              || question?.answer,
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

function looksLikeLegacyMiaTumiPassage(value: string): boolean {
  const normalized = normalizeText(value || '');
  if (!normalized) return false;

  if (LEGACY_MIA_TUMI_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  const hasNames = normalized.includes('mia') && normalized.includes('tumi');
  const hasLegacySetting =
    normalized.includes('plaas')
    || normalized.includes('farm')
    || normalized.includes('veranda')
    || normalized.includes('stoep');

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

  const existingPassage = String(first?.readingPassage || first?.reading_passage || first?.instructions || '').trim();
  const hasLegacyPassage = looksLikeLegacyMiaTumiPassage(existingPassage);
  if (existingPassage.length >= 120 && !hasLegacyPassage) return exam;

  const topicSeedText = [
    String(first?.title || first?.name || ''),
    String(first?.instructions || ''),
    ...(Array.isArray(first?.questions)
      ? first.questions
          .slice(0, 6)
          .map((question: any) => String(question?.question || question?.text || ''))
      : []),
  ]
    .filter(Boolean)
    .join('\n');
  const fallbackTopics = extractUploadedMaterialFocusTopics(topicSeedText);
  const fallback = getLanguageReadingFallback(language, { focusTopics: fallbackTopics, grade });
  first.readingPassage = `${fallback.passage}\n\n${fallback.instruction}`;
  first.instructions = fallback.instruction;
  return exam;
}

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

  if (passage.length >= 120) {
    const expectedLocale = normalizeLanguageLocale(language);
    const detectedLocale = detectLikelyLocale(passage);
    if (
      STRICT_LANGUAGE_VALIDATION_LOCALES.has(expectedLocale) &&
      detectedLocale &&
      detectedLocale !== expectedLocale
    ) {
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
      if (options.length > 0) {
        if (isInferentialComprehensionQuestion(qText)) {
          return;
        }

        if (!supportsGroundingCheck) {
          return;
        }

        factualOptionQuestionCount += 1;
        const combined = `${qText} ${options.map((option: unknown) => String(option || '')).join(' ')}`;
        if (!hasKeywordOverlap(combined, passageKeywords)) {
          factualOptionGroundingMisses.push(index + 1);
        }
      }
    });

    // Only fail grounding when it's systematic across multiple factual option questions.
    const groundingMissRatio =
      factualOptionQuestionCount > 0 ? factualOptionGroundingMisses.length / factualOptionQuestionCount : 0;
    if (
      factualOptionQuestionCount >= 4 &&
      factualOptionGroundingMisses.length >= 4 &&
      groundingMissRatio >= 0.85
    ) {
      const labels = factualOptionGroundingMisses.slice(0, 4).map((q) => `Q${q}`).join(', ');
      issues.push(`Comprehension options are weakly grounded in passage context (${labels}).`);
    }
  }

  return issues;
}

/**
 * If MCQ options in comprehension are weakly grounded, convert those items into
 * short-answer prompts anchored to passage evidence instead of hard failing.
 */
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
    if (!qText || options.length === 0 || isInferentialComprehensionQuestion(qText)) {
      return question;
    }

    const combined = `${qText} ${options.map((option: unknown) => String(option || '')).join(' ')}`;
    if (hasKeywordOverlap(combined, passageKeywords)) {
      return question;
    }

    changed += 1;
    const updated = { ...question } as Record<string, unknown>;
    delete updated.options;
    delete updated.optionObjects;
    delete updated.correctOptionId;
    delete updated.correct_option_id;

    const promptPrefix = locale === 'af-ZA'
      ? 'Gebruik inligting uit die leesstuk om te antwoord:'
      : 'Use evidence from the passage to answer:';

    updated.type = 'short_answer';
    updated.question = `${promptPrefix} ${qText}`.replace(/\s+/g, ' ').trim();
    updated.correctAnswer = locale === 'af-ZA'
      ? 'Enige antwoord wat korrekte teksbewyse uit die leesstuk gebruik.'
      : 'Any answer that uses accurate text evidence from the passage.';
    updated.explanation = locale === 'af-ZA'
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
      samples.push({
        label: `Section ${sectionIndex + 1} instructions`,
        text: String(section.instructions),
      });
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
        samples.push({
          label: `Question ${sectionIndex + 1}.${questionIndex + 1}`,
          text: String(question.question || question.text),
        });
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
    if (text.length < 24) continue;
    if (!hasEnoughLanguageSignal(text)) continue;

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
    // Strict mode is used for language-heavy papers. One confident mismatch is enough to fail.
    return mismatchCount >= 1 ? issues : [];
  }

  // Standard mode requires multiple mismatches to avoid false positives from short fragments.
  return mismatchCount >= 3 ? issues : [];
}

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

export function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) return jsonMatch[0].trim();

  throw new Error('No JSON payload found in AI response');
}

/** Attempt to repair common LLM JSON issues (trailing commas, control chars) */
export function repairJsonForParse(raw: string): string {
  let s = raw;
  // Remove trailing commas before } or ] (common LLM mistake)
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Remove control characters except newline and tab
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  return s;
}

/** Parse exam JSON with repair attempts to avoid malformed fallback */
export function parseExamJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(repairJsonForParse(raw));
    } catch {
      throw new Error('Parse failed after repair attempt');
    }
  }
}
