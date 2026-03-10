import { renderHook, waitFor } from '@testing-library/react-native/pure';
import { useAuthGuard } from '@/hooks/useRouteGuard';

let mockPathname = '/';
let mockSearchParams: Record<string, string | string[] | undefined> = {};
let mockRootNavigationState: { key?: string } | undefined = { key: 'root-ready' };

const mockReplace = jest.fn();
const mockUseAuth = jest.fn();
const mockIsSigningOut = jest.fn(() => false);
const mockIsAccountSwitchInProgress = jest.fn(() => false);
const mockIsRecoveryFlag = jest.fn(() => false);
const mockGetDashboardRouteForRole = jest.fn((..._args: any[]) => '/screens/parent-dashboard');

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useLocalSearchParams: () => mockSearchParams,
  useGlobalSearchParams: () => mockSearchParams,
  useRootNavigationState: () => mockRootNavigationState,
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/authActions', () => ({
  isSignOutInProgress: () => mockIsSigningOut(),
  isAccountSwitchInProgress: () => mockIsAccountSwitchInProgress(),
  isAccountSwitchPending: () => false,
}));

jest.mock('@/lib/routeAfterLogin', () => ({
  isNavigationLocked: () => false,
}));

jest.mock('@/lib/authDebug', () => ({
  authDebug: jest.fn(),
}));

jest.mock('@/lib/sessionManager', () => ({
  isPasswordRecoveryInProgress: () => mockIsRecoveryFlag(),
}));

jest.mock('@/lib/schoolTypeResolver', () => ({
  resolveExplicitSchoolTypeFromProfile: () => null,
  resolveOrganizationId: () => null,
  resolveSchoolTypeFromProfile: () => null,
}));

jest.mock('@/lib/dashboard/routeMatrix', () => ({
  getDashboardRouteForRole: (...args: any[]) => mockGetDashboardRouteForRole(...args),
  isDashboardRouteMismatch: () => false,
}));

jest.mock('@/lib/dashboard/dashboardRoutingTelemetry', () => ({
  trackDashboardRouteMismatch: jest.fn(),
  trackDashboardRouteResolution: jest.fn(),
}));

describe('useAuthGuard recovery routing behavior', () => {
  const authenticatedState = {
    user: { id: 'user-1', user_metadata: { role: 'parent' } },
    loading: false,
    profile: { id: 'user-1', role: 'parent', organization_id: null },
    profileLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/';
    mockSearchParams = {};
    mockRootNavigationState = { key: 'root-ready' };
    mockUseAuth.mockReturnValue(authenticatedState);
    mockIsSigningOut.mockReturnValue(false);
    mockIsAccountSwitchInProgress.mockReturnValue(false);
    mockIsRecoveryFlag.mockReturnValue(false);
    mockGetDashboardRouteForRole.mockReturnValue('/screens/parent-dashboard');
  });

  it('does not auto-redirect when authenticated user is on auth-callback', async () => {
    mockPathname = '/auth-callback';

    renderHook(() => useAuthGuard());

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('still redirects authenticated user from sign-in to dashboard', async () => {
    mockPathname = '/(auth)/sign-in';

    renderHook(() => useAuthGuard());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/screens/parent-dashboard');
    });
  });

  it('does not redirect on auth route when password recovery flag is active', async () => {
    mockPathname = '/(auth)/sign-in';
    mockIsRecoveryFlag.mockReturnValue(true);

    renderHook(() => useAuthGuard());

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('waits for root navigation readiness before redirecting from auth routes', async () => {
    mockPathname = '/(auth)/sign-in';
    mockRootNavigationState = undefined;

    const { rerender } = renderHook(() => useAuthGuard());

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });

    mockRootNavigationState = { key: 'root-ready' };
    rerender({} as never);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/screens/parent-dashboard');
    });
  });
});
