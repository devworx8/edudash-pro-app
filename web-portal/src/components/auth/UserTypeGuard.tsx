'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserType, getDashboardRoute } from '@/lib/hooks/useUserType';

interface UserTypeGuardProps {
  children: React.ReactNode;
  requiredUserType?: 'standalone' | 'affiliated';
  requiredRole?: 'parent' | 'teacher' | 'principal' | 'superadmin';
  redirectTo?: string;
}

/**
 * Component to guard routes based on user type (standalone vs affiliated)
 * 
 * Usage:
 * 
 * // For standalone-only routes
 * <UserTypeGuard requiredUserType="standalone" requiredRole="parent">
 *   <StandaloneParentDashboard />
 * </UserTypeGuard>
 * 
 * // For affiliated-only routes
 * <UserTypeGuard requiredUserType="affiliated" requiredRole="parent">
 *   <AffiliatedParentDashboard />
 * </UserTypeGuard>
 */
export function UserTypeGuard({
  children,
  requiredUserType,
  requiredRole,
  redirectTo,
}: UserTypeGuardProps) {
  const { profile, loading } = useUserType();
  const router = useRouter();

  useEffect(() => {
    if (loading || !profile) return;

    // Check role requirement
    if (requiredRole && profile.role !== requiredRole) {
      // Redirect to appropriate dashboard for user's actual role
      const correctRoute = getDashboardRoute(profile.role, profile.isAffiliated);
      router.push(correctRoute);
      return;
    }

    // Check user type requirement
    if (requiredUserType) {
      if (requiredUserType === 'standalone' && profile.isAffiliated) {
        // Standalone route accessed by affiliated user - redirect to affiliated dashboard
        const correctRoute = redirectTo || getDashboardRoute(profile.role, true);
        router.push(correctRoute);
        return;
      }

      if (requiredUserType === 'affiliated' && profile.isStandalone) {
        // Affiliated route accessed by standalone user - redirect to standalone dashboard
        const correctRoute = redirectTo || getDashboardRoute(profile.role, false);
        router.push(correctRoute);
        return;
      }
    }
  }, [loading, profile, requiredUserType, requiredRole, redirectTo, router]);

  // Show loading state
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
      }}>
        <div style={{ textAlign: 'center', color: '#e2e8f0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎓</div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show error if no profile
  if (!profile) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
      }}>
        <div style={{ textAlign: 'center', color: '#e2e8f0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p>Please sign in to continue</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
