'use client';

interface SubPageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string; // Keep for backwards compatibility but not used
  icon?: React.ReactNode;
}

export function SubPageHeader({ title, subtitle, icon }: SubPageHeaderProps) {
  return (
    <div
      style={{
        padding: '24px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%)',
      }}
    >
      <div style={{ maxWidth: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {icon && (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)',
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: '28px', 
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
            }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ 
                margin: '8px 0 0 0', 
                fontSize: '15px', 
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 640px) {
          h1 {
            font-size: 22px !important;
          }
          p {
            font-size: 14px !important;
          }
        }
      `}</style>
    </div>
  );
}
