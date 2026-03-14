import { callImagenImageGeneration } from '../providers/imagen.ts';
import { callOpenAIImageGeneration } from '../images/generation.ts';
import {
  normalizeTierName,
  coerceImageOptionsForTier,
  isImageFallbackEnabled,
  buildImageProviderChain,
  estimateImageCostUsd,
  normalizeImageProviderError,
  createImageProviderError,
} from '../images/policy.ts';
import { getModelQuotaWeight } from '../config.ts';
import type { ImageProvider, ProviderResponse } from '../types.ts';

export async function handleImageGeneration(params: {
  supabase: any;
  userId: string;
  profile: { organization_id: unknown; preschool_id: unknown };
  payload: { scope?: string; metadata?: Record<string, unknown>; payload: { prompt?: string; image_options?: any } };
  quotaDataForRequest: Record<string, unknown> | null;
  requestedModel: string | null;
  hasOpenAI: boolean;
  hasImagen: boolean;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const {
    supabase, userId, profile, payload, quotaDataForRequest,
    requestedModel, hasOpenAI, hasImagen, corsHeaders,
  } = params;

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
  let terminalError: ReturnType<typeof createImageProviderError> | null = null;
  const requestedLower = String(requestedModel || '').toLowerCase();
  const openAIRequestedModel = requestedLower.includes('gpt') ? requestedModel : null;
  const imagenRequestedModel = requestedLower.includes('imagen') ? requestedModel : null;

  for (let i = 0; i < providerChain.length; i += 1) {
    const provider = providerChain[i];
    try {
      providerResponse = provider === 'openai'
        ? await callOpenAIImageGeneration({
          supabase,
          userId,
          prompt,
          options: imageOptions,
          requestedModel: provider === 'openai' ? openAIRequestedModel : null,
        })
        : await callImagenImageGeneration({
          supabase,
          userId,
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
      p_user_id: userId,
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
    await supabase.rpc('increment_ai_usage', {
      p_user_id: userId,
      p_request_type: 'image_generation',
      p_status: 'success',
      p_metadata: { scope: payload.scope, organization_id: profile.organization_id || profile.preschool_id || null },
      p_weight: getModelQuotaWeight(providerResponse.model || requestedModel),
    });
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
