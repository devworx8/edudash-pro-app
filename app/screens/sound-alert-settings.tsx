import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Platform, Modal, TextInput } from 'react-native';
import { Stack, router } from 'expo-router';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import SoundAlertService, { 
  AlertType, 
  SoundStyle, 
  HapticPattern, 
  SoundAlertSettings 
} from '@/lib/SoundAlertService';
import { track } from '@/lib/analytics';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface AlertTypeConfig {
  type: AlertType;
  title: string;
  description: string;
  icon: string;
  color: string;
  defaultStyle: SoundStyle;
}

const ALERT_TYPES: AlertTypeConfig[] = [
  {
    type: 'urgent',
    title: 'Urgent Alerts',
    description: 'Critical system alerts and emergencies',
    icon: 'warning',
    color: '#ef4444',
    defaultStyle: 'urgent',
  },
  {
    type: 'message',
    title: 'Messages',
    description: 'Direct messages from teachers and parents',
    icon: 'chatbubble',
    color: '#3b82f6',
    defaultStyle: 'normal',
  },
  {
    type: 'payment',
    title: 'Payment Alerts',
    description: 'Payment confirmations and reminders',
    icon: 'card',
    color: '#10b981',
    defaultStyle: 'prominent',
  },
  {
    type: 'attendance',
    title: 'Attendance Alerts',
    description: 'Student check-in and check-out notifications',
    icon: 'checkmark-circle',
    color: '#f59e0b',
    defaultStyle: 'normal',
  },
  {
    type: 'system',
    title: 'System Notifications',
    description: 'App updates and system maintenance',
    icon: 'cog',
    color: '#8b5cf6',
    defaultStyle: 'prominent',
  },
  {
    type: 'success',
    title: 'Success Confirmations',
    description: 'Successful actions and completions',
    icon: 'checkmark-done',
    color: '#10b981',
    defaultStyle: 'normal',
  },
  {
    type: 'warning',
    title: 'Warning Alerts',
    description: 'Important warnings and advisories',
    icon: 'alert-circle',
    color: '#f59e0b',
    defaultStyle: 'prominent',
  },
  {
    type: 'error',
    title: 'Error Alerts',
    description: 'Error notifications and failed actions',
    icon: 'close-circle',
    color: '#ef4444',
    defaultStyle: 'urgent',
  },
  {
    type: 'notification',
    title: 'General Notifications',
    description: 'General app notifications and updates',
    icon: 'notifications',
    color: '#6b7280',
    defaultStyle: 'normal',
  },
  {
    type: 'reminder',
    title: 'Reminders',
    description: 'Task reminders and scheduled alerts',
    icon: 'time',
    color: '#ec4899',
    defaultStyle: 'normal',
  },
];

const SOUND_STYLES: { value: SoundStyle; label: string; description: string }[] = [
  { value: 'subtle', label: 'Subtle', description: 'Quiet and unobtrusive' },
  { value: 'normal', label: 'Normal', description: 'Standard notification sound' },
  { value: 'prominent', label: 'Prominent', description: 'Louder and more noticeable' },
  { value: 'urgent', label: 'Urgent', description: 'Loud and attention-grabbing' },
  { value: 'custom', label: 'Custom', description: 'Use custom sound file' },
];

const HAPTIC_PATTERNS: { value: HapticPattern; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No vibration' },
  { value: 'light', label: 'Light', description: 'Gentle vibration' },
  { value: 'medium', label: 'Medium', description: 'Moderate vibration' },
  { value: 'heavy', label: 'Heavy', description: 'Strong vibration' },
  { value: 'success', label: 'Success', description: 'Success pattern' },
  { value: 'warning', label: 'Warning', description: 'Warning pattern' },
  { value: 'error', label: 'Error', description: 'Error pattern' },
];

export default function SoundAlertSettingsScreen() {
  const { profile } = useAuth();
  const { theme, isDark } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Map<AlertType, SoundAlertSettings>>(new Map());
  const [selectedAlert, setSelectedAlert] = useState<AlertType | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showQuietHoursModal, setShowQuietHoursModal] = useState(false);
  const [testingAlert, setTestingAlert] = useState<AlertType | null>(null);

  // Quiet hours state
  const [quietHoursStart, setQuietHoursStart] = useState(new Date());
  const [quietHoursEnd, setQuietHoursEnd] = useState(new Date());
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const soundService = SoundAlertService.getInstance();

  useEffect(() => {
    loadSoundSettings();
  }, [profile?.id]);

  const loadSoundSettings = useCallback(async () => {
    try {
      setLoading(true);
      
      // Initialize sound service
      await soundService.initialize();
      
      // Load settings for all alert types
      const settingsMap = new Map<AlertType, SoundAlertSettings>();
      
      for (const alertConfig of ALERT_TYPES) {
        const alertSettings = await soundService.getAllAlertSettings(profile?.id);
        const typeSettings = alertSettings.find(s => s.alertType === alertConfig.type);
        
        if (typeSettings) {
          settingsMap.set(alertConfig.type, typeSettings);
          
          // Set quiet hours if available
          if (typeSettings.quietHoursEnabled) {
            const [startHour, startMin] = typeSettings.quietHoursStart.split(':').map(Number);
            const [endHour, endMin] = typeSettings.quietHoursEnd.split(':').map(Number);
            
            const startTime = new Date();
            startTime.setHours(startHour, startMin);
            setQuietHoursStart(startTime);
            
            const endTime = new Date();
            endTime.setHours(endHour, endMin);
            setQuietHoursEnd(endTime);
          }
        }
      }
      
      setSettings(settingsMap);
      
    } catch (error) {
      console.error('Failed to load sound settings:', error);
      showAlert({ title: 'Error', message: 'Failed to load sound alert settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [profile?.id, soundService]);

  const updateAlertSetting = async (
    alertType: AlertType,
    updates: Partial<SoundAlertSettings>
  ): Promise<void> => {
    try {
      await soundService.updateAlertSettings(alertType, updates, profile?.id);
      
      // Update local state
      const currentSettings = settings.get(alertType);
      if (currentSettings) {
        const updatedSettings = { ...currentSettings, ...updates };
        const newSettings = new Map(settings);
        newSettings.set(alertType, updatedSettings);
        setSettings(newSettings);
      }
      
      track('sound_alert_settings_updated', {
        alert_type: alertType,
        updates: Object.keys(updates),
        user_id: profile?.id,
      });
      
    } catch (error) {
      console.error('Failed to update alert setting:', error);
      showAlert({ title: 'Error', message: 'Failed to update sound alert setting', type: 'error' });
    }
  };

  const testAlert = async (alertType: AlertType): Promise<void> => {
    try {
      setTestingAlert(alertType);
      await soundService.testAlert(alertType, profile?.id);
      
      track('sound_alert_tested', {
        alert_type: alertType,
        user_id: profile?.id,
      });
      
      setTimeout(() => {
        setTestingAlert(null);
      }, 2000);
      
    } catch (error) {
      console.error('Failed to test alert:', error);
      showAlert({ title: 'Error', message: 'Failed to test sound alert', type: 'error' });
      setTestingAlert(null);
    }
  };

  const openSystemSettings = (): void => {
    showAlert({
      title: 'System Settings',
      message: 'To modify system-level notification settings, please go to your device settings.',
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            if (Platform.OS === 'ios') {
              // iOS Settings app
              // Linking.openURL('app-settings:');
            } else {
              // Android Settings app
              // Linking.openSettings();
            }
          }
        }
      ],
    });
  };

  const resetToDefaults = (): void => {
    showAlert({
      title: 'Reset to Defaults',
      message: 'This will reset all sound alert settings to their default values. Are you sure?',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const alertConfig of ALERT_TYPES) {
                await updateAlertSetting(alertConfig.type, {
                  enabled: true,
                  soundStyle: alertConfig.defaultStyle,
                  volume: 0.7,
                  hapticEnabled: true,
                  respectSystemSettings: true,
                  quietHoursEnabled: false,
                });
              }
              
              showAlert({ title: 'Success', message: 'Sound alert settings have been reset to defaults', type: 'success' });
              
            } catch (error) {
              console.error('Failed to reset settings:', error);
              showAlert({ title: 'Error', message: 'Failed to reset sound alert settings', type: 'error' });
            }
          }
        }
      ],
    });
  };

  const updateQuietHours = async (): Promise<void> => {
    try {
      const startTime = `${quietHoursStart.getHours().toString().padStart(2, '0')}:${quietHoursStart.getMinutes().toString().padStart(2, '0')}`;
      const endTime = `${quietHoursEnd.getHours().toString().padStart(2, '0')}:${quietHoursEnd.getMinutes().toString().padStart(2, '0')}`;
      
      // Update quiet hours for all alert types
      for (const alertConfig of ALERT_TYPES) {
        const currentSettings = settings.get(alertConfig.type);
        if (currentSettings?.quietHoursEnabled) {
          await updateAlertSetting(alertConfig.type, {
            quietHoursStart: startTime,
            quietHoursEnd: endTime,
          });
        }
      }
      
      setShowQuietHoursModal(false);
      showAlert({ title: 'Success', message: 'Quiet hours have been updated', type: 'success' });
      
    } catch (error) {
      console.error('Failed to update quiet hours:', error);
      showAlert({ title: 'Error', message: 'Failed to update quiet hours', type: 'error' });
    }
  };

  const renderAlertTypeCard = (alertConfig: AlertTypeConfig) => {
    const alertSettings = settings.get(alertConfig.type);
    
    return (
      <View key={alertConfig.type} style={[styles.alertCard, { backgroundColor: theme.surface }]}>
        <View style={styles.alertHeader}>
          <View style={styles.alertInfo}>
            <View style={[styles.alertIcon, { backgroundColor: alertConfig.color + '20' }]}>
              <Ionicons name={alertConfig.icon as any} size={20} color={alertConfig.color} />
            </View>
            <View style={styles.alertDetails}>
              <Text style={[styles.alertTitle, { color: theme.text }]}>{alertConfig.title}</Text>
              <Text style={[styles.alertDescription, { color: theme.textSecondary }]}>
                {alertConfig.description}
              </Text>
            </View>
          </View>
          
          <Switch
            value={alertSettings?.enabled ?? true}
            onValueChange={(enabled) => updateAlertSetting(alertConfig.type, { enabled })}
            trackColor={{ false: theme.border, true: alertConfig.color + '40' }}
            thumbColor={alertSettings?.enabled ? alertConfig.color : theme.textSecondary}
          />
        </View>

        {alertSettings?.enabled && (
          <View style={styles.alertControls}>
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>
                Style: {SOUND_STYLES.find(s => s.value === alertSettings.soundStyle)?.label || 'Normal'}
              </Text>
              <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>
                Volume: {Math.round(alertSettings.volume * 100)}%
              </Text>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.testButton, { backgroundColor: alertConfig.color + '20' }]}
                onPress={() => testAlert(alertConfig.type)}
                disabled={testingAlert === alertConfig.type}
              >
                {testingAlert === alertConfig.type ? (
                  <EduDashSpinner size="small" color={alertConfig.color} />
                ) : (
                  <Ionicons name="play" size={16} color={alertConfig.color} />
                )}
                <Text style={[styles.testButtonText, { color: alertConfig.color }]}>
                  {testingAlert === alertConfig.type ? 'Testing...' : 'Test'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.configButton, { backgroundColor: theme.border }]}
                onPress={() => {
                  setSelectedAlert(alertConfig.type);
                  setShowDetailModal(true);
                }}
              >
                <Ionicons name="settings" size={16} color={theme.textSecondary} />
                <Text style={[styles.configButtonText, { color: theme.textSecondary }]}>Config</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderDetailModal = () => {
    if (!selectedAlert) return null;
    
    const alertSettings = settings.get(selectedAlert);
    const alertConfig = ALERT_TYPES.find(a => a.type === selectedAlert);
    
    if (!alertSettings || !alertConfig) return null;

    return (
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{alertConfig.title}</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Sound Style */}
            <View style={styles.settingSection}>
              <Text style={[styles.settingTitle, { color: theme.text }]}>Sound Style</Text>
              {SOUND_STYLES.map((style) => (
                <TouchableOpacity
                  key={style.value}
                  style={[
                    styles.optionRow,
                    { backgroundColor: alertSettings.soundStyle === style.value ? theme.primary + '20' : 'transparent' }
                  ]}
                  onPress={() => updateAlertSetting(selectedAlert, { soundStyle: style.value })}
                >
                  <View>
                    <Text style={[styles.optionLabel, { color: theme.text }]}>{style.label}</Text>
                    <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>
                      {style.description}
                    </Text>
                  </View>
                  {alertSettings.soundStyle === style.value && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Volume */}
            <View style={styles.settingSection}>
              <Text style={[styles.settingTitle, { color: theme.text }]}>
                Volume: {Math.round(alertSettings.volume * 100)}%
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={alertSettings.volume}
                onValueChange={(volume) => updateAlertSetting(selectedAlert, { volume })}
                minimumTrackTintColor={alertConfig.color}
                maximumTrackTintColor={theme.border}
                thumbTintColor={alertConfig.color}
              />
            </View>

            {/* Haptic Feedback */}
            <View style={styles.settingSection}>
              <View style={styles.settingHeader}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Haptic Feedback</Text>
                <Switch
                  value={alertSettings.hapticEnabled}
                  onValueChange={(hapticEnabled) => updateAlertSetting(selectedAlert, { hapticEnabled })}
                  trackColor={{ false: theme.border, true: alertConfig.color + '40' }}
                  thumbColor={alertSettings.hapticEnabled ? alertConfig.color : theme.textSecondary}
                />
              </View>

              {alertSettings.hapticEnabled && (
                <View>
                  {HAPTIC_PATTERNS.map((pattern) => (
                    <TouchableOpacity
                      key={pattern.value}
                      style={[
                        styles.optionRow,
                        { backgroundColor: alertSettings.hapticPattern === pattern.value ? theme.primary + '20' : 'transparent' }
                      ]}
                      onPress={() => updateAlertSetting(selectedAlert, { hapticPattern: pattern.value })}
                    >
                      <View>
                        <Text style={[styles.optionLabel, { color: theme.text }]}>{pattern.label}</Text>
                        <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>
                          {pattern.description}
                        </Text>
                      </View>
                      {alertSettings.hapticPattern === pattern.value && (
                        <Ionicons name="checkmark" size={20} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* System Integration */}
            <View style={styles.settingSection}>
              <View style={styles.settingHeader}>
                <View>
                  <Text style={[styles.settingTitle, { color: theme.text }]}>Respect System Settings</Text>
                  <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                    Follow system do-not-disturb settings
                  </Text>
                </View>
                <Switch
                  value={alertSettings.respectSystemSettings}
                  onValueChange={(respectSystemSettings) => 
                    updateAlertSetting(selectedAlert, { respectSystemSettings })
                  }
                  trackColor={{ false: theme.border, true: theme.primary + '40' }}
                  thumbColor={alertSettings.respectSystemSettings ? theme.primary : theme.textSecondary}
                />
              </View>
            </View>

            {/* Quiet Hours */}
            <View style={styles.settingSection}>
              <View style={styles.settingHeader}>
                <View>
                  <Text style={[styles.settingTitle, { color: theme.text }]}>Quiet Hours</Text>
                  <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                    Suppress alerts during specified hours
                  </Text>
                </View>
                <Switch
                  value={alertSettings.quietHoursEnabled}
                  onValueChange={(quietHoursEnabled) => 
                    updateAlertSetting(selectedAlert, { quietHoursEnabled })
                  }
                  trackColor={{ false: theme.border, true: theme.primary + '40' }}
                  thumbColor={alertSettings.quietHoursEnabled ? theme.primary : theme.textSecondary}
                />
              </View>

              {alertSettings.quietHoursEnabled && (
                <TouchableOpacity
                  style={[styles.quietHoursButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setShowQuietHoursModal(true)}
                >
                  <Text style={[styles.quietHoursText, { color: theme.text }]}>
                    {alertSettings.quietHoursStart} - {alertSettings.quietHoursEnd}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderQuietHoursModal = () => (
    <Modal
      visible={showQuietHoursModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowQuietHoursModal(false)}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setShowQuietHoursModal(false)}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Quiet Hours</Text>
          <TouchableOpacity onPress={updateQuietHours}>
            <Text style={[styles.saveButton, { color: theme.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalContent}>
          <View style={styles.timePickerSection}>
            <Text style={[styles.timePickerLabel, { color: theme.text }]}>Start Time</Text>
            <TouchableOpacity
              style={[styles.timePickerButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setShowStartTimePicker(true)}
            >
              <Text style={[styles.timePickerText, { color: theme.text }]}>
                {quietHoursStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.timePickerSection}>
            <Text style={[styles.timePickerLabel, { color: theme.text }]}>End Time</Text>
            <TouchableOpacity
              style={[styles.timePickerButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setShowEndTimePicker(true)}
            >
              <Text style={[styles.timePickerText, { color: theme.text }]}>
                {quietHoursEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          </View>

          {showStartTimePicker && (
            <DateTimePicker
              value={quietHoursStart}
              mode="time"
              is24Hour={true}
              onChange={(event, selectedTime) => {
                setShowStartTimePicker(false);
                if (selectedTime) {
                  setQuietHoursStart(selectedTime);
                }
              }}
            />
          )}

          {showEndTimePicker && (
            <DateTimePicker
              value={quietHoursEnd}
              mode="time"
              is24Hour={true}
              onChange={(event, selectedTime) => {
                setShowEndTimePicker(false);
                if (selectedTime) {
                  setQuietHoursEnd(selectedTime);
                }
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Sound Alerts', headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading sound settings...
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Sound Alerts', headerShown: false }} />
      <ThemedStatusBar />
      
      {/* Header */}
      <SafeAreaView style={[styles.header, { backgroundColor: theme.background }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Sound Alerts</Text>
          <TouchableOpacity onPress={resetToDefaults} style={styles.resetButton}>
            <Text style={[styles.resetText, { color: theme.primary }]}>Reset</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* System Integration Card */}
        <View style={[styles.systemCard, { backgroundColor: theme.surface }]}>
          <View style={styles.systemHeader}>
            <Ionicons name="phone-portrait" size={24} color={theme.primary} />
            <Text style={[styles.systemTitle, { color: theme.text }]}>System Integration</Text>
          </View>
          <Text style={[styles.systemDescription, { color: theme.textSecondary }]}>
            Sound alerts integrate with your device's notification and do-not-disturb settings for seamless control.
          </Text>
          <TouchableOpacity
            style={[styles.systemButton, { backgroundColor: theme.primary + '20' }]}
            onPress={openSystemSettings}
          >
            <Text style={[styles.systemButtonText, { color: theme.primary }]}>
              Open System Settings
            </Text>
          </TouchableOpacity>
        </View>

        {/* Alert Types */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Alert Types</Text>
        {ALERT_TYPES.map(renderAlertTypeCard)}
      </ScrollView>

      {/* Modals */}
      {renderDetailModal()}
      {renderQuietHoursModal()}
      <AlertModal {...alertProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  resetButton: {
    padding: 8,
  },
  resetText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  systemCard: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  systemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  systemTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  systemDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  systemButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  systemButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  alertCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  alertInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertDetails: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  alertDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  alertControls: {
    paddingLeft: 52,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  controlLabel: {
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  testButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  configButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  configButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 24,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  settingSection: {
    marginBottom: 32,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  settingDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  quietHoursButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  quietHoursText: {
    fontSize: 14,
    fontWeight: '600',
  },
  timePickerSection: {
    marginBottom: 24,
  },
  timePickerLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  timePickerButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  timePickerText: {
    fontSize: 16,
    fontWeight: '600',
  },
});