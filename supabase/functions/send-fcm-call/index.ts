/**
 * Send FCM Call Edge Function
 * 
 * Sends a high-priority FCM data-only message to wake the callee's Android app
 * when it's killed/closed. This is essential for incoming call functionality.
 * 
 * FCM data-only messages with high priority can wake killed Android apps,
 * whereas Expo push notifications cannot reliably do this.
 * 
 * Requires GOOGLE_SERVICE_ACCOUNT_KEY environment variable containing
 * the Firebase service account JSON (for Admin SDK authentication).
 */

// Deno type declarations for Edge Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// @ts-ignore - Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.12';
import {
  buildSignedJwt,
  exchangeAccessToken,
  loadServiceAccount,
  resolveFirebaseProjectId,
  type AuthErrorCode,
  type FirebaseServiceAccount,
} from './auth-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const serviceAccountLoad = loadServiceAccount((key) => Deno.env.get(key));
const serviceAccount: FirebaseServiceAccount | null = serviceAccountLoad.serviceAccount;
const FIREBASE_PROJECT_ID = resolveFirebaseProjectId(serviceAccount, (key) => Deno.env.get(key));

if (serviceAccountLoad.errorCode) {
  console.error('[SendFCMCall] Service account load issue:', {
    code: serviceAccountLoad.errorCode,
    message: serviceAccountLoad.errorMessage,
  });
}

interface FCMCallRequest {
  callee_user_id: string;
  call_id: string;
  caller_id: string;
  caller_name: string;
  call_type: 'voice' | 'video';
  meeting_url?: string;
}

interface FCMDeliveryResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  messageId?: string;
}

type FailureReason =
  | 'SERVICE_ACCOUNT_PARSE_FAILED'
  | 'PRIVATE_KEY_INVALID'
  | 'ACCESS_TOKEN_EXCHANGE_FAILED'
  | 'NO_ACTIVE_FCM_TOKENS'
  | 'FCM_DELIVERY_FAILED';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function structuredFailure(
  reason: FailureReason,
  callData: Pick<FCMCallRequest, 'call_id' | 'callee_user_id'>,
  attemptedTokens: number,
  errorMessage?: string,
) {
  const failedTokens = attemptedTokens;
  return {
    success: false,
    fallback_to_expo: true,
    fcm_project_id: FIREBASE_PROJECT_ID,
    attempted_tokens: attemptedTokens,
    successful_tokens: 0,
    failed_tokens: failedTokens,
    error_codes: [reason],
    message_ids: [],
    call_id: callData.call_id,
    callee_user_id: callData.callee_user_id,
    fcm_attempted: attemptedTokens,
    fcm_success_count: 0,
    fallback_reason: reason,
    error: errorMessage || reason,
  };
}

/**
 * Get an OAuth2 access token using the service account credentials
 * This is required for FCM HTTP v1 API
 */
async function getAccessToken(): Promise<{
  accessToken: string | null;
  errorCode?: AuthErrorCode;
  errorMessage?: string;
}> {
  if (!serviceAccount) {
    return {
      accessToken: null,
      errorCode: serviceAccountLoad.errorCode || 'SERVICE_ACCOUNT_PARSE_FAILED',
      errorMessage: serviceAccountLoad.errorMessage || 'service_account_missing',
    };
  }

  const jwtResult = await buildSignedJwt(serviceAccount);
  if (!jwtResult.accessToken) {
    return {
      accessToken: null,
      errorCode: jwtResult.errorCode || 'PRIVATE_KEY_INVALID',
      errorMessage: jwtResult.errorMessage || 'jwt_build_failed',
    };
  }

  return await exchangeAccessToken(jwtResult.accessToken);
}

/**
 * Send FCM data message to wake the app
 */
async function sendFCMDataMessage(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  callData: FCMCallRequest
): Promise<FCMDeliveryResult> {
  // FCM HTTP v1 API endpoint
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // Data-only message with high priority
  // This format is critical for waking killed apps:
  // - NO notification field (data-only)
  // - android.priority: "high" 
  // - data fields as strings
  const message = {
    message: {
      token: fcmToken,
      // DATA ONLY - no notification field
      // This ensures HeadlessJS task runs even when app is killed
      data: {
        type: 'incoming_call',
        call_id: callData.call_id,
        callee_id: callData.callee_user_id,
        caller_id: callData.caller_id,
        caller_name: callData.caller_name,
        call_type: callData.call_type,
        meeting_url: callData.meeting_url || '',
        timestamp: Date.now().toString(),
      },
      android: {
        priority: 'high', // Required for waking killed apps
        ttl: '60s', // Call expires after 60 seconds
        // Direct boot mode - can wake device from locked state
        direct_boot_ok: true,
      },
      // APNs config for iOS (if needed in future)
      apns: {
        headers: {
          'apns-priority': '10', // Immediate delivery
          'apns-push-type': 'background',
        },
        payload: {
          aps: {
            'content-available': 1, // Background processing
          },
        },
      },
    },
  };

  console.log('[SendFCMCall] Sending FCM message:', {
    callId: callData.call_id,
    callerName: callData.caller_name,
    callType: callData.call_type,
    tokenPrefix: fcmToken.substring(0, 20) + '...',
  });

  const attemptSend = async (): Promise<Response> =>
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

  try {
    let response = await attemptSend();
    if (!response.ok && response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      response = await attemptSend();
    }
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      response = await attemptSend();
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SendFCMCall] FCM API error:', response.status, errorText);

      try {
        const errorJson = JSON.parse(errorText);
        let errorCode: string | undefined;
        if (Array.isArray(errorJson.error?.details)) {
          const fcmError = errorJson.error.details.find((d: any) => d?.['@type']?.includes('FcmError'));
          if (typeof fcmError?.errorCode === 'string') {
            errorCode = String(fcmError.errorCode).toUpperCase();
          }
        }

        if (!errorCode && typeof errorJson.error?.status === 'string') {
          errorCode = String(errorJson.error.status).toUpperCase();
        }

        return {
          success: false,
          error: errorJson.error?.message || errorText,
          errorCode,
        };
      } catch {
        return { success: false, error: errorText };
      }
    }

    const result = await response.json();
    console.log('[SendFCMCall] ✅ FCM message sent successfully:', result.name);

    return { success: true, messageId: result.name };
  } catch (error) {
    console.error('[SendFCMCall] Failed to send FCM message:', error);
    return { success: false, error: String(error) };
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check endpoint - check URL path or query param
  const url = new URL(req.url);
  const isHealthCheck = url.pathname.endsWith('/health') || 
                        url.pathname.includes('/health') ||
                        url.searchParams.get('health') === 'true';
  
  if (isHealthCheck || req.method === 'GET') {
    // Allow unauthenticated health checks via GET
    return new Response(JSON.stringify({ 
      status: 'ok',
      hasServiceAccount: !!serviceAccount,
      serviceAccountErrorCode: serviceAccountLoad.errorCode || null,
      projectId: FIREBASE_PROJECT_ID,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Verify authentication (only for POST requests)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Create Supabase client to verify user and get FCM token
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: FCMCallRequest = await req.json();
    
    // Validate required fields
    if (!body.callee_user_id || !body.call_id || !body.caller_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: callee_user_id, call_id, caller_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all active Android FCM tokens for the callee (best effort fan-out).
    const { data: devices, error: deviceError } = await supabase
      .from('push_devices')
      .select('fcm_token, platform')
      .eq('user_id', body.callee_user_id)
      .eq('is_active', true)
      .eq('platform', 'android')
      .not('fcm_token', 'is', null)
      .neq('fcm_token', '');

    const allTokens = Array.from(
      new Set(
        (devices || [])
          .map((row: { fcm_token?: string | null }) => row.fcm_token || '')
          .filter((token: string) => token.length > 0),
      ),
    );

    if (deviceError || allTokens.length === 0) {
      console.warn('[SendFCMCall] No active Android FCM tokens for user:', {
        callee_user_id: body.callee_user_id,
        device_error: deviceError ? String(deviceError.message || deviceError) : null,
      });
      return new Response(
        JSON.stringify(
          structuredFailure(
            'NO_ACTIVE_FCM_TOKENS',
            { call_id: body.call_id, callee_user_id: body.callee_user_id },
            0,
            'No active Android FCM tokens for callee',
          ),
        ),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessTokenResult = await getAccessToken();
    const accessToken = accessTokenResult.accessToken;
    if (!accessToken) {
      const failureReason: FailureReason =
        accessTokenResult.errorCode === 'SERVICE_ACCOUNT_PARSE_FAILED'
          ? 'SERVICE_ACCOUNT_PARSE_FAILED'
          : accessTokenResult.errorCode === 'PRIVATE_KEY_INVALID'
          ? 'PRIVATE_KEY_INVALID'
          : 'ACCESS_TOKEN_EXCHANGE_FAILED';
      console.error('[SendFCMCall] Failed to get FCM access token', {
        errorCode: failureReason,
        message: accessTokenResult.errorMessage,
      });
      return new Response(
        JSON.stringify(
          structuredFailure(
            failureReason,
            { call_id: body.call_id, callee_user_id: body.callee_user_id },
            allTokens.length,
            accessTokenResult.errorMessage || 'Failed to get FCM access token',
          ),
        ),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send FCM data message to all known tokens in parallel.
    const results = await Promise.all(
      allTokens.map((token) => sendFCMDataMessage(accessToken, FIREBASE_PROJECT_ID, token, body)),
    );

    const successful = results.filter((result) => result.success);
    const failed = results.filter((result) => !result.success);
    const errorCodeSet = new Set(
      failed
        .map((result) => result.errorCode || '')
        .filter((code) => code.length > 0),
    );
    if (successful.length === 0) {
      errorCodeSet.add('FCM_DELIVERY_FAILED');
    }
    const errorCodes = Array.from(errorCodeSet);
    const messageIds = successful
      .map((result) => result.messageId || '')
      .filter((id) => id.length > 0);

    // Auto-clean invalid tokens.
    const invalidTokenCodes = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND']);
    const invalidTokens = allTokens.filter((_token, index) => {
      const result = results[index];
      return !result.success && !!result.errorCode && invalidTokenCodes.has(result.errorCode);
    });

    if (invalidTokens.length > 0) {
      await supabase
        .from('push_devices')
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq('user_id', body.callee_user_id)
        .in('fcm_token', invalidTokens);
    }

    const structuredResult = {
      success: successful.length > 0,
      fallback_to_expo: successful.length === 0,
      fcm_project_id: FIREBASE_PROJECT_ID,
      attempted_tokens: allTokens.length,
      successful_tokens: successful.length,
      failed_tokens: failed.length,
      error_codes: errorCodes,
      message_ids: messageIds,
      call_id: body.call_id,
      callee_user_id: body.callee_user_id,
      fcm_attempted: allTokens.length,
      fcm_success_count: successful.length,
      fallback_reason: successful.length > 0 ? null : ('FCM_DELIVERY_FAILED' as FailureReason),
      error: successful.length > 0 ? undefined : (failed[0]?.error || 'FCM_DELIVERY_FAILED'),
    };

    return new Response(
      JSON.stringify(structuredResult),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('[SendFCMCall] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
