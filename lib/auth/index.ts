/**
 * EduDash Pro Authentication Module
 * 
 * Comprehensive authentication system with:
 * - Secure password hashing and validation
 * - Role-based access control
 * - Session management with security logging
 * - Student self-registration
 * - Admin-only instructor creation
 * - React Native components and hooks
 */

// Core authentication service
export { AuthService, authService } from './AuthService';
export type {
  LoginCredentials,
  RegisterCredentials,
  CreateInstructorCredentials,
  AuthResponse,
  UserProfile,
  AuthState,
} from './AuthService';

// Redirect URL helpers (forgot-password, email-change)
export {
  getPasswordResetRedirectUrl,
  getEmailChangeRedirectUrl,
} from './authRedirectUrls';
export type { AuthRedirectPlatform } from './authRedirectUrls';

// React hooks for authentication
export {
  useAuth,
  useLogin,
  useRegister,
  useLogout,
  useSession,
  usePermissions,
  useAuthStatus,
  useAutoRefresh,
} from './useAuth';

// React Native components (if components directory exists)
export {
  LoginForm,
  RegisterForm,
  UserProfile as UserProfileComponent,
  AuthGuard,
} from '../../components/auth/AuthComponents';

/**
 * Quick Start Example:
 * 
 * ```typescript
 * // In your React Native component
 * import { useAuth, LoginForm } from './lib/auth';
 * 
 * function App() {
 *   const { authenticated, loading, profile } = useAuth();
 * 
 *   if (loading) return <LoadingScreen />;
 *   if (!authenticated) return <LoginForm />;
 *   
 *   return <MainApp user={profile} />;
 * }
 * 
 * // For API endpoints (in serverless functions)
 * import { AuthAPI } from './lib/auth';
 * 
 * export async function POST(request) {
 *   const credentials = await request.json();
 *   const result = await AuthAPI.login(credentials);
 *   
 *   return new Response(JSON.stringify(result.data), {
 *     status: result.status,
 *     headers: { 'Content-Type': 'application/json' }
 *   });
 * }
 * ```
 */