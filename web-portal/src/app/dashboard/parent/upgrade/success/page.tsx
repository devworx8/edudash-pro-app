'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { CheckCircle, ArrowRight } from 'lucide-react';

export default function UpgradeSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Reload user data to reflect new tier
    setTimeout(() => {
      window.location.href = '/dashboard/parent';
    }, 5000);
  }, []);

  return (
    <ParentShell>
      <div style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}>
        <div style={{
          maxWidth: 600,
          textAlign: 'center',
          background: 'var(--card)',
          padding: 'var(--space-8)',
          borderRadius: 'var(--radius-2)',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #34c759, #30d158)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--space-4)',
          }}>
            <CheckCircle size={48} color="white" />
          </div>

          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            Payment Successful!
          </h1>

          <p style={{ fontSize: 18, color: 'var(--muted)', marginBottom: 'var(--space-6)' }}>
            Your subscription has been activated. You now have access to all premium features!
          </p>

          <div style={{
            background: 'var(--surface)',
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-1)',
            marginBottom: 'var(--space-6)',
          }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
              You'll be redirected to your dashboard in a few seconds...
            </p>
          </div>

          <button
            className="btn btnPrimary"
            onClick={() => router.push('/dashboard/parent')}
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
              border: 'none',
            }}
          >
            Go to Dashboard
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </ParentShell>
  );
}
