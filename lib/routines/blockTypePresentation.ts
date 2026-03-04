export type RoutineBlockTypeKey =
  | 'circle_time'
  | 'learning'
  | 'transition'
  | 'meal'
  | 'movement'
  | 'outdoor'
  | 'nap'
  | 'hygiene'
  | 'assessment'
  | 'other';

type RoutineBlockTypePaletteItem = {
  label: string;
  baseColor: string;
};

const ROUTINE_BLOCK_TYPE_PALETTE: Record<RoutineBlockTypeKey, RoutineBlockTypePaletteItem> = {
  circle_time: { label: 'Circle Time', baseColor: '#8B5CF6' },
  learning: { label: 'Learning', baseColor: '#22C55E' },
  transition: { label: 'Transition', baseColor: '#F59E0B' },
  meal: { label: 'Meal', baseColor: '#F97316' },
  movement: { label: 'Movement', baseColor: '#06B6D4' },
  outdoor: { label: 'Outdoor', baseColor: '#0EA5E9' },
  nap: { label: 'Nap / Quiet Time', baseColor: '#A78BFA' },
  hygiene: { label: 'Hygiene / Toilet', baseColor: '#14B8A6' },
  assessment: { label: 'Assessment', baseColor: '#EF4444' },
  other: { label: 'Routine', baseColor: '#64748B' },
};

function hexToRgba(hex: string, alpha: number): string {
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (![r, g, b].every((value) => Number.isFinite(value))) {
    return `rgba(255,255,255,${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toTitleWords(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeRoutineBlockType(raw: string | null | undefined): RoutineBlockTypeKey {
  const normalized = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized) return 'other';
  if (normalized.includes('circle')) return 'circle_time';
  if (
    normalized.includes('learn')
    || normalized.includes('lesson')
    || normalized.includes('literacy')
    || normalized.includes('numeracy')
  ) return 'learning';
  if (normalized.includes('transition')) return 'transition';
  if (
    normalized.includes('meal')
    || normalized.includes('snack')
    || normalized.includes('breakfast')
    || normalized.includes('lunch')
    || normalized.includes('tea')
  ) return 'meal';
  if (normalized.includes('outdoor')) return 'outdoor';
  if (normalized.includes('movement') || normalized.includes('motor') || normalized.includes('sport')) return 'movement';
  if (normalized.includes('nap') || normalized.includes('quiet') || normalized.includes('rest')) return 'nap';
  if (
    normalized.includes('toilet')
    || normalized.includes('hygiene')
    || normalized.includes('bathroom')
    || normalized.includes('wash')
  ) return 'hygiene';
  if (normalized.includes('assess')) return 'assessment';
  return 'other';
}

export function formatRoutineBlockTypeLabel(raw: string | null | undefined): string {
  const key = normalizeRoutineBlockType(raw);
  if (key !== 'other') return ROUTINE_BLOCK_TYPE_PALETTE[key].label;
  const fallbackLabel = toTitleWords(String(raw || ''));
  return fallbackLabel || ROUTINE_BLOCK_TYPE_PALETTE.other.label;
}

export function getRoutineBlockTypePresentation(
  raw: string | null | undefined,
  options?: {
    backgroundAlpha?: number;
    borderAlpha?: number;
  },
): {
  key: RoutineBlockTypeKey;
  label: string;
  baseColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
} {
  const key = normalizeRoutineBlockType(raw);
  const palette = ROUTINE_BLOCK_TYPE_PALETTE[key];
  const label = key === 'other' ? formatRoutineBlockTypeLabel(raw) : palette.label;
  const backgroundAlpha = options?.backgroundAlpha ?? 0.16;
  const borderAlpha = options?.borderAlpha ?? 0.42;

  return {
    key,
    label,
    baseColor: palette.baseColor,
    backgroundColor: hexToRgba(palette.baseColor, backgroundAlpha),
    borderColor: hexToRgba(palette.baseColor, borderAlpha),
    textColor: palette.baseColor,
  };
}
