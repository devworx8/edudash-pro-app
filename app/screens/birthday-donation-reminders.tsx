import React, { useMemo } from 'react';
import { Stack, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { BirthdayDonationRegister } from '@/components/dashboard/teacher/BirthdayDonationRegister';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const ALLOWED_ROLES = new Set(['teacher', 'principal', 'principal_admin', 'admin', 'org_admin', 'super_admin']);

export default function BirthdayDonationRemindersScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const organizationId = profile?.organization_id || profile?.preschool_id || null;
  const normalizedRole = String(profile?.role || '').toLowerCase().trim();
  const canAccess = ALLOWED_ROLES.has(normalizedRole);

  if (!canAccess) {
    return (
      <>
        <Stack.Screen options={{ title: 'Birthday Reminders', headerShown: false }} />
        <DesktopLayout role="principal" title="Birthday Reminders" showBackButton>
          <View style={styles.centeredState}>
            <Text style={styles.stateTitle}>Access Restricted</Text>
            <Text style={styles.stateMessage}>Only school staff can send birthday reminders to parents.</Text>
            <TouchableOpacity style={styles.stateButton} onPress={() => router.back()}>
              <Text style={styles.stateButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </DesktopLayout>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Birthday Reminders', headerShown: false }} />
      <DesktopLayout role="principal" title="Birthday Reminders" showBackButton>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>Birthday Parent Reminders</Text>
            <Text style={styles.headerSubtitle}>
              Send reminder notifications to parents who still need to contribute for upcoming birthday celebrations.
            </Text>
          </View>

          <BirthdayDonationRegister organizationId={organizationId} />
        </ScrollView>
      </DesktopLayout>
    </>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 120,
      gap: 12,
    },
    headerCard: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 8,
    },
    headerTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
    },
    headerSubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    centeredState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 10,
    },
    stateTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
    },
    stateMessage: {
      color: theme.textSecondary,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    stateButton: {
      marginTop: 6,
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    stateButtonText: {
      color: theme.onPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
  });
