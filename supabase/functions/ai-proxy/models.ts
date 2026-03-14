import {
  DEFAULT_ANTHROPIC_ALLOWED_MODELS,
  DEFAULT_OPENAI_ALLOWED_MODELS,
  DEFAULT_SUPERADMIN_ALLOWED_MODELS,
} from './config.ts';
import { getEnv } from './auth.ts';
import {
  getAnthropicHaiku4xModel,
  getAnthropicSonnet37Model,
  getAnthropicSonnet4Model,
  getAnthropicSonnet45Model,
} from './images/policy.ts';

export function parseAllowedModels(envKey: string, defaults: string[]): string[] {
  const raw = Deno.env.get(envKey);
  if (!raw) return defaults;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function pickAllowedModel(
  requested: string | null | undefined,
  allowed: string[],
  fallback: string
): { model: string; usedFallback: boolean; reason?: string } {
  const candidate = (requested || fallback).trim();
  if (allowed.includes(candidate)) {
    return { model: candidate, usedFallback: false };
  }
  if (allowed.includes(fallback)) {
    return { model: fallback, usedFallback: true, reason: `Requested model "${candidate}" not allowed` };
  }
  const safe = allowed[0] || fallback;
  return { model: safe, usedFallback: true, reason: `No allowed models configured, using "${safe}"` };
}

export function normalizeRequestedModel(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const sonnet4 = getAnthropicSonnet4Model();
  const sonnet45 = getAnthropicSonnet45Model();
  const sonnet37 = getAnthropicSonnet37Model();
  const haiku4x = getAnthropicHaiku4xModel();
  const sonnet35 = getEnv('ANTHROPIC_SONNET_3_5_MODEL') || 'claude-3-5-sonnet-20241022';
  const aliases: Record<string, string> = {
    'claude-3-haiku': 'claude-3-haiku-20240307',
    'claude-3-haiku-latest': 'claude-3-haiku-20240307',
    'claude-3-opus': 'claude-3-opus-20240229',
    'claude-3-opus-latest': 'claude-3-opus-20240229',
    'claude-3-sonnet': 'claude-3-sonnet-20240229',
    'claude-3-sonnet-latest': 'claude-3-sonnet-20240229',
    'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
    'claude-3-5-haiku-latest': 'claude-3-5-haiku-20241022',
    // Keep 3.5 Sonnet aliases configurable so environments can pin to a cheaper/equivalent model.
    'claude-3-5-sonnet': sonnet35,
    'claude-3-5-sonnet-latest': sonnet35,
    'claude-3-5-sonnet-20241022': sonnet35,
    'claude-3-7-sonnet': sonnet37,
    'claude-3-7-sonnet-latest': sonnet37,
    'claude-sonnet-3.7': sonnet37,
    'claude-sonnet-3-7': sonnet37,
    'claude-sonnet-4': sonnet4,
    'claude-sonnet-4-latest': sonnet4,
    'claude-sonnet-4.5': sonnet45,
    'claude-sonnet-4-5': sonnet45,
    'claude-sonnet-4-5-latest': sonnet45,
    'claude-haiku-4x': haiku4x,
    'claude-haiku-4': haiku4x,
    'claude-haiku-4-latest': haiku4x,
    'claude-haiku-4.5': haiku4x,
    'claude-haiku-4-5': haiku4x,
    'claude-haiku-4-5-latest': haiku4x,
    'haiku-4x': haiku4x,
    'haiku-4.5': haiku4x,
  };

  return aliases[key] || trimmed;
}

export function normalizeAnthropicAllowedModels(models: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of models) {
    const normalized = normalizeRequestedModel(raw) || String(raw || '').trim();
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

export function normalizeAnthropicAllowedModelsWithTierDefaults(models: string[]): string[] {
  const unique = new Set<string>(normalizeAnthropicAllowedModels(models));
  const defaults = [
    getAnthropicSonnet4Model(),
    getAnthropicSonnet45Model(),
    getAnthropicSonnet37Model(),
    getAnthropicHaiku4xModel(),
  ];
  for (const candidate of defaults) {
    const normalized = normalizeRequestedModel(candidate) || String(candidate || '').trim();
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

// Re-export these for convenience (used in streaming/providers)
export {
  DEFAULT_ANTHROPIC_ALLOWED_MODELS,
  DEFAULT_OPENAI_ALLOWED_MODELS,
  DEFAULT_SUPERADMIN_ALLOWED_MODELS,
};
