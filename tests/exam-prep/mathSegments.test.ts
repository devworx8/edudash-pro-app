import { containsMathSyntax, parseMathSegments } from '@/components/exam-prep/mathSegments';

describe('mathSegments', () => {
  it('wraps plain fractions as inline math segments', () => {
    const segments = parseMathSegments('What is 3/4 + 1/2?');
    const inlineValues = segments.filter((segment) => segment.type === 'inline').map((segment) => segment.value);

    expect(inlineValues).toEqual(['\\frac{3}{4}', '\\frac{1}{2}']);
  });

  it('detects exponent syntax without explicit delimiters', () => {
    expect(containsMathSyntax('Solve x^2 + 5x + 6 = 0')).toBe(true);
  });

  it('keeps regular text segments around math tokens', () => {
    const segments = parseMathSegments('Find 2/3 of 12 apples.');
    expect(segments[0]?.type).toBe('text');
    expect(segments[0]?.value).toContain('Find');
    expect(
      segments.some((segment) => segment.type === 'inline' && segment.value === '\\frac{2}{3}'),
    ).toBe(true);
  });

  it('supports escaped inline delimiters', () => {
    const segments = parseMathSegments('Compute \\$7+8\\$ now.');
    expect(segments.some((segment) => segment.type === 'inline' && segment.value === '7+8')).toBe(true);
  });

  it('normalizes malformed latex fraction shorthand', () => {
    const segments = parseMathSegments('Calculate \\frac 3 4 + \\frac 1 4');
    const inlineValues = segments.filter((segment) => segment.type === 'inline').map((segment) => segment.value);
    expect(inlineValues).toContain('\\frac{3}{4}');
    expect(inlineValues).toContain('\\frac{1}{4}');
  });

  it('normalizes shorthand powers to braced powers', () => {
    const segments = parseMathSegments('Solve x^2 + y^3');
    const inlineValues = segments.filter((segment) => segment.type === 'inline').map((segment) => segment.value);
    expect(inlineValues).toContain('x^{2}');
    expect(inlineValues).toContain('y^{3}');
  });
});
