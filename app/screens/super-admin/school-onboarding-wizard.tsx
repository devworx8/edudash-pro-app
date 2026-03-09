import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Switch, Platform, KeyboardAvoidingView } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { listActivePlans } from '@/lib/subscriptions/rpc-subscriptions';
import { track } from '@/lib/analytics';
import { isSuperAdmin } from '@/lib/roleUtils';
import { useBottomInset } from '@/hooks/useBottomInset';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Form data interfaces
interface SchoolData {
  name: string;
  schoolType: 'preschool' | 'k12_school';
  gradeLevels: string[];
  contactEmail: string;
  contactPhone: string;
  physicalAddress: string;
  notes: string;
}

interface PrincipalData {
  name: string;
  email: string;
}

interface SubscriptionData {
  planId?: string;
  seats?: number;
  autoActivate: boolean;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  price_monthly: number;
  max_teachers: number;
  max_students: number;
  school_types: string[];
}

// Grade levels by school type
const GRADE_LEVELS = {
  preschool: [
    { id: 'infants', label: 'Infants (6m-12m)' },
    { id: 'toddlers', label: 'Toddlers (1-2 years)' },
    { id: 'pre_k', label: 'Pre-K (3-4 years)' },
    { id: 'reception', label: 'Reception (4-5 years)' }
  ],
  k12_school: [
    { id: 'foundation', label: 'Foundation Phase (Grade R-3)' },
    { id: 'intermediate', label: 'Intermediate Phase (Grade 4-6)' },
    { id: 'senior', label: 'Senior Phase (Grade 7-9)' },
    { id: 'fet', label: 'FET Phase (Grade 10-12)' }
  ]
};

export default function SuperAdminSchoolOnboardingWizard() {
  const { user, profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const bottomInset = useBottomInset();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Subscription plans
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [filteredPlans, setFilteredPlans] = useState<SubscriptionPlan[]>([]);

  // Form data
  const [schoolData, setSchoolData] = useState<SchoolData>({
    name: '',
    schoolType: 'preschool',
    gradeLevels: [],
    contactEmail: '',
    contactPhone: '',
    physicalAddress: '',
    notes: ''
  });

  const [principalData, setPrincipalData] = useState<PrincipalData>({
    name: '',
    email: ''
  });

  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData>({
    planId: undefined,
    seats: 5,
    autoActivate: true
  });

  // Form errors
  const [errors, setErrors] = useState<any>({});

  // Check if current user is superadmin
  useEffect(() => {
    if (profile && !isSuperAdmin(profile.role)) {
      showAlert({
        title: 'Access Denied',
        message: 'This screen is only accessible to superadmins.',
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => router.back() }],
      });
    }
  }, [profile]);

  // Load subscription plans
  useEffect(() => {
    loadPlans();
  }, []);

  // Filter plans based on school type
  useEffect(() => {
    if (plans.length > 0) {
      const filtered = plans.filter(plan => 
        !plan.school_types || 
        plan.school_types.length === 0 || 
        plan.school_types.includes(schoolData.schoolType) ||
        plan.school_types.includes('hybrid')
      );
      setFilteredPlans(filtered);
    }
  }, [plans, schoolData.schoolType]);

  const loadPlans = async () => {
    try {
      const data = await listActivePlans(assertSupabase());
      const normalized = (data || []).map((plan: any) => ({
        ...plan,
        school_types: Array.isArray(plan.school_types) ? plan.school_types : [],
      }));
      setPlans(normalized);
    } catch (error) {
      console.error('Failed to load subscription plans:', error);
    }
  };

  // Get available grade levels for current school type
  const availableGradeLevels = useMemo(() => {
    return GRADE_LEVELS[schoolData.schoolType] || [];
  }, [schoolData.schoolType]);

  // Validation functions
  const validateStep = (step: number): boolean => {
    const newErrors: any = {};

    if (step >= 1) {
      if (!schoolData.name.trim()) {
        newErrors.schoolName = 'School name is required';
      }
      if (schoolData.gradeLevels.length === 0) {
        newErrors.gradeLevels = 'At least one grade level must be selected';
      }
      if (!schoolData.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(schoolData.contactEmail)) {
        newErrors.contactEmail = 'Valid contact email is required';
      }
    }

    if (step >= 2) {
      if (!principalData.name.trim()) {
        newErrors.principalName = 'Principal name is required';
      }
      if (!principalData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(principalData.email)) {
        newErrors.principalEmail = 'Valid principal email is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Update functions
  const updateSchoolData = (field: keyof SchoolData, value: any) => {
    setSchoolData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev: any) => ({ ...prev, [field]: undefined }));
    }
  };

  const updatePrincipalData = (field: keyof PrincipalData, value: string) => {
    setPrincipalData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev: any) => ({ ...prev, [field]: undefined }));
    }
  };

  const updateSubscriptionData = (field: keyof SubscriptionData, value: any) => {
    setSubscriptionData(prev => ({ ...prev, [field]: value }));
  };

  // Toggle grade level
  const toggleGradeLevel = (levelId: string) => {
    const updated = schoolData.gradeLevels.includes(levelId)
      ? schoolData.gradeLevels.filter(id => id !== levelId)
      : [...schoolData.gradeLevels, levelId];
    updateSchoolData('gradeLevels', updated);
  };

  // Step navigation
  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // Handle school creation
  const handleCreateSchool = async () => {
    if (!validateStep(totalSteps) || creating) return;

    setCreating(true);

    try {
      // Prepare the data for the RPC call
      const schoolDataPayload = {
        name: schoolData.name.trim(),
        school_type: schoolData.schoolType,
        grade_levels: schoolData.gradeLevels,
        contact_email: schoolData.contactEmail.trim(),
        contact_phone: schoolData.contactPhone.trim() || null,
        physical_address: schoolData.physicalAddress.trim() || null,
        notes: schoolData.notes.trim() || null
      };

      const principalDataPayload = {
        name: principalData.name.trim(),
        email: principalData.email.trim()
      };

      const subscriptionDataPayload = subscriptionData.planId ? {
        plan_id: subscriptionData.planId,
        seats: subscriptionData.seats || 5,
        auto_activate: subscriptionData.autoActivate
      } : null;

      // Call the superadmin_onboard_school RPC function
      const { data, error } = await assertSupabase().rpc('superadmin_onboard_school', {
        p_school_data: schoolDataPayload,
        p_principal_data: principalDataPayload,
        p_subscription_data: subscriptionDataPayload
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      track('superadmin_school_created', {
        school_type: schoolData.schoolType,
        grade_levels: schoolData.gradeLevels,
        has_subscription: !!subscriptionData.planId,
        school_id: data.school_id
      });

      showAlert({
        title: 'School Created Successfully!',
        message: `${schoolData.name} has been created and configured. ${subscriptionData.planId ? 'The subscription is active.' : ''} You can now send the principal invitation or manage the school settings.`,
        type: 'success',
        buttons: [
          {
            text: 'View School',
            onPress: () => {
              router.push({
                pathname: '/screens/super-admin/school-details',
                params: { schoolId: data.school_id }
              });
            }
          },
          {
            text: 'Create Another',
            onPress: () => {
              // Reset form
              setSchoolData({
                name: '',
                schoolType: 'preschool',
                gradeLevels: [],
                contactEmail: '',
                contactPhone: '',
                physicalAddress: '',
                notes: ''
              });
              setPrincipalData({ name: '', email: '' });
              setSubscriptionData({ planId: undefined, seats: 5, autoActivate: true });
              setCurrentStep(1);
            }
          }
        ],
      });

    } catch (error: any) {
      console.error('School creation failed:', error);
      
      showAlert({
        title: 'School Creation Failed',
        message: error.message || 'Failed to create school. Please try again.',
        type: 'error',
      });
      
      track('superadmin_school_creation_failed', {
        error: error.message,
        school_type: schoolData.schoolType
      });
    } finally {
      setCreating(false);
    }
  };

  // Step indicator
  const StepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3, 4].map(step => (
        <View key={step} style={styles.stepItem}>
          <View style={[
            styles.stepCircle,
            step <= currentStep && styles.stepCircleActive
          ]}>
            <Text style={[
              styles.stepNumber,
              step <= currentStep && styles.stepNumberActive
            ]}>
              {step}
            </Text>
          </View>
          <Text style={[
            styles.stepLabel,
            step === currentStep && styles.stepLabelActive
          ]}>
            {step === 1 && 'School Info'}
            {step === 2 && 'Principal'}
            {step === 3 && 'Subscription'}
            {step === 4 && 'Review'}
          </Text>
        </View>
      ))}
    </View>
  );

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.sectionTitle}>School Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>School Name *</Text>
              <TextInput
                style={[styles.textInput, errors.schoolName && styles.inputError]}
                value={schoolData.name}
                onChangeText={(value) => updateSchoolData('name', value)}
                placeholder="e.g. Bright Beginnings Preschool"
                placeholderTextColor="#6B7280"
                autoCapitalize="words"
              />
              {errors.schoolName && <Text style={styles.errorText}>{errors.schoolName}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>School Type *</Text>
              <View style={styles.segmentedControl}>
                {(['preschool', 'k12_school'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.segmentButton,
                      schoolData.schoolType === type && styles.segmentButtonActive
                    ]}
                    onPress={() => updateSchoolData('schoolType', type)}
                  >
                    <Text style={[
                      styles.segmentButtonText,
                      schoolData.schoolType === type && styles.segmentButtonTextActive
                    ]}>
                      {type === 'preschool' && 'Preschool'}
                      {type === 'k12_school' && 'K-12 School'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Grade Levels *</Text>
              <View style={styles.gradeLevelContainer}>
                {availableGradeLevels.map(level => (
                  <TouchableOpacity
                    key={level.id}
                    style={[
                      styles.gradeLevelOption,
                      schoolData.gradeLevels.includes(level.id) && styles.gradeLevelOptionSelected
                    ]}
                    onPress={() => toggleGradeLevel(level.id)}
                  >
                    <View style={[
                      styles.checkbox,
                      schoolData.gradeLevels.includes(level.id) && styles.checkboxSelected
                    ]} />
                    <Text style={styles.gradeLevelLabel}>{level.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.gradeLevels && <Text style={styles.errorText}>{errors.gradeLevels}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Contact Email *</Text>
              <TextInput
                style={[styles.textInput, errors.contactEmail && styles.inputError]}
                value={schoolData.contactEmail}
                onChangeText={(value) => updateSchoolData('contactEmail', value)}
                placeholder="info@school.com"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {errors.contactEmail && <Text style={styles.errorText}>{errors.contactEmail}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Contact Phone</Text>
              <TextInput
                style={styles.textInput}
                value={schoolData.contactPhone}
                onChangeText={(value) => updateSchoolData('contactPhone', value)}
                placeholder="+27 11 123 4567"
                placeholderTextColor="#6B7280"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Physical Address</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={schoolData.physicalAddress}
                onChangeText={(value) => updateSchoolData('physicalAddress', value)}
                placeholder="Full physical address"
                placeholderTextColor="#6B7280"
                multiline={true}
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Admin Notes</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={schoolData.notes}
                onChangeText={(value) => updateSchoolData('notes', value)}
                placeholder="Internal notes about this school (not visible to school staff)"
                placeholderTextColor="#6B7280"
                multiline={true}
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.sectionTitle}>Principal Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Principal Name *</Text>
              <TextInput
                style={[styles.textInput, errors.principalName && styles.inputError]}
                value={principalData.name}
                onChangeText={(value) => updatePrincipalData('name', value)}
                placeholder="Dr. Jane Smith"
                placeholderTextColor="#6B7280"
                autoCapitalize="words"
              />
              {errors.principalName && <Text style={styles.errorText}>{errors.principalName}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Principal Email *</Text>
              <TextInput
                style={[styles.textInput, errors.principalEmail && styles.inputError]}
                value={principalData.email}
                onChangeText={(value) => updatePrincipalData('email', value)}
                placeholder="principal@school.com"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.inputHint}>This will be their login email for the platform</Text>
              {errors.principalEmail && <Text style={styles.errorText}>{errors.principalEmail}</Text>}
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Principal Account Setup</Text>
              <Text style={styles.infoText}>
                • A principal account will be created with the provided email{'\n'}
                • They will receive an invitation email to set their password{'\n'}
                • They can immediately access their school dashboard once activated{'\n'}
                • You can resend invitations from the school management screen
              </Text>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.sectionTitle}>Subscription Setup</Text>
            
            <View style={styles.inputGroup}>
              <View style={styles.switchRow}>
                <Text style={styles.inputLabel}>Create Subscription</Text>
                <Switch
                  value={!!subscriptionData.planId}
                  onValueChange={(value) => {
                    if (!value) {
                      updateSubscriptionData('planId', undefined);
                    }
                  }}
                  trackColor={{ false: '#1f2937', true: '#0ea5b6' }}
                  thumbColor={subscriptionData.planId ? '#00f5ff' : '#9CA3AF'}
                />
              </View>
              <Text style={styles.inputHint}>
                Toggle off if you want to create the school without a subscription
              </Text>
            </View>

            {subscriptionData.planId !== undefined && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Subscription Plan</Text>
                  <View style={styles.planSelector}>
                    {filteredPlans.map(plan => (
                      <TouchableOpacity
                        key={plan.id}
                        style={[
                          styles.planOption,
                          subscriptionData.planId === plan.id && styles.planOptionSelected
                        ]}
                        onPress={() => updateSubscriptionData('planId', plan.id)}
                      >
                        <View style={styles.planInfo}>
                          <Text style={styles.planName}>{plan.name}</Text>
                          <Text style={styles.planDetails}>
                            R{plan.price_monthly}/month • {plan.max_teachers} teachers • {plan.max_students} students
                          </Text>
                        </View>
                        <View style={[
                          styles.radioButton,
                          subscriptionData.planId === plan.id && styles.radioButtonSelected
                        ]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Teacher Seats</Text>
                  <TextInput
                    style={styles.textInput}
                    value={String(subscriptionData.seats)}
                    onChangeText={(value) => updateSubscriptionData('seats', parseInt(value) || 5)}
                    placeholder="5"
                    placeholderTextColor="#6B7280"
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputHint}>Number of teacher accounts to provision</Text>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.switchRow}>
                    <Text style={styles.inputLabel}>Auto-activate Subscription</Text>
                    <Switch
                      value={subscriptionData.autoActivate}
                      onValueChange={(value) => updateSubscriptionData('autoActivate', value)}
                      trackColor={{ false: '#1f2937', true: '#0ea5b6' }}
                      thumbColor={subscriptionData.autoActivate ? '#00f5ff' : '#9CA3AF'}
                    />
                  </View>
                  <Text style={styles.inputHint}>
                    If enabled, the subscription will be immediately active
                  </Text>
                </View>
              </>
            )}
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.sectionTitle}>Review & Create School</Text>
            
            <View style={styles.reviewCard}>
              <Text style={styles.reviewCardTitle}>School Information</Text>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewLabel}>Name:</Text>
                <Text style={styles.reviewValue}>{schoolData.name}</Text>
              </View>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewLabel}>Type:</Text>
                <Text style={styles.reviewValue}>
                  {schoolData.schoolType === 'preschool' && 'Preschool'}
                  {schoolData.schoolType === 'k12_school' && 'K-12 School'}
                </Text>
              </View>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewLabel}>Grade Levels:</Text>
                <Text style={styles.reviewValue}>{schoolData.gradeLevels.length} selected</Text>
              </View>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewLabel}>Contact:</Text>
                <Text style={styles.reviewValue}>{schoolData.contactEmail}</Text>
              </View>
            </View>

            <View style={styles.reviewCard}>
              <Text style={styles.reviewCardTitle}>Principal</Text>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewLabel}>Name:</Text>
                <Text style={styles.reviewValue}>{principalData.name}</Text>
              </View>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewLabel}>Email:</Text>
                <Text style={styles.reviewValue}>{principalData.email}</Text>
              </View>
            </View>

            <View style={styles.reviewCard}>
              <Text style={styles.reviewCardTitle}>Subscription</Text>
              {subscriptionData.planId ? (
                <>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Plan:</Text>
                    <Text style={styles.reviewValue}>
                      {filteredPlans.find(p => p.id === subscriptionData.planId)?.name || 'Selected Plan'}
                    </Text>
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Seats:</Text>
                    <Text style={styles.reviewValue}>{subscriptionData.seats}</Text>
                  </View>
                  <View style={styles.reviewItem}>
                    <Text style={styles.reviewLabel}>Status:</Text>
                    <Text style={styles.reviewValue}>
                      {subscriptionData.autoActivate ? 'Will be activated' : 'Pending activation'}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.reviewValue}>No subscription will be created</Text>
              )}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: 'Create School',
        headerStyle: { backgroundColor: '#0b1220' },
        headerTitleStyle: { color: '#fff' },
        headerTintColor: '#00f5ff'
      }} />
      <StatusBar style="light" backgroundColor="#0b1220" />
      
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView 
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <StepIndicator />
            {renderStepContent()}
          </ScrollView>
          
          <View style={[styles.navigationContainer, { paddingBottom: bottomInset + 16 }]}>
            {currentStep > 1 && (
              <TouchableOpacity style={styles.backButton} onPress={prevStep}>
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[
                styles.nextButton,
                (currentStep === totalSteps && creating) && styles.nextButtonLoading
              ]}
              onPress={currentStep === totalSteps ? handleCreateSchool : nextStep}
              disabled={creating}
            >
              {creating ? (
                <EduDashSpinner color="#000" size="small" />
              ) : (
                <Text style={styles.nextButtonText}>
                  {currentStep === totalSteps ? 'Create School' : 'Continue'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <AlertModal {...alertProps} />
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
    padding: 16,
    paddingBottom: 100,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepCircleActive: {
    backgroundColor: '#00f5ff',
  },
  stepNumber: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  stepNumberActive: {
    color: '#000',
  },
  stepLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#00f5ff',
  },
  stepContent: {
    gap: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  inputHint: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 16,
  },
  textInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  segmentButtonActive: {
    backgroundColor: '#00f5ff',
  },
  segmentButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentButtonTextActive: {
    color: '#000',
  },
  gradeLevelContainer: {
    gap: 8,
  },
  gradeLevelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  gradeLevelOptionSelected: {
    borderColor: '#00f5ff',
    backgroundColor: '#0b1f26',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#1f2937',
  },
  checkboxSelected: {
    backgroundColor: '#00f5ff',
    borderColor: '#00f5ff',
  },
  gradeLevelLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planSelector: {
    gap: 8,
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
  },
  planOptionSelected: {
    borderColor: '#00f5ff',
    backgroundColor: '#0b1f26',
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  planDetails: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#1f2937',
  },
  radioButtonSelected: {
    backgroundColor: '#00f5ff',
    borderColor: '#00f5ff',
  },
  infoCard: {
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  infoTitle: {
    color: '#00f5ff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  reviewCard: {
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  reviewCardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  reviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reviewLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    flex: 1,
  },
  reviewValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  navigationContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#0b1220',
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    gap: 12,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  backButtonText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#00f5ff',
  },
  nextButtonLoading: {
    opacity: 0.8,
  },
  nextButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
