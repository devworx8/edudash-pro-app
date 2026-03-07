"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import OrganizationSelector from "@/components/auth/PreschoolSelector";

function ParentSignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrganization, setSelectedOrganization] = useState<any>(null);
  const [invitationCode, setInvitationCode] = useState<string | null>(null);
  const [hasInvitation, setHasInvitation] = useState(false);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: basic info, 2: usage type, 3: organization (optional)
  const [usageType, setUsageType] = useState<string | null>(null);

  // Check for invitation code in URL
  useEffect(() => {
    const invite = searchParams.get('invite');
    if (invite) {
      validateInvitationCode(invite);
    }
  }, [searchParams]);

  async function validateInvitationCode(code: string) {
    setInvitationLoading(true);
    setInvitationCode(code);
    
    try {
      const supabase = createClient();

      // Call validation function (new JSON response: { valid, school_id, school_name, ... })
      const { data, error } = await supabase.rpc('validate_invitation_code', {
        p_code: code,
        p_email: '',
      });

      if (error) throw error;

      if (data && typeof data === 'object' && (data as any).valid) {
        const schoolId = String((data as any).school_id || '');
        const schoolName = String((data as any).school_name || '');
        if (schoolId && schoolName) {
          setSelectedOrganization({
            id: schoolId,
            name: schoolName,
            type: null,
          });
          setHasInvitation(true);
          setError(null);
        } else {
          setError('Invalid invitation code');
          setInvitationCode(null);
        }
      } else {
        setError((data as any)?.error || 'Invalid invitation code');
        setInvitationCode(null);
      }
    } catch (err: any) {
      console.error('Invitation validation error:', err);
      setError('Failed to validate invitation code');
      setInvitationCode(null);
    } finally {
      setInvitationLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!usageType) {
      setError("Please select how you'll be using EduDash Pro");
      return;
    }

    // Organization is now optional - independent users don't need one
    // if (!selectedOrganization && !invitationCode) {
    //   setError("Please select an organization or use an invitation code");
    //   return;
    // }

    setLoading(true);

    const supabase = createClient();

    // Create auth user (profile will be auto-created by database trigger)
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || fullName;
    const lastName = nameParts.slice(1).join(' ') || '';

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          role: 'parent',
          phone: phoneNumber || null,
          usage_type: usageType || 'independent', // Track how parent intends to use the app
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    if (!authData.user) {
      setLoading(false);
      setError("Failed to create account. Please try again.");
      return;
    }

    // Profile is automatically created by database trigger (create_profile_for_new_user)
    
    // Handle invitation code or join request
    if (invitationCode) {
      // Accept invitation - auto-links user to organization
      const { data: accepted, error: acceptError } = await supabase.rpc('accept_invitation_code', {
        invite_code: invitationCode,
        user_id: authData.user.id
      });
      
      if (acceptError) {
        console.error('Invitation acceptance error:', acceptError);
      }
    } else if (selectedOrganization) {
      // Create join request for manual selection
      const { error: joinError } = await supabase
        .from('parent_join_requests')
        .insert({
          parent_id: authData.user.id,
          organization_id: selectedOrganization.id,
          status: 'pending',
          message: `Parent signup request from ${fullName}`,
        });

      if (joinError) {
        // Handle duplicate request (409 conflict) gracefully
        if (joinError.code === '23505' || joinError.message?.includes('duplicate')) {
          console.log('Join request already exists for this organization');
          // This is fine - user already requested to join this org
        } else {
          console.error('Join request error:', joinError);
        }
        // Don't fail the signup - account is created successfully
      }
    }

    // Start 7-day Parent Plus trial for ALL independent users (no organization selected)
    const isIndependentUser = !selectedOrganization && !invitationCode;
    
    // Give trial to ALL independent users regardless of usage type
    // Parents should NEVER be on premium tier - use parent_plus instead
    if (isIndependentUser) {
      try {
        const { data: trialData, error: trialError } = await supabase.rpc('start_user_trial', {
          target_user_id: authData.user.id,
          trial_days: 7,
          plan_tier: 'parent_plus'
        });
        
        if (trialError) {
          console.error('[Signup] Failed to start trial:', trialError);
          // Don't fail signup - trial is a bonus feature
        } else {
          console.log('[Signup] ✅ 7-day Parent Plus trial started for', authData.user.email);
        }
      } catch (err) {
        console.error('[Signup] Trial start error:', err);
        // Silent fail - don't block signup
      }
    }

    setLoading(false);

    // Success - redirect to email verification notice
    router.push('/sign-up/verify-email');
  }

  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
        }
        
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
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", fontFamily: "system-ui, sans-serif", overflowX: "hidden", padding: "20px 0" }}>
        <div style={{ width: "100%", maxWidth: "100vw", background: "#111113", padding: "40px 5%", border: "1px solid #1f1f23", boxSizing: "border-box" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 64, height: 64, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>
              👨‍👩‍👧
            </div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Parent Sign Up</h1>
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Create your parent account to track your child's progress</p>
            {hasInvitation && selectedOrganization && (
              <div style={{ marginTop: 16, padding: 12, background: "#064e3b", border: "1px solid #047857", borderRadius: 8 }}>
                <p style={{ color: "#6ee7b7", fontSize: 13, margin: 0 }}>
                  ✓ Joining: <strong>{selectedOrganization.name}</strong>
                </p>
              </div>
            )}
          </div>

          <div style={{ maxWidth: 500, margin: "0 auto" }}>
            {/* Google Sign-Up Button */}
            <div style={{ marginBottom: 24 }}>
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  
                  try {
                    const supabase = createClient();
                    
                    // Use consistent OAuth flow with proper redirect handling
                    const { data, error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/parent&signup=true`,
                        queryParams: {
                          access_type: 'offline',
                          prompt: 'select_account', // Changed from 'consent' to avoid double consent
                        },
                        data: {
                          role: 'parent',  // Set role for database trigger
                          signup_flow: 'true', // Flag to indicate this is signup
                        }
                      },
                    });

                    if (error) throw error;
                    
                    console.log('[GoogleSignUp] Redirecting to Google OAuth...');
                    // Browser will redirect automatically
                  } catch (err: any) {
                    console.error('[GoogleSignUp] Error:', err);
                    setError(err.message || 'Failed to sign up with Google');
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="googleSignInBtn"
              >
                {loading ? (
                  <>
                    <div className="googleSpinner" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <svg className="googleIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Sign up with Google</span>
                  </>
                )}
              </button>
              
              {/* Info about trial for Google users */}
              <div style={{ marginTop: 12, padding: 12, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 8 }}>
                <p style={{ color: "#6ee7b7", fontSize: 12, margin: 0, textAlign: "center", lineHeight: 1.5 }}>
                  🎁 <strong>Sign up with Google to get instant access!</strong>
                  <span style={{ display: 'block', marginTop: 4 }}>
                    Includes 7-day Premium trial + EduDashPro Community School (Digital Learning)
                  </span>
                </p>
              </div>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{ flex: 1, height: 1, background: "#2a2a2f" }}></div>
              <span style={{ color: "#6B7280", fontSize: 14, fontWeight: 500 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#2a2a2f" }}></div>
            </div>
          </div>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 500, margin: "0 auto" }}>
            <div>
              <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="John Doe"
                style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Phone Number (Optional)</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+27 82 123 4567"
                style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>

            {/* Usage Type Selection */}
            <div>
              <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
                How will you be using EduDash Pro? *
              </label>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  { value: 'preschool', icon: '🎨', label: 'Preschool age (3-5 years)', desc: 'Age-appropriate activities for preschoolers' },
                  { value: 'k12_school', icon: '🏫', label: 'School age (6-18 years)', desc: 'Content for primary and high school' },
                  { value: 'homeschool', icon: '🏠', label: 'Homeschooling', desc: 'Teaching at home full-time' },
                  { value: 'aftercare', icon: '⭐', label: 'Aftercare/Extracurricular', desc: 'After school care or activities' },
                  { value: 'supplemental', icon: '📚', label: 'Supplemental learning', desc: 'Extra support alongside school' },
                  { value: 'exploring', icon: '🔍', label: 'Just exploring', desc: 'Want to see what\'s available' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setUsageType(option.value)}
                    style={{
                      padding: "16px",
                      background: usageType === option.value ? "rgba(0, 245, 255, 0.1)" : "#1a1a1f",
                      border: usageType === option.value ? "2px solid #00f5ff" : "1px solid #2a2a2f",
                      borderRadius: 10,
                      color: "#fff",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start"
                    }}
                  >
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{option.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{option.label}</div>
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{option.desc}</div>
                    </div>
                    {usageType === option.value && (
                      <span style={{ fontSize: 20, color: "#00f5ff" }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Organization Selection - NOW SHOWN FOR ALL TYPES (but clearly optional) */}
            {!hasInvitation && usageType && (
              <div>
                <div style={{ marginBottom: 12, padding: 12, background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: 8 }}>
                  <p style={{ color: "#a5b4fc", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                    💡 <strong>Link to School (Optional):</strong> Only select an organization if your child is enrolled and you want features like attendance tracking, fees, and teacher communication. 
                    <strong style={{ display: 'block', marginTop: 6 }}>⚠️ Skip this step if you're homeschooling or using the app independently.</strong>
                  </p>
                </div>
                
                {/* Info about standalone community */}
                {!selectedOrganization && (
                  <div style={{ marginBottom: 12, padding: 12, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 8 }}>
                    <p style={{ color: "#6ee7b7", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                      ✨ <strong>EduDashPro Community School:</strong> If you skip linking to a school, you'll automatically join our <strong>EduDashPro Community School</strong> - a digital-first platform focusing on Robotics, AI, Data Science & Software Development. Free tier with ad-supported daily AI limits.
                      <span style={{ display: 'block', marginTop: 6 }}>
                        🎁 <strong>Includes 7-day Premium trial</strong> with full access to AI tools, exam generation, and learning resources!
                      </span>
                    </p>
                  </div>
                )}
                <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  Search for Organization <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(Optional - Leave blank if not enrolled)</span>
                </label>
                <OrganizationSelector
                  onSelect={setSelectedOrganization}
                  selectedOrganizationId={selectedOrganization?.id || null}
                />
                {selectedOrganization && (
                  <div style={{ marginTop: 12, padding: 12, background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: 8 }}>
                    <p style={{ color: "#86efac", fontSize: 13, margin: 0 }}>
                      ✓ You've selected: <strong>{selectedOrganization.name}</strong>
                      <span style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                        A join request will be sent for approval.
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Password *</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="At least 8 characters"
                  style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14, paddingRight: 40, boxSizing: "border-box" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, color: "#9CA3AF", cursor: "pointer", fontSize: 18 }}
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Confirm Password *</label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter password"
                style={{ width: "100%", padding: "12px 14px", background: "#1a1a1f", border: "1px solid #2a2a2f", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" }}
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
                padding: "14px 16px",
                background: loading ? "#555" : "linear-gradient(135deg, #00f5ff 0%, #0088cc 100%)",
                color: "#000",
                border: 0,
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Creating Account..." : "Create Parent Account"}
            </button>

            <p style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, margin: 0 }}>
              By signing up, you agree to our <Link href="/terms" style={{ color: "#00f5ff" }}>Terms</Link> and <Link href="/privacy" style={{ color: "#00f5ff" }}>Privacy Policy</Link>
            </p>
          </form>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #2a2a2f", textAlign: "center" }}>
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>
              Already have an account? <Link href="/sign-in" style={{ color: "#00f5ff", fontWeight: 600, textDecoration: "underline" }}>Sign In</Link>
            </p>
            <p style={{ color: "#9CA3AF", fontSize: 14, marginTop: 12 }}>
              Are you a teacher? <Link href="/sign-up/teacher" style={{ color: "#00f5ff", fontWeight: 600, textDecoration: "underline" }}>Sign up as Teacher</Link>
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

export default function ParentSignUpPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" }}>
        <div style={{ textAlign: "center", color: "#fff" }}>
          <div style={{ width: 40, height: 40, border: "4px solid #00f5ff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <p>Loading...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    }>
      <ParentSignUpForm />
    </Suspense>
  );
}
