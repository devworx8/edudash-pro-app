import { describe, expect, it } from '@jest/globals';
import { clampPercent, ratioToPercent } from '../clampPercent';

describe('web clampPercent', () => {
  it('clamps to [0,100]', () => {
    expect(clampPercent(-12)).toBe(0);
    expect(clampPercent(55)).toBe(55);
    expect(clampPercent(180)).toBe(100);
  });

  it('uses fallback for invalid values', () => {
    expect(clampPercent(Number.NaN, { defaultValue: 22 })).toBe(22);
  });
});

describe('web ratioToPercent', () => {
  it('computes percentage from numerator/denominator', () => {
    expect(ratioToPercent(3, 6)).toBe(50);
  });

  it('falls back when denominator is invalid', () => {
    expect(ratioToPercent(3, 0, { defaultValue: 5 })).toBe(5);
  });
});
