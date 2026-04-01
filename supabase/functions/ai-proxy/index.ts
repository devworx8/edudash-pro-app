import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { isImagenConfigured } from './providers/imagen.ts';
import { SHARED_PHONICS_PROMPT_BLOCK } from './generated/phonicsPrompt.ts';
import { deriveResolutionMetadata } from './resolutionPolicy.ts';
import { derivePlanModeMeta, deriveSuggestedActions } from './interactionHints.ts';
import { extractRetryAfterSeconds, mapAiProxyErrorCode } from './errorContract.ts';

import { RequestSchema } from './schemas.ts';
import { getBooleanFlag, getAnthropicApiKey, getOpenAIApiKey, extractBearerToken, inferJwtRole, redactMessagesForProvider, getEnv } from './auth.ts';
import { hasSpecialistRoute, resolveSpecialistRoute } from './specialists/router.ts';
import { executeSpecialist } from './specialists/handler.ts';
import { normalizeServiceType, getMaxTokensForService, getModelQuotaWeight } from './config.ts';
import { normalizeTierName, getDefaultModelIdForTierProxy, isPremiumTier } from './images/policy.ts';
import { buildSystemPrompt } from './prompts/system.ts';
import { getOCRPrompt, CRITERIA_RESPONSE_PROMPT, detectPhonicsMode, shouldUseCriteriaResponseMode, normalizeOCRResponse, getLatestUserTextForCriteria } from './prompts/ocr.ts';
import { normalizeRequestedModel, normalizeAnthropicAllowedModels, normalizeAnthropicAllowedModelsWithTierDefaults, parseAllowedModels, pickAllowedModel, DEFAULT_ANTHROPIC_ALLOWED_MODELS, DEFAULT_OPENAI_ALLOWED_MODELS, DEFAULT_SUPERADMIN_ALLOWED_MODELS } from './models.ts';
import { normalizeMessages, hasActionableUserMessages, buildProviderConversationMessages, buildSseStream, mapProviderErrorStatus, shouldAttemptCrossProviderFallback } from './message-processing.ts';
import { callAnthropicStreaming } from './streaming/anthropic.ts';
import { callOpenAIStreaming } from './streaming/openai.ts';
import { callOpenAI } from './providers/openai.ts';
import { callAnthropic } from './providers/anthropic.ts';
import { handleImageGeneration } from './handlers/image.ts';
import { recordStreamingUsage } from './handlers/usage.ts';
import type { ProviderResponse } from './types.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  try {
    if (req.method === 'OPTIONS') return handleCorsOptions(req);
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_json', message: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      const hasPayloadImages = body && typeof body === 'object' &&
        Array.isArray((body as any).payload?.images) && (body as any).payload.images.length > 0;
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
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
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

    // SECURITY: Never allow quota bypass in production
    const environment = Deno.env.get('ENVIRONMENT') || 'production';
    const vercelEnv = Deno.env.get('VERCEL_ENV') || '';
    const isProduction = environment === 'production' || vercelEnv === 'production';
    const devModeBypass = !isProduction &&
      Deno.env.get('AI_QUOTA_BYPASS') === 'true' &&
      (environment === 'development' || environment === 'local');

    if (devModeBypass) {
      console.warn('[ai-proxy] ⚠️ QUOTA BYPASS ACTIVE - Development mode only');
    }

    let quotaDataForRequest: Record<string, unknown> | null = null;
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
      }
      const quotaData = quota.data as Record<string, unknown> | null;
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

    const systemPrompt = buildSystemPrompt(mergedContext, normalizedServiceType, requestMetadata, payload.mode);
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
    const anthropicAllowed = normalizeAnthropicAllowedModelsWithTierDefaults(
      parseAllowedModels('ANTHROPIC_ALLOWED_MODELS', DEFAULT_ANTHROPIC_ALLOWED_MODELS)
    );

    let requestedModel = normalizedRequestedModel;
    if (quotaDataForRequest?.current_tier != null && serviceType !== 'image_generation') {
      const tierDefault = getDefaultModelIdForTierProxy(normalizeTierName(quotaDataForRequest.current_tier));
      if (!requestedModel) {
        requestedModel = tierDefault;
      } else {
        const HAIKU_MODELS = new Set([
          'claude-3-haiku-20240307',
          'claude-haiku-4-5-20251001',
          'claude-3-5-haiku-20241022',
        ]);
        const tierIsStarterOrAbove = !normalizeTierName(quotaDataForRequest.current_tier).includes('free');
        const tierIsPremiumOrAbove = isPremiumTier(normalizeTierName(quotaDataForRequest.current_tier));
        if (tierIsStarterOrAbove && HAIKU_MODELS.has(requestedModel)) {
          requestedModel = tierDefault;
        }
      }
    }

    const requestedIsOpenAI = requestedModel ? openaiAllowed.includes(requestedModel) : false;
    const requestedIsAnthropic = requestedModel ? anthropicAllowed.includes(requestedModel) : false;
    const shouldPreferOpenAI = requestedIsOpenAI ? true : requestedIsAnthropic ? false : preferOpenAI;

    // ── IMAGE GENERATION ──────────────────────────────────────────────────────
    if (serviceType === 'image_generation') {
      return handleImageGeneration({
        supabase,
        userId: userData.user.id,
        profile,
        payload: payload as any,
        quotaDataForRequest,
        requestedModel,
        hasOpenAI,
        hasImagen,
        corsHeaders,
      });
    }

    // ── SPECIALIST ROUTING ────────────────────────────────────────────────────
    // Route domain-specific tasks to optimal provider + specialist prompt.
    // Falls through to default Dash (Claude) path if no specialist or if disabled.
    const specialistEnabled = getBooleanFlag('SPECIALIST_ROUTING_ENABLED', true);
    if (specialistEnabled && hasSpecialistRoute(serviceType)) {
      const specialistRoute = resolveSpecialistRoute(serviceType);
      if (specialistRoute) {
        try {
          console.info('[ai-proxy] Specialist route:', {
            service_type: serviceType,
            specialist: specialistRoute.specialistId,
            provider: specialistRoute.provider,
            model: specialistRoute.model,
          });

          const userMessages = providerConversationMessages.filter(
            (m: any) => m.role !== 'system'
          );
          const specialistResponse = await executeSpecialist(
            specialistRoute,
            userMessages,
            mergedContext,
            supabase,
            requestMetadata,
          );

          // Record usage
          try {
            await supabase.rpc('record_ai_usage', {
              p_user_id: userData.user.id,
              p_feature_used: normalizeServiceType(payload.service_type),
              p_model_used: specialistResponse.model || specialistRoute.model || specialistRoute.provider,
              p_tokens_used: (specialistResponse.usage?.tokens_in || 0) + (specialistResponse.usage?.tokens_out || 0),
              p_request_tokens: specialistResponse.usage?.tokens_in || 0,
              p_response_tokens: specialistResponse.usage?.tokens_out || 0,
              p_success: true,
              p_metadata: {
                scope: payload.scope,
                organization_id: profile.organization_id || profile.preschool_id || null,
                specialist_id: specialistResponse.specialist_id,
                routed_provider: specialistResponse.routed_provider,
                request_metadata: payload.metadata || {},
              },
            });
            await supabase.rpc('increment_ai_usage', {
              p_user_id: userData.user.id,
              p_request_type: normalizeServiceType(payload.service_type),
              p_status: 'success',
              p_metadata: {
                scope: payload.scope,
                organization_id: profile.organization_id || profile.preschool_id || null,
                specialist_id: specialistResponse.specialist_id,
              },
              p_weight: getModelQuotaWeight(specialistResponse.model || specialistRoute.model),
            });
          } catch (usageErr) {
            console.warn('[ai-proxy] Specialist usage recording failed (non-fatal):', usageErr);
          }

          if (wantsStream) {
            return new Response(buildSseStream(specialistResponse.content || ''), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Transfer-Encoding': 'chunked' },
            });
          }

          return new Response(JSON.stringify({
            success: true,
            content: specialistResponse.content || '',
            usage: specialistResponse.usage,
            model: specialistResponse.model,
            specialist_id: specialistResponse.specialist_id,
            routed_provider: specialistResponse.routed_provider,
            generated_images: [],
            tool_results: [],
            pending_tool_calls: [],
            suggested_actions: [],
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (specialistError) {
          // Specialist failed — fall through to default Dash path
          const specialistMessage = specialistError instanceof Error ? specialistError.message : String(specialistError);
          console.warn('[ai-proxy] Specialist failed, falling back to default:', {
            specialist: specialistRoute.specialistId,
            provider: specialistRoute.provider,
            error: specialistMessage,
          });
        }
      }
    }

    // ── TRUE STREAMING (Anthropic) ────────────────────────────────────────────
    const canAnthropicTrueStream = wantsStream && hasAnthropic && !shouldPreferOpenAI;
    if (canAnthropicTrueStream) {
      try {
        const allowedOverride = isSuperAdmin ? superAdminAllowed : undefined;
        const clientToolDefs = enableTools && payload.client_tools?.length > 0
          ? payload.client_tools as Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
          : undefined;
        const { stream, meta } = callAnthropicStreaming(
          supabase, messages, requestedModel, allowedOverride,
          isSuperAdmin, requestMetadata, maxTokens, enableTools, clientToolDefs,
        );
        meta.then((pr) => recordStreamingUsage({
          supabase, userId: userData.user.id, profile,
          serviceType: payload.service_type, metadata: payload.metadata as Record<string, unknown>,
          scope: payload.scope, model: pr.model, tokensIn: pr.usage?.tokens_in || 0,
          tokensOut: pr.usage?.tokens_out || 0, requestedModel,
        })).catch((e) => console.warn('[ai-proxy] Streaming meta error (non-fatal):', e));
        return new Response(stream, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Transfer-Encoding': 'chunked' },
        });
      } catch (streamError) {
        console.warn('[ai-proxy] True streaming failed, falling back to post-hoc:', streamError);
      }
    }

    // ── TRUE STREAMING (OpenAI) ───────────────────────────────────────────────
    const canOpenAITrueStream = wantsStream && !canAnthropicTrueStream && hasOpenAI && !enableTools && !requestedOCRMode;
    if (canOpenAITrueStream) {
      try {
        const { stream, meta } = callOpenAIStreaming(messages, requestedModel, requestMetadata, maxTokens);
        meta.then((pr) => recordStreamingUsage({
          supabase, userId: userData.user.id, profile,
          serviceType: payload.service_type, metadata: payload.metadata as Record<string, unknown>,
          scope: payload.scope, model: pr.model, tokensIn: pr.usage?.tokens_in || 0,
          tokensOut: pr.usage?.tokens_out || 0, requestedModel,
        })).catch((e) => console.warn('[ai-proxy] OpenAI streaming meta error (non-fatal):', e));
        return new Response(stream, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Transfer-Encoding': 'chunked' },
        });
      } catch (streamError) {
        console.warn('[ai-proxy] OpenAI true streaming failed, falling back to post-hoc:', streamError);
      }
    }

    // ── POST-HOC (non-streaming) ──────────────────────────────────────────────
    const clientTools = payload.client_tools || undefined;
    let primaryProvider: 'anthropic' | 'openai' = isSuperAdmin ? 'anthropic' : shouldPreferOpenAI ? 'openai' : 'anthropic';
    if (primaryProvider === 'anthropic' && !hasAnthropic && hasOpenAI) primaryProvider = 'openai';
    else if (primaryProvider === 'openai' && !hasOpenAI && hasAnthropic) primaryProvider = 'anthropic';

    if ((primaryProvider === 'anthropic' && !hasAnthropic) || (primaryProvider === 'openai' && !hasOpenAI)) {
      return new Response(JSON.stringify({
        error: 'provider_not_configured',
        message: primaryProvider === 'anthropic'
          ? 'ANTHROPIC_API_KEY missing and Anthropic not configured.'
          : 'OPENAI_API_KEY missing and OpenAI not configured.',
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const callProvider = async (provider: 'anthropic' | 'openai'): Promise<ProviderResponse> => {
      if (provider === 'anthropic') {
        if (!hasAnthropic) throw new Error('ANTHROPIC_API_KEY missing and Anthropic not configured.');
        const model = isSuperAdmin ? pickAllowedModel(requestedModel, superAdminAllowed, superAdminAllowed[0]).model : requestedModel;
        return await callAnthropic(supabase, messages, enableTools, model, isSuperAdmin ? superAdminAllowed : undefined, requestMetadata, maxTokens, clientTools);
      }
      if (!hasOpenAI) throw new Error('OPENAI_API_KEY missing and OpenAI not configured.');
      return await callOpenAI(supabase, messages, enableTools, requestedModel, requestMetadata, maxTokens, clientTools);
    };

    let providerResponse: ProviderResponse;
    try {
      providerResponse = await callProvider(primaryProvider);
    } catch (providerError) {
      const providerMessage = providerError instanceof Error ? providerError.message : String(providerError);
      const providerStatus = mapProviderErrorStatus(providerMessage);
      if (hasOpenAI && hasAnthropic && shouldAttemptCrossProviderFallback(providerMessage)) {
        const fallbackProvider = primaryProvider === 'anthropic' ? 'openai' : 'anthropic';
        console.warn('[ai-proxy] Primary provider failed, attempting fallback:', { primaryProvider, fallbackProvider, error: providerMessage });
        try {
          providerResponse = await callProvider(fallbackProvider);
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          const fallbackStatus = mapProviderErrorStatus(fallbackMessage);
          console.error('[ai-proxy] Provider error:', providerMessage, 'Fallback error:', fallbackMessage);
          return new Response(JSON.stringify({
            error: 'provider_error', error_code: mapAiProxyErrorCode(fallbackStatus, fallbackMessage),
            message: providerMessage, fallback: fallbackMessage,
            retryable: fallbackStatus === 429 || fallbackStatus >= 500,
            retry_after_seconds: extractRetryAfterSeconds(fallbackMessage),
          }), { status: fallbackStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        console.error('[ai-proxy] Provider error:', providerMessage);
        return new Response(JSON.stringify({
          error: 'provider_error', error_code: mapAiProxyErrorCode(providerStatus, providerMessage),
          message: providerMessage, retryable: providerStatus === 429 || providerStatus >= 500,
          retry_after_seconds: extractRetryAfterSeconds(providerMessage),
        }), { status: providerStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        p_metadata: { scope: payload.scope, organization_id: profile.organization_id || profile.preschool_id || null, tool_results: providerResponse.tool_results || [], request_metadata: payload.metadata || {} },
      });
      if (usageResult.error) console.warn('[ai-proxy] record_ai_usage returned error (non-fatal):', usageResult.error);
      await supabase.rpc('increment_ai_usage', {
        p_user_id: userData.user.id, p_request_type: normalizeServiceType(payload.service_type),
        p_status: 'success', p_metadata: { scope: payload.scope, organization_id: profile.organization_id || profile.preschool_id || null },
        p_weight: getModelQuotaWeight(providerResponse.model || requestedModel),
      });
    } catch (usageError) {
      console.warn('[ai-proxy] record_ai_usage failed (non-fatal):', usageError);
    }

    const normalizedOCR = requestedOCRMode
      ? normalizeOCRResponse({ content: providerResponse.content || '', task: ocrTask })
      : null;
    const responseContent = requestedOCRMode && ocrResponseFormat === 'json'
      ? JSON.stringify(normalizedOCR)
      : (providerResponse.content || normalizedOCR?.analysis || '');

    if (wantsStream) {
      return new Response(buildSseStream(responseContent), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Transfer-Encoding': 'chunked' },
      });
    }

    const resolutionMeta = deriveResolutionMetadata(
      requestMetadata, providerResponse.pending_tool_calls?.length || 0,
      { requestedOCRMode, ocrConfidence: normalizedOCR?.confidence ?? null }
    );
    const latestUserPrompt = getLatestUserTextForCriteria(payload.payload);
    const planMode = dashPlanModeEnabled
      ? derivePlanModeMeta({ metadata: requestMetadata, latestUserPrompt, assistantResponse: responseContent })
      : undefined;
    if (planMode?.active) {
      console.info('dash.plan_mode.detected', {
        user_id: userData.user.id, scope: payload.scope || profile.role || 'unknown',
        stage: planMode.stage, completed: planMode.completed,
      });
    }
    const suggestedActions = dashSuggestedActionsEnabled
      ? deriveSuggestedActions({
          latestUserPrompt, assistantResponse: responseContent,
          scope: String(payload.scope || profile.role || ''),
          planMode, pendingToolCalls: providerResponse.pending_tool_calls?.length || 0,
          resolutionStatus: resolutionMeta.resolution_status,
        })
      : [];
    if (suggestedActions.length > 0) {
      console.info('dash.suggestions.generated', {
        user_id: userData.user.id, scope: payload.scope || profile.role || 'unknown',
        count: suggestedActions.length, plan_mode: planMode?.active || false, stage: planMode?.stage || null,
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
