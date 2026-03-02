import { validateLearnerLanguageConsistency } from '@/supabase/functions/generate-exam/examUtils';

describe('language guardrail strict mode', () => {
  const examPayload = {
    sections: [
      {
        title: 'Afdeling A: Leesbegrip',
        instructions: 'Lees die teks sorgvuldig en antwoord in Afrikaans.',
        readingPassage:
          'Mia en haar broer, Tumi, het vroeg op hul oupa se plaas gaan help en later stories geluister.',
        questions: [
          {
            question:
              'They went to the farm before they went home and laughed together. Where did they go first?',
            options: [
              'To the beach before home',
              "To their grandfather's farm before home",
              'To the mall and then home',
            ],
          },
        ],
      },
    ],
  };

  it('fails on first confident mismatch in strict mode', () => {
    const issues = validateLearnerLanguageConsistency(
      examPayload,
      'Afrikaans First Additional Language',
      'af-ZA',
      'strict',
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fail on a single mismatch in standard mode', () => {
    const issues = validateLearnerLanguageConsistency(
      examPayload,
      'Afrikaans First Additional Language',
      'af-ZA',
      'standard',
    );
    expect(issues).toEqual([]);
  });
});
