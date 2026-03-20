import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

export default function OrgAdminSettingsScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { profile } = useAuth();
  const styles = createStyles(theme);

  const orgName = (profile as any)?.organization_name || 'Your Organization';

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
        }}
      />
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Organization Settings</Text>

            <TouchableOpacity style={styles.settingItem}>
              <Ionicons name="business-outline" size={24} color={theme.text} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Organization Name</Text>
                <Text style={styles.settingValue}>{orgName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingItem}>
              <Ionicons name="people-outline" size={24} color={theme.text} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Team Members</Text>
                <Text style={styles.settingValue}>Manage access</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingItem}>
              <Ionicons name="card-outline" size={24} color={theme.text} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Billing & Subscription</Text>
                <Text style={styles.settingValue}>Manage plan</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferences</Text>

            <TouchableOpacity style={styles.settingItem}>
              <Ionicons name="notifications-outline" size={24} color={theme.text} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={styles.settingValue}>Configure alerts</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => router.push('/screens/org-admin/branding')}
            >
              <Ionicons name="color-palette-outline" size={24} color={theme.text} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Branding</Text>
                <Text style={styles.settingValue}>Customize appearance</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => router.push('/screens/org-admin/ai-settings')}
            >
              <Ionicons name="sparkles-outline" size={24} color={theme.text} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>AI & Automation</Text>
                <Text style={styles.settingValue}>Configure AI preferences</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => router.push('/screens/org-admin/ai-automation')}
            >
              <Ionicons name="rocket-outline" size={24} color={theme.text} />
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>AI Automation Tools</Text>
                <Text style={styles.settingValue}>Use AI-powered automation</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { padding: 16, gap: 24 },
    section: {
      gap: 8,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 12,
    },
    settingContent: {
      flex: 1,
      gap: 4,
    },
    settingLabel: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600',
    },
    settingValue: {
      color: theme.textSecondary,
      fontSize: 14,
    },
  });
