import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgPrograms } from '@/hooks/useOrgPrograms';
import { useQuery } from '@tanstack/react-query';
import { extractOrganizationId } from '@/lib/tenant/compat';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function ManualEnrollmentScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const orgId = extractOrganizationId(profile);
  const { data: programs } = useOrgPrograms();
  
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [step, setStep] = useState<'program' | 'details'>('program');
  const [saving, setSaving] = useState(false);

  // Student details
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const { showAlert, alertProps } = useAlertModal();
  const selectedProgram = programs?.find((p) => p.id === selectedProgramId);

  const handleProgramSelect = (programId: string) => {
    setSelectedProgramId(programId);
    setStep('details');
  };

  const handleSave = async () => {
    // Validation
    if (!selectedProgramId) {
      showAlert({ title: 'Error', message: 'Please select a program', type: 'error' });
      return;
    }

    if (!email || !firstName || !lastName) {
      showAlert({ title: 'Error', message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const supabase = assertSupabase();

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', email.trim())
        .maybeSingle();

      let studentId: string;

      if (existingUser) {
        // Use existing user
        studentId = existingUser.id;
        
        // Update profile if needed
        await supabase
          .from('profiles')
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim() || null,
            organization_id: orgId,
          })
          .eq('id', studentId);
      } else {
        // Create new user account (this would typically require email verification)
        // For now, we'll create a profile entry and enrollment
        // In production, you'd want to use Supabase Auth.signUp
        
        // Create profile entry directly (simplified - production should use proper auth flow)
        const { data: newProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            email: email.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim() || null,
            role: 'student',
            organization_id: orgId,
          })
          .select('id')
          .single();

        if (profileError) throw profileError;
        studentId = newProfile.id;
      }

      // Create enrollment
      const { error: enrollError } = await supabase
        .from('enrollments')
        .insert({
          student_id: studentId,
          course_id: selectedProgramId,
          organization_id: orgId,
          is_active: true,
          enrollment_date: new Date().toISOString(),
          enrollment_notes: notes.trim() || null,
        });

      if (enrollError) throw enrollError;

      showAlert({
        title: 'Success!',
        message: `${firstName} ${lastName} has been enrolled in ${selectedProgram?.title || 'the program'}.`,
        type: 'success',
        buttons: [
          {
            text: 'Add Another',
            onPress: () => {
              // Reset form
              setEmail('');
              setFirstName('');
              setLastName('');
              setPhone('');
              setIdNumber('');
              setAddress('');
              setNotes('');
              setStep('program');
            },
          },
          {
            text: 'Done',
            onPress: () => router.back(),
          },
        ],
      });
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message || 'Failed to enroll student', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Manual Enrollment',
          headerStyle: { backgroundColor: theme.background },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.primary,
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
          {step === 'program' ? (
            <View style={styles.stepContainer}>
              <View style={styles.iconContainer}>
                <Ionicons name="school-outline" size={64} color={theme.primary} />
              </View>
              <Text style={styles.title}>Select Program</Text>
              <Text style={styles.subtitle}>
                Choose the program or learnership to enroll the student in
              </Text>

              {programs && programs.length > 0 ? (
                <View style={styles.programList}>
                  {programs.map((program) => (
                    <TouchableOpacity
                      key={program.id}
                      style={[styles.programCard, {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                      }]}
                      onPress={() => handleProgramSelect(program.id)}
                    >
                      <View style={styles.programInfo}>
                        <Text style={[styles.programTitle, { color: theme.text }]}>
                          {program.title}
                        </Text>
                        {program.course_code && (
                          <Text style={[styles.programCode, { color: theme.textSecondary }]}>
                            Code: {program.course_code}
                          </Text>
                        )}
                        {program.description && (
                          <Text style={[styles.programDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                            {program.description}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={24} color={theme.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="school-outline" size={48} color={theme.textSecondary} />
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    No programs available. Create a program first.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.stepContainer}>
              {selectedProgram && (
                <View style={[styles.selectedProgramCard, {
                  backgroundColor: theme.card,
                  borderColor: theme.primary,
                }]}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                  <Text style={[styles.selectedProgramText, { color: theme.text }]}>
                    {selectedProgram.title}
                  </Text>
                </View>
              )}

              <Text style={styles.title}>Student Information</Text>
              <Text style={styles.subtitle}>
                Enter the student's details to enroll them manually
              </Text>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>
                    Email Address <Text style={{ color: theme.error }}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: theme.card,
                      color: theme.text,
                      borderColor: theme.border,
                    }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="student@example.com"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      First Name <Text style={{ color: theme.error }}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, {
                        backgroundColor: theme.card,
                        color: theme.text,
                        borderColor: theme.border,
                      }]}
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="John"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      Last Name <Text style={{ color: theme.error }}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, {
                        backgroundColor: theme.card,
                        color: theme.text,
                        borderColor: theme.border,
                      }]}
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Doe"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>Phone Number</Text>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: theme.card,
                      color: theme.text,
                      borderColor: theme.border,
                    }]}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+27 12 345 6789"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>ID Number</Text>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: theme.card,
                      color: theme.text,
                      borderColor: theme.border,
                    }]}
                    value={idNumber}
                    onChangeText={setIdNumber}
                    placeholder="Optional"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>Address</Text>
                  <TextInput
                    style={[styles.textArea, {
                      backgroundColor: theme.card,
                      color: theme.text,
                      borderColor: theme.border,
                    }]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Optional"
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>Notes</Text>
                  <TextInput
                    style={[styles.textArea, {
                      backgroundColor: theme.card,
                      color: theme.text,
                      borderColor: theme.border,
                    }]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Additional enrollment notes (optional)"
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.secondaryButton, {
                      borderColor: theme.border,
                    }]}
                    onPress={() => setStep('program')}
                    disabled={saving}
                  >
                    <Text style={[styles.buttonText, { color: theme.text }]}>← Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: theme.primary }]}
                    onPress={handleSave}
                    disabled={saving || !email || !firstName || !lastName}
                  >
                    {saving ? (
                      <EduDashSpinner color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        <Text style={styles.primaryButtonText}>Enroll Student</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
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
    paddingBottom: 40,
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
  programList: {
    gap: 12,
    marginTop: 8,
  },
  programCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  programInfo: {
    flex: 1,
    gap: 4,
  },
  programTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  programCode: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  programDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  selectedProgramCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 8,
  },
  selectedProgramText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  form: {
    gap: 16,
    marginTop: 8,
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
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 10,
    gap: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

