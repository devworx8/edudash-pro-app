import { parseMathSegments } from '@/components/exam-prep/mathSegments';

describe('ExamQuestionCard math segmentation', () => {
  it('parses mixed inline latex with surrounding text', () => {
    const segments = parseMathSegments('Solve $x^2 = 9$ and then explain your steps.');
    expect(segments).toEqual([
      { type: 'text', value: 'Solve ' },
      { type: 'inline', value: 'x^2 = 9' },
      { type: 'text', value: ' and then explain your steps.' },
    ]);
  });

  it('parses block latex and keeps text blocks', () => {
    const segments = parseMathSegments('Use formula $$a^2 + b^2 = c^2$$ in this question.');
    expect(segments).toEqual([
      { type: 'text', value: 'Use formula ' },
      { type: 'block', value: 'a^2 + b^2 = c^2' },
      { type: 'text', value: ' in this question.' },
    ]);
  });

  it('normalizes double-escaped latex delimiters from JSON payloads', () => {
    const segments = parseMathSegments(String.raw`Check this: \\$7 \\times 13 = 91\\$ before you submit.`);
    expect(segments).toEqual([
      { type: 'text', value: 'Check this: ' },
      { type: 'inline', value: String.raw`7 \\times 13 = 91` },
      { type: 'text', value: ' before you submit.' },
    ]);
  });
});
