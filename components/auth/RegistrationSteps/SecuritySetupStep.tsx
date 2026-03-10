// 🔐 Security Setup Step Component
// Handles password and terms acceptance during registration

import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { RegistrationFormState } from '../../../hooks/useEnhancedRegistration';
import { PasswordStrengthIndicator } from '../PasswordStrengthIndicator';
import { PasswordValidation } from '../../../types/auth-enhanced';
import { registrationStepStyles as styles } from './styles';

interface StepTheme {
  colors: {
    background: string;
    onBackground: string;
    surface: string;
    surfaceVariant: string;
    outline: string;
    error: string;
    errorContainer?: string;
    onSurface: string;
    onSurfaceVariant: string;
    primary: string;
    onPrimary: string;
  };
  typography: {
    body1: { fontSize: number };
    body2: { fontSize: number };
    titleLarge: { fontSize: number; fontWeight?: string | number };
    subtitle2: { fontWeight?: string | number };
  };
}

interface SecuritySetupStepProps {
  theme: StepTheme;
  formState: RegistrationFormState;
  errors: Record<string, string[]>;
  touched: Record<string, boolean>;
  loading: boolean;
  showPassword: boolean;
  showConfirmPassword: boolean;
  userInfo: { email: string; firstName: string; lastName: string };
  onFieldChange: (fieldName: keyof RegistrationFormState, value: any) => void;
  onFieldBlur: (fieldName: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;
  onPasswordValidationChange: (validation: PasswordValidation | null) => void;
}

export const SecuritySetupStep: React.FC<SecuritySetupStepProps> = ({
  theme,
  formState,
  errors,
  touched,
  loading,
  showPassword,
  showConfirmPassword,
  userInfo,
  onFieldChange,
  onFieldBlur,
  onTogglePassword,
  onToggleConfirmPassword,
  onPasswordValidationChange
}) => {
  // Render password field helper
  const renderPasswordField = (
    fieldName: 'password' | 'confirmPassword',
    label: string,
    required: boolean = false
  ) => {
    const fieldErrors = errors[fieldName] || [];
    const hasError = fieldErrors.length > 0 && touched[fieldName];
    const value = formState[fieldName];
    const isPasswordField = fieldName === 'password';
    const isVisible = isPasswordField ? showPassword : showConfirmPassword;
    const toggleVisibility = isPasswordField ? onTogglePassword : onToggleConfirmPassword;
    
    return (
      <View style={styles.fieldContainer}>
        <Text style={[
          styles.fieldLabel,
          { 
            color: theme.colors.onSurface,
            fontSize: theme.typography.body2.fontSize,
            fontWeight: theme.typography.subtitle2.fontWeight as any
          }
        ]}>
          {label}
          {required && <Text style={{ color: theme.colors.error }}> *</Text>}
        </Text>
        
        <View style={styles.passwordInputContainer}>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.colors.surface,
                borderColor: hasError ? theme.colors.error : theme.colors.outline,
                color: theme.colors.onSurface,
                paddingRight: 50
              }
            ]}
            value={value}
            onChangeText={(text) => onFieldChange(fieldName, text)}
            onBlur={() => onFieldBlur(fieldName)}
            placeholder="••••••••"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            secureTextEntry={!isVisible}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
          
          <TouchableOpacity
            onPress={toggleVisibility}
            style={styles.visibilityToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 14, color: theme.colors.primary, fontWeight: '600' }}>
              {isVisible ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {hasError && (
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            {fieldErrors[0]}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.stepContent}>
      <Text style={[
        styles.stepTitle,
        { 
          color: theme.colors.onBackground,
          fontSize: theme.typography.titleLarge.fontSize,
          fontWeight: theme.typography.titleLarge.fontWeight as any
        }
      ]}>
        Secure Your Account
      </Text>
      
      <Text style={[
        styles.stepDescription,
        { 
          color: theme.colors.onSurfaceVariant,
          fontSize: theme.typography.body1.fontSize
        }
      ]}>
        Create a strong password to protect your account
      </Text>
      
      <View style={styles.fieldsContainer}>
        {renderPasswordField('password', 'Password', true)}
        
        {!!formState.password && (
          <PasswordStrengthIndicator
            password={formState.password}
            userInfo={userInfo}
            onStrengthChange={onPasswordValidationChange}
          />
        )}
        
        {renderPasswordField('confirmPassword', 'Confirm Password', true)}
        
        {/* Accept Terms Checkbox */}
        <View style={styles.termsContainer}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => onFieldChange('acceptTerms', !formState.acceptTerms)}
          >
            <View style={[
              styles.checkbox,
              {
                backgroundColor: formState.acceptTerms ? theme.colors.primary : theme.colors.surface,
                borderColor: formState.acceptTerms ? theme.colors.primary : theme.colors.outline
              }
            ]}>
              {formState.acceptTerms && (
                <Text style={[styles.checkmark, { color: theme.colors.onPrimary }]}>✓</Text>
              )}
            </View>
            <Text style={[
              styles.termsText,
              { color: theme.colors.onSurface, fontSize: theme.typography.body2.fontSize }
            ]}>
              I accept the{' '}
              <Text style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}>
                Terms and Conditions
              </Text>
              {' '}and{' '}
              <Text style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}>
                Privacy Policy
              </Text>
            </Text>
          </TouchableOpacity>
          
          {errors.acceptTerms && touched.acceptTerms && (
            <Text style={[styles.errorText, { color: theme.colors.error }]}>
              {errors.acceptTerms[0]}
            </Text>
          )}
        </View>
        
        {/* Marketing Consent Checkbox */}
        <View style={styles.termsContainer}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => onFieldChange('marketingConsent', !formState.marketingConsent)}
          >
            <View style={[
              styles.checkbox,
              {
                backgroundColor: formState.marketingConsent ? theme.colors.primary : theme.colors.surface,
                borderColor: formState.marketingConsent ? theme.colors.primary : theme.colors.outline
              }
            ]}>
              {formState.marketingConsent && (
                <Text style={[styles.checkmark, { color: theme.colors.onPrimary }]}>✓</Text>
              )}
            </View>
            <Text style={[
              styles.termsText,
              { color: theme.colors.onSurface, fontSize: theme.typography.body2.fontSize }
            ]}>
              Send me updates about new features and educational content (optional)
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Warning if terms not accepted */}
        {!formState.acceptTerms && (
          <View style={[
            styles.warningBox, 
            { backgroundColor: theme.colors.errorContainer || theme.colors.surfaceVariant }
          ]}>
            <Text style={{ color: theme.colors.error, fontSize: 13, textAlign: 'center' }}>
              ⚠️ Please accept the Terms and Conditions to continue
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default SecuritySetupStep;
