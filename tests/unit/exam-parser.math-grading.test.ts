import { gradeAnswer, type ExamQuestion } from '@/lib/examParser';

describe('examParser math grading guardrails', () => {
  it('accepts valid multiplication-check sentences for division verification prompts', () => {
    const question: ExamQuestion = {
      id: 'q1',
      type: 'short_answer',
      marks: 4,
      question: 'Check if 91 ÷ 7 = 13 is correct by writing the multiplication sentence.',
      correctAnswer:
        'Multiply divisor by quotient to verify: 7 × 13 = 91, therefore the division is correct.',
      explanation: 'Use multiplication to verify the division sentence.',
    };

    const result = gradeAnswer(question, '13x7=91');
    expect(result.isCorrect).toBe(true);
    expect(result.marks).toBe(4);
  });

  it('returns explicit partial feedback copy instead of contradictory memo text', () => {
    const question: ExamQuestion = {
      id: 'q2',
      type: 'short_answer',
      marks: 8,
      question: 'Check if 364 ÷ 26 = 14 is correct by using multiplication.',
      correctAnswer:
        'Tom is correct because 26 × 14 = 364. State clearly whether the original statement is correct.',
      explanation: 'The final sentence must clearly state whether the statement is correct.',
    };

    const result = gradeAnswer(question, '26+0=26');
    expect(result.isCorrect).toBe(false);
    expect(result.marks).toBeGreaterThan(0);
    expect(result.feedback.toLowerCase()).toContain('partially correct');
    expect(result.feedback.toLowerCase()).toContain('clear conclusion sentence');
  });
});
