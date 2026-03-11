// 🔐 Authentication Progress Indicator Component
// Multi-step progress tracking with validation states

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AuthFlowStep } from '../../types/auth-enhanced';
import { ratioToPercent, percentWidth } from '@/lib/progress/clampPercent';

interface AuthProgressStep {
  key: AuthFlowStep;
  title: string;
  description: string;
  required: boolean;
}

interface AuthProgressIndicatorProps {
  currentStep: AuthFlowStep;
  completedSteps: AuthFlowStep[];
  availableSteps: AuthFlowStep[];
  onStepPress?: (step: AuthFlowStep) => void;
  allowNavigation?: boolean;
  showDescriptions?: boolean;
  compact?: boolean;
}

const STEP_DEFINITIONS: Record<AuthFlowStep, AuthProgressStep> = {
  role_selection: {
    key: 'role_selection',
    title: 'Select Role',
    description: 'Choose your role in the educational system',
    required: true
  },
  personal_info: {
    key: 'personal_info',
    title: 'Personal Information',
    description: 'Enter your basic details',
    required: true
  },
  organization_setup: {
    key: 'organization_setup',
    title: 'Organization Setup',
    description: 'Configure your institution details',
    required: true
  },
  organization_selection: {
    key: 'organization_selection',
    title: 'Select Organization',
    description: 'Choose your school or institution',
    required: true
  },
  security_setup: {
    key: 'security_setup',
    title: 'Security Setup',
    description: 'Create a strong password',
    required: true
  },
  child_registration: {
    key: 'child_registration',
    title: 'Register Child',
    description: 'Add your child to track their progress',
    required: false
  },
  email_verification: {
    key: 'email_verification',
    title: 'Email Verification',
    description: 'Verify your email address',
    required: true
  },
  profile_completion: {
    key: 'profile_completion',
    title: 'Complete Profile',
    description: 'Finish setting up your profile',
    required: false
  },
  onboarding: {
    key: 'onboarding',
    title: 'Welcome Tour',
    description: 'Learn how to use the platform',
    required: false
  }
};

type StepStatus = 'completed' | 'current' | 'available' | 'disabled';

export const AuthProgressIndicator: React.FC<AuthProgressIndicatorProps> = ({
  currentStep,
  completedSteps,
  availableSteps,
  onStepPress,
  allowNavigation = false,
  showDescriptions = true,
  compact = false
}) => {
  const { theme } = useTheme();

  const getStepStatus = (step: AuthFlowStep): StepStatus => {
    if (completedSteps.includes(step)) return 'completed';
    if (step === currentStep) return 'current';
    if (availableSteps.includes(step)) return 'available';
    return 'disabled';
  };

  const getStepStyles = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return {
          container: {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary
          },
          text: { color: theme.colors.onPrimary },
          number: { color: theme.colors.onPrimary }
        };
      case 'current':
        return {
          container: {
            backgroundColor: theme.colors.primaryContainer,
            borderColor: theme.colors.primary
          },
          text: { color: theme.colors.onPrimaryContainer },
          number: { color: theme.colors.primary }
        };
      case 'available':
        return {
          container: {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outline
          },
          text: { color: theme.colors.onSurface },
          number: { color: theme.colors.primary }
        };
      case 'disabled':
      default:
        return {
          container: {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: theme.colors.outline
          },
          text: { color: theme.colors.onSurfaceVariant },
          number: { color: theme.colors.onSurfaceVariant }
        };
    }
  };

  const renderStepIcon = (step: AuthFlowStep, index: number, status: StepStatus) => {
    const styles = getStepStyles(status);
    
    return (
      <View style={[
        stepStyles.iconContainer,
        styles.container,
        compact && stepStyles.iconContainerCompact
      ]}>
        {status === 'completed' ? (
          <Text style={[stepStyles.iconText, styles.number]}>✓</Text>
        ) : (
          <Text style={[stepStyles.iconText, styles.number]}>
            {index + 1}
          </Text>
        )}
      </View>
    );
  };

  const renderStepContent = (step: AuthFlowStep, status: StepStatus) => {
    const stepDef = STEP_DEFINITIONS[step];
    const styles = getStepStyles(status);

    if (compact) {
      return (
        <Text style={[
          stepStyles.titleCompact,
          styles.text,
          { fontSize: theme.typography.caption.fontSize }
        ]}>
          {stepDef.title}
        </Text>
      );
    }

    return (
      <View style={stepStyles.contentContainer}>
        <Text style={[
          stepStyles.title,
          styles.text,
          { 
            fontSize: theme.typography.body2.fontSize,
            fontWeight: theme.typography.subtitle2.fontWeight as any
          }
        ]}>
          {stepDef.title}
          {stepDef.required && (
            <Text style={{ color: theme.colors.error }}> *</Text>
          )}
        </Text>
        
        {showDescriptions && (
          <Text style={[
            stepStyles.description,
            { 
              color: theme.colors.onSurfaceVariant,
              fontSize: theme.typography.caption.fontSize
            }
          ]}>
            {stepDef.description}
          </Text>
        )}
      </View>
    );
  };

  const renderConnector = (index: number, status: StepStatus, nextStatus: StepStatus) => {
    const isActive = status === 'completed' || (status === 'current' && nextStatus !== 'disabled');
    
    return (
      <View style={[
        stepStyles.connector,
        compact && stepStyles.connectorCompact,
        {
          backgroundColor: isActive 
            ? theme.colors.primary 
            : theme.colors.outline
        }
      ]} />
    );
  };

  const handleStepPress = (step: AuthFlowStep, status: StepStatus) => {
    if (allowNavigation && (status === 'completed' || status === 'available') && onStepPress) {
      onStepPress(step);
    }
  };

  const filteredSteps = availableSteps.length > 0 
    ? availableSteps 
    : Object.keys(STEP_DEFINITIONS) as AuthFlowStep[];

  return (
    <View style={[
      stepStyles.container,
      compact && stepStyles.containerCompact,
      { backgroundColor: theme.colors.surface }
    ]}>
      {filteredSteps.map((step, index) => {
        const status = getStepStatus(step);
        const isLast = index === filteredSteps.length - 1;
        const nextStatus = !isLast ? getStepStatus(filteredSteps[index + 1]) : 'disabled';
        const canPress = allowNavigation && (status === 'completed' || status === 'available');

        return (
          <React.Fragment key={step}>
            <TouchableOpacity
              style={[
                stepStyles.stepContainer,
                compact && stepStyles.stepContainerCompact
              ]}
              onPress={() => handleStepPress(step, status)}
              disabled={!canPress}
              activeOpacity={canPress ? 0.7 : 1}
            >
              {renderStepIcon(step, index, status)}
              {renderStepContent(step, status)}
            </TouchableOpacity>
            
            {!isLast && renderConnector(index, status, nextStatus)}
          </React.Fragment>
        );
      })}
    </View>
  );
};

// Progress Summary Component
interface ProgressSummaryProps {
  currentStep: AuthFlowStep;
  completedSteps: AuthFlowStep[];
  totalSteps: number;
}

export const AuthProgressSummary: React.FC<ProgressSummaryProps> = ({
  currentStep,
  completedSteps,
  totalSteps
}) => {
  const { theme } = useTheme();
  const progressPercent = ratioToPercent(completedSteps.length, totalSteps, {
    source: 'AuthProgressSummary.progress',
  });
  const currentStepDef = STEP_DEFINITIONS[currentStep];

  return (
    <View style={[
      stepStyles.summaryContainer,
      { backgroundColor: theme.colors.surface }
    ]}>
      <View style={stepStyles.progressHeader}>
        <Text style={[
          stepStyles.currentStepText,
          { 
            color: theme.colors.onSurface,
            fontSize: theme.typography.body1.fontSize,
            fontWeight: theme.typography.subtitle1.fontWeight as any
          }
        ]}>
          {currentStepDef.title}
        </Text>
        <Text style={[
          stepStyles.progressText,
          { 
            color: theme.colors.onSurfaceVariant,
            fontSize: theme.typography.caption.fontSize
          }
        ]}>
          {completedSteps.length} of {totalSteps} completed
        </Text>
      </View>
      
      <View style={[
        stepStyles.progressBarBackground,
        { backgroundColor: theme.colors.surfaceVariant }
      ]}>
        <View style={[
          stepStyles.progressBarFill,
          { 
            backgroundColor: theme.colors.primary,
            width: percentWidth(progressPercent)
          }
        ]} />
      </View>
    </View>
  );
};

const stepStyles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
  },
  containerCompact: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  stepContainerCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconContainerCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  iconText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
    marginBottom: 2,
  },
  titleCompact: {
    fontWeight: '500',
  },
  description: {
    lineHeight: 16,
  },
  connector: {
    width: 2,
    height: 20,
    marginLeft: 15,
    marginVertical: 2,
  },
  connectorCompact: {
    width: 12,
    height: 2,
    marginLeft: 0,
    marginVertical: 0,
    marginHorizontal: 4,
  },
  summaryContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  currentStepText: {
    fontWeight: '600',
  },
  progressText: {
    fontWeight: '500',
  },
  progressBarBackground: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
});

export default AuthProgressIndicator;
