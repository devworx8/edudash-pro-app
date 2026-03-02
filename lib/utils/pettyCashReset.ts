/**
 * Helpers to identify petty-cash reset adjustment entries.
 *
 * Reset actions are accounting adjustments and should affect balance,
 * but should not be reported as operational spend/replenishment totals.
 */

type MaybeRecord = {
  category?: unknown;
  description?: unknown;
  reference_number?: unknown;
  reference?: unknown;
};

const toLowerTrim = (value: unknown): string => String(value || '').trim().toLowerCase();
const toUpperTrim = (value: unknown): string => String(value || '').trim().toUpperCase();

export function isPettyCashResetEntry(entry: MaybeRecord | null | undefined): boolean {
  if (!entry) return false;

  const category = toLowerTrim(entry.category);
  const description = toLowerTrim(entry.description);
  const reference = toUpperTrim(entry.reference_number || entry.reference);

  return (
    category === 'reset' ||
    description.startsWith('petty cash reset') ||
    reference.startsWith('RESET-')
  );
}
