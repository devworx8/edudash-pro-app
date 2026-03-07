"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    setLoading(false);
    
    if (resetError) {
      setError(resetError.message);
      return;
    }

    setEmailSent(true);
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
          {/* Back button */}
          <Link href="/sign-in" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#00f5ff", fontSize: 14, textDecoration: "none", marginBottom: 24, fontWeight: 600 }}>
            ← Back to Sign In
          </Link>

          {/* Header with icon */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 64, height: 64, background: "rgba(99, 102, 241, 0.15)", borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>
              🔒
            </div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Forgot Password?</h1>
            <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.6 }}>
              No worries! Enter your email and we'll send you instructions to reset your password.
            </p>
          </div>

          {!emailSent ? (
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
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
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Email Sent!</h2>
              <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                Check your email for a link to reset your password. If it doesn't appear within a few minutes, check your spam folder.
              </p>
              <Link href="/sign-in" style={{ textDecoration: "none" }}>
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
                  Back to Sign In
                </button>
              </Link>
            </div>
          )}

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
