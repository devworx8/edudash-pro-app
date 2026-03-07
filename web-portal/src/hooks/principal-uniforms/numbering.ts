export const normalizeBackNumber = (value: unknown): string =>
  String(value ?? '').trim();

export const parseBackNumber = (value: unknown): number | null => {
  const normalized = normalizeBackNumber(value);
  if (!/^\d{1,2}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) return null;
  return parsed;
};

export const hasAssignedBackNumber = (value: unknown): boolean =>
  parseBackNumber(value) !== null;

export const needsGeneratedBackNumber = (value: unknown): boolean =>
  !hasAssignedBackNumber(value);
