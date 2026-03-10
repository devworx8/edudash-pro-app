/**
 * Enhanced Teacher Invite Accept Screen
 * 
 * Improvements:
 * - Uses enhanced TeacherInviteService with typed errors
 * - Pre-validation before submission
 * - Better error handling with specific error codes
 * - Loading states with progress indication
 * - Retry logic for failed submissions
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { setActiveOrganization } from '@/components/account/OrganizationSwitcher';
import { setPendingTeacherInvite } from '@/lib/utils/teacherInvitePending';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import {
  TeacherInviteService,
  InviteError,
} from '@/lib/services/teacherInviteService.enhanced';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { useWindowDimensions } from 'react-native';

/** Parse token and email from a pasted invite URL */
function parseInviteUrl(pasted: string): { token: string; email: string } | null {
  const s = String(pasted || '').trim();
  if (!s) return null;
  try {
    const url = s.startsWith('http') ? s : `https://dummy.com${s.startsWith('/') ? s : `/${s}`}`;
    const parsed = new URL(url);
    const token = parsed.searchParams.get('token') || '';
    const email = parsed.searchParams.get('email') || '';
    if (token && email) return { token, email };
    return null;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): { title: string; message: string } {
  if (error instanceof InviteError) {
    switch (error.code) {
      case 'INVALID_TOKEN':
        return {
          title: 'Invalid Invite',
          message: 'This invite link is invalid. Please check the link from your email.',
        };
      case 'EXPIRED':
        return {
          title: 'Invite Expired',
          message: 'This invite has expired. Please request a new invite from your school.',
        };
      case 'ALREADY_USED':
        return {
          title: 'Already Used',
          message: 'This invite has already been used. If you need access, please contact your school.',
        };
      case 'EMAIL_MISMATCH':
        return {
          title: 'Email Mismatch',
          message: 'The email you entered does not match the invite. Please use the email that received the invite.',
        };
      case 'RATE_LIMITED':
        return {
          title: 'Too Many Attempts',
          message: 'Too many attempts. Please wait a moment and try again.',
        };
      default:
        return {
          title: 'Error',
          message: error.message || 'An unexpected error occurred.',
        };
    }
  }
  return {
    title: 'Error',
    message: (error as Error)?.message || 'Failed to accept invite. Please try again.',
  };
}

export default function TeacherInviteAcceptScreenEnhanced() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const styles = createStyles(theme);
  const isCompact = width < 768;

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    schoolName?: string;
    invitedBy?: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const { showAlert, alertProps } = useAlertModal();

  // Prefill from deep link params
  const params = useLocalSearchParams<{ token?: string; email?: string }>();

  useEffect(() => {
    if (typeof params?.token === 'string' && params.token) {
      setToken(String(params.token));
    }
    if (typeof params?.email === 'string' && params.email) {
      setEmail(String(params.email));
    }
  }, [params?.token, params?.email]);

  // Pre-validate invite when token and email are entered
  useEffect(() => {
    const validateInvite = async () => {
      if (!token.trim() || !email.trim()) {
        setValidationResult(null);
        return;
      }

      setValidating(true);
      try {
        const result = await TeacherInviteService.validateInvite(token.trim(), email.trim());
        if (result.valid && result.invite) {
          setValidationResult({
            valid: true,
            schoolName: result.invite.school_name,
            invitedBy: result.invite.invited_by_name,
          });
        } else {
          setValidationResult({ valid: false });
        }
      } catch {
        setValidationResult({ valid: false });
      } finally {
        setValidating(false);
      }
    };

    const timeoutId = setTimeout(validateInvite, 500);
    return () => clearTimeout(timeoutId);
  }, [token, email]);

  const handleLinkInputChange = useCallback((text: string) => {
    const parsed = parseInviteUrl(text);
    if (parsed) {
      setToken(parsed.token);
      setEmail(parsed.email);
    }
  }, []);

  const handleSignIn = async () => {
    if (token.trim() && email.trim()) {
      await setPendingTeacherInvite({ token: token.trim(), email: email.trim() });
    }
    router.replace({ pathname: '/(auth)/sign-in' as any, params: { email: email.trim() } } as any);
  };

  const handleSignUp = async () => {
    if (token.trim() && email.trim()) {
      await setPendingTeacherInvite({ token: token.trim(), email: email.trim() });
    }
    router.replace({ pathname: '/(auth)/teacher-signup' as any, params: { email: email.trim() } } as any);
  };

  const onAccept = async () => {
    if (!user?.id) {
      showAlert({
        title: 'Sign in required',
        message: 'Please sign in or create an account to accept this invite.',
        type: 'warning',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: handleSignIn },
          { text: 'Create Account', onPress: handleSignUp },
        ],
      });
      return;
    }

    if (!token.trim() || !email.trim()) {
      showAlert({ title: 'Missing info', message: 'Enter the invite token and email.', type: 'warning' });
      return;
    }

    try {
      setSubmitting(true);

      const result = await TeacherInviteService.accept({
        token: token.trim(),
        authUserId: user.id,
        email: email.trim(),
      });

      if (result.status === 'already_member') {
        showAlert({
          title: 'Already a Member',
          message: 'You are already a member of this school.',
          type: 'success',
        });
        router.replace('/screens/teacher-dashboard');
        return;
      }

      if (result.status === 'requires_switch') {
        showAlert({
          title: 'Invite accepted',
          message: `You are already linked to another school. Switch now to complete principal approval for ${result.schoolName || 'this school'}?`,
          type: 'info',
          buttons: [
            {
              text: 'Later',
              style: 'cancel',
              onPress: () => router.replace('/screens/account'),
            },
            {
              text: 'Switch Now',
              onPress: async () => {
                try {
                  const supabase = assertSupabase();
                  const { data: school } = await supabase
                    .from('preschools')
                    .select('id, name, logo_url')
                    .eq('id', result.schoolId)
                    .maybeSingle();

                  await supabase
                    .from('profiles')
                    .update({
                      role: 'teacher',
                      preschool_id: result.schoolId,
                      organization_id: result.schoolId,
                    })
                    .eq('id', user.id);

                  await setActiveOrganization(
                    {
                      id: result.schoolId,
                      name: school?.name || 'School',
                      logo_url: school?.logo_url || undefined,
                      type: 'preschool',
                      role: 'teacher',
                    },
                    user.id
                  );

                  router.replace('/screens/teacher-approval-pending');
                } catch (e: any) {
                  showAlert({ title: 'Error', message: e?.message || 'Failed to switch schools', type: 'error' });
                }
              },
            },
          ],
        });
        return;
      }

      showAlert({
        title: 'Invite accepted',
        message: 'Your invite was accepted. The principal will review and activate your account.',
        type: 'success',
      });
      router.replace('/screens/teacher-approval-pending');
    } catch (e: any) {
      const { title, message } = getErrorMessage(e);
      showAlert({ title, message, type: 'error' });
      setRetryCount((prev) => prev + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardView}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Stack.Screen options={{ title: 'Accept Teacher Invite', headerShown: !isCompact }} />

        <View style={styles.iconContainer}>
          <Ionicons name="mail-open-outline" size={48} color={theme.primary} />
        </View>

        <Text style={styles.title}>
          {user?.id ? 'Accept your invite' : 'Accept Teacher Invite'}
        </Text>

        <Text style={styles.helper}>
          {user?.id
            ? 'Paste the link from your invitation email, or enter token and email below.'
            : 'Sign in or create an account to continue. We\'ll keep your invite token ready.'}
        </Text>

        {/* Link Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Paste invite link (from email)</Text>
          <TextInput
            style={styles.input}
            onChangeText={handleLinkInputChange}
            autoCapitalize="none"
            placeholder="Paste full link – we'll extract your invite details"
            placeholderTextColor={theme.textMuted}
          />
        </View>

        {/* Manual Entry */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or enter manually</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Token</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Invite token"
            placeholderTextColor={theme.textMuted}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Your email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            placeholder="you@example.com"
            placeholderTextColor={theme.textMuted}
          />
        </View>

        {/* Validation Status */}
        {validating && (
          <View style={styles.validationContainer}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.validationText}>Validating invite...</Text>
          </View>
        )}

        {validationResult && !validating && (
          <View
            style={[
              styles.validationContainer,
              validationResult.valid ? styles.validationSuccess : styles.validationError,
            ]}
          >
            <Ionicons
              name={validationResult.valid ? 'checkmark-circle' : 'close-circle'}
              size={20}
              color={validationResult.valid ? '#10b981' : '#ef4444'}
            />
            <Text
              style={[
                styles.validationText,
                validationResult.valid ? styles.validationTextSuccess : styles.validationTextError,
              ]}
            >
              {validationResult.valid
                ? `Invite from ${validationResult.schoolName || 'School'}${validationResult.invitedBy ? ` (invited by ${validationResult.invitedBy})` : ''}`
                : 'Invalid or expired invite'}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        {user?.id ? (
          <TouchableOpacity
            disabled={submitting || validating}
            style={[
              styles.primaryButton,
              (submitting || validating) && styles.buttonDisabled,
            ]}
            onPress={onAccept}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.primaryButtonText}>Accept Invite</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.authButtons}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleSignIn}>
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleSignUp}>
              <Text style={styles.secondaryButtonText}>Create Account</Text>
            </TouchableOpacity>
          </View>
        )}

        {retryCount > 0 && (
          <TouchableOpacity style={styles.retryHint} onPress={onAccept}>
            <Ionicons name="refresh-outline" size={16} color={theme.textMuted} />
            <Text style={styles.retryText}>Tap to try again</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </KeyboardAvoidingView>
  );

  if (!isCompact) {
    return (
      <DesktopLayout>
        <View style={styles.container}>{renderForm()}</View>
      </DesktopLayout>
    );
  }

  return <View style={styles.container}>{renderForm()}</View>;
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      padding: 24,
      maxWidth: 480,
      width: '100%',
      alignSelf: 'center',
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '700',
      marginBottom: 8,
      textAlign: 'center',
    },
    helper: {
      color: theme.textSecondary,
      fontSize: 14,
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 20,
    },
    inputGroup: {
      marginBottom: 16,
    },
    label: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 6,
    },
    input: {
      backgroundColor: theme.card,
      color: theme.text,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      fontSize: 16,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.border,
    },
    dividerText: {
      color: theme.textMuted,
      fontSize: 12,
      marginHorizontal: 12,
    },
    validationContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    validationSuccess: {
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    validationError: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    validationText: {
      marginLeft: 8,
      fontSize: 14,
      color: theme.textSecondary,
    },
    validationTextSuccess: {
      color: '#10b981',
    },
    validationTextError: {
      color: '#ef4444',
    },
    primaryButton: {
      backgroundColor: theme.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      color: '#000',
      fontWeight: '700',
      fontSize: 16,
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryButtonText: {
      color: theme.text,
      fontWeight: '600',
      fontSize: 16,
    },
    authButtons: {
      marginTop: 8,
    },
    retryHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      padding: 8,
    },
    retryText: {
      color: theme.textMuted,
      marginLeft: 4,
      fontSize: 14,
    },
  });