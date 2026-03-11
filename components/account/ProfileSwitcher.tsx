/**
 * ProfileSwitcher - Multi-account switcher component
 * 
 * Allows users to switch between stored biometric accounts without signing out.
 * Uses EnhancedBiometricAuth for multi-account storage and session restoration.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { EnhancedBiometricAuth } from '@/services/EnhancedBiometricAuth';
import { BiometricAuthService } from '@/services/BiometricAuthService';
import { router, usePathname } from 'expo-router';
import { track } from '@/lib/analytics';
import { assertSupabase } from '@/lib/supabase';
import { clearAllNavigationLocks } from '@/lib/routeAfterLogin';
import { routeAfterLogin } from '@/lib/routeAfterLogin';
import { signOutAndRedirect, setAccountSwitchInProgress, setAccountSwitchPending } from '@/lib/authActions';
import { reactivateUserTokens } from '@/lib/pushTokenUtils';
import { registerPushDevice } from '@/lib/notifications';
import { MAX_BIOMETRIC_ACCOUNTS } from '@/services/biometricStorage';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { fetchEnhancedUserProfile } from '@/lib/rbac';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export interface StoredAccount {
  userId: string;
  email: string;
  lastUsed: string;
  expiresAt: string;
  isActive?: boolean;
}

interface ProfileSwitcherProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback after successful account switch */
  onAccountSwitched?: (account: StoredAccount) => void;
  /** Show "Add Account" button */
  showAddAccount?: boolean;
}

export function ProfileSwitcher({
  visible,
  onClose,
  onAccountSwitched,
  showAddAccount = true,
}: ProfileSwitcherProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const { showAlert, alertProps } = useAlertModal();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const routeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (routeFallbackTimerRef.current) {
        clearTimeout(routeFallbackTimerRef.current);
        routeFallbackTimerRef.current = null;
      }
      setAccountSwitchInProgress(false);
    };
  }, []);

  // Load stored biometric accounts
  const loadAccounts = useCallback(async () => {
    let capabilitiesResolved = false;
    try {
      setLoading(true);

      // Ensure currently signed-in account is present in quick-switch storage.
      if (user?.id && user?.email) {
        try {
          const { getCurrentSession } = await import('@/lib/sessionManager');
          const currentSession = await getCurrentSession();
          await EnhancedBiometricAuth.storeBiometricSession(
            user.id,
            user.email,
            profile || undefined,
            currentSession?.refresh_token,
          );
        } catch (storeErr) {
          if (__DEV__) {
            console.warn(
              '[ProfileSwitcher] Failed to persist active account before loading list:',
              storeErr,
            );
          }
        }
      }

      // Check biometric availability (non-blocking for account list rendering).
      try {
        const capabilities = await BiometricAuthService.checkCapabilities();
        setBiometricAvailable(capabilities.isAvailable && capabilities.isEnrolled);
        capabilitiesResolved = true;
      } catch (capErr) {
        if (__DEV__) {
          console.warn('[ProfileSwitcher] Biometric capability check failed:', capErr);
        }
      }

      // Get stored accounts
      const storedAccounts = await EnhancedBiometricAuth.getBiometricAccounts();
      
      // Mark current user as active
      const accountsWithActive = storedAccounts.map(acc => ({
        ...acc,
        isActive: acc.userId === user?.id,
      }));

      // Absolute fallback: always show currently signed-in account in switcher.
      if (user?.id && !accountsWithActive.some((acc) => acc.userId === user.id)) {
        accountsWithActive.unshift({
          userId: user.id,
          email: user.email || 'Current account',
          lastUsed: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        });
      }

      // Sort: active first, then by last used
      accountsWithActive.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      });

      setAccounts(accountsWithActive);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      setAccounts([]);
    } finally {
      if (!capabilitiesResolved) {
        setBiometricAvailable(false);
      }
      setLoading(false);
    }
  }, [profile, user?.email, user?.id]);

  useEffect(() => {
    if (visible) {
      loadAccounts();
    }
  }, [visible, loadAccounts]);

  // Switch to a different account
  const handleSwitchAccount = useCallback(async (account: StoredAccount) => {
    if (account.isActive) {
      onClose();
      return;
    }

    let deferSwitchCleanupToRouteFallback = false;
    try {
      setSwitching(account.userId);
      
      track('account.switch_attempt', {
        from_user_id: user?.id,
        to_user_id: account.userId,
        method: biometricAvailable ? 'biometric' : 'token',
      });
      if (__DEV__) {
        console.log('[AccountSwitch] Start', {
          from: user?.id,
          to: account.userId,
          method: biometricAvailable ? 'biometric' : 'token',
          path: pathnameRef.current,
        });
      }

      // Use biometric auth when available, otherwise restore via stored refresh token.
      // Token-based restore is safe — the user is already authenticated on this device.
      // Flag so AuthContext skips SIGNED_OUT cleanup when Supabase emits it during session replace.
      setAccountSwitchInProgress(true);
      const result = biometricAvailable
        ? await EnhancedBiometricAuth.authenticateWithBiometricForUser(account.userId)
        : await EnhancedBiometricAuth.restoreSessionForUser(account.userId);

      if (__DEV__) {
        console.log('[AccountSwitch] Result', {
          success: result.success,
          sessionRestored: result.sessionRestored,
          to: account.userId,
          error: result.error ?? null,
          path: pathnameRef.current,
        });
      }
      if (!result.success) {
        track('account.switch_failed', {
          from_user_id: user?.id,
          to_user_id: account.userId,
          method: biometricAvailable ? 'biometric' : 'token',
          reason: result.reason || 'restore_error',
          requires_password: !!result.requiresPassword,
        });
        showAlert({
          title: t('account.switch_failed', { defaultValue: 'Switch Failed' }),
          message: result.error || t('account.biometric_failed', { defaultValue: 'Biometric authentication failed' }),
          type: 'error',
          buttons: result.requiresPassword
            ? [
                { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                {
                  text: t('account.sign_in_manually', { defaultValue: 'Sign in' }),
                  style: 'default',
                  onPress: () => {
                    onClose();
                    signOutAndRedirect({
                      clearBiometrics: false,
                      resetApp: false,
                      redirectTo: `/(auth)/sign-in?switch=1&email=${encodeURIComponent(account.email)}`,
                    });
                  },
                },
              ]
            : [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'default' }],
        });
        return;
      }

      track('account.switch_success', {
        from_user_id: user?.id,
        to_user_id: account.userId,
        session_restored: result.sessionRestored,
      });
      if (__DEV__) {
        console.log('[AccountSwitch] Success', {
          to: account.userId,
          sessionRestored: result.sessionRestored,
          path: pathnameRef.current,
        });
      }

      onClose();
      onAccountSwitched?.(account);

      clearAllNavigationLocks();

      // Reactivate push tokens for switched user so they receive notifications
      try {
        await reactivateUserTokens(account.userId);
        const supabase = assertSupabase();
        await registerPushDevice(supabase, { id: account.userId, email: account.email });
      } catch (pushErr) {
        console.warn('[ProfileSwitcher] Push token reactivation failed (non-fatal):', pushErr);
      }

      // Route handoff:
      // Prefer auth pipeline, but when user remains on account/auth screens immediately
      // after successful restore, proactively resolve dashboard route.
      const currentPath = pathnameRef.current || '';
      const shouldForceRoute =
        currentPath.includes('/screens/account') ||
        currentPath.includes('/(auth)/sign-in') ||
        currentPath.includes('/sign-in');
      if (__DEV__) {
        console.log('[AccountSwitch] Route handoff decision', {
          currentPath,
          shouldForceRoute,
          expectedUserId: account.userId,
        });
      }
      if (shouldForceRoute) {
        try {
          const supabase = assertSupabase();
          const { data: activeUserData } = await supabase.auth.getUser();
          const activeUser = activeUserData?.user || null;
          if (activeUser?.id === account.userId) {
            const nextProfile = await fetchEnhancedUserProfile(activeUser.id).catch(() => null);
            await routeAfterLogin(activeUser, nextProfile);
            if (__DEV__) {
              console.log('[AccountSwitch] Route handoff applied', {
                userId: activeUser.id,
                currentPath,
              });
            }
          }
        } catch (routeErr) {
          console.warn('[AccountSwitch] Immediate route handoff failed:', routeErr);
        }
      }

      // Fallback router handoff:
      // In some account-switch races the auth event updates session/profile but route
      // does not advance. If user is still on account/auth screens after a short delay,
      // force route resolution once.
      if (routeFallbackTimerRef.current) {
        clearTimeout(routeFallbackTimerRef.current);
      }
      deferSwitchCleanupToRouteFallback = true;
      routeFallbackTimerRef.current = setTimeout(async () => {
        try {
          const supabase = assertSupabase();
          const { data: activeUserData } = await supabase.auth.getUser();
          const activeUser = activeUserData?.user || null;
          const currentPath = pathnameRef.current || '';
          const stuckPath =
            currentPath.includes('/screens/account') ||
            currentPath.includes('/(auth)/sign-in') ||
            currentPath.includes('/sign-in');

          if (__DEV__) {
            console.log('[AccountSwitch] Route fallback check', {
              expectedUserId: account.userId,
              activeUserId: activeUser?.id || null,
              currentPath,
              stuckPath,
            });
          }

          if (!activeUser?.id || activeUser.id !== account.userId || !stuckPath) {
            return;
          }

          const nextProfile = await fetchEnhancedUserProfile(activeUser.id).catch(() => null);
          await routeAfterLogin(activeUser, nextProfile);
          if (__DEV__) {
            console.log('[AccountSwitch] Route fallback invoked', {
              userId: activeUser.id,
              pathBefore: currentPath,
            });
          }
        } catch (routeErr) {
          console.warn('[AccountSwitch] Route fallback failed:', routeErr);
        } finally {
          routeFallbackTimerRef.current = null;
          setAccountSwitchInProgress(false);
          deferSwitchCleanupToRouteFallback = false;
        }
      }, 1200);
    } catch (error) {
      track('account.switch_failed', {
        from_user_id: user?.id,
        to_user_id: account.userId,
        method: biometricAvailable ? 'biometric' : 'token',
        reason: 'restore_error',
        requires_password: false,
      });
      console.error('Account switch error:', error);
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('account.switch_error', { defaultValue: 'Failed to switch account. Please try again.' }),
        type: 'error',
        buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'default' }],
      });
    } finally {
      if (!deferSwitchCleanupToRouteFallback) {
        setAccountSwitchInProgress(false);
      }
      setSwitching(null);
    }
  }, [user?.id, onClose, onAccountSwitched, t, biometricAvailable, showAlert]);

  // Remove an account from stored list
  const handleRemoveAccount = useCallback(async (account: StoredAccount) => {
    if (account.isActive) {
      showAlert({
        title: t('account.cannot_remove_active', { defaultValue: 'Cannot Remove' }),
        message: t('account.cannot_remove_active_message', { defaultValue: 'You cannot remove the currently active account.' }),
        type: 'warning',
        buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'default' }],
      });
      return;
    }

    showAlert({
      title: t('account.remove_account', { defaultValue: 'Remove Account' }),
      message: t('account.remove_account_confirm', { 
        defaultValue: `Remove ${account.email} from quick switch? You can add it back by signing in again.`,
        email: account.email 
      }),
      type: 'warning',
      buttons: [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.remove', { defaultValue: 'Remove' }),
          style: 'destructive',
          onPress: async () => {
            let globalRevokeStatus:
              | 'revoked_global'
              | 'token_missing'
              | 'token_invalid'
              | 'wrong_user'
              | 'error' = 'error';
            let globalRevokeError: string | undefined;
            try {
              track('account.remove.global_revoke_attempt', {
                target_user_id: account.userId,
              });
              const revokeResult =
                await EnhancedBiometricAuth.revokeSavedAccountSessionsGlobally(
                  account.userId,
                );
              globalRevokeStatus = revokeResult.globalRevokeStatus;
              globalRevokeError = revokeResult.error;
              track('account.remove.global_revoke_result', {
                target_user_id: account.userId,
                status: globalRevokeStatus,
                error: globalRevokeError ?? null,
              });
            } catch (error) {
              globalRevokeStatus = 'error';
              globalRevokeError = String(
                (error as any)?.message || 'Global revoke failed',
              );
              track('account.remove.global_revoke_result', {
                target_user_id: account.userId,
                status: globalRevokeStatus,
                error: globalRevokeError,
              });
            }

            try {
              await EnhancedBiometricAuth.removeBiometricSession(account.userId);
              track('account.removed_from_switcher', {
                user_id: account.userId,
                global_revoke_status: globalRevokeStatus,
              });
              await loadAccounts();
            } catch (error) {
              console.error('Failed to remove account:', error);
            }

            if (globalRevokeStatus !== 'revoked_global') {
              showAlert({
                title: t('account.removed_local_only', {
                  defaultValue: 'Removed on this device',
                }),
                message: t('account.removed_local_only_message', {
                  defaultValue:
                    'This account was removed from your saved list here. To fully sign it out everywhere, sign in to that account with password and sign out globally.',
                }),
                type: 'warning',
                buttons: [
                  {
                    text: t('common.ok', { defaultValue: 'OK' }),
                    style: 'default',
                  },
                  {
                    text: t('account.sign_in_manually', { defaultValue: 'Sign in' }),
                    style: 'default',
                    onPress: () => {
                      onClose();
                      signOutAndRedirect({
                        clearBiometrics: false,
                        resetApp: false,
                        redirectTo: `/(auth)/sign-in?switch=1&email=${encodeURIComponent(account.email)}`,
                      });
                    },
                  },
                ],
              });
            }
          },
        },
      ],
    });
  }, [t, loadAccounts, showAlert, onClose]);

  // Add new account — navigate to sign-in WITHOUT signing out.
  // Supabase replaces the session when signInWithPassword is called for a
  // different user, so the current user's refresh token stays valid in the
  // server-side token table. Signing out first would invalidate it.
  const handleAddAccount = useCallback(async () => {
    // Persist the CURRENT user's session so they appear in the quick-switch
    // list after the new sign-in completes.
    if (user?.id && user?.email) {
      try {
        const { getCurrentSession } = await import('@/lib/sessionManager');
        const currentSession = await getCurrentSession();
        await EnhancedBiometricAuth.storeBiometricSession(
          user.id,
          user.email,
          profile || undefined,
          currentSession?.refresh_token,
        );
      } catch (storeErr) {
        if (__DEV__) console.warn('[ProfileSwitcher] Failed to store current account before add:', storeErr);
      }
    }
    onClose();
    // Set synchronous flag BEFORE navigation so the route guard
    // won't redirect us back to the dashboard before the URL
    // search params propagate.
    setAccountSwitchPending();
    // Navigate with replace — removes old dashboard from back stack so
    // users can't press back into a stale/wrong-user dashboard.
    router.replace('/(auth)/sign-in?switch=1&addAccount=1' as any);
  }, [onClose, user?.id, user?.email, profile]);

  // Format last used date
  const formatLastUsed = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('time.just_now', { defaultValue: 'Just now' });
    if (diffMins < 60) return t('time.minutes_ago', { defaultValue: '{{count}} min ago', count: diffMins });
    if (diffHours < 24) return t('time.hours_ago', { defaultValue: '{{count}}h ago', count: diffHours });
    if (diffDays < 7) return t('time.days_ago', { defaultValue: '{{count}}d ago', count: diffDays });
    return date.toLocaleDateString();
  };

  // Get initials from email
  const getInitials = (email: string): string => {
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const handleSwitchWithPassword = useCallback((account: StoredAccount) => {
    onClose();
    setAccountSwitchPending();
    router.replace(`/(auth)/sign-in?switch=1&email=${encodeURIComponent(account.email)}` as any);
  }, [onClose]);

  const renderAccountItem = ({ item }: { item: StoredAccount }) => {
    const isSwitching = switching === item.userId;
    
    return (
      <View
        style={[
          styles.accountItem,
          { backgroundColor: theme.surface },
          item.isActive && { borderColor: theme.primary, borderWidth: 2 },
        ]}
      >
        <TouchableOpacity
          style={styles.accountItemMain}
          onPress={() => handleSwitchAccount(item)}
          onLongPress={() => handleRemoveAccount(item)}
          disabled={isSwitching}
          activeOpacity={0.7}
        >
          <View style={[styles.accountAvatar, { backgroundColor: theme.primary + '30' }]}>
            <Text style={[styles.avatarText, { color: theme.primary }]}>
              {getInitials(item.email)}
            </Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={[styles.accountEmail, { color: theme.text }]} numberOfLines={1}>
              {item.email}
            </Text>
            <Text style={[styles.accountMeta, { color: theme.textSecondary }]}>
              {item.isActive 
                ? t('account.active_now', { defaultValue: 'Active now' })
                : formatLastUsed(item.lastUsed)
              }
            </Text>
          </View>
        </TouchableOpacity>

        {/* Status or actions - separate so account actions remain tappable */}
        {isSwitching ? (
          <EduDashSpinner size="small" color={theme.primary} />
        ) : item.isActive ? (
          <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
        ) : (
          <View style={styles.accountActions}>
            {!biometricAvailable ? (
              <TouchableOpacity
                style={[styles.usePasswordButton, { backgroundColor: theme.surfaceVariant }]}
                onPress={() => handleSwitchWithPassword(item)}
              >
                <Ionicons name="lock-open-outline" size={18} color={theme.primary} />
                <Text style={[styles.usePasswordText, { color: theme.primary }]}>
                  {t('account.use_password_to_switch', { defaultValue: 'Use password' })}
                </Text>
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            )}
            <TouchableOpacity
              style={[styles.removeAccountButton, { backgroundColor: theme.surfaceVariant }]}
              onPress={() => handleRemoveAccount(item)}
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('account.remove_account', { defaultValue: 'Remove account' })}
            >
              <Ionicons name="trash-outline" size={16} color={theme.error || '#ff6b6b'} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {t('account.no_accounts', { defaultValue: 'No Saved Accounts' })}
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        {t('account.no_accounts_hint', { defaultValue: 'Sign in with another account to enable quick switching' })}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdropTouchable} onPress={onClose} activeOpacity={1} />
        
        <View style={[styles.container, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}>
          {/* Handle bar */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: theme.textSecondary + '40' }]} />
          </View>
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>
              {t('account.switch_account', { defaultValue: 'Switch Account' })}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {biometricAvailable
                ? t('account.switch_account_desc', {
                    defaultValue: `Tap an account to switch instantly (up to ${MAX_BIOMETRIC_ACCOUNTS} saved accounts).`,
                  })
                : t('account.switch_account_desc_no_biometric', {
                    defaultValue: 'Tap to try quick switch, or use password to sign in to an account.',
                  })}
            </Text>
            <Text style={[styles.debugText, { color: theme.textSecondary }]}>
              Saved accounts: {accounts.length}/{MAX_BIOMETRIC_ACCOUNTS}
              {user?.email ? ` • Active: ${user.email}` : ''}
            </Text>
          </View>

          {/* Account list - wrapped in flex container so FlatList gets height */}
          <View style={styles.listWrapper}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <EduDashSpinner size="large" color={theme.primary} />
              </View>
            ) : accounts.length === 0 ? (
              renderEmptyState()
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              >
                {accounts.map(item => (
                  <React.Fragment key={item.userId}>
                    {renderAccountItem({ item } as any)}
                  </React.Fragment>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Add account button - hidden when at max (3) */}
          {showAddAccount && accounts.length < MAX_BIOMETRIC_ACCOUNTS && (
            <TouchableOpacity
              style={[styles.addAccountButton, { backgroundColor: theme.surface }]}
              onPress={handleAddAccount}
            >
              <Ionicons name="add-circle-outline" size={24} color={theme.primary} />
              <Text style={[styles.addAccountText, { color: theme.primary }]}>
                {t('account.add_account', { defaultValue: 'Add Another Account' })}
              </Text>
            </TouchableOpacity>
          )}

          {/* Cancel button */}
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: theme.surface }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, { color: theme.text }]}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Text>
          </TouchableOpacity>

          {/* Help text for long press */}
          {accounts.length > 1 && (
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              {t('account.long_press_hint', {
                defaultValue: 'Use the bin icon or long press an account to remove it',
              })}
            </Text>
          )}
        </View>
        <AlertModal {...alertProps} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    height: '75%',
  },
  listWrapper: {
    flex: 1,
    minHeight: 180,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  debugText: {
    fontSize: 11,
    marginTop: 6,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  accountItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  accountInfo: {
    flex: 1,
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  accountMeta: {
    fontSize: 12,
  },
  usePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  usePasswordText: {
    fontSize: 13,
    fontWeight: '600',
  },
  accountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeAccountButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  addAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  addAccountText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 8,
  },
});

export default ProfileSwitcher;
