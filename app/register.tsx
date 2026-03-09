import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
type ProgramInfo = {
  id: string;
  title: string;
  description: string | null;
  course_code: string;
  organizations: { id: string; name: string; slug: string | null } | null;
};

async function fetchProgramByCode(programCode: string): Promise<ProgramInfo | null> {
  const code = programCode.trim();
  if (!code) return null;
  const supabase = assertSupabase();

  // RPC response type
  interface ValidateProgramCodeResponse {
    valid: boolean;
    course?: { id: string; title: string; description?: string | null; course_code?: string };
    organization?: { id: string; name: string; slug?: string | null };
  }

  // Preferred: public RPC (works even when unauthenticated and RLS blocks direct SELECT)
  try {
    const { data, error } = await supabase.rpc('validate_program_code', { p_code: code });
    const response = data as ValidateProgramCodeResponse | null;
    if (!error && response?.valid) {
      const course = response.course;
      const org = response.organization;
      if (course?.id && course?.title) {
        return {
          id: String(course.id),
          title: String(course.title),
          description: course.description ?? null,
          course_code: String(course.course_code ?? ''),
          organizations: org?.id
            ? { id: String(org.id), name: String(org.name ?? ''), slug: org.slug ?? null }
            : null,
        };
      }
    }
  } catch {
    // Fall back below
  }

  // Fallback: direct query (works for authenticated users with appropriate RLS)
  const { data: legacy, error: legacyErr } = await supabase
    .from('courses')
    .select(
      `
          id,
          title,
          description,
          course_code,
          organizations (
            id,
            name,
            slug
          )
        `
    )
    .or(`course_code.eq.${code},id.eq.${code}`)
    .eq('is_active', true)
    .maybeSingle();

  if (legacyErr || !legacy) return null;
  return legacy as unknown as ProgramInfo;
}

export default function PublicRegistrationScreen() {
  const { theme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const params = useLocalSearchParams();
  const getParam = (key: string): string | undefined => {
    const value = (params as Record<string, string | string[] | undefined>)[key];
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value[0];
    return undefined;
  };
  const [step, setStep] = useState<'code' | 'details'>('code');
  const programCodeParam = getParam('code') || '';
  const [programCode, setProgramCode] = useState(programCodeParam);
  const [loading, setLoading] = useState(false);
  const [programInfo, setProgramInfo] = useState<ProgramInfo | null>(null);

  // Redirect logged-in users to enrollment screen
  useEffect(() => {
    if (!authLoading && user && programCodeParam) {
      // User is logged in and has a program code - redirect to enrollment screen
      router.replace({
        pathname: '/screens/learner/enroll-by-program-code',
        params: { code: programCodeParam },
      } as { pathname: `/${string}`; params: Record<string, string> });
    }
  }, [authLoading, user, programCodeParam]);

  // Form fields
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Fetch program by code
  const { data: program, isLoading: loadingProgram } = useQuery({
    queryKey: ['program-by-code', programCode],
    queryFn: async () => {
      if (!programCode) return null;
      return await fetchProgramByCode(programCode);
    },
    enabled: !!programCode && step === 'details',
  });

  useEffect(() => {
    if (program && step === 'code') {
      setProgramInfo(program);
      setStep('details');
    }
  }, [program, step]);

  const handleCodeSubmit = async () => {
    if (!programCode.trim()) {
      showAlert({ title: 'Error', message: 'Please enter a program code', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const data = await fetchProgramByCode(programCode);
      if (!data) {
        showAlert({ title: 'Invalid Code', message: 'The program code you entered is invalid or the program is no longer active.', type: 'error' });
        return;
      }

      setProgramInfo(data);
      setStep('details');
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message || 'Failed to verify program code', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    // Validation
    if (!email || !firstName || !lastName || !password) {
      showAlert({ title: 'Error', message: 'Please fill in all required fields', type: 'warning' });
      return;
    }

    if (password !== confirmPassword) {
      showAlert({ title: 'Error', message: 'Passwords do not match', type: 'warning' });
      return;
    }

    if (password.length < 8) {
      showAlert({ title: 'Error', message: 'Password must be at least 8 characters', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const supabase = assertSupabase();

      // Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim() || null,
            role: 'student',
            organization_id: programInfo?.organizations?.id,
          },
        },
      });

      if (authError) throw authError;

      // Update profile with organization_id if program has one
      // This must happen before enrollment to satisfy RLS policies
      // Wait a moment for the profile trigger to create the profile
      if (authData.user && programInfo?.organizations?.id) {
        // Small delay to ensure profile is created by trigger
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .upsert(
            { 
              id: authData.user.id,
              organization_id: programInfo.organizations.id,
              email: email.trim(),
              role: 'student',
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              phone: phone.trim() || null,
            },
            { onConflict: 'id' }
          );

        if (profileUpdateError) {
          console.warn('Profile update error (non-fatal):', profileUpdateError);
          // Continue anyway - enrollment might still work
        }
      }

      // Auto-enroll in program
      if (authData.user && programInfo) {
        const { error: enrollError } = await supabase
          .from('enrollments')
          .insert({
            student_id: authData.user.id,
            course_id: programInfo.id,
            enrollment_method: 'join_code',
            is_active: true,
            enrolled_at: new Date().toISOString(),
          });

        if (enrollError) {
          console.error('Enrollment error:', enrollError);
          // Don't fail registration if enrollment fails - user can enroll manually
        }
      }

      showAlert({
        title: 'Registration Successful!',
        message: 'Your account has been created. Please check your email to verify your account, then log in to access the program.',
        type: 'success',
        buttons: [
          { text: 'Go to Sign In', onPress: () => router.replace('/(auth)/sign-in') },
        ],
      });
    } catch (error: any) {
      showAlert({ title: 'Registration Failed', message: error.message || 'Failed to create account', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Register for Program',
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
          headerShown: true,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'code' ? (
            <View style={styles.stepContainer}>
              <View style={styles.iconContainer}>
                <Ionicons name="school-outline" size={64} color={theme.primary} />
              </View>
              <Text style={styles.title}>Enter Program Code</Text>
              <Text style={styles.subtitle}>
                Enter the program code provided by your organization to register
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Program Code</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                  value={programCode}
                  onChangeText={setProgramCode}
                  placeholder="ABC-123456"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.primary }]}
                onPress={handleCodeSubmit}
                disabled={loading || !programCode.trim()}
              >
                {loading ? (
                  <EduDashSpinner color="#fff" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => router.replace('/(auth)/sign-in')}
              >
                <Text style={[styles.linkText, { color: theme.primary }]}>
                  Already have an account? Sign In
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.stepContainer}>
              {programInfo && (
                <View style={[styles.programCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.programTitle, { color: theme.text }]}>
                    {programInfo.title}
                  </Text>
                  {programInfo.organizations && (
                    <Text style={[styles.orgName, { color: theme.textSecondary }]}>
                      {programInfo.organizations.name}
                    </Text>
                  )}
                </View>
              )}

              <Text style={styles.title}>Create Your Account</Text>
              <Text style={styles.subtitle}>
                Fill in your details to register and enroll in this program
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>First Name *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="John"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Last Name *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Doe"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone Number (Optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+27 12 345 6789"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minimum 8 characters"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm Password *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.primary }]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <EduDashSpinner color="#fff" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Register & Enroll</Text>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => setStep('code')}
              >
                <Text style={[styles.linkText, { color: theme.primary }]}>
                  ← Back to Code Entry
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 24,
  },
  stepContainer: {
    gap: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  programCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  programTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  orgName: {
    fontSize: 14,
    marginTop: 4,
  },
  inputGroup: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    padding: 12,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

