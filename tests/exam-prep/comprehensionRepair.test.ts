import {
  sanitizeLearnerFacingExamContent,
  softenWeakGroundingComprehensionOptions,
  validateComprehensionIntegrity,
} from '@/supabase/functions/generate-exam/examUtils';

const passageText = `Mia en Tumi het vroeg by Oupa se plaas gewerk. Hulle het hoenders gevoer, groente geplant, die kraal skoongemaak, water gedra, gereedskap gepak en notas vir klaswerk geskryf. Later het hulle onder die veranda stories geluister en nuwe woordeskat geoefen. Voor sononder het Ouma sop bedien en almal het saam huis toe gegaan met idees vir die volgende luister en praat aktiwiteit, toestemming vraag en weeklikse oefening.`;

describe('generate-exam comprehension repair utilities', () => {
  it('sanitizes learner-facing OCR/meta noise', () => {
    const payload = {
      sections: [
        {
          title: 'Afdeling A: Leesbegrip',
          instructions:
            'source:\n1000196183.jpg\nen-ZA\n(1) Topics to revise\nLees die teks sorgvuldig. (Teacher: Read carefully.)',
          readingPassage: passageText,
          questions: [
            {
              question: '1) Juffrou: Goeie môre klas. (Teacher: Good morning class.)',
              options: ['[Class: Goeie môre Juffrou]', 'Ons antwoord in Afrikaans.'],
              correctAnswer: '(English: Good morning teacher)',
              explanation: '(Teacher: Give credit for clear evidence.)',
            },
          ],
        },
      ],
    };

    const sanitized = sanitizeLearnerFacingExamContent(payload);
    const instructions = String(sanitized.sections?.[0]?.instructions || '');
    const question = String(sanitized.sections?.[0]?.questions?.[0]?.question || '');
    const optionA = String(sanitized.sections?.[0]?.questions?.[0]?.options?.[0] || '');

    expect(instructions).not.toMatch(/teacher|en-za|topics to revise|1000196183/i);
    expect(question).not.toMatch(/teacher:/i);
    expect(optionA).not.toMatch(/class:/i);
  });

  it('does not fail weak-grounding check when only 3 factual MCQs miss passage overlap', () => {
    const exam = {
      sections: [
        {
          title: 'Afdeling A: Leesbegrip',
          readingPassage: passageText,
          questions: [
            {
              question: 'Watter planeet is die warmste?',
              options: ['Mercury', 'Venus', 'Mars', 'Jupiter'],
            },
            {
              question: 'Hoeveel mane het Saturnus?',
              options: ['10', '24', '82', '101'],
            },
            {
              question: "Wat dryf 'n vuurpyl aan?",
              options: ['Stoom', 'Brandstof', 'Wind', 'Helium'],
            },
          ],
        },
      ],
    };

    const issues = validateComprehensionIntegrity(
      exam,
      'Afrikaans First Additional Language',
      'af-ZA',
    );

    expect(issues.join(' ')).not.toContain('weakly grounded in passage context');
  });

  it('flags weak grounding only when issue is systematic', () => {
    const exam = {
      sections: [
        {
          title: 'Afdeling A: Leesbegrip',
          readingPassage: passageText,
          questions: [
            {
              question: 'Watter planeet is die warmste?',
              options: ['Mercury', 'Venus', 'Mars', 'Jupiter'],
            },
            {
              question: 'Hoeveel mane het Saturnus?',
              options: ['10', '24', '82', '101'],
            },
            {
              question: "Wat dryf 'n vuurpyl aan?",
              options: ['Stoom', 'Brandstof', 'Wind', 'Helium'],
            },
            {
              question: 'Watter teleskoop is in die ruimte?',
              options: ['Hubble', 'Kepler', 'Apollo', 'Voyager'],
            },
          ],
        },
      ],
    };

    const issues = validateComprehensionIntegrity(
      exam,
      'Afrikaans First Additional Language',
      'af-ZA',
    );

    expect(issues.join(' ')).toContain('weakly grounded in passage context');
  });

  it('softens weakly grounded comprehension MCQ items into short answers', () => {
    const exam = {
      sections: [
        {
          title: 'Afdeling A: Leesbegrip',
          readingPassage: passageText,
          questions: [
            {
              type: 'multiple_choice',
              question: 'Wat het hulle eerste op die plaas gedoen?',
              options: ['Hoenders gevoer', 'By die strand gespeel', 'TV gekyk', 'Sokker gespeel'],
            },
            {
              type: 'multiple_choice',
              question: 'Watter planeet is die grootste?',
              options: ['Mercury', 'Venus', 'Earth', 'Jupiter'],
            },
          ],
        },
      ],
    };

    const softened = softenWeakGroundingComprehensionOptions(exam, 'af-ZA');
    const first = softened.sections?.[0]?.questions?.[0];
    const second = softened.sections?.[0]?.questions?.[1];

    expect(first.type).toBe('multiple_choice');
    expect(second.type).toBe('short_answer');
    expect(second.options).toBeUndefined();
    expect(String(second.question || '')).toContain('Gebruik inligting uit die leesstuk om te antwoord:');
  });
});
