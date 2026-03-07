"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getPendingTeacherInvite, clearPendingTeacherInvite } from "@/lib/utils/pendingTeacherInvite";

// Separate component for search params handling
function SignInFormWithParams() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check for verification success
    if (searchParams.get('verified') === 'true') {
      setSuccessMessage('Email verified successfully! You can now sign in.');
    }
    // Check for verification error
    if (searchParams.get('error') === 'verification_failed') {
      setError('Email verification failed. Please try again or contact support.');
    }
    // Check if logged out from another device
    if (searchParams.get('reason') === 'logged_out_other_device') {
      setError('You were logged out because you signed in on another device. EduDash Pro can only be used on one device at a time.');
    }
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (authError) {
      setLoading(false);
      const friendlyMessages: Record<string, string> = {
        'Invalid login credentials': 'Incorrect email or password. Please check your credentials and try again.',
        'Email not confirmed': 'Your email has not been verified. Please check your inbox for a verification link.',
        'Too many requests': 'Too many sign-in attempts. Please wait a moment and try again.',
      };
      setError(friendlyMessages[authError.message] || authError.message);
      return;
    }

    // Get user role from profiles table (single source of truth)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    setLoading(false);

    if (profileError) {
      setError('Failed to fetch user profile. Please contact support.');
      return;
    }

    const role = profile?.role as string | undefined;

    const pendingInvite = getPendingTeacherInvite();
    if (pendingInvite?.token && pendingInvite?.email) {
      const params = new URLSearchParams();
      params.set('token', pendingInvite.token);
      params.set('email', pendingInvite.email);
      clearPendingTeacherInvite();
      router.push(`/invite/teacher?${params.toString()}`);
      return;
    }

    // Role-based routing
    switch (role) {
      case 'parent':
        router.push('/dashboard/parent');
        break;
      case 'teacher':
        router.push('/dashboard/teacher');
        break;
      case 'principal':
        router.push('/dashboard/principal');
        break;
      case 'superadmin':
        router.push('/admin');
        break;
      default:
        router.push('/dashboard');
    }
  }

  // Using consolidated Supabase OAuth via GoogleSignInButton (no Firebase needed)

  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
        }
        @media (min-width: 640px) {
          .sign-in-container {
            padding: 20px !important;
            align-items: center !important;
          }
          .sign-in-card {
            max-width: 500px !important;
            border: 1px solid #1f1f23 !important;
            border-radius: 12px !important;
            padding: 40px !important;
          }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .signInSpinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(0, 0, 0, 0.25);
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        /* Google Sign-In Button Styles */
        .googleSignInBtn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 12px 24px;
          background: white;
          border: 1px solid #dadce0;
          border-radius: 8px;
          color: #3c4043;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Google Sans', Roboto, Arial, sans-serif;
        }
        
        .googleSignInBtn:hover:not(:disabled) {
          background: #f8f9fa;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .googleSignInBtn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .googleIcon {
          width: 18px;
          height: 18px;
        }
        
        .googleSpinner {
          width: 18px;
          height: 18px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #4285F4;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      `}</style>
      <div className="sign-in-container" style={{ minHeight: "100vh", display: "flex", alignItems: "stretch", justifyContent: "center", background: "#0a0a0f", fontFamily: "system-ui, sans-serif", overflowX: "hidden", padding: "0" }}>
        <div className="sign-in-card" style={{ width: "100%", background: "#111113", padding: "24px", border: "none", boxSizing: "border-box", borderRadius: "0" }}>
        {/* Header with icon */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>
            🎓
          </div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>EduDash Pro</h1>
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>Empowering Education Through AI</p>
        </div>

        <div style={{ marginBottom: 32 }}>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Welcome Back</h2>
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>Sign in to your account</p>
        </div>

        {successMessage && (
          <div role="status" style={{ padding: 12, background: "#065f46", border: "1px solid #059669", borderRadius: 8, marginBottom: 20 }}>
            <p style={{ color: "#6ee7b7", fontSize: 14, margin: 0 }}>✓ {successMessage}</p>
          </div>
        )}

        <form onSubmit={onSubmit} aria-label="Sign in form" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label htmlFor="sign-in-email" style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Email</label>
            <input
              id="sign-in-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              aria-required="true"
              style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14 }}
            />
          </div>

          <div>
            <label htmlFor="sign-in-password" style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="sign-in-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                aria-required="true"
                style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, color: "#9CA3AF", cursor: "pointer", fontSize: 18 }}
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ color: "#9CA3AF", fontSize: 14 }}>Remember me</span>
            </label>
            <Link href="/forgot-password" style={{ color: "#00f5ff", fontSize: 14, textDecoration: "none", fontWeight: 600 }}>
              Forgot Password?
            </Link>
          </div>

          {error && (
            <div role="alert" style={{ padding: 12, background: "#7f1d1d", border: "1px solid #991b1b", borderRadius: 8 }}>
              <p style={{ color: "#fca5a5", fontSize: 14, margin: 0 }}>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-label={loading ? "Signing in…" : "Sign in to your account"}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: loading ? "#555" : "linear-gradient(135deg, #00f5ff 0%, #0088cc 100%)",
              color: "#000",
              border: 0,
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {loading ? (
              <>
                <span className="signInSpinner" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
          <div style={{ flex: 1, height: 1, background: "#2a2a2f" }}></div>
          <span style={{ color: "#9CA3AF", fontSize: 14 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#2a2a2f" }}></div>
        </div>

        {/* Google Sign-In - consolidated single flow */}
        <GoogleSignInButton
          className="googleSignInBtn"
          redirectTo="/dashboard/parent"
          onError={(msg) => setError(msg)}
        >
          Continue with Google
        </GoogleSignInButton>

        <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid #2a2a2f" }}>
          <p style={{ color: "#9CA3AF", fontSize: 15, marginBottom: 16, textAlign: "center" }}>Don't have an account?</p>
          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            <Link href="/sign-up/parent" style={{ flex: 1, minWidth: "200px", textDecoration: "none" }}>
              <button style={{ width: "100%", padding: "16px 20px", background: "rgba(99, 102, 241, 0.15)", color: "#fff", border: "2px solid rgba(99, 102, 241, 0.4)", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, transition: "all 0.2s", minHeight: 56 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Sign Up</span>
                <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 500 }}>(Parent)</span>
              </button>
            </Link>
            <Link href="/sign-up/teacher" style={{ flex: 1, minWidth: "200px", textDecoration: "none" }}>
              <button style={{ width: "100%", padding: "16px 20px", background: "rgba(99, 102, 241, 0.15)", color: "#fff", border: "2px solid rgba(99, 102, 241, 0.4)", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, transition: "all 0.2s", minHeight: 56 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Sign Up</span>
                <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 500 }}>(Teacher)</span>
              </button>
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, textAlign: "center" }}>
          <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.5 }}>
            Looking to register a school? <Link href="/sign-up/principal" style={{ color: "#00f5ff", textDecoration: "underline", fontWeight: 600 }}>Click here</Link>
          </p>
          <p style={{ color: "#9CA3AF", fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>
            Looking to onboard an organization? <Link href="/sign-up/organization" style={{ color: "#00f5ff", textDecoration: "underline", fontWeight: 600 }}>Click here</Link>
          </p>
        </div>

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <Link href="/" style={{ color: "#00f5ff", fontSize: 14, textDecoration: "none" }}>
            ← Go to Home
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}

// Main export with Suspense boundary
export default function SignInPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" }}>
        <div style={{ color: "#fff" }}>Loading...</div>
      </div>
    }>
      <SignInFormWithParams />
    </Suspense>
  );
}
