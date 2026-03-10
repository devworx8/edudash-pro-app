describe('session initialization timeout handling', () => {
  const storedSession = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) - 60,
    user_id: 'user-1',
    email: 'parent@example.com',
  };

  const storedProfile = {
    id: 'user-1',
    role: 'parent',
  };

  const loadAuthModule = () => {
    jest.resetModules();

    jest.doMock('@/lib/supabase', () => ({
      assertSupabase: jest.fn(),
    }));

    jest.doMock('@/lib/analytics', () => ({
      track: jest.fn(),
      identifyUser: jest.fn(),
    }));

    jest.doMock('@/lib/featureFlags', () => ({
      identifyUserForFlags: jest.fn(),
    }));

    jest.doMock('@/lib/monitoring', () => ({
      reportError: jest.fn(),
    }));

    jest.doMock('@/lib/authDebug', () => ({
      authDebug: jest.fn(),
    }));

    jest.doMock('@/lib/session/storage', () => ({
      storeSession: jest.fn(),
      storeProfile: jest.fn(),
      getStoredSession: jest.fn().mockResolvedValue(storedSession),
      getStoredProfile: jest.fn().mockResolvedValue(storedProfile),
      clearStoredData: jest.fn(),
      clearAppSessionKeys: jest.fn(),
      resetPasswordRecoveryFlag: jest.fn(),
    }));

    jest.doMock('@/lib/session/profile', () => ({
      fetchUserProfile: jest.fn(),
      buildMinimalProfileFromUser: jest.fn(),
    }));

    jest.doMock('@/lib/session/refresh', () => ({
      needsRefresh: jest.fn().mockReturnValue(true),
      refreshSession: jest.fn().mockResolvedValue({
        access_token: 'late-access-token',
        refresh_token: 'late-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user_id: 'user-1',
        email: 'parent@example.com',
      }),
      setupAutoRefresh: jest.fn(),
      clearAutoRefreshTimer: jest.fn(),
      resetPendingRefresh: jest.fn(),
    }));

    jest.doMock('@/lib/session/helpers', () => {
      const actual = jest.requireActual('@/lib/session/helpers');
      return {
        ...actual,
        withTimeoutMarker: jest.fn().mockResolvedValue({ result: null, timedOut: true }),
      };
    });

    return require('@/lib/session/auth') as typeof import('@/lib/session/auth');
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('continues boot using the stored session when refresh times out', async () => {
    const { initializeSession } = loadAuthModule();
    const { setupAutoRefresh } = require('@/lib/session/refresh') as typeof import('@/lib/session/refresh');

    const result = await initializeSession();

    expect(result).toEqual({
      session: storedSession,
      profile: storedProfile,
    });
    expect(setupAutoRefresh).toHaveBeenCalledWith(storedSession);
  });
});
