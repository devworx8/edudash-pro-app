/**
 * DashAIClient
 * 
 * Handles all AI service communication via Supabase Edge Functions.
 * Extracted from DashAICore for file size compliance (WARP.md).
 * 
 * Supports:
 * - Non-streaming HTTP requests
 * - SSE streaming (web)
 * - WebSocket streaming (React Native - Phase 2)
 * 
 * References:
 * - Supabase JS v2: https://supabase.com/docs/reference/javascript/introduction
 * - Fetch API: https://developer.mozilla.org/docs/Web/API/Fetch_API
 * - React Native 0.79 WebSocket: https://reactnative.dev/docs/0.79/network#websocket-support
 */

import { unifiedToolRegistry } from '@/services/tools/UnifiedToolRegistry';
import { getCapabilityTier, normalizeTierName } from '@/lib/tiers';
import { buildImagePayloadsFromAttachments } from '@/lib/dash-ai/imagePayloadBuilder';
import { dashAiDevLog } from '@/lib/dash-ai/dashAiDevLogger';

// Global declarations for React Native environment
// Reference: https://reactnative.dev/docs/javascript-environment
declare const __DEV__: boolean;

/**
 * AI service call parameters
 */
export interface AIServiceParams {
  action?: string;
  messages?: Array<{ role: string; content: string }>;
  content?: string;
  userInput?: string;
  context?: string;
  attachments?: any[];
  images?: Array<{ data: string; media_type: string }>;
  metadata?: Record<string, unknown>;
  model?: string;
  serviceType?: string;
  ocrMode?: boolean;
  ocrTask?: 'homework' | 'document' | 'handwriting';
  ocrResponseFormat?: 'json' | 'text';
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  /** AbortSignal to cancel in-flight requests (streaming & non-streaming) */
  signal?: AbortSignal;
}

/**
 * AI service response
 */
export interface AIServiceResponse {
  content: string;
  metadata?: {
    usage?: {
      tokens_in?: number;
      tokens_out?: number;
      cost?: number;
    };
    tool_results?: any[];
    generated_images?: Array<{
      id: string;
      bucket: string;
      path: string;
      signed_url: string;
      mime_type: string;
      prompt: string;
      width: number;
      height: number;
      provider: string;
      model: string;
      expires_at: string;
    }>;
    resolution_status?: 'resolved' | 'needs_clarification' | 'escalated';
    confidence_score?: number;
    escalation_offer?: boolean;
    resolution_meta?: {
      source?: string;
      ocr_confidence?: number;
      thresholds?: {
        low: number;
        high: number;
      };
      pending_tool_calls?: number;
      stream_fallback_reason?: 'stream_pending_tool_calls' | 'stream_error';
      stream_fallback_outcome?: 'fallback_started' | 'fallback_completed' | 'fallback_failed';
      continuation_passes_executed?: number;
      continuation_pass_outcome?: 'completed' | 'limit_reached' | 'failed';
    };
    ocr?: {
      extracted_text?: string;
      confidence?: number;
      document_type?: 'homework' | 'document' | 'handwriting';
      analysis?: string;
      unclear_spans?: string[];
    };
    trace_id?: string;
    continuation_limit_reached?: boolean;
  };
  error?: string;
}

/**
 * User profile for scope determination
 */
export interface UserProfile {
  role?: string;
}

/**
 * DashAIClient configuration
 */
export interface DashAIClientConfig {
  supabaseClient: any;
  getUserProfile: () => UserProfile | undefined;
}

/**
 * DashAIClient
 * 
 * Handles AI service communication via ai-proxy Edge Function.
 */
export class DashAIClient {
  private supabaseClient: any;
  private getUserProfile: () => UserProfile | undefined;
  
  constructor(config: DashAIClientConfig) {
    this.supabaseClient = config.supabaseClient;
    this.getUserProfile = config.getUserProfile;
  }

  private createTraceId(prefix = 'dash_ai'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRateLimitRetryDelayMs(): number {
    return this.parseIntegerEnv(
      process.env.EXPO_PUBLIC_DASH_AI_429_RETRY_MS,
      900,
      250,
      5000
    );
  }

  private getRateLimitRetryAttempts(): number {
    return this.parseIntegerEnv(
      process.env.EXPO_PUBLIC_DASH_AI_429_RETRIES,
      2,
      1,
      4
    );
  }

  private getRateLimitRetryJitter(): number {
    return this.parseFloatEnv(
      process.env.EXPO_PUBLIC_DASH_AI_429_RETRY_JITTER,
      0.35,
      0,
      1
    );
  }

  private extractRetryAfterMs(details: unknown): number | null {
    if (!details || typeof details !== 'object') return null;
    const raw = details as {
      retry_after_ms?: number;
      retry_after?: number;
      retryAfterMs?: number;
    };
    const candidate = raw.retry_after_ms ?? raw.retryAfterMs ?? raw.retry_after;
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.min(60_000, Math.max(250, Math.round(parsed)));
  }

  private getBackoffDelayMs(baseDelayMs: number, attempt: number, details?: unknown): number {
    const retryAfterMs = this.extractRetryAfterMs(details);
    if (retryAfterMs) return retryAfterMs;

    const expBackoff = baseDelayMs * Math.pow(1.7, Math.max(0, attempt - 1));
    const jitter = this.getRateLimitRetryJitter();
    const jitterFactor = 1 + ((Math.random() * 2 - 1) * jitter);
    return Math.min(10_000, Math.max(250, Math.round(expBackoff * jitterFactor)));
  }

  private async invokeAIProxyWith429Retry(
    body: Record<string, unknown>,
    traceId: string,
    phase: 'initial' | 'continuation'
  ): Promise<{ data: any; error: any }> {
    const maxRetryAttempts = this.getRateLimitRetryAttempts();
    const baseDelayMs = this.getRateLimitRetryDelayMs();

    let attempt = 0;
    let result = await this.supabaseClient.functions.invoke('ai-proxy', { body });

    while (result?.error) {
      const parsedError = this.parseEdgeFunctionError(result.error);
      const code = String(parsedError.code || '').toLowerCase();
      const isRateLimited = parsedError.status === 429;
      const isHardQuota = code === 'quota_exceeded';

      // Quota exhausted is deterministic; no retry loop.
      if (!isRateLimited || isHardQuota || attempt >= maxRetryAttempts) {
        if (__DEV__) {
          const parsed = this.parseEdgeFunctionError(result.error);
          dashAiDevLog('ai_proxy_error', {
            status: parsed.status,
            code: parsed.code,
            message: parsed.message,
            details: parsed.details,
            rawError: result.error,
            phase,
            traceId,
          });
        }
        return result;
      }

      attempt += 1;
      const retryDelayMs = this.getBackoffDelayMs(baseDelayMs, attempt, parsedError.details);

      console.warn('[DashAIClient] ai-proxy returned 429, retrying', {
        phase,
        trace_id: traceId,
        attempt,
        max_attempts: maxRetryAttempts,
        delay_ms: retryDelayMs,
        code: parsedError.code,
      });

      await this.sleep(retryDelayMs);
      result = await this.supabaseClient.functions.invoke('ai-proxy', { body });
    }

    return result;
  }

  private parseIntegerEnv(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number
  ): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  private parseFloatEnv(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number
  ): number {
    const parsed = Number.parseFloat(String(value ?? ''));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  private isAbortLikeError(error: unknown): boolean {
    const err = error as { name?: string; message?: string; code?: string } | null;
    const name = String(err?.name || '');
    const code = String(err?.code || '');
    const message = String(err?.message || '');
    if (name === 'AbortError' || code === 'ABORT_ERR') return true;
    return message === 'Aborted' || /aborted/i.test(message);
  }

  private createStreamContinuationError(toolNames: string[]): Error {
    const label = toolNames.length > 0 ? toolNames.join(', ') : 'client_tools';
    const error = new Error(`Streaming requires continuation for tool calls: ${label}`);
    (error as Error & { code?: string }).code = 'stream_requires_continuation';
    return error;
  }

  private getOrchestrationConfig(): {
    orchestration_mode: string;
    loop_budget: {
      max_continuation_passes: number;
      max_pending_tools_per_pass: number;
      timeout_ms: number;
    };
    confidence_threshold: number;
  } {
    return {
      orchestration_mode: process.env.EXPO_PUBLIC_DASH_ORCHESTRATION_MODE || 'bounded_two_pass',
      loop_budget: {
        max_continuation_passes: this.parseIntegerEnv(
          process.env.EXPO_PUBLIC_DASH_CONTINUATION_PASSES,
          2,
          1,
          4
        ),
        max_pending_tools_per_pass: this.parseIntegerEnv(
          process.env.EXPO_PUBLIC_DASH_MAX_PENDING_TOOLS_PER_PASS,
          6,
          1,
          20
        ),
        timeout_ms: this.parseIntegerEnv(
          process.env.EXPO_PUBLIC_DASH_ORCHESTRATION_TIMEOUT_MS,
          12000,
          2000,
          60000
        ),
      },
      confidence_threshold: this.parseFloatEnv(
        process.env.EXPO_PUBLIC_DASH_CONFIDENCE_THRESHOLD,
        0.68,
        0.05,
        0.99
      ),
    };
  }

  private buildToolCompletionFallback(toolResult: any): string {
    const toolName = String(toolResult?.name || '').trim().toLowerCase();
    if (toolResult?.success === false) {
      if (toolName === 'get_assignments') {
        return 'I could not fetch assignments right now. Please try again in a moment.';
      }
      return 'I could not complete that action right now. Please try again in a moment.';
    }

    const output = toolResult?.output;
    const outputObj = output && typeof output === 'object'
      ? output as Record<string, any>
      : null;

    const readCount = (...values: unknown[]): number | null => {
      for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
      }
      return null;
    };

    if (['export_pdf', 'generate_worksheet', 'generate_chart', 'generate_pdf_from_prompt'].includes(toolName)) {
      const filename = String(
        outputObj?.filename ||
        outputObj?.file_name ||
        ''
      ).trim();
      if (filename) {
        return `Your PDF is ready. Tap Preview PDF to open ${filename}.`;
      }
      return 'Your PDF is ready. Tap Preview PDF to open it.';
    }

    if (toolName === 'search_caps_curriculum') {
      const count = readCount(outputObj?.count, outputObj?.results?.length);
      if (count !== null) {
        return count > 0
          ? `I searched CAPS and found ${count} matching item${count === 1 ? '' : 's'}.`
          : 'I searched CAPS but found no direct matches yet. Try a more specific topic or grade.';
      }
      return 'I searched CAPS and returned the latest curriculum matches in the tool card.';
    }

    if (toolName === 'get_caps_documents') {
      const count = readCount(outputObj?.count, outputObj?.documents?.length);
      if (count !== null) {
        return count > 0
          ? `I found ${count} CAPS document${count === 1 ? '' : 's'} for this request.`
          : 'I could not find CAPS documents for that exact filter yet.';
      }
      return 'I retrieved CAPS document information in the tool card below.';
    }

    if (toolName === 'get_assignments') {
      const count = readCount(outputObj?.count, outputObj?.assignments?.length);
      if (count !== null) {
        return count > 0
          ? `I found ${count} assignment${count === 1 ? '' : 's'} for this request.`
          : 'No assignments matched that filter yet.';
      }
      return 'I checked assignments and added the result to the tool card below.';
    }

    return 'I completed the requested tool action. Check the tool card below for details.';
  }

  private shouldEnableToolsForStreaming(input: {
    promptText: string;
    serviceType?: string;
    ocrMode?: boolean;
    metadata?: Record<string, unknown>;
  }): boolean {
    const metadata = (input.metadata || {}) as Record<string, unknown>;
    const explicitEnable = metadata.enable_tools === true;
    const explicitDisable =
      metadata.disable_tools_on_streaming === true ||
      metadata.prefer_streaming_latency === true;
    const source = String(metadata.source || '').toLowerCase();
    const responseMode = String(metadata.response_mode || '').toLowerCase();
    const prompt = String(input.promptText || '').toLowerCase();
    const serviceType = String(input.serviceType || '').toLowerCase();
    const voiceSource =
      source.includes('voice') ||
      source.includes('orb') ||
      source.includes('speech');
    const toolIntentPattern = /\b(export[_\s-]*pdf|generate[_\s-]*(pdf|worksheet|chart)|open\s+\w+|navigate|lookup|look up|web\s*search|search\b|latest\b|today\b|weather\b|price\b|send email|email\b)\b/i;
    const shouldUseToolsForPrompt = toolIntentPattern.test(prompt);

    if (explicitEnable) return true;
    if (serviceType === 'image_analysis' || input.ocrMode) return false;
    if (shouldUseToolsForPrompt) return true;
    if (explicitDisable) return false;
    if (voiceSource) return false;
    if (responseMode === 'tutor_interactive') return false;
    return true;
  }

  private normalizeRequestedModelId(model?: string | null): string | undefined {
    const raw = String(model || '').trim();
    if (!raw) return undefined;
    const key = raw.toLowerCase();
    const aliases: Record<string, string> = {
      'claude-3-5-sonnet': 'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-latest': 'claude-3-7-sonnet-20250219',
    };
    return aliases[key] || raw;
  }

  private normalizeRoleAndScope(roleValue?: string | null): {
    role: string;
    scope: 'teacher' | 'principal' | 'parent' | 'student' | 'admin';
  } {
    const role = String(roleValue || 'teacher').toLowerCase();

    // Super-admins get their own scope so the AI proxy routes correctly
    if (role === 'super_admin' || role === 'superadmin') {
      return { role, scope: 'admin' };
    }

    const scope: 'teacher' | 'principal' | 'parent' | 'student' =
      (['teacher', 'principal', 'parent', 'student', 'learner'].includes(role)
        ? (role === 'learner' ? 'student' : role)
        : 'teacher') as any;
    return { role, scope };
  }

  private resolveUserTier(profile: any): string {
    const candidates = [
      profile?.tier,
      profile?.subscription_tier,
      profile?.current_tier,
      profile?.context?.subscription_tier,
      profile?.context?.tier,
      profile?.context?.capability_tier,
      profile?.preferences?.subscription_tier,
      profile?.preferences?.tier,
    ];

    for (const candidate of candidates) {
      const raw = String(candidate || '').trim().toLowerCase();
      if (!raw) continue;

      // Preserve direct capability tiers.
      if (raw === 'free' || raw === 'starter' || raw === 'premium' || raw === 'enterprise') {
        return raw;
      }

      // Legacy aliases still present in historic usage records.
      if (raw === 'basic' || raw === 'solo' || raw === 'group_5' || raw === 'trialing') {
        return 'starter';
      }
      if (raw === 'pro' || raw === 'group_10') {
        return 'premium';
      }

      try {
        return getCapabilityTier(normalizeTierName(raw));
      } catch {
        if (raw.includes('enterprise')) return 'enterprise';
        if (raw.includes('premium') || raw.includes('pro') || raw.includes('plus')) return 'premium';
        if (raw.includes('starter') || raw.includes('basic') || raw.includes('trial')) return 'starter';
      }
    }

    return 'free';
  }

  private getClientToolDefs(role: string, tier: string): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> | undefined {
    const defs = unifiedToolRegistry.toClientToolDefs(role, tier);
    return defs.length > 0 ? defs : undefined;
  }

  private buildToolPlanMetadata(role: string, tier: string): {
    role: string;
    tier: string;
    tool_names: string[];
  } {
    const tools = unifiedToolRegistry.list(role, tier).map((tool) => tool.name);
    return {
      role,
      tier,
      tool_names: tools,
    };
  }

  private buildAttachmentContext(attachments?: any[]): string | null {
    if (!Array.isArray(attachments) || attachments.length === 0) return null;
    const lines = attachments.map((attachment: any) => {
      const name = attachment?.name || 'Attachment';
      const kind = attachment?.kind || 'file';
      const size = typeof attachment?.size === 'number' ? `${Math.round(attachment.size / 1024)} KB` : '';
      return `- ${name} (${kind}${size ? `, ${size}` : ''})`;
    });
    return [
      'ATTACHMENTS RECEIVED:',
      ...lines,
      'If you cannot view the attachments, ask the learner to type the exact question or summarize the document.',
    ].join('\n');
  }

  private async buildImagePayloads(
    attachments?: any[],
    images?: Array<{ data: string; media_type: string }>
  ): Promise<Array<{ data: string; media_type: string }>> {
    return buildImagePayloadsFromAttachments({
      attachments,
      images,
    });
  }
  
  /**
   * Call AI service with tool support (non-streaming)
   * 
   * References:
   * - Supabase Functions invoke: https://supabase.com/docs/reference/javascript/invoke
   */
  public async callAIService(params: AIServiceParams): Promise<AIServiceResponse> {
    try {
      // Tools enabled - Dash can now autonomously call tools like Claude Sonnet 4.5
      const ENABLE_TOOLS = true;
      const normalizedModel = this.normalizeRequestedModelId(params.model);
      const requestTraceId = String((params.metadata as any)?.trace_id || this.createTraceId('dash_ai_client'));
      let streamFallbackReason: 'none' | 'stream_pending_tool_calls' | 'stream_error' = 'none';
      let streamFallbackOutcome:
        | 'not_applicable'
        | 'fallback_started'
        | 'fallback_completed'
        | 'fallback_failed' = 'not_applicable';
      
      if (__DEV__) {
        console.log('[DashAIClient] Calling AI service:', {
          action: params.action,
          streaming: params.stream || false,
          toolsEnabled: ENABLE_TOOLS,
          model: normalizedModel || params.model || null,
        });
      }
      
      // If streaming requested, use streaming endpoint
      if (params.stream && params.onChunk) {
        // Build prompt from messages and delegate to streaming path
        // Use only the last user message as promptText — the full messages array is sent
        // separately as structured messages. Flattening to "User:/Assistant:" text causes
        // Claude to role-play both sides of the conversation.
        const messagesArr = Array.isArray(params.messages) ? params.messages : [];
        const promptText = messagesArr.length > 0
          ? String(messagesArr.filter((m: any) => m.role === 'user').at(-1)?.content || params.content || params.userInput || '')
          : String(params.content || params.userInput || '');
        const enableToolsForStreaming = this.shouldEnableToolsForStreaming({
          promptText,
          serviceType: params.serviceType,
          ocrMode: params.ocrMode,
          metadata: (params.metadata || {}) as Record<string, unknown>,
        });
        try {
          return await this.callAIServiceStreaming(
            {
              promptText,
              context: params.context || undefined,
              model: normalizedModel,
              serviceType: params.serviceType,
              ocrMode: params.ocrMode,
              ocrTask: params.ocrTask,
              ocrResponseFormat: params.ocrResponseFormat,
              metadata: {
                ...(params.metadata || {}),
                trace_id: requestTraceId,
                stream_tool_mode: enableToolsForStreaming ? 'enabled' : 'deferred',
              },
              enableTools: enableToolsForStreaming,
              // Forward image data so streaming path can include vision payloads
              attachments: params.attachments,
              images: params.images,
            },
            params.onChunk,
            params.signal
          );
        } catch (streamError) {
          if (this.isAbortLikeError(streamError)) {
            throw streamError;
          }
          const streamErrorCode = String((streamError as any)?.code || '').toLowerCase();
          const streamErrorMessage = streamError instanceof Error
            ? streamError.message
            : String(streamError);
          const isExpectedContinuation = streamErrorCode === 'stream_requires_continuation';
          streamFallbackReason = isExpectedContinuation
            ? 'stream_pending_tool_calls'
            : 'stream_error';
          streamFallbackOutcome = 'fallback_started';

          if (isExpectedContinuation) {
            console.info('[DashAIClient] Streaming pending tool calls detected, switching to non-stream continuation.');
          } else {
            console.warn('[DashAIClient] Streaming path failed, retrying with non-stream orchestration:', streamError);
          }
          if (__DEV__) {
            dashAiDevLog('voice_request', {
              phase: 'streaming_fallback_non_stream',
              message: streamErrorMessage,
              details: {
                model: params.model || null,
                normalized_model: normalizedModel || null,
                service_type: params.serviceType || null,
                response_mode: (params.metadata as any)?.response_mode || null,
                fallback_reason: streamFallbackReason,
                trace_id: requestTraceId,
              },
            });
          }
        }
      }
      
      // Non-streaming call to ai-proxy
      // Use only the last user message as promptText — same reasoning as streaming path above.
      const messagesArr = Array.isArray(params.messages) ? params.messages : [];
      const promptText = messagesArr.length > 0
        ? String(messagesArr.filter((m: any) => m.role === 'user').at(-1)?.content || params.content || params.userInput || '')
        : String(params.content || params.userInput || '');
      const attachmentContext = params.context?.includes('ATTACHMENTS RECEIVED')
        ? null
        : this.buildAttachmentContext(params.attachments);
      const mergedContext = [params.context, attachmentContext].filter(Boolean).join('\n\n') || undefined;
      const images = await this.buildImagePayloads(params.attachments, params.images);
      if (__DEV__ && (Array.isArray(params.attachments) || images.length > 0)) {
        console.log('[DashAIClient] Vision payload (non-stream)', {
          attachmentCount: Array.isArray(params.attachments) ? params.attachments.length : 0,
          imagePayloadCount: images.length,
          imageMediaTypes: images.map((img) => img.media_type),
          imagePayloadSizes: images.map((img) => img.data?.length || 0),
        });
      }
      const profile = this.getUserProfile() as any;
      const { role, scope } = this.normalizeRoleAndScope(profile?.role);
      const userTier = this.resolveUserTier(profile);
      const traceId = requestTraceId;
      const orchestration = this.getOrchestrationConfig();
      const effectiveServiceType = params.serviceType || (params.ocrMode ? 'image_analysis' : 'chat_message');

      // Canonical client tool inventory (shared with Dash Assistant/Tutor/ORB).
      const clientToolDefs = this.getClientToolDefs(role, userTier);
      const toolPlan = this.buildToolPlanMetadata(role, userTier);
      
      const initialRequestBody = {
        scope,
        service_type: effectiveServiceType,
        payload: {
          prompt: messagesArr.length > 0 ? undefined : promptText,
          context: mergedContext,
          messages: messagesArr.length > 0 ? messagesArr : undefined,
          images: images.length > 0 ? images : undefined,
          ocr_mode: params.ocrMode || undefined,
          ocr_task: params.ocrTask || undefined,
          ocr_response_format: params.ocrResponseFormat || undefined,
          model: normalizedModel,
        },
        stream: false,
        enable_tools: ENABLE_TOOLS,
        client_tools: clientToolDefs,
        metadata: {
          role: scope,
          model: normalizedModel,
          ...(params.metadata || {}),
          trace_id: traceId,
          stream_fallback_reason: streamFallbackReason !== 'none' ? streamFallbackReason : undefined,
          stream_fallback_outcome: streamFallbackOutcome !== 'not_applicable' ? streamFallbackOutcome : undefined,
          tool_plan: toolPlan,
          orchestration_mode: orchestration.orchestration_mode,
          loop_budget: orchestration.loop_budget,
          confidence_threshold: orchestration.confidence_threshold,
        },
      } as const;

      const { data, error } = await this.invokeAIProxyWith429Retry(
        initialRequestBody as unknown as Record<string, unknown>,
        traceId,
        'initial'
      );
      
      if (error) {
        const errorDetails = this.parseEdgeFunctionError(error);
        const logPayload = {
          error,
          status: errorDetails.status,
          code: errorDetails.code,
          message: errorDetails.message,
          details: errorDetails.details,
        };
        if (errorDetails.status === 429) {
          console.warn('[DashAIClient] AI service rate-limited:', logPayload);
        } else {
          console.error('[DashAIClient] AI service error:', logPayload);
          dashAiDevLog('ai_proxy_error', {
            status: errorDetails.status,
            code: errorDetails.code,
            message: errorDetails.message,
            rawError: error,
            phase: 'initial',
            traceId,
          });
        }
        return {
          content: this.getFriendlyErrorMessage(errorDetails),
          error: errorDetails.message || 'AI service error',
        };
      }
      
      // Handle response with potential tool use
      let assistantContent = data?.content || '';
      const toolResults = Array.isArray(data?.tool_results) ? [...data.tool_results] : [];
      let pendingToolCalls = Array.isArray(data?.pending_tool_calls) ? [...data.pending_tool_calls] : [];
      let usage = data?.usage;
      let generatedImages = data?.generated_images || [];
      let resolutionStatus = data?.resolution_status as
        | 'resolved'
        | 'needs_clarification'
        | 'escalated'
        | undefined;
      let confidenceScore = typeof data?.confidence_score === 'number'
        ? data.confidence_score
        : undefined;
      let escalationOffer = typeof data?.escalation_offer === 'boolean'
        ? data.escalation_offer
        : undefined;
      let resolutionMeta = data?.resolution_meta;
      let ocrPayload = data?.ocr;

      if (__DEV__ && toolResults.length > 0) {
        console.log('[DashAIClient] Server-side tool calls executed:', toolResults.length);
      }

      // Execute client-side tools that the AI requested
      const baseMessages = messagesArr.length > 0
        ? [...messagesArr]
        : [{ role: 'user', content: promptText }];
      let continuationMessages = [...baseMessages];
      let continuationPass = 0;
      let continuationLimitReached = false;
      let continuationPassOutcome: 'none' | 'completed' | 'limit_reached' | 'failed' = 'none';

      while (
        pendingToolCalls.length > 0 &&
        continuationPass < orchestration.loop_budget.max_continuation_passes
      ) {
        continuationPass += 1;
        const currentBatch = pendingToolCalls.slice(
          0,
          orchestration.loop_budget.max_pending_tools_per_pass
        );
        const overflow = pendingToolCalls.slice(orchestration.loop_budget.max_pending_tools_per_pass);

        if (__DEV__) {
          console.log('[DashAIClient] Executing client-side tools (pass):', {
            pass: continuationPass,
            tools: currentBatch.map((t: any) => t?.name),
          });
        }

        const executionContext = {
          userId: profile?.id || '',
          role: role,
          tier: userTier,
          organizationId: profile?.organization_id || profile?.preschool_id || '',
          hasOrganization: !!(profile?.organization_id || profile?.preschool_id),
          isGuest: !profile?.id,
          supabaseClient: this.supabaseClient,
          trace_id: traceId,
          tool_plan: {
            source: 'ai-proxy.pending_tool_calls',
            continuation_pass: continuationPass,
            requested_tool_names: currentBatch.map((call: any) => call?.name).filter(Boolean),
          },
        };

        const toolResultMessages: Array<{ role: string; content: string; tool_use_id?: string }> = [];
        const heavyToolTimeoutMs = this.parseIntegerEnv(
          process.env.EXPO_PUBLIC_DASH_HEAVY_TOOL_TIMEOUT_MS,
          90000,
          15000,
          180000
        );
        const defaultToolTimeoutMs = Math.min(
          orchestration.loop_budget.timeout_ms,
          10000,
        );
        const longRunningTools = new Set([
          'export_pdf',
          'generate_worksheet',
          'generate_chart',
          'generate_pdf_from_prompt',
          'generate_image',
        ]);

        for (const toolCall of currentBatch) {
          try {
            const toolName = String(toolCall?.name || '').trim();
            const perToolTimeoutMs = longRunningTools.has(toolName)
              ? heavyToolTimeoutMs
              : defaultToolTimeoutMs;
            // Per-tool timeout to prevent a single tool from blocking the pipeline
            const resultPromise = unifiedToolRegistry.execute(
              toolName,
              toolCall.input || {},
              executionContext
            );
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Tool ${toolName} timed out after ${perToolTimeoutMs}ms`)), perToolTimeoutMs)
            );
            const result = await Promise.race([resultPromise, timeoutPromise]);
            const output = result.result || result.error || 'No output';
            toolResults.push({
              name: toolName,
              input: toolCall.input,
              output,
              success: result.success,
              trace_id: result.trace_id || traceId,
            });
            toolResultMessages.push({
              role: 'user',
              content: `[Tool Result for ${toolName}]: ${typeof output === 'string' ? output : JSON.stringify(output)}`,
              tool_use_id: toolCall.id,
            });
          } catch (toolError: any) {
            const toolName = String(toolCall?.name || '').trim() || 'unknown_tool';
            const message = toolError?.message || 'Unknown tool execution error';
            toolResults.push({
              name: toolName,
              input: toolCall.input,
              output: `Tool execution error: ${message}`,
              success: false,
              trace_id: traceId,
            });
            toolResultMessages.push({
              role: 'user',
              content: `[Tool Result for ${toolName}]: Error - ${message}`,
              tool_use_id: toolCall.id,
            });
          }
        }

        if (toolResultMessages.length === 0) {
          break;
        }

        continuationMessages = [
          ...continuationMessages,
          { role: 'assistant', content: assistantContent || 'I used the following tools to help you.' },
          ...toolResultMessages,
        ];

        try {
          const continuationBody = {
            scope,
            service_type: params.serviceType || 'chat_message',
            payload: {
              context: mergedContext,
              messages: continuationMessages,
              model: params.model || undefined,
            },
            stream: false,
            enable_tools: continuationPass < orchestration.loop_budget.max_continuation_passes,
            client_tools: clientToolDefs,
            metadata: {
              role: scope,
              ...(params.metadata || {}),
              continuation: true,
              trace_id: traceId,
              orchestration_mode: orchestration.orchestration_mode,
              loop_budget: orchestration.loop_budget,
              confidence_threshold: orchestration.confidence_threshold,
              tool_plan: {
                source: 'ai-proxy.continuation',
                continuation_pass: continuationPass,
                executed_tool_names: currentBatch.map((call: any) => call?.name).filter(Boolean),
              },
            },
          } as const;

          const { data: followUp, error: followUpError } = await this.invokeAIProxyWith429Retry(
            continuationBody as unknown as Record<string, unknown>,
            traceId,
            'continuation'
          );

          if (followUpError) {
            throw followUpError;
          }

          assistantContent = followUp?.content || assistantContent;
          usage = followUp?.usage || usage;
          generatedImages = followUp?.generated_images || generatedImages;
          resolutionStatus = (followUp?.resolution_status as any) || resolutionStatus;
          confidenceScore = typeof followUp?.confidence_score === 'number'
            ? followUp.confidence_score
            : confidenceScore;
          escalationOffer = typeof followUp?.escalation_offer === 'boolean'
            ? followUp.escalation_offer
            : escalationOffer;
          resolutionMeta = followUp?.resolution_meta || resolutionMeta;
          ocrPayload = followUp?.ocr || ocrPayload;

          const followUpPending = Array.isArray(followUp?.pending_tool_calls)
            ? followUp.pending_tool_calls
            : [];
          pendingToolCalls = [...overflow, ...followUpPending];
        } catch (contError) {
          console.warn('[DashAIClient] Tool continuation call failed:', contError);
          const existingContent = String(assistantContent || '').trim();
          const hasCommittedContent =
            existingContent.length > 0 &&
            !/^(ok(?:ay)?|sure|got it|let me|working on|one moment|please wait)\b/i.test(existingContent);
          const lastRequestedToolName = String(
            [...currentBatch].reverse().map((entry: any) => entry?.name).find(Boolean) || ''
          ).trim().toLowerCase();
          const lastToolResult = [...toolResults]
            .reverse()
            .find((entry: any) => {
              const entryName = String(entry?.name || '').trim().toLowerCase();
              if (!entryName) return false;
              if (!lastRequestedToolName) return true;
              return entryName === lastRequestedToolName;
            });
          if (hasCommittedContent) {
            // Preserve a meaningful response that already exists rather than replacing
            // it with a generic tool fallback sentence.
            assistantContent = existingContent;
          } else if (lastToolResult) {
            assistantContent = this.buildToolCompletionFallback(lastToolResult);
          } else if (!String(assistantContent || '').trim()) {
            assistantContent = 'I completed the tool action, but final formatting failed. Check the tool card below.';
          }
          continuationPassOutcome = 'failed';
          pendingToolCalls = [];
          break;
        }
      }

      if (pendingToolCalls.length > 0) {
        continuationLimitReached = true;
        continuationPassOutcome = 'limit_reached';
        resolutionStatus = resolutionStatus || 'needs_clarification';
        escalationOffer = escalationOffer ?? true;
      } else if (continuationPass > 0 && continuationPassOutcome === 'none') {
        continuationPassOutcome = 'completed';
      }

      if (streamFallbackReason !== 'none' && streamFallbackOutcome === 'fallback_started') {
        streamFallbackOutcome = 'fallback_completed';
      }

      const mergedResolutionMeta = (() => {
        const base = resolutionMeta && typeof resolutionMeta === 'object'
          ? { ...(resolutionMeta as Record<string, unknown>) }
          : {};
        if (streamFallbackReason !== 'none') {
          base.stream_fallback_reason = streamFallbackReason;
          base.stream_fallback_outcome = streamFallbackOutcome;
        }
        if (continuationPassOutcome !== 'none') {
          base.continuation_passes_executed = continuationPass;
          base.continuation_pass_outcome = continuationPassOutcome;
        }
        return Object.keys(base).length > 0 ? base : resolutionMeta;
      })();
      resolutionMeta = mergedResolutionMeta;

      if (!data?.success) {
        return {
          content: assistantContent,
          metadata: {
            usage,
            tool_results: toolResults,
            generated_images: generatedImages,
            resolution_status: resolutionStatus,
            confidence_score: confidenceScore,
            escalation_offer: escalationOffer,
            resolution_meta: resolutionMeta,
            ocr: ocrPayload,
            trace_id: traceId,
            continuation_limit_reached: continuationLimitReached,
          },
        };
      }
      
      return { 
        content: assistantContent || data.content, 
        metadata: { 
          usage,
          tool_results: toolResults,
          generated_images: generatedImages,
          resolution_status: resolutionStatus,
          confidence_score: confidenceScore,
          escalation_offer: escalationOffer,
          resolution_meta: resolutionMeta,
          ocr: ocrPayload,
          trace_id: traceId,
          continuation_limit_reached: continuationLimitReached,
        } 
      };
    } catch (error) {
      if (this.isAbortLikeError(error)) {
        throw error;
      }
      console.error('[DashAIClient] AI service call failed:', error);
      return {
        content: 'I ran into a hiccup while preparing your help. Try again, or tell me what you need and I’ll guide you step-by-step.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseEdgeFunctionError(error: unknown): {
    status?: number;
    code?: string;
    message?: string;
    details?: unknown;
  } {
    const err = error as {
      status?: number;
      code?: string;
      message?: string;
      details?: unknown;
      context?: { status?: number; body?: string | object };
    };
    const status =
      (typeof err?.context?.status === 'number' ? err.context.status : undefined) ??
      (typeof err?.status === 'number' ? err.status : undefined);
    const body = err?.context?.body;
    let parsedBody: any = null;

    if (body && typeof body === 'string') {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = { error: body };
      }
    } else if (body && typeof body === 'object') {
      parsedBody = body;
    }

    if (!parsedBody && err?.details && typeof err.details === 'object') {
      parsedBody = err.details;
    }

    const fallbackMessage =
      err?.message ||
      err?.context?.body ||
      'AI service error';

    const parsedError = parsedBody?.error;
    const code =
      (typeof parsedError === 'string' ? parsedError : undefined) ||
      (typeof parsedError?.code === 'string' ? parsedError.code : undefined) ||
      (typeof parsedBody?.code === 'string' ? parsedBody.code : undefined) ||
      (typeof err?.code === 'string' ? err.code : undefined);

    const message =
      (typeof parsedBody?.message === 'string' ? parsedBody.message : undefined) ||
      (typeof parsedError?.message === 'string' ? parsedError.message : undefined) ||
      (typeof parsedError === 'string' ? parsedError : undefined) ||
      fallbackMessage;

    return {
      status,
      code,
      message,
      details: parsedBody?.details || parsedBody || err?.details,
    };
  }

  private getFriendlyErrorMessage(error: {
    status?: number;
    code?: string;
    message?: string;
    details?: any;
  }): string {
    if (error.code === 'quota_exceeded') {
      const quotaInfo = error.details as { usage_count?: number; limit?: number; tier?: string } | undefined;
      if (quotaInfo?.usage_count && quotaInfo?.limit) {
        return `You've used ${quotaInfo.usage_count} of ${quotaInfo.limit} AI requests this month (${quotaInfo.tier || 'Free'} tier). Upgrade your plan for more requests!`;
      }
      return "You've reached your AI usage limit. Upgrade your plan for unlimited access, or contact support to increase your quota.";
    }
    if (error.status === 429) {
      return 'Dash is handling a lot of requests right now. Please try again in a few seconds.';
    }
    if (error.status === 401) {
      return 'Your session expired. Please sign in again to continue.';
    }
    if (error.status === 403) {
      return 'Your account needs to be linked to a school to use Dash AI.';
    }
    if (error.status === 400) {
      if (error.message && typeof error.message === 'string' && error.message.length > 0) {
        return error.message;
      }
      return __DEV__ && error.message
        ? `[Dev] ${error.message}`
        : 'That request could not be processed. If you attached an image, retry (Dash auto-compresses JPG/PNG), or try a clearer scan.';
    }
    if (error.status === 503 || error.code === 'provider_not_configured') {
      return 'Dash AI is temporarily unavailable. Please try again in a moment.';
    }
    if (error.code === 'provider_error' || error.status === 502) {
      return 'Dash is temporarily unavailable. Please try again in a moment.';
    }
    if (error.code === 'streaming_not_supported') {
      return 'Live streaming isn’t available yet. Please try again without voice streaming.';
    }
    return 'Dash is having trouble right now. Please try again in a moment.';
  }
  
  /**
   * Call AI service with streaming support (SSE)
   * 
   * Note: Streaming is not fully supported on React Native due to fetch limitations.
   * For Phase 0, we fall back to parsing full response.
   * 
   * TODO (Phase 2): Implement WebSocket streaming for React Native
   * See: docs/features/DASH_AI_STREAMING_UPGRADE_PLAN.md
   * 
   * References:
   * - Supabase auth getSession: https://supabase.com/docs/reference/javascript/auth-getsession
   * - Fetch streaming: https://developer.mozilla.org/docs/Web/API/Streams_API/Using_readable_streams
   */
  private async callAIServiceStreaming(params: any, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<AIServiceResponse> {
    // Feature flag: Use WebSocket streaming on React Native when enabled
    // Reference: https://reactnative.dev/docs/0.79/platform-specific-code
    const useWebSocket = process.env.EXPO_PUBLIC_USE_WEBSOCKET_STREAMING === 'true';
    
    if (useWebSocket) {
      try {
        return await this.callAIServiceStreamingWS(params, onChunk, signal);
      } catch (error) {
        console.warn('[DashAIClient] WebSocket streaming failed, falling back to SSE:', error);
        // Fall through to SSE implementation below
      }
    }

    // Performance instrumentation (Phase 2)
    // References:
    // - Sentry Performance: https://docs.sentry.io/platforms/react-native/performance/
    // - PostHog Events: https://posthog.com/docs/libraries/react-native
    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let tokenCount = 0;
    const normalizedModel = this.normalizeRequestedModelId(params.model);
    let sawPendingToolCalls = false;
    const pendingToolNames = new Set<string>();
    let streamErrorText: string | null = null;

    const extractDeltaFromStreamEvent = (parsed: any): string | null => {
      const eventType = String(parsed?.type || '').trim().toLowerCase();
      if (eventType === 'pending_tool_calls') {
        sawPendingToolCalls = true;
        const toolCalls = Array.isArray(parsed?.tool_calls) ? parsed.tool_calls : [];
        for (const toolCall of toolCalls) {
          const toolName = String((toolCall as any)?.name || '').trim();
          if (toolName) pendingToolNames.add(toolName);
        }
        return null;
      }

      if (eventType === 'error') {
        const errorMessage = typeof parsed?.error === 'string'
          ? parsed.error
          : String((parsed?.error?.message || parsed?.message || 'Streaming provider error')).trim();
        if (errorMessage) {
          streamErrorText = errorMessage;
        }
        return null;
      }

      const deltaText = typeof parsed?.delta?.text === 'string'
        ? parsed.delta.text
        : typeof parsed?.content === 'string'
          ? parsed.content
          : null;

      return deltaText && deltaText.length > 0 ? deltaText : null;
    };

    const finalizeStreamOrThrow = (accumulatedText: string): AIServiceResponse => {
      if (streamErrorText) {
        if (/requires continuation for tool calls/i.test(streamErrorText)) {
          throw this.createStreamContinuationError(Array.from(pendingToolNames));
        }
        throw new Error(streamErrorText);
      }
      if (sawPendingToolCalls) {
        throw this.createStreamContinuationError(Array.from(pendingToolNames));
      }
      return {
        content: accumulatedText || 'No content extracted from stream',
        metadata: {},
      };
    };

    try {
      const { data: sessionData } = await this.supabaseClient.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      
      if (!accessToken) {
        throw new Error('No auth session for streaming');
      }
      
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('EXPO_PUBLIC_SUPABASE_URL not configured');
      }
      
      const url = `${supabaseUrl}/functions/v1/ai-proxy`;
      
      const userProfile = this.getUserProfile() as any;
      const { role: userRole, scope } = this.normalizeRoleAndScope(userProfile?.role || 'student');
      const userTier = this.resolveUserTier(userProfile);
      const clientToolDefs = this.getClientToolDefs(userRole, userTier);
      const traceId = String((params?.metadata as any)?.trace_id || this.createTraceId('dash_ai_stream'));
      const toolPlan = this.buildToolPlanMetadata(userRole, userTier);
      const orchestration = this.getOrchestrationConfig();
      const enableTools = params.enableTools !== false;

      // Build image payloads for streaming (vision support)
      const streamImages = await this.buildImagePayloads(params.attachments, params.images);
      if (__DEV__ && (Array.isArray(params.attachments) || streamImages.length > 0)) {
        console.log('[DashAIClient] Vision payload (stream)', {
          attachmentCount: Array.isArray(params.attachments) ? params.attachments.length : 0,
          imagePayloadCount: streamImages.length,
          imageMediaTypes: streamImages.map((img) => img.media_type),
          imagePayloadSizes: streamImages.map((img) => img.data?.length || 0),
        });
      }

      const requestBody = JSON.stringify({
        scope: scope,
        service_type: params.serviceType || (params.ocrMode ? 'image_analysis' : 'chat_message'),
        payload: {
          prompt: params.promptText,
          context: params.context || undefined,
          images: streamImages.length > 0 ? streamImages : undefined,
          ocr_mode: params.ocrMode || undefined,
          ocr_task: params.ocrTask || undefined,
          ocr_response_format: params.ocrResponseFormat || undefined,
          model: normalizedModel,
        },
        stream: true,
        enable_tools: enableTools,
        client_tools: enableTools ? clientToolDefs : undefined,
        metadata: {
          role: userRole,
          model: normalizedModel,
          ...(params.metadata || {}),
          trace_id: traceId,
          tool_plan: toolPlan,
          orchestration_mode: orchestration.orchestration_mode,
          loop_budget: orchestration.loop_budget,
          confidence_threshold: orchestration.confidence_threshold,
        }
      });

      // React Native: use XHR progressive loading for real streaming.
      // RN fetch doesn't support ReadableStream properly.
      const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
      if (isReactNative) {
        return await new Promise<AIServiceResponse>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

          let processedLen = 0;
          let accumulated = '';

          const processNewData = (newData: string) => {
            for (const line of newData.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payload);
                const deltaText = extractDeltaFromStreamEvent(parsed);
                if (deltaText) {
                  if (firstTokenTime === null) firstTokenTime = Date.now();
                  tokenCount++;
                  accumulated += deltaText;
                  onChunk(deltaText);
                }
              } catch {
                // Skip malformed SSE lines
              }
            }
          };

          xhr.onreadystatechange = () => {
            if (xhr.readyState >= 3 && xhr.responseText) {
              const newText = xhr.responseText.slice(processedLen);
              if (newText) {
                processedLen = xhr.responseText.length;
                processNewData(newText);
              }
            }
          };

          xhr.onload = () => {
            // Process any remaining data
            if (xhr.responseText.length > processedLen) {
              processNewData(xhr.responseText.slice(processedLen));
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(finalizeStreamOrThrow(accumulated));
              } catch (finalizeError) {
                reject(finalizeError);
              }
            } else {
              if (__DEV__) {
                dashAiDevLog('voice_response_error', {
                  status: xhr.status,
                  message: `Streaming failed: ${xhr.status}`,
                  responsePreview: xhr.responseText?.slice(0, 500),
                  phase: 'streaming_xhr',
                });
              }
              reject(new Error(`Streaming failed: ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('XHR streaming network error'));
          xhr.ontimeout = () => reject(new Error('XHR streaming timeout'));

          if (signal) {
            signal.addEventListener('abort', () => xhr.abort());
          }

          xhr.send(requestBody);
        });
      }

      // Web: use fetch + ReadableStream
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        signal,
        body: requestBody,
      });

      if (!response.ok) {
        const errText = await response.text();
        if (__DEV__) {
          dashAiDevLog('voice_response_error', {
            status: response.status,
            message: `Streaming failed: ${response.status}`,
            responsePreview: errText.slice(0, 500),
            phase: 'streaming_fetch',
          });
        }
        throw new Error(`Streaming failed: ${response.status}`);
      }
      
      // Parse SSE stream (web environment)
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const deltaText = extractDeltaFromStreamEvent(parsed);
              if (!deltaText) continue;
              // Capture first token time
              if (firstTokenTime === null) {
                firstTokenTime = Date.now();
              }
              tokenCount++;
              accumulated += deltaText;
              onChunk(deltaText);
            } catch (e) {
              console.warn('[DashAIClient] Failed to parse SSE chunk:', e);
            }
          }
        }
      }
      
      // Process any remaining data left in the buffer after the stream ends
      if (buffer.trim()) {
        const remainingLine = buffer.trim();
        if (remainingLine.startsWith('data: ')) {
          const data = remainingLine.slice(6).trim();
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const deltaText = extractDeltaFromStreamEvent(parsed);
              if (deltaText) {
                if (firstTokenTime === null) {
                  firstTokenTime = Date.now();
                }
                tokenCount++;
                accumulated += deltaText;
                onChunk(deltaText);
              }
            } catch (e) {
              console.warn('[DashAIClient] Failed to parse remaining SSE buffer:', e);
            }
          }
        }
      }
      
      // Emit performance metrics (production only)
      if (!__DEV__ && firstTokenTime !== null) {
        const totalDuration = Date.now() - startTime;
        const firstTokenLatency = firstTokenTime - startTime;
        
        try {
          console.log('[DashAIClient] Performance metrics:', {
            first_token_ms: firstTokenLatency,
            total_duration_ms: totalDuration,
            token_count: tokenCount,
            platform: 'web',
          });
        } catch (error) {
          console.error('[DashAIClient] Failed to emit metrics:', error);
        }
      }

      return finalizeStreamOrThrow(accumulated);
    } catch (error) {
      const errorCode = String((error as any)?.code || '').toLowerCase();
      if (errorCode === 'stream_requires_continuation') {
        console.info('[DashAIClient] Streaming handoff to non-stream continuation is expected for pending tool calls.');
      } else {
        console.error('[DashAIClient] Streaming failed:', error);
      }
      throw error;
    }
  }

  /**
   * Call AI service with WebSocket streaming (React Native)
   * 
   * Feature flag controlled: EXPO_PUBLIC_USE_WEBSOCKET_STREAMING=true
   * 
   * References:
   * - React Native WebSocket (0.79): https://reactnative.dev/docs/0.79/network#websocket-support
   * - Supabase auth getSession: https://supabase.com/docs/reference/javascript/auth-getsession
   */
  private async callAIServiceStreamingWS(params: any, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<AIServiceResponse> {
    // Performance instrumentation
    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let tokenCount = 0;

    // Get auth token before creating Promise
    const { data: sessionData } = await this.supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    
    if (!accessToken) {
      throw new Error('No auth session for WebSocket streaming');
    }
    
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL not configured');
    }

    const wsImages = await this.buildImagePayloads(params.attachments, params.images);
    const normalizedModel = this.normalizeRequestedModelId(params.model);

    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL
        const wsUrl = `${supabaseUrl.replace('https', 'wss')}/functions/v1/ai-proxy-ws`;
        const profile = this.getUserProfile() as any;
        const { role, scope } = this.normalizeRoleAndScope(profile?.role || 'teacher');
        const userTier = this.resolveUserTier(profile);
        const traceId = String((params?.metadata as any)?.trace_id || this.createTraceId('dash_ai_ws'));
        const toolPlan = this.buildToolPlanMetadata(role, userTier);
        const clientTools = this.getClientToolDefs(role, userTier);
        const orchestration = this.getOrchestrationConfig();
        const enableTools = params.enableTools !== false;
        
        // Create WebSocket connection
        // Reference: https://reactnative.dev/docs/0.79/network#websocket-support
        const ws = new WebSocket(wsUrl);
        let accumulated = '';
        let hasError = false;
        let isSettled = false;
        let sawPendingToolCalls = false;
        const pendingToolNames = new Set<string>();

        const resolveOnce = (result: AIServiceResponse) => {
          if (isSettled) return;
          isSettled = true;
          resolve(result);
        };

        const rejectOnce = (error: Error) => {
          if (isSettled) return;
          hasError = true;
          isSettled = true;
          reject(error);
        };

        // Wire AbortSignal to close WebSocket on cancel
        if (signal) {
          if (signal.aborted) {
            rejectOnce(new Error('Aborted'));
            return;
          }
          signal.addEventListener('abort', () => {
            ws.close();
            rejectOnce(new Error('Aborted'));
          }, { once: true });
        }
        
        ws.onopen = () => {
          // Send request payload
          const payload = {
            scope,
            service_type: params.serviceType || (params.ocrMode ? 'image_analysis' : 'chat_message'),
            payload: {
              prompt: params.promptText,
              context: params.context || undefined,
              images: wsImages.length > 0 ? wsImages : undefined,
              ocr_mode: params.ocrMode || undefined,
              ocr_task: params.ocrTask || undefined,
              ocr_response_format: params.ocrResponseFormat || undefined,
              model: normalizedModel,
            },
            enable_tools: enableTools,
            client_tools: enableTools ? clientTools : undefined,
            metadata: {
              role,
              model: normalizedModel,
              ...(params.metadata || {}),
              trace_id: traceId,
              tool_plan: toolPlan,
              orchestration_mode: orchestration.orchestration_mode,
              loop_budget: orchestration.loop_budget,
              confidence_threshold: orchestration.confidence_threshold,
            }
          };
          
          ws.send(JSON.stringify(payload));
        };
        
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const eventType = String(msg?.type || '').trim().toLowerCase();
            
            if (eventType === 'start') {
              // Stream started
              if (__DEV__) {
                console.log('[DashAIClient] WebSocket stream started');
              }
            } else if (eventType === 'pending_tool_calls') {
              sawPendingToolCalls = true;
              const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
              for (const toolCall of toolCalls) {
                const toolName = String((toolCall as any)?.name || '').trim();
                if (toolName) pendingToolNames.add(toolName);
              }
            } else if (
              (eventType === 'delta' && typeof msg?.text === 'string') ||
              (eventType === 'content_block_delta' && typeof msg?.delta?.text === 'string')
            ) {
              const deltaText = eventType === 'delta' ? msg.text : msg.delta.text;
              // Capture first token time
              if (firstTokenTime === null) {
                firstTokenTime = Date.now();
              }
              tokenCount++;
              accumulated += deltaText;
              onChunk(deltaText);
            } else if (eventType === 'done') {
              // Stream completed
              ws.close();

              if (sawPendingToolCalls) {
                rejectOnce(this.createStreamContinuationError(Array.from(pendingToolNames)));
                return;
              }
              
              // Emit performance metrics (production only)
              if (!__DEV__ && firstTokenTime !== null) {
                const totalDuration = Date.now() - startTime;
                const firstTokenLatency = firstTokenTime - startTime;
                
                try {
                  console.log('[DashAIClient] Performance metrics (WS):', {
                    first_token_ms: firstTokenLatency,
                    total_duration_ms: totalDuration,
                    token_count: tokenCount,
                    platform: 'react-native-ws',
                  });
                } catch (error) {
                  console.error('[DashAIClient] Failed to emit metrics:', error);
                }
              }
              
              resolveOnce({
                content: accumulated || 'No content received from WebSocket stream',
                metadata: {},
              });
            } else if (eventType === 'error') {
              const errorMessage = typeof msg?.error === 'string'
                ? msg.error
                : typeof msg?.message === 'string'
                  ? msg.message
                  : 'WebSocket streaming error';
              rejectOnce(new Error(errorMessage));
            } else if (eventType === 'cancelled') {
              rejectOnce(new Error('Stream cancelled'));
            }
          } catch (e) {
            console.error('[DashAIClient] Failed to parse WebSocket message:', e);
          }
        };
        
        ws.onerror = (error) => {
          if (!isSettled) {
            console.error('[DashAIClient] WebSocket error:', error);
            rejectOnce(new Error('WebSocket connection error'));
          }
        };
        
        ws.onclose = (event) => {
          if (__DEV__) {
            console.log('[DashAIClient] WebSocket closed:', event.code, event.reason);
          }
          if (!hasError && !isSettled && accumulated.length === 0) {
            rejectOnce(new Error('WebSocket closed without receiving data'));
          }
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }
}

export default DashAIClient;
