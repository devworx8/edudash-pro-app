/**
 * Reset Password Route Handler
 * 
 * This is a root-level route handler for the deep link:
 * edudashpro://reset-password
 * 
 * It handles the PKCE flow from Supabase password recovery emails.
 * After Supabase redirects here with the session established,
 * this route renders the actual reset password UI.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { assertSupabase } from '@/lib/supabase';
import { setPasswordRecoveryInProgress } from '@/lib/sessionManager';
import { logger } from '@/lib/logger';
import ResetPasswordScreen from './(auth)/reset-password';

const TAG = 'ResetPasswordRoute';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function ResetPasswordRoute() {
  const params = useLocalSearchParams();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const normalizedUrlRef = useRef(false);

  useEffect(() => {
    const checkAndSetupSession = async () => {
      const normalizeRecoveryUrl = () => {
        if (normalizedUrlRef.current) return;
        const hasSensitiveParams = Boolean(params.code || params.token_hash || params.token);
        if (!hasSensitiveParams) return;
        normalizedUrlRef.current = true;
        router.replace('/reset-password?type=recovery' as `/${string}`);
      };

      try {
        const supabase = assertSupabase();
        
        // IMPORTANT: Set the recovery flag FIRST to prevent AuthContext from routing away
        setPasswordRecoveryInProgress(true);
        logger.info(TAG, 'Set password recovery flag to true');
        
        // Check for PKCE code parameter (from web redirect)
        const code = params.code as string | undefined;
        const token_hash = params.token_hash as string | undefined;
        const token = params.token as string | undefined;
        const type = params.type as string | undefined;
        
        logger.debug(TAG, 'Checking session with params:', { 
          hasCode: !!code,
          hasTokenHash: !!token_hash,
          hasToken: !!token,
          type 
        });

        // Handle PKCE code exchange if present
        if (code) {
          logger.debug(TAG, 'Processing PKCE code exchange...');
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          
          if (exchangeError) {
            console.error('[ResetPasswordRoute] Code exchange failed:', exchangeError);
            setHasSession(false);
            setChecking(false);
            return;
          }

          if (data.session) {
            logger.info(TAG, 'PKCE code exchanged successfully');
            setHasSession(true);
            normalizeRecoveryUrl();
            setChecking(false);
            return;
          }
        }

        // Handle token_hash (legacy flow)
        if (token_hash && type === 'recovery') {
          logger.debug(TAG, 'Processing token_hash verification...');
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'recovery',
          });

          if (verifyError) {
            console.error('[ResetPasswordRoute] Token verification failed:', verifyError);
            setHasSession(false);
            setChecking(false);
            return;
          }

          if (data.session) {
            logger.info(TAG, 'Token verified successfully');
            setHasSession(true);
            normalizeRecoveryUrl();
            setChecking(false);
            return;
          }
        }

        // Handle PKCE token parameter
        if (token && type === 'recovery') {
          logger.debug(TAG, 'Processing PKCE token...');
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery',
          });

          if (verifyError) {
            console.error('[ResetPasswordRoute] PKCE token verification failed:', verifyError);
            setHasSession(false);
            setChecking(false);
            return;
          }

          if (data.session) {
            logger.info(TAG, 'PKCE token verified successfully');
            setHasSession(true);
            normalizeRecoveryUrl();
            setChecking(false);
            return;
          }
        }
        
        // Fallback: Check for existing session (PKCE flow may have already set it)
        const { data: { session }, error } = await supabase.auth.getSession();
        
        logger.debug(TAG, 'Session check:', { 
          hasSession: !!session, 
          userId: session?.user?.id,
          error: error?.message 
        });

        if (session && session.user) {
          // We have a valid session from the PKCE flow
          setHasSession(true);
          normalizeRecoveryUrl();
        } else {
          // No session - the link might be expired or user needs to request new one
          logger.info(TAG, 'No valid session found');
          setHasSession(false);
        }
      } catch (e) {
        console.error('[ResetPasswordRoute] Error:', e);
        setHasSession(false);
      } finally {
        setChecking(false);
      }
    };

    // Small delay to ensure Supabase has processed the redirect
    setTimeout(checkAndSetupSession, 500);
  }, [params]);

  // Show loading while checking session
  if (checking) {
    return (
      <View style={styles.container}>
        <EduDashSpinner size="large" color="#00f5ff" />
        <Text style={styles.text}>Verifying reset link...</Text>
      </View>
    );
  }

  // Render the actual reset password screen
  // It will handle both valid and invalid session states
  return <ResetPasswordScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0f',
    gap: 16,
  },
  text: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
});
