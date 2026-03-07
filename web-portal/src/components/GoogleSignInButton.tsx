"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface GoogleSignInButtonProps {
  onSuccess?: (user: User) => void;
  onError?: (error: string) => void;
  className?: string;
  children?: React.ReactNode;
  redirectTo?: string;
  isSignup?: boolean;
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  className = "",
  children = "Sign in with Google",
  redirectTo = "/dashboard/parent",
  isSignup = false,
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);

    try {
      const supabase = createClient();
      
      console.log('🔐 Initiating Google OAuth via Supabase...');

      // Use Supabase OAuth (no Firebase needed)
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${redirectTo}${isSignup ? '&signup=true' : ''}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
          data: {
            role: 'parent',
            signup_flow: isSignup ? 'true' : 'false',
          }
        },
      });

      if (error) {
        throw error;
      }

      console.log('✅ Google OAuth initiated, redirecting...');
      // Browser will redirect automatically to Google
    } catch (error) {
      console.error("Google sign-in error:", error);
      setLoading(false);
      
      // Provide user-friendly error messages
      let errorMessage = "An unknown error occurred";
      
      if (error instanceof Error) {
        if (error.message.includes('popup-closed-by-user')) {
          errorMessage = "Sign-in was cancelled";
        } else if (error.message.includes('popup-blocked')) {
          errorMessage = "Pop-up was blocked. Please allow pop-ups for this site.";
        } else if (error.message.includes('network-request-failed')) {
          errorMessage = "Network error. Please check your connection.";
        } else {
          errorMessage = error.message;
        }
      }
      
      onError?.(errorMessage);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={loading}
      className={`googleSignInBtn ${className}`}
    >
      {loading ? (
        <>
          <div className="googleSpinner" />
          <span>Signing in...</span>
        </>
      ) : (
        <>
          <svg
            className="googleIcon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>{children}</span>
        </>
      )}
    </button>
  );
}
