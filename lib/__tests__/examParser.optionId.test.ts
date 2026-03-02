import { gradeAnswer, parseExamMarkdown, type ExamQuestion } from '@/lib/examParser';

describe('examParser canonical option IDs', () => {
  it('parses object options and preserves correctOptionId', () => {
    const payload = {
      title: 'Option ID Test',
      grade: 'grade_6',
      subject: 'Afrikaans First Additional Language',
      sections: [
        {
          title: 'Section A',
          questions: [
            {
              id: 'q_1',
              type: 'multiple_choice',
              question: 'Waarheen het hulle gegaan?',
              options: [
                { id: 'A', text: 'Na die strand' },
                { id: 'B', text: 'Na hul oupa se plaas' },
              ],
              correctOptionId: 'B',
              correctAnswer: 'Na hul oupa se plaas',
              marks: 2,
            },
          ],
        },
      ],
    };

    const parsed = parseExamMarkdown(JSON.stringify(payload));
    expect(parsed).toBeTruthy();
    const question = parsed?.sections?.[0]?.questions?.[0];
    expect(question?.optionObjects?.[1]?.id).toBe('B');
    expect(question?.correctOptionId).toBe('B');
  });

  it('grades MC by selectedOptionId before text matching', () => {
    const question: ExamQuestion = {
      id: 'q_2',
      type: 'multiple_choice',
      question: 'Where did they go?',
      marks: 2,
      options: ['To a beach', "To their grandfather's farm", 'To a mall'],
      correctOptionId: 'B',
      correctAnswer: "To their grandfather's farm",
    };

    const result = gradeAnswer(question, 'To a beach', { selectedOptionId: 'B' });
    expect(result.isCorrect).toBe(true);
    expect(result.marks).toBe(2);
  });

  it('keeps legacy text grading when option IDs are absent', () => {
    const question: ExamQuestion = {
      id: 'q_3',
      type: 'multiple_choice',
      question: 'Legacy MC',
      marks: 1,
      options: ['True', 'False'],
      correctAnswer: 'A',
    };

    const result = gradeAnswer(question, 'True');
    expect(result.isCorrect).toBe(true);
  });
});
