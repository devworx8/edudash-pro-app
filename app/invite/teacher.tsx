import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlert } from '@/components/ui/StyledAlert';
import { buildTeacherInviteLink, TEACHER_INVITE_DEEP_LINK } from '@/lib/utils/teacherInviteLink';
import { setPendingTeacherInvite } from '@/lib/utils/teacherInvitePending';
import { getEduDashWebBaseUrl } from '@/lib/config/urls';

const DEFAULT_WEB_URL = getEduDashWebBaseUrl();
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.edudashpro';

export default function TeacherInviteLanding() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ token?: string; email?: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const email = typeof params?.email === 'string' ? params.email : '';
  const alert = useAlert();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const inviteLink = token && email ? buildTeacherInviteLink(token, email) : DEFAULT_WEB_URL;
  const deepLink = token && email ? TEACHER_INVITE_DEEP_LINK(token, email) : 'edudashpro://';
  const invitePath = token && email
    ? `/screens/teacher-invite-accept?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
    : '/';

  const tryOpenAppFromWeb = () => {
    if (Platform.OS !== 'web') return;
    // IMPORTANT: Use triple-slash so Android doesn't treat the first segment as hostname.
    const schemeUrl = `edudashpro:///${invitePath.replace(/^\//, '')}`;
    let didHide = false;
    const visibilityHandler = () => {
      if (document.hidden) didHide = true;
    };
    document.addEventListener('visibilitychange', visibilityHandler);
    window.location.href = schemeUrl;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', visibilityHandler);
      if (!didHide) window.location.href = PLAY_STORE_URL;
    }, 1200);
  };

  const handleOpenApp = async () => {
    try {
      if (Platform.OS === 'web') {
        tryOpenAppFromWeb();
        return;
      }
      await Linking.openURL(deepLink);
    } catch {
      await Linking.openURL(DEFAULT_WEB_URL);
    }
  };

  const handleSignIn = async () => {
    if (token && email) {
      await setPendingTeacherInvite({ token, email });
    }
    router.replace({
      pathname: '/(auth)/sign-in' as any,
      params: { email },
    } as any);
  };

  const handleSignUp = async () => {
    if (token && email) {
      await setPendingTeacherInvite({ token, email });
    }
    router.replace({
      pathname: '/(auth)/teacher-signup' as any,
      params: { email },
    } as any);
  };

  const handleCopyToken = async () => {
    if (!token) return;
    await Clipboard.setStringAsync(token);
    alert.show(
      'Copied',
      'Invite token copied to clipboard.',
      [{ text: 'Close', style: 'cancel' }],
      { type: 'success' }
    );
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(inviteLink);
    alert.show(
      'Copied',
      'Invite link copied to clipboard.',
      [{ text: 'Close', style: 'cancel' }],
      { type: 'success' }
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Teacher Invite' }} />
      <View style={styles.header}>
        <Ionicons name="school-outline" size={28} color={theme.primary} />
        <Text style={styles.title}>Teacher Invite</Text>
      </View>

      <Text style={styles.subtitle}>
        Accept your invite to join a school on EduDash Pro.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Invite Token</Text>
        <Text style={styles.value}>{token || 'Missing token'}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{email || 'Missing email'}</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyToken} disabled={!token}>
            <Ionicons name="copy-outline" size={16} color={theme.text} />
            <Text style={styles.secondaryButtonText}>Copy Token</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyLink}>
            <Ionicons name="link-outline" size={16} color={theme.text} />
            <Text style={styles.secondaryButtonText}>Copy Link</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.primaryActions}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleOpenApp}>
          <Ionicons name="open-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Open in App</Text>
        </TouchableOpacity>
        {Platform.OS === 'web' && (
          <>
            <TouchableOpacity style={styles.secondaryCta} onPress={handleSignIn}>
              <Text style={styles.secondaryCtaText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryCta} onPress={handleSignUp}>
              <Text style={styles.secondaryCtaText}>Create Account</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.helpText}>
        Don’t have the app? Install it first, then tap the invite link again. Your token will still work.
      </Text>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
    },
    subtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: 16,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
    },
    label: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 6,
    },
    value: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '600',
      marginBottom: 4,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      flexWrap: 'wrap',
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.card,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryButtonText: {
      color: theme.text,
      fontWeight: '600',
      fontSize: 12,
    },
    primaryActions: {
      gap: 10,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      paddingVertical: 12,
      borderRadius: 10,
    },
    primaryButtonText: {
      color: theme.onPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    secondaryCta: {
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryCtaText: {
      color: theme.text,
      fontWeight: '600',
      fontSize: 14,
    },
    helpText: {
      marginTop: 16,
      fontSize: 12,
      color: theme.textSecondary,
    },
  });
