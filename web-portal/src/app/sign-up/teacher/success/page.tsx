"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPendingTeacherInvite } from "@/lib/utils/pendingTeacherInvite";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.edudashpro";
const APP_STORE_URL = "https://apps.apple.com/app/edudash-pro/id6478437234";

export default function TeacherSignupSuccessPage() {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [inviteToken, setInviteToken] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform("ios");
    } else if (/android/.test(ua)) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    const pending = getPendingTeacherInvite();
    if (pending?.token) setInviteToken(pending.token);
    if (pending?.email) setInviteEmail(pending.email);
  }, []);

  const openInApp = () => {
    const deepLink = inviteToken && inviteEmail
      ? `edudashpro:///screens/teacher-invite-accept?token=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(inviteEmail)}`
      : "edudashpro:///";

    const handleVisibilityChange = () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.location.href = deepLink;
    setTimeout(() => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, 1500);
  };

  const getStoreUrl = () => (platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL);
  const getStoreName = () => (platform === "ios" ? "App Store" : "Google Play");

  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
        }
      `}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", fontFamily: "system-ui, sans-serif", padding: "20px" }}>
        <div style={{ maxWidth: 540, background: "#111113", padding: 40, borderRadius: 16, border: "1px solid #1f1f23", textAlign: "center" }}>
          <div style={{ width: 80, height: 80, background: "linear-gradient(135deg, #00f5ff 0%, #0088cc 100%)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 40 }}>
            ✅
          </div>

          <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Account Created</h1>
          <p style={{ color: "#9CA3AF", fontSize: 16, lineHeight: 1.6, marginBottom: 20 }}>
            We’ve sent a verification email. Once verified, open the app to accept your teacher invite.
          </p>

          {(inviteToken || inviteEmail) && (
            <div style={{ background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.35)", borderRadius: 12, padding: 16, marginBottom: 24, textAlign: "left" }}>
              <div style={{ color: "#93C5FD", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Invite Details</div>
              <div style={{ color: "#E0E7FF", fontSize: 13, wordBreak: "break-all" }}>Token: {inviteToken || "Pending"}</div>
              <div style={{ color: "#E0E7FF", fontSize: 13, marginTop: 6 }}>Email: {inviteEmail || "Pending"}</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            <button
              onClick={openInApp}
              style={{ width: "100%", padding: "14px 20px", background: "linear-gradient(135deg, #00f5ff 0%, #0088cc 100%)", color: "#000", border: 0, borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
            >
              Open EduDash Pro App
            </button>
            {platform !== "desktop" && (
              <a
                href={getStoreUrl()}
                target="_blank"
                rel="noopener noreferrer"
                style={{ width: "100%", padding: "12px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", color: "#E2E8F0", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
              >
                Download from {getStoreName()}
              </a>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link href="/sign-in" style={{ textDecoration: "none" }}>
              <button style={{ width: "100%", padding: "12px 20px", background: "rgba(255,255,255,0.05)", color: "#00f5ff", border: "1px solid rgba(0,245,255,0.3)", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Go to Sign In
              </button>
            </Link>
            <Link href="/" style={{ textDecoration: "none" }}>
              <button style={{ width: "100%", padding: "12px 20px", background: "transparent", color: "#64748B", border: "1px solid #1f1f23", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                ← Back to Home
              </button>
            </Link>
          </div>

          <p style={{ color: "#6B7280", fontSize: 13, marginTop: 20, lineHeight: 1.5 }}>
            If you don’t see the verification email, check spam or contact{" "}
            <a href="mailto:support@edudashpro.org.za" style={{ color: "#00f5ff", textDecoration: "underline" }}>
              support@edudashpro.org.za
            </a>
            .
          </p>
        </div>
      </div>
    </>
  );
}
