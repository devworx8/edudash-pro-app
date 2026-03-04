import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { assertSupabase } from '@/lib/supabase';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { getEmailChangeRedirectUrl as getEmailChangeRedirectUrlFromAuth } from '@/lib/auth/authRedirectUrls';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

function getEmailChangeRedirectUrl(): string {
  const platform = Platform.OS === 'web' ? 'web' : (Platform.OS as 'ios' | 'android');
  const webOrigin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
  return getEmailChangeRedirectUrlFromAuth(platform, webOrigin);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ChangeEmailScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showAlert, alertProps } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [currentEmail, setCurrentEmail] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [initializing, setInitializing] = useState<boolean>(true);

  useEffect(() => {
    const loadCurrentEmail = async () => {
      try {
        const { data, error } = await assertSupabase().auth.getUser();
        if (error) throw error;
        setCurrentEmail(data.user?.email || '');
      } catch (err) {
        showAlert({
          title: t('common.error', { defaultValue: 'Error' }),
          message: t('account.change_email_load_failed', {
            defaultValue: 'Could not load your current email. Please try again.',
          }),
          type: 'error',
          buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'default' }],
        });
      } finally {
        setInitializing(false);
      }
    };

    loadCurrentEmail();
  }, [showAlert, t]);

  const handleSubmit = async () => {
    const trimmed = newEmail.trim().toLowerCase();

    if (!trimmed) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('account.change_email_enter_new', { defaultValue: 'Please enter a new email address.' }),
        type: 'error',
        buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'default' }],
      });
      return;
    }

    if (!isValidEmail(trimmed)) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('auth.invalid_email', { defaultValue: 'Please enter a valid email address.' }),
        type: 'error',
        buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'default' }],
      });
      return;
    }

    if (currentEmail && trimmed === currentEmail.toLowerCase()) {
      showAlert({
        title: t('common.info', { defaultValue: 'Info' }),
        message: t('account.change_email_same', { defaultValue: 'That is already your current email address.' }),
        type: 'info',
        buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'default' }],
      });
      return;
    }

    setLoading(true);
    try {
      const redirectTo = getEmailChangeRedirectUrl();
      const { error } = await assertSupabase().auth.updateUser(
        { email: trimmed },
        { emailRedirectTo: redirectTo }
      );

      if (error) {
        throw error;
      }

      showAlert({
        title: t('common.success', { defaultValue: 'Success' }),
        message: t('account.change_email_sent', {
          defaultValue:
            'We sent a confirmation link to your new email address. Please confirm the change there.',
        }),
        type: 'success',
        buttons: [
          {
            text: t('common.ok', { defaultValue: 'OK' }),
            style: 'default',
            onPress: () => router.back(),
          },
        ],
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t('common.unexpected_error', { defaultValue: 'An unexpected error occurred.' });
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message,
        type: 'error',
        buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'default' }],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: t('account.change_email_title', { defaultValue: 'Change Email' }),
          headerShown: true,
          headerStyle: { backgroundColor: theme.surface },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.iconRow}>
              <Ionicons name="mail-outline" size={22} color={theme.primary} />
              <Text style={styles.heading}>
                {t('account.change_email_heading', { defaultValue: 'Update your email address' })}
              </Text>
            </View>

            <Text style={styles.helper}>
              {t('account.change_email_helper', {
                defaultValue:
                  'You will need to confirm the change from your new email address before it takes effect.',
              })}
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>
                {t('account.current_email', { defaultValue: 'Current Email' })}
              </Text>
              <View style={styles.readonlyInput}>
                {initializing ? (
                  <EduDashSpinner size="small" color={theme.primary} />
                ) : (
                  <Text style={styles.readonlyValue}>{currentEmail || '—'}</Text>
                )}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                {t('account.new_email', { defaultValue: 'New Email' })}
              </Text>
              <TextInput
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder={t('account.new_email_placeholder', {
                  defaultValue: 'name@example.com',
                })}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading || initializing}
              activeOpacity={0.8}
            >
              {loading ? (
                <EduDashSpinner size="small" color={theme.onPrimary} />
              ) : (
                <Text style={styles.buttonText}>
                  {t('account.change_email_cta', { defaultValue: 'Send Confirmation Link' })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    keyboardView: {
      flex: 1,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
      gap: 16,
    },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    heading: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.text,
    },
    helper: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
    },
    field: {
      gap: 6,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    readonlyInput: {
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceVariant,
      paddingHorizontal: 14,
      justifyContent: 'center',
    },
    readonlyValue: {
      fontSize: 16,
      color: theme.text,
    },
    input: {
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      paddingHorizontal: 14,
      fontSize: 16,
      color: theme.inputText,
    },
    button: {
      marginTop: 6,
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.onPrimary,
    },
  });
}

