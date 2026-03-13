// 🔑 Password Recovery Flow Component
// Comprehensive password reset with multiple verification methods

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { ValidationResult } from '../../types/auth-enhanced';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { percentWidth } from '@/lib/progress/clampPercent';
interface PasswordRecoveryProps {
  onRecoveryComplete?: (email: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  initialEmail?: string;
  showBackButton?: boolean;
  organizationId?: string;
}

interface RecoveryStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
}

interface SecurityQuestion {
  id: string;
  question: string;
  answer: string;
}

interface RecoveryFormData {
  email: string;
  securityAnswers: Record<string, string>;
  verificationCode: string;
  newPassword: string;
  confirmPassword: string;
}

type RecoveryMethod = 'email' | 'security-questions' | 'admin-reset';
type RecoveryStepType = 'email-input' | 'method-selection' | 'email-verification' | 'security-questions' | 'new-password' | 'complete';

const MOCK_SECURITY_QUESTIONS = [
  { id: 'pet', question: "What is the name of your first pet?" },
  { id: 'school', question: "What elementary school did you attend?" },
  { id: 'city', question: "In what city were you born?" },
  { id: 'mother', question: "What is your mother's maiden name?" },
  { id: 'car', question: "What was the make of your first car?" }
];

export const PasswordRecovery: React.FC<PasswordRecoveryProps> = ({
  onRecoveryComplete,
  onError,
  onCancel,
  initialEmail = '',
  showBackButton = true,
  organizationId
}) => {
  const { theme, isDark } = useTheme();
  
  // State management
  const [currentStep, setCurrentStep] = React.useState<RecoveryStepType>('email-input');
  const [selectedMethod, setSelectedMethod] = React.useState<RecoveryMethod | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [attempts, setAttempts] = React.useState(0);
  const [maxAttempts] = React.useState(3);
  
  const [formData, setFormData] = React.useState<RecoveryFormData>({
    email: initialEmail,
    securityAnswers: {},
    verificationCode: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  const [userSecurityQuestions, setUserSecurityQuestions] = React.useState<SecurityQuestion[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [sentCodeTimestamp, setSentCodeTimestamp] = React.useState<Date | null>(null);
  const [canResendCode, setCanResendCode] = React.useState(true);

  // Timer for resend code cooldown
  React.useEffect(() => {
    if (sentCodeTimestamp) {
      const timer = setInterval(() => {
        const timePassed = Date.now() - sentCodeTimestamp.getTime();
        const cooldownTime = 60000; // 1 minute
        
        if (timePassed >= cooldownTime) {
          setCanResendCode(true);
          clearInterval(timer);
        } else {
          setCanResendCode(false);
        }
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [sentCodeTimestamp]);

  // Validation functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateEmailStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.email) {
      newErrors.email = 'Email address is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSecurityQuestions = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    userSecurityQuestions.forEach(q => {
      if (!formData.securityAnswers[q.id] || formData.securityAnswers[q.id].trim().length < 2) {
        newErrors[q.id] = 'Please provide an answer';
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateVerificationCode = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.verificationCode) {
      newErrors.verificationCode = 'Verification code is required';
    } else if (formData.verificationCode.length !== 6) {
      newErrors.verificationCode = 'Please enter a 6-digit code';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateNewPassword = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // API simulation functions
  const checkEmailExists = async (email: string): Promise<boolean> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock: accept any email for demo, but show different recovery methods based on email
    return email.includes('@') && email.includes('.');
  };

  const loadSecurityQuestions = async (email: string): Promise<SecurityQuestion[]> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock: return random questions for demo
    const shuffled = [...MOCK_SECURITY_QUESTIONS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 2).map((q, index) => ({
      id: q.id,
      question: q.question,
      answer: '' // User's answer would be stored securely on backend
    }));
  };

  const sendVerificationCode = async (email: string): Promise<boolean> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock: always succeed for demo
    setSentCodeTimestamp(new Date());
    return true;
  };

  const verifyCode = async (email: string, code: string): Promise<boolean> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock: accept 123456 for demo
    return code === '123456';
  };

  const verifySecurityAnswers = async (email: string, answers: Record<string, string>): Promise<boolean> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock: accept any non-empty answers for demo
    return Object.values(answers).every(answer => answer.trim().length > 0);
  };

  const resetPassword = async (email: string, newPassword: string, token?: string): Promise<boolean> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock: always succeed for demo
    return true;
  };

  // Step handlers
  const handleEmailSubmit = async () => {
    if (!validateEmailStep()) return;
    
    setIsLoading(true);
    try {
      const exists = await checkEmailExists(formData.email);
      if (!exists) {
        setErrors({ email: 'No account found with this email address' });
        return;
      }
      
      // Load available recovery methods based on user account
      setCurrentStep('method-selection');
    } catch (error) {
      onError?.('Failed to verify email address');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMethodSelection = async (method: RecoveryMethod) => {
    setSelectedMethod(method);
    setIsLoading(true);
    
    try {
      switch (method) {
        case 'email': {
          const codeSent = await sendVerificationCode(formData.email);
          if (codeSent) {
            setCurrentStep('email-verification');
          } else {
            throw new Error('Failed to send verification code');
          }
          break;
        }
        case 'security-questions': {
          const questions = await loadSecurityQuestions(formData.email);
          setUserSecurityQuestions(questions);
          setCurrentStep('security-questions');
          break;
        }
        case 'admin-reset':
          Alert.alert(
            'Admin Reset Requested',
            'Your password reset request has been sent to administrators. You will receive an email when the reset is approved.',
            [{ text: 'OK', onPress: () => setCurrentStep('complete') }]
          );
          break;
      }
    } catch (error) {
      onError?.('Failed to initialize recovery method');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailVerification = async () => {
    if (!validateVerificationCode()) return;
    
    setIsLoading(true);
    try {
      const isValid = await verifyCode(formData.email, formData.verificationCode);
      if (isValid) {
        setCurrentStep('new-password');
        setAttempts(0);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        
        if (newAttempts >= maxAttempts) {
          Alert.alert(
            'Too Many Attempts',
            'You have exceeded the maximum number of attempts. Please try again later or use a different recovery method.',
            [{ text: 'OK', onPress: () => setCurrentStep('method-selection') }]
          );
        } else {
          setErrors({ verificationCode: `Invalid code. ${maxAttempts - newAttempts} attempts remaining.` });
        }
      }
    } catch (error) {
      onError?.('Failed to verify code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSecurityQuestionsSubmit = async () => {
    if (!validateSecurityQuestions()) return;
    
    setIsLoading(true);
    try {
      const isValid = await verifySecurityAnswers(formData.email, formData.securityAnswers);
      if (isValid) {
        setCurrentStep('new-password');
        setAttempts(0);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        
        if (newAttempts >= maxAttempts) {
          Alert.alert(
            'Too Many Attempts',
            'You have provided incorrect answers too many times. Please try a different recovery method.',
            [{ text: 'OK', onPress: () => setCurrentStep('method-selection') }]
          );
        } else {
          setErrors({ general: `Incorrect answers. ${maxAttempts - newAttempts} attempts remaining.` });
        }
      }
    } catch (error) {
      onError?.('Failed to verify security answers');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!validateNewPassword()) return;
    
    setIsLoading(true);
    try {
      const success = await resetPassword(formData.email, formData.newPassword);
      if (success) {
        setCurrentStep('complete');
        setTimeout(() => {
          onRecoveryComplete?.(formData.email);
        }, 2000);
      } else {
        throw new Error('Failed to reset password');
      }
    } catch (error) {
      onError?.('Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!canResendCode) return;
    
    setIsLoading(true);
    try {
      const codeSent = await sendVerificationCode(formData.email);
      if (codeSent) {
        Alert.alert('Code Sent', 'A new verification code has been sent to your email.');
      }
    } catch (error) {
      onError?.('Failed to resend verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // Render step progress
  const renderStepProgress = () => {
    const steps = [
      { id: 'email-input', title: 'Email' },
      { id: 'method-selection', title: 'Method' },
      { id: 'email-verification', title: 'Verify' },
      { id: 'new-password', title: 'Reset' },
      { id: 'complete', title: 'Done' }
    ];
    
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    if (currentIndex === -1) return null;
    
    return (
      <View style={styles.progressContainer}>
        <Text style={[styles.progressText, { color: theme.textSecondary }]}>
          Step {currentIndex + 1} of {steps.length}
        </Text>
        <View style={[styles.progressBar, { backgroundColor: theme.surfaceVariant }]}>
          <View style={[
            styles.progressFill,
            {
              backgroundColor: theme.primary,
              width: percentWidth(((currentIndex + 1) / steps.length) * 100)
            }
          ]} />
        </View>
        <Text style={[styles.stepTitle, { color: theme.text }]}>
          {steps[currentIndex].title}
        </Text>
      </View>
    );
  };

  // Render email input step
  const renderEmailInput = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>
          Find Your Account
        </Text>
        <Text style={[styles.stepDescription, { color: theme.textSecondary }]}>
          Enter the email address associated with your account
        </Text>
      </View>
      
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>
          Email Address
        </Text>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: theme.surface,
              borderColor: errors.email ? theme.error : theme.border,
              color: theme.text
            }
          ]}
          value={formData.email}
          onChangeText={email => setFormData({ ...formData, email })}
          placeholder="john.doe@example.com"
          placeholderTextColor={theme.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        {errors.email && (
          <Text style={[styles.errorText, { color: theme.error }]}>
            {errors.email}
          </Text>
        )}
      </View>
      
      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: isLoading ? theme.surfaceVariant : theme.primary }
        ]}
        onPress={handleEmailSubmit}
        disabled={isLoading}
      >
        {isLoading ? (
          <EduDashSpinner color={theme.onPrimary} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
            Continue
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render method selection step
  const renderMethodSelection = () => {
    const methods = [
      {
        id: 'email' as RecoveryMethod,
        title: 'Email Verification',
        description: 'Send a verification code to your email',
        icon: '📧',
        recommended: true
      },
      {
        id: 'security-questions' as RecoveryMethod,
        title: 'Security Questions',
        description: 'Answer your security questions',
        icon: '❓',
        recommended: false
      },
      {
        id: 'admin-reset' as RecoveryMethod,
        title: 'Request Admin Reset',
        description: 'Have an administrator reset your password',
        icon: '👨‍💼',
        recommended: false
      }
    ];

    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepTitle, { color: theme.text }]}>
            Choose Recovery Method
          </Text>
          <Text style={[styles.stepDescription, { color: theme.textSecondary }]}>
            Select how you'd like to verify your identity
          </Text>
        </View>
        
        <View style={styles.methodsContainer}>
          {methods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.methodCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border
                }
              ]}
              onPress={() => handleMethodSelection(method.id)}
              disabled={isLoading}
            >
              <View style={styles.methodIcon}>
                <Text style={styles.methodEmoji}>{method.icon}</Text>
                {method.recommended && (
                  <View style={[styles.recommendedBadge, { backgroundColor: theme.primary }]}>
                    <Text style={[styles.recommendedText, { color: theme.onPrimary }]}>
                      Recommended
                    </Text>
                  </View>
                )}
              </View>
              
              <View style={styles.methodInfo}>
                <Text style={[styles.methodTitle, { color: theme.text }]}>
                  {method.title}
                </Text>
                <Text style={[styles.methodDescription, { color: theme.textSecondary }]}>
                  {method.description}
                </Text>
              </View>
              
              <Text style={[styles.methodArrow, { color: theme.textSecondary }]}>
                →
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // Render email verification step
  const renderEmailVerification = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>
          Check Your Email
        </Text>
        <Text style={[styles.stepDescription, { color: theme.textSecondary }]}>
          We sent a 6-digit verification code to {formData.email}
        </Text>
      </View>
      
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>
          Verification Code
        </Text>
        <TextInput
          style={[
            styles.textInput,
            styles.codeInput,
            {
              backgroundColor: theme.surface,
              borderColor: errors.verificationCode ? theme.error : theme.border,
              color: theme.text,
              letterSpacing: 4,
              fontSize: 20,
            }
          ]}
          value={formData.verificationCode}
          onChangeText={verificationCode => setFormData({ ...formData, verificationCode })}
          placeholder="123456"
          placeholderTextColor={theme.textSecondary}
          keyboardType="numeric"
          maxLength={6}
          textAlign="center"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
        />
        {errors.verificationCode && (
          <Text style={[styles.errorText, { color: theme.error }]}>
            {errors.verificationCode}
          </Text>
        )}
      </View>
      
      <View style={styles.resendContainer}>
        <Text style={[styles.resendLabel, { color: theme.textSecondary }]}>
          Didn't receive the code?
        </Text>
        <TouchableOpacity
          onPress={handleResendCode}
          disabled={!canResendCode || isLoading}
        >
          <Text style={[
            styles.resendButton,
            {
              color: canResendCode ? theme.primary : theme.textSecondary
            }
          ]}>
            {canResendCode ? 'Resend Code' : 'Wait 60 seconds'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: isLoading ? theme.surfaceVariant : theme.primary }
        ]}
        onPress={handleEmailVerification}
        disabled={isLoading}
      >
        {isLoading ? (
          <EduDashSpinner color={theme.onPrimary} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
            Verify Code
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render security questions step
  const renderSecurityQuestions = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>
          Answer Security Questions
        </Text>
        <Text style={[styles.stepDescription, { color: theme.textSecondary }]}>
          Please answer the following questions to verify your identity
        </Text>
      </View>
      
      {errors.general && (
        <View style={[styles.generalError, { backgroundColor: theme.errorLight + '20' }]}>
          <Text style={[styles.generalErrorText, { color: theme.error }]}>
            {errors.general}
          </Text>
        </View>
      )}
      
      {userSecurityQuestions.map((question) => (
        <View key={question.id} style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            {question.question}
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.surface,
                borderColor: errors[question.id] ? theme.error : theme.border,
                color: theme.text
              }
            ]}
            value={formData.securityAnswers[question.id] || ''}
            onChangeText={answer => setFormData({
              ...formData,
              securityAnswers: {
                ...formData.securityAnswers,
                [question.id]: answer
              }
            })}
            placeholder="Enter your answer"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="words"
          />
          {errors[question.id] && (
            <Text style={[styles.errorText, { color: theme.error }]}>
              {errors[question.id]}
            </Text>
          )}
        </View>
      ))}
      
      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: isLoading ? theme.surfaceVariant : theme.primary }
        ]}
        onPress={handleSecurityQuestionsSubmit}
        disabled={isLoading}
      >
        {isLoading ? (
          <EduDashSpinner color={theme.onPrimary} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
            Submit Answers
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render new password step
  const renderNewPassword = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>
          Create New Password
        </Text>
        <Text style={[styles.stepDescription, { color: theme.textSecondary }]}>
          Choose a strong password for your account
        </Text>
      </View>
      
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>
          New Password
        </Text>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: theme.surface,
              borderColor: errors.newPassword ? theme.error : theme.border,
              color: theme.text
            }
          ]}
          value={formData.newPassword}
          onChangeText={newPassword => setFormData({ ...formData, newPassword })}
          placeholder="Enter new password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="new-password"
        />
        {errors.newPassword && (
          <Text style={[styles.errorText, { color: theme.error }]}>
            {errors.newPassword}
          </Text>
        )}
      </View>
      
      {formData.newPassword && (
        <PasswordStrengthIndicator 
          password={formData.newPassword}
          userInfo={{
            email: formData.email
          }}
        />
      )}
      
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>
          Confirm New Password
        </Text>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: theme.surface,
              borderColor: errors.confirmPassword ? theme.error : theme.border,
              color: theme.text
            }
          ]}
          value={formData.confirmPassword}
          onChangeText={confirmPassword => setFormData({ ...formData, confirmPassword })}
          placeholder="Confirm new password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="new-password"
        />
        {errors.confirmPassword && (
          <Text style={[styles.errorText, { color: theme.error }]}>
            {errors.confirmPassword}
          </Text>
        )}
      </View>
      
      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: isLoading ? theme.surfaceVariant : theme.primary }
        ]}
        onPress={handlePasswordReset}
        disabled={isLoading}
      >
        {isLoading ? (
          <EduDashSpinner color={theme.onPrimary} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
            Reset Password
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render completion step
  const renderComplete = () => (
    <View style={styles.stepContainer}>
      <View style={styles.completionContainer}>
        <Text style={styles.completionIcon}>✅</Text>
        <Text style={[styles.completionTitle, { color: theme.text }]}>
          Password Reset Complete
        </Text>
        <Text style={[styles.completionDescription, { color: theme.textSecondary }]}>
          Your password has been successfully reset. You can now sign in with your new password.
        </Text>
        
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: theme.primary, marginTop: 24 }
          ]}
          onPress={() => onRecoveryComplete?.(formData.email)}
        >
          <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
            Continue to Sign In
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render current step
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'email-input':
        return renderEmailInput();
      case 'method-selection':
        return renderMethodSelection();
      case 'email-verification':
        return renderEmailVerification();
      case 'security-questions':
        return renderSecurityQuestions();
      case 'new-password':
        return renderNewPassword();
      case 'complete':
        return renderComplete();
      default:
        return renderEmailInput();
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        {showBackButton && (
          <TouchableOpacity style={styles.backButton} onPress={onCancel}>
            <Text style={[styles.backButtonText, { color: theme.primary }]}>
              ← Back
            </Text>
          </TouchableOpacity>
        )}
        
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Reset Password
        </Text>
        
        {currentStep !== 'complete' && renderStepProgress()}
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderCurrentStep()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  content: {
    flex: 1,
  },
  stepContainer: {
    padding: 24,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 20,
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorText: {
    fontSize: 14,
    marginTop: 8,
  },
  generalError: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  generalErrorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  primaryButton: {
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  methodsContainer: {
    gap: 16,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
  },
  methodIcon: {
    alignItems: 'center',
    marginRight: 16,
  },
  methodEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  recommendedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '600',
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  methodDescription: {
    fontSize: 14,
  },
  methodArrow: {
    fontSize: 16,
    marginLeft: 16,
  },
  resendContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  resendLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  resendButton: {
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  completionContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  completionIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  completionDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});

export default PasswordRecovery;