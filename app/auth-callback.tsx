import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { assertSupabase } from '@/lib/supabase';
import { setPasswordRecoveryInProgress, signOut as signOutSession } from '@/lib/sessionManager';
import { resolveIsRecoveryFlow } from '@/lib/auth/recoveryFlow';
import { parseDeepLinkUrl } from '@/lib/utils/deepLink';
import { logger } from '@/lib/logger';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function AuthCallback() {
  const handled = useRef(false);
  const [message, setMessage] = useState('Finalizing sign-in…');
  const debugEnabled = process.env.EXPO_PUBLIC_DEBUG_MODE === 'true' || __DEV__;
  const localParams = useLocalSearchParams<Record<string, string | string[]>>();
  const normalizedLocalParams = useMemo(() => {
    const normalized: Record<string, string> = {};
    Object.entries(localParams || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length) normalized[key] = String(value[0]);
        return;
      }
      if (value === undefined || value === null) return;
      normalized[key] = String(value);
    });
    return normalized;
  }, [localParams]);

  const buildCallbackUrl = (params: Record<string, string>) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (!key || value === undefined || value === null || value === '') return;
      search.set(key, String(value));
    });
    const query = search.toString();
    return `edudashpro://auth-callback${query ? `?${query}` : ''}`;
  };

  const resolveCallbackUrl = (rawUrl?: string | null) => {
    if (Platform.OS === 'web') {
      if (rawUrl) return rawUrl;
      if (typeof window !== 'undefined') return window.location.href;
      return null;
    }
    if (rawUrl) {
      const parsed = parseDeepLinkUrl(rawUrl);
      if (Object.keys(parsed.params).length > 0 || Object.keys(normalizedLocalParams).length > 0) {
        const mergedParams = { ...normalizedLocalParams, ...parsed.params };
        return buildCallbackUrl(mergedParams);
      }
    }
    if (Object.keys(normalizedLocalParams).length > 0) {
      return buildCallbackUrl(normalizedLocalParams);
    }
    return rawUrl || null;
  };

  const sanitizeCallbackUrl = (rawUrl?: string | null) => {
    if (!rawUrl) return rawUrl;
    try {
      const url = new URL(rawUrl.replace('edudashpro://', 'https://app.edudashpro.org.za/'));
      const sensitiveKeys = ['access_token', 'refresh_token', 'token', 'token_hash', 'code'];
      sensitiveKeys.forEach((key) => {
        if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]');
      });
      return url.toString();
    } catch {
      return rawUrl.replace(/(access_token|refresh_token|token_hash|token|code)=([^&]+)/g, '$1=[redacted]');
    }
  };

  async function handleCallback(urlStr?: string | null) {
    if (handled.current) return;
    handled.current = true;

    const safeRedirectToSignIn = () => {
      try {
        router.replace('/(auth)/sign-in');
      } catch {
        try {
          router.replace('/(auth)/sign-in' as any);
        } catch {
          // last resort: reload so user can sign in from landing
          if (typeof window !== 'undefined') window.location.href = '/sign-in';
        }
      }
    };

    try {
      setMessage('Processing authentication...');
      
      if (!urlStr) {
        // Try to get URL from window location on web
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          urlStr = window.location.href;
        } else {
          throw new Error('No URL provided');
        }
      }

      if (debugEnabled) {
        logger.debug('AuthCallback', 'Processing URL:', sanitizeCallbackUrl(urlStr));
      }

      const supabase = await assertSupabase();
      const recoveryHint = resolveIsRecoveryFlow({
        type: normalizedLocalParams['type'],
        flow: normalizedLocalParams['flow'],
        hasRecoveryFlag:
          urlStr.includes('type=recovery') ||
          urlStr.includes('flow=recovery'),
      });
      if (recoveryHint) {
        // Set recovery flag early so AuthContext does not auto-route away.
        try { setPasswordRecoveryInProgress(true); } catch { /* non-fatal */ }
      }

      const routeToResetPassword = () => {
        router.replace('/reset-password?type=recovery' as `/${string}`);
      };

      const handleEmailChange = async (session: {
        access_token: string;
        refresh_token: string;
        user?: { id: string; email?: string | null };
      }) => {
        try {
          const nextEmail = session.user?.email || '';
          if (session.user?.id && nextEmail) {
            await supabase
              .from('profiles')
              .update({ email: nextEmail, updated_at: new Date().toISOString() })
              .eq('id', session.user.id);
          }
          await signOutSession();
          const emailParam = nextEmail ? `&email=${encodeURIComponent(nextEmail)}` : '';
          router.replace(`/(auth)/sign-in?emailChanged=true${emailParam}` as `/${string}`);
        } catch {
          router.replace('/(auth)/sign-in?emailChanged=true' as `/${string}`);
        }
      };

      // Case 1: OAuth callback (hash fragment with tokens)
      if (urlStr.includes('#access_token') || urlStr.includes('access_token=')) {
        setMessage('Validating session...');
        
        // Try hash fragment first
        let access_token: string | null = null;
        let refresh_token: string | null = null;
        let flowType: string | null = null;
        
        if (urlStr.includes('#')) {
          const hash = urlStr.slice(urlStr.indexOf('#') + 1);
          const params = new URLSearchParams(hash);
          access_token = params.get('access_token');
          refresh_token = params.get('refresh_token');
          flowType = params.get('type') || params.get('flow');
        }
        
        // Also try query params
        if (!access_token) {
          try {
            const url = new URL(urlStr);
            access_token = url.searchParams.get('access_token');
            refresh_token = url.searchParams.get('refresh_token');
            flowType = flowType || url.searchParams.get('type') || url.searchParams.get('flow');
          } catch {
            // URL parsing failed, try manual extraction
            const match = urlStr.match(/access_token=([^&]+)/);
            if (match) access_token = match[1];
            const refreshMatch = urlStr.match(/refresh_token=([^&]+)/);
            if (refreshMatch) refresh_token = refreshMatch[1];
            const typeMatch = urlStr.match(/type=([^&]+)/);
            if (typeMatch) flowType = decodeURIComponent(typeMatch[1]);
            const flowMatch = urlStr.match(/flow=([^&]+)/);
            if (flowMatch) flowType = decodeURIComponent(flowMatch[1]);
          }
        }

        if (access_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || '',
          });

          if (error) throw error;

          const normalizedFlow = (flowType || '').toLowerCase();
          const isRecovery = resolveIsRecoveryFlow({
            type: flowType,
            flow: flowType,
            recoverySentAt: (data.session?.user as { recovery_sent_at?: string } | null)?.recovery_sent_at,
            hasRecoveryFlag: recoveryHint,
          });

          if (isRecovery) {
            try { setPasswordRecoveryInProgress(true); } catch { /* non-fatal */ }
            if (!data.session) {
              throw new Error('Recovery session not established. Please retry the recovery link.');
            }
            setMessage('Opening password reset...');
            routeToResetPassword();
            return;
          }

          if (normalizedFlow === 'email_change' && data.session) {
            setMessage('Finalizing email change...');
            await handleEmailChange(data.session);
            return;
          }

          setMessage('Sign-in successful! Redirecting...');
          if (debugEnabled) logger.debug('AuthCallback', 'OAuth sign-in successful');
          
          // Small delay for better UX
          setTimeout(() => {
            router.replace('/profiles-gate');
          }, 500);
          
          return;
        }
      }

      // Case 2: Magic link / Email verification (query params with token_hash or token for PKCE)
      if (urlStr.includes('token_hash=') || urlStr.includes('token_hash%3D') || 
          urlStr.includes('token=') || urlStr.includes('token%3D') ||
          urlStr.includes('code=') || urlStr.includes('code%3D')) {
        setMessage('Verifying link...');
        
        let token_hash: string | null = null;
        let token: string | null = null;
        let code: string | null = null;
        let typeParam: string | null = null;
        
        try {
          // Handle both edudashpro:// scheme and https:// URLs
          const url = new URL(urlStr.replace('edudashpro://', 'https://app.edudashpro.org.za/'));
          token_hash = url.searchParams.get('token_hash');
          token = url.searchParams.get('token');
          code = url.searchParams.get('code');
          typeParam = url.searchParams.get('type');
        } catch {
          // Manual extraction for malformed URLs
          const hashMatch = urlStr.match(/token_hash=([^&]+)/);
          if (hashMatch) token_hash = decodeURIComponent(hashMatch[1]);
          const tokenMatch = urlStr.match(/token=([^&]+)/);
          if (tokenMatch) token = decodeURIComponent(tokenMatch[1]);
          const codeMatch = urlStr.match(/code=([^&]+)/);
          if (codeMatch) code = decodeURIComponent(codeMatch[1]);
          const typeMatch = urlStr.match(/type=([^&]+)/);
          if (typeMatch) typeParam = decodeURIComponent(typeMatch[1]);
        }

        if (debugEnabled) {
          logger.debug('AuthCallback', 'Magic link params:', {
            token_hash: token_hash ? '[redacted]' : 'null',
            token: token ? '[redacted]' : 'null',
            code: code ? 'present' : 'null',
            type: typeParam
          });
        }

        // Valid OTP types for Supabase
        type OtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';
        const validTypes: OtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];
        const normalizedTypeParam = (typeParam || '').toLowerCase();
        const fallbackType: OtpType =
          normalizedTypeParam === 'recovery' || recoveryHint ? 'recovery' : 'magiclink';
        const type: OtpType = validTypes.includes(normalizedTypeParam as OtpType)
          ? (normalizedTypeParam as OtpType)
          : fallbackType;

        setMessage(type === 'recovery' ? 'Verifying password reset link...' : 'Verifying magic link...');

        // Handle PKCE flow with code parameter
        if (code) {
          if (debugEnabled) logger.debug('AuthCallback', 'Processing PKCE code exchange...');
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            logger.error('AuthCallback', 'Code exchange failed:', error);
            throw error;
          }

          if (debugEnabled) {
            logger.debug('AuthCallback', 'Code exchanged successfully, session:', data.session ? 'exists' : 'null');
          }

          if (!data.session) {
            throw new Error('Authentication succeeded but no session was created. Please try again.');
          }

          setMessage('Sign-in successful! Redirecting...');
          if (debugEnabled) logger.debug('AuthCallback', 'PKCE magic link successful');

          // Detect recovery even when Supabase strips the type=recovery param
          const isRecoveryCodeExchange = resolveIsRecoveryFlow({
            type,
            flow: normalizedLocalParams['flow'],
            recoverySentAt: (data.session?.user as { recovery_sent_at?: string } | null)?.recovery_sent_at,
            hasRecoveryFlag: recoveryHint,
          });

          if (isRecoveryCodeExchange && data.session) {
            if (debugEnabled) logger.debug('AuthCallback', 'Recovery detected - routing to native reset-password');
            try { setPasswordRecoveryInProgress(true); } catch { /* non-fatal */ }
            routeToResetPassword();
            return;
          }

          if (type === 'email_change' && data.session) {
            if (debugEnabled) logger.debug('AuthCallback', 'Email change detected - finalizing and signing out');
            void handleEmailChange(data.session);
            return;
          }

          setTimeout(() => {
            router.replace('/profiles-gate');
          }, 300);
          
          return;
        }

        // Handle token_hash (legacy flow)
        if (token_hash) {
          if (debugEnabled) logger.debug('AuthCallback', 'Verifying OTP with type:', type);
          
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type,
          });

          if (error) {
            logger.error('AuthCallback', 'OTP verification failed:', error);
            throw error;
          }

          if (debugEnabled) {
            logger.debug('AuthCallback', 'OTP verified successfully, session:', data.session ? 'exists' : 'null');
          }
          
          // If verifyOtp returned a session, set it explicitly
          if (data.session) {
            if (debugEnabled) logger.debug('AuthCallback', 'Setting session from verifyOtp response');
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            });
            
            if (setSessionError) {
              logger.error('AuthCallback', 'Failed to set session:', setSessionError);
              throw setSessionError;
            }
            if (debugEnabled) logger.debug('AuthCallback', 'Session set successfully');
          }
          
          // Wait a moment for the auth state change to propagate
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Double-check session is set
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (debugEnabled) {
            logger.debug('AuthCallback', 'Current session after verify:', sessionData.session ? 'exists' : 'null');
          }

          if (!sessionData.session) {
            throw new Error('Authentication succeeded but no session was created. Please try again.');
          }

          setMessage('Sign-in successful! Redirecting...');
          if (debugEnabled) logger.debug('AuthCallback', 'Magic link verification successful');

          // Detect recovery even when type param is missing
          const isRecoveryOtp = resolveIsRecoveryFlow({
            type,
            flow: normalizedLocalParams['flow'],
            recoverySentAt: (sessionData.session?.user as { recovery_sent_at?: string } | null)?.recovery_sent_at,
            hasRecoveryFlag: recoveryHint,
          });

          if (isRecoveryOtp && sessionData.session) {
            if (debugEnabled) logger.debug('AuthCallback', 'Recovery detected - routing to native reset-password');
            try { setPasswordRecoveryInProgress(true); } catch { /* non-fatal */ }
            routeToResetPassword();
            return;
          }

          if (type === 'email_change' && sessionData.session) {
            if (debugEnabled) logger.debug('AuthCallback', 'Email change detected - finalizing and signing out');
            void handleEmailChange(sessionData.session);
            return;
          }

          setTimeout(() => {
            router.replace('/profiles-gate');
          }, 300);
          
          return;
        }

        // Handle PKCE token parameter (if present but no code)
        if (token && type === 'magiclink') {
          if (debugEnabled) logger.debug('AuthCallback', 'Processing PKCE token for magic link...');
          // For PKCE tokens, we need to verify them differently
          // Try using verifyOtp with the token
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'magiclink',
          });

          if (error) {
            logger.error('AuthCallback', 'PKCE token verification failed:', error);
            // If verifyOtp fails, the token might need different handling
            // Redirect to sign-in with error
            throw new Error('Magic link verification failed. Please request a new link.');
          }

          if (data.session) {
            if (debugEnabled) logger.debug('AuthCallback', 'PKCE token verified, session created');
            setMessage('Sign-in successful! Redirecting...');
            
            setTimeout(() => {
              router.replace('/profiles-gate');
            }, 800);
            
            return;
          }
        }
      }

      // Case 3: Error in callback
      if (urlStr.includes('error=')) {
        let error: string | null = null;
        let error_description: string | null = null;
        
        try {
          const url = new URL(urlStr.replace('edudashpro://', 'https://app.edudashpro.org.za/'));
          error = url.searchParams.get('error');
          error_description = url.searchParams.get('error_description');
        } catch {
          const errorMatch = urlStr.match(/error=([^&]+)/);
          if (errorMatch) error = decodeURIComponent(errorMatch[1]);
        }
        
      logger.error('AuthCallback', 'OAuth error:', error, error_description);
        setMessage(error_description || error || 'Authentication failed');
        setTimeout(safeRedirectToSignIn, 2500);
        return;
      }

      // No recognized callback pattern
      if (debugEnabled) {
        logger.warn('AuthCallback', 'Unrecognized callback pattern, URL:', sanitizeCallbackUrl(urlStr));
      }
      setMessage('Could not process authentication. Redirecting to sign-in...');
      setTimeout(safeRedirectToSignIn, 2000);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Authentication failed. Please try again.';
      logger.error('AuthCallback', 'Error:', e);
      try {
        setMessage(msg || 'Something went wrong. Redirecting to sign-in...');
      } catch {
        // ignore state update errors
      }
      setTimeout(safeRedirectToSignIn, 2500);
    }
  }

  useEffect(() => {
    // Get initial URL
    Linking.getInitialURL().then((url) => {
      const resolved = resolveCallbackUrl(url);
      if (resolved) {
        handleCallback(resolved);
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // On web, check window.location
        handleCallback(window.location.href);
      }
    });

    // Listen for deep link events
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const resolved = resolveCallbackUrl(url);
      handleCallback(resolved || url);
    });

    return () => subscription.remove();
  }, [normalizedLocalParams]);

  return (
    <View style={styles.container}>
      <EduDashSpinner size="large" color="#00f5ff" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1220',
    gap: 16,
    padding: 24,
  },
  text: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
});
