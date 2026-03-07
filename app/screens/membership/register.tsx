/**
 * Public Member Registration Screen
 * Multi-step registration flow for new members joining Soil of Africa
 * 
 * Refactored to use modular step components following WARP.md standards
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { buildSoaWebUrl } from '@/lib/config/urls';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import {
  OrganizationStep,
  RegionStep,
  PersonalStep,
  MembershipStep,
  PaymentStep,
  CompleteStep,
  REGISTRATION_STEPS,
  initialRegistrationData,
  type RegistrationStep as StepType,
  type RegistrationData,
  type RegionConfig,
  type Organization,
} from '@/components/membership/registration';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';
import { clampPercent } from '@/lib/progress/clampPercent';
// Default organization ID (Soil Of Africa) - used as fallback if no org selected
const DEFAULT_ORG_ID = '63b6139a-e21f-447c-b322-376fb0828992';

export default function MemberRegistrationScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ inviteCode?: string; orgId?: string }>();
  const { showAlert, alertProps } = useAlertModal();
  
  const [currentStep, setCurrentStep] = useState<StepType>('organization');
  const [formData, setFormData] = useState<RegistrationData>(initialRegistrationData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedMemberNumber, setGeneratedMemberNumber] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<string | null>(null);
  const [inviteOrgName, setInviteOrgName] = useState<string | null>(null);
  const [lockedOrganization, setLockedOrganization] = useState<Organization | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Get the target organization ID (from form data or fallback)
  const targetOrgId = formData.organization_id || DEFAULT_ORG_ID;

  // Handle invite code from URL params - fetch details including role and organization
  useEffect(() => {
    async function fetchInviteDetails() {
      if (!params?.inviteCode) return;
      
      setInviteCode(params.inviteCode);
      setFormData(prev => ({ ...prev, invite_code: params.inviteCode }));
      
      try {
        const supabase = assertSupabase();
        const { data: invite } = await supabase
          .from('join_requests')
          .select('requested_role, organization_id, organizations(id, name, slug, logo_url, description)')
          .eq('invite_code', params.inviteCode.toUpperCase())
          .eq('status', 'pending')
          .single();
        
        if (invite) {
          const role = invite.requested_role || 'youth_member';
          setInviteRole(role);
          
          // Extract organization from invite code - this locks the org selection
          const org = invite.organizations as any;
          if (org?.id) {
            const lockedOrg: Organization = {
              id: org.id,
              name: org.name || 'Unknown Organization',
              slug: org.slug,
              logo_url: org.logo_url,
              description: org.description,
            };
            setLockedOrganization(lockedOrg);
            setFormData(prev => ({
              ...prev,
              organization_id: org.id,
              organization_name: org.name || 'Unknown Organization',
            }));
            setInviteOrgName(org.name);
            // Skip organization step since it's locked
            setCurrentStep('region');
          } else if (invite.organization_id) {
            // Fallback: use organization_id directly if organizations join failed
            setFormData(prev => ({
              ...prev,
              organization_id: invite.organization_id,
            }));
            setCurrentStep('region');
          }
          // Map requested_role to member_type
          // Comprehensive mapping for all SOA roles that can be invited
          const memberTypeMap: Record<string, string> = {
            // Youth Wing - Standard members
            'youth_member': 'youth_member',
            'youth_volunteer': 'youth_member',
            // Youth Wing - Support roles
            'youth_coordinator': 'youth_coordinator',
            'youth_facilitator': 'youth_facilitator',
            'youth_mentor': 'youth_mentor',
            // Youth Wing - Executive roles
            'youth_deputy': 'youth_deputy',
            'youth_secretary': 'youth_secretary',
            'youth_treasurer': 'youth_treasurer',
            'youth_president': 'youth_president',
            // Women's Wing roles
            'women_member': 'women_member',
            'women_coordinator': 'women_coordinator',
            'women_facilitator': 'women_facilitator',
            'women_mentor': 'women_mentor',
            'women_deputy': 'women_deputy',
            'women_secretary': 'women_secretary',
            'women_treasurer': 'women_treasurer',
            'women_president': 'women_president',
            // Veterans League roles
            'veterans_member': 'veterans_member',
            'veterans_coordinator': 'veterans_coordinator',
            'veterans_president': 'veterans_president',
            // Regional/Provincial management
            'regional_manager': 'regional_manager',
            'provincial_manager': 'regional_manager',
            'regional_coordinator': 'regional_manager',
            'provincial_coordinator': 'regional_manager',
            // National leadership
            'national_coordinator': 'national_admin',
            'national_admin': 'national_admin',
            'executive': 'national_admin',
            'president': 'national_admin',
            'ceo': 'national_admin',
            // General members (for public registration)
            'learner': 'learner',
            'mentor': 'mentor',
            'facilitator': 'facilitator',
            'volunteer': 'learner',
            'member': 'learner',
          };
          setFormData(prev => ({ 
            ...prev, 
            member_type: (memberTypeMap[role] || role) as any,  // Fallback to role itself if not in map
          }));
        }
      } catch (e) {
        logger.error('Error fetching invite details:', e);
      }
    }
    
    fetchInviteDetails();
  }, [params?.inviteCode]);

  const currentStepIndex = REGISTRATION_STEPS.findIndex(s => s.key === currentStep);
  const progress = ((currentStepIndex + 1) / REGISTRATION_STEPS.length) * 100;
  const safeProgress = clampPercent(progress, { source: 'membership/register.progress' });

  const updateField = (field: keyof RegistrationData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const selectOrganization = (org: Organization) => {
    setFormData(prev => ({
      ...prev,
      organization_id: org.id,
      organization_name: org.name,
      // Clear region when org changes (regions are org-specific)
      region_id: '',
      region_name: '',
      region_code: '',
    }));
  };

  const selectRegion = (region: RegionConfig) => {
    setFormData(prev => ({
      ...prev,
      region_id: region.id,
      region_name: region.name,
      region_code: region.code,
    }));
  };

  const validateStep = (): boolean => {
    switch (currentStep) {
      case 'organization':
        if (!formData.organization_id) {
          showAlert({ title: 'Required', message: 'Please select an organization to join' });
          return false;
        }
        return true;
      case 'region':
        if (!formData.region_id) {
          showAlert({ title: 'Required', message: 'Please select your region' });
          return false;
        }
        return true;
      case 'personal':
        if (!formData.first_name || !formData.last_name || !formData.email || !formData.phone) {
          showAlert({ title: 'Required', message: 'Please fill in all required fields' });
          return false;
        }
        // Validate email format properly
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
          showAlert({ title: 'Invalid Email', message: 'Please enter a valid email address (e.g., user@example.com)' });
          return false;
        }
        if (!formData.password || formData.password.length < 8) {
          showAlert({ title: 'Password Required', message: 'Please enter a password with at least 8 characters' });
          return false;
        }
        if (formData.password !== formData.confirm_password) {
          showAlert({ title: 'Password Mismatch', message: 'Passwords do not match' });
          return false;
        }
        return true;
      case 'membership':
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!validateStep()) return;
    
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < REGISTRATION_STEPS.length) {
      setCurrentStep(REGISTRATION_STEPS[nextIndex].key);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const prevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(REGISTRATION_STEPS[prevIndex].key);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    // Track whether this is a new signup (vs existing user adding membership)
    let isNewSignup = false;
    
    try {
      const supabase = assertSupabase();
      
      // Check if user is already logged in
      let { data: { user } } = await supabase.auth.getUser();
      
      // If not logged in, create a new account with the provided credentials
      if (!user) {
        logger.debug('[Register] Creating new user account...');
        isNewSignup = true;
        
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              first_name: formData.first_name,
              last_name: formData.last_name,
              phone: formData.phone,
            },
            // Redirect to Soil of Africa website after email confirmation
            emailRedirectTo: buildSoaWebUrl('/auth/callback?flow=email-confirm'),
          },
        });
        
        if (signUpError) {
          logger.error('[Register] Sign up error:', signUpError);
          logger.error('[Register] Error message:', signUpError.message);
          logger.error('[Register] Error code:', signUpError.status);
          
          // Check various "already exists" error patterns
          const errorMsg = signUpError.message?.toLowerCase() || '';
          const isAlreadyRegistered = 
            errorMsg.includes('already registered') ||
            errorMsg.includes('already been registered') ||
            errorMsg.includes('user already exists') ||
            errorMsg.includes('email already') ||
            signUpError.status === 400;
            
          if (isAlreadyRegistered) {
            // Try to sign in with the provided credentials
            logger.debug('[Register] User already exists, attempting sign in...');
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: formData.email,
              password: formData.password,
            });
            
            if (signInError) {
              logger.error('[Register] Sign in failed:', signInError);
              showAlert({
                title: 'Account Exists',
                message: 'An account with this email already exists but the password doesn\'t match. Please sign in with your existing password to add your Soil of Africa membership.',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Sign In', 
                    onPress: () => router.push(`/(auth)/sign-in?email=${encodeURIComponent(formData.email)}&returnTo=/screens/membership/register`)
                  }
                ],
              });
              setIsSubmitting(false);
              return;
            }
            
            // Sign in successful! Continue with membership creation
            if (signInData.user) {
              logger.debug('[Register] Sign in successful, continuing with membership creation');
              user = signInData.user;
              isNewSignup = false; // This is an existing user adding membership
              // Don't return - fall through to create membership
            } else {
              showAlert({ title: 'Error', message: 'Sign in succeeded but no user returned. Please try again.' });
              setIsSubmitting(false);
              return;
            }
          } else {
            showAlert({ title: 'Sign Up Failed', message: signUpError.message || 'Unable to create account. Please try again.' });
            setIsSubmitting(false);
            return;
          }
        } else {
          // Sign up succeeded
          if (!signUpData.user) {
            showAlert({ title: 'Error', message: 'Failed to create account. Please try again.' });
            setIsSubmitting(false);
            return;
          }
          
          // Validate the user ID is a proper UUID (accepts any UUID-formatted string)
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!signUpData.user.id || !uuidRegex.test(signUpData.user.id)) {
            logger.error('[Register] Invalid user ID returned from signUp:', signUpData.user.id);
            showAlert({ title: 'Error', message: 'Invalid user ID returned. Please try again.' });
            setIsSubmitting(false);
            return;
          }
          
          user = signUpData.user;
          logger.debug('[Register] User created successfully:', user.id);
          
          // Small delay to ensure user is fully committed to auth.users
          // This helps prevent foreign key constraint violations
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // IMPORTANT: Create membership record BEFORE checking session
        // This ensures the user is added to the org even if email confirmation is required
        
        // Generate random 6-digit member number (unique within org)
        const generateRandomMemberNumber = async (): Promise<string> => {
          let memberNum: string;
          let isUnique = false;
          let attempts = 0;
          
          while (!isUnique && attempts < 10) {
            // Generate random 6-digit number (100000-999999)
            const randomNum = Math.floor(100000 + Math.random() * 900000);
            memberNum = String(randomNum);
            
            // Check if it's unique within the organization
            const { count } = await supabase
              .from('organization_members')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', targetOrgId)
              .eq('member_number', memberNum);
            
            if (count === 0) {
              isUnique = true;
            }
            attempts++;
          }
          
          return memberNum!;
        };
        
        const memberNumber = await generateRandomMemberNumber();
        
        // Create organization member record using RPC (handles both anon and authenticated users)
        // This uses SECURITY DEFINER to bypass RLS when session is null (email not confirmed)
        const membershipStatus = signUpData.session ? 'active' : 'pending_verification';
        
        logger.debug('[Register] Creating membership with RPC:', {
          org_id: targetOrgId,
          user_id: user.id,
          user_email: user.email,
          member_number: memberNumber,
          member_type: formData.member_type,
          has_session: !!signUpData.session,
        });
        
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc('register_organization_member', {
            p_organization_id: targetOrgId,
            p_user_id: user.id,
            p_region_id: formData.region_id || null,
            p_member_number: memberNumber,
            p_member_type: formData.member_type || 'learner',
            p_membership_tier: formData.membership_tier || 'standard',
            p_membership_status: membershipStatus,
            p_first_name: formData.first_name,
            p_last_name: formData.last_name,
            p_email: formData.email,
            p_phone: formData.phone || null,
            p_id_number: formData.id_number || null,
            p_role: 'member',
            p_invite_code_used: inviteCode || null,
            p_joined_via: inviteCode ? 'invite_code' : 'direct_registration',
          });

        if (rpcError) {
          logger.error('[Register] Error creating member via RPC:', rpcError);
          throw rpcError;
        }
        
        // Check RPC result
        if (!rpcResult?.success) {
          logger.error('[Register] RPC returned error:', rpcResult);
          
          // Handle specific error codes
          if (rpcResult?.code === 'USER_NOT_FOUND' || rpcResult?.code === 'NULL_USER_ID') {
            showAlert({
              title: 'Account Creation Issue',
              message: 'Your account is being set up. Please wait a moment and try again, or check your email for a confirmation link.',
              buttons: [
                { text: 'Try Again', onPress: () => setIsSubmitting(false) },
                { text: 'Sign In', onPress: () => router.push('/(auth)/sign-in') }
              ],
            });
            setIsSubmitting(false);
            return;
          }
          
          throw new Error(rpcResult?.error || 'Failed to register member');
        }
        
        logger.debug('[Register] Member registration result:', rpcResult);
        
        // Handle existing member case
        if (rpcResult.action === 'existing') {
          showAlert({ title: 'Already Registered', message: 'You are already a member of this organization.' });
          return;
        }
        
        const memberResult = { id: rpcResult.id, member_number: rpcResult.member_number };
        
        // IMPORTANT: Update the user's profile to link them to the organization
        // This ensures the routing system can find their organization_membership
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({ 
            organization_id: targetOrgId,
            first_name: formData.first_name,
            last_name: formData.last_name,
          })
          .eq('auth_user_id', user.id);
        
        if (profileUpdateError) {
          logger.error('[Register] Error updating profile with org:', profileUpdateError);
          // Non-fatal - continue with registration
        } else {
          logger.debug('[Register] Profile updated with organization_id');
        }
        
        // If invite code was used, mark it as used
        if (inviteCode) {
          await supabase
            .from('join_requests')
            .update({ 
              status: 'approved',
              reviewed_at: new Date().toISOString(),
            })
            .eq('invite_code', inviteCode.toUpperCase())
            .eq('status', 'pending');
        }
        
        setGeneratedMemberNumber(memberNumber);
        
        // Check if we have a session - if not, email confirmation is required
        if (!signUpData.session) {
          logger.debug('[Register] No session after signup - email confirmation required');
          // Email confirmation is required
          showAlert({
            title: 'Account Created! 🎉',
            message: `Your account was created successfully!\n\nYour Member Number: ${memberNumber}\n\nPlease check your email to confirm your account, then sign in.`,
            buttons: [{ text: 'OK', onPress: () => router.push('/(auth)/sign-in') }],
          });
          setIsSubmitting(false);
          return;
        }
        
        logger.debug('[Register] Session available after signup - membership setup complete');
      }

      // If user already exists (was signed in), we still need to create membership
      // But only if it wasn't already created above for new signups
      if (!isNewSignup) {
        // Existing user - generate random member number
        const generateRandomMemberNumberForExisting = async (): Promise<string> => {
          let memberNum: string;
          let isUnique = false;
          let attempts = 0;
          
          while (!isUnique && attempts < 10) {
            const randomNum = Math.floor(100000 + Math.random() * 900000);
            memberNum = String(randomNum);
            
            const { count } = await supabase
              .from('organization_members')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', targetOrgId)
              .eq('member_number', memberNum);
            
            if (count === 0) {
              isUnique = true;
            }
            attempts++;
          }
          
          return memberNum!;
        };
        
        const existingMemberNumber = await generateRandomMemberNumberForExisting();
        
        // Use RPC for existing users too (handles all auth states)
        const { data: existingRpcResult, error: existingRpcError } = await supabase
          .rpc('register_organization_member', {
            p_organization_id: targetOrgId,
            p_user_id: user.id,
            p_region_id: formData.region_id || null,
            p_member_number: existingMemberNumber,
            p_member_type: formData.member_type || 'learner',
            p_membership_tier: formData.membership_tier || 'standard',
            p_membership_status: 'active',
            p_first_name: formData.first_name,
            p_last_name: formData.last_name,
            p_email: formData.email,
            p_phone: formData.phone || null,
            p_id_number: formData.id_number || null,
            p_role: 'member',
            p_invite_code_used: inviteCode || null,
            p_joined_via: inviteCode ? 'invite_code' : 'direct_registration',
          });

        if (existingRpcError) {
          logger.error('[Register] Error creating member via RPC:', existingRpcError);
          throw existingRpcError;
        }
        
        if (!existingRpcResult?.success) {
          logger.error('[Register] RPC returned error:', existingRpcResult);
          
          // Handle specific error codes
          if (existingRpcResult?.code === 'USER_NOT_FOUND' || existingRpcResult?.code === 'NULL_USER_ID') {
            showAlert({
              title: 'Account Issue',
              message: 'There was an issue with your account. Please try signing out and signing back in.',
              buttons: [{ text: 'OK' }],
            });
            setIsSubmitting(false);
            return;
          }
          
          throw new Error(existingRpcResult?.error || 'Failed to register member');
        }
        
        // Handle existing member case
        if (existingRpcResult.action === 'existing') {
          showAlert({ title: 'Already Registered', message: 'You are already a member of this organization.' });
          return;
        }
        
        // If invite code was used, mark it as used
        if (inviteCode) {
          await supabase
            .from('join_requests')
            .update({ 
              status: 'approved',
              reviewed_at: new Date().toISOString(),
            })
            .eq('invite_code', inviteCode.toUpperCase())
            .eq('status', 'pending');
        }

        setGeneratedMemberNumber(existingRpcResult.member_number || existingMemberNumber);
      }

      setCurrentStep('complete');
    } catch (error: any) {
      logger.error('[Register] Registration error:', error);
      logger.error('[Register] Error details:', JSON.stringify(error, null, 2));
      
      // Show more specific error message if available
      const errorMessage = error?.message || error?.error || 'Registration failed. Please try again.';
      showAlert({ title: 'Error', message: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'organization':
        return (
          <OrganizationStep
            selectedOrgId={formData.organization_id}
            onSelectOrganization={selectOrganization}
            theme={theme}
            lockedOrganization={lockedOrganization}
          />
        );
      case 'region':
        return (
          <RegionStep
            data={formData}
            onSelectRegion={selectRegion}
            theme={theme}
            organizationId={formData.organization_id}
            organizationName={formData.organization_name}
          />
        );
      case 'personal':
        return (
          <PersonalStep
            data={formData}
            onUpdate={updateField}
            theme={theme}
          />
        );
      case 'membership':
        return (
          <MembershipStep
            data={formData}
            onUpdate={updateField}
            theme={theme}
            inviteRole={inviteRole}
            inviteOrgName={inviteOrgName || formData.organization_name}
          />
        );
      case 'payment':
        return (
          <PaymentStep
            data={formData}
            theme={theme}
          />
        );
      case 'complete':
        return (
          <CompleteStep
            memberNumber={generatedMemberNumber}
            theme={theme}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: currentStep === 'complete' 
            ? 'Registration Complete' 
            : formData.organization_name 
              ? `Join ${formData.organization_name}`
              : 'Join Organization',
          headerLeft: currentStep === 'complete' ? () => null : undefined,
        }}
      />

      {currentStep !== 'complete' && (
        <>
          {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${safeProgress}%` }]} />
              </View>
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              Step {currentStepIndex + 1} of {REGISTRATION_STEPS.length}
            </Text>
          </View>

          {/* Step Indicators */}
          <View style={styles.stepsIndicator}>
            {REGISTRATION_STEPS.slice(0, -1).map((step, index) => (
              <View key={step.key} style={styles.stepIndicator}>
                <View style={[
                  styles.stepDot,
                  { backgroundColor: index <= currentStepIndex ? theme.primary : theme.border }
                ]}>
                  {index < currentStepIndex ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <Ionicons 
                      name={step.icon} 
                      size={14} 
                      color={index === currentStepIndex ? '#fff' : theme.textSecondary} 
                    />
                  )}
                </View>
                <Text style={[
                  styles.stepLabel,
                  { color: index <= currentStepIndex ? theme.text : theme.textSecondary }
                ]}>
                  {step.title}
                </Text>
                {index < REGISTRATION_STEPS.length - 2 && (
                  <View style={[
                    styles.stepLine,
                    { backgroundColor: index < currentStepIndex ? theme.primary : theme.border }
                  ]} />
                )}
              </View>
            ))}
          </View>
        </>
      )}

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderCurrentStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Navigation */}
      {currentStep !== 'complete' && (
        <View style={[styles.bottomNav, { backgroundColor: theme.card, paddingBottom: insets.bottom + 16 }]}>
          {currentStepIndex > 0 && (
            <TouchableOpacity 
              style={[styles.backButton, { borderColor: theme.border }]}
              onPress={prevStep}
            >
              <Ionicons name="arrow-back" size={20} color={theme.text} />
              <Text style={[styles.backText, { color: theme.text }]}>Back</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={[
              styles.nextButton, 
              { backgroundColor: theme.primary },
              currentStepIndex === 0 && { flex: 1 }
            ]}
            onPress={currentStep === 'payment' ? handleSubmit : nextStep}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <EduDashSpinner color="#fff" />
            ) : (
              <>
                <Text style={styles.nextText}>
                  {currentStep === 'payment' ? 'Complete Registration' : 'Continue'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
    <AlertModal {...alertProps} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  stepsIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  stepIndicator: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 10,
    marginLeft: 4,
    display: 'none',
  },
  stepLine: {
    width: 40,
    height: 2,
    marginHorizontal: 8,
  },
  bottomNav: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  nextText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
