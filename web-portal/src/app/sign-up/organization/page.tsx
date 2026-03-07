"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Organization onboarding page
 * 
 * Redirects to the principal sign-up page with organization-specific context.
 * Organizations include: skills/training centers, community organizations, 
 * daycare centers, and non-school educational entities.
 */
export default function OrganizationSignUpPage() {
  const router = useRouter();

  const orgTypes = [
    {
      title: "School / Preschool",
      description: "Register a school, preschool, or daycare center",
      href: "/sign-up/principal",
      icon: "🏫",
    },
    {
      title: "Skills / Training Center",
      description: "Register a skills development or training center",
      href: "/sign-up/principal?type=skills",
      icon: "🎓",
    },
    {
      title: "Community Organization",
      description: "Register a community or non-profit organization",
      href: "/sign-up/principal?type=org",
      icon: "🏛️",
    },
    {
      title: "Tertiary Institution",
      description: "Register a college, university, or TVET",
      href: "/sign-up/principal?type=tertiary",
      icon: "🎯",
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 600,
          width: "100%",
          background: "#16161a",
          border: "1px solid #2a2a2f",
          borderRadius: 16,
          padding: 40,
        }}
      >
        <h1
          style={{
            color: "#fff",
            fontSize: 28,
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Onboard Your Organization
        </h1>
        <p
          style={{
            color: "#9CA3AF",
            fontSize: 15,
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          Select the type of organization you want to register
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {orgTypes.map((org) => (
            <Link
              key={org.title}
              href={org.href}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  padding: "20px 24px",
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "2px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <span style={{ fontSize: 32 }}>{org.icon}</span>
                <div>
                  <div
                    style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}
                  >
                    {org.title}
                  </div>
                  <div
                    style={{ color: "#9CA3AF", fontSize: 13, marginTop: 4 }}
                  >
                    {org.description}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div
          style={{
            marginTop: 32,
            paddingTop: 24,
            borderTop: "1px solid #2a2a2f",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>
            Already have an account?{" "}
            <Link
              href="/sign-in"
              style={{
                color: "#00f5ff",
                textDecoration: "underline",
                fontWeight: 600,
              }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
