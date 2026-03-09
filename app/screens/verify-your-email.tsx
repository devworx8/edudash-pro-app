import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assertSupabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { buildEduDashWebUrl } from '@/lib/config/urls';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function VerifyYourEmailScreen() {
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  const resend = async () => {
    if (!email) {
      showAlert({ title: 'Email required', message: 'We need your email address to resend the confirmation.', type: 'warning' });
      return;
    }
    setResending(true);
    try {
      const { error } = await assertSupabase().auth.resend({
        type: 'signup',
        email: String(email),
        options: {
          // Keep this consistent with what we pass on signUp
          emailRedirectTo: buildEduDashWebUrl('/landing?flow=email-confirm'),
        },
      } as any);
      if (error) throw error;
      setSent(true);
      showAlert({ title: 'Email sent', message: 'We\'ve resent the confirmation email. Please check your inbox (and spam).', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Failed to resend', message: e?.message || 'Please try again later.', type: 'error' });
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'Verify your email',
          headerStyle: { backgroundColor: theme.surface },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
        }}
      />

      <View style={styles.card}>
        <Text style={[styles.title, { color: theme.text }]}>Check your email</Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>We sent a confirmation link to:</Text>
        <Text style={[styles.email, { color: theme.text }]}>{email || 'your email address'}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={resend}
            disabled={resending}
            activeOpacity={0.8}
          >
            {resending ? (
              <EduDashSpinner color={theme.onPrimary} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.onPrimary }]}>
                {sent ? 'Resend again' : 'Resend confirmation'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.note, { color: theme.textTertiary }]}>
          Tip: If you don’t see it, check your spam folder or search for “EduDash Pro”.
        </Text>
      </View>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '700' },
  message: { fontSize: 14 },
  email: { fontSize: 16, fontWeight: '600' },
  actions: { marginTop: 4 },
  button: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  note: { marginTop: 8, fontSize: 12 },
});
