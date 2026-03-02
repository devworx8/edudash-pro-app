import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { callImagenImageGeneration, isImagenConfigured } from './providers/imagen.ts';
import { SHARED_PHONICS_PROMPT_BLOCK } from './generated/phonicsPrompt.ts';
import { OCR_PROMPT_BY_TASK } from './generated/ocrPrompts.ts';
import {
  deriveResolutionMetadata,
} from './resolutionPolicy.ts';
import {
  derivePlanModeMeta,
  deriveSuggestedActions,
} from './interactionHints.ts';
import { extractRetryAfterSeconds, mapAiProxyErrorCode } from './errorContract.ts';

type JsonRecord = Record<string, unknown>;

type ToolResult = {
  name: string;
  input: JsonRecord;
  output: JsonRecord;
  success: boolean;
};

type GeneratedImage = {
  id: string;
  bucket: string;
  path: string;
  signed_url: string;
  mime_type: string;
  prompt: string;
  width: number;
  height: number;
  provider: 'openai' | 'google';
  model: string;
  expires_at: string;
};

type ProviderResponse = {
  content: string;
  usage?: {
    tokens_in?: number;
    tokens_out?: number;
    cost?: number;
  };
  model?: string;
  tool_results?: ToolResult[];
  generated_images?: GeneratedImage[];
  provider?: 'openai' | 'google';
  fallback_used?: boolean;
  fallback_reason?: string;
  /** Client-side tool calls that the AI requested but the server cannot execute */
  pending_tool_calls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
};

const DEFAULT_OPENAI_ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4o'];
const DEFAULT_ANTHROPIC_ALLOWED_MODELS = [
  'claude-3-haiku-20240307',
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
  'claude-3-7-sonnet-20250219',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250514',
  'claude-opus-4-20250514',
  'claude-3-sonnet-20240229',
  'claude-3-opus-20240229',
];
const DEFAULT_SUPERADMIN_ALLOWED_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250514',
];

const ImageSchema = z.object({
  data: z.string(),
  media_type: z.string(),
});

const ImageOptionsSchema = z.object({
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(),
  quality: z.enum(['low', 'medium', 'high']).optional(),
  style: z.enum(['natural', 'vivid']).optional(),
  background: z.enum(['auto', 'transparent', 'opaque']).optional(),
  moderation: z.enum(['auto', 'low']).optional(),
  cost_mode: z.enum(['eco', 'balanced', 'premium']).optional(),
  provider_preference: z.enum(['auto', 'openai', 'imagen']).optional(),
});

const ConversationMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
        source: z
          .object({
            type: z.string(),
            media_type: z.string(),
            data: z.string(),
          })
          .optional(),
      })
    ),
  ]),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
});

const RequestSchema = z.object({
  scope: z.enum(['teacher', 'principal', 'parent', 'student', 'admin', 'guest']).optional(),
  service_type: z.string().optional().default('chat_message'),
  payload: z
    .object({
      prompt: z.string().optional(),
      context: z.string().optional(),
      conversationHistory: z.array(ConversationMessageSchema).optional(),
      messages: z.array(ConversationMessageSchema).optional(),
      images: z.array(ImageSchema).optional(),
      image_options: ImageOptionsSchema.optional(),
      image_context: z.record(z.unknown()).optional(),
      voice_data: z.record(z.unknown()).optional(),
      ocr_mode: z.boolean().optional(),
      ocr_task: z.enum(['homework', 'document', 'handwriting']).optional(),
      ocr_response_format: z.enum(['json', 'text']).optional(),
      model: z.string().optional(),
    })
    .default({}),
  stream: z.boolean().optional(),
  enable_tools: z.boolean().optional().default(false),
  prefer_openai: z.boolean().optional().default(false),
  client_tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    input_schema: z.record(z.unknown()),
  })).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function normalizeServiceType(serviceType?: string): string {
  if (!serviceType) return 'chat_message';
  if (serviceType === 'dash_conversation' || serviceType === 'dash_ai') {
    return 'chat_message';
  }
  if (serviceType === 'grading_assistance') {
    return 'grading';
  }
  return serviceType;
}

// ── MAX TOKENS BY SERVICE TYPE ──────────────────────────────────────
// Different service types need different token budgets
const MAX_TOKENS_BY_SERVICE: Record<string, number> = {
  chat_message: 2048,
  lesson_generation: 4096,
  homework_generation: 4096,
  grading: 2048,
  exam_generation: 4096,
  agent_plan: 1024,
  agent_reflection: 256,
  web_search: 1024,
  image_analysis: 2048,
  image_generation: 512,
};
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.4;
const VOICE_CHAT_TEMPERATURE = 0.15;

function getMaxTokensForService(serviceType: string): number {
  return MAX_TOKENS_BY_SERVICE[serviceType] || DEFAULT_MAX_TOKENS;
}

function resolveTemperature(requestMetadata?: Record<string, unknown>): number {
  const context = String(requestMetadata?.context || requestMetadata?.source || '').toLowerCase();
  return context.includes('voice_chat') || context.includes('dash_voice_orb')
    ? VOICE_CHAT_TEMPERATURE
    : DEFAULT_TEMPERATURE;
}

const WebSearchArgsSchema = z.object({
  query: z.string().min(2),
  recency: z.string().optional(),
  domains: z.array(z.string()).optional(),
});

const CAPSCurriculumArgsSchema = z
  .object({
    query: z.string().min(2).optional(),
    // Compatibility with legacy caps_curriculum_query tool shape
    search_query: z.string().min(2).optional(),
    grade: z.string().optional(),
    subject: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    document_type: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.query && !val.search_query) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'query is required', path: ['query'] });
    }
  });

const GetCapsDocumentsArgsSchema = z.object({
  grade: z.string().min(1),
  subject: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
  document_type: z.string().optional(),
});

const GetCapsSubjectsArgsSchema = z.object({
  grade: z.string().min(1),
});

const SERVER_TOOL_NAMES = new Set([
  'web_search',
  'search_caps_curriculum',
  'get_caps_documents',
  'get_caps_subjects',
  'caps_curriculum_query',
]);

const DEFAULT_SYSTEM_PROMPT = `You are Dash, a helpful AI assistant for schools and families.

CORE BEHAVIOR:
- Give accurate, specific, context-aware answers.
- Be concise, warm, and practical.
- If attachments are provided, analyze them directly and reference concrete details.
- Ask at most one clarifying question only when required.

TOOLS:
- Use available tools when real data or external information is needed.
- Do not claim actions were completed unless a tool confirms it.

LANGUAGE:
- Follow explicit language instructions from the user or metadata.
- If no language is specified, respond in clear English (South Africa).`;

// CORS headers are now managed by _shared/cors.ts — computed per-request in serve()
// The `corsHeaders` variable is set once per request at the top of serve().

// ── PII FILTERING ─────────────────────────────────────────────────────
// Redact sensitive personal information before sending to AI providers
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
  { pattern: /\b(?:\+27|0)[0-9]{9,10}\b/g, replacement: '[PHONE]' },
  { pattern: /\b\d{2}[01]\d[0-3]\d\d{4}[01]\d{2}\b/g, replacement: '[SA_ID]' },
  { pattern: /\b\d{13}\b/g, replacement: '[ID_NUMBER]' },
  { pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g, replacement: '[CARD_NUMBER]' },
];

function redactPII(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let redacted = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

function redactMessagesForProvider(messages: Array<JsonRecord>): Array<JsonRecord> {
  return messages.map((msg) => {
    const content = msg.content;
    if (typeof content === 'string') {
      return { ...msg, content: redactPII(content) };
    }
    if (Array.isArray(content)) {
      return {
        ...msg,
        content: content.map((part: any) => {
          if (part?.type === 'text' && typeof part.text === 'string') {
            return { ...part, text: redactPII(part.text) };
          }
          return part;
        }),
      };
    }
    return msg;
  });
}

function getEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : null;
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

function decodeBase64Url(value: string): string | null {
  if (!value) return null;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(padLength)}`;
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function inferJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadText = decodeBase64Url(parts[1]);
  if (!payloadText) return null;
  try {
    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function getBooleanFlag(name: string, fallback = true): boolean {
  const raw = (getEnv(name) || getEnv(`EXPO_PUBLIC_${name}`) || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  return fallback;
}

function getAnthropicApiKey(): string | null {
  return (
    getEnv('ANTHROPIC_API_KEY') ||
    getEnv('SERVER_ANTHROPIC_API_KEY') ||
    getEnv('ANTHROPIC_API_KEY_2') ||
    getEnv('ANTHROPIC_API_KEY_SECONDARY')
  );
}

function getOpenAIApiKey(): string | null {
  return (
    getEnv('OPENAI_API_KEY') ||
    getEnv('SERVER_OPENAI_API_KEY') ||
    getEnv('OPENAI_API_KEY_2')
  );
}

const IMAGE_BUCKET = 'dash-generated-images';
const IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24 hours

type ImageProvider = 'openai' | 'google';
type ImageOptions = z.infer<typeof ImageOptionsSchema>;
type ImageProviderErrorCode =
  | 'config_missing'
  | 'network_error'
  | 'provider_error'
  | 'rate_limited'
  | 'content_policy_violation'
  | 'invalid_request'
  | 'storage_error';

type ImageProviderError = Error & {
  provider: ImageProvider;
  code: ImageProviderErrorCode;
  status?: number;
  retryable: boolean;
  details?: JsonRecord;
};

function parseImageSize(size?: string): { width: number; height: number } {
  if (!size) return { width: 1024, height: 1024 };
  const [wRaw, hRaw] = size.split('x');
  const width = Number.parseInt(wRaw || '1024', 10);
  const height = Number.parseInt(hRaw || '1024', 10);
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 1024,
  };
}

function toPngBytes(base64Image: string): Uint8Array {
  const binary = atob(base64Image);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createImageProviderError(params: {
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

function isImageProviderError(value: unknown): value is ImageProviderError {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<ImageProviderError>;
  return (
    (maybe.provider === 'openai' || maybe.provider === 'google') &&
    typeof maybe.code === 'string' &&
    typeof maybe.retryable === 'boolean'
  );
}

function hasContentPolicySignal(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('moderation') ||
    lower.includes('policy') ||
    lower.includes('safety') ||
    lower.includes('content')
  );
}

function inferStatusFromText(message: string): number | undefined {
  const match = message.match(/\b(4\d\d|5\d\d)\b/);
  if (!match) return undefined;
  const status = Number.parseInt(match[1], 10);
  return Number.isFinite(status) ? status : undefined;
}

function normalizeImageProviderError(error: unknown, provider: ImageProvider): ImageProviderError {
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

function normalizeTierName(input: unknown): string {
  return String(input || 'free').trim().toLowerCase();
}

/** Default model ID by tier when client does not send model. Aligned with lib/ai/models.ts getDefaultModelForTier. */
function getDefaultModelIdForTierProxy(tierRaw: string): string {
  const tier = normalizeTierName(tierRaw);
  const haiku35 = getEnv('ANTHROPIC_HAIKU_3_5_MODEL') || 'claude-3-5-haiku-20241022';
  const sonnet4 = getEnv('ANTHROPIC_SONNET_4_MODEL') || 'claude-sonnet-4-20250514';
  if (tier.includes('enterprise') || tier === 'superadmin' || tier === 'super_admin') return sonnet4;
  if (tier.includes('premium') || tier.includes('pro') || tier.includes('plus') || tier.includes('basic')) return haiku35;
  if (tier.includes('starter') || tier === 'trial') return haiku35;
  return 'claude-3-haiku-20240307';
}

function isFreeOrTrialTier(tier: string): boolean {
  return tier === 'free' || tier === 'trial' || tier.includes('free') || tier.includes('trial');
}

function isStarterTier(tier: string): boolean {
  return tier.includes('starter');
}

function isPremiumTier(tier: string): boolean {
  return (
    tier.includes('plus') ||
    tier.includes('pro') ||
    tier.includes('premium') ||
    tier.includes('enterprise')
  );
}

function coerceImageOptionsForTier(options?: ImageOptions, tierRaw?: string | null): Required<ImageOptions> {
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

function isImageFallbackEnabled(): boolean {
  const value = (
    getEnv('ENABLE_IMAGE_PROVIDER_FALLBACK') ||
    getEnv('EXPO_PUBLIC_ENABLE_IMAGE_PROVIDER_FALLBACK') ||
    'false'
  ).toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function buildImageProviderChain(params: {
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

function estimateImageCostUsd(params: {
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

async function moderateImagePrompt(apiKey: string, prompt: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: prompt,
      }),
    });
  } catch (error) {
    throw createImageProviderError({
      provider: 'openai',
      code: 'network_error',
      message: `OpenAI moderation request failed: ${error instanceof Error ? error.message : String(error)}`,
      retryable: true,
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw createImageProviderError({
      provider: 'openai',
      code: response.status === 429 ? 'rate_limited' : 'provider_error',
      message: `OpenAI moderation error: ${response.status} ${text}`,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      details: { raw_error: text },
    });
  }

  const data = (await response.json()) as JsonRecord;
  const result = Array.isArray(data.results) ? data.results[0] : null;
  const flagged = !!(result && typeof result === 'object' && (result as JsonRecord).flagged);
  if (flagged) {
    throw createImageProviderError({
      provider: 'openai',
      code: 'content_policy_violation',
      message: 'Image prompt blocked by moderation policy',
      status: 400,
      retryable: false,
    });
  }
}

async function callOpenAIImageGeneration(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  prompt: string;
  options?: z.infer<typeof ImageOptionsSchema>;
  requestedModel?: string | null;
}): Promise<ProviderResponse> {
  const { supabase, userId, prompt, options, requestedModel } = params;
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw createImageProviderError({
      provider: 'openai',
      code: 'config_missing',
      message: 'OPENAI_API_KEY is not configured.',
      status: 503,
      retryable: true,
    });
  }

  const model = requestedModel || getEnv('OPENAI_IMAGE_MODEL') || 'gpt-image-1';
  await moderateImagePrompt(apiKey, prompt);

  const size = options?.size || '1024x1024';
  const quality = options?.quality || 'medium';
  const preferredParams: Record<string, unknown> = {
    size,
    quality,
    style: options?.style || 'vivid',
    background: options?.background || 'auto',
    moderation: options?.moderation || 'auto',
    output_format: 'png',
  };

  const omittedParams = new Set<string>();
  let response: Response | null = null;
  let lastErrorText = '';
  let lastStatus = 500;

  // OpenAI image APIs can reject model-specific fields.
  // Retry by removing only unsupported parameters so generation still succeeds.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const body: Record<string, unknown> = { model, prompt };
    for (const [key, value] of Object.entries(preferredParams)) {
      if (value === undefined || omittedParams.has(key)) continue;
      body[key] = value;
    }

    try {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw createImageProviderError({
        provider: 'openai',
        code: 'network_error',
        message: `OpenAI image generation request failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      });
    }

    if (response.ok) break;

    const errorText = await response.text();
    lastErrorText = errorText;
    lastStatus = response.status;
    const unknownParam = errorText.match(/Unknown parameter:\s*'([^']+)'/i)?.[1];
    if (unknownParam) {
      omittedParams.add(unknownParam);
      continue;
    }

    if (response.status === 400 && hasContentPolicySignal(errorText)) {
      throw createImageProviderError({
        provider: 'openai',
        code: 'content_policy_violation',
        message: `OpenAI image generation blocked by policy: ${errorText}`,
        status: 400,
        retryable: false,
      });
    }

    throw createImageProviderError({
      provider: 'openai',
      code: response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'provider_error' : 'invalid_request',
      message: `OpenAI image generation error: ${response.status} ${errorText}`,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      details: { raw_error: errorText },
    });
  }

  if (!response || !response.ok) {
    throw createImageProviderError({
      provider: 'openai',
      code: lastStatus === 429 ? 'rate_limited' : lastStatus >= 500 ? 'provider_error' : 'invalid_request',
      message: `OpenAI image generation error: ${lastStatus} ${lastErrorText}`,
      status: lastStatus,
      retryable: lastStatus === 429 || lastStatus >= 500,
      details: { raw_error: lastErrorText },
    });
  }

  const result = (await response.json()) as JsonRecord;
  const imageRows = Array.isArray(result.data) ? result.data : [];
  if (imageRows.length === 0) {
    throw createImageProviderError({
      provider: 'openai',
      code: 'provider_error',
      message: 'OpenAI image generation returned no data',
      retryable: true,
    });
  }

  const dims = parseImageSize(size);
  const now = new Date();
  const generatedImages: GeneratedImage[] = [];
  for (let i = 0; i < imageRows.length; i += 1) {
    const item = imageRows[i] as JsonRecord;
    const b64 = typeof item.b64_json === 'string' ? item.b64_json : null;
    if (!b64) continue;

    const bytes = toPngBytes(b64);
    const imageId = crypto.randomUUID();
    const path = `${userId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${imageId}.png`;

    const upload = await supabase.storage.from(IMAGE_BUCKET).upload(path, bytes, {
      upsert: false,
      contentType: 'image/png',
      cacheControl: '3600',
    });
    if (upload.error) {
      throw createImageProviderError({
        provider: 'openai',
        code: 'storage_error',
        message: `Failed to store generated image: ${upload.error.message}`,
        retryable: false,
      });
    }

    const signed = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(path, IMAGE_SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      throw createImageProviderError({
        provider: 'openai',
        code: 'storage_error',
        message: `Failed to sign generated image URL: ${signed.error?.message || 'Unknown error'}`,
        retryable: false,
      });
    }

    generatedImages.push({
      id: imageId,
      bucket: IMAGE_BUCKET,
      path,
      signed_url: signed.data.signedUrl,
      mime_type: 'image/png',
      prompt,
      width: dims.width,
      height: dims.height,
      provider: 'openai',
      model,
      expires_at: new Date(Date.now() + IMAGE_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    });
  }

  if (generatedImages.length === 0) {
    throw createImageProviderError({
      provider: 'openai',
      code: 'provider_error',
      message: 'Generated image payload was empty after processing',
      retryable: true,
    });
  }

  return {
    content: 'Image generated successfully.',
    model,
    generated_images: generatedImages,
    provider: 'openai',
  };
}

const RETRYABLE_PROVIDER_STATUSES = new Set([429, 503, 529]);

type ResponseMode = 'direct_writing' | 'explain_direct' | 'tutor_interactive';
type LanguageSource = 'explicit_override' | 'auto_detect' | 'preference';
type SupportedLocale = 'en-ZA' | 'af-ZA' | 'zu-ZA';

function parseResponseMode(metadata?: Record<string, unknown>): ResponseMode | null {
  const raw = String(metadata?.response_mode || '').trim().toLowerCase();
  if (raw === 'direct_writing' || raw === 'explain_direct' || raw === 'tutor_interactive') {
    return raw;
  }
  return null;
}

function parseLanguageSource(metadata?: Record<string, unknown>): LanguageSource | null {
  const raw = String(metadata?.language_source || '').trim().toLowerCase();
  if (raw === 'explicit_override' || raw === 'auto_detect' || raw === 'preference') {
    return raw;
  }
  return null;
}

function parseDetectedLocale(metadata?: Record<string, unknown>): SupportedLocale | null {
  const raw = String(metadata?.detected_language || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'af' || raw === 'af-za') return 'af-ZA';
  if (raw === 'zu' || raw === 'zu-za') return 'zu-ZA';
  if (raw === 'en' || raw === 'en-za') return 'en-ZA';
  return null;
}

function getLocaleLabel(locale: SupportedLocale): string {
  if (locale === 'af-ZA') return 'Afrikaans';
  if (locale === 'zu-ZA') return 'isiZulu';
  return 'English (South Africa)';
}

function getLanguagePrompt(metadata?: Record<string, unknown>): string | null {
  const locale = parseDetectedLocale(metadata);
  if (!locale) return null;
  const source = parseLanguageSource(metadata);
  const label = getLocaleLabel(locale);

  if (source === 'explicit_override') {
    return [
      'LANGUAGE MODE: explicit_override',
      `- Reply fully in ${label} (${locale}) for this turn.`,
      '- Keep examples and explanations in the same language.',
    ].join('\n');
  }
  if (source === 'auto_detect') {
    return [
      'LANGUAGE MODE: auto_detect',
      `- The learner appears to be using ${label} (${locale}).`,
      '- Reply in the same language unless they ask to switch.',
    ].join('\n');
  }
  if (source === 'preference') {
    return [
      'LANGUAGE MODE: preference',
      `- Prefer ${label} (${locale}) unless the user requests another language explicitly.`,
    ].join('\n');
  }
  return null;
}

function getResponseModePrompt(mode: ResponseMode | null): string | null {
  if (mode === 'direct_writing') {
    return [
      'RESPONSE MODE: direct_writing',
      '- Produce polished, complete writing output requested by the user.',
      '- Do not switch into quiz/tutor loop unless explicitly requested.',
      '- Keep structure clean and publication-ready.',
    ].join('\n');
  }
  if (mode === 'tutor_interactive') {
    return [
      'RESPONSE MODE: tutor_interactive',
      '- Use one-question-at-a-time tutoring.',
      '- Wait for learner response before moving on.',
      '- Give brief scaffolds and corrections between turns.',
    ].join('\n');
  }
  if (mode === 'explain_direct') {
    return [
      'RESPONSE MODE: explain_direct',
      '- Explain directly and clearly first.',
      '- Only add quiz-style interaction when the user asks for testing/practice.',
    ].join('\n');
  }
  return null;
}

function buildSystemPrompt(
  extraContext?: string,
  serviceType?: string,
  requestMetadata?: Record<string, unknown>
): string {
  // Grading requests get a specialised system prompt — the tutor persona
  // would otherwise attempt conversation instead of grading.
  if (serviceType === 'grading') {
    const GRADING_SYSTEM_PROMPT = [
      'You are an experienced South African teacher responsible for grading student work.',
      'Evaluate the student submission against the criteria provided in the user message.',
      'Always respond with ONLY valid JSON (no markdown fences, no preamble, no trailing text).',
      'JSON schema: { "score": <0-100>, "feedback": "<constructive, age-appropriate feedback>",',
      '  "strengths": ["..."], "areasForImprovement": ["..."], "suggestions": ["..."] }',
      'Be encouraging. Identify genuine strengths before listing areas for improvement.',
      'If a language preference is specified, respond in that language.',
    ].join('\n');
    return extraContext
      ? `${GRADING_SYSTEM_PROMPT}\n\nCONTEXT:\n${extraContext}`
      : GRADING_SYSTEM_PROMPT;
  }

  const responseModePrompt = getResponseModePrompt(parseResponseMode(requestMetadata));
  const languagePrompt = getLanguagePrompt(requestMetadata);
  const promptParts = [DEFAULT_SYSTEM_PROMPT, responseModePrompt, languagePrompt].filter(Boolean);
  const basePrompt = promptParts.join('\n\n');
  if (!extraContext) return basePrompt;
  
  // Check if extra context contains image/attachment directives (high priority)
  const hasImageDirective = extraContext.includes('IMAGE PROCESSING') || 
                            extraContext.includes('IMAGE ANALYSIS') ||
                            extraContext.includes('VISION PROCESSING');
  
  if (hasImageDirective) {
    // Put image directives FIRST (higher priority than default prompt)
    return `${extraContext}\n\n${basePrompt}`;
  }
  
  // Normal context appended after default prompt
  return `${basePrompt}\n\nCONTEXT:\n${extraContext}`;
}

function getOCRPrompt(task: 'homework' | 'document' | 'handwriting'): string {
  return OCR_PROMPT_BY_TASK[task] || OCR_PROMPT_BY_TASK.document;
}

const CRITERIA_RESPONSE_PROMPT = [
  'CRITERIA RESPONSE MODE:',
  '- Identify each criterion label exactly as written in the source.',
  '- Keep section order exactly aligned to the source labels.',
  '- Use one section per criterion with the exact heading text (for example: "a) Planning and delivery of learning programme").',
  '- Never rename or paraphrase criterion headings.',
  '- Do not skip or merge criteria.',
  '- Put evidence in a separate section titled exactly: "Attach all relevant documentation as evidence".',
  '- Do not add names, institutions, signatures, or dates unless explicitly provided by the user.',
].join('\n');

const CRITERIA_RESPONSE_PATTERNS: RegExp[] = [
  /\b(help|assist|draft|write|answer|respond)\b.{0,30}\b(criteria|criterion|rubric|assessment)\b/i,
  /\b(criteria|criterion|rubric|assessment)\b.{0,30}\b(answer|response|draft|write|help)\b/i,
  /\bgroup discussion response\b/i,
  /\bassessment criteria?\b/i,
  /\bassessment criterion\s*(1|2|3|4|5)\b/i,
  /\banswer (a|b|c|d|e)\b/i,
  /\battach all relevant documentation as evidence\b/i,
];

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const entry = part as Record<string, unknown>;
      if (entry.type === 'text' && typeof entry.text === 'string') {
        return entry.text.trim();
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function countCriteriaLabels(text: string): number {
  const value = String(text || '').toLowerCase();
  if (!value) return 0;
  const alphaMatches = value.match(/\b([a-e])\)/g) || [];
  const alphaUnique = new Set(alphaMatches.map((item) => item.trim())).size;
  const numericMatches = value.match(/\b([1-9])[.)]/g) || [];
  const numericUnique = new Set(numericMatches.map((item) => item.trim())).size;
  return Math.max(alphaUnique, numericUnique);
}

function getLatestUserTextForCriteria(
  requestPayload: z.infer<typeof RequestSchema>['payload'],
): string {
  if (Array.isArray(requestPayload.messages) && requestPayload.messages.length > 0) {
    for (let idx = requestPayload.messages.length - 1; idx >= 0; idx -= 1) {
      const msg = requestPayload.messages[idx];
      if (msg.role !== 'user') continue;
      const text = extractMessageText(msg.content);
      if (text) return text;
    }
  }

  if (Array.isArray(requestPayload.conversationHistory) && requestPayload.conversationHistory.length > 0) {
    for (let idx = requestPayload.conversationHistory.length - 1; idx >= 0; idx -= 1) {
      const msg = requestPayload.conversationHistory[idx];
      if (msg.role !== 'user') continue;
      const text = extractMessageText(msg.content);
      if (text) return text;
    }
  }

  return String(requestPayload.prompt || '').trim();
}

function shouldUseCriteriaResponseMode(
  requestPayload: z.infer<typeof RequestSchema>['payload'],
  requestMetadata?: Record<string, unknown>,
): boolean {
  if (requestMetadata?.criteria_mode === true) {
    return true;
  }
  const text = getLatestUserTextForCriteria(requestPayload);
  if (!text) return false;
  if (CRITERIA_RESPONSE_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  return countCriteriaLabels(text) >= 3;
}

function detectPhonicsMode(
  requestPayload: z.infer<typeof RequestSchema>['payload'],
  metadata?: Record<string, unknown>
): boolean {
  const context = [
    requestPayload.prompt,
    requestPayload.context,
    Array.isArray(requestPayload.messages)
      ? requestPayload.messages
          .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
          .join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const role = String(metadata?.role || '').toLowerCase();
  const orgType = String(metadata?.org_type || metadata?.organization_type || '').toLowerCase();
  const ageYears = Number(metadata?.age_years ?? metadata?.learner_age_years ?? Number.NaN);
  const grade = String(metadata?.grade || metadata?.grade_level || '').toLowerCase();

  const explicitPhonics = /\bphonics\b|\bletter\s+sound|\bblend(?:ing)?\b|\bsegment(?:ing)?\b|\brhyme\b|\/[a-z]\//i.test(context);
  const preschoolSignals = (
    orgType.includes('preschool') ||
    orgType.includes('ecd') ||
    role === 'parent' ||
    role === 'student' ||
    (Number.isFinite(ageYears) && ageYears <= 6) ||
    grade === 'grade r' ||
    grade === 'pre-r' ||
    grade === 'pre r' ||
    grade === 'grade 1'
  );

  return explicitPhonics || (preschoolSignals && /\b(letter|sound|alphabet|reading)\b/i.test(context));
}

function extractJsonObjectCandidate(content: string): Record<string, unknown> | null {
  const text = String(content || '').trim();
  if (!text) return null;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch?.[1] || text).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Ignore and fall through
  }
  const loose = text.match(/\{[\s\S]*\}/);
  if (!loose) return null;
  try {
    const parsed = JSON.parse(loose[0]) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Ignore
  }
  return null;
}

function normalizeOCRResponse(params: {
  content: string;
  task: 'homework' | 'document' | 'handwriting';
}): {
  extracted_text: string;
  confidence: number;
  document_type: 'homework' | 'document' | 'handwriting';
  analysis: string;
  unclear_spans: string[];
} {
  const parsed = extractJsonObjectCandidate(params.content);
  const extractedText = typeof parsed?.extracted_text === 'string'
    ? parsed.extracted_text
    : typeof parsed?.text === 'string'
      ? parsed.text
      : String(params.content || '').trim();
  const analysis = typeof parsed?.analysis === 'string'
    ? parsed.analysis
    : String(params.content || '').trim();
  const confidenceRaw = typeof parsed?.confidence === 'number'
    ? parsed.confidence
    : typeof parsed?.confidence === 'string'
      ? Number.parseFloat(parsed.confidence)
      : 0.72;
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0.72;
  const documentType = (
    parsed?.document_type === 'homework' ||
    parsed?.document_type === 'document' ||
    parsed?.document_type === 'handwriting'
  )
    ? parsed.document_type
    : params.task;
  const unclearSpans = Array.isArray(parsed?.unclear_spans)
    ? parsed.unclear_spans
        .map((span) => String(span || '').trim())
        .filter((span) => span.length > 0)
        .slice(0, 6)
    : (() => {
        const matches = String(analysis || '')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.includes('[?]'))
          .slice(0, 6);
        return matches;
      })();

  return {
    extracted_text: extractedText,
    confidence: Number(confidence.toFixed(2)),
    document_type: documentType,
    analysis,
    unclear_spans: unclearSpans,
  };
}

function parseAllowedModels(envKey: string, defaults: string[]): string[] {
  const raw = Deno.env.get(envKey);
  if (!raw) return defaults;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function pickAllowedModel(
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

function normalizeRequestedModel(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const sonnet4 = getEnv('ANTHROPIC_SONNET_4_MODEL') || 'claude-sonnet-4-20250514';
  const sonnet45 = getEnv('ANTHROPIC_SONNET_4_5_MODEL') || 'claude-sonnet-4-5-20250514';
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
    'claude-3-7-sonnet': 'claude-3-7-sonnet-20250219',
    'claude-3-7-sonnet-latest': 'claude-3-7-sonnet-20250219',
    'claude-sonnet-4': sonnet4,
    'claude-sonnet-4-latest': sonnet4,
    'claude-sonnet-4.5': sonnet45,
    'claude-sonnet-4-5': sonnet45,
    'claude-sonnet-4-5-latest': sonnet45,
  };

  return aliases[key] || trimmed;
}

function normalizeAnthropicAllowedModels(models: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of models) {
    const normalized = normalizeRequestedModel(raw) || String(raw || '').trim();
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

function canonicalToolName(value: string): string {
  return String(value || '').trim().toLowerCase();
}

async function webSearchTool(args: z.infer<typeof WebSearchArgsSchema>): Promise<JsonRecord> {
  // Provider priority:
  // 1) Brave Search (best general web coverage)
  // 2) Bing Web Search API
  // 3) Google Custom Search API
  // 4) DuckDuckGo Instant Answer (last-resort, limited)
  const braveApiKey = getEnv('BRAVE_SEARCH_API_KEY');
  if (braveApiKey && braveApiKey.trim().length > 0) {
    try {
      return await braveSearch(args, braveApiKey);
    } catch (err) {
      console.error('[webSearch] Brave failed, trying Bing/Google fallback:', err);
    }
  }

  const bingApiKey = getEnv('BING_SEARCH_API_KEY');
  if (bingApiKey && bingApiKey.trim().length > 0) {
    try {
      return await bingSearch(args, bingApiKey);
    } catch (err) {
      console.error('[webSearch] Bing failed, trying Google/DDG fallback:', err);
    }
  }

  const googleApiKey = getEnv('GOOGLE_SEARCH_API_KEY');
  const googleCseId = getEnv('GOOGLE_CSE_ID');
  if (googleApiKey && googleCseId) {
    try {
      return await googleCustomSearch(args, googleApiKey, googleCseId);
    } catch (err) {
      console.error('[webSearch] Google CSE failed, falling back to DDG:', err);
    }
  }

  return duckDuckGoSearch(args);
}

function filterResultsByDomains(
  results: Array<JsonRecord>,
  domains?: string[]
): Array<JsonRecord> {
  if (!domains || domains.length === 0) return results;
  const normalizedDomains = domains.map((domain) => String(domain || '').toLowerCase()).filter(Boolean);
  if (normalizedDomains.length === 0) return results;
  return results.filter((result) => {
    const urlStr = String(result.url || '').toLowerCase();
    return normalizedDomains.some((domain) => urlStr.includes(domain));
  });
}

async function braveSearch(
  args: z.infer<typeof WebSearchArgsSchema>,
  apiKey: string,
): Promise<JsonRecord> {
  try {
    const params = new URLSearchParams({
      q: args.query,
      count: '5',
      text_decorations: 'false',
      search_lang: 'en',
    });
    if (args.recency === 'day') params.set('freshness', 'pd');
    else if (args.recency === 'week') params.set('freshness', 'pw');
    else if (args.recency === 'month') params.set('freshness', 'pm');

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Brave API error ${response.status}: ${errText.slice(0, 180)}`);
    }

    const data = (await response.json()) as JsonRecord;
    const webResults = Array.isArray((data as any).web?.results) ? (data as any).web.results : [];

    const results: Array<JsonRecord> = webResults.slice(0, 5).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || r.title || '',
      source: 'brave',
    }));

    const filtered = filterResultsByDomains(results, args.domains);

    const infobox = (data as any).infobox?.results?.[0];
    const abstract = infobox?.long_desc || infobox?.description || undefined;

    return { query: args.query, results: filtered, abstract, provider: 'brave' };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function bingSearch(
  args: z.infer<typeof WebSearchArgsSchema>,
  apiKey: string,
): Promise<JsonRecord> {
  const params = new URLSearchParams({
    q: args.query,
    count: '5',
    textDecorations: 'false',
    textFormat: 'Raw',
  });

  if (args.recency === 'day') params.set('freshness', 'Day');
  else if (args.recency === 'week') params.set('freshness', 'Week');
  else if (args.recency === 'month') params.set('freshness', 'Month');

  const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Bing API error ${response.status}: ${errText.slice(0, 180)}`);
  }

  const data = (await response.json()) as JsonRecord;
  const rows = Array.isArray((data as any).webPages?.value) ? (data as any).webPages.value : [];
  const results: Array<JsonRecord> = rows.slice(0, 5).map((row: any) => ({
    title: String(row?.name || ''),
    url: String(row?.url || ''),
    snippet: String(row?.snippet || row?.name || ''),
    source: 'bing',
  }));

  return {
    query: args.query,
    results: filterResultsByDomains(results, args.domains),
    provider: 'bing',
  };
}

async function googleCustomSearch(
  args: z.infer<typeof WebSearchArgsSchema>,
  apiKey: string,
  cseId: string,
): Promise<JsonRecord> {
  const params = new URLSearchParams({
    key: apiKey,
    cx: cseId,
    q: args.query,
    num: '5',
    safe: 'off',
    hl: 'en',
  });

  if (args.recency === 'day') params.set('dateRestrict', 'd1');
  else if (args.recency === 'week') params.set('dateRestrict', 'w1');
  else if (args.recency === 'month') params.set('dateRestrict', 'm1');

  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Google CSE error ${response.status}: ${errText.slice(0, 180)}`);
  }

  const data = (await response.json()) as JsonRecord;
  const items = Array.isArray((data as any).items) ? (data as any).items : [];
  const results: Array<JsonRecord> = items.slice(0, 5).map((item: any) => ({
    title: String(item?.title || ''),
    url: String(item?.link || ''),
    snippet: String(item?.snippet || item?.title || ''),
    source: 'google',
  }));

  return {
    query: args.query,
    results: filterResultsByDomains(results, args.domains),
    provider: 'google',
  };
}

async function duckDuckGoSearch(args: z.infer<typeof WebSearchArgsSchema>): Promise<JsonRecord> {
  const query = encodeURIComponent(args.query);
  const url = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&no_redirect=1`;
  const response = await fetch(url);
  const data = (await response.json()) as JsonRecord;

  const results: Array<JsonRecord> = [];
  const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];

  for (const item of related) {
    if (item && typeof item === 'object') {
      const entry = item as JsonRecord;
      if (typeof entry.Text === 'string' && typeof entry.FirstURL === 'string') {
        results.push({
          title: entry.Text,
          url: entry.FirstURL,
          snippet: entry.Text,
          source: 'duckduckgo',
        });
      }
      if (Array.isArray(entry.Topics)) {
        for (const sub of entry.Topics) {
          if (sub && typeof sub === 'object') {
            const subEntry = sub as JsonRecord;
            if (typeof subEntry.Text === 'string' && typeof subEntry.FirstURL === 'string') {
              results.push({
                title: subEntry.Text,
                url: subEntry.FirstURL,
                snippet: subEntry.Text,
                source: 'duckduckgo',
              });
            }
          }
        }
      }
    }
  }

  const filtered = filterResultsByDomains(results, args.domains);

  return {
    query: args.query,
    results: filtered.slice(0, 5),
    abstract: typeof data.AbstractText === 'string' ? data.AbstractText : undefined,
    provider: 'duckduckgo',
  };
}

function mapGradeToRange(grade: string): string {
  const raw = String(grade || '').trim();
  const upper = raw.toUpperCase();
  const normalized = upper.replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, '');
  if (/^(R-3|4-6|7-9|10-12)$/.test(normalized)) return normalized;
  if (normalized === 'R' || /^(0|1|2|3)$/.test(normalized)) return 'R-3';
  if (/^[4-6]$/.test(normalized)) return '4-6';
  if (/^[7-9]$/.test(normalized)) return '7-9';
  if (/^(10|11|12)$/.test(normalized)) return '10-12';

  const cleaned = normalized.replace(/[^0-9R-]/g, '');
  if (/^(R-3|4-6|7-9|10-12)$/.test(cleaned)) return cleaned;
  if (cleaned === 'R' || /^(0|1|2|3)$/.test(cleaned)) return 'R-3';
  if (/^[4-6]$/.test(cleaned)) return '4-6';
  if (/^[7-9]$/.test(cleaned)) return '7-9';
  if (/^(10|11|12)$/.test(cleaned)) return '10-12';
  return normalized || raw;
}

function normalizeSubjectForIlike(subject: string): string {
  const lower = String(subject || '').toLowerCase();
  if (!lower) return '';
  if (lower.includes('math')) return 'math';
  if (lower.includes('english')) return 'english';
  if (lower.includes('afrikaans')) return 'afrikaans';
  if (lower.includes('physical')) return 'physical';
  if (lower.includes('life science')) return 'life';
  if (lower.includes('life skills')) return 'life skills';
  if (lower.includes('social') || /\bss\b/.test(lower)) return 'social';
  if (lower.includes('geograph') || lower === 'geo') return 'geograph';
  if (lower.includes('history')) return 'history';
  if (lower.includes('technology') || lower.includes('tech')) return 'tech';
  return lower;
}

function augmentCapsSearchQuery(query: string, subject?: string): string {
  const base = String(query || '').trim();
  const s = String(subject || '').toLowerCase();
  if (!base || !s) return base;

  const synonyms: string[] = [];
  if (/(social|\bss\b)/i.test(s)) synonyms.push('"social sciences"', '"social science"', 'geography', 'history');
  if (/geograph/i.test(s)) synonyms.push('geography', '"social sciences"');
  if (/math/i.test(s)) synonyms.push('mathematics', 'math');
  if (/english/i.test(s)) synonyms.push('english');
  return [base, ...synonyms].filter(Boolean).join(' ');
}

async function searchCapsCurriculumTool(
  supabase: any,
  args: z.infer<typeof CAPSCurriculumArgsSchema>,
): Promise<JsonRecord> {
  const rawQuery = String(args.query || args.search_query || '').trim();
  const limit = Math.min(Number(args.limit || 10) || 10, 50);
  const gradeRange = args.grade ? mapGradeToRange(args.grade) : null;
  const normalizedSubject = args.subject ? normalizeSubjectForIlike(args.subject) : null;
  const augmentedQuery = augmentCapsSearchQuery(rawQuery, args.subject);

  try {
    const { data, error } = await supabase.rpc('search_caps_curriculum', {
      search_query: augmentedQuery,
      search_grade: gradeRange,
      // Equality filter in SQL is strict; use query augmentation + post-filtering instead.
      search_subject: null,
      result_limit: limit,
    });

    if (!error && Array.isArray(data)) {
      let docs = (data as any[]).map((row) => ({
        id: row.id,
        title: row.title,
        grade: row.grade,
        subject: row.subject,
        document_type: row.document_type,
        content_preview: row.content_preview,
        file_url: row.file_url,
        relevance_rank: row.relevance_rank,
      }));

      if (args.document_type) {
        docs = docs.filter((d) => String(d.document_type || '').toLowerCase() === String(args.document_type).toLowerCase());
      }
      if (normalizedSubject) {
        docs = docs.filter((d) => String(d.subject || '').toLowerCase().includes(normalizedSubject));
      }

      return {
        success: true,
        found: docs.length > 0,
        query: rawQuery,
        count: docs.length,
        documents: docs,
        grade: gradeRange,
        subject: args.subject || null,
        source: 'rpc.search_caps_curriculum',
      };
    }
  } catch {
    // Fall through to basic query
  }

  // Fallback: basic filter on caps_documents (no full-text ranking)
  try {
    let qb = supabase
      .from('caps_documents')
      .select('id, title, grade, subject, document_type, file_url, source_url, year, term, description, metadata')
      .limit(limit);

    if (gradeRange) qb = qb.eq('grade', gradeRange);
    if (args.document_type) qb = qb.eq('document_type', args.document_type);
    if (normalizedSubject) qb = qb.ilike('subject', `%${normalizedSubject}%`);
    if (rawQuery) {
      // PostgREST `.or()` uses commas as separators; sanitize user query to avoid parse errors.
      const safe = rawQuery.replace(/[%_,]/g, ' ').trim();
      if (safe) qb = qb.or(`title.ilike.%${safe}%,subject.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    const { data, error } = await qb;
    if (error) {
      return { success: false, error: 'caps_search_failed', details: error.message || error };
    }

    const docs = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      grade: row.grade,
      subject: row.subject,
      document_type: row.document_type,
      file_url: row.file_url,
      source_url: row.source_url,
      year: row.year,
      term: row.term,
      description: row.description,
      metadata: row.metadata,
    }));

    return {
      success: true,
      found: docs.length > 0,
      query: rawQuery,
      count: docs.length,
      documents: docs,
      grade: gradeRange,
      subject: args.subject || null,
      source: 'table.caps_documents',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'caps_search_failed', details: message };
  }
}

async function getCapsDocumentsTool(
  supabase: any,
  args: z.infer<typeof GetCapsDocumentsArgsSchema>,
): Promise<JsonRecord> {
  const gradeRange = mapGradeToRange(args.grade);
  const normalizedSubject = normalizeSubjectForIlike(args.subject);
  const limit = Math.min(Number(args.limit || 20) || 20, 50);

  try {
    let qb = supabase
      .from('caps_documents')
      .select('id, title, grade, subject, document_type, file_url, source_url, year, term, description, metadata')
      .eq('grade', gradeRange)
      .ilike('subject', `%${normalizedSubject}%`)
      .limit(limit);

    if (args.document_type) qb = qb.eq('document_type', args.document_type);

    const { data, error } = await qb;
    if (error) {
      return { success: false, error: 'caps_documents_failed', details: error.message || error };
    }

    return {
      success: true,
      grade: gradeRange,
      subject: args.subject,
      count: (data || []).length,
      documents: data || [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'caps_documents_failed', details: message };
  }
}

async function getCapsSubjectsTool(
  supabase: any,
  args: z.infer<typeof GetCapsSubjectsArgsSchema>,
): Promise<JsonRecord> {
  const gradeRange = mapGradeToRange(args.grade);

  try {
    const { data, error } = await supabase
      .from('caps_documents')
      .select('subject')
      .eq('grade', gradeRange);

    if (error) {
      return { success: false, error: 'caps_subjects_failed', details: error.message || error };
    }

    const subjects = Array.from(new Set((data || []).map((d: any) => d.subject).filter(Boolean)));
    return {
      success: true,
      grade: gradeRange,
      count: subjects.length,
      subjects,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'caps_subjects_failed', details: message };
  }
}

function buildOpenAITools(enableTools: boolean, clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>) {
  if (!enableTools) return undefined;
  const serverTools = [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for up-to-date or external information.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            recency: { type: 'string', description: 'Optional recency filter like "day" or "week"' },
            domains: { type: 'array', items: { type: 'string' } },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_caps_curriculum',
        description: 'Search South African CAPS curriculum documents by topic/keyword, optionally filtering by grade and subject.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (topic, concept, or keyword)' },
            grade: { type: 'string', description: 'Optional grade (e.g., "R", "1", "4-6", "10-12")' },
            subject: { type: 'string', description: 'Optional subject (e.g., "Mathematics", "Life Skills")' },
            limit: { type: 'number', description: 'Max results (default: 10)' },
            document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_caps_documents',
        description: 'Retrieve CAPS documents for a specific grade and subject.',
        parameters: {
          type: 'object',
          properties: {
            grade: { type: 'string', description: 'Grade (e.g., "R-3", "4-6", "7-9", "10-12")' },
            subject: { type: 'string', description: 'Subject (e.g., "Mathematics")' },
            limit: { type: 'number', description: 'Max results (default: 20)' },
            document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
          },
          required: ['grade', 'subject'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_caps_subjects',
        description: 'List CAPS subjects available for a given grade range.',
        parameters: {
          type: 'object',
          properties: {
            grade: { type: 'string', description: 'Grade (e.g., "R-3", "4-6", "7-9", "10-12")' },
          },
          required: ['grade'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'caps_curriculum_query',
        description: '(Alias) Search CAPS curriculum. Prefer search_caps_curriculum.',
        parameters: {
          type: 'object',
          properties: {
            search_query: { type: 'string', description: 'Search query (topic, concept, or keyword)' },
            grade: { type: 'string', description: 'Optional grade (e.g., "R", "1", "4-6", "10-12")' },
            subject: { type: 'string', description: 'Optional subject (e.g., "Mathematics", "Life Skills")' },
            limit: { type: 'number', description: 'Max results (default: 10)' },
            document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
          },
          required: [],
        },
      },
    },
  ];
  // Merge client-side tools into OpenAI format
  const seenToolNames = new Set(
    serverTools.map((tool) => canonicalToolName(String((tool as any)?.function?.name || ''))).filter(Boolean),
  );
  if (clientTools && clientTools.length > 0) {
    for (const ct of clientTools) {
      const toolName = String(ct?.name || '').trim();
      if (!toolName) continue;
      const canonicalName = canonicalToolName(toolName);
      if (seenToolNames.has(canonicalName)) {
        console.warn('[ai-proxy] Skipping duplicate OpenAI tool name from client_tools:', toolName);
        continue;
      }
      seenToolNames.add(canonicalName);
      serverTools.push({
        type: 'function',
        function: {
          name: toolName,
          description: ct.description,
          parameters: ct.input_schema as any,
        },
      });
    }
  }
  return serverTools;
}

function buildAnthropicTools(enableTools: boolean, clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>) {
  if (!enableTools) return undefined;
  const tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }> = [
    {
      name: 'web_search',
      description: 'Search the web for up-to-date or external information.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          recency: { type: 'string', description: 'Optional recency filter like "day" or "week"' },
          domains: { type: 'array', items: { type: 'string' } },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_caps_curriculum',
      description: 'Search South African CAPS curriculum documents by topic/keyword, optionally filtering by grade and subject.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (topic, concept, or keyword)' },
          grade: { type: 'string', description: 'Optional grade (e.g., "R", "1", "4-6", "10-12")' },
          subject: { type: 'string', description: 'Optional subject (e.g., "Mathematics", "Life Skills")' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
          document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_caps_documents',
      description: 'Retrieve CAPS documents for a specific grade and subject.',
      input_schema: {
        type: 'object',
        properties: {
          grade: { type: 'string', description: 'Grade (e.g., "R-3", "4-6", "7-9", "10-12")' },
          subject: { type: 'string', description: 'Subject (e.g., "Mathematics")' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
          document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
        },
        required: ['grade', 'subject'],
      },
    },
    {
      name: 'get_caps_subjects',
      description: 'List CAPS subjects available for a given grade range.',
      input_schema: {
        type: 'object',
        properties: {
          grade: { type: 'string', description: 'Grade (e.g., "R-3", "4-6", "7-9", "10-12")' },
        },
        required: ['grade'],
      },
    },
    {
      name: 'caps_curriculum_query',
      description: '(Alias) Search CAPS curriculum. Prefer search_caps_curriculum.',
      input_schema: {
        type: 'object',
        properties: {
          search_query: { type: 'string', description: 'Search query (topic, concept, or keyword)' },
          grade: { type: 'string', description: 'Optional grade (e.g., "R", "1", "4-6", "10-12")' },
          subject: { type: 'string', description: 'Optional subject (e.g., "Mathematics", "Life Skills")' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
          document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
        },
        required: [],
      },
    },
  ];
  // Merge client-side tools
  const seenToolNames = new Set(tools.map((tool) => canonicalToolName(String(tool?.name || ''))).filter(Boolean));
  if (clientTools && clientTools.length > 0) {
    for (const ct of clientTools) {
      const toolName = String(ct?.name || '').trim();
      if (!toolName) continue;
      const canonicalName = canonicalToolName(toolName);
      if (seenToolNames.has(canonicalName)) {
        console.warn('[ai-proxy] Skipping duplicate Anthropic tool name from client_tools:', toolName);
        continue;
      }
      seenToolNames.add(canonicalName);
      tools.push({
        name: toolName,
        description: ct.description,
        input_schema: ct.input_schema,
      });
    }
  }
  return tools;
}

function stripBase64DataUri(value: string): string {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
  return match ? match[1] : trimmed;
}

function normalizeVisionMediaType(raw: string): {
  mediaType: string;
  blockType: 'image' | 'document';
} {
  const lower = String(raw || '').trim().toLowerCase();
  if (lower === 'application/pdf') {
    return { mediaType: 'application/pdf', blockType: 'document' };
  }
  if (lower === 'image/jpg') {
    return { mediaType: 'image/jpeg', blockType: 'image' };
  }
  if (lower === 'image/jpeg' || lower === 'image/png' || lower === 'image/gif' || lower === 'image/webp') {
    return { mediaType: lower, blockType: 'image' };
  }
  if (lower.startsWith('image/')) {
    // Normalize uncommon/unsupported image formats (e.g. HEIC) to a supported hint.
    return { mediaType: 'image/jpeg', blockType: 'image' };
  }
  return { mediaType: 'image/jpeg', blockType: 'image' };
}

function hasMessageContent(content: unknown): boolean {
  if (typeof content === 'string') {
    return content.trim().length > 0;
  }
  if (Array.isArray(content)) {
    return content.some((part) => {
      if (!part || typeof part !== 'object') return false;
      const block = part as JsonRecord;
      if (typeof block.text === 'string' && block.text.trim().length > 0) return true;
      if (block.type === 'image' || block.type === 'document') return true;
      const source = block.source as JsonRecord | undefined;
      if (source && typeof source.data === 'string' && source.data.trim().length > 0) return true;
      return false;
    });
  }
  if (content && typeof content === 'object') {
    return Object.keys(content as Record<string, unknown>).length > 0;
  }
  return false;
}

function normalizeConversationRole(value: unknown): 'system' | 'user' | 'assistant' | null {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'system' || role === 'user' || role === 'assistant') return role;
  if (role === 'model') return 'assistant';
  return null;
}

function hasActionableUserMessages(messages: Array<JsonRecord>): boolean {
  return messages.some((msg) => {
    const role = normalizeConversationRole((msg as JsonRecord).role);
    if (role !== 'user') return false;
    return hasMessageContent((msg as JsonRecord).content);
  });
}

function buildProviderConversationMessages(messages: Array<JsonRecord>): Array<JsonRecord> {
  const normalized: Array<JsonRecord> = [];
  for (const raw of messages) {
    const role = normalizeConversationRole(raw?.role);
    if (!role || role === 'system') continue;
    if (!hasMessageContent(raw?.content)) continue;
    normalized.push({ ...raw, role });
  }
  return normalized;
}

function hasQuotaOrRateLimitSignal(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('insufficient_quota') ||
    normalized.includes('rate limit') ||
    normalized.includes('workspace api usage limits') ||
    normalized.includes('api usage limits') ||
    normalized.includes('will regain access on') ||
    normalized.includes(' 429 ') ||
    normalized.includes('status":429')
  );
}

function isNonRetryableInvalidRequest(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('invalid_request_no_user_message') ||
    normalized.includes('messages: at least one message is required') ||
    normalized.includes('please send a question or attach a file')
  );
}

function shouldAttemptCrossProviderFallback(message: string): boolean {
  return !isNonRetryableInvalidRequest(message);
}

function mapProviderErrorStatus(message: string): number {
  const normalized = String(message || '').toLowerCase();
  if (isNonRetryableInvalidRequest(message)) return 400;
  if (hasQuotaOrRateLimitSignal(message)) {
    return 429;
  }
  if (
    normalized.includes('provider_not_configured') ||
    normalized.includes('api_key') ||
    normalized.includes('not configured') ||
    normalized.includes('missing')
  ) {
    return 503;
  }
  const statusMatch = message.match(/\b(\d{3})\b/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status >= 400 && status <= 599) return status;
  }
  return 502;
}

function normalizeMessages(payload: z.infer<typeof RequestSchema>['payload'], systemPrompt: string) {
  const baseMessages = payload.conversationHistory || payload.messages;
  const messages: Array<JsonRecord> = [];

  messages.push({ role: 'system', content: systemPrompt });

  if (Array.isArray(baseMessages) && baseMessages.length > 0) {
    for (const rawMsg of baseMessages) {
      if (!rawMsg || typeof rawMsg !== 'object') continue;
      const msg = rawMsg as JsonRecord;
      const role = normalizeConversationRole(msg.role);
      if (!role || role === 'system') continue;
      if (!hasMessageContent(msg.content)) continue;
      messages.push({ ...msg, role });
    }
  }

  const promptText = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (promptText.length > 0) {
    const isDuplicatePrompt = messages.some((msg) =>
      String(msg.role || '').toLowerCase() === 'user' &&
      typeof msg.content === 'string' &&
      msg.content.trim() === promptText
    );
    if (!isDuplicatePrompt) {
      messages.push({ role: 'user', content: promptText });
    }
  }

  const images = Array.isArray(payload.images) ? payload.images : [];
  if (images.length > 0) {
    const imageBlocks = images.map((img) => {
      const normalized = normalizeVisionMediaType(String(img.media_type || ''));
      const blockType = normalized.blockType;
      return {
        type: blockType,
        source: {
          type: 'base64',
          media_type: normalized.mediaType,
          data: stripBase64DataUri(String(img.data || '')),
        },
      };
    });
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const existing = messages[i].content;
        if (Array.isArray(existing)) {
          messages[i] = { ...messages[i], content: [...existing, ...imageBlocks] };
        } else {
          messages[i] = {
            ...messages[i],
            content: [
              { type: 'text', text: typeof existing === 'string' ? existing : '' },
              ...imageBlocks,
            ],
          };
        }
        return messages;
      }
    }
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: 'Attached file for review.' }, ...imageBlocks],
    });
  }

  return messages;
}

function mapOpenAIContent(content: unknown) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  const mapped = content.map((part: any) => {
    if (part?.type === 'text') {
      return { type: 'text', text: part.text || '' };
    }
    if (part?.type === 'image' && part?.source?.data) {
      const mediaType = part.source.media_type || 'image/jpeg';
      const url = `data:${mediaType};base64,${part.source.data}`;
      return { type: 'image_url', image_url: { url } };
    }
    if (part?.type === 'document' && part?.source?.data) {
      const mediaType = part.source.media_type || 'application/octet-stream';
      return { type: 'text', text: `[Attached ${mediaType} document for OCR review]` };
    }
    if (part?.type === 'tool_use' || part?.type === 'tool_result') {
      // Never surface raw tool payload JSON in user-visible assistant text.
      return { type: 'text', text: '' };
    }
    if (typeof part?.text === 'string') {
      return { type: 'text', text: part.text };
    }
    return { type: 'text', text: '' };
  });
  return mapped;
}

function normalizeOpenAIMessages(messages: Array<JsonRecord>) {
  return messages.map((msg) => {
    const content = mapOpenAIContent((msg as any).content);
    return { ...msg, content };
  });
}

function chunkText(text: string, maxLen = 120): string[] {
  const safe = (text || '').trim();
  if (!safe) return [];
  const words = safe.split(/\s+/);
  const chunks: string[] = [];
  let buffer = '';
  for (const word of words) {
    const next = buffer ? `${buffer} ${word}` : word;
    if (next.length > maxLen && buffer) {
      chunks.push(buffer);
      buffer = word;
    } else {
      buffer = next;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function summarizeServerToolResult(toolName: string, output: JsonRecord): string | null {
  const success = Boolean(output?.success);
  if (!success) return null;

  if (toolName === 'web_search') {
    const results = Array.isArray(output?.results) ? output.results : [];
    const top = results
      .slice(0, 3)
      .map((entry) => String((entry as JsonRecord)?.title || '').trim())
      .filter(Boolean);
    if (top.length > 0) {
      return `\n\nI checked the web and found: ${top.join(' | ')}.`;
    }
    const count = Number(output?.count || 0);
    if (Number.isFinite(count) && count > 0) {
      return `\n\nI checked the web and found ${count} relevant source${count === 1 ? '' : 's'}.`;
    }
    return null;
  }

  if (toolName === 'search_caps_curriculum' || toolName === 'caps_curriculum_query' || toolName === 'get_caps_documents') {
    const documents = Array.isArray(output?.documents) ? output.documents : [];
    const topDocs = documents
      .slice(0, 3)
      .map((entry) => String((entry as JsonRecord)?.title || '').trim())
      .filter(Boolean);
    if (topDocs.length > 0) {
      return `\n\nI found CAPS documents: ${topDocs.join(' | ')}.`;
    }
    const count = Number(output?.count || 0);
    if (Number.isFinite(count) && count > 0) {
      return `\n\nI found ${count} CAPS document${count === 1 ? '' : 's'} relevant to this request.`;
    }
    return null;
  }

  if (toolName === 'get_caps_subjects') {
    const subjects = Array.isArray(output?.subjects) ? output.subjects : [];
    const topSubjects = subjects
      .slice(0, 6)
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (topSubjects.length > 0) {
      return `\n\nAvailable CAPS subjects include: ${topSubjects.join(', ')}.`;
    }
  }

  return null;
}

function buildSseStream(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = chunkText(content, 120);
  return new ReadableStream({
    async start(controller) {
      if (chunks.length === 0) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }
      for (const chunk of chunks) {
        const payload = {
          type: 'content_block_delta',
          delta: { text: `${chunk} ` },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

/**
 * Call Anthropic with native SSE streaming.
 * Returns a TransformStream that pipes Anthropic's SSE events to the client
 * in a normalised format, and also collects usage/content for post-call logging.
 */
function callAnthropicStreaming(
  supabase: any,
  messages: Array<JsonRecord>,
  requestedModel: string | null | undefined,
  allowedOverride: string[] | undefined,
  isSuperAdmin: boolean,
  requestMetadata: Record<string, unknown>,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  enableTools: boolean = false,
  clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
): { stream: ReadableStream<Uint8Array>; meta: Promise<ProviderResponse> } {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const allowed = normalizeAnthropicAllowedModels(
    allowedOverride || parseAllowedModels('ANTHROPIC_ALLOWED_MODELS', DEFAULT_ANTHROPIC_ALLOWED_MODELS)
  );
  const fallbackModel = normalizeRequestedModel(DEFAULT_ANTHROPIC_ALLOWED_MODELS[0]) || DEFAULT_ANTHROPIC_ALLOWED_MODELS[0];
  const superAdminAllowed = normalizeAnthropicAllowedModels(
    parseAllowedModels('SUPERADMIN_ANTHROPIC_MODELS', DEFAULT_SUPERADMIN_ALLOWED_MODELS)
  );
  const selectionAllowed = isSuperAdmin ? superAdminAllowed : allowed;
  const normalizedRequestedModel = normalizeRequestedModel(requestedModel || Deno.env.get('ANTHROPIC_MODEL'));
  const selection = pickAllowedModel(
    normalizedRequestedModel,
    selectionAllowed,
    selectionAllowed[0] || fallbackModel
  );
  if (selection.usedFallback) console.warn('[ai-proxy] Anthropic streaming model fallback:', selection.reason);
  const model = selection.model;

  const systemPrompt = messages.find((m) => m.role === 'system')?.content || DEFAULT_SYSTEM_PROMPT;
  const providerMessages = buildProviderConversationMessages(messages);
  if (!hasActionableUserMessages(providerMessages)) {
    throw new Error('invalid_request_no_user_message: Please send a question or attach a file before asking Dash.');
  }
  const encoder = new TextEncoder();

  // Mutable collectors for post-call logging (resolved via metaPromise)
  let fullContent = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let modelUsed = model;
  const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  let currentToolInputJson = '';
  let resolveMetaPromise: (v: ProviderResponse) => void;
  let rejectMetaPromise: (e: Error) => void;
  const metaPromise = new Promise<ProviderResponse>((res, rej) => {
    resolveMetaPromise = res;
    rejectMetaPromise = rej;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const callAnthropicStream = async (modelName: string, withTools: boolean) =>
          await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: modelName,
              max_tokens: maxTokens,
              temperature: resolveTemperature(requestMetadata),
              stream: true,
              messages: providerMessages,
              system: systemPrompt,
              ...(withTools ? { tools: buildAnthropicTools(true, clientTools) } : {}),
            }),
          });

        const isModelNotFoundError = (status: number, errText: string): boolean => {
          if (status !== 404) return false;
          try {
            const parsed = JSON.parse(errText) as JsonRecord;
            const errorObj = parsed?.error as JsonRecord | undefined;
            const errType = String(errorObj?.type || '').toLowerCase();
            const errMsg = String(errorObj?.message || '').toLowerCase();
            return errType === 'not_found_error' || errMsg.includes('model:');
          } catch {
            return errText.toLowerCase().includes('model:');
          }
        };

        const modelCandidates = [model, ...selectionAllowed.filter((m) => m !== model)];
        let usedToolsForRequest = enableTools;
        let responseModel = model;
        let response: Response | null = null;
        let failureErrText = '';

        for (const candidateModel of modelCandidates) {
          responseModel = candidateModel;
          usedToolsForRequest = enableTools;
          let candidatePrimaryError = '';
          let candidateResponse = await callAnthropicStream(candidateModel, usedToolsForRequest);

          if ((!candidateResponse.ok || !candidateResponse.body) && candidateResponse.status === 400 && usedToolsForRequest) {
            candidatePrimaryError = await candidateResponse.text();
            console.warn('[ai-proxy] Anthropic streaming 400 with tools enabled; retrying without tools', {
              model: candidateModel,
              error: candidatePrimaryError.slice(0, 320),
            });
            usedToolsForRequest = false;
            candidateResponse = await callAnthropicStream(candidateModel, false);
          }

          if (candidateResponse.ok && candidateResponse.body) {
            response = candidateResponse;
            failureErrText = '';
            break;
          }

          const candidateErrText = candidatePrimaryError || await candidateResponse.text();
          if (isModelNotFoundError(candidateResponse.status, candidateErrText)) {
            console.warn('[ai-proxy] Anthropic streaming model not found, trying next allowed model', {
              model: candidateModel,
            });
            failureErrText = candidateErrText;
            continue;
          }

          response = candidateResponse;
          failureErrText = candidateErrText;
          break;
        }

        if (!response || !response.ok || !response.body) {
          const status = response?.status || 500;
          const errText = failureErrText || 'Anthropic streaming request failed.';
          const errLower = errText.toLowerCase();
          const hasVisualAttachmentInput = messages.some((msg) => {
            if (!Array.isArray(msg.content)) return false;
            return msg.content.some((part) => {
              const type = String((part as JsonRecord)?.type || '').toLowerCase();
              const source = (part as JsonRecord)?.source as JsonRecord | undefined;
              const mediaType = String(source?.media_type || '').toLowerCase();
              return (
                type === 'image' ||
                type === 'image_url' ||
                type === 'document' ||
                mediaType.startsWith('image/') ||
                mediaType === 'application/pdf'
              );
            });
          });
          const attachmentErrorSignal = /image|jpeg|jpg|png|webp|gif|pdf|base64|mime|media[_\s-]?type|unsupported|too large|too_big|payload|exceed|size|bytes/i;
          const isLikelyAttachmentRelated =
            status === 400 &&
            hasVisualAttachmentInput &&
            attachmentErrorSignal.test(errLower);
          const userMessage = status === 529
              ? 'The AI service is temporarily overloaded. Please try again in a moment.'
              : status === 401 || status === 403
                ? 'AI service authentication error. Please contact support.'
                : status === 400 && isLikelyAttachmentRelated
                ? 'That file may be too large or in an unsupported format. Try a JPG/PNG image under 12MB, or retake with lower resolution.'
                : `Sorry, the AI service returned an error (${status}). Please try again.`;
          console.warn('[ai-proxy] Anthropic streaming failed', {
            status,
            model: responseModel,
            usedToolsForRequest,
            hasVisualAttachmentInput,
            error: errText.slice(0, 320),
          });
          const errEvent = { type: 'error', error: errText };
          const contentEvent = { type: 'content_block_delta', delta: { text: userMessage } };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvent)}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentEvent)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          rejectMetaPromise!(new Error(`Anthropic streaming error: ${status} ${errText}`));
          return;
        }

        modelUsed = responseModel;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue; // Skip comments & empty lines
            if (!trimmed.startsWith('data: ')) continue;

            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;

            try {
              const event = JSON.parse(jsonStr) as JsonRecord;
              const eventType = event.type as string;

              if (eventType === 'message_start') {
                const msg = event.message as JsonRecord | undefined;
                modelUsed = (msg?.model as string) || model;
                const usage = msg?.usage as JsonRecord | undefined;
                tokensIn = (usage?.input_tokens as number) || 0;
              } else if (eventType === 'content_block_start') {
                // Track tool_use content blocks
                const contentBlock = event.content_block as JsonRecord | undefined;
                if (contentBlock?.type === 'tool_use') {
                  pendingToolCalls.push({
                    id: contentBlock.id as string,
                    name: contentBlock.name as string,
                    input: {},
                  });
                  currentToolInputJson = '';
                }
              } else if (eventType === 'content_block_delta') {
                const delta = event.delta as JsonRecord | undefined;
                const deltaType = delta?.type as string | undefined;
                if (deltaType === 'input_json_delta') {
                  // Accumulate tool input JSON fragments
                  currentToolInputJson += (delta?.partial_json as string) || '';
                } else {
                  const text = (delta?.text as string) || '';
                  if (text) {
                    fullContent += text;
                    // Forward to client
                    const clientEvent = {
                      type: 'content_block_delta',
                      delta: { text },
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(clientEvent)}\n\n`));
                  }
                }
              } else if (eventType === 'content_block_stop') {
                // Finalize tool input when block ends
                if (pendingToolCalls.length > 0 && currentToolInputJson) {
                  const lastTool = pendingToolCalls[pendingToolCalls.length - 1];
                  try {
                    lastTool.input = JSON.parse(currentToolInputJson);
                  } catch {
                    lastTool.input = { raw: currentToolInputJson };
                  }
                  currentToolInputJson = '';
                }
              } else if (eventType === 'message_delta') {
                const usage = (event as JsonRecord).usage as JsonRecord | undefined;
                tokensOut = (usage?.output_tokens as number) || 0;
              }
              // Skip ping events
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // If Claude responded with tool_use blocks, send them as pending_tool_calls for client execution
        if (pendingToolCalls.length > 0) {
          // Separate server-side tools from client-side tools
          const serverTools = pendingToolCalls.filter((t) => SERVER_TOOL_NAMES.has(String(t.name || '')));
          const clientPendingTools = pendingToolCalls.filter((t) => !SERVER_TOOL_NAMES.has(String(t.name || '')));

          // Execute server-side tools post-hoc (streaming mode)
          for (const toolCall of serverTools) {
            try {
              const toolName = String(toolCall.name || '');
              const rawInput = (toolCall.input || {}) as JsonRecord;
              let output: JsonRecord;

              if (toolName === 'web_search') {
                const parsed = WebSearchArgsSchema.safeParse(rawInput);
                output = parsed.success
                  ? await webSearchTool(parsed.data)
                  : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
              } else if (toolName === 'search_caps_curriculum' || toolName === 'caps_curriculum_query') {
                const parsed = CAPSCurriculumArgsSchema.safeParse(rawInput);
                output = parsed.success
                  ? await searchCapsCurriculumTool(supabase, parsed.data)
                  : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
              } else if (toolName === 'get_caps_documents') {
                const parsed = GetCapsDocumentsArgsSchema.safeParse(rawInput);
                output = parsed.success
                  ? await getCapsDocumentsTool(supabase, parsed.data)
                  : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
              } else if (toolName === 'get_caps_subjects') {
                const parsed = GetCapsSubjectsArgsSchema.safeParse(rawInput);
                output = parsed.success
                  ? await getCapsSubjectsTool(supabase, parsed.data)
                  : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
              } else {
                output = { success: false, error: 'tool_not_supported', tool: toolName };
              }

              // Keep tool execution server-side only; never stream raw JSON results
              // into the visible assistant message.
              console.log('[ai-proxy] server_tool_executed', {
                tool: toolName,
                success: Boolean((output as JsonRecord)?.success),
              });
              const summary = summarizeServerToolResult(toolName, output);
              if (summary) {
                fullContent += summary;
                const summaryEvent = { type: 'content_block_delta', delta: { text: summary } };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(summaryEvent)}\n\n`));
              } else if (toolName === 'web_search') {
                const fallback = '\n\nI tried to search the web but couldn\'t find results right now. Let me answer based on what I know.';
                fullContent += fallback;
                const fallbackEvent = { type: 'content_block_delta', delta: { text: fallback } };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(fallbackEvent)}\n\n`));
              }
            } catch {
              // Tool execution failed, continue
            }
          }

          // Send client-side pending tool calls
          if (clientPendingTools.length > 0) {
            const toolCallsEvent = { type: 'pending_tool_calls', tool_calls: clientPendingTools };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolCallsEvent)}\n\n`));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        resolveMetaPromise!({
          content: fullContent,
          model: modelUsed,
          usage: { tokens_in: tokensIn, tokens_out: tokensOut },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        try {
          const userMessage = 'Sorry, something went wrong while processing your request. Please try again.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: userMessage } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch { /* controller already closed */ }
        rejectMetaPromise!(err instanceof Error ? err : new Error(errMsg));
      }
    },
  });

  return { stream, meta: metaPromise };
}

/**
 * Call OpenAI with native SSE streaming.
 * Streams token deltas to the client in the same content_block_delta format
 * consumed by the app streaming parser.
 */
function callOpenAIStreaming(
  messages: Array<JsonRecord>,
  requestedModel: string | null | undefined,
  requestMetadata: Record<string, unknown>,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): { stream: ReadableStream<Uint8Array>; meta: Promise<ProviderResponse> } {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const allowed = parseAllowedModels('OPENAI_ALLOWED_MODELS', DEFAULT_OPENAI_ALLOWED_MODELS);
  const fallbackModel = DEFAULT_OPENAI_ALLOWED_MODELS[0];
  const selection = pickAllowedModel(requestedModel || Deno.env.get('OPENAI_MODEL'), allowed, fallbackModel);
  if (selection.usedFallback) console.warn('[ai-proxy] OpenAI streaming model fallback:', selection.reason);
  const model = selection.model;

  const encoder = new TextEncoder();
  let fullContent = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let modelUsed = model;
  let resolveMetaPromise: (v: ProviderResponse) => void;
  let rejectMetaPromise: (e: Error) => void;
  const metaPromise = new Promise<ProviderResponse>((res, rej) => {
    resolveMetaPromise = res;
    rejectMetaPromise = rej;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const requestBody: JsonRecord = {
          model,
          messages: normalizeOpenAIMessages(messages),
          temperature: resolveTemperature(requestMetadata),
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        };

        const callOpenAIStream = async () => {
          return await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
          });
        };

        let response = await callOpenAIStream();
        if (!response.ok && RETRYABLE_PROVIDER_STATUSES.has(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          response = await callOpenAIStream();
        }

        if (!response.ok || !response.body) {
          const errText = await response.text();
          const userMessage = response.status === 529
            ? 'The AI service is temporarily overloaded. Please try again in a moment.'
            : response.status === 401 || response.status === 403
              ? 'AI service authentication error. Please contact support.'
              : `Sorry, the AI service returned an error (${response.status}). Please try again.`;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errText })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: userMessage } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          rejectMetaPromise!(new Error(`OpenAI streaming error: ${response.status} ${errText}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sawDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (!trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            if (!dataStr) continue;
            if (dataStr === '[DONE]') {
              sawDone = true;
              continue;
            }

            try {
              const event = JSON.parse(dataStr) as JsonRecord;
              const eventModel = event.model;
              if (typeof eventModel === 'string' && eventModel.length > 0) {
                modelUsed = eventModel;
              }

              const usage = event.usage as JsonRecord | undefined;
              if (usage) {
                const promptTokens = usage.prompt_tokens;
                const completionTokens = usage.completion_tokens;
                if (typeof promptTokens === 'number') tokensIn = promptTokens;
                if (typeof completionTokens === 'number') tokensOut = completionTokens;
              }

              const choices = Array.isArray(event.choices) ? event.choices : [];
              const firstChoice = choices[0] as JsonRecord | undefined;
              const delta = firstChoice?.delta as JsonRecord | undefined;
              const text = typeof delta?.content === 'string' ? delta.content : '';
              if (!text) continue;

              fullContent += text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text } })}\n\n`)
              );
            } catch {
              // Skip malformed SSE lines.
            }
          }
        }

        if (!sawDone && buffer.trim().startsWith('data:')) {
          const finalData = buffer.trim().slice(5).trim();
          if (finalData && finalData !== '[DONE]') {
            try {
              const event = JSON.parse(finalData) as JsonRecord;
              const choices = Array.isArray(event.choices) ? event.choices : [];
              const firstChoice = choices[0] as JsonRecord | undefined;
              const delta = firstChoice?.delta as JsonRecord | undefined;
              const text = typeof delta?.content === 'string' ? delta.content : '';
              if (text) {
                fullContent += text;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text } })}\n\n`)
                );
              }
            } catch {
              // Ignore malformed trailing chunk.
            }
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        resolveMetaPromise!({
          content: fullContent,
          model: modelUsed,
          usage: { tokens_in: tokensIn, tokens_out: tokensOut },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        try {
          const userMessage = 'Sorry, something went wrong while processing your request. Please try again.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: userMessage } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          // controller already closed
        }
        rejectMetaPromise!(err instanceof Error ? err : new Error(errMsg));
      }
    },
  });

  return { stream, meta: metaPromise };
}

async function callOpenAI(
  supabase: any,
  messages: Array<JsonRecord>,
  enableTools: boolean,
  requestedModel?: string | null,
  requestMetadata: Record<string, unknown> = {},
  maxTokens: number = DEFAULT_MAX_TOKENS,
  clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
): Promise<ProviderResponse> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  const allowed = parseAllowedModels('OPENAI_ALLOWED_MODELS', DEFAULT_OPENAI_ALLOWED_MODELS);
  const fallbackModel = DEFAULT_OPENAI_ALLOWED_MODELS[0];
  const selection = pickAllowedModel(requestedModel || Deno.env.get('OPENAI_MODEL'), allowed, fallbackModel);
  if (selection.usedFallback) {
    console.warn('[ai-proxy] OpenAI model fallback:', selection.reason);
  }
  const model = selection.model;
  const tools = buildOpenAITools(enableTools, clientTools);

  const body: JsonRecord = {
    model,
    messages: normalizeOpenAIMessages(messages),
    temperature: resolveTemperature(requestMetadata),
    max_tokens: maxTokens,
  };

  if (tools) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  let response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (RETRYABLE_PROVIDER_STATUSES.has(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const retryText = await response.text();
        throw new Error(`OpenAI error: ${response.status} ${retryText}`);
      }
    } else {
      throw new Error(`OpenAI error: ${response.status} ${errText}`);
    }
  }

  const result = (await response.json()) as JsonRecord;
  const choice = (result.choices as Array<JsonRecord> | undefined)?.[0];
  const message = choice?.message as JsonRecord | undefined;
  const content = typeof message?.content === 'string' ? message.content : '';

  const toolCalls = Array.isArray(message?.tool_calls) ? message?.tool_calls : [];
  const toolResults: ToolResult[] = [];

  if (enableTools && toolCalls.length > 0) {
    let executedServerTool = false;
    const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for (const call of toolCalls) {
      const toolCall = call as JsonRecord;
      const functionCall = toolCall.function as JsonRecord | undefined;
      const toolName = typeof functionCall?.name === 'string' ? functionCall.name : '';
      if (!toolName) continue;

      let parsedArgs: JsonRecord = {};
      if (typeof functionCall.arguments === 'string') {
        try {
          parsedArgs = JSON.parse(functionCall.arguments) as JsonRecord;
        } catch {
          parsedArgs = {};
        }
      } else if (functionCall.arguments && typeof functionCall.arguments === 'object') {
        parsedArgs = functionCall.arguments as JsonRecord;
      }

      const args = parsedArgs;
      const toolCallId = String(toolCall.id || '');

      if (!SERVER_TOOL_NAMES.has(toolName)) {
        pendingToolCalls.push({
          id: toolCallId,
          name: toolName,
          input: args as Record<string, unknown>,
        });
        continue;
      }

      executedServerTool = true;

      if (toolName === 'web_search') {
        const parsed = WebSearchArgsSchema.safeParse(args);
        const output = parsed.success
          ? await webSearchTool(parsed.data)
          : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        toolResults.push({ name: 'web_search', input: parsed.success ? parsed.data : args, output, success: parsed.success });
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(output) });
        continue;
      }

      if (toolName === 'search_caps_curriculum' || toolName === 'caps_curriculum_query') {
        const parsed = CAPSCurriculumArgsSchema.safeParse(args);
        const output = parsed.success
          ? await searchCapsCurriculumTool(supabase, parsed.data)
          : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        toolResults.push({ name: toolName, input: parsed.success ? parsed.data : args, output, success: parsed.success });
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(output) });
        continue;
      }

      if (toolName === 'get_caps_documents') {
        const parsed = GetCapsDocumentsArgsSchema.safeParse(args);
        const output = parsed.success
          ? await getCapsDocumentsTool(supabase, parsed.data)
          : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        toolResults.push({ name: toolName, input: parsed.success ? parsed.data : args, output, success: parsed.success });
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(output) });
        continue;
      }

      if (toolName === 'get_caps_subjects') {
        const parsed = GetCapsSubjectsArgsSchema.safeParse(args);
        const output = parsed.success
          ? await getCapsSubjectsTool(supabase, parsed.data)
          : { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        toolResults.push({ name: toolName, input: parsed.success ? parsed.data : args, output, success: parsed.success });
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(output) });
        continue;
      }
    }

    if (executedServerTool) {
      const followUpBody: JsonRecord = {
        model,
        messages: normalizeOpenAIMessages(messages),
        temperature: resolveTemperature(requestMetadata),
        max_tokens: maxTokens,
      };

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(followUpBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI tool follow-up error: ${response.status} ${errText}`);
      }

      const followUpResult = (await response.json()) as JsonRecord;
      const followUpChoice = (followUpResult.choices as Array<JsonRecord> | undefined)?.[0];
      const followUpMessage = followUpChoice?.message as JsonRecord | undefined;
      const followUpContent = typeof followUpMessage?.content === 'string' ? followUpMessage.content : '';

      return {
        content: followUpContent,
        usage: {
          tokens_in: typeof followUpResult.usage === 'object' && followUpResult.usage
            ? (followUpResult.usage as JsonRecord).prompt_tokens as number | undefined
            : undefined,
          tokens_out: typeof followUpResult.usage === 'object' && followUpResult.usage
            ? (followUpResult.usage as JsonRecord).completion_tokens as number | undefined
            : undefined,
        },
        model,
        tool_results: toolResults,
        pending_tool_calls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
      };
    }

    if (pendingToolCalls.length > 0) {
      return {
        content,
        usage: {
          tokens_in: typeof result.usage === 'object' && result.usage
            ? (result.usage as JsonRecord).prompt_tokens as number | undefined
            : undefined,
          tokens_out: typeof result.usage === 'object' && result.usage
            ? (result.usage as JsonRecord).completion_tokens as number | undefined
            : undefined,
        },
        model,
        tool_results: toolResults,
        pending_tool_calls: pendingToolCalls,
      };
    }
  }

  return {
    content,
    usage: {
      tokens_in: typeof result.usage === 'object' && result.usage
        ? (result.usage as JsonRecord).prompt_tokens as number | undefined
        : undefined,
      tokens_out: typeof result.usage === 'object' && result.usage
        ? (result.usage as JsonRecord).completion_tokens as number | undefined
        : undefined,
    },
    model,
    tool_results: toolResults,
  };
}

async function callAnthropic(
  supabase: any,
  messages: Array<JsonRecord>,
  enableTools: boolean,
  requestedModel?: string | null,
  allowedOverride?: string[],
  requestMetadata: Record<string, unknown> = {},
  maxTokens: number = DEFAULT_MAX_TOKENS,
  clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
): Promise<ProviderResponse> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }
  const allowed = normalizeAnthropicAllowedModels(
    allowedOverride || parseAllowedModels('ANTHROPIC_ALLOWED_MODELS', DEFAULT_ANTHROPIC_ALLOWED_MODELS)
  );
  const fallbackModel = normalizeRequestedModel(DEFAULT_ANTHROPIC_ALLOWED_MODELS[0]) || DEFAULT_ANTHROPIC_ALLOWED_MODELS[0];
  const normalizedRequestedModel = normalizeRequestedModel(requestedModel || Deno.env.get('ANTHROPIC_MODEL'));
  const selection = pickAllowedModel(normalizedRequestedModel, allowed, fallbackModel);
  if (selection.usedFallback) {
    console.warn('[ai-proxy] Anthropic model fallback:', selection.reason);
  }
  const preferredModel = selection.model;
  const tools = buildAnthropicTools(enableTools, clientTools);
  const systemPrompt = messages.find((m) => m.role === 'system')?.content || DEFAULT_SYSTEM_PROMPT;
  const providerMessages = buildProviderConversationMessages(messages);
  if (!hasActionableUserMessages(providerMessages)) {
    throw new Error('invalid_request_no_user_message: Please send a question or attach a file before asking Dash.');
  }

  const callAnthropicOnce = async (model: string) => {
    const body: JsonRecord = {
      model,
      max_tokens: maxTokens,
      temperature: resolveTemperature(requestMetadata),
      messages: providerMessages,
      system: systemPrompt,
    };

    if (tools) body.tools = tools;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, status: response.status, errText, data: null as JsonRecord | null };
    }

    const data = (await response.json()) as JsonRecord;
    return { ok: true, status: response.status, errText: null as string | null, data };
  };

  const isModelNotFound = (errText: string | null): boolean => {
    if (!errText) return false;
    try {
      const parsed = JSON.parse(errText) as JsonRecord;
      const errType = (parsed?.error as JsonRecord | undefined)?.type;
      return errType === 'not_found_error';
    } catch {
      return false;
    }
  };

  const callAnthropicWithFallbacks = async (models: string[]) => {
    let lastError: { ok: false; status: number; errText: string | null; data: JsonRecord | null } | null = null;
    for (const model of models) {
      let res = await callAnthropicOnce(model);
      if (!res.ok && RETRYABLE_PROVIDER_STATUSES.has(res.status)) {
        // Brief retry for transient errors
        await new Promise((resolve) => setTimeout(resolve, 500));
        res = await callAnthropicOnce(model);
      }
      if (res.ok) {
        return { response: res, model };
      }
      if (isModelNotFound(res.errText)) {
        console.warn(`[ai-proxy] Anthropic model not found: ${model}. Trying next...`);
        lastError = res;
        continue;
      }
      if (RETRYABLE_PROVIDER_STATUSES.has(res.status)) {
        lastError = res;
        continue;
      }
      return { response: res, model };
    }
    return { response: lastError as any, model: models[0] };
  };

  const candidates = [preferredModel, ...allowed.filter((m) => m !== preferredModel)];
  const initial = await callAnthropicWithFallbacks(candidates);
  let response = initial.response;
  let modelUsed = initial.model;

  if (!response.ok || !response.data) {
    throw new Error(`Anthropic error: ${response.status} ${response.errText || ''}`);
  }

  const result = response.data as JsonRecord;
  const contentBlocks = Array.isArray(result.content) ? result.content : [];
  const toolResults: ToolResult[] = [];

  let contentText = '';
  const toolUses: Array<JsonRecord> = [];

  for (const block of contentBlocks) {
    const entry = block as JsonRecord;
    if (entry.type === 'text' && typeof entry.text === 'string') {
      contentText += entry.text;
    }
    if (entry.type === 'tool_use') {
      toolUses.push(entry);
    }
  }

  if (enableTools && toolUses.length > 0) {
    // Separate server-side tools from client-side tools.
    // Server tools are executed here; everything else becomes pending_tool_calls.
    const serverToolUses = toolUses.filter((tu) => SERVER_TOOL_NAMES.has(String(tu.name || '')));
    const clientToolUses = toolUses.filter((tu) => !SERVER_TOOL_NAMES.has(String(tu.name || '')));

    for (const toolUse of serverToolUses) {
      const toolName = String(toolUse.name || '');
      const rawInput = (toolUse.input || {}) as JsonRecord;

      let success = true;
      let inputForLog: JsonRecord = rawInput;
      let output: JsonRecord;

      if (toolName === 'web_search') {
        const parsed = WebSearchArgsSchema.safeParse(rawInput);
        if (parsed.success) {
          inputForLog = parsed.data;
          output = await webSearchTool(parsed.data);
        } else {
          success = false;
          output = { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        }
      } else if (toolName === 'search_caps_curriculum' || toolName === 'caps_curriculum_query') {
        const parsed = CAPSCurriculumArgsSchema.safeParse(rawInput);
        if (parsed.success) {
          inputForLog = parsed.data as any;
          output = await searchCapsCurriculumTool(supabase, parsed.data);
        } else {
          success = false;
          output = { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        }
      } else if (toolName === 'get_caps_documents') {
        const parsed = GetCapsDocumentsArgsSchema.safeParse(rawInput);
        if (parsed.success) {
          inputForLog = parsed.data as any;
          output = await getCapsDocumentsTool(supabase, parsed.data);
        } else {
          success = false;
          output = { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        }
      } else if (toolName === 'get_caps_subjects') {
        const parsed = GetCapsSubjectsArgsSchema.safeParse(rawInput);
        if (parsed.success) {
          inputForLog = parsed.data as any;
          output = await getCapsSubjectsTool(supabase, parsed.data);
        } else {
          success = false;
          output = { success: false, error: 'invalid_tool_args', details: parsed.error?.message || 'Invalid args' };
        }
      } else {
        success = false;
        output = { success: false, error: 'tool_not_supported', tool: toolName };
      }

      toolResults.push({ name: toolName, input: inputForLog, output, success });

      messages.push({
        role: 'assistant',
        content: [
          { type: 'tool_use', id: toolUse.id, name: toolName, input: inputForLog },
        ],
      });

      messages.push({
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(output) },
        ],
      });
    }

    if (toolResults.length > 0) {
      const followUpCandidates = [modelUsed, ...allowed.filter((m) => m !== modelUsed)];
      const followUpResult = await callAnthropicWithFallbacks(followUpCandidates);
      const followUpResponse = followUpResult.response;
      const followUpModel = followUpResult.model;

      if (!followUpResponse.ok || !followUpResponse.data) {
        throw new Error(`Anthropic tool follow-up error: ${followUpResponse.status} ${followUpResponse.errText || ''}`);
      }

      const followUpData = followUpResponse.data as JsonRecord;
      const followUpBlocks = Array.isArray(followUpData.content) ? followUpData.content : [];
      let followUpText = '';
      for (const block of followUpBlocks) {
        const entry = block as JsonRecord;
        if (entry.type === 'text' && typeof entry.text === 'string') {
          followUpText += entry.text;
        }
      }

      const pendingCalls = clientToolUses.length > 0
        ? clientToolUses.map((tu) => ({
            id: tu.id as string,
            name: tu.name as string,
            input: (tu.input || {}) as Record<string, unknown>,
          }))
        : undefined;

      return {
        content: followUpText,
        usage: {
          tokens_in: typeof followUpData.usage === 'object' && followUpData.usage
            ? (followUpData.usage as JsonRecord).input_tokens as number | undefined
            : undefined,
          tokens_out: typeof followUpData.usage === 'object' && followUpData.usage
            ? (followUpData.usage as JsonRecord).output_tokens as number | undefined
            : undefined,
        },
        model: followUpModel,
        tool_results: toolResults,
        pending_tool_calls: pendingCalls,
      };
    }

    // If there are client-side tool calls that we can't execute server-side,
    // return them as pending_tool_calls for the client to handle
    if (clientToolUses.length > 0) {
      const pendingCalls = clientToolUses.map(tu => ({
        id: tu.id as string,
        name: tu.name as string,
        input: (tu.input || {}) as Record<string, unknown>,
      }));
      return {
        content: contentText,
        usage: {
          tokens_in: typeof result.usage === 'object' && result.usage
            ? (result.usage as JsonRecord).input_tokens as number | undefined
            : undefined,
          tokens_out: typeof result.usage === 'object' && result.usage
            ? (result.usage as JsonRecord).output_tokens as number | undefined
            : undefined,
        },
        model: modelUsed,
        tool_results: toolResults,
        pending_tool_calls: pendingCalls,
      };
    }
  }

  return {
    content: contentText,
    usage: {
      tokens_in: typeof result.usage === 'object' && result.usage
        ? (result.usage as JsonRecord).input_tokens as number | undefined
        : undefined,
      tokens_out: typeof result.usage === 'object' && result.usage
        ? (result.usage as JsonRecord).output_tokens as number | undefined
        : undefined,
    },
    model: modelUsed,
    tool_results: toolResults,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  try {
    if (req.method === 'OPTIONS') {
      return handleCorsOptions(req);
    }
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({
        error: 'invalid_json',
        message: 'Invalid JSON body',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      const hasPayloadImages = body && typeof body === 'object' && Array.isArray((body as any).payload?.images) && (body as any).payload.images.length > 0;
      const message = hasPayloadImages
        ? 'Invalid request payload. If you attached files, try a smaller image or a supported format (e.g. JPEG, PNG).'
        : 'Invalid request payload';
      return new Response(JSON.stringify({ error: 'invalid_request', message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = parsed.data;
    const accessToken = extractBearerToken(req.headers.get('Authorization'));
    if (!accessToken) {
      return new Response(JSON.stringify({
        error: 'unauthorized',
        message: 'Missing bearer token. Please sign in again and retry.',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenRole = inferJwtRole(accessToken);
    if (tokenRole === 'service_role' || tokenRole === 'anon') {
      return new Response(JSON.stringify({
        error: 'invalid_auth_token',
        message: 'API keys cannot be used as user bearer tokens for ai-proxy.',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('EXPO_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY') || getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({
        error: 'config_missing',
        message: 'Supabase environment variables are missing (SUPABASE_URL / SUPABASE_ANON_KEY).',
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({
        error: 'unauthorized',
        message: 'Invalid or expired session. Please sign in again.',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, organization_id, preschool_id')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Organization membership required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if dev mode is enabled to bypass quota checks
    // SECURITY: Never allow bypass in production (ENVIRONMENT or VERCEL_ENV)
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const vercelEnv = Deno.env.get('VERCEL_ENV') || '';
    const isProduction = environment === 'production' || vercelEnv === 'production';
    const devModeBypass = !isProduction &&
      Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
      (environment === 'development' || environment === 'local');
    
    if (devModeBypass) {
      console.warn('[ai-proxy] ⚠️ QUOTA BYPASS ACTIVE - Development mode only');
    }
    
    let quotaDataForRequest: JsonRecord | null = null;
    if (!devModeBypass) {
      const quota = await supabase.rpc('check_ai_usage_limit', {
        p_user_id: userData.user.id,
        p_request_type: normalizeServiceType(payload.service_type),
      });

      if (quota.error) {
        console.error('[ai-proxy] check_ai_usage_limit failed, blocking request:', quota.error);
        return new Response(JSON.stringify({
          error: 'quota_check_failed',
          message: 'AI service is temporarily unavailable. Please try again in a few minutes.',
          trace_id: crypto.randomUUID(),
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const quotaData = quota.data as JsonRecord | null;
        quotaDataForRequest = quotaData;
        if (quotaData && typeof quotaData.allowed === 'boolean' && !quotaData.allowed) {
          return new Response(JSON.stringify({
            error: 'quota_exceeded',
            error_code: 'quota_exceeded',
            message: 'AI usage quota exceeded for this billing period',
            details: quotaData,
            retryable: false,
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } else {
      console.log('[ai-proxy] Dev mode: quota check bypassed (env:', environment, ')');
    }

    const wantsStream = payload.stream === true;
    const normalizedServiceType = normalizeServiceType(payload.service_type);
    const requestedOCRMode = payload.payload.ocr_mode === true || normalizedServiceType === 'image_analysis';
    const ocrTask = payload.payload.ocr_task || 'document';
    const ocrResponseFormat = payload.payload.ocr_response_format || 'text';
    const requestMetadata = (payload.metadata || {}) as Record<string, unknown>;
    const dashPlanModeEnabled = getBooleanFlag('DASH_PLAN_MODE_V1', true);
    const dashSuggestedActionsEnabled = getBooleanFlag('DASH_SUGGESTED_ACTIONS_V1', true);
    const phonicsMode = detectPhonicsMode(payload.payload, requestMetadata);
    const criteriaResponseMode = shouldUseCriteriaResponseMode(payload.payload, requestMetadata);

    const contextParts = [
      payload.payload.context,
      phonicsMode ? SHARED_PHONICS_PROMPT_BLOCK : null,
      requestedOCRMode ? getOCRPrompt(ocrTask) : null,
      criteriaResponseMode ? CRITERIA_RESPONSE_PROMPT : null,
    ].filter(Boolean);
    const mergedContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

    const systemPrompt = buildSystemPrompt(mergedContext, normalizedServiceType, requestMetadata);
    const rawMessages = normalizeMessages(payload.payload, systemPrompt);
    if (!hasActionableUserMessages(rawMessages)) {
      return new Response(JSON.stringify({
        error: 'invalid_request',
        message: 'Please send a question or attach a file before asking Dash.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Redact PII before sending to AI providers
    const redactedMessages = redactMessagesForProvider(rawMessages);
    const providerConversationMessages = buildProviderConversationMessages(redactedMessages);
    if (!hasActionableUserMessages(providerConversationMessages)) {
      return new Response(JSON.stringify({
        error: 'invalid_request',
        message: 'Please send a question or attach a file before asking Dash.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const redactedSystemPrompt = redactedMessages.find((msg) => msg.role === 'system')?.content || systemPrompt;
    const messages = [
      { role: 'system', content: redactedSystemPrompt },
      ...providerConversationMessages,
    ];
    const serviceType = normalizedServiceType;
    const maxTokens = getMaxTokensForService(requestedOCRMode ? 'image_analysis' : serviceType);

    const normalizedRequestedModel = normalizeRequestedModel(
      typeof payload.payload.model === 'string' ? payload.payload.model : null
    );
    const preferOpenAI = payload.prefer_openai ?? false;
    const enableTools = payload.enable_tools ?? false;
    const hasOpenAI = !!getOpenAIApiKey();
    const hasAnthropic = !!getAnthropicApiKey();
    const hasImagen = isImagenConfigured();

    if (serviceType !== 'image_generation' && !hasOpenAI && !hasAnthropic) {
      return new Response(JSON.stringify({
        error: 'provider_not_configured',
        message: 'No AI provider keys are configured (OPENAI_API_KEY / ANTHROPIC_API_KEY).',
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileRole = String(profile.role || '').toLowerCase();
    const isSuperAdmin = profileRole === 'superadmin' || profileRole === 'super_admin';
    const superAdminAllowed = normalizeAnthropicAllowedModels(
      parseAllowedModels('SUPERADMIN_ANTHROPIC_MODELS', DEFAULT_SUPERADMIN_ALLOWED_MODELS)
    );
    const openaiAllowed = parseAllowedModels('OPENAI_ALLOWED_MODELS', DEFAULT_OPENAI_ALLOWED_MODELS);
    const anthropicAllowed = normalizeAnthropicAllowedModels(
      parseAllowedModels('ANTHROPIC_ALLOWED_MODELS', DEFAULT_ANTHROPIC_ALLOWED_MODELS)
    );
    let requestedModel = normalizedRequestedModel;
    if (!requestedModel && quotaDataForRequest?.current_tier != null && serviceType !== 'image_generation') {
      requestedModel = getDefaultModelIdForTierProxy(normalizeTierName(quotaDataForRequest.current_tier));
    }
    const requestedIsOpenAI = requestedModel ? openaiAllowed.includes(requestedModel) : false;
    const requestedIsAnthropic = requestedModel ? anthropicAllowed.includes(requestedModel) : false;
    const shouldPreferOpenAI = requestedIsOpenAI ? true : requestedIsAnthropic ? false : preferOpenAI;

    if (serviceType === 'image_generation') {
      const prompt = payload.payload.prompt?.trim();
      if (!prompt) {
        return new Response(JSON.stringify({
          error: 'invalid_prompt',
          message: 'Prompt is required for image generation',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!hasOpenAI && !hasImagen) {
        return new Response(JSON.stringify({
          error: 'provider_not_configured',
          message: 'No image provider is configured (OPENAI_API_KEY or Imagen credentials).',
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tierName = normalizeTierName(quotaDataForRequest?.current_tier);
      const imageOptions = coerceImageOptionsForTier(payload.payload.image_options, tierName);
      const imageFallbackEnabled = isImageFallbackEnabled();
      const hasImagenForRequest = hasImagen && imageFallbackEnabled;
      const providerChain = buildImageProviderChain({
        options: imageOptions,
        hasOpenAI,
        hasImagen: hasImagenForRequest,
        fallbackEnabled: imageFallbackEnabled,
      });

      if (providerChain.length === 0) {
        return new Response(JSON.stringify({
          error: 'provider_not_configured',
          message: 'No usable image provider is configured for this request.',
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let providerResponse: ProviderResponse | null = null;
      let providerUsed: ImageProvider | null = null;
      let fallbackUsed = false;
      let fallbackReason: string | undefined;
      let terminalError: ImageProviderError | null = null;
      const requestedLower = String(requestedModel || '').toLowerCase();
      const openAIRequestedModel = requestedLower.includes('gpt') ? requestedModel : null;
      const imagenRequestedModel = requestedLower.includes('imagen') ? requestedModel : null;

      for (let i = 0; i < providerChain.length; i += 1) {
        const provider = providerChain[i];
        try {
          providerResponse = provider === 'openai'
            ? await callOpenAIImageGeneration({
              supabase,
              userId: userData.user.id,
              prompt,
              options: imageOptions,
              requestedModel: provider === 'openai' ? openAIRequestedModel : null,
            })
            : await callImagenImageGeneration({
              supabase,
              userId: userData.user.id,
              prompt,
              options: imageOptions,
              requestedModel: provider === 'google' ? imagenRequestedModel : null,
            });
          providerUsed = provider;
          break;
        } catch (error) {
          const normalizedError = normalizeImageProviderError(error, provider);
          terminalError = normalizedError;
          const hasAnotherProvider = i < providerChain.length - 1;
          const shouldFallback = hasAnotherProvider && normalizedError.retryable;
          if (shouldFallback) {
            fallbackUsed = true;
            fallbackReason = `${provider}:${normalizedError.code}`;
            console.warn('[ai-proxy] Image provider failed, trying fallback:', {
              provider,
              code: normalizedError.code,
              status: normalizedError.status,
            });
            continue;
          }

          const status = normalizedError.code === 'content_policy_violation'
            ? 400
            : normalizedError.status && normalizedError.status >= 400 && normalizedError.status < 600
              ? normalizedError.status
              : 502;
          return new Response(JSON.stringify({
            error: normalizedError.code,
            message: normalizedError.message,
            details: {
              provider: normalizedError.provider,
              fallback_used: fallbackUsed,
              fallback_reason: fallbackReason || null,
              tier: tierName,
            },
          }), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      if (!providerResponse || !providerUsed) {
        const last = terminalError || createImageProviderError({
          provider: 'openai',
          code: 'provider_error',
          message: 'No image provider produced a response.',
          retryable: false,
        });
        return new Response(JSON.stringify({
          error: last.code,
          message: last.message,
          details: {
            provider: last.provider,
            fallback_used: fallbackUsed,
            fallback_reason: fallbackReason || null,
          },
        }), {
          status: last.status && last.status >= 400 ? last.status : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const generatedImages = providerResponse.generated_images || [];
      const estimatedCostUsd = estimateImageCostUsd({
        provider: providerUsed,
        size: imageOptions.size,
        quality: imageOptions.quality,
        imageCount: generatedImages.length,
        model: providerResponse.model,
      });

      try {
        const usageResult = await supabase.rpc('record_ai_usage', {
          p_user_id: userData.user.id,
          p_feature_used: 'image_generation',
          p_model_used: providerResponse.model || (providerUsed === 'openai' ? 'gpt-image-1' : 'imagen'),
          p_tokens_used: 0,
          p_request_tokens: 0,
          p_response_tokens: 0,
          p_success: true,
          p_metadata: {
            scope: payload.scope,
            organization_id: profile.organization_id || profile.preschool_id || null,
            provider_used: providerUsed,
            fallback_used: fallbackUsed,
            fallback_reason: fallbackReason || null,
            fallback_feature_enabled: imageFallbackEnabled,
            estimated_cost_usd: estimatedCostUsd,
            size: imageOptions.size,
            quality: imageOptions.quality,
            generated_images: generatedImages.map((img) => ({
              id: img.id,
              bucket: img.bucket,
              path: img.path,
              provider: img.provider,
            })),
            request_metadata: payload.metadata || {},
            request_image_options: imageOptions,
            provider_chain: providerChain,
            current_tier: tierName,
          },
        });
        if (usageResult.error) {
          console.warn('[ai-proxy] record_ai_usage returned error (non-fatal):', usageResult.error);
        }
      } catch (usageError) {
        console.warn('[ai-proxy] record_ai_usage failed (non-fatal):', usageError);
      }

      return new Response(JSON.stringify({
        success: true,
        content: providerResponse.content,
        usage: providerResponse.usage,
        model: providerResponse.model,
        generated_images: generatedImages,
        provider: providerUsed,
        fallback_used: fallbackUsed,
        fallback_reason: fallbackReason,
        tool_results: [],
        pending_tool_calls: [],
        resolution_status: 'resolved',
        confidence_score: 0.95,
        escalation_offer: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── TRUE STREAMING (Anthropic + OpenAI) ──────────────
    // Anthropic supports tools in-stream; OpenAI true-stream path below is text-only.
    const canAnthropicTrueStream = wantsStream && hasAnthropic && !shouldPreferOpenAI;
    if (canAnthropicTrueStream) {
      try {
        const allowedOverride = isSuperAdmin ? superAdminAllowed : undefined;
        const clientToolDefs = enableTools && payload.client_tools?.length > 0
          ? payload.client_tools as Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
          : undefined;
        const { stream, meta } = callAnthropicStreaming(
          supabase,
          messages,
          requestedModel,
          allowedOverride,
          isSuperAdmin,
          requestMetadata,
          maxTokens,
          enableTools,
          clientToolDefs,
        );

        // Fire-and-forget: log usage after stream completes
        meta.then(async (providerResponse) => {
          try {
            await supabase.rpc('record_ai_usage', {
              p_user_id: userData.user.id,
              p_feature_used: normalizeServiceType(payload.service_type),
              p_model_used: providerResponse.model || 'anthropic',
              p_tokens_used: (providerResponse.usage?.tokens_in || 0) + (providerResponse.usage?.tokens_out || 0),
              p_request_tokens: providerResponse.usage?.tokens_in || 0,
              p_response_tokens: providerResponse.usage?.tokens_out || 0,
              p_success: true,
              p_metadata: {
                scope: payload.scope,
                organization_id: profile.organization_id || profile.preschool_id || null,
                streaming: true,
                request_metadata: payload.metadata || {},
              },
            });
          } catch (usageErr) {
            console.warn('[ai-proxy] Streaming usage recording failed (non-fatal):', usageErr);
          }
        }).catch((streamErr) => {
          console.warn('[ai-proxy] Streaming meta error (non-fatal):', streamErr);
        });

        return new Response(stream, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Transfer-Encoding': 'chunked',
          },
        });
      } catch (streamError) {
        console.warn('[ai-proxy] True streaming failed, falling back to post-hoc:', streamError);
        // Fall through to non-streaming path below
      }
    }

    // OpenAI streaming is enabled only for text-only requests (no server/client tools, no OCR JSON normalization).
    const canOpenAITrueStream = wantsStream
      && !canAnthropicTrueStream
      && hasOpenAI
      && !enableTools
      && !requestedOCRMode;
    if (canOpenAITrueStream) {
      try {
        const { stream, meta } = callOpenAIStreaming(
          messages,
          requestedModel,
          requestMetadata,
          maxTokens,
        );

        meta.then(async (providerResponse) => {
          try {
            await supabase.rpc('record_ai_usage', {
              p_user_id: userData.user.id,
              p_feature_used: normalizeServiceType(payload.service_type),
              p_model_used: providerResponse.model || 'openai',
              p_tokens_used: (providerResponse.usage?.tokens_in || 0) + (providerResponse.usage?.tokens_out || 0),
              p_request_tokens: providerResponse.usage?.tokens_in || 0,
              p_response_tokens: providerResponse.usage?.tokens_out || 0,
              p_success: true,
              p_metadata: {
                scope: payload.scope,
                organization_id: profile.organization_id || profile.preschool_id || null,
                streaming: true,
                request_metadata: payload.metadata || {},
              },
            });
          } catch (usageErr) {
            console.warn('[ai-proxy] OpenAI streaming usage recording failed (non-fatal):', usageErr);
          }
        }).catch((streamErr) => {
          console.warn('[ai-proxy] OpenAI streaming meta error (non-fatal):', streamErr);
        });

        return new Response(stream, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Transfer-Encoding': 'chunked',
          },
        });
      } catch (streamError) {
        console.warn('[ai-proxy] OpenAI true streaming failed, falling back to post-hoc:', streamError);
      }
    }

    const clientTools = payload.client_tools || undefined;

    let providerResponse: ProviderResponse;
    let primaryProvider: 'anthropic' | 'openai' = isSuperAdmin
      ? 'anthropic'
      : shouldPreferOpenAI
        ? 'openai'
        : 'anthropic';

    // Respect preference/model intent, but never pick a provider that is not configured.
    if (primaryProvider === 'anthropic' && !hasAnthropic && hasOpenAI) {
      primaryProvider = 'openai';
    } else if (primaryProvider === 'openai' && !hasOpenAI && hasAnthropic) {
      primaryProvider = 'anthropic';
    }

    if ((primaryProvider === 'anthropic' && !hasAnthropic) || (primaryProvider === 'openai' && !hasOpenAI)) {
      return new Response(JSON.stringify({
        error: 'provider_not_configured',
        message: primaryProvider === 'anthropic'
          ? 'ANTHROPIC_API_KEY missing and Anthropic not configured.'
          : 'OPENAI_API_KEY missing and OpenAI not configured.',
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callProvider = async (provider: 'anthropic' | 'openai'): Promise<ProviderResponse> => {
      if (provider === 'anthropic') {
        if (!hasAnthropic) throw new Error('ANTHROPIC_API_KEY missing and Anthropic not configured.');
        const model = isSuperAdmin
          ? pickAllowedModel(requestedModel, superAdminAllowed, superAdminAllowed[0]).model
          : requestedModel;
        const allowedOverride = isSuperAdmin ? superAdminAllowed : undefined;
        return await callAnthropic(
          supabase,
          messages,
          enableTools,
          model,
          allowedOverride,
          requestMetadata,
          maxTokens,
          clientTools,
        );
      }
      if (!hasOpenAI) throw new Error('OPENAI_API_KEY missing and OpenAI not configured.');
      return await callOpenAI(
        supabase,
        messages,
        enableTools,
        requestedModel,
        requestMetadata,
        maxTokens,
        clientTools,
      );
    };

    try {
      providerResponse = await callProvider(primaryProvider);
    } catch (providerError) {
      const providerMessage = providerError instanceof Error ? providerError.message : String(providerError);
      const providerStatus = mapProviderErrorStatus(providerMessage);
      // Try alternate provider when both are configured. This prevents hard
      // failures when one provider is temporarily quota/rate limited.
      if (hasOpenAI && hasAnthropic && shouldAttemptCrossProviderFallback(providerMessage)) {
        const fallbackProvider = primaryProvider === 'anthropic' ? 'openai' : 'anthropic';
        console.warn('[ai-proxy] Primary provider failed, attempting fallback:', {
          primaryProvider,
          fallbackProvider,
          error: providerMessage,
        });
        try {
          providerResponse = await callProvider(fallbackProvider);
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          const fallbackStatus = mapProviderErrorStatus(fallbackMessage);
          const fallbackErrorCode = mapAiProxyErrorCode(fallbackStatus, fallbackMessage);
          const retryAfterSeconds = extractRetryAfterSeconds(fallbackMessage);
          console.error('[ai-proxy] Provider error:', providerMessage, 'Fallback error:', fallbackMessage);
          return new Response(JSON.stringify({
            error: 'provider_error',
            error_code: fallbackErrorCode,
            message: providerMessage,
            fallback: fallbackMessage,
            retryable: fallbackStatus === 429 || fallbackStatus >= 500,
            retry_after_seconds: retryAfterSeconds,
          }), {
            status: fallbackStatus,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        console.error('[ai-proxy] Provider error:', providerMessage);
        const errorCode = mapAiProxyErrorCode(providerStatus, providerMessage);
        const retryAfterSeconds = extractRetryAfterSeconds(providerMessage);
        return new Response(JSON.stringify({
          error: 'provider_error',
          error_code: errorCode,
          message: providerMessage,
          retryable: providerStatus === 429 || providerStatus >= 500,
          retry_after_seconds: retryAfterSeconds,
        }), {
          status: providerStatus,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    try {
      const usageResult = await supabase.rpc('record_ai_usage', {
        p_user_id: userData.user.id,
        p_feature_used: normalizeServiceType(payload.service_type),
        p_model_used: providerResponse.model || (preferOpenAI ? 'openai' : 'anthropic'),
        p_tokens_used: (providerResponse.usage?.tokens_in || 0) + (providerResponse.usage?.tokens_out || 0),
        p_request_tokens: providerResponse.usage?.tokens_in || 0,
        p_response_tokens: providerResponse.usage?.tokens_out || 0,
        p_success: true,
        p_metadata: {
          scope: payload.scope,
          organization_id: profile.organization_id || profile.preschool_id || null,
          tool_results: providerResponse.tool_results || [],
          request_metadata: payload.metadata || {},
        },
      });
      if (usageResult.error) {
        console.warn('[ai-proxy] record_ai_usage returned error (non-fatal):', usageResult.error);
      }
    } catch (usageError) {
      console.warn('[ai-proxy] record_ai_usage failed (non-fatal):', usageError);
    }

    const normalizedOCR = requestedOCRMode
      ? normalizeOCRResponse({
          content: providerResponse.content || '',
          task: ocrTask,
        })
      : null;
    const responseContent = requestedOCRMode && ocrResponseFormat === 'json'
      ? JSON.stringify(normalizedOCR)
      : (providerResponse.content || normalizedOCR?.analysis || '');

    if (wantsStream) {
      return new Response(buildSseStream(responseContent), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    const resolutionMeta = deriveResolutionMetadata(
      requestMetadata,
      providerResponse.pending_tool_calls?.length || 0,
      {
        requestedOCRMode,
        ocrConfidence: normalizedOCR?.confidence ?? null,
      }
    );

    const latestUserPrompt = getLatestUserTextForCriteria(payload.payload);
    const planMode = dashPlanModeEnabled
      ? derivePlanModeMeta({
          metadata: requestMetadata,
          latestUserPrompt,
          assistantResponse: responseContent,
        })
      : undefined;
    if (planMode?.active) {
      console.info('dash.plan_mode.detected', {
        user_id: userData.user.id,
        scope: payload.scope || profile.role || 'unknown',
        stage: planMode.stage,
        completed: planMode.completed,
      });
    }

    const suggestedActions = dashSuggestedActionsEnabled
      ? deriveSuggestedActions({
          latestUserPrompt,
          assistantResponse: responseContent,
          scope: String(payload.scope || profile.role || ''),
          planMode,
          pendingToolCalls: providerResponse.pending_tool_calls?.length || 0,
          resolutionStatus: resolutionMeta.resolution_status,
        })
      : [];
    if (suggestedActions.length > 0) {
      console.info('dash.suggestions.generated', {
        user_id: userData.user.id,
        scope: payload.scope || profile.role || 'unknown',
        count: suggestedActions.length,
        plan_mode: planMode?.active || false,
        stage: planMode?.stage || null,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      content: responseContent,
      usage: providerResponse.usage,
      model: providerResponse.model,
      generated_images: providerResponse.generated_images || [],
      tool_results: providerResponse.tool_results || [],
      pending_tool_calls: providerResponse.pending_tool_calls || [],
      suggested_actions: suggestedActions,
      plan_mode: planMode || undefined,
      ocr: normalizedOCR || undefined,
      resolution_status: resolutionMeta.resolution_status,
      confidence_score: resolutionMeta.confidence_score,
      escalation_offer: resolutionMeta.escalation_offer,
      resolution_meta: resolutionMeta.resolution_meta,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      error: 'ai_proxy_error',
      error_code: mapAiProxyErrorCode(500, message),
      message,
      retryable: true,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
