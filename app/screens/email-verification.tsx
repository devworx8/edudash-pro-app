import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useTheme } from '@/contexts/ThemeContext';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface VerificationStatus {
  success: boolean;
  message: string;
  school_id?: string;
  next_step?: string;
}

export default function EmailVerificationScreen() {
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const { token, email, schoolName } = params as { token?: string; email?: string; schoolName?: string };
  const { showAlert, alertProps } = useAlertModal();

  const [verificationToken, setVerificationToken] = useState(token || '');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string>('');

  // Auto-verify if token is provided in URL
  useEffect(() => {
    if (token && token.length > 0) {
      handleVerification();
    }
  }, [token]);

  const handleVerification = async () => {
    if (!verificationToken || verificationToken.length < 10) {
      showAlert({ title: 'Invalid Token', message: 'Please enter a valid verification token.', type: 'warning' });
      return;
    }

    setVerifying(true);
    setLoading(true);

    try {
      // Call the verify_school RPC function
      const { data, error } = await assertSupabase().rpc('verify_school', {
        p_verification_token: verificationToken
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Successful verification
      const verificationData = data as VerificationStatus;
      setVerified(true);
      setSchoolId(verificationData.school_id || null);
      setVerificationMessage(verificationData.message || 'Email verification successful!');

      track('school_email_verified', {
        school_id: verificationData.school_id,
        verification_method: token ? 'auto_link' : 'manual_token'
      });

      // Show success message with next steps
      showAlert({
        title: 'Verification Successful!',
        message: `${verificationData.message}\n\nYour school registration is now verified. You can proceed with the next steps in your onboarding process.`,
        type: 'success',
        buttons: [
          {
            text: 'Continue Setup',
            onPress: () => {
              if (verificationData.school_id) {
                // Navigate to the next step in onboarding
                router.push({
                  pathname: '/screens/principal-onboarding',
                  params: { 
                    schoolId: verificationData.school_id,
                    step: 'principal_account'
                  }
                });
              } else {
                router.back();
              }
            }
          }
        ]
      });

    } catch (error: any) {
      console.error('Email verification failed:', error);
      
      let errorMessage = 'Verification failed. Please try again.';
      
      if (error.message?.includes('expired')) {
        errorMessage = 'This verification link has expired. Please request a new verification email.';
      } else if (error.message?.includes('already verified')) {
        errorMessage = 'This email has already been verified. You can proceed with your school setup.';
      } else if (error.message?.includes('not found')) {
        errorMessage = 'Invalid verification token. Please check your email for the correct link.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showAlert({ title: 'Verification Failed', message: errorMessage, type: 'error' });
      
      track('school_email_verification_failed', {
        error: error.message,
        verification_method: token ? 'auto_link' : 'manual_token'
      });
    } finally {
      setVerifying(false);
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      showAlert({
        title: 'Email Required',
        message: 'Please provide the school email address to resend verification.',
        type: 'warning',
      });
      return;
    }

    setResending(true);

    try {
      // Call RPC function to resend verification (we'd need to create this)
      const { data, error } = await assertSupabase().rpc('resend_school_verification', {
        p_email: email
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      showAlert({
        title: 'Verification Email Sent',
        message: 'A new verification email has been sent. Please check your inbox and spam folder.',
        type: 'success',
      });

      track('school_verification_resent', {
        email: email
      });

    } catch (error: any) {
      console.error('Failed to resend verification:', error);
      showAlert({
        title: 'Failed to Resend',
        message: error.message || 'Could not resend verification email. Please try again later.',
        type: 'error',
      });
    } finally {
      setResending(false);
    }
  };

  const getHeaderText = () => {
    if (verified) {
      return 'Verification Complete';
    }
    if (token) {
      return 'Verifying Your Email';
    }
    return 'Verify Your Email';
  };

  const getSubHeaderText = () => {
    if (verified) {
      return 'Your school email has been successfully verified.';
    }
    if (token) {
      return 'Please wait while we verify your email address...';
    }
    return 'Enter the verification code from your email to continue.';
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: 'Email Verification',
        headerStyle: { backgroundColor: theme.headerBackground },
        headerTitleStyle: { color: theme.headerText },
        headerTintColor: theme.headerTint
      }} />
      <ThemedStatusBar />
      
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView 
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            {/* Header Section */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons 
                  name={verified ? "checkmark-circle" : "mail-outline"} 
                  size={64} 
                  color={verified ? "#10b981" : "#00f5ff"} 
                />
              </View>
              
              <Text style={styles.headerTitle}>{getHeaderText()}</Text>
              <Text style={styles.headerSubtitle}>{getSubHeaderText()}</Text>
              
              {schoolName && (
                <View style={styles.schoolInfo}>
                  <Text style={styles.schoolLabel}>School:</Text>
                  <Text style={styles.schoolName}>{schoolName}</Text>
                </View>
              )}
              
              {email && (
                <View style={styles.schoolInfo}>
                  <Text style={styles.schoolLabel}>Email:</Text>
                  <Text style={styles.schoolEmail}>{email}</Text>
                </View>
              )}
            </View>

            {/* Verification Section */}
            {!verified && (
              <View style={styles.verificationSection}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Verification Code</Text>
                  <TextInput
                    style={styles.tokenInput}
                    value={verificationToken}
                    onChangeText={setVerificationToken}
                    placeholder="Enter verification code from email"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!verifying}
                    multiline={false}
                    maxLength={64}
                  />
                  <Text style={styles.inputHint}>
                    Check your email for a verification code or click the verification link
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    verifying && styles.verifyButtonLoading
                  ]}
                  onPress={handleVerification}
                  disabled={verifying || !verificationToken}
                >
                  {verifying ? (
                    <EduDashSpinner color="#000" size="small" />
                  ) : (
                    <Text style={styles.verifyButtonText}>Verify Email</Text>
                  )}
                </TouchableOpacity>

                {/* Resend Section */}
                <View style={styles.resendSection}>
                  <Text style={styles.resendText}>Didn't receive the email?</Text>
                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={handleResendVerification}
                    disabled={resending || !email}
                  >
                    {resending ? (
                      <EduDashSpinner color="#00f5ff" size="small" />
                    ) : (
                      <Text style={styles.resendButtonText}>Resend Verification</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Success Section */}
            {verified && (
              <View style={styles.successSection}>
                <View style={styles.successCard}>
                  <Text style={styles.successTitle}>Email Verified Successfully!</Text>
                  <Text style={styles.successMessage}>{verificationMessage}</Text>
                  
                  <View style={styles.nextStepsContainer}>
                    <Text style={styles.nextStepsTitle}>Next Steps:</Text>
                    <View style={styles.stepItem}>
                      <Ionicons name="checkmark-circle-outline" size={20} color="#10b981" />
                      <Text style={styles.stepText}>Email verification completed</Text>
                    </View>
                    <View style={styles.stepItem}>
                      <Ionicons name="person-outline" size={20} color="#00f5ff" />
                      <Text style={styles.stepText}>Set up your principal account</Text>
                    </View>
                    <View style={styles.stepItem}>
                      <Ionicons name="card-outline" size={20} color="#6B7280" />
                      <Text style={styles.stepText}>Choose your subscription plan</Text>
                    </View>
                    <View style={styles.stepItem}>
                      <Ionicons name="school-outline" size={20} color="#6B7280" />
                      <Text style={styles.stepText}>Complete school setup</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={() => {
                    if (schoolId) {
                      router.push({
                        pathname: '/screens/principal-onboarding',
                        params: { 
                          schoolId: schoolId,
                          step: 'principal_account'
                        }
                      });
                    } else {
                      router.back();
                    }
                  }}
                >
                  <Text style={styles.continueButtonText}>Continue Setup</Text>
                  <Ionicons name="arrow-forward" size={20} color="#000" />
                </TouchableOpacity>
              </View>
            )}

            {/* Help Section */}
            <View style={styles.helpSection}>
              <Text style={styles.helpTitle}>Need Help?</Text>
              <Text style={styles.helpText}>
                If you're having trouble with email verification:
              </Text>
              <View style={styles.helpList}>
                <Text style={styles.helpItem}>• Check your spam/junk folder</Text>
                <Text style={styles.helpItem}>• Ensure the email address is correct</Text>
                <Text style={styles.helpItem}>• Try resending the verification email</Text>
                <Text style={styles.helpItem}>• Contact support if issues persist</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <AlertModal {...alertProps} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    marginBottom: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  schoolInfo: {
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  schoolLabel: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
    minWidth: 50,
  },
  schoolName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  schoolEmail: {
    color: '#00f5ff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  verificationSection: {
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  tokenInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 48,
  },
  inputHint: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
  },
  verifyButton: {
    backgroundColor: '#00f5ff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  verifyButtonLoading: {
    opacity: 0.8,
  },
  verifyButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  resendSection: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  resendText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 12,
  },
  resendButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  resendButtonText: {
    color: '#00f5ff',
    fontSize: 14,
    fontWeight: '600',
  },
  successSection: {
    marginBottom: 32,
  },
  successCard: {
    backgroundColor: '#111827',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10b981',
    marginBottom: 24,
  },
  successTitle: {
    color: '#10b981',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  successMessage: {
    color: '#E5E7EB',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  nextStepsContainer: {
    marginTop: 16,
  },
  nextStepsTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepText: {
    color: '#E5E7EB',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  continueButton: {
    backgroundColor: '#00f5ff',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  helpSection: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  helpTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  helpText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 12,
  },
  helpList: {
    gap: 4,
  },
  helpItem: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
  },
});