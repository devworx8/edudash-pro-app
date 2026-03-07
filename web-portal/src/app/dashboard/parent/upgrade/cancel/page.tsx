'use client';

import { useRouter } from 'next/navigation';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { XCircle, ArrowLeft } from 'lucide-react';

export default function UpgradeCancelPage() {
  const router = useRouter();

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
            background: 'linear-gradient(135deg, #ff9500, #ff6b00)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--space-4)',
          }}>
            <XCircle size={48} color="white" />
          </div>

          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            Payment Cancelled
          </h1>

          <p style={{ fontSize: 18, color: 'var(--muted)', marginBottom: 'var(--space-6)' }}>
            Your payment was cancelled. No charges were made to your account.
          </p>

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <button
              className="btn btnSecondary"
              onClick={() => router.push('/dashboard/parent')}
            >
              <ArrowLeft size={16} />
              Back to Dashboard
            </button>
            <button
              className="btn btnPrimary"
              onClick={() => router.push('/dashboard/parent/upgrade')}
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                border: 'none',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    </ParentShell>
  );
}
