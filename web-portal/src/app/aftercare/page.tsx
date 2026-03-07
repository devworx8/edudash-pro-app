"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Space_Grotesk, Fraunces } from "next/font/google";

import styles from "./page.module.css";
import { createClient } from "@/lib/supabase/client";

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

const COMMUNITY_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";
const EARLY_BIRD_LIMIT = 20;

export default function AftercareOverviewPage() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);

  useEffect(() => {
    const fetchSpots = async () => {
      try {
        const supabase = createClient();
        const { count } = await supabase
          .from("aftercare_registrations")
          .select("*", { count: "exact", head: true })
          .eq("preschool_id", COMMUNITY_SCHOOL_ID);

        if (count !== null) {
          setSpotsRemaining(Math.max(0, EARLY_BIRD_LIMIT - count));
        }
      } catch {
        setSpotsRemaining(null);
      }
    };

    fetchSpots();
  }, []);

  useEffect(() => {
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
  }, []);

  return (
    <div className={`${styles.page} ${spaceGrotesk.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <section className={styles.hero}>
        <div className={styles.container}>
          <Link href="/" className={styles.backLink}>
            ← Back to Home
          </Link>
          <div className={styles.heroGrid}>
            <div className={`${styles.heroCopy} ${styles.reveal}`} data-reveal>
              <div className={styles.eyebrow}>Aftercare Program</div>
              <h1 className={styles.heroTitle}>A structured, safe aftercare experience for Grades R–7.</h1>
              <p className={styles.heroLead}>
                EduDash Pro Community School aftercare blends supervised homework time with enrichment
                activities and safe pickup coordination.
              </p>
              <div className={styles.heroBadges}>
                <span>Homework support</span>
                <span>Enrichment sessions</span>
                <span>Secure parent communication</span>
              </div>
              <div className={styles.ctaRow}>
                <Link href="/aftercare/register" className={styles.primaryCta}>
                  Register now
                </Link>
                <Link href="/apply" className={styles.ghostCta}>
                  Talk to us
                </Link>
              </div>
              {spotsRemaining !== null && (
                <div className={styles.spotBanner}>
                  {spotsRemaining > 0
                    ? `${spotsRemaining} early-bird spots left (50% off registration)`
                    : "Early-bird offer closed"}
                </div>
              )}
            </div>

            <div className={`${styles.heroCard} ${styles.reveal}`} data-reveal>
              <h3>Program highlights</h3>
              <ul>
                <li>Daily check-in and attendance tracking</li>
                <li>Guided homework + reading time</li>
                <li>Creative clubs and movement breaks</li>
                <li>Secure pickup and parent messaging</li>
              </ul>
              <div className={styles.priceCard}>
                <div>
                  <span>Standard registration</span>
                  <strong>R400</strong>
                </div>
                <div>
                  <span>Early-bird registration</span>
                  <strong>R200</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.detailSection}>
        <div className={styles.container}>
          <div className={`${styles.sectionHeader} ${styles.reveal}`} data-reveal>
            <h2>What to expect</h2>
            <p>We keep the afternoons structured, engaging, and safe.</p>
          </div>
          <div className={styles.detailGrid}>
            <div className={`${styles.detailCard} ${styles.reveal}`} data-reveal>
              <h3>Daily flow</h3>
              <p>Check-in, snack, homework support, and guided activities before pickup.</p>
            </div>
            <div className={`${styles.detailCard} ${styles.reveal}`} data-reveal>
              <h3>Parent updates</h3>
              <p>Receive attendance confirmations and weekly progress notes in the EduDash Pro app.</p>
            </div>
            <div className={`${styles.detailCard} ${styles.reveal}`} data-reveal>
              <h3>Safety first</h3>
              <p>Verified pickups, emergency contacts, and secure communications at every step.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.scheduleSection}>
        <div className={styles.container}>
          <div className={`${styles.sectionHeader} ${styles.reveal}`} data-reveal>
            <h2>Typical weekday schedule</h2>
            <p>Times may shift by campus. We confirm final schedules during onboarding.</p>
          </div>
          <div className={styles.scheduleGrid}>
            <div className={`${styles.scheduleCard} ${styles.reveal}`} data-reveal>
              <span>13:30 - 14:15</span>
              <h3>Check-in & snack</h3>
              <p>Safe arrival, attendance, and a light snack before homework time.</p>
            </div>
            <div className={`${styles.scheduleCard} ${styles.reveal}`} data-reveal>
              <span>14:15 - 15:15</span>
              <h3>Homework support</h3>
              <p>Guided homework with educator supervision and quiet focus zones.</p>
            </div>
            <div className={`${styles.scheduleCard} ${styles.reveal}`} data-reveal>
              <span>15:15 - 16:15</span>
              <h3>Enrichment activities</h3>
              <p>Creative clubs, STEM play, reading circles, or outdoor movement.</p>
            </div>
            <div className={`${styles.scheduleCard} ${styles.reveal}`} data-reveal>
              <span>16:15 - 17:00</span>
              <h3>Pick-up window</h3>
              <p>Structured handover with verified pickup contacts.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.testimonialSection}>
        <div className={styles.container}>
          <div className={`${styles.sectionHeader} ${styles.reveal}`} data-reveal>
            <h2>What families say</h2>
            <p>Replace these with verified feedback when you are ready to publish.</p>
          </div>
          <div className={styles.testimonialGrid}>
            <div className={`${styles.testimonialCard} ${styles.reveal}`} data-reveal>
              <p>
                “The homework block gives my child structure after school, and I get updates in the
                app before I leave work.”
              </p>
              <span>Parent • Grade 2</span>
            </div>
            <div className={`${styles.testimonialCard} ${styles.reveal}`} data-reveal>
              <p>
                “The aftercare schedule keeps the afternoons calm. Pickup is clear and we never miss
                the handover.”
              </p>
              <span>Guardian • Grade 4</span>
            </div>
            <div className={`${styles.testimonialCard} ${styles.reveal}`} data-reveal>
              <p>
                “We finally have one place to confirm attendance, fees, and communication for
                aftercare.”
              </p>
              <span>Teacher • Aftercare team</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.faqSection}>
        <div className={styles.container}>
          <div className={`${styles.sectionHeader} ${styles.reveal}`} data-reveal>
            <h2>Aftercare FAQs</h2>
            <p>Quick answers about registration, payments, and approvals.</p>
          </div>
          <div className={styles.faqGrid}>
            <div className={`${styles.faqCard} ${styles.reveal}`} data-reveal>
              <h3>How do I register?</h3>
              <p>Complete the online registration form and submit the required details.</p>
            </div>
            <div className={`${styles.faqCard} ${styles.reveal}`} data-reveal>
              <h3>How do payments work?</h3>
              <p>Pay via EFT using the provided reference, then upload proof of payment.</p>
            </div>
            <div className={`${styles.faqCard} ${styles.reveal}`} data-reveal>
              <h3>When is registration approved?</h3>
              <p>We review proof of payment within 24 hours and notify you in-app or by email.</p>
            </div>
            <div className={`${styles.faqCard} ${styles.reveal}`} data-reveal>
              <h3>Can I update details later?</h3>
              <p>Yes. Contact the admin team if you need to update child or contact information.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <div className={`${styles.ctaCard} ${styles.reveal}`} data-reveal>
            <h2>Ready to join the aftercare program?</h2>
            <p>Complete the registration form in minutes, then upload proof of payment.</p>
            <Link href="/aftercare/register" className={styles.primaryCta}>
              Open registration form
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
