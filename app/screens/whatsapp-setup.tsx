import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface WhatsAppSetupData {
  whatsapp_number: string;
  notifications_enabled: boolean;
  marketing_consent: boolean;
  verification_sent: boolean;
  verification_code: string;
}

export default function WhatsAppSetupScreen() {
  const { profile, refreshProfile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'verify'>('input');
  const [formData, setFormData] = useState<WhatsAppSetupData>({
    whatsapp_number: '',
    notifications_enabled: true,
    marketing_consent: false,
    verification_sent: false,
    verification_code: '',
  });

  const validatePhoneNumber = (phone: string): boolean => {
    // Remove all non-numeric characters
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Check if it's a valid length (8-15 digits) and starts with country code
    return cleanPhone.length >= 8 && cleanPhone.length <= 15 && cleanPhone.length > 0;
  };

  const formatPhoneNumber = (phone: string): string => {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add + prefix if not present
    if (!cleaned.startsWith('27') && cleaned.length === 10) {
      // South African number without country code
      cleaned = '27' + cleaned.substring(1);
    }
    
    return '+' + cleaned;
  };

  const handleSendVerification = async () => {
    if (!validatePhoneNumber(formData.whatsapp_number)) {
      showAlert({ title: 'Invalid Phone Number', message: 'Please enter a valid WhatsApp number including country code', type: 'warning' });
      return;
    }

    try {
      setLoading(true);
      const formattedNumber = formatPhoneNumber(formData.whatsapp_number);
      
      // TODO: Implement actual WhatsApp verification via Twilio or similar service
      // For now, we'll simulate the process
      
      track('whatsapp_verification_requested', {
        user_id: profile?.id,
        phone_number_country: formattedNumber.substring(0, 3), // Don't log full number
        has_marketing_consent: formData.marketing_consent,
      });

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setFormData(prev => ({ 
        ...prev, 
        verification_sent: true,
        whatsapp_number: formattedNumber 
      }));
      setStep('verify');
      
      showAlert({
        title: 'Verification Code Sent',
        message: `We've sent a verification code to ${formattedNumber} via WhatsApp. Please enter the code below.`,
        type: 'success',
      });
      
    } catch (error) {
      console.error('WhatsApp verification error:', error);
      showAlert({ title: 'Error', message: 'Failed to send verification code. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!formData.verification_code || formData.verification_code.length !== 6) {
      showAlert({ title: 'Invalid Code', message: 'Please enter the 6-digit verification code', type: 'warning' });
      return;
    }

    try {
      setLoading(true);
      
      // TODO: Verify code with WhatsApp service
      // For now, simulate verification (accept any 6-digit code)
      
      // Save WhatsApp data to user profile
      const { error } = await assertSupabase()
        .from('user_profiles')
        .update({
          whatsapp_number: formData.whatsapp_number,
          whatsapp_notifications_enabled: formData.notifications_enabled,
          whatsapp_verified: true,
          whatsapp_verified_at: new Date().toISOString(),
          marketing_consent: formData.marketing_consent,
        })
        .eq('id', profile?.id);

      if (error) {
        throw error;
      }

      // Track successful setup
      track('whatsapp_setup_completed', {
        user_id: profile?.id,
        notifications_enabled: formData.notifications_enabled,
        marketing_consent: formData.marketing_consent,
      });

      // Refresh profile to get updated data
      await refreshProfile?.();
      
      showAlert({
        title: 'WhatsApp Setup Complete!',
        message: formData.notifications_enabled 
          ? 'You will now receive important notifications via WhatsApp.'
          : 'WhatsApp setup complete. You can enable notifications later in settings.',
        type: 'success',
        buttons: [
          {
            text: 'Continue',
            onPress: () => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(app)');
              }
            }
          }
        ]
      });
      
    } catch (error) {
      console.error('WhatsApp verification error:', error);
      showAlert({ title: 'Verification Failed', message: 'Invalid code. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    showAlert({
      title: 'Skip WhatsApp Setup?',
      message: 'You can set up WhatsApp notifications later in your profile settings.',
      type: 'info',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'default',
          onPress: () => {
            track('whatsapp_setup_skipped', {
              user_id: profile?.id,
            });
            
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(app)');
            }
          }
        }
      ]
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'WhatsApp Setup', headerShown: false }} />
      <StatusBar style="light" />
      
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="logo-whatsapp" size={28} color="#25d366" />
            <Text style={styles.title}>WhatsApp Setup</Text>
          </View>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Step Indicator */}
        <View style={styles.stepIndicator}>
          <View style={[styles.step, { backgroundColor: '#25d366' }]}>
            <Text style={styles.stepText}>1</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={[
            styles.step, 
            { backgroundColor: step === 'verify' ? '#25d366' : '#374151' }
          ]}>
            <Text style={[styles.stepText, { 
              color: step === 'verify' ? '#ffffff' : '#9ca3af' 
            }]}>2</Text>
          </View>
        </View>

        {step === 'input' ? (
          <View style={styles.section}>
            <View style={styles.introSection}>
              <Ionicons name="chatbubbles" size={48} color="#25d366" />
              <Text style={styles.introTitle}>Stay Connected with WhatsApp</Text>
              <Text style={styles.introText}>
                Get instant notifications for important updates, alerts, and messages directly 
                to your WhatsApp. This helps ensure you never miss critical information about 
                your educational activities.
              </Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>WhatsApp Number</Text>
              <View style={styles.phoneInputContainer}>
                <TextInput
                  style={styles.phoneInput}
                  value={formData.whatsapp_number}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, whatsapp_number: text }))}
                  placeholder="+27123456789"
                  placeholderTextColor="#6b7280"
                  keyboardType="phone-pad"
                  maxLength={17}
                />
                <Ionicons name="logo-whatsapp" size={20} color="#25d366" />
              </View>
              <Text style={styles.helpText}>
                Include country code (e.g., +27 for South Africa)
              </Text>
            </View>

            <View style={styles.permissionsSection}>
              <View style={styles.permissionItem}>
                <View style={styles.permissionInfo}>
                  <Ionicons name="notifications" size={20} color="#3b82f6" />
                  <View style={styles.permissionText}>
                    <Text style={styles.permissionTitle}>WhatsApp Notifications</Text>
                    <Text style={styles.permissionDescription}>
                      Receive important updates and alerts
                    </Text>
                  </View>
                </View>
                <Switch
                  value={formData.notifications_enabled}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, notifications_enabled: value }))}
                  trackColor={{ false: '#374151', true: '#25d36620' }}
                  thumbColor={formData.notifications_enabled ? '#25d366' : '#9ca3af'}
                />
              </View>

              <View style={styles.permissionItem}>
                <View style={styles.permissionInfo}>
                  <Ionicons name="megaphone" size={20} color="#ec4899" />
                  <View style={styles.permissionText}>
                    <Text style={styles.permissionTitle}>Marketing Updates</Text>
                    <Text style={styles.permissionDescription}>
                      Receive news about new features and educational content
                    </Text>
                  </View>
                </View>
                <Switch
                  value={formData.marketing_consent}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, marketing_consent: value }))}
                  trackColor={{ false: '#374151', true: '#ec489920' }}
                  thumbColor={formData.marketing_consent ? '#ec4899' : '#9ca3af'}
                />
              </View>
            </View>

            <View style={styles.actionSection}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { opacity: loading || !formData.whatsapp_number ? 0.5 : 1 }
                ]}
                onPress={handleSendVerification}
                disabled={loading || !formData.whatsapp_number}
              >
                {loading ? (
                  <EduDashSpinner size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Send Verification Code</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.introSection}>
              <Ionicons name="shield-checkmark" size={48} color="#25d366" />
              <Text style={styles.introTitle}>Verify Your WhatsApp</Text>
              <Text style={styles.introText}>
                We sent a 6-digit verification code to {formData.whatsapp_number}. 
                Please enter the code below to complete setup.
              </Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Verification Code</Text>
              <TextInput
                style={styles.codeInput}
                value={formData.verification_code}
                onChangeText={(text) => setFormData(prev => ({ ...prev, verification_code: text }))}
                placeholder="000000"
                placeholderTextColor="#6b7280"
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
              />
            </View>

            <View style={styles.actionSection}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { opacity: loading || formData.verification_code.length !== 6 ? 0.5 : 1 }
                ]}
                onPress={handleVerifyCode}
                disabled={loading || formData.verification_code.length !== 6}
              >
                {loading ? (
                  <EduDashSpinner size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Verify & Complete Setup</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setStep('input')}
                disabled={loading}
              >
                <Ionicons name="arrow-back" size={16} color="#25d366" />
                <Text style={styles.secondaryButtonText}>Change Number</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.featureHighlights}>
          <Text style={styles.featuresTitle}>WhatsApp Integration Benefits</Text>
          
          <View style={styles.feature}>
            <Ionicons name="flash" size={16} color="#f59e0b" />
            <Text style={styles.featureText}>Instant notifications for urgent updates</Text>
          </View>
          
          <View style={styles.feature}>
            <Ionicons name="shield-checkmark" size={16} color="#10b981" />
            <Text style={styles.featureText}>Secure and encrypted communication</Text>
          </View>
          
          <View style={styles.feature}>
            <Ionicons name="settings" size={16} color="#6b7280" />
            <Text style={styles.featureText}>Full control over notification preferences</Text>
          </View>
          
          <View style={styles.feature}>
            <Ionicons name="people" size={16} color="#3b82f6" />
            <Text style={styles.featureText}>Direct communication with your school community</Text>
          </View>
        </View>
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  header: {
    backgroundColor: '#0b1220',
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
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  skipButton: {
    padding: 8,
  },
  skipText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    backgroundColor: '#111827',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#374151',
    marginHorizontal: 8,
  },
  section: {
    paddingHorizontal: 16,
  },
  introSection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    marginBottom: 24,
  },
  introTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  introText: {
    color: '#9ca3af',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  formSection: {
    marginBottom: 24,
  },
  formLabel: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  phoneInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    paddingVertical: 12,
    fontFamily: 'monospace',
  },
  codeInput: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 16,
    color: '#ffffff',
    fontSize: 24,
    fontFamily: 'monospace',
    letterSpacing: 4,
  },
  helpText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
  },
  permissionsSection: {
    marginBottom: 24,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  permissionInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permissionText: {
    flex: 1,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  permissionDescription: {
    color: '#9ca3af',
    fontSize: 14,
  },
  actionSection: {
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25d366',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#25d366',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: '#25d366',
    fontSize: 16,
    fontWeight: '600',
  },
  featureHighlights: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 16,
    margin: 16,
  },
  featuresTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  featureText: {
    color: '#9ca3af',
    fontSize: 14,
  },
});