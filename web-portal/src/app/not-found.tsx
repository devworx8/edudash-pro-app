import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #1a0a2e 50%, #0a0a0f 100%)',
        color: '#fff',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(4rem, 12vw, 8rem)',
          fontWeight: 800,
          background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1,
          marginBottom: '0.5rem',
        }}
      >
        404
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#a0a0a0', marginBottom: '2rem', maxWidth: 480 }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          href="/"
          style={{
            padding: '0.75rem 2rem',
            borderRadius: '0.75rem',
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            color: '#fff',
            fontWeight: 600,
            textDecoration: 'none',
            fontSize: '0.95rem',
          }}
        >
          Go Home
        </Link>
        <Link
          href="/pricing"
          style={{
            padding: '0.75rem 2rem',
            borderRadius: '0.75rem',
            border: '1px solid rgba(124, 58, 237, 0.4)',
            background: 'rgba(124, 58, 237, 0.1)',
            color: '#c4b5fd',
            fontWeight: 600,
            textDecoration: 'none',
            fontSize: '0.95rem',
          }}
        >
          View Pricing
        </Link>
      </div>
    </div>
  );
}
