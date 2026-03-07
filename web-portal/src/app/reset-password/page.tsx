"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { signOutEverywhere } from "@/lib/auth/signOut";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect if user is on mobile (for redirect after success)
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    setIsMobile(mobile);

    // ALL users (mobile and web) handle password reset on web
    // This avoids complex deep-linking issues with token exchange
    const checkSession = async () => {
      const supabase = createClient();
      
      // Small delay to allow URL session detection to complete
      // Supabase client automatically handles code exchange from URL
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        setError(sessionError.message || "Invalid or expired reset link. Please request a new password reset.");
        return;
      }
      
      if (session && session.user) {
        setValidSession(true);
        setUserEmail(session.user.email || null);
      } else {
        setError("Invalid or expired reset link. Please request a new password reset.");
      }
    };
    
    checkSession();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);
    
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });
    
    setLoading(false);
    
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    
    // Sign out after password change (user needs to sign in with new password)
    await signOutEverywhere({ timeoutMs: 2500 });
    
    // Redirect after 3 seconds
    setTimeout(() => {
      if (isMobile) {
        // Redirect mobile users back to native app sign-in
        window.location.href = 'edudashpro:///(auth)/sign-in?password_reset=success';
      } else {
        router.push("/sign-in");
      }
    }, 3000);
  }

  if (!validSession && !error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ color: "#fff", fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
        }
      `}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", fontFamily: "system-ui, sans-serif", overflowX: "hidden" }}>
        <div style={{ width: "100%", maxWidth: "500px", background: "#111113", padding: "40px 5%", border: "1px solid #1f1f23", boxSizing: "border-box", margin: "20px" }}>
          {/* Header with icon */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 64, height: 64, background: "rgba(99, 102, 241, 0.15)", borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>
              🔑
            </div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Reset Your Password</h1>
            {userEmail && (
              <div style={{ 
                background: "rgba(99, 102, 241, 0.1)", 
                border: "1px solid rgba(99, 102, 241, 0.3)", 
                borderRadius: 8, 
                padding: "10px 16px", 
                marginTop: 12,
                marginBottom: 8
              }}>
                <p style={{ color: "#9CA3AF", fontSize: 12, margin: 0, marginBottom: 4 }}>Resetting password for:</p>
                <p style={{ color: "#00f5ff", fontSize: 14, fontWeight: 600, margin: 0 }}>{userEmail}</p>
              </div>
            )}
            <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
              Enter your new password below.
            </p>
          </div>

          {!validSession ? (
            <div>
              <div style={{ padding: 12, background: "#7f1d1d", border: "1px solid #991b1b", borderRadius: 8, marginBottom: 20 }}>
                <p style={{ color: "#fca5a5", fontSize: 14, margin: 0 }}>{error}</p>
              </div>
              <Link href="/forgot-password" style={{ textDecoration: "none" }}>
                <button style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "linear-gradient(135deg, #00f5ff 0%, #0088cc 100%)",
                  color: "#000",
                  border: 0,
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                }}>
                  Request New Reset Link
                </button>
              </Link>
            </div>
          ) : success ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Password Reset Successful!</h2>
              <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                Your password has been successfully reset. 
                {isMobile 
                  ? " Redirecting you back to the app..." 
                  : " Redirecting you to sign in..."}
              </p>
              {isMobile && (
                <div style={{ marginTop: 16 }}>
                  <a 
                    href="edudashpro:///(auth)/sign-in?password_reset=success"
                    style={{
                      display: "inline-block",
                      padding: "12px 24px",
                      background: "linear-gradient(135deg, #00f5ff 0%, #0088cc 100%)",
                      color: "#000",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Open EduDash Pro App
                  </a>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>New Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    minLength={8}
                    style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14, paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, color: "#9CA3AF", cursor: "pointer", fontSize: 18 }}
                  >
                    {showPassword ? "👁️" : "👁️‍🗨️"}
                  </button>
                </div>
                <p style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>Must be at least 8 characters</p>
              </div>

              <div>
                <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Confirm Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={8}
                  style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14 }}
                />
              </div>

              {error && (
                <div style={{ padding: 12, background: "#7f1d1d", border: "1px solid #991b1b", borderRadius: 8 }}>
                  <p style={{ color: "#fca5a5", fontSize: 14, margin: 0 }}>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
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
                }}
              >
                {loading ? "Resetting Password..." : "Reset Password"}
              </button>
            </form>
          )}

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <Link href="/sign-in" style={{ color: "#00f5ff", fontSize: 14, textDecoration: "none" }}>
              ← Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
