import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { isSuperAdmin, createStyles } from '@/lib/screen-styles/super-admin-settings.styles';
import { useSuperAdminSettings } from '@/hooks/useSuperAdminSettings';

export default function SuperAdminSettingsScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const appVersion = Constants.expoConfig?.version || '1.0.33';

  const {
    profile,
    settingsSections,
  } = useSuperAdminSettings(showAlert);

  if (!profile || !isSuperAdmin(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Super Admin Settings', headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Super Admin Settings', headerShown: false }} />
      <ThemedStatusBar />
      
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#00f5ff" />
          </TouchableOpacity>
          <Text style={styles.title}>Super Admin Settings</Text>
          <View style={styles.placeholder} />
        </View>
        
        {/* Admin Info */}
        <View style={styles.adminInfo}>
          <View style={styles.adminAvatar}>
            <Ionicons name="person" size={24} color="#00f5ff" />
          </View>
          <View style={styles.adminDetails}>
            <Text style={styles.adminName}>{profile.email || 'Admin'}</Text>
            <Text style={styles.adminRole}>Super Administrator</Text>
          </View>
          <View style={styles.statusIndicator}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Online</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.content}>
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            
            {section.items.map((item, itemIndex) => (
              <TouchableOpacity
                key={itemIndex}
                style={[
                  styles.settingsItem,
                  item.danger && styles.settingsItemDanger,
                  itemIndex === section.items.length - 1 && styles.settingsItemLast
                ]}
                onPress={item.type !== 'toggle' ? item.action : undefined}
                activeOpacity={item.type !== 'toggle' ? 0.7 : 1}
              >
                <View style={styles.settingsItemLeft}>
                  <View style={[
                    styles.settingsItemIcon,
                    item.danger && styles.settingsItemIconDanger
                  ]}>
                    <Ionicons 
                      name={item.icon as any} 
                      size={20} 
                      color={item.danger ? '#ef4444' : '#00f5ff'} 
                    />
                  </View>
                  
                  <View style={styles.settingsItemText}>
                    <View style={styles.settingsItemTitleRow}>
                      <Text style={[
                        styles.settingsItemTitle,
                        item.danger && styles.settingsItemTitleDanger
                      ]}>
                        {item.title}
                      </Text>
                      {item.beta && (
                        <View style={styles.betaBadge}>
                          <Text style={styles.betaBadgeText}>BETA</Text>
                        </View>
                      )}
                    </View>
                    {item.subtitle && (
                      <Text style={styles.settingsItemSubtitle}>{item.subtitle}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.settingsItemRight}>
                  {item.type === 'toggle' ? (
                    <Switch
                      value={item.value || false}
                      onValueChange={item.action}
                      trackColor={{ false: '#374151', true: '#00f5ff40' }}
                      thumbColor={item.value ? '#00f5ff' : '#9ca3af'}
                    />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color="#6b7280" />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Platform Status */}
        <View style={styles.platformStatus}>
          <Text style={styles.platformStatusTitle}>Platform Status</Text>
          
          <View style={styles.statusGrid}>
            <View style={styles.statusCard}>
              <View style={[styles.statusCardIcon, styles.statusCardIconGreen]}>
                <Ionicons name="server" size={16} color="#10b981" />
              </View>
              <Text style={styles.statusCardLabel}>Database</Text>
              <Text style={styles.statusCardValue}>Healthy</Text>
            </View>
            
            <View style={styles.statusCard}>
              <View style={[styles.statusCardIcon, styles.statusCardIconGreen]}>
                <Ionicons name="flash" size={16} color="#10b981" />
              </View>
              <Text style={styles.statusCardLabel}>AI Services</Text>
              <Text style={styles.statusCardValue}>Online</Text>
            </View>
            
            <View style={styles.statusCard}>
              <View style={[styles.statusCardIcon, styles.statusCardIconYellow]}>
                <Ionicons name="cloud" size={16} color="#f59e0b" />
              </View>
              <Text style={styles.statusCardLabel}>CDN</Text>
              <Text style={styles.statusCardValue}>Degraded</Text>
            </View>
            
            <View style={styles.statusCard}>
              <View style={[styles.statusCardIcon, styles.statusCardIconGreen]}>
                <Ionicons name="card" size={16} color="#10b981" />
              </View>
              <Text style={styles.statusCardLabel}>Payments</Text>
              <Text style={styles.statusCardValue}>Active</Text>
            </View>
          </View>
        </View>

        {/* Version Info */}
        <View style={styles.versionInfo}>
          <Text style={styles.versionText}>{`EduDash Pro v${appVersion}`}</Text>
          <Text style={styles.versionText}>{`Super Admin Panel v${appVersion}`}</Text>
          <Text style={styles.versionText}>Last updated: Dec 19, 2024</Text>
          <Text style={styles.versionText}>• WhatsApp integration</Text>
          <Text style={styles.versionText}>• Mobile-first design improvements</Text>
          <Text style={styles.versionText}>• Advanced admin management</Text>
        </View>
      </ScrollView>

      <AlertModal {...alertProps} />
    </View>
  );
}
