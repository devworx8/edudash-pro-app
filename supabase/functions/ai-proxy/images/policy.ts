import { IMAGE_BUCKET, IMAGE_SIGNED_URL_TTL_SECONDS } from '../config.ts';
import { getEnv } from '../auth.ts';
import type { ImageProvider, ImageProviderError, ImageProviderErrorCode, JsonRecord } from '../types.ts';
import type { ImageOptions } from '../schemas.ts';

export { IMAGE_BUCKET, IMAGE_SIGNED_URL_TTL_SECONDS };

export function parseImageSize(size?: string): { width: number; height: number } {
  if (!size) return { width: 1024, height: 1024 };
  const [wRaw, hRaw] = size.split('x');
  const width = Number.parseInt(wRaw || '1024', 10);
  const height = Number.parseInt(hRaw || '1024', 10);
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 1024,
  };
}

export function toPngBytes(base64Image: string): Uint8Array {
  const binary = atob(base64Image);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function createImageProviderError(params: {
  provider: ImageProvider;
  code: ImageProviderErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  details?: JsonRecord;
}): ImageProviderError {
  const error = new Error(params.message) as ImageProviderError;
  error.provider = params.provider;
  error.code = params.code;
  if (typeof params.status === 'number') {
    error.status = params.status;
  }
  error.retryable = params.retryable === true;
  if (params.details) {
    error.details = params.details;
  }
  return error;
}

export function isImageProviderError(value: unknown): value is ImageProviderError {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<ImageProviderError>;
  return (
    (maybe.provider === 'openai' || maybe.provider === 'google') &&
    typeof maybe.code === 'string' &&
    typeof maybe.retryable === 'boolean'
  );
}

export function hasContentPolicySignal(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('moderation') ||
    lower.includes('policy') ||
    lower.includes('safety') ||
    lower.includes('content')
  );
}

export function inferStatusFromText(message: string): number | undefined {
  const match = message.match(/\b(4\d\d|5\d\d)\b/);
  if (!match) return undefined;
  const status = Number.parseInt(match[1], 10);
  return Number.isFinite(status) ? status : undefined;
}

export function normalizeImageProviderError(error: unknown, provider: ImageProvider): ImageProviderError {
  if (isImageProviderError(error)) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const status = inferStatusFromText(message);
  const lower = message.toLowerCase();
  if (hasContentPolicySignal(message)) {
    return createImageProviderError({
      provider,
      code: 'content_policy_violation',
      message,
      status: status || 400,
      retryable: false,
    });
  }
  const retryable = status === 429 || (typeof status === 'number' && status >= 500) ||
    lower.includes('timeout') || lower.includes('network') || lower.includes('temporarily');
  return createImageProviderError({
    provider,
    code: retryable ? (status === 429 ? 'rate_limited' : 'provider_error') : 'invalid_request',
    message,
    status,
    retryable,
  });
}

export function normalizeTierName(input: unknown): string {
  return String(input || 'free').trim().toLowerCase();
}

export function getAnthropicSonnet4Model(): string {
  return getEnv('ANTHROPIC_SONNET_4_MODEL') || 'claude-sonnet-4-20250514';
}

export function getAnthropicSonnet45Model(): string {
  return getEnv('ANTHROPIC_SONNET_4_5_MODEL') || 'claude-sonnet-4-5-20250514';
}

export function getAnthropicSonnet37Model(): string {
  return getEnv('ANTHROPIC_SONNET_3_7_MODEL') || 'claude-3-7-sonnet-20250219';
}

export function getAnthropicHaiku4xModel(): string {
  return (
    getEnv('ANTHROPIC_HAIKU_4X_MODEL')
    || getEnv('ANTHROPIC_HAIKU_4_5_MODEL')
    || getEnv('ANTHROPIC_HAIKU_4_5')
    || getEnv('ANTHROPIC_HAIKU_4_MODEL')
    || 'claude-haiku-4-5-20251001'
  );
}

/** Default model ID by tier when client does not send model. Aligned with lib/ai/models.ts getDefaultModelForTier. */
export function getDefaultModelIdForTierProxy(tierRaw: string): string {
  const tier = normalizeTierName(tierRaw);
  const sonnet4 = getAnthropicSonnet4Model();
  const sonnet45 = getAnthropicSonnet45Model();
  const sonnet37 = getAnthropicSonnet37Model();
  const haiku4x = getAnthropicHaiku4xModel();

  if (tier.includes('enterprise') || tier === 'superadmin' || tier === 'super_admin') return sonnet45;
  if (tier.includes('premium') || tier.includes('plus') || tier.includes('pro') || tier.includes('trial') || tier === 'trial') return sonnet4;
  if (tier.includes('basic') || tier.includes('starter')) return sonnet37;
  if (tier.includes('free')) return haiku4x;
  return haiku4x;
}

export function isFreeOrTrialTier(tier: string): boolean {
  return tier === 'free' || tier === 'trial' || tier.includes('free') || tier.includes('trial');
}

export function isStarterTier(tier: string): boolean {
  return tier.includes('starter');
}

export function isPremiumTier(tier: string): boolean {
  return (
    tier.includes('plus') ||
    tier.includes('pro') ||
    tier.includes('premium') ||
    tier.includes('enterprise')
  );
}

export function coerceImageOptionsForTier(options?: ImageOptions, tierRaw?: string | null): Required<ImageOptions> {
  const tier = normalizeTierName(tierRaw);
  const normalized: Required<ImageOptions> = {
    size: options?.size || '1024x1024',
    quality: options?.quality || 'medium',
    style: options?.style || 'vivid',
    background: options?.background || 'auto',
    moderation: options?.moderation || 'auto',
    cost_mode: options?.cost_mode || 'balanced',
    provider_preference: options?.provider_preference || 'auto',
  };

  if (isFreeOrTrialTier(tier) || isStarterTier(tier)) {
    normalized.size = '1024x1024';
  }

  if (normalized.quality === 'high' && (isFreeOrTrialTier(tier) || isStarterTier(tier))) {
    normalized.quality = 'medium';
  }

  if (normalized.cost_mode === 'eco') {
    normalized.quality = normalized.quality === 'high' ? 'medium' : normalized.quality;
    if (!options?.quality) {
      normalized.quality = 'low';
    }
  }

  if (normalized.cost_mode === 'premium' && !options?.quality && isPremiumTier(tier)) {
    normalized.quality = 'high';
  }

  return normalized;
}

export function isImageFallbackEnabled(): boolean {
  const value = (
    getEnv('ENABLE_IMAGE_PROVIDER_FALLBACK') ||
    getEnv('EXPO_PUBLIC_ENABLE_IMAGE_PROVIDER_FALLBACK') ||
    'false'
  ).toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function buildImageProviderChain(params: {
  options: Required<ImageOptions>;
  hasOpenAI: boolean;
  hasImagen: boolean;
  fallbackEnabled: boolean;
}): ImageProvider[] {
  const { options, hasOpenAI, hasImagen, fallbackEnabled } = params;
  if (!hasOpenAI && !hasImagen) return [];

  let primary: ImageProvider = 'openai';
  if (options.provider_preference === 'openai') {
    primary = 'openai';
  } else if (options.provider_preference === 'imagen') {
    primary = 'google';
  } else if (options.cost_mode === 'eco') {
    primary = 'google';
  } else {
    primary = 'openai';
  }

  if (primary === 'openai' && !hasOpenAI) {
    primary = 'google';
  } else if (primary === 'google' && !hasImagen) {
    primary = 'openai';
  }

  const chain: ImageProvider[] = [primary];
  if (!fallbackEnabled) return chain;

  const secondary: ImageProvider = primary === 'openai' ? 'google' : 'openai';
  if ((secondary === 'openai' && hasOpenAI) || (secondary === 'google' && hasImagen)) {
    chain.push(secondary);
  }
  return chain;
}

export function estimateImageCostUsd(params: {
  provider: ImageProvider;
  size: string;
  quality: 'low' | 'medium' | 'high';
  imageCount: number;
  model?: string;
}): number {
  const dims = parseImageSize(params.size);
  const areaScale = (dims.width * dims.height) / (1024 * 1024);
  const providerBase = params.provider === 'google'
    ? (String(params.model || '').toLowerCase().includes('fast') ? 0.02 : 0.04)
    : params.quality === 'high'
      ? 0.08
      : params.quality === 'low'
        ? 0.02
        : 0.04;

  const images = Math.max(1, params.imageCount || 1);
  return Number((providerBase * areaScale * images).toFixed(4));
}
