import Link from "next/link";

export default function POPIACompliance() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "20px 24px", borderBottom: "1px solid #1f1f23" }}>
        <Link href="/" style={{ color: "#00f5ff", textDecoration: "none", fontSize: 16, fontWeight: 600 }}>
          ← Back to Home
        </Link>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 20 }}>POPIA Compliance</h1>
        
        <div style={{ marginBottom: 32, color: "#9CA3AF" }}>
          <p><strong>Effective Date:</strong> 26 October 2025</p>
        </div>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Protection of Personal Information Act (South Africa)</h2>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6, marginBottom: 16 }}>
            EduDash Pro is committed to compliance with the Protection of Personal Information Act (POPIA), Act No. 4 of 2013, which regulates the processing of personal information in South Africa.
          </p>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6 }}>
            We process personal information lawfully, with user consent, and for legitimate educational purposes. All data is stored securely and retained only as long as necessary.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Your POPIA Rights</h2>
          <ul style={{ color: "#9CA3AF", lineHeight: 1.8, paddingLeft: 20 }}>
            <li>Right to access your personal information</li>
            <li>Right to correct or update inaccurate data</li>
            <li>Right to object to processing</li>
            <li>Right to request deletion of your data</li>
            <li>Right to lodge a complaint with the Information Regulator</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Contact Our Information Officer</h2>
          <p style={{ color: "#9CA3AF", lineHeight: 1.6 }}>
            For POPIA-related inquiries, contact our Information Officer at{" "}
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
