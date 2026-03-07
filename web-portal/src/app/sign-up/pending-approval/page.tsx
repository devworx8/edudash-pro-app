"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function PendingApprovalContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
        }
        @media (min-width: 640px) {
          .approval-container {
            padding: 20px !important;
            align-items: center !important;
          }
          .approval-card {
            max-width: 600px !important;
            border: 1px solid #1f1f23 !important;
            border-radius: 12px !important;
            padding: 40px !important;
          }
        }
      `}</style>
      <div className="approval-container" style={{ minHeight: "100vh", display: "flex", alignItems: "stretch", justifyContent: "center", background: "#0a0a0f", fontFamily: "system-ui, sans-serif", overflowX: "hidden", padding: "0" }}>
        <div className="approval-card" style={{ width: "100%", background: "#111113", padding: "24px", border: "none", boxSizing: "border-box", borderRadius: "0" }}>
          {/* Icon */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 80, height: 80, background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 40 }}>
              ⏳
            </div>
            <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Registration Submitted!</h1>
            <p style={{ color: "#9CA3AF", fontSize: 16, lineHeight: 1.6 }}>
              Your organization registration is pending approval
            </p>
          </div>

          {/* Status Box */}
          <div style={{ background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
              <svg style={{ width: 24, height: 24, flexShrink: 0, marginTop: 2, color: "#f59e0b" }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>What Happens Next?</h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                  <li style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ color: "#00f5ff", fontSize: 20, lineHeight: 1 }}>1.</span>
                    <span style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6 }}>
                      An <strong style={{ color: "#fff" }}>Admin</strong> will review your application
                    </span>
                  </li>
                  <li style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ color: "#00f5ff", fontSize: 20, lineHeight: 1 }}>2.</span>
                    <span style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6 }}>
                      You'll receive an <strong style={{ color: "#fff" }}>email notification</strong> when approved (usually within 24 hours)
                    </span>
                  </li>
                  <li style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ color: "#00f5ff", fontSize: 20, lineHeight: 1 }}>3.</span>
                    <span style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6 }}>
                      Once approved, your organization will be activated in <strong style={{ color: "#fff" }}>both EduSitePro and EduDashPro</strong>
                    </span>
                  </li>
                  <li style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ color: "#00f5ff", fontSize: 20, lineHeight: 1 }}>4.</span>
                    <span style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6 }}>
                      You'll be able to <strong style={{ color: "#fff" }}>sign in</strong> and start building your website and managing operations
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {email && (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #2a2a2f" }}>
                <p style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 4 }}>
                  Confirmation will be sent to:
                </p>
                <p style={{ color: "#00f5ff", fontSize: 14, fontWeight: 600 }}>
                  {email}
                </p>
              </div>
            )}
          </div>

          {/* Info Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 32 }}>
            <div style={{ background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <svg style={{ width: 20, height: 20, color: "#10b981" }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <h4 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>Application Received</h4>
              </div>
              <p style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                Your registration has been successfully submitted to our approval queue.
              </p>
            </div>

            <div style={{ background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <svg style={{ width: 20, height: 20, color: "#3b82f6" }} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <h4 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>Check Your Email</h4>
              </div>
              <p style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                We'll send updates to your email. Please check your spam folder if you don't see it.
              </p>
            </div>

            <div style={{ background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <svg style={{ width: 20, height: 20, color: "#f59e0b" }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <h4 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>Typical Review Time</h4>
              </div>
              <p style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                Most applications are reviewed within <strong style={{ color: "#fff" }}>24 hours</strong> during business days.
              </p>
            </div>
          </div>

          {/* Support Section */}
          <div style={{ background: "#7c3aed15", border: "1px solid #7c3aed30", borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Need Help?</h3>
            <p style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              If you have questions about your application or need assistance, please contact our support team:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <a href="mailto:support@edudashpro.org.za" style={{ color: "#00f5ff", fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                <svg style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                support@edudashpro.org.za
              </a>
              <a href="tel:+27674770975" style={{ color: "#00f5ff", fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                <svg style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                +27 67 477 0975
              </a>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link
              href="/"
              style={{
                display: "block",
                width: "100%",
                padding: "14px 24px",
                background: "linear-gradient(135deg, #00f5ff 0%, #00a0ff 100%)",
                border: "none",
                borderRadius: 8,
                color: "#000",
                fontSize: 14,
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Return to Homepage
            </Link>
            
            <Link
              href="/sign-in"
              style={{
                display: "block",
                width: "100%",
                padding: "14px 24px",
                background: "#1a1a1f",
                border: "1px solid #2a2a2f",
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Already Approved? Sign In
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PendingApprovalPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#fff" }}>
        Loading...
      </div>
    }>
      <PendingApprovalContent />
    </Suspense>
  );
}
