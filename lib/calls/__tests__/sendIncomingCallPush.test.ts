import { sendIncomingCallPush } from '@/lib/calls/sendIncomingCallPush';

type FetchResponseShape = {
  ok: boolean;
  status?: number;
  text: () => Promise<string>;
};

function mockResponse(body: unknown, ok = true, status = 200): FetchResponseShape {
  return {
    ok,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('sendIncomingCallPush', () => {
  const originalFetch = global.fetch;
  const originalSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  });

  it('skips android Expo fallback when FCM succeeds and filters to ios/web', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(mockResponse({ success: true, successful_tokens: 2, error_codes: [] }))
      .mockResolvedValueOnce(mockResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendIncomingCallPush({
      accessToken: 'token',
      calleeUserId: 'callee',
      callId: 'call_1',
      callerId: 'caller',
      callerName: 'Caller',
      callType: 'voice',
      source: 'TestVoice',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const dispatcherBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body || '{}'));
    expect(dispatcherBody.platform_filter).toEqual(['ios', 'web']);
    expect(result.fcmSuccessCount).toBe(2);
    expect(result.expoFallbackSent).toBe(false);
    expect(result.expoPlatformFilter).toEqual(['ios', 'web']);
  });

  it('sends Expo fallback to all platforms when FCM has zero successful tokens', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          success: false,
          fallback_to_expo: true,
          successful_tokens: 0,
          error_codes: ['NO_ACTIVE_FCM_TOKENS'],
        }),
      )
      .mockResolvedValueOnce(mockResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendIncomingCallPush({
      accessToken: 'token',
      calleeUserId: 'callee',
      callId: 'call_2',
      callerId: 'caller',
      callerName: 'Caller',
      callType: 'video',
      threadId: 'thread_1',
      source: 'TestVideo',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const dispatcherBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body || '{}'));
    expect(dispatcherBody.platform_filter).toBeUndefined();
    expect(result.fcmSuccessCount).toBe(0);
    expect(result.expoFallbackSent).toBe(true);
    expect(result.errorCodes).toEqual(['NO_ACTIVE_FCM_TOKENS']);
  });

  it('falls back to Expo when send-fcm-call request fails', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('network_down'))
      .mockResolvedValueOnce(mockResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendIncomingCallPush({
      accessToken: 'token',
      calleeUserId: 'callee',
      callId: 'call_3',
      callerId: 'caller',
      callerName: 'Caller',
      callType: 'voice',
      source: 'TestFallback',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const dispatcherBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body || '{}'));
    expect(dispatcherBody.platform_filter).toBeUndefined();
    expect(result.fcmSuccessCount).toBe(0);
    expect(result.expoFallbackSent).toBe(true);
  });

  it('keeps Android Expo fallback enabled when send-fcm-call requests fallback explicitly', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          success: true,
          successful_tokens: 1,
          fallback_to_expo: true,
          error_codes: ['FCM_DELIVERY_FAILED'],
        }),
      )
      .mockResolvedValueOnce(mockResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendIncomingCallPush({
      accessToken: 'token',
      calleeUserId: 'callee',
      callId: 'call_4',
      callerId: 'caller',
      callerName: 'Caller',
      callType: 'voice',
      source: 'TestFallbackPreference',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const dispatcherBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body || '{}'));
    expect(dispatcherBody.platform_filter).toBeUndefined();
    expect(result.fcmSuccessCount).toBe(1);
    expect(result.expoFallbackSent).toBe(true);
  });

  it('blocks self-targeted incoming call push dispatch', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendIncomingCallPush({
      accessToken: 'token',
      calleeUserId: 'same-user',
      callId: 'call_5',
      callerId: 'same-user',
      callerName: 'Caller',
      callType: 'voice',
      source: 'TestSelfBlock',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.fcmSuccessCount).toBe(0);
    expect(result.expoFallbackSent).toBe(false);
    expect(result.errorCodes).toEqual(['SELF_CALL_BLOCKED']);
  });
});
