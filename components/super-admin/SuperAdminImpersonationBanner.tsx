import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { writeSuperAdminAudit } from '@/lib/audit/superAdminAudit';
import { signOutAndRedirect } from '@/lib/authActions';
import { logger } from '@/lib/logger';
import { clearAllNavigationLocks, routeAfterLogin } from '@/lib/routeAfterLogin';
import {
  clearSuperAdminImpersonationSession,
  getSuperAdminImpersonationSession,
  type SuperAdminImpersonationSession,
} from '@/lib/superadmin/impersonation';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { fetchEnhancedUserProfile } from '@/lib/rbac';
import { EnhancedBiometricAuth } from '@/services/EnhancedBiometricAuth';

export function SuperAdminImpersonationBanner() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert, alertProps } = useAlertModal();

  const [session, setSession] = useState<SuperAdminImpersonationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await getSuperAdminImpersonationSession();
      if (!stored) {
        setSession(null);
        return;
      }

      if (user?.id === stored.adminUserId) {
        await clearSuperAdminImpersonationSession();
        setSession(null);
        return;
      }

      if (user?.id === stored.targetUserId) {
        setSession(stored);
        return;
      }

      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const handleManualReturn = useCallback((activeSession: SuperAdminImpersonationSession) => {
    showAlert({
      title: 'Admin sign-in required',
      message:
        'The saved admin session expired, so we need to sign the superadmin back in manually.',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign in',
          onPress: () => {
            signOutAndRedirect({
              clearBiometrics: false,
              resetApp: false,
              redirectTo: `/(auth)/sign-in?switch=1&email=${encodeURIComponent(activeSession.adminEmail)}`,
            }).catch((error) => {
              logger.error('[SuperAdminImpersonationBanner] Manual return failed:', error);
            });
          },
        },
      ],
    });
  }, [showAlert]);

  const restoreAdminSession = useCallback(async (activeSession: SuperAdminImpersonationSession) => {
    setReturning(true);
    try {
      const result = await EnhancedBiometricAuth.restoreSessionForUser(activeSession.adminUserId);
      if (!result.success) {
        if (result.requiresPassword) {
          handleManualReturn(activeSession);
          return;
        }
        throw new Error(result.error || 'Could not restore the admin session.');
      }

      const { data: activeUserData } = await assertSupabase().auth.getUser();
      const activeUser = activeUserData?.user || null;
      if (!activeUser || activeUser.id !== activeSession.adminUserId) {
        throw new Error('The restored session did not match the superadmin account.');
      }

      const nextProfile = await fetchEnhancedUserProfile(activeUser.id).catch(() => null);

      track('superadmin_user_impersonation_return', {
        admin_user_id: activeSession.adminUserId,
        impersonated_user_id: activeSession.targetUserId,
      });

      await writeSuperAdminAudit({
        actorProfileId: activeSession.adminUserId,
        action: 'user_impersonation_end',
        targetId: activeSession.targetUserId,
        targetType: 'user',
        description: `Impersonation ended for ${activeSession.targetEmail}`,
        metadata: {
          impersonated_email: activeSession.targetEmail,
          impersonated_role: activeSession.targetRole,
          return_path: activeSession.returnPath || '/screens/super-admin-users',
        },
      });

      await clearSuperAdminImpersonationSession();
      setSession(null);
      clearAllNavigationLocks();

      if (nextProfile) {
        await routeAfterLogin(activeUser, nextProfile);
      }

      setTimeout(() => {
        router.replace(
          (activeSession.returnPath || '/screens/super-admin-users') as `/${string}`,
        );
      }, 200);
    } catch (error) {
      logger.error('[SuperAdminImpersonationBanner] Return to admin failed:', error);
      showAlert({
        title: 'Return failed',
        message:
          error instanceof Error
            ? error.message
            : 'We could not restore the superadmin session.',
        type: 'error',
      });
    } finally {
      setReturning(false);
    }
  }, [handleManualReturn, showAlert]);

  const confirmReturnToAdmin = useCallback(() => {
    if (!session) return;
    showAlert({
      title: 'Return to Admin',
      message: `Stop impersonating ${session.targetEmail} and switch back to the superadmin account?`,
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Return',
          onPress: () => {
            void restoreAdminSession(session);
          },
        },
      ],
    });
  }, [restoreAdminSession, session, showAlert]);

  if (loading || !session || user?.id !== session.targetUserId) {
    return <AlertModal {...alertProps} />;
  }

  return (
    <>
      <View
        style={[
          styles.wrapper,
          { paddingTop: Platform.OS === 'web' ? 10 : Math.max(insets.top + 8, 12) },
        ]}
      >
        <View
          style={[
            styles.banner,
            {
              backgroundColor: theme.cardBackground || theme.surface || '#0f172a',
              borderColor: theme.primary || '#6366f1',
            },
          ]}
        >
          <View style={styles.copy}>
            <Text style={[styles.title, { color: theme.text || '#ffffff' }]}>
              Impersonation Mode
            </Text>
            <Text style={[styles.message, { color: theme.textSecondary || '#cbd5e1' }]}>
              You are acting as {session.targetEmail}. Any actions here affect the real account.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={returning}
            onPress={confirmReturnToAdmin}
            style={[
              styles.button,
              {
                backgroundColor: theme.primary || '#6366f1',
                opacity: returning ? 0.75 : 1,
              },
            ]}
          >
            {returning ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Return to Admin</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <AlertModal {...alertProps} />
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
  },
  banner: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
  },
  message: {
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    minWidth: 132,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
