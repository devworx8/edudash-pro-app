"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signOutEverywhere } from "@/lib/auth/signOut";

function LandingInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "done">("loading");
  const [message, setMessage] = useState<string>("");

  const playStoreUrl = "https://play.google.com/store/apps/details?id=com.edudashpro";

  const tryOpenApp = (pathAndQuery: string) => {
    // IMPORTANT: Use triple-slash so Android doesn't treat the first segment as hostname.
    // Example: `edudashpro:///screens/payments/return?...`
    const schemeUrl = `edudashpro:///${pathAndQuery.replace(/^\//, "")}`;
    let didHide = false;
    const visibilityHandler = () => {
      if (document.hidden) didHide = true;
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    window.location.replace(schemeUrl);
    setTimeout(() => {
      document.removeEventListener("visibilitychange", visibilityHandler);
      if (!didHide) {
        // Android "Open with" chooser may not hide the page; avoid false "not installed" messaging.
        setStatus("ready");
        setMessage("If prompted, choose EduDash Pro to open. If nothing happens, you can install the app from Google Play.");
      }
    }, 6000);
  };

  useEffect(() => {
    const run = async () => {
      try {
        const flow = (searchParams.get("flow") || searchParams.get("type") || "").toLowerCase();
        const tokenHash = searchParams.get("token_hash") || "";
        const token = searchParams.get("token") || ""; // PKCE token (starts with pkce_)
        // NOTE: 'code' can be EITHER a Supabase auth code (from PKCE flow) OR an invite code
        // We determine which based on the flow type
        const codeParam = searchParams.get("code") || "";
        const invitationCode = searchParams.get("invitationCode") || "";

        // IMPORTANT: Extract tokens from hash fragment (Supabase puts session tokens here after /verify)
        // Example: #access_token=...&refresh_token=...&type=recovery
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hashParams.get("access_token") || "";
        const refreshToken = hashParams.get("refresh_token") || "";
        const hashType = hashParams.get("type") || "";
        
        console.log("[Landing] Params:", { 
          flow, 
          tokenHash: !!tokenHash, 
          token: token ? `${token.substring(0, 10)}...` : null,
          codeParam: codeParam ? `${codeParam.substring(0, 10)}...` : null,
          accessToken: !!accessToken, 
          refreshToken: !!refreshToken, 
          hashType 
        });

        // Check redirect_to parameter (from Supabase 303 redirects) for preserved invite codes
        const redirectTo = searchParams.get("redirect_to") || "";
        let preservedInviteCode = invitationCode;
        if (redirectTo) {
          try {
            const redirectUrl = new URL(decodeURIComponent(redirectTo));
            const redirectCode = redirectUrl.searchParams.get("invitationCode");
            if (redirectCode && !preservedInviteCode) {
              preservedInviteCode = redirectCode;
            }
          } catch (e) {
            // Invalid URL, ignore
          }
        }

        // PASSWORD RESET - handle PKCE auth code, hash fragment tokens, and legacy token_hash
        // ALL USERS (mobile and web) handle password reset on web to avoid deep-linking issues
        // After success, mobile users will be redirected back to the native app
        if (flow === "recovery" || searchParams.get("type") === "recovery" || hashType === "recovery") {
          setMessage("Processing password reset...");
          
          // CASE 1: We have access tokens from hash fragment (session already established)
          if (accessToken && refreshToken) {
            console.log("[Landing] Have tokens from hash, setting session...");
            setStatus("done");
            setMessage("Redirecting to password reset...");
            
            // Set the session on web
            try {
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (error) {
                console.error("[Landing] Error setting session:", error);
              } else {
                console.log("[Landing] Session set successfully");
              }
            } catch (e) {
              console.error("[Landing] Error setting session:", e);
            }
            
            // All users go to web reset-password
            setTimeout(() => {
              router.replace('/reset-password');
            }, 500);
            return;
          }
          
          // CASE 2: Supabase PKCE authorization code - exchange for session
          // After Supabase /verify endpoint validates the PKCE token, it redirects here with ?code=xxx
          // This is different from invite codes - it's used to establish a session
          if (codeParam && flow === "recovery") {
            console.log("[Landing] Have Supabase PKCE auth code, exchanging for session...");
            setMessage("Verifying password reset link...");
            
            try {
              // Exchange authorization code for session
              const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(codeParam);
              
              if (exchangeError) {
                console.error("[Landing] Auth code exchange failed:", exchangeError);
                setStatus("error");
                setMessage(exchangeError.message || "Invalid or expired reset link. Please request a new one.");
                return;
              }
              
              if (!data.session) {
                console.error("[Landing] Auth code exchange succeeded but no session");
                setStatus("error");
                setMessage("Reset link verified but session creation failed. Please try again.");
                return;
              }
              
              console.log("[Landing] Auth code exchanged successfully for:", data.session.user?.email);
              setStatus("done");
              setMessage("Redirecting to password reset...");
              
              // All users go to web reset-password
              setTimeout(() => {
                router.replace('/reset-password');
              }, 500);
              return;
            } catch (e) {
              console.error("[Landing] Auth code exchange error:", e);
              setStatus("error");
              setMessage("Failed to verify reset link. Please request a new one.");
              return;
            }
          }
          
          // CASE 3: PKCE token (starts with pkce_) - need to exchange via verifyOtp
          // This happens when the email link goes directly to landing page without going through /verify
          if (token && token.startsWith('pkce_')) {
            console.log("[Landing] Have PKCE token, exchanging via verifyOtp...");
            setMessage("Verifying password reset link...");
            
            try {
              // Exchange PKCE token for session
              const { data, error: verifyError } = await supabase.auth.verifyOtp({
                token_hash: token,
                type: 'recovery',
              });
              
              if (verifyError) {
                console.error("[Landing] PKCE token exchange failed:", verifyError);
                setStatus("error");
                setMessage(verifyError.message || "Invalid or expired reset link. Please request a new one.");
                return;
              }
              
              if (!data.session) {
                console.error("[Landing] PKCE exchange succeeded but no session");
                setStatus("error");
                setMessage("Reset link verified but session creation failed. Please try again.");
                return;
              }
              
              console.log("[Landing] PKCE token exchanged successfully for:", data.session.user?.email);
              setStatus("done");
              setMessage("Redirecting to password reset...");
              
              // All users go to web reset-password
              setTimeout(() => {
                router.replace('/reset-password');
              }, 500);
              return;
            } catch (e) {
              console.error("[Landing] PKCE token exchange error:", e);
              setStatus("error");
              setMessage("Failed to verify reset link. Please request a new one.");
              return;
            }
          }
          
          // CASE 3: Legacy token_hash - exchange via verifyOtp
          if (tokenHash) {
            console.log("[Landing] Have token_hash, exchanging...");
            setMessage("Verifying password reset link...");
            
            try {
              const { data, error: verifyError } = await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type: 'recovery',
              });
              
              if (verifyError) {
                console.error("[Landing] Token hash exchange failed:", verifyError);
                setStatus("error");
                setMessage(verifyError.message || "Invalid or expired reset link.");
                return;
              }
              
              if (!data.session) {
                setStatus("error");
                setMessage("Reset link verified but session creation failed.");
                return;
              }
              
              console.log("[Landing] Token hash exchanged successfully for:", data.session.user?.email);
              setStatus("done");
              setMessage("Redirecting to password reset...");
              
              // All users go to web reset-password
              setTimeout(() => {
                router.replace('/reset-password');
              }, 500);
              return;
            } catch (e) {
              console.error("[Landing] Token hash exchange error:", e);
              setStatus("error");
              setMessage("Failed to verify reset link.");
              return;
            }
          }
          
          // CASE 4: No token found - show error
          console.log("[Landing] No valid token found for recovery");
          setStatus("error");
          setMessage("Invalid password reset link. Please request a new one.");
          return;
        }

        // EMAIL CONFIRMATION - handle both PKCE tokens and legacy token_hash
        if ((flow === "email-confirm" || searchParams.get("type") === "email" || searchParams.get("type") === "signup")) {
          const emailToken = token || tokenHash;
          if (!emailToken) {
            setStatus("error");
            setMessage("Invalid email verification link.");
            return;
          }
          
          setMessage("Verifying your email...");
          try {
            const { error } = await supabase.auth.verifyOtp({ token_hash: emailToken, type: "email" });
            if (error) throw error;
            
            // Sign out on web so user signs in fresh in the app
            await signOutEverywhere({ timeoutMs: 2500 });
            
            setMessage("Email verified! Opening the app...");
            setStatus("done");
            
            // Deep link to the native app for sign-in (preserve invite code if present)
            setTimeout(() => {
              const inviteParam = preservedInviteCode ? `&invitationCode=${encodeURIComponent(preservedInviteCode)}` : "";
              tryOpenApp(`(auth)/sign-in?emailVerified=true${inviteParam}`);
            }, 1500);
            return;
          } catch (e: any) {
            setStatus("error");
            setMessage(e?.message || "Email verification failed.");
            setTimeout(() => {
              tryOpenApp("(auth)/sign-in?emailVerificationFailed=true");
            }, 2000);
            return;
          }
        }

        // PARENT INVITE (use preserved invite code if available)
        // For invite flows, 'code' param IS the invite code, not a Supabase auth code
        const finalInviteCode = preservedInviteCode || (flow.includes("invite") ? codeParam : "") || invitationCode;
        if (flow === "invite-parent" && finalInviteCode) {
          setMessage("Opening the app for parent registration...");
          setStatus("ready");
          tryOpenApp(`/screens/parent-registration?invitationCode=${encodeURIComponent(finalInviteCode)}`);
          return;
        }

        // STUDENT/MEMBER INVITE (use preserved invite code if available)
        if ((flow === "invite-student" || flow === "invite-member") && finalInviteCode) {
          setMessage("Opening the app to join by code...");
          setStatus("ready");
          tryOpenApp(`/screens/student-join-by-code?code=${encodeURIComponent(finalInviteCode)}`);
          return;
        }

        // Default
        setMessage("Opening the app...");
        setStatus("ready");
        tryOpenApp("/");
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message || "Something went wrong.");
      }
    };
    run();
  }, [searchParams, router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 24, background: "#0a0a0f", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      {(status === "loading" || status === "done") && (
        <div style={{ width: 40, height: 40, border: "4px solid #00f5ff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      )}

      {message && (
        <p style={{ textAlign: "center", fontSize: 16, marginBottom: 8 }}>{message}</p>
      )}

      {status === "done" && (
        <p style={{ color: "#22c55e", textAlign: "center", fontSize: 14, marginTop: 8 }}>
          ✓ Opening app automatically...
        </p>
      )}

      {(status === "ready" || status === "error") && (
        <>
          <button
            onClick={() => {
              const path = searchParams.get("token_hash") ? "(auth)/sign-in?emailVerified=true" : "/";
              tryOpenApp(path);
            }}
            style={{ background: "#00f5ff", color: "#000", padding: "12px 24px", borderRadius: 8, border: 0, fontSize: 16, fontWeight: 800, cursor: "pointer", marginTop: 8 }}
          >
            Open EduDash Pro App
          </button>

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 8 }}>Don't have the app yet?</p>
            <a href={playStoreUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#00f5ff", textDecoration: "underline", fontSize: 14, fontWeight: 600 }}>
              Install from Google Play
            </a>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" }}>
      <div style={{ width: 40, height: 40, border: "4px solid #00f5ff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LandingInner />
    </Suspense>
  );
}
