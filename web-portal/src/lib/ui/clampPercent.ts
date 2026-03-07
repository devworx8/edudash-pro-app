type ClampPercentOptions = {
  defaultValue?: number;
};

export function clampPercent(value: unknown, options: ClampPercentOptions = {}): number {
  const fallback = Number.isFinite(options.defaultValue) ? Number(options.defaultValue) : 0;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.min(100, fallback));
  }
  return Math.max(0, Math.min(100, numeric));
}

export function ratioToPercent(
  numerator: number,
  denominator: number,
  options: ClampPercentOptions = {},
): number {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return clampPercent(options.defaultValue ?? 0, options);
  }
  return clampPercent((numerator / denominator) * 100, options);
}

