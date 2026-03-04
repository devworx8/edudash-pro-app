import { normalizeText, sanitizeTopic } from './examShared.ts';
import type { ExamContextSummary } from './examTypes.ts';
import {
  getLanguageReadingFallback,
  isLanguageSubject,
  looksLikeLegacyMiaTumiPassage,
  normalizeLanguageLocale,
  resolveLanguageName,
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
