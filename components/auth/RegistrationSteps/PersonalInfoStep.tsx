// 🔐 Personal Info Step Component
// Handles personal information collection during registration

import React from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { EnhancedUserRole } from '../../../types/auth-enhanced';
import { RegistrationFormState } from '../../../hooks/useEnhancedRegistration';
import { GRADE_LEVELS, SUBJECTS } from './constants';
import { registrationStepStyles as styles } from './styles';

interface StepTheme {
  colors: {
    background: string;
    onBackground: string;
    surface: string;
    outline: string;
    error: string;
    onSurface: string;
    onSurfaceVariant: string;
    primary: string;
    primaryContainer: string;
    onPrimaryContainer: string;
  };
  typography: {
    body1: { fontSize: number };
    body2: { fontSize: number };
    titleLarge: { fontSize: number; fontWeight?: string | number };
    subtitle2: { fontWeight?: string | number };
    caption: { fontSize: number };
  };
}

interface PersonalInfoStepProps {
  theme: StepTheme;
  role: EnhancedUserRole;
  invitationToken?: string;
  formState: RegistrationFormState;
  errors: Record<string, string[]>;
  touched: Record<string, boolean>;
  loading: boolean;
  onFieldChange: (fieldName: keyof RegistrationFormState, value: any) => void;
  onFieldBlur: (fieldName: string) => void;
}

export const PersonalInfoStep: React.FC<PersonalInfoStepProps> = ({
  theme,
  role,
  invitationToken,
  formState,
  errors,
  touched,
  loading,
  onFieldChange,
  onFieldBlur
}) => {
  // Render text field helper
  const renderTextField = (
    fieldName: string & keyof RegistrationFormState,
    label: string,
    placeholder: string,
    required: boolean = false,
    keyboardType: 'default' | 'email-address' | 'phone-pad' | 'numeric' = 'default',
    autoCapitalize: 'none' | 'words' | 'sentences' | 'characters' = 'none'
  ) => {
    const fieldErrors = errors[fieldName] || [];
    const hasError = fieldErrors.length > 0 && touched[fieldName];
    const value = formState[fieldName] as string || '';

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

        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: theme.colors.surface,
              borderColor: hasError ? theme.colors.error : theme.colors.outline,
              color: theme.colors.onSurface
            }
          ]}
          value={value}
          onChangeText={(text) => onFieldChange(fieldName, text)}
          onBlur={() => onFieldBlur(fieldName)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          editable={!loading}
        />
        
        {hasError && (
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            {fieldErrors[0]}
          </Text>
        )}
      </View>
    );
  };

  // Multi-select field helper
  const renderMultiSelect = (
    fieldName: string & keyof RegistrationFormState,
    label: string,
    options: string[]
  ) => {
    const values = (formState[fieldName] as string[]) || [];
    
    const toggleOption = (option: string) => {
      const currentValues = [...values];
      const index = currentValues.indexOf(option);
      if (index > -1) {
        currentValues.splice(index, 1);
      } else {
        currentValues.push(option);
      }
      onFieldChange(fieldName, currentValues);
    };
    
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
        </Text>
        
        <View style={styles.multiSelectContainer}>
          {options.map(option => (
            <TouchableOpacity
              key={option}
              style={[
                styles.multiSelectOption,
                {
                  backgroundColor: values.includes(option) 
                    ? theme.colors.primaryContainer 
                    : theme.colors.surface,
                  borderColor: values.includes(option) 
                    ? theme.colors.primary 
                    : theme.colors.outline
                }
              ]}
              onPress={() => toggleOption(option)}
              disabled={loading}
            >
              <Text style={[
                styles.multiSelectOptionText,
                { 
                  color: values.includes(option) 
                    ? theme.colors.onPrimaryContainer 
                    : theme.colors.onSurface
                }
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // Select field helper
  const renderSelect = (
    fieldName: string & keyof RegistrationFormState,
    label: string,
    options: string[]
  ) => {
    const value = formState[fieldName] as string || '';
    
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
        </Text>
        
        <ScrollView 
          style={[
            styles.selectContainer,
            { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline
            }
          ]}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {options.map(option => (
            <TouchableOpacity
              key={option}
              style={[
                styles.selectOption,
                {
                  backgroundColor: value === option 
                    ? theme.colors.primaryContainer 
                    : theme.colors.surface,
                  borderColor: value === option 
                    ? theme.colors.primary 
                    : theme.colors.outline
                }
              ]}
              onPress={() => onFieldChange(fieldName, option)}
              disabled={loading}
            >
              <Text style={[
                styles.selectOptionText,
                { 
                  color: value === option 
                    ? theme.colors.onPrimaryContainer 
                    : theme.colors.onSurface
                }
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Text area helper
  const renderTextArea = (
    fieldName: string & keyof RegistrationFormState,
    label: string,
    placeholder: string
  ) => {
    const fieldErrors = errors[fieldName] || [];
    const hasError = fieldErrors.length > 0 && touched[fieldName];
    const value = formState[fieldName] as string || '';
    
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
        </Text>
        
        <TextInput
          style={[
            styles.textInput,
            styles.textArea,
            {
              backgroundColor: theme.colors.surface,
              borderColor: hasError ? theme.colors.error : theme.colors.outline,
              color: theme.colors.onSurface
            }
          ]}
          value={value}
          onChangeText={(text) => onFieldChange(fieldName, text)}
          onBlur={() => onFieldBlur(fieldName)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!loading}
        />
        
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
        Personal Information
      </Text>
      
      <Text style={[
        styles.stepDescription,
        { 
          color: theme.colors.onSurfaceVariant,
          fontSize: theme.typography.body1.fontSize
        }
      ]}>
        Let's start with your basic information
      </Text>
      
      <View style={styles.fieldsContainer}>
        <View style={styles.row}>
          <View style={styles.column}>
            {renderTextField('firstName', 'First Name', 'John', true, 'default', 'words')}
          </View>
          <View style={styles.column}>
            {renderTextField('lastName', 'Last Name', 'Doe', true, 'default', 'words')}
          </View>
        </View>
        
        {renderTextField('email', 'Email Address', 'john.doe@example.com', true, 'email-address', 'none')}
        {renderTextField('phone', 'Phone Number', '(555) 123-4567', false, 'phone-pad', 'none')}
        
        {role === 'parent' && !invitationToken && (
          <View style={{ marginTop: 8 }}>
            <Text style={[
              styles.label,
              { 
                color: theme.colors.onBackground,
                fontSize: theme.typography.body2.fontSize,
                marginBottom: 4
              }
            ]}>
              School Invitation Code (Optional)
            </Text>
            <Text style={[
              styles.helperText,
              { 
                color: theme.colors.onSurfaceVariant,
                fontSize: theme.typography.caption.fontSize,
                marginBottom: 8
              }
            ]}>
              If your school provided an invitation code, enter it here to link your account
            </Text>
            {renderTextField('invitationCode', 'Invitation Code', 'ABC12345', false, 'default')}
          </View>
        )}
        
        {role === 'principal' && (
          <>
            {renderTextField('jobTitle', 'Job Title', 'Principal', true)}
            {renderTextField('yearsExperience', 'Years of Experience', '10', false, 'numeric')}
          </>
        )}
        
        {role === 'teacher' && !invitationToken && (
          <>
            {renderMultiSelect('subjects', 'Subjects', SUBJECTS)}
            {renderMultiSelect('gradeLevel', 'Grade Levels', GRADE_LEVELS)}
            {renderTextArea('bio', 'Professional Bio', 'Tell us about your teaching experience...')}
          </>
        )}
        
        {role === 'student' && (
          <>
            {renderSelect('grade', 'Grade Level', GRADE_LEVELS)}
            {renderTextField('parentEmail', 'Parent/Guardian Email', 'parent@example.com', false, 'email-address')}
            {renderTextField('schoolCode', 'School Code (if provided)', 'SCH123', false)}
          </>
        )}
      </View>
    </View>
  );
};

export default PersonalInfoStep;
