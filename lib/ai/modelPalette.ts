import type { AIModelId } from '@/lib/ai/models';

export const DASH_MODEL_COLORS: Record<AIModelId, string> = {
  'claude-haiku-4-5-20251001': '#0EA5E9',
  'claude-3-7-sonnet-20250219': '#F59E0B',
  'claude-sonnet-4-20250514': '#EC4899',
  'claude-sonnet-4-5-20250514': '#EF4444',
};

export function getDashModelColor(modelId?: string | null, fallback = '#8B5CF6'): string {
  if (!modelId) return fallback;
  const color = DASH_MODEL_COLORS[modelId as AIModelId];
  return color || fallback;
}
