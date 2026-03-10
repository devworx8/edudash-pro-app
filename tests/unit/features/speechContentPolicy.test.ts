import {
  evaluateDashSpeechContent,
  shouldSuppressDashSpeechForStructuredContent,
} from '@/features/dash-assistant/speechContentPolicy';

describe('speechContentPolicy', () => {
  it('suppresses dense table-like responses', () => {
    const content = [
      'Okay, here is the multiplication table in a grid format:',
      '| x | 1 | 2 | 3 | 4 | 5 | 6 |',
      '|---|---|---|---|---|---|---|',
      '| 1 | 1 | 2 | 3 | 4 | 5 | 6 |',
      '| 2 | 2 | 4 | 6 | 8 | 10 | 12 |',
      '| 3 | 3 | 6 | 9 | 12 | 15 | 18 |',
    ].join('\n');

    expect(shouldSuppressDashSpeechForStructuredContent(content)).toBe(true);
    expect(evaluateDashSpeechContent(content)).toEqual({
      shouldSuppress: true,
      reason: 'structured_table',
    });
  });

  it('allows ordinary prose responses', () => {
    const content =
      'Here is a short explanation of multiples. A multiple is the result of multiplying a number by a whole number.';

    expect(shouldSuppressDashSpeechForStructuredContent(content)).toBe(false);
  });
});
