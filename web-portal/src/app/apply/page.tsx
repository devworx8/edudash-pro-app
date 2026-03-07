"use client";

import { useState } from "react";
import Link from "next/link";
import { Space_Grotesk, Fraunces } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
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

export default function ApplyPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.from("early_access_signups").insert({
        email,
        source: "demo_request",
        platform: "web",
      });

      if (error && error.code !== "23505") {
        throw error;
      }

      setStatus("success");
      setMessage("Thanks! We will reach out with demo times shortly.");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage("We could not save your request. Please email support@edudashpro.org.za.");
    }
  };

  return (
    <div className={`${styles.page} ${spaceGrotesk.variable} ${fraunces.variable}`}>
      <section className={styles.hero}>
        <div className={styles.container}>
          <Link href="/" className={styles.backLink}>
            ← Back to Home
          </Link>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>Book a demo</div>
              <h1 className={styles.heroTitle}>See EduDash Pro in action.</h1>
              <p className={styles.heroLead}>
                We&apos;ll walk you through the parent app, teacher workflows, billing tools, and Dash AI
                insights. Share one email and we&apos;ll schedule a walkthrough.
              </p>
              <ul className={styles.heroList}>
                <li>Live dashboard tour</li>
                <li>Workflow mapping for your school</li>
                <li>Pricing + rollout plan</li>
              </ul>
            </div>
            <form className={styles.formCard} onSubmit={handleSubmit}>
              <label className={styles.formLabel} htmlFor="demo-email">
                Work email
              </label>
              <input
                id="demo-email"
                type="email"
                placeholder="you@school.org"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={styles.formInput}
              />
              <button type="submit" className={styles.formButton} disabled={status === "loading"}>
                {status === "loading" ? "Submitting..." : "Request demo"}
              </button>
              {message && (
                <p className={status === "success" ? styles.formSuccess : styles.formError}>
                  {message}
                </p>
              )}
              <p className={styles.formHint}>
                Prefer email? Reach us at <strong>support@edudashpro.org.za</strong>.
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
