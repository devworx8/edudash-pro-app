import {
  buildLocalFallbackExam,
  ensureLanguageReadingPassage,
  getLanguageReadingFallback,
} from '@/supabase/functions/generate-exam/examUtils';

const CONTEXT = {
  assignmentCount: 0,
  lessonCount: 0,
  focusTopics: ['luister en praat', 'klaskamer-taal'],
  weakTopics: [],
  sourceAssignmentIds: [],
  sourceLessonIds: [],
};

describe('language fallback content guardrails', () => {
  it('does not return the legacy Mia/Tumi passage for Afrikaans fallback text', () => {
    const fallback = getLanguageReadingFallback('af-ZA', {
      focusTopics: ['klaskamer-taal'],
      grade: 'grade_6',
    });

    const text = `${fallback.passage}\n${fallback.instruction}`.toLowerCase();
    expect(text).not.toContain('mia');
    expect(text).not.toContain('tumi');
    expect(text).toContain('klaswerkteks');
  });

  it('buildLocalFallbackExam avoids legacy Mia/Tumi content for Afrikaans language subjects', () => {
    const exam = buildLocalFallbackExam(
      'grade_6',
      'Afrikaans Huistaal',
      'practice_test',
      'af-ZA',
      CONTEXT,
    );

    const examText = JSON.stringify(exam).toLowerCase();
    expect(examText).not.toContain('mia');
    expect(examText).not.toContain('tumi');
    expect(examText).toContain('leesbegrip');
  });

  it('ensureLanguageReadingPassage replaces legacy Mia/Tumi reading passages', () => {
    const exam = {
      sections: [
        {
          title: 'Afdeling A: Leesbegrip',
          readingPassage:
            'Lees die storie hieronder. Mia en haar broer, Tumi, het Saterdag vroeg op hul oupa se plaas gaan help.',
          questions: [{ question: 'Wat is die hoofgedagte van die teks?' }],
        },
      ],
    };

    const repaired = ensureLanguageReadingPassage(
      exam,
      'Afrikaans Huistaal',
      'grade_6',
      'af-ZA',
    );
    const repairedText = JSON.stringify(repaired).toLowerCase();

    expect(repairedText).not.toContain('mia');
    expect(repairedText).not.toContain('tumi');
    expect(repairedText).toContain('klaswerkteks');
  });
});
