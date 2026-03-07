import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "20px 24px", borderBottom: "1px solid #1f1f23" }}>
        <Link href="/" style={{ color: "#00f5ff", textDecoration: "none", fontSize: 16, fontWeight: 600 }}>
          ← Back to Home
        </Link>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 20 }}>Privacy Policy</h1>
        
        <div style={{ marginBottom: 32, color: "#9CA3AF" }}>
          <p><strong>Effective Date:</strong> 26 October 2025</p>
          <p><strong>Last Updated:</strong> 26 October 2025</p>
        </div>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>1. Introduction & Scope</h2>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6, marginBottom: 16 }}>
            Welcome to EduDash Pro. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use our AI-powered educational platform designed for preschools, teachers, parents, and children aged 3-6 years.
          </p>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6 }}>
            We are committed to protecting the privacy and security of all users, with special attention to the protection of children's data in compliance with international regulations.
          </p>
          <h3 style={{ fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Regulatory Compliance</h3>
          <ul style={{ color: "#9CA3AF", lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong>GDPR</strong> (General Data Protection Regulation) - EU/EEA users</li>
            <li><strong>POPIA</strong> (Protection of Personal Information Act) - South African users</li>
            <li><strong>COPPA</strong> (Children's Online Privacy Protection Act) - Children under 13</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>2. Information We Collect</h2>
          
          <h3 style={{ fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Account Information</h3>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6, marginBottom: 16 }}>
            We collect basic account information necessary to provide our educational services: full name, email address, phone number, school/preschool affiliation, role (teacher, parent, principal, student), and date of birth for age verification.
          </p>

          <h3 style={{ fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Children's Information (Ages 3-6)</h3>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6, marginBottom: 12 }}><strong>With parental consent, we collect:</strong></p>
          <ul style={{ color: "#9CA3AF", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
            <li>Child's first name, age, grade level</li>
            <li>Learning progress and assessment data</li>
            <li>Educational activities and assignments</li>
            <li>Attendance records</li>
            <li>Voice recordings (optional, for speech features)</li>
          </ul>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6, marginBottom: 12 }}><strong>Special Protections:</strong></p>
          <ul style={{ color: "#9CA3AF", lineHeight: 1.8, paddingLeft: 20 }}>
            <li>Minimal data collection principle</li>
            <li>Parental consent required before collection</li>
            <li>Secure storage with encryption</li>
            <li>No personal advertising targeting</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>3. Contact Us</h2>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6 }}>
            For privacy-related inquiries, contact us at{" "}
            <a href="mailto:privacy@edudashpro.org.za" style={{ color: "#00f5ff", textDecoration: "underline" }}>
              privacy@edudashpro.org.za
            </a>
          </p>
        </section>

        <footer style={{ marginTop: 60, paddingTop: 24, borderTop: "1px solid #1f1f23", color: "#6B7280", textAlign: "center" }}>
          <p>© 2025 EduDash Pro. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
