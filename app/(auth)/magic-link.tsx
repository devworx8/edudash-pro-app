import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView, KeyboardAvoidingView } from "react-native";
import { Stack, router } from "expo-router";
import { useTheme } from "@/contexts/ThemeContext";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { marketingTokens } from '@/components/marketing/tokens';
import { GlassCard } from '@/components/marketing/GlassCard';
import { GradientButton } from '@/components/marketing/GradientButton';
import { supabase } from '@/lib/supabase';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { buildEduDashWebUrl } from '@/lib/config/urls';

// Get proper redirect URL based on platform
const getRedirectUrl = (path: string) => {
  if (Platform.OS === 'web') {
    return `${window.location.origin}/${path}`;
  }
  return buildEduDashWebUrl(path);
};

export default function MagicLinkScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleMagicLink = async () => {
    if (!email) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('auth.magic_link.enter_email', { defaultValue: 'Please enter your email address' }),
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('auth.magic_link.invalid_email', { defaultValue: 'Please enter a valid email address' }),
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }

    setLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: getRedirectUrl('auth-callback'),
          shouldCreateUser: false, // Only allow existing users to sign in with magic link
        },
      });

      if (error) {
        // Handle specific errors
        if (error.message.includes('User not found') || error.message.includes('Signups not allowed')) {
          showAlert({
            title: t('common.error', { defaultValue: 'Error' }),
            message: t('auth.magic_link.user_not_found', { defaultValue: 'No account found with this email. Please contact your school administrator.' }),
            type: 'error',
            buttons: [{ text: 'OK', style: 'default' }],
          });
        } else {
          showAlert({
            title: t('common.error', { defaultValue: 'Error' }),
            message: error.message,
            type: 'error',
            buttons: [{ text: 'OK', style: 'default' }],
          });
        }
      } else {
        setEmailSent(true);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : t('common.unexpected_error', { defaultValue: 'An unexpected error occurred' });
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: errorMessage,
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendLink = () => {
    setEmailSent(false);
    handleMagicLink();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={marketingTokens.gradients.background}
        style={styles.gradient}
      >
        <Stack.Screen 
          options={{ 
            headerShown: false,
          }} 
        />
        
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.container}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back Button */}
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color={marketingTokens.colors.fg.primary} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={marketingTokens.gradients.primary}
                  style={styles.iconGradient}
                >
                  <Ionicons name="mail" size={40} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.title}>
                {t('auth.magic_link.title', { defaultValue: 'Sign In with Email Link' })}
              </Text>
              <Text style={styles.subtitle}>
                {t('auth.magic_link.subtitle', { defaultValue: 'No password needed! We\'ll send you a secure sign-in link.' })}
              </Text>
            </View>

            {/* Form Card */}
            <GlassCard style={styles.formCard}>
              {!emailSent ? (
                <>
                  <View style={styles.inputContainer}>
                    <Ionicons 
                      name="mail-outline" 
                      size={20} 
                      color={marketingTokens.colors.fg.tertiary} 
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t('auth.magic_link.email_placeholder', { defaultValue: 'Enter your email' })}
                      placeholderTextColor={marketingTokens.colors.fg.tertiary}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      editable={!loading}
                    />
                  </View>

                  <GradientButton
                    label={loading 
                      ? t('common.sending', { defaultValue: 'Sending...' })
                      : t('auth.magic_link.send_link', { defaultValue: 'Send Sign-In Link' })
                    }
                    onPress={handleMagicLink}
                    disabled={loading}
                    loading={loading}
                    style={styles.button}
                  />

                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle" size={18} color={marketingTokens.colors.accent.blue500} />
                    <Text style={styles.infoText}>
                      {t('auth.magic_link.info', { 
                        defaultValue: 'Magic Link is for existing users only. If you don\'t have an account, ask your school to register you first.' 
                      })}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.successContainer}>
                  <View style={styles.successIconContainer}>
                    <Ionicons name="checkmark-circle" size={60} color={marketingTokens.colors.accent.green400} />
                  </View>
                  <Text style={styles.successTitle}>
                    {t('auth.magic_link.success_title', { defaultValue: 'Check Your Email!' })}
                  </Text>
                  <Text style={styles.successText}>
                    {t('auth.magic_link.success_message', { 
                      defaultValue: 'We\'ve sent a sign-in link to:' 
                    })}
                  </Text>
                  <Text style={styles.emailText}>{email}</Text>
                  <Text style={styles.successHint}>
                    {t('auth.magic_link.success_hint', { 
                      defaultValue: 'Click the link in your email to sign in. The link expires in 1 hour.' 
                    })}
                  </Text>

                  <View style={styles.divider} />

                  <Text style={styles.noEmailText}>
                    {t('auth.magic_link.no_email', { defaultValue: 'Didn\'t receive the email?' })}
                  </Text>
                  <TouchableOpacity onPress={handleResendLink} disabled={loading}>
                    <Text style={styles.resendLink}>
                      {loading 
                        ? t('common.sending', { defaultValue: 'Sending...' })
                        : t('auth.magic_link.resend', { defaultValue: 'Resend sign-in link' })
                      }
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.tipsContainer}>
                    <Text style={styles.tipsTitle}>
                      {t('auth.magic_link.tips_title', { defaultValue: 'Tips:' })}
                    </Text>
                    <Text style={styles.tipText}>• {t('auth.magic_link.tip_spam', { defaultValue: 'Check your spam/junk folder' })}</Text>
                    <Text style={styles.tipText}>• {t('auth.magic_link.tip_wait', { defaultValue: 'Wait a few minutes and try again' })}</Text>
                    <Text style={styles.tipText}>• {t('auth.magic_link.tip_correct', { defaultValue: 'Make sure the email address is correct' })}</Text>
                  </View>
                </View>
              )}
            </GlassCard>

            {/* Alternative Options */}
            <View style={styles.alternativeContainer}>
              <Text style={styles.alternativeText}>
                {t('auth.magic_link.or_sign_in', { defaultValue: 'Or sign in with' })}
              </Text>
              <TouchableOpacity 
                style={styles.alternativeLink}
                onPress={() => router.push('/(auth)/sign-in')}
              >
                <Ionicons name="lock-closed-outline" size={16} color={marketingTokens.colors.accent.cyan400} />
                <Text style={styles.alternativeLinkText}>
                  {t('auth.magic_link.password_signin', { defaultValue: 'Email & Password' })}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: marketingTokens.colors.bg.base,
  },
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: marketingTokens.spacing.lg,
    paddingTop: marketingTokens.spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: marketingTokens.spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: marketingTokens.spacing.xl,
  },
  iconContainer: {
    marginBottom: marketingTokens.spacing.md,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: marketingTokens.colors.fg.primary,
    textAlign: 'center',
    marginBottom: marketingTokens.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: marketingTokens.colors.fg.secondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  formCard: {
    padding: marketingTokens.spacing.lg,
    marginBottom: marketingTokens.spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: marketingTokens.radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: marketingTokens.spacing.md,
    paddingHorizontal: marketingTokens.spacing.md,
  },
  inputIcon: {
    marginRight: marketingTokens.spacing.sm,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: marketingTokens.colors.fg.primary,
  },
  button: {
    marginTop: marketingTokens.spacing.sm,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: marketingTokens.radii.md,
    padding: marketingTokens.spacing.md,
    marginTop: marketingTokens.spacing.lg,
    gap: marketingTokens.spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: marketingTokens.colors.fg.secondary,
    lineHeight: 18,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: marketingTokens.spacing.md,
  },
  successIconContainer: {
    marginBottom: marketingTokens.spacing.md,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: marketingTokens.colors.fg.primary,
    marginBottom: marketingTokens.spacing.sm,
  },
  successText: {
    fontSize: 16,
    color: marketingTokens.colors.fg.secondary,
    textAlign: 'center',
  },
  emailText: {
    fontSize: 16,
    fontWeight: '600',
    color: marketingTokens.colors.accent.cyan400,
    marginTop: marketingTokens.spacing.xs,
    marginBottom: marketingTokens.spacing.md,
  },
  successHint: {
    fontSize: 14,
    color: marketingTokens.colors.fg.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: marketingTokens.spacing.lg,
  },
  noEmailText: {
    fontSize: 14,
    color: marketingTokens.colors.fg.secondary,
    marginBottom: marketingTokens.spacing.xs,
  },
  resendLink: {
    fontSize: 16,
    fontWeight: '600',
    color: marketingTokens.colors.accent.cyan400,
    textDecorationLine: 'underline',
  },
  tipsContainer: {
    marginTop: marketingTokens.spacing.lg,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: marketingTokens.radii.md,
    padding: marketingTokens.spacing.md,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: marketingTokens.colors.fg.primary,
    marginBottom: marketingTokens.spacing.xs,
  },
  tipText: {
    fontSize: 13,
    color: marketingTokens.colors.fg.tertiary,
    lineHeight: 20,
  },
  alternativeContainer: {
    alignItems: 'center',
    gap: marketingTokens.spacing.sm,
  },
  alternativeText: {
    fontSize: 14,
    color: marketingTokens.colors.fg.tertiary,
  },
  alternativeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: marketingTokens.spacing.xs,
    paddingVertical: marketingTokens.spacing.sm,
    paddingHorizontal: marketingTokens.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: marketingTokens.radii.md,
  },
  alternativeLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: marketingTokens.colors.accent.cyan400,
  },
});
