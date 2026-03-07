'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resolveIsRecoveryFlow } from '@/lib/auth/recoveryFlow';

/**
 * Auth Callback Page
 * 
 * This page handles authentication callbacks (magic links, password reset, etc.)
 * from Supabase. It detects if the user is on a mobile device and redirects
 * to the native app using the custom URL scheme.
 * 
 * For desktop/web users, it processes the authentication directly.
 */

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'processing' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get all URL parameters
        const token_hash = searchParams.get('token_hash');
        const token = searchParams.get('token'); // PKCE token parameter
        const code = searchParams.get('code'); // PKCE code parameter
        const type = searchParams.get('type');
        const flow = searchParams.get('flow');
        const access_token = searchParams.get('access_token');
        const refresh_token = searchParams.get('refresh_token');
        const error = searchParams.get('error');
        const error_description = searchParams.get('error_description');

        // Check for errors first
        if (error) {
          setStatus('error');
          setErrorMessage(error_description || error);
          return;
        }

        // Detect if user is on mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );

        // Build the redirect URL with all parameters
        const params = new URLSearchParams();
        if (token_hash) params.set('token_hash', token_hash);
        if (token) params.set('token', token); // PKCE token
        if (code) params.set('code', code); // PKCE code
        const resolvedType = type || (flow === 'recovery' ? 'recovery' : null);
        if (resolvedType) params.set('type', resolvedType);
        if (access_token) params.set('access_token', access_token);
        if (refresh_token) params.set('refresh_token', refresh_token);

        // Also check for hash fragment (OAuth returns tokens in hash)
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const hashAccessToken = hashParams.get('access_token');
        const hashRefreshToken = hashParams.get('refresh_token');
        
        if (hashAccessToken) params.set('access_token', hashAccessToken);
        if (hashRefreshToken) params.set('refresh_token', hashRefreshToken);

        const queryString = params.toString();

        if (isMobile) {
          // Redirect to native app using custom scheme
          setStatus('redirecting');
          
          // Try the custom scheme first
          const appUrl = `edudashpro://auth-callback${queryString ? `?${queryString}` : ''}`;
          
          console.log('[AuthCallback] Redirecting to native app:', appUrl);
          
          // Use location.href for scheme redirect
          window.location.href = appUrl;
          
          // Fallback: If the app doesn't open after 2 seconds, show instructions
          setTimeout(() => {
            setStatus('error');
            setErrorMessage(
              'Unable to open the EduDash Pro app. Please make sure the app is installed and try again.'
            );
          }, 3000);
        } else {
          // Web user - process authentication directly
          setStatus('processing');
          
          // Import Supabase client dynamically
          const { createClient } = await import('@/lib/supabase/client');
          const supabase = createClient();
          const redirectForResolvedSession = (sessionUser?: { recovery_sent_at?: string } | null) => {
            const isRecovery = resolveIsRecoveryFlow({
              type: resolvedType,
              flow,
              recoverySentAt: sessionUser?.recovery_sent_at,
            });
            window.location.href = isRecovery ? '/reset-password' : '/dashboard';
          };

          // Handle PKCE code exchange (for magic links with code parameter)
          if (code) {
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            
            if (exchangeError) {
              setStatus('error');
              setErrorMessage(exchangeError.message);
              return;
            }

            if (!data.session) {
              setStatus('error');
              setErrorMessage('Authentication succeeded but no session was created.');
              return;
            }

            redirectForResolvedSession(data.session.user as { recovery_sent_at?: string } | null);
          } else if (token_hash && resolvedType) {
            // Magic link or email verification (legacy token_hash flow)
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
              token_hash,
              type: resolvedType as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email',
            });

            if (verifyError) {
              setStatus('error');
              setErrorMessage(verifyError.message);
              return;
            }

            if (data?.session?.user) {
              redirectForResolvedSession(data.session.user as { recovery_sent_at?: string } | null);
            } else {
              const { data: sessionData } = await supabase.auth.getSession();
              redirectForResolvedSession(sessionData.session?.user as { recovery_sent_at?: string } | null);
            }
          } else if (token && resolvedType === 'magiclink') {
            // PKCE token parameter (try verifyOtp)
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: token,
              type: 'magiclink',
            });

            if (verifyError) {
              setStatus('error');
              setErrorMessage(verifyError.message || 'Magic link verification failed.');
              return;
            }

            if (!data.session) {
              setStatus('error');
              setErrorMessage('Authentication succeeded but no session was created.');
              return;
            }

            redirectForResolvedSession(data.session.user as { recovery_sent_at?: string } | null);
          } else if (hashAccessToken) {
            // OAuth callback
            const { data, error: sessionError } = await supabase.auth.setSession({
              access_token: hashAccessToken,
              refresh_token: hashRefreshToken || '',
            });

            if (sessionError) {
              setStatus('error');
              setErrorMessage(sessionError.message);
              return;
            }

            redirectForResolvedSession(data.session?.user as { recovery_sent_at?: string } | null);
          } else {
            setStatus('error');
            setErrorMessage('Invalid authentication callback. Missing required parameters.');
          }
        }
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err);
        setStatus('error');
        setErrorMessage(err.message || 'An unexpected error occurred');
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px',
      textAlign: 'center',
    }}>
      {status === 'loading' && (
        <>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ marginTop: '20px', color: 'rgba(255,255,255,0.8)' }}>
            Processing authentication...
          </p>
        </>
      )}

      {status === 'redirecting' && (
        <>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            fontSize: '32px',
          }}>
            📱
          </div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '24px' }}>
            Opening EduDash Pro...
          </h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', maxWidth: '300px' }}>
            If the app doesn't open automatically, please make sure EduDash Pro is installed on your device.
          </p>
          <a 
            href="https://play.google.com/store/apps/details?id=com.edudashpro.app"
            style={{
              marginTop: '24px',
              padding: '12px 24px',
              background: '#6366f1',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '600',
            }}
          >
            Get the App
          </a>
        </>
      )}

      {status === 'processing' && (
        <>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#10b981',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ marginTop: '20px', color: 'rgba(255,255,255,0.8)' }}>
            Signing you in...
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'rgba(239, 68, 68, 0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            fontSize: '32px',
          }}>
            ⚠️
          </div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '24px', color: '#ef4444' }}>
            Authentication Error
          </h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', maxWidth: '400px' }}>
            {errorMessage}
          </p>
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <a 
              href="/sign-in"
              style={{
                padding: '12px 24px',
                background: '#6366f1',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '8px',
                fontWeight: '600',
              }}
            >
              Go to Sign In
            </a>
            <Link 
              href="/"
              style={{
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '8px',
                fontWeight: '600',
              }}
            >
              Go Home
            </Link>
          </div>
        </>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)',
      color: 'white',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '3px solid rgba(255,255,255,0.2)',
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <p style={{ marginTop: '20px', color: 'rgba(255,255,255,0.8)' }}>
        Loading...
      </p>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Default export with Suspense boundary
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
