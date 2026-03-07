"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";

type UserType = "parents" | "schools";

export default function PricingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userType, setUserType] = useState<UserType>("parents");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isOnTrial, setIsOnTrial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [showBackToHome, setShowBackToHome] = useState(false);
  const [customSeats, setCustomSeats] = useState(150);
  const [customAiCostUsd, setCustomAiCostUsd] = useState(0.25);
  const [customBaseFee, setCustomBaseFee] = useState(0);
  const [customPerSeatFee, setCustomPerSeatFee] = useState(0);
  const [customSupport, setCustomSupport] = useState<'standard' | 'priority'>('standard');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteOrg, setQuoteOrg] = useState('');
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    const checkAuthAndTrial = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);

      if (session) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
        setUserName(session.user.user_metadata?.full_name || null);
        
        try {
          // Fetch trial info directly from profile
          const { data: profileData } = await supabase
            .from('profiles')
            .select('is_trial, trial_ends_at')
            .eq('id', session.user.id)
            .single();
          
          if (profileData?.is_trial && profileData.trial_ends_at) {
            const trialEnd = new Date(profileData.trial_ends_at);
            const now = new Date();
            setIsOnTrial(trialEnd > now);
          }
        } catch (err) {
          console.debug('Trial check failed:', err);
        }
      }
      setLoading(false);
    };
    checkAuthAndTrial();
  }, [supabase]);

  useEffect(() => {
    const onScroll = () => {
      setShowBackToHome(window.scrollY > 260);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const trialDays = 7;
  const trialLabel = `${trialDays}-day free trial`;
  const signUpRoute = userType === "parents" ? "/sign-up/parent" : "/sign-up/principal";

  const handleSubscribe = async (planName: string, price: number) => {
    if (!isLoggedIn) {
      router.push(`${signUpRoute}?redirect=/pricing&plan=${encodeURIComponent(planName)}`);
      return;
    }

    if (!userId || !userEmail) {
      alert('Please log in to subscribe');
      return;
    }

    if (price === 0) {
      router.push('/dashboard/parent');
      return;
    }

    // Map plan names to tiers (must match tier_name_aligned enum in database)
    const tierMap: Record<string, 'parent_starter' | 'parent_plus' | 'school_starter' | 'school_premium' | 'school_pro'> = {
      'Parent Starter': 'parent_starter',
      'Parent Plus': 'parent_plus',
      'Starter Plan': 'school_starter',
      'Premium Plan': 'school_premium',
      'Enterprise Plan': 'school_pro',
    };

    const tier = tierMap[planName];
    if (!tier) {
      alert('Invalid plan selected');
      return;
    }

    setProcessingPayment(planName);

    try {
      // Get current session for auth token
      console.log('[Pricing] Starting payment flow...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('[Pricing] Initial session check:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        hasAccessToken: !!session?.access_token,
        tokenPreview: session?.access_token?.substring(0, 20),
        sessionError: sessionError?.message,
        expiresAt: session?.expires_at
      });
      
      // If no session, try to refresh
      if (!session || sessionError) {
        console.log('[Pricing] No session found, attempting refresh...');
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        
        console.log('[Pricing] Refresh result:', {
          hasRefreshedSession: !!refreshedSession,
          refreshError: refreshError?.message
        });
        
        if (refreshError || !refreshedSession) {
          console.error('[Pricing] Session refresh failed:', refreshError);
          alert('Your session has expired. Please sign in again.');
          router.push('/sign-in?redirect=/pricing');
          setProcessingPayment(null);
          return;
        }
      }

      // Get the latest session
      const { data: { session: finalSession } } = await supabase.auth.getSession();
      
      console.log('[Pricing] Final session check:', {
        hasFinalSession: !!finalSession,
        hasAccessToken: !!finalSession?.access_token,
        tokenLength: finalSession?.access_token?.length
      });
      
      if (!finalSession?.access_token) {
        console.error('[Pricing] No access token available');
        alert('Please log in to continue');
        router.push('/sign-in?redirect=/pricing');
        setProcessingPayment(null);
        return;
      }

      // Call Supabase Edge Function to create payment
      console.log('[Pricing] Calling payfast-create-payment Edge Function...');
      const { data, error } = await supabase.functions.invoke('payfast-create-payment', {
        body: {
          user_id: userId,
          tier: tier,
          amount: price,
          email: userEmail,
          firstName: userName?.split(' ')[0] || userEmail.split('@')[0],
          lastName: userName?.split(' ').slice(1).join(' ') || 'User',
          itemName: planName,
          itemDescription: `${planName} subscription`,
          subscriptionType: '1', // Subscription
          frequency: '3', // Monthly
          cycles: '0', // Until cancelled
        },
      });

      if (error || !data) {
        throw new Error(error?.message || data?.error || 'Failed to create payment');
      }

      // Redirect to PayFast payment page
      if (data.payment_url) {
        console.log('[Pricing] Redirecting to PayFast:', data.mode);
        window.location.href = data.payment_url;
      } else {
        throw new Error('No payment URL received');
      }
    } catch (error) {
      console.error('[Pricing] Payment failed:', error);
      alert('Failed to initiate payment. Please try again.');
      setProcessingPayment(null);
    }
  };

  const parentPlans = [
    {
      name: "Free",
      price: 0,
      priceAnnual: 0,
      popular: false,
      features: [
        "5 AI exams/month",
        "5 AI explanations/month",
        "10 AI chat messages/day",
        "CAPS curriculum aligned",
        "Basic support",
        "Grades R–10 coverage",
        "Email support"
      ]
    },
    {
      name: "Parent Starter",
      price: 99,
      priceAnnual: 950,
      popular: true,
      features: [
        "30 AI Homework Helper/month",
        "AI lesson support + step-by-step guides",
        "Child-safe explanations",
        "Progress tracking",
        "Email support",
        ...(isOnTrial ? [] : [trialLabel])
      ]
    },
    {
      name: "Parent Plus",
      price: 199,
      priceAnnual: 1910,
      popular: false,
      features: [
        "100 AI Homework Helper/month",
        "Priority processing",
        "Up to 3 children",
        "Advanced learning insights",
        "Priority support",
        "WhatsApp Connect",
        "Learning Resources",
        "Progress Analytics"
      ]
    }
  ];

  const schoolPlans = [
    {
      name: "Free Plan",
      price: 0,
      priceAnnual: 0,
      popular: false,
      features: [
        "Basic dashboard",
        "Student management",
        "Parent communication",
        "Basic reporting",
        "Grades R–10 coverage"
      ]
    },
    {
      name: "Starter Plan",
      price: 299,
      priceAnnual: 2990,
      popular: true,
      features: [
        "Essential features",
        "Dash AI lesson builder + step-by-step guides",
        "Parent portal",
        "WhatsApp notifications",
        "Email support",
        ...(isOnTrial ? [] : [trialLabel]),
        "Robotics & coding lesson packs (optional add-on)"
      ]
    },
    {
      name: "Premium Plan",
      price: 599,
      priceAnnual: 5990,
      popular: false,
      features: [
        "All Starter features",
        "Advanced reporting",
        "Priority support",
        "Custom branding",
        "API access",
        "Advanced analytics",
        "Selected Grade 11–12 subjects"
      ]
    },
    {
      name: "Enterprise Plan",
      price: null,
      priceAnnual: null,
      popular: false,
      features: [
        "All Premium features",
        "Unlimited users",
        "Dedicated success manager",
        "SLA guarantee",
        "White-label solution",
        "Base platform fee + per-seat pricing",
        "AI credits bundle + overage",
        "Custom integrations",
        "24/7 priority support"
      ]
    }
  ];

  const activePlans = userType === "parents" ? parentPlans : schoolPlans;
  const envRate = Number(process.env.NEXT_PUBLIC_USD_TO_ZAR_RATE || 0);
  const usdToZarRate = Number.isFinite(envRate) && envRate > 0 ? envRate : 18;
  const aiCostZar = Math.max(0, customAiCostUsd) * usdToZarRate;
  const aiBundle = Math.max(0, customSeats) * aiCostZar * 5;
  const baseFee = Math.max(0, customBaseFee);
  const perSeatFee = Math.max(0, customPerSeatFee);
  const totalEstimate = baseFee + perSeatFee * Math.max(0, customSeats) + aiBundle;

  const formatZar = (value: number) =>
    `R${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const handleCustomQuote = async () => {
    if (!quoteEmail || !quoteEmail.includes('@')) {
      setQuoteStatus('error');
      return;
    }
    setQuoteStatus('sending');
    try {
      const payload = {
        email: quoteEmail,
        organization: quoteOrg,
        seats: customSeats,
        ai_cost_per_user_usd: customAiCostUsd,
        ai_cost_per_user_zar: aiCostZar,
        usd_to_zar_rate: usdToZarRate,
        base_fee: customBaseFee,
        per_seat_fee: customPerSeatFee,
        support_level: customSupport,
        ai_bundle: aiBundle,
        total_estimate: totalEstimate,
        currency: 'ZAR',
      };

      await fetch('/api/custom-plan-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setQuoteStatus('sent');
    } catch {
      setQuoteStatus('error');
    }
  };

  return (
    <>
      <style jsx global>{`
        body {
          overflow-x: hidden;
          max-width: 100vw;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .fade-up {
          animation: fadeUp 0.7s ease both;
        }
        .floating-card {
          animation: float 8s ease-in-out infinite;
        }
        .sticky-home {
          position: fixed;
          left: 24px;
          bottom: 24px;
          z-index: 1200;
          padding: 12px 18px;
          border-radius: 999px;
          background: rgba(0, 245, 255, 0.15);
          border: 1px solid rgba(0, 245, 255, 0.4);
          color: #00f5ff;
          text-decoration: none;
          font-weight: 700;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
        }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        {/* Header */}
        <header style={{ position: "sticky", top: 0, zIndex: 1000, background: "rgba(10, 10, 15, 0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "18px", fontWeight: 700, textDecoration: "none", color: "#fff" }}>
              <img src="/icon-192.png" alt="EduDash Pro logo" style={{ width: "28px", height: "28px", borderRadius: "8px" }} />
              EduDash Pro
            </Link>
            {isLoggedIn ? (
              <button
                onClick={() => router.push('/dashboard/parent')}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#00f5ff",
                  background: "transparent",
                  border: "1px solid #00f5ff",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                <ArrowLeft size={16} />
                Back to Dashboard
              </button>
            ) : (
              <Link href="/sign-in" style={{ color: "#00f5ff", textDecoration: "none", fontSize: "14px", fontWeight: 600 }}>Sign In</Link>
            )}
          </div>
        </header>

        {showBackToHome && (
          <Link href="/" className="sticky-home">
            ← Back to Home
          </Link>
        )}

        {/* PROMO BANNER */}
        {userType === "parents" && (
          <div style={{ 
            background: "linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(139, 92, 246) 100%)",
            padding: "20px",
            textAlign: "center" as const,
            borderBottom: "2px solid rgba(255, 255, 255, 0.2)",
            boxShadow: "0 4px 20px rgba(139, 92, 246, 0.4)"
          }}>
            <div style={{ maxWidth: "900px", margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", flexWrap: "wrap" as const }}>
                <span style={{ fontSize: "32px" }}>🔥</span>
                <div>
                  <p style={{ fontSize: "clamp(18px, 3vw, 24px)", fontWeight: 800, margin: 0, color: "#fff", textTransform: "uppercase" as const, letterSpacing: "0.05em", textShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>
                    LAUNCH SPECIAL: 50% OFF FOR 3 MONTHS!
                  </p>
                  <p style={{ fontSize: "clamp(13px, 2vw, 16px)", margin: "6px 0 0", color: "rgba(255, 255, 255, 0.95)", fontWeight: 600 }}>
                    🎁 Join before Mar 31, 2026 • R49.50/mo (was R99) or R99.50/mo (was R199) for 3 months
                  </p>
                </div>
                <span style={{ fontSize: "32px" }}>⚡</span>
              </div>
            </div>
          </div>
        )}

        {/* Hero */}
        <section className="fade-up" style={{ paddingTop: "60px", paddingBottom: "40px", textAlign: "center", maxWidth: "900px", margin: "0 auto", padding: "60px 20px 40px" }}>
          <div style={{ marginBottom: "16px" }}>
            <span style={{ display: "inline-block", padding: "6px 16px", background: "rgba(0, 245, 255, 0.1)", border: "1px solid rgba(0, 245, 255, 0.3)", borderRadius: "20px", fontSize: "12px", color: "#00f5ff", fontWeight: 600 }}>🌍 Africa-first, global-ready pricing</span>
          </div>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, marginBottom: "16px" }}>Choose Your Perfect Plan</h1>
          <p style={{ fontSize: "18px", color: "#9CA3AF", maxWidth: "600px", margin: "0 auto" }}>
            Transparent pricing for parents and schools across Africa and beyond
          </p>
          
          {!isOnTrial && (
            <div style={{ marginTop: "32px", marginBottom: "24px", display: "inline-block", background: "rgba(251, 191, 36, 0.15)", border: "2px solid #fbbf24", borderRadius: "12px", padding: "12px 24px" }}>
              <p style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                🎉 {trialDays}-Day Free Trial • No Credit Card Required
              </p>
            </div>
          )}
        </section>

        {/* User Type Toggle */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px 40px" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "32px" }}>
            <button
              onClick={() => setUserType("parents")}
              style={{
                padding: "12px 32px",
                background: userType === "parents" ? "linear-gradient(135deg, #00f5ff 0%, #0080ff 100%)" : "rgba(255, 255, 255, 0.05)",
                color: userType === "parents" ? "#0a0a0f" : "#9CA3AF",
                border: userType === "parents" ? "2px solid #00f5ff" : "2px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "12px",
                fontSize: "16px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              👨‍👩‍👧 For Parents
            </button>
            <button
              onClick={() => setUserType("schools")}
              style={{
                padding: "12px 32px",
                background: userType === "schools" ? "linear-gradient(135deg, #00f5ff 0%, #0080ff 100%)" : "rgba(255, 255, 255, 0.05)",
                color: userType === "schools" ? "#0a0a0f" : "#9CA3AF",
                border: userType === "schools" ? "2px solid #00f5ff" : "2px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "12px",
                fontSize: "16px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              🏫 For Schools
            </button>
          </div>

          {/* Billing Period Toggle */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
            <span style={{ color: billingPeriod === "monthly" ? "#fff" : "#6B7280", fontWeight: 600 }}>Monthly</span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === "monthly" ? "annual" : "monthly")}
              style={{
                width: "56px",
                height: "28px",
                background: billingPeriod === "annual" ? "#00f5ff" : "rgba(255, 255, 255, 0.2)",
                border: "none",
                borderRadius: "14px",
                position: "relative",
                cursor: "pointer",
                transition: "all 0.3s"
              }}
            >
              <div style={{
                width: "20px",
                height: "20px",
                background: "#fff",
                borderRadius: "50%",
                position: "absolute",
                top: "4px",
                left: billingPeriod === "annual" ? "32px" : "4px",
                transition: "all 0.3s"
              }} />
            </button>
            <span style={{ color: billingPeriod === "annual" ? "#fff" : "#6B7280", fontWeight: 600 }}>Annual <span style={{ color: "#22c55e", fontSize: "12px" }}>(Save 20%)</span></span>
          </div>

          {/* Pricing Cards */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
            gap: "24px",
            maxWidth: userType === "schools" && schoolPlans.length === 4 ? "1200px" : "900px",
            margin: "0 auto"
          }}>
            {activePlans.map((plan, index) => {
              const price = billingPeriod === "annual" ? plan.priceAnnual : plan.price;
              const isEnterprise = plan.price === null;
              const hasPromo = userType === "parents" && (plan as any).originalPrice;
              const originalPrice = (plan as any).originalPrice;
              
              return (
                <div
                  key={plan.name}
                  style={{
                    background: plan.popular ? "linear-gradient(135deg, #00f5ff 0%, #0080ff 100%)" : "#111113",
                    border: plan.popular ? "none" : "1px solid #1f1f23",
                    borderRadius: "16px",
                    padding: "32px 24px",
                    position: "relative",
                    textAlign: "center",
                    animation: "fadeUp 0.7s ease both",
                    animationDelay: `${index * 0.08}s`
                  }}
                >
                  {plan.popular && (
                    <div style={{ position: "absolute", top: "-12px", left: "16px", background: "#fbbf24", color: "#0a0a0f", padding: "6px 20px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Most Popular</div>
                  )}

                  {hasPromo && (
                    <div style={{ position: "absolute", top: "-12px", right: "16px", background: "rgb(139, 92, 246)", color: "#fff", padding: "6px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", boxShadow: "0 4px 12px rgba(139, 92, 246, 0.4)" }}>
                      🔥 50% OFF
                    </div>
                  )}
                  
                  <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px", color: plan.popular ? "#0a0a0f" : "#fff" }}>
                    {plan.name}
                  </h3>
                  
                  <div style={{ marginBottom: "24px" }}>
                    {isEnterprise ? (
                      <>
                        <div style={{ fontSize: "36px", fontWeight: 800, color: plan.popular ? "#0a0a0f" : "#fff" }}>Custom</div>
                        <div style={{ fontSize: "14px", color: plan.popular ? "rgba(10, 10, 15, 0.7)" : "#6B7280" }}>Contact us for pricing</div>
                      </>
                    ) : price === 0 ? (
                      <>
                        <div style={{ fontSize: "48px", fontWeight: 800, color: plan.popular ? "#0a0a0f" : "#fff" }}>Free</div>
                        <div style={{ fontSize: "14px", color: plan.popular ? "rgba(10, 10, 15, 0.7)" : "#6B7280" }}>Forever</div>
                      </>
                    ) : (
                      <>
                        {hasPromo && originalPrice && (
                          <div style={{ marginBottom: "4px" }}>
                            <span style={{ fontSize: "18px", textDecoration: "line-through", color: plan.popular ? "rgba(10, 10, 15, 0.5)" : "rgba(255, 255, 255, 0.4)", fontWeight: 600 }}>
                              R{originalPrice.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div style={{ fontSize: "48px", fontWeight: 800, color: plan.popular ? "#0a0a0f" : "#fff" }}>
                          R{typeof price === "number" ? price.toFixed(price % 1 === 0 ? 0 : 2) : "0"}
                        </div>
                        <div style={{ fontSize: "14px", color: plan.popular ? "rgba(10, 10, 15, 0.7)" : "#6B7280" }}>
                          per {billingPeriod === "annual" ? "year" : "month"}
                        </div>
                        {hasPromo && originalPrice && (
                          <div style={{ marginTop: "8px", padding: "6px 12px", background: "rgba(34, 197, 94, 0.2)", borderRadius: "12px", display: "inline-block" }}>
                            <span style={{ fontSize: "14px", fontWeight: 700, color: plan.popular ? "#0a0a0f" : "#22c55e" }}>
                              💰 Save R{(originalPrice - (price as number)).toFixed(2)}/mo
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <ul style={{ listStyle: "none", padding: 0, marginBottom: "32px", textAlign: "left" }}>
                    {plan.features.map((feature, i) => (
                      <li key={i} style={{ 
                        marginBottom: "12px", 
                        display: "flex", 
                        alignItems: "flex-start", 
                        gap: "8px",
                        color: plan.popular ? "rgba(10, 10, 15, 0.9)" : "#D1D5DB",
                        fontSize: "14px",
                        lineHeight: 1.6
                      }}>
                        <span style={{ color: plan.popular ? "#0a0a0f" : "#00f5ff", fontSize: "16px" }}>✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isEnterprise ? (
                    <Link 
                      href="/contact"
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "14px",
                        background: plan.popular ? "#0a0a0f" : "linear-gradient(135deg, #00f5ff 0%, #0080ff 100%)",
                        color: plan.popular ? "#fff" : "#0a0a0f",
                        border: "none",
                        borderRadius: "10px",
                        fontSize: "16px",
                        fontWeight: 700,
                        cursor: "pointer",
                        textDecoration: "none",
                        textAlign: "center"
                      }}
                    >
                      Contact Sales
                    </Link>
                  ) : price === 0 ? (
                    <Link 
                      href={isLoggedIn ? "/dashboard/parent" : `${signUpRoute}?redirect=/pricing&trial=1`}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "14px",
                        background: plan.popular ? "#0a0a0f" : "linear-gradient(135deg, #00f5ff 0%, #0080ff 100%)",
                        color: plan.popular ? "#fff" : "#0a0a0f",
                        border: "none",
                        borderRadius: "10px",
                        fontSize: "16px",
                        fontWeight: 700,
                        cursor: "pointer",
                        textDecoration: "none",
                        textAlign: "center"
                      }}
                    >
                      Get Started Free
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan.name, price || 0)}
                      disabled={processingPayment === plan.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        width: "100%",
                        padding: "14px",
                        background: plan.popular ? "#0a0a0f" : "linear-gradient(135deg, #00f5ff 0%, #0080ff 100%)",
                        color: plan.popular ? "#fff" : "#0a0a0f",
                        border: "none",
                        borderRadius: "10px",
                        fontSize: "16px",
                        fontWeight: 700,
                        cursor: processingPayment === plan.name ? "not-allowed" : "pointer",
                        textDecoration: "none",
                        textAlign: "center",
                        opacity: processingPayment === plan.name ? 0.6 : 1,
                      }}
                    >
                      {processingPayment === plan.name ? (
                        <>
                          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                          Processing...
                        </>
                      ) : !isLoggedIn ? (
                        `Start ${trialDays}-Day Trial`
                      ) : (
                        "Subscribe Now"
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom Plan Builder */}
          <div style={{ marginTop: "64px", padding: "32px", borderRadius: "18px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <h2 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "12px" }}>Custom Plan Builder</h2>
            <p style={{ color: "#9CA3AF", maxWidth: "720px" }}>
              We price enterprise plans with a 3‑part model: base platform fee (SLA‑driven), per‑seat fee, and an AI credits
              bundle priced at <strong>5×</strong> your real AI cost to sustain ~80% margin. Overage follows the same 5× rule.
            </p>

            <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#9CA3AF", marginBottom: "6px" }}>Average seats</label>
                <input
                  type="number"
                  min={0}
                  value={customSeats}
                  onChange={(e) => setCustomSeats(Number(e.target.value || 0))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "#0b0b10", color: "#fff" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#9CA3AF", marginBottom: "6px" }}>AI cost per user (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={customAiCostUsd}
                  onChange={(e) => setCustomAiCostUsd(Number(e.target.value || 0))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "#0b0b10", color: "#fff" }}
                />
                <div style={{ marginTop: "6px", fontSize: "11px", color: "#6B7280" }}>
                  Using global USD→ZAR rate: <strong>{usdToZarRate.toFixed(2)}</strong>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#9CA3AF", marginBottom: "6px" }}>Base platform fee (ZAR)</label>
                <input
                  type="number"
                  min={0}
                  value={customBaseFee}
                  onChange={(e) => setCustomBaseFee(Number(e.target.value || 0))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "#0b0b10", color: "#fff" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#9CA3AF", marginBottom: "6px" }}>Per‑seat fee (ZAR)</label>
                <input
                  type="number"
                  min={0}
                  value={customPerSeatFee}
                  onChange={(e) => setCustomPerSeatFee(Number(e.target.value || 0))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "#0b0b10", color: "#fff" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#9CA3AF", marginBottom: "6px" }}>Support level</label>
                <select
                  value={customSupport}
                  onChange={(e) => setCustomSupport(e.target.value as 'standard' | 'priority')}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "#0b0b10", color: "#fff" }}
                >
                  <option value="standard">Standard (email + 48h SLA)</option>
                  <option value="priority">Priority (priority queue + 4h SLA)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: "24px", display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div style={{ padding: "14px 16px", borderRadius: "12px", background: "rgba(0, 245, 255, 0.08)", border: "1px solid rgba(0, 245, 255, 0.2)" }}>
                <div style={{ fontSize: "12px", color: "#9CA3AF" }}>AI bundle (5× cost)</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#00f5ff" }}>{formatZar(aiBundle)}</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: "12px", background: "rgba(124, 58, 237, 0.12)", border: "1px solid rgba(124, 58, 237, 0.3)" }}>
                <div style={{ fontSize: "12px", color: "#9CA3AF" }}>Estimated monthly total</div>
                <div style={{ fontSize: "22px", fontWeight: 800 }}>{formatZar(totalEstimate)}</div>
              </div>
            </div>

            <div style={{ marginTop: "20px", display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <input
                type="text"
                value={quoteOrg}
                onChange={(e) => setQuoteOrg(e.target.value)}
                placeholder="School or organization name"
                style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "#0b0b10", color: "#fff" }}
              />
              <input
                type="email"
                value={quoteEmail}
                onChange={(e) => setQuoteEmail(e.target.value)}
                placeholder="Contact email"
                style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "#0b0b10", color: "#fff" }}
              />
              <button
                onClick={handleCustomQuote}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "none",
                  background: "linear-gradient(135deg, #00f5ff 0%, #0080ff 100%)",
                  color: "#0a0a0f",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {quoteStatus === 'sending' ? 'Sending...' : quoteStatus === 'sent' ? 'Quote Sent' : 'Request Custom Quote'}
              </button>
            </div>

            {quoteStatus === 'error' && (
              <p style={{ marginTop: "10px", color: "#f97316" }}>Please enter a valid email to request a quote.</p>
            )}
          </div>

          {/* Trust Badges */}
          <div style={{ marginTop: "64px", textAlign: "center", padding: "32px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <p style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px", color: "#fff" }}>✅ Why Choose EduDash Pro?</p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "32px", fontSize: "14px", color: "#9CA3AF" }}>
              <span>🔒 Multi-tenant security</span>
              <span>🌍 Africa-first, global-ready</span>
              <span>🎓 Grades R–10 + select 11–12 subjects</span>
              <span>🤖 Robotics, coding & computer classes (optional packs)</span>
              <span>🧠 Dash AI lesson guides (step-by-step)</span>
              <span>⭐ Cancel anytime</span>
            </div>
          </div>

          {/* FAQ Preview */}
          <div style={{ marginTop: "64px", maxWidth: "800px", margin: "64px auto 0" }}>
            <h2 style={{ fontSize: "32px", fontWeight: 800, textAlign: "center", marginBottom: "32px" }}>Frequently Asked Questions</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <details style={{ background: "rgba(255, 255, 255, 0.02)", padding: "20px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <summary style={{ fontSize: "16px", fontWeight: 700, cursor: "pointer" }}>Can I switch plans later?</summary>
                <p style={{ marginTop: "12px", color: "#9CA3AF", fontSize: "14px", lineHeight: 1.6 }}>
                  Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.
                </p>
              </details>
              <details style={{ background: "rgba(255, 255, 255, 0.02)", padding: "20px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <summary style={{ fontSize: "16px", fontWeight: 700, cursor: "pointer" }}>What grades do you support?</summary>
                <p style={{ marginTop: "12px", color: "#9CA3AF", fontSize: "14px", lineHeight: 1.6 }}>
                  We support Grades R–10 with selected Grade 11–12 subjects available by request. Robotics and coding packs are offered as custom curriculum add-ons.
                </p>
              </details>
              <details style={{ background: "rgba(255, 255, 255, 0.02)", padding: "20px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <summary style={{ fontSize: "16px", fontWeight: 700, cursor: "pointer" }}>What payment methods do you accept?</summary>
                <p style={{ marginTop: "12px", color: "#9CA3AF", fontSize: "14px", lineHeight: 1.6 }}>
                  We support PayFast card payments and EFT with proof of payment workflows. Schools can enable additional methods on request.
                </p>
              </details>
              <details style={{ background: "rgba(255, 255, 255, 0.02)", padding: "20px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <summary style={{ fontSize: "16px", fontWeight: 700, cursor: "pointer" }}>Does Dash AI generate full lesson guides?</summary>
                <p style={{ marginTop: "12px", color: "#9CA3AF", fontSize: "14px", lineHeight: 1.6 }}>
                  Yes. Dash AI generates structured lesson plans and teacher guides with step-by-step activities. Educators remain in control and can edit every plan.
                </p>
              </details>
              <details style={{ background: "rgba(255, 255, 255, 0.02)", padding: "20px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <summary style={{ fontSize: "16px", fontWeight: 700, cursor: "pointer" }}>Is my data safe?</summary>
                <p style={{ marginTop: "12px", color: "#9CA3AF", fontSize: "14px", lineHeight: 1.6 }}>
                  Absolutely. We use bank-grade encryption, role-based access controls, and POPIA-ready hosting. Regional hosting options are available.
                </p>
              </details>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <section style={{ marginTop: "80px", padding: "80px 20px", background: "linear-gradient(135deg, #00f5ff 0%, #0080ff 100%)", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, marginBottom: "16px", color: "#0a0a0f" }}>Ready to Get Started?</h2>
          <p style={{ fontSize: "18px", marginBottom: "32px", color: "rgba(10,10,15,.75)", maxWidth: "600px", margin: "0 auto 32px" }}>
            Join schools and families across Africa and beyond using EduDash Pro.
          </p>
          <Link href={`${signUpRoute}?redirect=/pricing&trial=1`} style={{ display: "inline-block", padding: "16px 32px", background: "#0a0a0f", color: "#fff", borderRadius: "12px", fontSize: "16px", fontWeight: 700, textDecoration: "none" }}>
            Start Your {trialDays}-Day Free Trial →
          </Link>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", padding: "32px 20px", textAlign: "center" }}>
          <p style={{ color: "#6B7280", fontSize: "14px" }}>© 2026 EduDash Pro. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
