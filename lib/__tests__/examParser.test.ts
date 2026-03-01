import { gradeAnswer, type ExamQuestion } from '@/lib/examParser';

describe('examParser gradeAnswer', () => {
  it('accepts MCQ option text when the answer key is a letter', () => {
    const question: ExamQuestion = {
      id: 'q_mcq_text_vs_letter',
      type: 'multiple_choice',
      question: 'Where did they go?',
      marks: 2,
      options: ['To a beach', "To their grandfather's farm", 'To a mall', 'To a school hall'],
      correctAnswer: 'B',
    };

    const result = gradeAnswer(question, "To their grandfather's farm");

    expect(result.isCorrect).toBe(true);
    expect(result.marks).toBe(2);
  });

  it('accepts MCQ letter when the answer key stores option text', () => {
    const question: ExamQuestion = {
      id: 'q_mcq_letter_vs_text',
      type: 'multiple_choice',
      question: 'Choose the correct option',
      marks: 1,
      options: ['Beach', 'Farm', 'Mall', 'Hall'],
      correctAnswer: 'Farm',
    };

    const result = gradeAnswer(question, 'B');

    expect(result.isCorrect).toBe(true);
    expect(result.marks).toBe(1);
  });

  it('accepts equivalent LaTeX fractions for fill in the blank answers', () => {
    const question: ExamQuestion = {
      id: 'q1',
      type: 'fill_in_blank',
      question: 'Convert to simplest form: 2/4 = ____',
      marks: 2,
      correctAnswer: '\\frac{1}{2}',
    };

    const result = gradeAnswer(question, '1/2');

    expect(result.isCorrect).toBe(true);
    expect(result.marks).toBe(2);
  });

  it('accepts equivalent LaTeX square-root notation', () => {
    const question: ExamQuestion = {
      id: 'q2',
      type: 'fill_blank',
      question: 'Complete: $\\sqrt{16}$ = ____',
      marks: 1,
      correctAnswer: '\\sqrt{16}',
    };

    const result = gradeAnswer(question, 'sqrt(16)');

    expect(result.isCorrect).toBe(true);
    expect(result.marks).toBe(1);
  });
});
