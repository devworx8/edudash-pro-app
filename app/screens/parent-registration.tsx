import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import EnhancedRegistrationForm from '@/components/auth/EnhancedRegistrationForm';
import { EnhancedRegistration } from '@/types/auth-enhanced';
import { assertSupabase } from '@/lib/supabase';
import { routeAfterLogin, COMMUNITY_SCHOOL_ID } from '@/lib/routeAfterLogin';
import { useAlertModal } from '@/components/ui/AlertModal';
import { logger } from '@/lib/logger';
import { buildEduDashWebUrl } from '@/lib/config/urls';

const ACTIVE_ORG_KEY = '@active_organization';

export default function ParentRegistrationScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams();
  const [invitationCode, setInvitationCode] = useState<string | undefined>(params.invitationCode as string | undefined);
  const [organizationId, setOrganizationId] = useState<string | undefined>();
  const { showAlert, AlertModalComponent } = useAlertModal();

  // Validate invitation code on mount if provided
  useEffect(() => {
    if (invitationCode) {
      validateInvitationCode(invitationCode);
    }
  }, [invitationCode]);

  const validateInvitationCode = async (code: string) => {
    try {
      const supabase = assertSupabase();
      const { data, error } = await supabase.rpc('validate_invitation_code', {
        p_code: code.trim().toUpperCase(),
      });

      if (error || !data) {
        showAlert({ title: 'Invalid Code', message: 'The invitation code is not valid.' });
        setInvitationCode(undefined);
        return;
      }

      // Parse the JSON response from the RPC
      const result = typeof data === 'string' ? JSON.parse(data) : data;

      if (!result.valid) {
        showAlert({ title: 'Invalid Code', message: result.message || 'The invitation code is not valid.' });
        setInvitationCode(undefined);
        return;
      }

      // Set organization ID from the validated code
      setOrganizationId(result.school_id || undefined);
      showAlert({ title: 'Code Validated', message: 'Your invitation code has been validated successfully!' });
    } catch (error: any) {
      logger.error('[ParentRegistration] Invitation code validation error', { error });
      showAlert({ title: 'Validation Error', message: 'Failed to validate invitation code.' });
      setInvitationCode(undefined);
    }
  };

  const handleRegistrationSuccess = async (registration: EnhancedRegistration) => {
    try {
      const supabase = assertSupabase();
      
      // Check if user is already logged in
      let { data: { user } } = await supabase.auth.getUser();
      let isExistingUser = false;
      
      // If not logged in, try to create a new account
      if (!user) {
        logger.info('[ParentRegistration] Creating new user account...');
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: registration.email,
          password: registration.password,
          options: {
            emailRedirectTo: buildEduDashWebUrl('/landing?flow=email-confirm'),
            data: {
              first_name: registration.firstName,
              last_name: registration.lastName,
              phone: registration.phone,
              role: 'parent',
            }
          }
        });

        if (authError) {
          logger.error('[ParentRegistration] Sign up error:', authError);
          
          // Check various "already exists" error patterns
          const errorMsg = authError.message?.toLowerCase() || '';
          const isAlreadyRegistered = 
            errorMsg.includes('already registered') ||
            errorMsg.includes('already been registered') ||
            errorMsg.includes('user already exists') ||
            errorMsg.includes('email already') ||
            authError.status === 400;
            
          if (isAlreadyRegistered) {
            // Try to sign in with the provided credentials
            logger.info('[ParentRegistration] User already exists, attempting sign in...');
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: registration.email,
              password: registration.password,
            });
            
            if (signInError) {
              logger.error('[ParentRegistration] Sign in failed', { error: signInError });
              showAlert({
                title: 'Account Exists',
                message: 'An account with this email already exists. Please sign in with your existing password to complete parent registration.',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Sign In', 
                    onPress: () => router.push(`/(auth)/sign-in?email=${encodeURIComponent(registration.email)}&returnTo=/screens/parent-registration${invitationCode ? `?invitationCode=${invitationCode}` : ''}`)
                  }
                ],
              });
              return;
            }
            
            // Sign in successful! Continue with parent registration
            if (signInData.user) {
              logger.info('[ParentRegistration] Sign in successful, continuing with parent registration');
              user = signInData.user;
              isExistingUser = true;
            } else {
              showAlert({ title: 'Error', message: 'Sign in succeeded but no user returned. Please try again.' });
              return;
            }
          } else {
            throw authError;
          }
        } else {
          // Sign up succeeded
          user = authData.user;
          
          // If confirmations are enabled, Supabase returns no session until email is verified
          if (!authData.session) {
            // Still try to redeem invitation code before redirecting
            const parentReg = registration as any;
            const codeToUse = invitationCode || parentReg.invitationToken;
            
            if (codeToUse && user) {
              try {
                const fullName = `${registration.firstName} ${registration.lastName}`.trim();
                await supabase.rpc('use_invitation_code', {
                  p_auth_user_id: user.id,
                  p_code: codeToUse.trim().toUpperCase(),
                  p_name: fullName,
                  p_phone: registration.phone || null,
                });
                logger.info('[ParentRegistration] Invitation code redeemed (pending email verification)');
              } catch (codeError) {
                logger.error('[ParentRegistration] Invitation code redemption error:', codeError);
              }
            }
            
            router.replace({
              pathname: '/screens/verify-your-email',
              params: { email: registration.email }
            } as any);
            return;
          }
        }
      } else {
        // User was already logged in
        isExistingUser = true;
        logger.info('[ParentRegistration] User already logged in:', user.email);
      }

      // Get invitation code from URL params or from the form
      const parentReg = registration as any;
      const codeToUse = invitationCode || parentReg.invitationToken;
      
      // Get the organization ID - from invitation code validation, form selection, or prop
      const selectedOrgId = organizationId || parentReg.organizationId || '00000000-0000-0000-0000-000000000001';

      // If we have an invitation code, redeem it to link the parent to the school
      if (codeToUse && user) {
        try {
          const fullName = `${registration.firstName} ${registration.lastName}`.trim();
          const { error: redeemError } = await supabase
            .rpc('use_invitation_code', {
              p_auth_user_id: user.id,
              p_code: codeToUse.trim().toUpperCase(),
              p_name: fullName,
              p_phone: registration.phone || null,
            });

          if (redeemError) {
            logger.error('[ParentRegistration] Failed to redeem invitation code', { error: redeemError });
            showAlert({
              title: isExistingUser ? 'Linked to School' : 'Registration Successful',
              message: isExistingUser 
                ? 'We couldn\'t link you to the school automatically. You can try joining again using the invitation code.'
                : 'Your account was created, but we couldn\'t link you to the school. You can join later using the invitation code.',
            });
          } else {
            // Successfully linked to school - set this school as active organization
            // This ensures the user sees the parent dashboard, not their other org's dashboard
            if (selectedOrgId) {
              try {
                // Get school name for display
                const { data: schoolData } = await supabase
                  .from('preschools')
                  .select('name')
                  .eq('id', selectedOrgId)
                  .single();
                
                // Update profile to set this as the active preschool
                await supabase
                  .from('profiles')
                  .update({ 
                    preschool_id: selectedOrgId,
                    organization_id: selectedOrgId,
                    role: 'parent', // Set role to parent for this context
                  })
                  .eq('auth_user_id', user.id);
                
                // Store active organization in AsyncStorage
                await AsyncStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify({
                  id: selectedOrgId,
                  name: schoolData?.name || 'School',
                  type: 'preschool',
                  userId: user.id,
                }));
                
                logger.info('[ParentRegistration] Set active organization to preschool:', selectedOrgId);
              } catch (activeOrgError) {
                logger.error('[ParentRegistration] Failed to set active organization:', activeOrgError);
                // Non-fatal - continue with navigation
              }
            }
            
            showAlert({
              title: 'Success!',
              message: isExistingUser 
                ? 'You have been linked to the school as a parent.'
                : 'Your account has been created and linked to the school.',
            });
          }
        } catch (codeError) {
          logger.error('[ParentRegistration] Invitation code redemption error:', codeError);
        }
      } else if (user && selectedOrgId) {
        // Self-service registration (no invitation code) - set organization from form selection
        try {
          logger.info('[ParentRegistration] Self-service registration, setting organization:', selectedOrgId);
          
          // Get school name for display
          const { data: schoolData } = await supabase
            .from('preschools')
            .select('name')
            .eq('id', selectedOrgId)
            .single();
          
          // Update profile to set the selected preschool
          await supabase
            .from('profiles')
            .update({ 
              preschool_id: selectedOrgId,
              organization_id: selectedOrgId,
              role: 'parent',
            })
            .eq('auth_user_id', user.id);
          
          // Store active organization in AsyncStorage
          await AsyncStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify({
            id: selectedOrgId,
            name: schoolData?.name || 'My School',
            type: 'preschool',
            userId: user.id,
          }));
          
          logger.info('[ParentRegistration] Set organization to:', schoolData?.name || selectedOrgId);
          
          showAlert({
            title: 'Registration Successful!',
            message: `Welcome to ${schoolData?.name || 'the school'}! You can now add your children to your account.`,
          });
        } catch (orgError) {
          logger.error('[ParentRegistration] Failed to set organization:', orgError);
          // Non-fatal - account was still created
          showAlert({
            title: isExistingUser ? 'Account Updated' : 'Registration Successful',
            message: 'Your account has been created. You can add your children from the dashboard.',
          });
        }
      } else if (isExistingUser && !codeToUse) {
        showAlert({
          title: 'Account Updated',
          message: 'Your account has been updated with parent information.',
        });
      }

      // Prefer centralized routing to avoid sending K-12/community schools
      // to the preschool parent dashboard.
      if (user) {
        try {
          await routeAfterLogin(user);
          return;
        } catch (routeError) {
          logger.warn('[ParentRegistration] routeAfterLogin failed, using fallback:', routeError);
        }
      }

      // Fallback navigation
      if (codeToUse) {
        router.replace('/screens/parent-children');
        return;
      }

      if (selectedOrgId === COMMUNITY_SCHOOL_ID) {
        router.replace('/(k12)/parent/dashboard');
        return;
      }

      router.replace('/screens/parent-dashboard');
    } catch (error: any) {
      logger.error('[ParentRegistration] Registration error:', error);
      handleRegistrationError(error.message || 'Registration failed');
    }
  };

  const handleRegistrationError = (error: string) => {
    logger.error('[ParentRegistration] Registration error', error);
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
          title: 'Parent Registration',
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
            role="parent"
            invitationToken={invitationCode}
            organizationId={organizationId}
            onSuccess={handleRegistrationSuccess}
            onCancel={handleCancel}
            onError={handleRegistrationError}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <AlertModalComponent />
    </SafeAreaView>
  );
}
