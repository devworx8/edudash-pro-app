"use client";

import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
        }
      `}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", fontFamily: "system-ui, sans-serif", padding: "20px" }}>
        <div style={{ maxWidth: 500, background: "#111113", padding: 40, borderRadius: 16, border: "1px solid #1f1f23", textAlign: "center" }}>
          {/* Success icon */}
          <div style={{ width: 80, height: 80, background: "linear-gradient(135deg, #00f5ff 0%, #0088cc 100%)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 40 }}>
            ✉️
          </div>

          <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 800, marginBottom: 16 }}>Check Your Email</h1>
          
          <p style={{ color: "#9CA3AF", fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>
            We've sent you a confirmation email. Please click the link in the email to verify your account and complete your registration.
          </p>

          <div style={{ background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: 12, padding: 20, marginBottom: 32 }}>
            <p style={{ color: "#00f5ff", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
              <strong>💡 Tip:</strong> Check your spam folder if you don't see the email within a few minutes.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link href="/sign-in" style={{ textDecoration: "none" }}>
              <button style={{ width: "100%", padding: "14px 20px", background: "linear-gradient(135deg, #00f5ff 0%, #0088cc 100%)", color: "#000", border: 0, borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                Go to Sign In
              </button>
            </Link>
            
            <Link href="/" style={{ textDecoration: "none" }}>
              <button style={{ width: "100%", padding: "14px 20px", background: "rgba(255,255,255,0.05)", color: "#00f5ff", border: "1px solid rgba(0,245,255,0.3)", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                ← Back to Home
              </button>
            </Link>
          </div>

          <p style={{ color: "#6B7280", fontSize: 13, marginTop: 24, lineHeight: 1.5 }}>
            Didn't receive the email? Contact our support team at{" "}
            <a href="mailto:support@edudashpro.org.za" style={{ color: "#00f5ff", textDecoration: "underline" }}>
              support@edudashpro.org.za
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
