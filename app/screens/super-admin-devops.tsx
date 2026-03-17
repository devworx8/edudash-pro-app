/**
 * Super Admin DevOps & Integrations Dashboard
 * 
 * Provides access to:
 * - GitHub (commits, PRs, deployments)
 * - EAS/Expo (builds, OTA updates, submissions)
 * - Vercel (deployments, previews)
 * - Claude/AI Console (usage, costs)
 * - CI/CD Pipeline status
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';
import {
  type Integration,
  type GitHubCommit,
  type EASBuild,
  createStyles,
} from '@/lib/screen-styles/super-admin-devops.styles';
const INTEGRATIONS: Integration[] = [
  {
    id: 'github',
    name: 'GitHub',
    type: 'github',
    icon: 'logo-github',
    color: '#24292e',
    status: 'connected',
    url: 'https://github.com/DashSoil/NewDash',
  },
  {
    id: 'eas',
    name: 'EAS / Expo',
    type: 'eas',
    icon: 'phone-portrait',
    color: '#000020',
    status: 'connected',
    url: 'https://expo.dev/accounts/dashsoil/projects/edudash-pro',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    type: 'vercel',
    icon: 'globe',
    color: '#000000',
    status: 'disconnected',
    url: 'https://vercel.com/dashsoil',
  },
  {
    id: 'claude',
    name: 'Claude Console',
    type: 'claude',
    icon: 'sparkles',
    color: '#d97706',
    status: 'connected',
    url: 'https://console.anthropic.com',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    type: 'supabase',
    icon: 'server',
    color: '#3ecf8e',
    status: 'connected',
    url: 'https://supabase.com/dashboard/project/lvvvjywrmpcqrpvuptdi',
  },
  {
    id: 'posthog',
    name: 'PostHog Analytics',
    type: 'posthog',
    icon: 'analytics',
    color: '#1d4ed8',
    status: 'connected',
    url: 'https://app.posthog.com',
  },
  {
    id: 'mcp',
    name: 'MCP Servers',
    type: 'mcp',
    icon: 'extension-puzzle',
    color: '#8b5cf6',
    status: 'disconnected',
    url: '',
  },
];

export default function SuperAdminDevOpsScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>(INTEGRATIONS);
  const [recentCommits, setRecentCommits] = useState<GitHubCommit[]>([]);
  const [recentBuilds, setRecentBuilds] = useState<EASBuild[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'github' | 'eas' | 'ai'>('overview');

  const fetchDevOpsData = useCallback(async () => {
    if (!isSuperAdmin(profile?.role)) {
      return;
    }

    try {
      setLoading(true);

      // Check for integration configs in database
      const { data: dbIntegrations } = await assertSupabase()
        .from('superadmin_integrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (dbIntegrations && dbIntegrations.length > 0) {
        // Update integration status from DB
        const updatedIntegrations = INTEGRATIONS.map(int => {
          const dbInt = dbIntegrations.find((d: any) => d.integration_type === int.type);
          if (dbInt) {
            return {
              ...int,
              status: dbInt.is_active ? 'connected' : 'disconnected',
              lastSync: dbInt.last_sync_at,
            };
          }
          return int;
        });
        setIntegrations(updatedIntegrations as Integration[]);
      }

      // Note: In production, you would fetch real data from GitHub/EAS APIs
      // For now, showing static data with links to external dashboards

    } catch (error) {
      logger.error('Failed to fetch DevOps data:', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    fetchDevOpsData();
  }, [fetchDevOpsData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDevOpsData();
    setRefreshing(false);
  }, [fetchDevOpsData]);

  const handleOpenIntegration = (integration: Integration) => {
    if (integration.url) {
      Linking.openURL(integration.url);
      track('superadmin_devops_open_integration', { type: integration.type });
    }
  };

  const handleTriggerBuild = (platform: 'android' | 'ios' | 'all') => {
    showAlert({
      title: 'Trigger EAS Build',
      message: `This will start a new ${platform === 'all' ? 'Android & iOS' : platform} build on EAS.\n\nNote: You can also run this from terminal:\neas build --platform ${platform}`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open EAS Dashboard',
          onPress: () => Linking.openURL('https://expo.dev/accounts/dashsoil/projects/edudash-pro/builds'),
        },
      ],
    });
  };

  const handlePublishUpdate = () => {
    showAlert({
      title: 'Publish OTA Update',
      message: 'This will publish an over-the-air update to all users.\n\nNote: You can also run this from terminal:\neas update --branch production',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open EAS Updates',
          onPress: () => Linking.openURL('https://expo.dev/accounts/dashsoil/projects/edudash-pro/updates'),
        },
      ],
    });
  };

  if (!profile || !isSuperAdmin(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'DevOps', headerShown: false }} />
        <StatusBar style="light" />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  const renderOverview = () => (
    <>
      {/* Integrations Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connected Services</Text>
        <View style={styles.integrationsGrid}>
          {integrations.map((integration) => (
            <TouchableOpacity
              key={integration.id}
              style={[styles.integrationCard, { borderColor: integration.color }]}
              onPress={() => handleOpenIntegration(integration)}
            >
              <View style={[styles.integrationIcon, { backgroundColor: integration.color }]}>
                <Ionicons name={integration.icon as any} size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.integrationName}>{integration.name}</Text>
              <View style={styles.integrationStatus}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: integration.status === 'connected' ? '#10b981' : 
                    integration.status === 'error' ? '#ef4444' : '#6b7280' }
                ]} />
                <Text style={styles.statusText}>
                  {integration.status === 'connected' ? 'Connected' : 
                   integration.status === 'error' ? 'Error' : 'Not Connected'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => handleTriggerBuild('android')}
          >
            <Ionicons name="logo-android" size={28} color="#3ddc84" />
            <Text style={styles.actionTitle}>Build Android</Text>
            <Text style={styles.actionSubtitle}>EAS Build</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => handleTriggerBuild('ios')}
          >
            <Ionicons name="logo-apple" size={28} color="#FFFFFF" />
            <Text style={styles.actionTitle}>Build iOS</Text>
            <Text style={styles.actionSubtitle}>EAS Build</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={handlePublishUpdate}
          >
            <Ionicons name="cloud-upload" size={28} color="#8b5cf6" />
            <Text style={styles.actionTitle}>OTA Update</Text>
            <Text style={styles.actionSubtitle}>Push to Users</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => Linking.openURL('https://github.com/DashSoil/NewDash/pulls')}
          >
            <Ionicons name="git-pull-request" size={28} color="#2563eb" />
            <Text style={styles.actionTitle}>View PRs</Text>
            <Text style={styles.actionSubtitle}>GitHub</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* External Links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>External Dashboards</Text>
        <View style={styles.linksList}>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL('https://console.anthropic.com/settings/usage')}
          >
            <Ionicons name="sparkles" size={20} color="#d97706" />
            <Text style={styles.linkText}>Claude API Usage & Costs</Text>
            <Ionicons name="open-outline" size={16} color="#6b7280" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL('https://supabase.com/dashboard/project/lvvvjywrmpcqrpvuptdi/reports')}
          >
            <Ionicons name="bar-chart" size={20} color="#3ecf8e" />
            <Text style={styles.linkText}>Supabase Usage & Reports</Text>
            <Ionicons name="open-outline" size={16} color="#6b7280" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL('https://github.com/DashSoil/NewDash/actions')}
          >
            <Ionicons name="git-branch" size={20} color="#24292e" />
            <Text style={styles.linkText}>GitHub Actions / CI</Text>
            <Ionicons name="open-outline" size={16} color="#6b7280" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL('https://expo.dev/accounts/dashsoil/projects/edudash-pro/submissions')}
          >
            <Ionicons name="storefront" size={20} color="#000020" />
            <Text style={styles.linkText}>App Store Submissions</Text>
            <Ionicons name="open-outline" size={16} color="#6b7280" />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'DevOps', headerShown: false }} />
      <StatusBar style="light" />

      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#00f5ff" />
          </TouchableOpacity>
          <Text style={styles.title}>DevOps & Integrations</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={24} color="#00f5ff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['overview', 'github', 'eas', 'ai'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'overview' ? 'Overview' : 
               tab === 'github' ? 'GitHub' : 
               tab === 'eas' ? 'EAS/Expo' : 'AI Usage'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00f5ff" />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color="#00f5ff" />
            <Text style={styles.loadingText}>Loading DevOps data...</Text>
          </View>
        ) : (
          renderOverview()
        )}
        
        <View style={styles.bottomPadding} />
      </ScrollView>
      
      <AlertModal {...alertProps} />
    </View>
  );
}
