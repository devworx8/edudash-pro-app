type CallType = 'voice' | 'video';

export interface SendIncomingCallPushParams {
  accessToken: string;
  calleeUserId: string;
  callId: string;
  callerId: string;
  callerName: string;
  callType: CallType;
  meetingUrl?: string;
  threadId?: string | null;
  source?: string;
}

interface SendFcmCallResponse {
  success?: boolean;
  fallback_to_expo?: boolean;
  attempted_tokens?: number;
  successful_tokens?: number;
  error_codes?: string[];
  error?: string;
}

export interface SendIncomingCallPushResult {
  fcmSuccessCount: number;
  expoFallbackSent: boolean;
  expoPlatformFilter?: Array<'android' | 'ios' | 'web'>;
  errorCodes?: string[];
}

function toPositiveInt(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function normalizeErrorCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((code) => String(code || '').trim())
    .filter((code) => code.length > 0);
}

export async function sendIncomingCallPush(
  params: SendIncomingCallPushParams,
): Promise<SendIncomingCallPushResult> {
  const tag = params.source || 'CallPush';
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const defaultResult: SendIncomingCallPushResult = {
    fcmSuccessCount: 0,
    expoFallbackSent: false,
    errorCodes: [],
  };

  if (params.calleeUserId === params.callerId) {
    console.warn(`[${tag}] Blocking self-targeted incoming call push`, {
      call_id: params.callId,
      user_id: params.callerId,
    });
    return {
      ...defaultResult,
      errorCodes: ['SELF_CALL_BLOCKED'],
    };
  }

  if (!supabaseUrl) {
    console.warn(`[${tag}] Missing EXPO_PUBLIC_SUPABASE_URL; skipping call push dispatch`);
    return defaultResult;
  }

  const callPayload = {
    callee_user_id: params.calleeUserId,
    call_id: params.callId,
    caller_id: params.callerId,
    caller_name: params.callerName,
    call_type: params.callType,
    meeting_url: params.meetingUrl,
    thread_id: params.threadId,
  };

  let fcmResponse: SendFcmCallResponse | null = null;
  let fcmErrorCodes: string[] = [];

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-fcm-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify(callPayload),
    });

    const rawText = await response.text();
    try {
      fcmResponse = rawText ? (JSON.parse(rawText) as SendFcmCallResponse) : {};
    } catch {
      fcmResponse = { success: false, error: rawText || 'invalid_json' };
    }

    fcmErrorCodes = normalizeErrorCodes(fcmResponse?.error_codes);
    if (!response.ok) {
      console.warn(`[${tag}] send-fcm-call non-200`, {
        call_id: params.callId,
        status: response.status,
        error: fcmResponse?.error,
      });
    }
  } catch (error) {
    console.warn(`[${tag}] send-fcm-call request failed`, {
      call_id: params.callId,
      error: String(error),
    });
    fcmResponse = { success: false, error: String(error), fallback_to_expo: true };
  }

  const fcmSuccessCount = toPositiveInt(fcmResponse?.successful_tokens);
  const explicitFallback = fcmResponse?.fallback_to_expo === true;
  const shouldSkipAndroidExpo = fcmSuccessCount > 0 && !explicitFallback;
  const platformFilter: Array<'android' | 'ios' | 'web'> | undefined = shouldSkipAndroidExpo
    ? ['ios', 'web']
    : undefined;

  let dispatcherSent = false;
  try {
    const dispatcherBody: Record<string, unknown> = {
      event_type: 'incoming_call',
      user_ids: [params.calleeUserId],
      call_id: params.callId,
      callee_id: params.calleeUserId,
      caller_id: params.callerId,
      caller_name: params.callerName,
      call_type: params.callType,
      meeting_url: params.meetingUrl,
      thread_id: params.threadId,
      custom_payload: {
        callee_id: params.calleeUserId,
      },
    };

    if (platformFilter) {
      dispatcherBody.platform_filter = platformFilter;
    }

    const dispatcherResponse = await fetch(`${supabaseUrl}/functions/v1/notifications-dispatcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify(dispatcherBody),
    });

    if (dispatcherResponse.ok) {
      dispatcherSent = true;
    } else {
      const responseText = await dispatcherResponse.text();
      console.warn(`[${tag}] notifications-dispatcher failed`, {
        call_id: params.callId,
        status: dispatcherResponse.status,
        response: responseText?.slice(0, 240),
      });
    }
  } catch (error) {
    console.warn(`[${tag}] notifications-dispatcher request failed`, {
      call_id: params.callId,
      error: String(error),
    });
  }

  const result: SendIncomingCallPushResult = {
    fcmSuccessCount,
    expoFallbackSent: !shouldSkipAndroidExpo && dispatcherSent,
    errorCodes: fcmErrorCodes,
  };

  if (platformFilter) {
    result.expoPlatformFilter = platformFilter;
  }

  return result;
}
