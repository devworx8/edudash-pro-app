import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { signOutAndRedirect } from '@/lib/authActions';
import type { ViewStyle, TextStyle } from 'react-native';

interface AccountActionsProps {
  theme: {
    surfaceVariant: string;
    primary: string;
    onError: string;
    text?: string;
    textSecondary?: string;
  };
  styles: {
    infoSection: ViewStyle;
    sectionTitle: TextStyle;
    signOutButton: ViewStyle;
    signOutText: TextStyle;
  };
  onChangeEmail?: () => void;
  onChangePassword?: () => void;
  onSwitchAccount?: () => void;
}

export function AccountActions({ theme, styles, onChangeEmail, onChangePassword, onSwitchAccount }: AccountActionsProps) {
  const { t } = useTranslation();
  const signOutColor = '#0f172a';
  const signOutBackground = '#eef3ff';
  const signOutBorder = 'rgba(15, 23, 42, 0.16)';

  return (
    <View style={styles.infoSection}>
      {(onChangeEmail || onChangePassword) && (
        <>
          <Text style={styles.sectionTitle}>{t('account.security', { defaultValue: 'Security' })}</Text>
          {onChangePassword && (
            <TouchableOpacity
              onPress={onChangePassword}
              style={[
                styles.signOutButton,
                {
                  backgroundColor: theme.surfaceVariant,
                  borderWidth: 2,
                  borderColor: theme.primary,
                  shadowColor: theme.primary,
                },
              ]}
              activeOpacity={0.7}
            >
              <Ionicons name="lock-closed-outline" size={22} color={theme.primary} />
              <Text style={[styles.signOutText, { color: theme.primary }]}>
                {t('account.change_password_title', { defaultValue: 'Change Password' })}
              </Text>
            </TouchableOpacity>
          )}
          {onChangeEmail && (
            <TouchableOpacity
              onPress={onChangeEmail}
              style={[
                styles.signOutButton,
                {
                  backgroundColor: theme.surfaceVariant,
                  borderWidth: 2,
                  borderColor: theme.primary,
                  shadowColor: theme.primary,
                },
              ]}
              activeOpacity={0.7}
            >
              <Ionicons name="mail-outline" size={22} color={theme.primary} />
              <Text style={[styles.signOutText, { color: theme.primary }]}>
                {t('account.change_email_title', { defaultValue: 'Change Email' })}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <Text style={[styles.sectionTitle, (onChangeEmail || onChangePassword) && { marginTop: 12 }]}>
        {t('account.account_actions', { defaultValue: 'Account Actions' })}
      </Text>
      
      <TouchableOpacity
        onPress={() => {
          if (onSwitchAccount) {
            onSwitchAccount();
            return;
          }
          signOutAndRedirect({ clearBiometrics: false, redirectTo: '/(auth)/sign-in?switch=1' });
        }}
        style={[styles.signOutButton, { 
          backgroundColor: theme.surfaceVariant, 
          borderWidth: 2,
          borderColor: theme.primary,
          shadowColor: theme.primary,
        }]}
        activeOpacity={0.7}
      >
        <Ionicons name="swap-horizontal" size={22} color={theme.primary} />
        <Text style={[styles.signOutText, { color: theme.primary }]}>{t('navigation.switch_account', { defaultValue: 'Switch Account' })}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => signOutAndRedirect({ clearBiometrics: false, redirectTo: '/(auth)/sign-in' })}
        style={[
          styles.signOutButton,
          {
            backgroundColor: signOutBackground,
            borderColor: signOutBorder,
          },
        ]}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={22} color={signOutColor} />
        <Text style={[styles.signOutText, { color: signOutColor }]}>
          {t('navigation.logout', { defaultValue: 'Sign Out' })}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
