import { normalizeServiceType, getModelQuotaWeight } from '../config.ts';

/** Fire-and-forget usage recording after streaming completes. */
export function recordStreamingUsage(params: {
  supabase: any;
  userId: string;
  profile: { organization_id: unknown; preschool_id: unknown };
  serviceType: string | undefined;
  metadata: Record<string, unknown> | undefined;
  scope: string | undefined;
  model: string | undefined;
  tokensIn: number;
  tokensOut: number;
  requestedModel?: string | null;
}): void {
  const { supabase, userId, profile, serviceType, metadata, scope, model, tokensIn, tokensOut, requestedModel } = params;
  const featureUsed = normalizeServiceType(serviceType);
  const orgId = profile.organization_id || profile.preschool_id || null;
  const promise = (async () => {
    await supabase.rpc('record_ai_usage', {
      p_user_id: userId,
      p_feature_used: featureUsed,
      p_model_used: model || 'unknown',
      p_tokens_used: tokensIn + tokensOut,
      p_request_tokens: tokensIn,
      p_response_tokens: tokensOut,
      p_success: true,
      p_metadata: { scope, organization_id: orgId, streaming: true, request_metadata: metadata || {} },
    });
    await supabase.rpc('increment_ai_usage', {
      p_user_id: userId,
      p_request_type: featureUsed,
      p_status: 'success',
      p_metadata: { scope, organization_id: orgId },
      p_weight: getModelQuotaWeight(model || requestedModel),
    });
  })();
  promise.catch((e: unknown) => console.warn('[ai-proxy] Streaming usage recording failed (non-fatal):', e));
}
