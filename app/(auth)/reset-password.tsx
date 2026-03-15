/**
 * Reset Password Screen - Mobile App
 * 
 * This screen handles password reset after user clicks the
 * recovery link from their email. The session is already
 * established by auth-callback.tsx before redirecting here.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { setPasswordRecoveryInProgress } from '@/lib/sessionManager';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/components/marketing/GlassCard';
import { GradientButton } from '@/components/marketing/GradientButton';
import { marketingTokens } from '@/components/marketing/tokens';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { logger } from '@/lib/logger';

const TAG = 'ResetPassword';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Check if user has a valid recovery session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = assertSupabase();

        // Check existing recovery session (set by auth-callback/reset route handler).
        setPasswordRecoveryInProgress(true);
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[ResetPassword] Session error:', error);
          setPasswordRecoveryInProgress(false);
          setValidSession(false);
          return;
        }

        if (session && session.user) {
          setValidSession(true);
          setUserEmail(session.user.email || null);
        } else {
          logger.info(TAG, 'No session found');
          setPasswordRecoveryInProgress(false);
          setValidSession(false);
        }
      } catch (e) {
        console.error('[ResetPassword] Error checking session:', e);
        setPasswordRecoveryInProgress(false);
        setValidSession(false);
      }
    };

    checkSession();
    
    // Cleanup: clear the flag when component unmounts
    return () => {
      logger.debug(TAG, 'Component unmounting, clearing recovery flag');
      setPasswordRecoveryInProgress(false);
    };
  }, []);

  const handleResetPassword = async () => {
    // Validate passwords
    if (!password || !confirmPassword) {
      showAlert({
        title: 'Error',
        message: 'Please fill in all fields',
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }

    if (password !== confirmPassword) {
      showAlert({
        title: 'Error',
        message: 'Passwords do not match',
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }

    if (password.length < 8) {
      showAlert({
        title: 'Error',
        message: 'Password must be at least 8 characters long',
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }

    // Check password strength requirements
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecial) {
      showAlert({
        title: 'Password Too Weak',
        message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (e.g. !@#$).',
        type: 'warning',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }

    setLoading(true);
    try {
      const supabase = assertSupabase();
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        throw error;
      }

      // Clear the recovery flag now that password has been updated
      setPasswordRecoveryInProgress(false);
      logger.info(TAG, 'Password updated, cleared recovery flag');

      showAlert({
        title: 'Password Updated',
        message: 'Your password has been successfully updated. You can now sign in with your new password.',
        type: 'success',
        buttons: [
          {
            text: 'Sign In',
            style: 'default',
            onPress: () => router.replace('/(auth)/sign-in'),
          },
        ],
      });
    } catch (e: unknown) {
      console.error('[ResetPassword] Error:', e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to update password. Please try again.';
      showAlert({
        title: 'Error',
        message: errorMessage,
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    router.replace('/(auth)/sign-in');
  };

  // Loading state while checking session
  if (validSession === null) {
    return (
      <LinearGradient
        colors={[marketingTokens.colors.bg.base, marketingTokens.colors.bg.elevated]}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={marketingTokens.colors.accent.cyan400} />
            <Text style={styles.loadingText}>Verifying your session...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Invalid session - redirect to forgot password
  if (validSession === false) {
    return (
      <LinearGradient
        colors={[marketingTokens.colors.bg.base, marketingTokens.colors.bg.elevated]}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <Stack.Screen
            options={{
              title: 'Reset Password',
              headerShown: false,
            }}
          />
          <View style={styles.errorContainer}>
            <View style={styles.errorIconContainer}>
              <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
            </View>
            <Text style={styles.errorTitle}>Invalid or Expired Link</Text>
            <Text style={styles.errorText}>
              This password reset link has expired or is invalid.
              Please request a new password reset.
            </Text>
            <TouchableOpacity
              style={styles.errorButton}
              onPress={() => router.replace('/(auth)/forgot-password')}
            >
              <Text style={styles.errorButtonText}>Request New Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backLink}
              onPress={handleGoBack}
            >
              <Text style={styles.backLinkText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Derived requirement flags — used both in the checklist and to gate the submit button
  const reqLength = password.length >= 8;
  const reqUpper = /[A-Z]/.test(password);
  const reqLower = /[a-z]/.test(password);
  const reqNumber = /[0-9]/.test(password);
  const reqSpecial = /[^A-Za-z0-9]/.test(password);
  const reqMatch = password.length > 0 && password === confirmPassword;
  const allRequirementsMet = reqLength && reqUpper && reqLower && reqNumber && reqSpecial && reqMatch;

  // Valid session - show password reset form
  return (
    <LinearGradient
      colors={[marketingTokens.colors.bg.base, marketingTokens.colors.bg.elevated]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen
          options={{
            title: 'Reset Password',
            headerShown: false,
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleGoBack}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Form Card */}
            <GlassCard style={styles.card}>
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={[marketingTokens.colors.accent.cyan400, marketingTokens.colors.accent.indigo500]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconGradient}
                >
                  <Ionicons name="lock-closed" size={32} color="#fff" />
                </LinearGradient>
              </View>

              <Text style={styles.title}>Create New Password</Text>
              
              {userEmail && (
                <Text style={styles.subtitle}>
                  Setting password for: {userEmail}
                </Text>
              )}

              <Text style={styles.instructions}>
                Please enter your new password. Make sure it's at least 8 characters
                long and includes uppercase, lowercase, and numbers.
              </Text>

              {/* New Password */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="rgba(255,255,255,0.5)"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter new password"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color="rgba(255,255,255,0.5)"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="rgba(255,255,255,0.5)"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm new password"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleResetPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color="rgba(255,255,255,0.5)"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Password requirements */}
              <View style={styles.requirements}>
                <PasswordRequirement met={reqLength} text="At least 8 characters" />
                <PasswordRequirement met={reqUpper} text="One uppercase letter (A–Z)" />
                <PasswordRequirement met={reqLower} text="One lowercase letter (a–z)" />
                <PasswordRequirement met={reqNumber} text="One number (0–9)" />
                <PasswordRequirement met={reqSpecial} text="One special character (!@#$…)" />
                <PasswordRequirement met={reqMatch} text="Passwords match" />
              </View>

              {/* Submit Button */}
              <GradientButton
                label={loading ? 'Updating...' : 'Update Password'}
                onPress={handleResetPassword}
                disabled={loading || !allRequirementsMet}
                loading={loading}
                style={styles.submitButton}
              />
            </GlassCard>
          </ScrollView>
        </KeyboardAvoidingView>
        <AlertModal {...alertProps} />
      </SafeAreaView>
    </LinearGradient>
  );
}

// Password requirement indicator component
function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.requirementRow}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={met ? '#10B981' : 'rgba(255,255,255,0.3)'}
      />
      <Text style={[styles.requirementText, met && styles.requirementMet]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorIconContainer: {
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  errorButton: {
    backgroundColor: marketingTokens.colors.accent.cyan400,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  backLink: {
    padding: 12,
  },
  backLinkText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  card: {
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: marketingTokens.colors.accent.cyan400,
    textAlign: 'center',
    marginBottom: 8,
  },
  instructions: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    color: '#fff',
    fontSize: 16,
  },
  eyeButton: {
    padding: 8,
  },
  requirements: {
    marginTop: 8,
    marginBottom: 24,
    gap: 8,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requirementText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  requirementMet: {
    color: '#10B981',
  },
  submitButton: {
    height: 52,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
