"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function PrincipalSignUpForm() {
  const router = useRouter();
  
  // Step 1: Personal/Account Info
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  
  // Step 2: Organization Details
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [planTier, setPlanTier] = useState("solo");
  const [billingEmail, setBillingEmail] = useState("");
  
  // Step 3: Organization Address
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("ZA");
  
  // Step 4: Campus/Branch Info
  const [campusName, setCampusName] = useState("");
  const [campusCode, setCampusCode] = useState("");
  const [campusAddress, setCampusAddress] = useState("");
  const [campusCapacity, setCampusCapacity] = useState("200");
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1); // 1: personal, 2: organization, 3: address, 4: campus

  // Auto-generate slug from organization name
  const handleOrganizationNameChange = (value: string) => {
    setOrganizationName(value);
    const newSlug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!organizationSlug || organizationSlug === organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) {
      setOrganizationSlug(newSlug);
    }
  };

  // Auto-populate billing email from account email
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (!billingEmail) {
      setBillingEmail(value);
    }
  };

  // Validation for each step
  const validateStep = (currentStep: number): boolean => {
    setError(null);
    
    switch (currentStep) {
      case 1:
        if (!email || !password || !confirmPassword || !fullName || !phoneNumber) {
          setError("All fields are required");
          return false;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match");
          return false;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setError("Invalid email address");
          return false;
        }
        return true;
        
      case 2:
        if (!organizationName || !organizationSlug) {
          setError("Organization name and slug are required");
          return false;
        }
        if (!/^[a-z0-9-]+$/.test(organizationSlug)) {
          setError("Slug can only contain lowercase letters, numbers, and hyphens");
          return false;
        }
        if (!billingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
          setError("Valid billing email is required");
          return false;
        }
        return true;
        
      case 3:
        if (!addressLine1 || !city || !province || !postalCode) {
          setError("Address, city, province, and postal code are required");
          return false;
        }
        return true;
        
      case 4:
        if (!campusName) {
          setError("Campus name is required");
          return false;
        }
        if (campusCode && !/^[A-Z0-9-]+$/.test(campusCode)) {
          setError("Campus code must be uppercase letters, numbers, and hyphens only");
          return false;
        }
        return true;
        
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setError(null);
    setStep(step - 1);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!validateStep(4)) {
      return;
    }

    setLoading(true);

    try {
      // Check if API URL is configured
      const apiUrl = process.env.NEXT_PUBLIC_EDUSITEPRO_API_URL;
      if (!apiUrl) {
        throw new Error('EduSitePro API URL not configured. Please set NEXT_PUBLIC_EDUSITEPRO_API_URL in your environment variables.');
      }

      // Submit to EduSitePro for SuperAdmin approval
      const response = await fetch(apiUrl + '/api/organizations/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Personal info
          email,
          password,
          fullName,
          phoneNumber,
          
          // Organization info
          organizationName,
          organizationSlug,
          planTier,
          billingEmail,
          
          // Organization address
          addressLine1,
          addressLine2,
          city,
          province,
          postalCode,
          country,
          
          // Campus info
          campusName,
          campusCode: campusCode || undefined,
          campusAddress: campusAddress || addressLine1, // Default to org address
          campusCapacity: parseInt(campusCapacity) || 200,
        }),
      });

      // Handle empty or invalid responses
      const text = await response.text();
      let data;
      
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        console.error('Failed to parse response:', text);
        throw new Error(
          `Cannot connect to EduSitePro API at ${apiUrl}. ` +
          'Please ensure EduSitePro is running on port 3002 (npm run dev in edusitepro directory).'
        );
      }

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status} ${response.statusText}`);
      }

      console.log('Organization registration submitted:', data);

      // Redirect to pending approval page
      router.push('/sign-up/pending-approval?email=' + encodeURIComponent(email));
    } catch (err: any) {
      console.error('Sign up error:', err);
      setError(err.message || 'Failed to submit registration');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "#1a1a1f",
    border: "1px solid #2a2a2f",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
  };

  const labelStyle = {
    display: "block",
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 6,
  };

  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
        }
        @media (min-width: 640px) {
          .sign-up-container {
            padding: 20px !important;
            align-items: center !important;
          }
          .sign-up-card {
            max-width: 700px !important;
            border: 1px solid #1f1f23 !important;
            border-radius: 12px !important;
            padding: 40px !important;
          }
        }
        input:focus {
          border-color: #00f5ff !important;
        }
        select:focus {
          border-color: #00f5ff !important;
        }
      `}</style>
      <div className="sign-up-container" style={{ minHeight: "100vh", display: "flex", alignItems: "stretch", justifyContent: "center", background: "#0a0a0f", fontFamily: "system-ui, sans-serif", overflowX: "hidden", padding: "0" }}>
        <div className="sign-up-card" style={{ width: "100%", background: "#111113", padding: "24px", border: "none", boxSizing: "border-box", borderRadius: "0" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 64, height: 64, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>
              🏫
            </div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Register Your Organization</h1>
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Create an account to manage your educational institution</p>
          </div>

          {/* Progress indicator */}
          <div style={{ display: "flex", gap: 8, marginBottom: 32, justifyContent: "center" }}>
            <div style={{ width: 60, height: 4, background: step >= 1 ? "#00f5ff" : "#2a2a2f", borderRadius: 2, transition: "background 0.3s" }}></div>
            <div style={{ width: 60, height: 4, background: step >= 2 ? "#00f5ff" : "#2a2a2f", borderRadius: 2, transition: "background 0.3s" }}></div>
            <div style={{ width: 60, height: 4, background: step >= 3 ? "#00f5ff" : "#2a2a2f", borderRadius: 2, transition: "background 0.3s" }}></div>
            <div style={{ width: 60, height: 4, background: step >= 4 ? "#00f5ff" : "#2a2a2f", borderRadius: 2, transition: "background 0.3s" }}></div>
          </div>

          {/* Step labels */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <p style={{ color: "#00f5ff", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
              Step {step} of 4: {
                step === 1 ? "Personal Information" :
                step === 2 ? "Organization Details" :
                step === 3 ? "Organization Address" :
                "Campus Information"
              }
            </p>
          </div>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* STEP 1: Personal Information */}
            {step === 1 && (
              <>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Email Address *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    placeholder="jane@yourschool.com"
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Phone Number *</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+27 12 345 6789"
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Password *</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      style={inputStyle}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 14 }}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Confirm Password *</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    style={inputStyle}
                    required
                  />
                </div>
              </>
            )}

            {/* STEP 2: Organization Details */}
            {step === 2 && (
              <>
                <div>
                  <label style={labelStyle}>Organization Name *</label>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(e) => handleOrganizationNameChange(e.target.value)}
                    placeholder="Sunrise Early Learning Centre"
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>URL Slug * (auto-generated)</label>
                  <input
                    type="text"
                    value={organizationSlug}
                    onChange={(e) => setOrganizationSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="sunrise-early-learning"
                    style={inputStyle}
                    required
                  />
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    Will be used in URLs: yoursite.com/<strong>{organizationSlug || "your-slug"}</strong>
                  </p>
                </div>

                <div>
                  <label style={labelStyle}>Plan Tier *</label>
                  <select
                    value={planTier}
                    onChange={(e) => setPlanTier(e.target.value)}
                    style={{ ...inputStyle, cursor: "pointer" }}
                    required
                  >
                    <option value="solo">Solo (1 Campus) - Free Trial</option>
                    <option value="group_5">Group (Up to 5 Campuses)</option>
                    <option value="group_10">Group Plus (Up to 10 Campuses)</option>
                    <option value="enterprise">Enterprise (Unlimited)</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Billing Email *</label>
                  <input
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    placeholder="billing@yourschool.com"
                    style={inputStyle}
                    required
                  />
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    Invoices and billing notifications will be sent here
                  </p>
                </div>
              </>
            )}

            {/* STEP 3: Organization Address */}
            {step === 3 && (
              <>
                <div>
                  <label style={labelStyle}>Address Line 1 *</label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="123 Main Street"
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Address Line 2</label>
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Suite 100"
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>City *</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Pretoria"
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Province *</label>
                    <select
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      style={{ ...inputStyle, cursor: "pointer" }}
                      required
                    >
                      <option value="">Select Province</option>
                      <option value="Gauteng">Gauteng</option>
                      <option value="Western Cape">Western Cape</option>
                      <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                      <option value="Eastern Cape">Eastern Cape</option>
                      <option value="Free State">Free State</option>
                      <option value="Limpopo">Limpopo</option>
                      <option value="Mpumalanga">Mpumalanga</option>
                      <option value="Northern Cape">Northern Cape</option>
                      <option value="North West">North West</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Postal Code *</label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="0001"
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Country</label>
                    <input
                      type="text"
                      value="South Africa"
                      disabled
                      style={{ ...inputStyle, background: "#151518", cursor: "not-allowed" }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* STEP 4: Campus Information */}
            {step === 4 && (
              <>
                <div style={{ padding: 16, background: "#1a1a1f", borderRadius: 8, marginBottom: 8 }}>
                  <p style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 1.6 }}>
                    ℹ️ <strong style={{ color: "#fff" }}>Your first campus:</strong> This will be your main/primary campus. 
                    You can add more campuses later from your dashboard.
                  </p>
                </div>

                <div>
                  <label style={labelStyle}>Campus Name *</label>
                  <input
                    type="text"
                    value={campusName}
                    onChange={(e) => setCampusName(e.target.value)}
                    placeholder="Main Campus / Headquarters"
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Campus Code (Optional)</label>
                  <input
                    type="text"
                    value={campusCode}
                    onChange={(e) => setCampusCode(e.target.value.toUpperCase())}
                    placeholder="MC-001"
                    style={inputStyle}
                  />
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    Unique identifier for this campus (uppercase letters, numbers, hyphens)
                  </p>
                </div>

                <div>
                  <label style={labelStyle}>Campus Address (Optional)</label>
                  <input
                    type="text"
                    value={campusAddress}
                    onChange={(e) => setCampusAddress(e.target.value)}
                    placeholder="Leave blank to use organization address"
                    style={inputStyle}
                  />
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    {campusAddress ? "Using custom address" : `Will default to: ${addressLine1 || "organization address"}`}
                  </p>
                </div>

                <div>
                  <label style={labelStyle}>Campus Capacity *</label>
                  <input
                    type="number"
                    value={campusCapacity}
                    onChange={(e) => setCampusCapacity(e.target.value)}
                    placeholder="200"
                    min="1"
                    style={inputStyle}
                    required
                  />
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    Maximum number of students this campus can accommodate
                  </p>
                </div>
              </>
            )}

            {/* Error message */}
            {error && (
              <div style={{ padding: 12, background: "#ff000015", border: "1px solid #ff000030", borderRadius: 8, color: "#ff6b6b", fontSize: 13 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Navigation buttons */}
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "14px 24px",
                    background: "#1a1a1f",
                    border: "1px solid #2a2a2f",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  ← Back
                </button>
              )}

              {step < 4 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "14px 24px",
                    background: "linear-gradient(135deg, #00f5ff 0%, #00a0ff 100%)",
                    border: "none",
                    borderRadius: 8,
                    color: "#000",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "14px 24px",
                    background: loading ? "#2a2a2f" : "linear-gradient(135deg, #00f5ff 0%, #00a0ff 100%)",
                    border: "none",
                    borderRadius: 8,
                    color: loading ? "#666" : "#000",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Creating Account..." : "Create Account"}
                </button>
              )}
            </div>
          </form>

          {/* Footer */}
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <p style={{ color: "#6B7280", fontSize: 13 }}>
              Already have an account?{" "}
              <Link href="/sign-in" style={{ color: "#00f5ff", textDecoration: "none", fontWeight: 600 }}>
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PrincipalSignUpPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#fff" }}>Loading...</div>}>
      <PrincipalSignUpForm />
    </Suspense>
  );
}
