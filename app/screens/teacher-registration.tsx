import React from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import EnhancedRegistrationForm from '@/components/auth/EnhancedRegistrationForm';
import { EnhancedRegistration } from '@/types/auth-enhanced';
import { assertSupabase } from '@/lib/supabase';
import { buildEduDashWebUrl } from '@/lib/config/urls';

export default function TeacherRegistrationScreen() {
  const { theme } = useTheme();

  const handleRegistrationSuccess = async (registration: EnhancedRegistration) => {
    try {
      // Create user account with Supabase Auth
      const { data: authData, error: authError } = await assertSupabase().auth.signUp({
        email: registration.email,
        password: registration.password,
        options: {
          emailRedirectTo: buildEduDashWebUrl('/landing?flow=email-confirm'),
          data: {
            first_name: registration.firstName,
            last_name: registration.lastName,
            phone: registration.phone,
            role: 'teacher',
          }
        }
      });

      if (authError) throw authError;

      // If confirmations are enabled, no session is returned until the email is verified
      if (!authData.session) {
        router.replace({
          pathname: '/screens/verify-your-email',
          params: { email: registration.email }
        } as any);
        return;
      }

      // Navigate to teacher dashboard when already verified/logged in
      router.replace('/screens/teacher-dashboard');
    } catch (error: any) {
      console.error('Registration error:', error);
      handleRegistrationError(error.message || 'Registration failed');
    }
  };

  const handleRegistrationError = (error: string) => {
    console.error('Registration error:', error);
    // Error handling is done by the form component
  };

  const handleCancel = () => {
    router.back();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: Platform.OS === 'ios' ? 20 : 40,
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Teacher Registration',
          headerShown: true,
          headerStyle: {
            backgroundColor: theme.surface,
          },
          headerTitleStyle: {
            color: theme.text,
          },
          headerTintColor: theme.primary,
        }}
      />
      
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <EnhancedRegistrationForm
            role="teacher"
            onSuccess={handleRegistrationSuccess}
            onCancel={handleCancel}
            onError={handleRegistrationError}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
