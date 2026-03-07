export type ResolvedSchoolType = 'preschool' | 'k12_school';

const K12_ALIASES = new Set([
  'k12',
  'k12_school',
  'combined',
  'primary',
  'elementary',
  'secondary',
  'community_school',
]);

const PRESCHOOL_ALIASES = new Set([
  'preschool',
  'ecd',
  'nursery',
  'daycare',
  'creche',
  'kindergarten',
]);

export function normalizeResolvedSchoolType(value: unknown): ResolvedSchoolType | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).toLowerCase().trim();
  if (!normalized) return null;

  if (K12_ALIASES.has(normalized)) return 'k12_school';
  if (PRESCHOOL_ALIASES.has(normalized)) return 'preschool';

  if (normalized.includes('k12') || normalized.includes('primary') || normalized.includes('secondary')) {
    return 'k12_school';
  }
  if (
    normalized.includes('preschool') ||
    normalized.includes('early') ||
    normalized.includes('nursery') ||
    normalized.includes('daycare') ||
    normalized.includes('creche')
  ) {
    return 'preschool';
  }

  return null;
}

export function resolveSchoolTypeFromProfile(profile: {
  usageType?: string | null;
  schoolType?: string | null;
} | null | undefined): ResolvedSchoolType {
  const candidates = [profile?.schoolType, profile?.usageType];
  for (const candidate of candidates) {
    const normalized = normalizeResolvedSchoolType(candidate);
    if (normalized) return normalized;
  }
  return 'preschool';
}
