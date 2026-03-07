'use client';

import { X } from 'lucide-react';
import { AskAIWidget } from '@/components/dashboard/AskAIWidget';

interface DashAIFullscreenModalProps {
  userId: string | undefined;
  onClose: () => void;
}

export function DashAIFullscreenModal({ userId, onClose }: DashAIFullscreenModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--background)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-1)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Ask Dash AI</h2>
        <button onClick={onClose} className="iconBtn" aria-label="Close">
          <X className="icon20" />
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AskAIWidget scope="principal" fullscreen userId={userId} />
      </div>
    </div>
  );
}
