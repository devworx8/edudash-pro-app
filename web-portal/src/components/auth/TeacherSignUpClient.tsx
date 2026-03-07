"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function TeacherSignUpClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteSchool, setInviteSchool] = useState<{
    id: string;
    name: string;
    logoUrl?: string | null;
    city?: string | null;
    province?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  } | null>(null);
  const [validatingInvite, setValidatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite") || params.get("inviteCode");
    const emailParam = params.get("email");

    if (emailParam && !email) setEmail(emailParam.trim());
    if (!code) return;
    const trimmed = code.trim();
    if (trimmed) setInviteCode(trimmed.toUpperCase());
  }, [email]);

  useEffect(() => {
    const normalized = inviteCode.trim().toUpperCase().replace(/\s+/g, "");
    if (!normalized) {
      setInviteSchool(null);
      setInviteError(null);
      return;
    }
    setValidatingInvite(true);
    setInviteError(null);
    const timer = setTimeout(() => {
      supabase
        .rpc("validate_invitation_code", { p_code: normalized })
        .then(async (result: { data: unknown; error: { message?: string } | null }) => {
          const { data, error: rpcError } = result;
          if (rpcError || !data) {
            setInviteSchool(null);
            setInviteError(rpcError?.message || "Invite code could not be verified yet.");
            return;
          }
          if (typeof data === "object" && "valid" in data) {
            if (!(data as { valid?: boolean }).valid) {
              setInviteSchool(null);
              setInviteError(String((data as { error?: string }).error || "Invalid or expired invite code."));
              return;
            }
            const schoolNameValue = String((data as { school_name?: string }).school_name || "");
            const schoolId = String((data as { school_id?: string }).school_id || "");
            if (schoolNameValue && schoolId) {
              let enriched = { id: schoolId, name: schoolNameValue } as typeof inviteSchool;
              try {
                const { data: preschool } = await supabase
                  .from("preschools")
                  .select("name, logo_url, city, province, phone, contact_email, website_url")
                  .eq("id", schoolId)
                  .maybeSingle();
                if (preschool) {
                  enriched = {
                    id: schoolId,
                    name: preschool.name || schoolNameValue,
                    logoUrl: preschool.logo_url,
                    city: preschool.city,
                    province: preschool.province,
                    phone: preschool.phone,
                    email: preschool.contact_email,
                    website: preschool.website_url,
                  };
                } else {
                  const { data: org } = await supabase
                    .from("organizations")
                    .select("name, logo_url")
                    .eq("id", schoolId)
                    .maybeSingle();
                  if (org) {
                    enriched = { id: schoolId, name: org.name || schoolNameValue, logoUrl: org.logo_url };
                  }
                }
              } catch {
                /* ignore */
              }
              setInviteSchool(enriched);
              setSchoolName((prev) => prev || schoolNameValue);
              setInviteError(null);
              return;
            }
          }
          setInviteSchool(null);
          setInviteError("Invite code could not be verified yet.");
        })
        .catch(() => {
          setInviteSchool(null);
          setInviteError("Invite code could not be verified yet.");
        })
        .finally(() => setValidatingInvite(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [inviteCode, supabase]);

  const getInitials = (name: string) =>
    name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  const fmtDetails = (info: typeof inviteSchool) => {
    if (!info) return "";
    const loc = [info.city, info.province].filter(Boolean).join(", ");
    return [loc, info.phone, info.email, info.website].filter(Boolean).join(" · ");
  };

  const schoolNameDisplay = inviteSchool?.name ?? schoolName;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) { setError("Full name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: "teacher" },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) { setLoading(false); setError(authError.message); return; }
    if (!authData.user) { setLoading(false); setError("Failed to create account. Please try again."); return; }

    const { error: profileError } = await supabase.from("profiles").update({
      role: "teacher",
      ...(inviteSchool?.id ? { preschool_id: inviteSchool.id, organization_id: inviteSchool.id, seat_status: "pending" } : {}),
    }).eq("id", authData.user.id);

    if (inviteCode.trim() && inviteSchool?.id) {
      try {
        await supabase.from("teacher_assignments").insert({
          teacher_id: authData.user.id,
          school_id: inviteSchool.id,
          status: "pending",
          joined_via: "invite_code",
        });
      } catch {
        /* ignore */
      }
    }

    setLoading(false);
    if (profileError) {
      setError("Account created but profile setup failed. Please contact support.");
      return;
    }
    router.push("/sign-up/teacher/success");
  }

  const headerLogo = inviteSchool?.logoUrl || "/favicon.png";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    background: "#1a1a1f",
    border: "1px solid #2a2a2f",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 6,
  };

  const helperStyle: React.CSSProperties = {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 6,
    lineHeight: "16px",
  };

  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
          background: #0a0a0f;
          color: #fff;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        }
        @media (min-width: 640px) {
          .sign-up-container {
            padding: 20px !important;
            align-items: center !important;
          }
          .sign-up-card {
            max-width: 520px !important;
            border: 1px solid #1f1f23 !important;
            border-radius: 12px !important;
            padding: 40px !important;
          }
        }

        /* Keep autofill readable on dark backgrounds */
        .authInput:-webkit-autofill,
        .authInput:-webkit-autofill:hover,
        .authInput:-webkit-autofill:focus,
        .authInput:-webkit-autofill:active {
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff;
          box-shadow: 0 0 0px 1000px #1a1a1f inset !important;
          transition: background-color 9999s ease-in-out 0s;
          border: 1px solid #2a2a2f;
        }
        input:focus {
          border-color: #00f5ff !important;
          box-shadow: 0 0 0 2px rgba(0, 245, 255, 0.12);
        }
      `}</style>

      <div
        className="sign-up-container"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          background: "#0a0a0f",
          overflowX: "hidden",
          padding: "16px",
        }}
      >
        <div
          className="sign-up-card"
          style={{
            width: "100%",
            background: "#111113",
            padding: "24px",
            border: "1px solid #1f1f23",
            boxSizing: "border-box",
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <img src={headerLogo} alt="" style={{ width: 22, height: 22, borderRadius: 6 }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: "18px" }}>EduDash Pro</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>Teacher onboarding</div>
              </div>
            </div>
            <Link href="/sign-in" style={{ color: "#7dd3fc", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Sign In
            </Link>
          </div>

          <div style={{ marginBottom: 18 }}>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 6 }}>Teacher Sign Up</h1>
            <p style={{ color: "#9CA3AF", fontSize: 14, margin: 0 }}>
              Create your account. If you have an invite code, we will link your school automatically.
            </p>
          </div>

          {inviteSchool && (
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: 12,
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              {inviteSchool.logoUrl ? (
                <img src={inviteSchool.logoUrl} alt={inviteSchool.name} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }} />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(16, 185, 129, 0.14)",
                    color: "#34d399",
                    fontWeight: 800,
                    letterSpacing: 0.5,
                  }}
                >
                  {getInitials(inviteSchool.name)}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "rgba(52, 211, 153, 0.8)", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                  Invited School
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {inviteSchool.name}
                </div>
                {fmtDetails(inviteSchool) ? (
                  <div style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fmtDetails(inviteSchool)}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input
                className="authInput"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Jane Smith"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Email *</label>
              <input
                className="authInput"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Phone Number (Optional)</label>
              <input
                className="authInput"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+27 82 123 4567"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Invite Code (Optional)</label>
              <input
                className="authInput"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. TEACH123"
                style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", letterSpacing: 1 }}
              />
              <div style={helperStyle}>Use the invite code shared by your school to auto-link your account.</div>
              {inviteCode ? (
                <div style={{ marginTop: 8, fontSize: 12, color: validatingInvite ? "#93c5fd" : inviteSchool ? "#34d399" : "#fbbf24" }}>
                  {validatingInvite ? "Validating invite..." : inviteSchool ? `Verified: ${inviteSchool.name}` : inviteError || "Could not verify. You can still sign up."}
                </div>
              ) : null}
            </div>

            <div>
              <label style={labelStyle}>School / Preschool Name (Optional)</label>
              <input
                className="authInput"
                type="text"
                value={schoolNameDisplay}
                onChange={(e) => {
                  if (!inviteSchool) setSchoolName(e.target.value);
                }}
                placeholder="Sunshine Preschool"
                disabled={Boolean(inviteSchool)}
                style={{ ...inputStyle, opacity: inviteSchool ? 0.7 : 1, cursor: inviteSchool ? "not-allowed" : "text" }}
              />
              <div style={helperStyle}>{inviteSchool ? "Linked via invite code." : "Your principal will invite you to join after signup."}</div>
            </div>

            <div>
              <label style={labelStyle}>Password *</label>
              <div style={{ position: "relative" }}>
                <input
                  className="authInput"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="At least 8 characters"
                  style={{ ...inputStyle, paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    color: "#9CA3AF",
                    cursor: "pointer",
                    padding: 6,
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Confirm Password *</label>
              <input
                className="authInput"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter password"
                style={inputStyle}
              />
            </div>

            {error ? (
              <div style={{ padding: 12, background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 12 }}>
                <div style={{ color: "#fecaca", fontSize: 13 }}>{error}</div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "linear-gradient(135deg, #00f5ff 0%, #7c3aed 100%)",
                border: "none",
                borderRadius: 10,
                color: "#0a0a0f",
                fontWeight: 800,
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.75 : 1,
                marginTop: 6,
              }}
            >
              {loading ? "Creating account..." : "Create Teacher Account"}
            </button>

            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 10, textAlign: "center" }}>
              By signing up, you agree to our{" "}
              <Link href="/terms" style={{ color: "#7dd3fc", textDecoration: "none" }}>
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" style={{ color: "#7dd3fc", textDecoration: "none" }}>
                Privacy Policy
              </Link>
              .
            </div>
          </form>

          <div style={{ marginTop: 18, textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: "#9CA3AF" }}>
              Already have an account?{" "}
              <Link href="/sign-in" style={{ color: "#7dd3fc", fontWeight: 700, textDecoration: "none" }}>
                Sign In
              </Link>
            </div>
            <div style={{ fontSize: 13, color: "#9CA3AF" }}>
              Are you a parent?{" "}
              <Link href="/sign-up/parent" style={{ color: "#7dd3fc", fontWeight: 700, textDecoration: "none" }}>
                Sign up as Parent
              </Link>
            </div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>&copy; {new Date().getFullYear()} EduDash Pro</div>
          </div>
        </div>
      </div>
    </>
  );
}
