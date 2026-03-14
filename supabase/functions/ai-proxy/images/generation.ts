import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

import { getEnv, getOpenAIApiKey } from '../auth.ts';
import { ImageOptionsSchema } from '../schemas.ts';
import type { GeneratedImage, JsonRecord, ProviderResponse } from '../types.ts';
import {
  IMAGE_BUCKET,
  IMAGE_SIGNED_URL_TTL_SECONDS,
  createImageProviderError,
  hasContentPolicySignal,
  parseImageSize,
  toPngBytes,
} from './policy.ts';

export async function moderateImagePrompt(apiKey: string, prompt: string): Promise<void> {
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

export async function callOpenAIImageGeneration(params: {
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
