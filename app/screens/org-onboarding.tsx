import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { createOrganization } from '@/services/OrganizationService';
import { assertSupabase } from '@/lib/supabase';
import { buildEduDashWebUrl } from '@/lib/config/urls';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { logger } from '@/lib/logger';
// Organization Onboarding with Authentication
// For new organizations (skills/tertiary/other organizations)
// Creates both user account and organization, then routes to Org Admin Dashboard
export default function OrgOnboardingScreen() {
  const { user, profile, refreshProfile, profileLoading, loading } = useAuth();
  const { showAlert, alertProps } = useAlertModal();

  type Step = 'account_creation' | 'type_selection' | 'details' | 'review';

  const [step, setStep] = useState<Step>(user ? 'type_selection' : 'account_creation');
  const [creating, setCreating] = useState(false);
  const [orgId, setOrgId] = useState<string | null>((profile as any)?.organization_id || null);
  const [hasCheckedOrg, setHasCheckedOrg] = useState(false);

  // Check if user already has an organization - redirect to dashboard if they do
  useEffect(() => {
    // Wait for profile to finish loading
    if (loading || profileLoading) return;
    
    // Only check once
    if (hasCheckedOrg) return;
    
    if (!user) {
      setHasCheckedOrg(true);
      return;
    }
    
    // If profile is loaded, check for organization
    if (profile) {
      setHasCheckedOrg(true);
      const currentOrgId = profile?.organization_id || (profile as any)?.preschool_id;
      if (currentOrgId) {
        logger.debug('OrgOnboarding', 'User already has organization, redirecting to dashboard', {
          organization_id: currentOrgId,
        });
        setOrgId(currentOrgId);
        // Show message and redirect
        showAlert({
          title: 'Organization Already Exists',
          message: 'You already have an organization set up. Redirecting to your dashboard...',
        });
        // Small delay to show alert, then redirect
        const timer = setTimeout(() => {
          router.replace('/screens/org-admin-dashboard');
        }, 500);
        return () => clearTimeout(timer);
      }
    } else {
      // Profile not loaded yet, try refreshing
      refreshProfile?.().then(() => {
        setHasCheckedOrg(true);
      });
    }
  }, [user, profile, profileLoading, loading, hasCheckedOrg, refreshProfile]);

  // Account creation fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Organization fields
  const [orgKind, setOrgKind] = useState<'skills' | 'tertiary' | 'org'>('skills');
  const [orgName, setOrgName] = useState<string>((profile as any)?.organization_name || '');
  const [adminName, setAdminName] = useState(`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim());
  const [phone, setPhone] = useState('');

  const canCreateAccount = useMemo(() => 
    email.trim().length > 0 && 
    password.length >= 6 && 
    password === confirmPassword &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0,
    [email, password, confirmPassword, firstName, lastName]
  );

  const canCreate = useMemo(() => Boolean(user?.id) && orgName.trim().length > 1, [user?.id, orgName]);

  const handleCreateAccount = useCallback(async () => {
    if (!canCreateAccount || creatingAccount) return;
    
    try {
      setCreatingAccount(true);
      
      // Create user account with Supabase Auth
      const { data: authData, error: authError } = await assertSupabase().auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          emailRedirectTo: buildEduDashWebUrl('/landing?flow=email-confirm'),
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            role: 'admin', // Organization admins get admin role (for Skills Development, Tertiary, Other orgs)
          }
        }
      });

      if (authError) throw authError;
      
      if (!authData.user) {
        throw new Error('Account creation failed - no user returned');
      }

      // If confirmations are enabled, route to verify screen and stop the wizard
      if (!authData.session) {
        showAlert({
          title: 'Verify your email',
          message: 'We\'ve sent you a confirmation email. Please verify your address to continue.',
        });
        router.replace({
          pathname: '/screens/verify-your-email',
          params: { email }
        } as any);
        return;
      }

      // Update admin name for next steps
      setAdminName(`${firstName.trim()} ${lastName.trim()}`);

      showAlert({
        title: 'Account Created!',
        message: 'Your account has been created successfully. Now let\'s set up your organization.',
        buttons: [{ text: 'Continue', onPress: () => setStep('type_selection') }],
      });
      
    } catch (e: any) {
      logger.error('OrgOnboarding', 'Create account failed', e);
      const isEmailAlreadyRegistered = e.message?.includes('already registered');
      
      if (isEmailAlreadyRegistered) {
        // Provide option to sign in instead
        showAlert({
          title: 'Email Already Registered',
          message: 'This email is already registered. Would you like to sign in with your existing account?',
          buttons: [
            { text: 'Use Different Email', style: 'cancel' },
            { text: 'Sign In', onPress: () => router.replace('/(auth)/sign-in') },
          ],
        });
      } else {
        let errorMessage = 'Failed to create account';
        if (e.message) {
          errorMessage = e.message;
        }
        showAlert({ title: 'Error', message: errorMessage });
      }
    } finally {
      setCreatingAccount(false);
    }
  }, [canCreateAccount, creatingAccount, email, password, firstName, lastName]);

  const handleCreateOrg = useCallback(async () => {
    if (!canCreate || creating) return;
    
    // Check if user already has an organization before creating
    const currentOrgId = profile?.organization_id || (profile as any)?.preschool_id;
    if (currentOrgId) {
      showAlert({
        title: 'Organization Already Exists',
        message: 'You already have an organization. Redirecting to your dashboard...',
        buttons: [{ text: 'OK', onPress: () => router.replace('/screens/org-admin-dashboard') }],
      });
      return;
    }
    
    try {
      setCreating(true);
      
      // Create organization using server-side RPC
      // The RPC handles:
      // - Permission validation
      // - Organization insertion
      // - Profile linking automatically
      // - Auto-activation (no manual approval needed)
      const created = await createOrganization({
        name: orgName.trim(),
        type: orgKind,
        phone: phone.trim() || null,
        status: 'active',
      });
      
      setOrgId(created.id);

      // Refresh profile to get updated organization_id
      try { 
        await refreshProfile?.();
      } catch (e) { 
        logger.debug('OrgOnboarding', 'refreshProfile failed', e);
      }
      
      // Update local state with the created org ID
      setOrgId(created.id);

      // Show success alert, then navigate after user dismisses
      showAlert({
        title: 'Organization Created!',
        message: `${orgName} has been created and activated. You can now start using your organization dashboard.`,
        buttons: [{ text: 'OK', onPress: () => router.replace('/screens/org-admin-dashboard') }],
      });
    } catch (e: any) {
      logger.error('OrgOnboarding', 'Create org failed', e);
      showAlert({ title: 'Error', message: e?.message || 'Failed to create organization' });
    } finally {
      setCreating(false);
    }
  }, [canCreate, creating, orgName, orgKind, phone, refreshProfile]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="light" />
      <Stack.Screen 
        options={{ 
          title: 'Organization Onboarding', 
          headerShown: true,
          headerStyle: { backgroundColor: '#0b1220' },
          headerTitleStyle: { color: '#fff' },
          headerTintColor: '#00f5ff',
        }} 
      />
      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>
          {step === 'account_creation' ? 'Create Your Account' : `Welcome, ${adminName || profile?.first_name || 'Admin'}`}
        </Text>
        <Text style={styles.subheading}>
          {step === 'account_creation'
            ? 'First, let\'s create your admin account.'
            : step === 'type_selection'
            ? 'Tell us what type of organization you represent.'
            : 'Provide your organization details to complete onboarding.'}
        </Text>

        {step === 'account_creation' && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="John"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Doe"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="admin@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password (minimum 6 characters)</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••"
                  placeholderTextColor="#6B7280"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••"
                  placeholderTextColor="#6B7280"
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              disabled={!canCreateAccount || creatingAccount} 
              style={[styles.button, (!canCreateAccount || creatingAccount) && styles.buttonDisabled]} 
              onPress={handleCreateAccount}
            >
              {creatingAccount ? (
                <EduDashSpinner color="#000" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {step === 'type_selection' && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.label}>Organization Type</Text>
            <View style={styles.pillRow}>
              {(['skills', 'tertiary', 'org'] as const).map((k) => (
                <TouchableOpacity key={k} style={[styles.pill, orgKind === k && styles.pillActive]} onPress={() => setOrgKind(k)}>
                  <Text style={[styles.pillText, orgKind === k && styles.pillTextActive]}>
                    {k === 'skills' ? 'Skills Development Centre' : k === 'tertiary' ? 'Tertiary Institution' : 'Other Organization'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.button} onPress={() => setStep('details')}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>

            {/* Sign-in option for users who already have accounts */}
            <View style={styles.signInContainer}>
              <Text style={styles.signInText}>Already have an account?</Text>
              <TouchableOpacity 
                onPress={() => router.replace('/(auth)/sign-in')} 
                style={styles.signInButton}
              >
                <Text style={styles.signInButtonText}>Sign In Instead</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'details' && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.label}>Organization name</Text>
            <TextInput
              style={styles.input}
              value={orgName}
              onChangeText={setOrgName}
              placeholder="e.g. Future Skills Academy"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              value={adminName}
              onChangeText={setAdminName}
              placeholder="Admin full name"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Organization phone (optional)</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+27-.."
              keyboardType="phone-pad"
            />

            <TouchableOpacity disabled={!canCreate || creating} style={[styles.button, (!canCreate || creating) && styles.buttonDisabled]} onPress={handleCreateOrg}>
              {creating ? <EduDashSpinner color="#000" /> : <Text style={styles.buttonText}>Create organization</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep('type_selection')} style={styles.linkBtn}>
              <Text style={styles.linkText}>Back</Text>
            </TouchableOpacity>

            {/* Sign-in option for users who already have accounts */}
            <View style={styles.signInContainer}>
              <Text style={styles.signInText}>Already have an account?</Text>
              <TouchableOpacity 
                onPress={() => router.replace('/(auth)/sign-in')} 
                style={styles.signInButton}
              >
                <Text style={styles.signInButtonText}>Sign In Instead</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {/* Sign-in option for users who already have accounts - only show on account creation step */}
        {step === 'account_creation' && (
          <View style={styles.signInContainer}>
            <Text style={styles.signInText}>Already have an account?</Text>
            <TouchableOpacity 
              onPress={() => router.replace('/(auth)/sign-in')} 
              style={styles.signInButton}
            >
              <Text style={styles.signInButtonText}>Sign In Instead</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  content: { padding: 20, paddingBottom: 40 },
  heading: { 
    color: '#fff', 
    fontSize: 28, 
    fontWeight: '800', 
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subheading: { 
    color: '#9CA3AF', 
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 22,
  },
  inputContainer: {
    marginTop: 16,
  },
  label: { 
    color: '#E5E7EB', 
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: { 
    backgroundColor: '#111827', 
    color: '#fff', 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: '#1f2937', 
    padding: 14,
    fontSize: 16,
  },
  passwordWrapper: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
  button: { 
    marginTop: 24, 
    backgroundColor: '#00f5ff', 
    padding: 16, 
    borderRadius: 10, 
    alignItems: 'center',
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: { 
    opacity: 0.6,
    shadowOpacity: 0.1,
  },
  buttonText: { 
    color: '#000', 
    fontWeight: '800',
    fontSize: 16,
  },
  pillRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap',
    gap: 10, 
    marginTop: 12,
    marginBottom: 8,
  },
  pill: { 
    paddingVertical: 10, 
    paddingHorizontal: 16, 
    borderRadius: 20, 
    borderWidth: 1.5, 
    borderColor: '#1f2937', 
    backgroundColor: '#0b1220',
    minWidth: 100,
  },
  pillActive: { 
    backgroundColor: '#00f5ff', 
    borderColor: '#00f5ff',
  },
  pillText: { 
    color: '#9CA3AF', 
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  pillTextActive: { 
    color: '#000',
    fontWeight: '700',
  },
  linkBtn: { 
    marginTop: 16, 
    alignItems: 'center',
  },
  linkText: { 
    color: '#60A5FA', 
    fontSize: 14,
    fontWeight: '600',
  },
  signInContainer: {
    marginTop: 32,
    alignItems: 'center',
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  signInText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 12,
  },
  signInButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  signInButtonText: {
    color: '#00f5ff',
    fontSize: 16,
    fontWeight: '600',
  },
});
