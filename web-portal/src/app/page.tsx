"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Space_Grotesk, Fraunces } from "next/font/google";
import { useIsPWA } from "@/lib/hooks/useIsPWA";
import { createClient } from "@/lib/supabase/client";
import {
  Building2,
  Users,
  Sparkles,
  CreditCard,
  Cpu,
  Phone,
  WifiOff,
  Shield,
  GraduationCap,
  Heart,
  type LucideIcon,
} from "lucide-react";
import styles from "./page.module.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "600", "700"],
});

const EARLY_BIRD_LIMIT = 20;
const COMMUNITY_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_VIDEO_URL = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? "";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function Home() {
  const router = useRouter();
  const { isPWA, isLoading: isPWALoading } = useIsPWA();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [installMode, setInstallMode] = useState<"prompt" | "ios" | "unsupported">("unsupported");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hasInstalledApp, setHasInstalledApp] = useState(false);
  const [checking, setChecking] = useState(true);
  const [earlyAccessEmail, setEarlyAccessEmail] = useState("");
  const [earlyAccessSubmitting, setEarlyAccessSubmitting] = useState(false);
  const [earlyAccessSubmitted, setEarlyAccessSubmitted] = useState(false);
  const [earlyAccessError, setEarlyAccessError] = useState("");
  const [aftercareSpotsRemaining, setAftercareSpotsRemaining] = useState<number | null>(null);

  const navLinks = useMemo(
    () => [
      { id: "features", label: "Features" },
      { id: "dash-ai", label: "Dash AI" },
      { id: "roles", label: "For Schools" },
      { id: "programs", label: "Programs" },
      { id: "pricing", label: "Pricing" },
      { id: "faq", label: "FAQ" },
    ],
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeInstall = (event: Event) => {
      if (hasInstalledApp) return;
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setInstallMode("prompt");
    };

    const handleAppInstalled = () => {
      setHasInstalledApp(true);
      setDeferredPrompt(null);
      setInstallMode("unsupported");
      setInstallSheetOpen(false);
      window.localStorage.setItem("edudash-pwa-installed", "true");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    const rememberedInstalled = window.localStorage.getItem("edudash-pwa-installed") === "true";

    if (isStandalone || rememberedInstalled) {
      setHasInstalledApp(true);
    }

    const detectInstalledRelatedApps = async () => {
      try {
        const navAny = window.navigator as any;
        if (typeof navAny.getInstalledRelatedApps === "function") {
          const relatedApps = await navAny.getInstalledRelatedApps();
          if (Array.isArray(relatedApps) && relatedApps.length > 0) {
            setHasInstalledApp(true);
            window.localStorage.setItem("edudash-pwa-installed", "true");
          }
        }
      } catch {
        // Best-effort signal only; ignore unsupported/permission errors.
      }
    };
    detectInstalledRelatedApps();

    if (isIOS && !isStandalone && !rememberedInstalled) {
      setInstallMode("ios");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [hasInstalledApp]);

  const featureCards = useMemo(
    () => [
      {
        title: "Unified School OS",
        copy: "Attendance, fees, messaging, and reporting in one streamlined workspace.",
        tag: "Operations",
        icon: Building2,
      },
      {
        title: "Parent Engagement",
        copy: "Real-time updates, progress snapshots, and two-way communication that actually gets read.",
        tag: "Community",
        icon: Users,
      },
      {
        title: "AI Learning Studio",
        copy: "Generate lessons, activities, and summaries in minutes with teacher-in-the-loop controls.",
        tag: "Dash AI",
        icon: Sparkles,
      },
      {
        title: "Secure Billing",
        copy: "PayFast-ready invoicing, proof-of-payment review, and automated reminders.",
        tag: "Payments",
        icon: CreditCard,
      },
      {
        title: "STEM + Robotics",
        copy: "Robotics, coding, and computer skills packs available as optional curriculum add‑ons.",
        tag: "STEM",
        icon: Cpu,
      },
      {
        title: "Voice & Video Calls",
        copy: "Run parent calls, class check-ins, and voice notes with the same dashboard tools.",
        tag: "Comms",
        icon: Phone,
      },
      {
        title: "Offline Ready",
        copy: "Critical dashboards stay available even with unstable connectivity.",
        tag: "Resilience",
        icon: WifiOff,
      },
    ],
    []
  );

  const roleCards = useMemo(
    () => [
      {
        title: "Principals & Owners",
        copy: "Manage staff, billing, and performance from a single command center.",
        items: ["School-wide analytics", "Seat management", "Financial oversight"],
        icon: Shield,
      },
      {
        title: "Teachers",
        copy: "Plan, teach, and report faster with AI support and smart class tools.",
        items: ["Lesson creation", "Attendance + homework", "Parent communication"],
        icon: GraduationCap,
      },
      {
        title: "Parents",
        copy: "Stay connected to progress, payments, and daily updates without friction.",
        items: ["Daily summaries", "Messaging & calls", "Payment visibility"],
        icon: Heart,
      },
    ],
    []
  );

  const faqs = useMemo(
    () => [
      {
        q: "Is EduDash Pro only for aftercare?",
        a: "No. Aftercare is one program we support. The platform is built for full school operations across preschools, primary, and community schools.",
      },
      {
        q: "Can we start small and scale?",
        a: "Yes. You can start with parent messaging and attendance, then unlock AI workflows and advanced analytics when you’re ready.",
      },
      {
        q: "What grades do you support?",
        a: "We cover Grades R–10 with selected Grade 11–12 subjects available by request. Robotics and coding packs are available as add‑ons.",
      },
      {
        q: "Does it work on low connectivity?",
        a: "Yes. Key dashboards cache data for offline access and sync back when the connection returns.",
      },
    ],
    []
  );

  const fetchSpots = async () => {
    try {
      const supabase = createClient();
      const { count } = await supabase
        .from("aftercare_registrations")
        .select("*", { count: "exact", head: true })
        .eq("preschool_id", COMMUNITY_SCHOOL_ID);

      if (count !== null) {
        setAftercareSpotsRemaining(Math.max(0, EARLY_BIRD_LIMIT - count));
      }
    } catch {
      setAftercareSpotsRemaining(EARLY_BIRD_LIMIT);
    }
  };

  useEffect(() => {
    fetchSpots();
    const supabase = createClient();
    const channel = supabase
      .channel("aftercare-registrations-count-home")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "aftercare_registrations",
          filter: `preschool_id=eq.${COMMUNITY_SCHOOL_ID}`,
        },
        () => {
          fetchSpots();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "aftercare_registrations",
          filter: `preschool_id=eq.${COMMUNITY_SCHOOL_ID}`,
        },
        () => {
          fetchSpots();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (isPWALoading) return;

    const checkAuthAndRedirect = async () => {
      if (isPWA) {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          router.replace("/dashboard");
          return;
        }
        router.replace("/sign-in");
        return;
      }
      setChecking(false);
    };

    checkAuthAndRedirect();
  }, [isPWA, isPWALoading, router]);

  useEffect(() => {
    if (checking || isPWALoading) return;
    if (typeof window === "undefined") return;
    const elements = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!elements.length) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      elements.forEach((el) => el.classList.add(styles.revealVisible));
      return;
    }

    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add(styles.revealVisible));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealVisible);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [checking, isPWALoading]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setMobileMenuOpen(false);
    }
  };

  const handleEarlyAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!earlyAccessEmail || !earlyAccessEmail.includes("@")) {
      setEarlyAccessError("Please enter a valid email address");
      return;
    }

    setEarlyAccessSubmitting(true);
    setEarlyAccessError("");

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("early_access_signups")
        .insert({
          email: earlyAccessEmail,
          source: "homepage",
          platform: "google_play",
        });

      if (error && error.code !== "23505") {
        console.error("Early access signup error:", error);
      }

      await fetch("/api/early-access-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: earlyAccessEmail }),
      }).catch(() => {});

      setEarlyAccessSubmitted(true);
    } catch (err) {
      console.error("Signup error:", err);
      setEarlyAccessSubmitted(true);
    } finally {
      setEarlyAccessSubmitting(false);
    }
  };

  const handleInstallClick = async () => {
    if (isPWA) return;

    if (installMode === "prompt" && deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        setHasInstalledApp(true);
        window.localStorage.setItem("edudash-pwa-installed", "true");
        setInstallMode("unsupported");
      }
      setDeferredPrompt(null);
      return;
    }

    setInstallSheetOpen(true);
  };

  const showInstallButton = !isPWA && !hasInstalledApp;

  if (checking || isPWALoading) {
    return (
      <div className={`${styles.loading} ${spaceGrotesk.variable} ${fraunces.variable}`}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingGlyph}>✦</div>
          <h2>EduDash Pro</h2>
          <p>Initializing next-gen learning ops...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${spaceGrotesk.variable} ${fraunces.variable}`}>
      <div className={styles.backgroundGlow} />
      <div className={styles.backgroundNoise} />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <Image src="/icon-192.png" alt="EduDash Pro logo" width={36} height={36} className={styles.brandLogo} />
            <span className={styles.brandText}>EduDash Pro</span>
          </div>

          <nav className={styles.navDesktop}>
            {navLinks.map((link) => (
              <button
                key={link.id}
                className={styles.navLink}
                onClick={() => scrollToSection(link.id)}
              >
                {link.label}
              </button>
            ))}
            {showInstallButton && (
              <button className={styles.installButton} onClick={handleInstallClick}>
                Install App
              </button>
            )}
            <Link href="/sign-in" className={styles.primaryGhost}>
              Sign In
            </Link>
            <Link href="/apply" className={styles.primarySolid}>
              Book a Demo
            </Link>
          </nav>

          <button
            className={styles.navToggle}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className={styles.navMobile}>
            {navLinks.map((link) => (
              <button
                key={link.id}
                className={styles.navLinkMobile}
                onClick={() => scrollToSection(link.id)}
              >
                {link.label}
              </button>
            ))}
            <div className={styles.navMobileCtas}>
              {showInstallButton && (
                <button className={styles.installButton} onClick={handleInstallClick}>
                  Install App
                </button>
              )}
              <Link href="/sign-in" className={styles.primaryGhost}>
                Sign In
              </Link>
              <Link href="/apply" className={styles.primarySolid}>
                Book a Demo
              </Link>
            </div>
          </div>
        )}
      </header>

      {installSheetOpen && (
        <div className={styles.installSheet}>
          <div className={styles.installCard}>
            <div className={styles.installHeader}>
              <strong>Install EduDash Pro</strong>
              <button className={styles.installClose} onClick={() => setInstallSheetOpen(false)}>
                X
              </button>
            </div>
            {installMode === "ios" ? (
              <p>
                On iPhone or iPad: tap <strong>Share</strong> then choose <strong>Add to Home Screen</strong>.
              </p>
            ) : installMode === "prompt" ? (
              <p>
                Install the EduDash Pro PWA for faster access, offline support, and push notifications.
              </p>
            ) : (
              <p>
                Open your browser menu and select <strong>Install App</strong> or <strong>Add to Home Screen</strong>.
              </p>
            )}
            <div className={styles.installActions}>
              <Link href="/apply" className={styles.primarySolidSmall}>
                Book a demo
              </Link>
              <button className={styles.ghostButton} onClick={() => setInstallSheetOpen(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className={styles.sideRail}>
        <div className={styles.sideCard}>
          <span className={styles.sideLabel}>Ads + partners</span>
          <h4>Reserve this space</h4>
          <p>Feature your education brand or community program.</p>
          <a className={styles.sideLink} href="mailto:partners@edudashpro.org.za">
            partners@edudashpro.org.za
          </a>
        </div>
        <div className={styles.sideCardAlt}>
          <span className={styles.sideLabel}>Feedback</span>
          <h4>Tell us what to build next</h4>
          <p>We review every note and ship weekly.</p>
          <a className={styles.sideLink} href="mailto:feedback@edudashpro.org.za">
            Send feedback
          </a>
        </div>
      </aside>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>Next-Gen School Operating System</div>
            <h1 className={styles.heroTitle}>
              An AI-powered command center for
              <span className={styles.heroTitleAccent}> modern schools.</span>
            </h1>
            <p className={styles.heroSubtitle}>
              EduDash Pro unifies teaching, parent engagement, billing, and AI lesson workflows into one
              elegant platform built for African schools and beyond.
            </p>
            <div className={styles.heroCtas}>
              <Link href="/apply" className={styles.primarySolidLarge}>
                Request a live demo
              </Link>
              <Link href="/pricing" className={styles.primaryGhostLarge}>
                View pricing
              </Link>
            </div>
          <div className={`${styles.heroStats} ${styles.reveal}`} data-reveal>
            <div>
              <h3>Unified data</h3>
              <p>Attendance, fees, lessons, and messaging in one flow.</p>
            </div>
              <div>
                <h3>AI-ready</h3>
                <p>Dash AI supports lesson planning and insights in minutes.</p>
              </div>
              <div>
                <h3>Offline-first</h3>
                <p>Critical dashboards keep running when networks drop.</p>
              </div>
            </div>
          </div>
          <div className={`${styles.heroVisual} ${styles.reveal}`} data-reveal>
            {DEMO_VIDEO_URL ? (
              <div className={styles.videoFrame}>
                <iframe
                  src={DEMO_VIDEO_URL}
                  title="EduDash Pro Demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className={styles.dashboardPreview}>
                <div className={styles.previewHeader}>
                  <div className={styles.previewDots}>
                    <span /><span /><span />
                  </div>
                  <span className={styles.previewTitle}>EduDash Pro — Teacher Dashboard</span>
                </div>
                <div className={styles.previewBody}>
                  <div className={styles.previewSidebar}>
                    <div className={styles.previewNavItem} style={{ opacity: 1 }}>Dashboard</div>
                    <div className={styles.previewNavItem}>Students</div>
                    <div className={styles.previewNavItem}>Lessons</div>
                    <div className={styles.previewNavItem}>Attendance</div>
                    <div className={styles.previewNavItem}>Messages</div>
                    <div className={styles.previewNavItem}>Dash AI</div>
                  </div>
                  <div className={styles.previewContent}>
                    <div className={styles.previewStatRow}>
                      <div className={styles.previewStat}>
                        <span>32</span>
                        <small>Students</small>
                      </div>
                      <div className={styles.previewStat}>
                        <span>94%</span>
                        <small>Attendance</small>
                      </div>
                      <div className={styles.previewStat}>
                        <span>12</span>
                        <small>Lessons</small>
                      </div>
                      <div className={styles.previewStat}>
                        <span>5</span>
                        <small>Messages</small>
                      </div>
                    </div>
                    <div className={styles.previewChartArea}>
                      <div className={styles.previewChartLabel}>Weekly Engagement</div>
                      <div className={styles.previewBars}>
                        <div style={{ height: '60%' }} />
                        <div style={{ height: '75%' }} />
                        <div style={{ height: '50%' }} />
                        <div style={{ height: '90%' }} />
                        <div style={{ height: '85%' }} />
                      </div>
                    </div>
                    <div className={styles.previewActivityRow}>
                      <div className={styles.previewActivity}>
                        <div className={styles.previewActivityDot} />
                        <span>Grade R — Sensory Math submitted</span>
                      </div>
                      <div className={styles.previewActivity}>
                        <div className={styles.previewActivityDot} style={{ background: '#22d3ee' }} />
                        <span>Dash AI — 3 new lesson suggestions</span>
                      </div>
                      <div className={styles.previewActivity}>
                        <div className={styles.previewActivityDot} style={{ background: '#22c55e' }} />
                        <span>Payment confirmed — R. Ndlovu</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className={styles.videoCaption}>
              {DEMO_VIDEO_URL
                ? "A quick product walkthrough covering the parent app, teacher workflows, and Dash AI."
                : "Live teacher dashboard — attendance, lessons, Dash AI, and billing in one unified view."}
            </p>
          </div>
        </section>

        <section id="features" className={styles.section}>
          <div className={`${styles.sectionHeader} ${styles.reveal}`} data-reveal>
            <span>Core platform</span>
            <h2>Everything your school needs in one intelligent workspace.</h2>
            <p>Replace disconnected tools with a unified, high‑signal experience for staff and families.</p>
            <p className={styles.sectionNote}>
              Feature availability depends on plan and rollout; beta modules can be enabled on request.
            </p>
          </div>
          <div className={styles.featureGrid}>
            {featureCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className={`${styles.featureCard} ${styles.reveal}`}
                  data-reveal
                  style={{ transitionDelay: `${index * 80}ms` }}
                >
                  <div className={styles.featureCardTop}>
                    <div className={styles.featureIcon}>
                      <Icon size={22} strokeWidth={1.8} />
                    </div>
                    <div className={styles.featureTag}>{card.tag}</div>
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.copy}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="dash-ai" className={styles.sectionAlt}>
          <div className={styles.sectionSplit}>
            <div className={styles.reveal} data-reveal>
              <span className={styles.sectionLabel}>Dash AI</span>
              <h2>AI workflows with educator control built in.</h2>
              <p>
                Dash AI supports teachers and principals with lesson ideas, progress insights, and parent-ready
                summaries. You keep the final say. No black box.
              </p>
              <ul className={styles.inlineList}>
                <li>Step‑by‑step lesson guides</li>
                <li>Progress and engagement analysis</li>
                <li>Parent‑friendly summaries</li>
              </ul>
              <div className={styles.sectionButtons}>
                <Link href="/sign-in" className={styles.primarySolid}>
                  Explore Dash AI
                </Link>
                <Link href="/apply" className={styles.primaryGhost}>
                  Talk to us
                </Link>
              </div>
            </div>
            <div className={`${styles.sectionPanel} ${styles.reveal}`} data-reveal>
              <div className={styles.sectionPanelHeader}>Sample insight</div>
              <h3>Grade R engagement ↑ 18%</h3>
              <p>
                Dash AI detected higher engagement in sensory activities. Suggested three new lesson themes for the week.
              </p>
              <div className={styles.sectionPanelFoot}>Updated 3 mins ago • Human-reviewed</div>
            </div>
          </div>
        </section>

        <section id="roles" className={styles.section}>
          <div className={`${styles.sectionHeader} ${styles.reveal}`} data-reveal>
            <span>Built for every role</span>
            <h2>One platform, tailored experiences.</h2>
            <p>EduDash Pro adapts to principals, teachers, and parents without fragmenting the system.</p>
          </div>
          <div className={styles.roleGrid}>
            {roleCards.map((role, index) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.title}
                  className={`${styles.roleCard} ${styles.reveal}`}
                  data-reveal
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className={styles.roleCardHeader}>
                    <div className={styles.roleIcon}>
                      <Icon size={24} strokeWidth={1.8} />
                    </div>
                    <h3>{role.title}</h3>
                  </div>
                  <p>{role.copy}</p>
                  <ul>
                    {role.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section id="programs" className={styles.sectionAlt}>
          <div className={styles.sectionSplit}>
            <div className={styles.reveal} data-reveal>
              <span className={styles.sectionLabel}>Programs</span>
              <h2>Aftercare and community programs, streamlined.</h2>
              <p>
                Our aftercare suite handles registrations, proof‑of‑payment, and parent comms while keeping
                the core school platform front and center.
              </p>
              <div className={`${styles.aftercareCard} ${styles.reveal}`} data-reveal>
                <div>
                  <h4>EduDash Pro Aftercare</h4>
                  <p>Registrations, payment tracking, and WhatsApp onboarding in one flow.</p>
                </div>
                <div>
                  <span className={styles.aftercareBadge}>
                    {aftercareSpotsRemaining === null
                      ? "Early bird slots"
                      : `${aftercareSpotsRemaining} early bird slots left`}
                  </span>
                  <Link href="/aftercare" className={styles.primarySolidSmall}>
                    View program
                  </Link>
                </div>
              </div>
            </div>
            <div className={styles.programStack}>
              <div className={styles.reveal} data-reveal>
                <h3>Live lessons & meetings</h3>
                <p>Parent calls, class check‑ins, and live lesson sessions.</p>
              </div>
              <div className={styles.reveal} data-reveal>
                <h3>Fee workflows</h3>
                <p>Payment reminders, proof review, and automated receipts.</p>
              </div>
              <div className={styles.reveal} data-reveal>
                <h3>Digital enrollment</h3>
                <p>Faster approvals and smoother onboarding for families.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={`${styles.sectionHeader} ${styles.reveal}`} data-reveal>
            <span>Early access</span>
            <h2>Get the parent app beta.</h2>
            <p>We are onboarding new schools and parent testers now.</p>
          </div>
          <div className={`${styles.earlyAccessCard} ${styles.reveal}`} data-reveal>
            <div>
              <h3>Join the early access list</h3>
              <p>We will contact you with onboarding steps and a private mobile app invite.</p>
            </div>
            <form className={styles.earlyAccessForm} onSubmit={handleEarlyAccessSubmit}>
              <input
                type="email"
                placeholder="name@email.com"
                value={earlyAccessEmail}
                onChange={(e) => setEarlyAccessEmail(e.target.value)}
              />
              <button type="submit" disabled={earlyAccessSubmitting}>
                {earlyAccessSubmitting ? "Submitting..." : earlyAccessSubmitted ? "Joined" : "Join"}
              </button>
            </form>
            {earlyAccessError && <p className={styles.formError}>{earlyAccessError}</p>}
            {earlyAccessSubmitted && !earlyAccessError && (
              <p className={styles.formSuccess}>Thanks! We will email you with next steps.</p>
            )}
          </div>
        </section>

        <section id="pricing" className={styles.sectionAlt}>
          <div className={styles.sectionSplit}>
            <div className={styles.reveal} data-reveal>
              <span className={styles.sectionLabel}>Pricing</span>
              <h2>Flexible tiers for every school size.</h2>
              <p>Start free, then unlock AI automation and premium support as you grow.</p>
            </div>
            <div className={`${styles.pricingCard} ${styles.reveal}`} data-reveal>
              <h3>Launch with confidence</h3>
              <p>Explore detailed tiers and get a tailored quote for your school.</p>
              <div className={styles.sectionButtons}>
                <Link href="/pricing" className={styles.primarySolid}>
                  View pricing
                </Link>
                <Link href="/apply" className={styles.primaryGhost}>
                  Request proposal
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className={styles.section}>
          <div className={`${styles.sectionHeader} ${styles.reveal}`} data-reveal>
            <span>FAQ</span>
            <h2>Answers to the most common questions.</h2>
          </div>
          <div className={styles.faqGrid}>
            {faqs.map((item, index) => (
              <div
                key={item.q}
                className={`${styles.faqCard} ${styles.reveal}`}
                data-reveal
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <h3>EduDash Pro</h3>
          <p>Next‑gen school operations for Africa and beyond.</p>
        </div>
        <div className={styles.footerLinks}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/data-deletion">Data deletion</Link>
        </div>
      </footer>
    </div>
  );
}
