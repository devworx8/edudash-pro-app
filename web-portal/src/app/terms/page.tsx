import Link from "next/link";

export default function TermsOfService() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "20px 24px", borderBottom: "1px solid #1f1f23" }}>
        <Link href="/" style={{ color: "#00f5ff", textDecoration: "none", fontSize: 16, fontWeight: 600 }}>
          ← Back to Home
        </Link>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 20 }}>Terms of Service</h1>
        
        <div style={{ marginBottom: 32, color: "#9CA3AF" }}>
          <p><strong>Effective Date:</strong> 26 October 2025</p>
          <p><strong>Last Updated:</strong> 26 October 2025</p>
        </div>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>1. Service Description</h2>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6, marginBottom: 16 }}>
            EduDash Pro is an AI-powered educational platform designed specifically for preschool institutions, teachers, parents, and children aged 3-6 years. Our platform provides:
          </p>
          <ul style={{ color: "#9CA3AF", lineHeight: 1.8, paddingLeft: 20 }}>
            <li>Educational Content: Age-appropriate learning materials and activities</li>
            <li>AI-Powered Tools: Lesson planning, homework assistance, and progress tracking</li>
            <li>Multi-User Dashboard: Separate interfaces for principals, teachers, parents, and students</li>
            <li>Subscription-Based Access: Tiered plans for different institutional needs</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>2. User Eligibility & Child Safety</h2>
          
          <h3 style={{ fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Eligible Users</h3>
          <ul style={{ color: "#9CA3AF", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
            <li>Educational Institutions: Preschools and early childhood centers</li>
            <li>Educators: Teachers and educational staff (18+ years)</li>
            <li>Parents/Guardians: Adults (18+ years) acting on behalf of children</li>
            <li>Children: Ages 3-6 under direct supervision of parents/guardians or educators</li>
          </ul>

          <h3 style={{ fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Child Protection (COPPA Compliance)</h3>
          <ul style={{ color: "#9CA3AF", lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong>Parental Consent:</strong> Required for all child accounts</li>
            <li><strong>Supervised Use:</strong> Children must use the platform under adult supervision</li>
            <li><strong>Limited Data Collection:</strong> We collect minimal data from children as outlined in our Privacy Policy</li>
            <li><strong>Educational Purpose Only:</strong> All child interactions are for educational purposes</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>3. Contact Us</h2>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6 }}>
            For terms-related inquiries, contact us at{" "}
            <a href="mailto:support@edudashpro.org.za" style={{ color: "#00f5ff", textDecoration: "underline" }}>
              support@edudashpro.org.za
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
