// 🔐 Enhanced Registration Form Component
// Multi-step registration form with role-specific flows
// Refactored for WARP.md compliance (≤400 lines per component)

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  EnhancedUserRole,
  EnhancedRegistration,
} from '../../types/auth-enhanced';
import { AuthProgressIndicator, AuthProgressSummary } from './AuthProgressIndicator';
import { OrganizationSetup } from './OrganizationSetup';
import { useEnhancedRegistration } from '../../hooks/useEnhancedRegistration';
import { 
  PersonalInfoStep, 
  OrganizationSelectionStep, 
  SecuritySetupStep 
} from './RegistrationSteps';
import { ChildRegistrationStep } from './ChildRegistrationStep';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface EnhancedRegistrationFormProps {
  role: EnhancedUserRole;
  invitationToken?: string;
  organizationId?: string;
  onSuccess: (registration: EnhancedRegistration) => void;
  onCancel?: () => void;
  onError?: (error: string) => void;
}

export const EnhancedRegistrationForm: React.FC<EnhancedRegistrationFormProps> = ({
  role,
  invitationToken,
  organizationId,
  onSuccess,
  onCancel,
  onError
}) => {
  const { theme } = useTheme();
  
  // Use the extracted hook for all state and logic
  const {
    formState,
    errors,
    touched,
    loading,
    showPassword,
    showConfirmPassword,
    currentStep,
    completedSteps,
    availableSteps,
    isFirstStep,
    isLastStep,
    userInfo,
    organizations,
    loadingOrganizations,
    organizationError,
    setFormState,
    setPasswordValidation,
    setShowPassword,
    setShowConfirmPassword,
    handleFieldChange,
    handleFieldBlur,
    handleNextStep,
    handlePreviousStep,
    handleStepChange,
    handleSkipChildRegistration,
    addChild,
    removeChild,
    updateChild,
  } = useEnhancedRegistration({
    role,
    invitationToken,
    organizationId,
    onSuccess,
    onError
  });

  const stepGuidance = React.useMemo(() => {
    const roleLabel =
      role === ‘parent’ ? ‘parent’ :
      role === ‘teacher’ ? ‘teacher’ :
      role === ‘principal’ ? ‘principal’ :
      role === ‘student’ ? ‘student’ :
      ‘your’;

    const orgLabel =
      role === ‘parent’ ? ‘your child\’s school’ :
      role === ‘student’ ? ‘your school’ :
      ‘your organisation’;

    const personalTitle =
      role === ‘parent’ ? ‘Step 1: Your details’ :
      role === ‘teacher’ ? ‘Step 1: Your details’ :
      role === ‘principal’ ? ‘Step 1: Your details’ :
      ‘Step 1: Your details’;

    return {
      personal_info: {
        title: personalTitle,
        description: `Enter your legal name, email, and phone so ${orgLabel} can identify and contact you.`,
        nextAction: `Next you will link ${orgLabel}.`,
        ctaLabel: ‘Save Details’,
      },
      organization_selection: {
        title: ‘Step 2: Link your school’,
        description: `Search for ${orgLabel}, tap to select, then confirm. This connects your dashboard, messaging, and records.`,
        nextAction: ‘Next you will set your password and accept terms.’,
        ctaLabel: ‘Confirm School’,
      },
      security_setup: {
        title: ‘Step 3: Secure your account’,
        description: `Create a strong password and accept terms to finish your ${roleLabel} account setup.`,
        nextAction: role === ‘parent’ ? ‘Next you can register your child.’ : ‘You\’re almost done.’,
        ctaLabel: role === ‘parent’ ? ‘Create Parent Account’ : `Create ${roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)} Account`,
      },
      child_registration: {
        title: ‘Step 4: Register your child’,
        description: ‘Add your child so you can track their progress from day one. You can always add more children later.’,
        nextAction: ‘Review and confirm your details.’,
        ctaLabel: ‘Continue’,
      },
    };
  }, [role]);

  const activeGuidance = (stepGuidance as Record<string, { title: string; description: string; nextAction: string; ctaLabel: string }>)[currentStep] || {
    title: 'Complete your registration',
    description: 'Fill in this section to continue.',
    nextAction: 'Proceed to the next required step.',
    ctaLabel: isLastStep ? 'Complete Registration' : 'Continue',
  };
  
  // Render step content based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 'personal_info':
        return (
          <PersonalInfoStep
            theme={theme}
            role={role}
            invitationToken={invitationToken}
            formState={formState}
            errors={errors}
            touched={touched}
            loading={loading}
            onFieldChange={handleFieldChange}
            onFieldBlur={handleFieldBlur}
          />
        );
      case 'organization_setup':
        return (
          <OrganizationSetup
            initialData={formState.organization}
            onComplete={(orgData) => {
              setFormState(prev => ({ ...prev, organization: orgData }));
              handleNextStep();
            }}
            onBack={handlePreviousStep}
            loading={loading}
          />
        );
      case 'organization_selection':
        return (
          <OrganizationSelectionStep
            theme={theme}
            formState={formState}
            errors={errors}
            touched={touched}
            loading={loading}
            loadingOrganizations={loadingOrganizations}
            organizationError={organizationError}
            organizations={organizations}
            onFieldChange={handleFieldChange}
          />
        );
      case 'security_setup':
        return (
          <SecuritySetupStep
            theme={theme}
            formState={formState}
            errors={errors}
            touched={touched}
            loading={loading}
            showPassword={showPassword}
            showConfirmPassword={showConfirmPassword}
            userInfo={userInfo}
            onFieldChange={handleFieldChange}
            onFieldBlur={handleFieldBlur}
            onTogglePassword={() => setShowPassword(!showPassword)}
            onToggleConfirmPassword={() => setShowConfirmPassword(!showConfirmPassword)}
            onPasswordValidationChange={setPasswordValidation}
          />
        );
      case 'child_registration':
        return (
          <ChildRegistrationStep
            theme={theme}
            addedChildren={formState.registrationChildren}
            loading={loading}
            onAddChild={addChild}
            onRemoveChild={removeChild}
            onUpdateChild={updateChild}
            onSkip={handleSkipChildRegistration}
            onContinue={handleNextStep}
          />
        );
      default:
        return null;
    }
  };
  
  // Don't render organization setup separately since it has its own navigation
  if (currentStep === 'organization_setup') {
    return renderStepContent();
  }
  
  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Progress Indicator */}
          <AuthProgressSummary
            currentStep={currentStep}
            completedSteps={completedSteps}
            totalSteps={availableSteps.length}
          />
          
          <AuthProgressIndicator
            currentStep={currentStep}
            completedSteps={completedSteps}
            availableSteps={availableSteps}
            onStepPress={handleStepChange}
            allowNavigation={true}
            showDescriptions={false}
            compact={true}
          />

          <View
            style={[
              styles.guidanceCard,
              {
                backgroundColor: theme.colors.primaryContainer,
                borderColor: theme.colors.primary + '55',
              },
            ]}
          >
            <Text style={[styles.guidanceTitle, { color: theme.colors.onPrimaryContainer }]}>
              {activeGuidance.title}
            </Text>
            <Text style={[styles.guidanceDescription, { color: theme.colors.onPrimaryContainer }]}>
              {activeGuidance.description}
            </Text>
            <Text style={[styles.guidanceNext, { color: theme.colors.onPrimaryContainer }]}>
              Next: {activeGuidance.nextAction}
            </Text>
          </View>
          
          {/* Step Content */}
          {renderStepContent()}
          
          {/* Navigation Buttons */}
          <View style={styles.navigationContainer}>
            <TouchableOpacity
              style={[
                styles.navButton,
                styles.backButton,
                { 
                  borderColor: isFirstStep ? theme.colors.surfaceVariant : theme.colors.outline,
                  opacity: isFirstStep ? 0.5 : 1
                }
              ]}
              onPress={isFirstStep ? onCancel : handlePreviousStep}
              disabled={loading}
            >
              <Text style={[
                styles.navButtonText,
                { color: theme.colors.onSurface }
              ]}>
                {isFirstStep ? 'Cancel' : 'Back'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.navButton,
                styles.nextButton,
                { 
                  backgroundColor: (loading || (currentStep === 'security_setup' && !formState.acceptTerms))
                    ? theme.colors.surfaceVariant 
                    : theme.colors.primary,
                  opacity: (loading || (currentStep === 'security_setup' && !formState.acceptTerms)) ? 0.5 : 1
                }
              ]}
              onPress={handleNextStep}
              disabled={loading || (currentStep === 'security_setup' && !formState.acceptTerms)}
            >
              {loading ? (
                <EduDashSpinner size="small" color={theme.colors.onPrimary} />
              ) : (
                <Text style={[
                  styles.navButtonText,
                  { 
                    color: theme.colors.onPrimary,
                    fontWeight: '600'
                  }
                ]}>
                  {isLastStep ? 'Complete Registration' : activeGuidance.ctaLabel}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  guidanceCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  guidanceTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  guidanceDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  guidanceNext: {
    fontSize: 12,
    marginTop: 8,
    opacity: 0.9,
    fontWeight: '600',
  },
  navigationContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  navButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    borderWidth: 2,
  },
  nextButton: {
    flex: 2,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default EnhancedRegistrationForm;
