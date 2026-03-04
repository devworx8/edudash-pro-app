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
import { getPasswordResetRedirectUrl } from '@/lib/auth/authRedirectUrls';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { showAlert, alertProps } = useAlertModal();

  const handleResetPassword = async () => {
    if (!email) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('auth.forgot_password.enter_email', { defaultValue: 'Please enter your email address' }),
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }

    setLoading(true);
    
    try {
      const platform = Platform.OS === 'web' ? 'web' : (Platform.OS as 'ios' | 'android');
      const webOrigin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getPasswordResetRedirectUrl(platform, webOrigin),
      });

      if (error) {
        showAlert({
          title: t('common.error', { defaultValue: 'Error' }),
          message: error.message,
          type: 'error',
          buttons: [{ text: 'OK', style: 'default' }],
        });
      } else {
        setEmailSent(true);
        showAlert({
          title: t('common.success', { defaultValue: 'Success' }),
          message: t('auth.forgot_password.email_sent_web', { 
            defaultValue: 'Password reset email sent! Open the link in your email — it will open the app (if installed) or the web reset page.' 
          }),
          type: 'success',
          buttons: [{ text: 'OK', style: 'default' }],
        });
      }
    } catch (error: any) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: error?.message || t('common.unexpected_error', { defaultValue: 'An unexpected error occurred' }),
        type: 'error',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      ...(Platform.OS === 'web' && {
        // RN dimension values support percentages but not viewport units like `vh`
        minHeight: '100%',
        justifyContent: 'center',
        alignItems: 'center',
      }),
    },
    keyboardView: {
      flex: 1,
      ...(Platform.OS === 'web' && {
        width: '100%',
        maxWidth: '100%',
        alignSelf: 'center',
      }),
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: Platform.OS === 'web' ? 40 : 100,
      ...(Platform.OS === 'web' && {
        minHeight: '100%',
        justifyContent: 'center',
        paddingVertical: 40,
      }),
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 20,
      justifyContent: 'center',
      width: '100%',
      ...(Platform.OS === 'web' && {
        flex: 0,
        paddingVertical: 0,
        paddingHorizontal: 40,
      }),
    },
    card: {
      width: '100%',
      alignSelf: 'center',
      ...(Platform.OS === 'web' && { 
        marginVertical: 20,
        maxWidth: '100%',
      }),
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 24,
    },
    backButtonText: {
      color: marketingTokens.colors.accent.cyan400,
      fontSize: 16,
      fontWeight: '600',
    },
    header: {
      marginBottom: 20,
      alignItems: 'center',
      gap: 8,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: marketingTokens.colors.fg.primary,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: marketingTokens.colors.fg.secondary,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 20,
    },
    form: {
      marginTop: 16,
      gap: 16,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      padding: 14,
      color: theme.inputText,
      backgroundColor: theme.inputBackground,
      fontSize: 16,
    },
    successContainer: {
      alignItems: 'center',
      gap: 16,
      marginTop: 16,
    },
    successText: {
      fontSize: 15,
      color: theme.text,
      textAlign: 'center',
      lineHeight: 22,
    },
    signInButton: {
      marginTop: 8,
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient
        colors={marketingTokens.gradients.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.content}>
            <GlassCard style={styles.card}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={24} color={marketingTokens.colors.accent.cyan400} />
                <Text style={styles.backButtonText}>
                  {t('common.back', { defaultValue: 'Back' })}
                </Text>
              </TouchableOpacity>

              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  <Ionicons name="lock-closed" size={32} color={theme.primary} />
                </View>
                <Text style={styles.title}>
                  {t('auth.forgot_password.title', { defaultValue: 'Forgot Password?' })}
                </Text>
                <Text style={styles.subtitle}>
                  {t('auth.forgot_password.subtitle', { 
                    defaultValue: "No worries! Enter your email and we'll send you instructions to reset your password." 
                  })}
                </Text>
              </View>

              {!emailSent ? (
                <View style={styles.form}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('auth.email', { defaultValue: 'Email' })}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleResetPassword}
                  />

                  <GradientButton
                    label={loading 
                      ? t('auth.forgot_password.sending', { defaultValue: 'Sending...' }) 
                      : t('auth.forgot_password.send_reset_link', { defaultValue: 'Send Reset Link' })
                    }
                    onPress={() => { if (!loading) handleResetPassword(); }}
                    variant="indigo"
                    size="lg"
                  />
                </View>
              ) : (
                <View style={styles.successContainer}>
                  <Ionicons name="checkmark-circle" size={64} color={theme.primary} />
                  <Text style={styles.successText}>
                    {t('auth.forgot_password.check_email_web', { 
                      defaultValue: 'Check your email for a link to reset your password.\n\nYou will be taken to our secure website to create your new password, then you can return to the app to sign in.' 
                    })}
                  </Text>
                  <GradientButton
                    label={t('auth.back_to_sign_in', { defaultValue: 'Back to Sign In' })}
                    onPress={() => router.back()}
                    variant="indigo"
                    size="lg"
                    style={styles.signInButton}
                  />
                </View>
              )}
            </GlassCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* Custom Alert Modal */}
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
