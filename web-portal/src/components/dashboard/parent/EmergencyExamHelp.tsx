'use client';

import { Sparkles, MessageCircle } from 'lucide-react';

interface EmergencyExamHelpProps {
  onClick: () => void;
}

export function EmergencyExamHelp({ onClick }: EmergencyExamHelpProps) {
  return (
    <div className="section">
      <button
        onClick={onClick}
        className="btn"
        style={{
          background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
          color: 'white',
          width: '100%',
          padding: '20px',
          fontSize: 16,
          fontWeight: 700,
          border: 'none',
          borderRadius: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          boxShadow: '0 4px 20px rgba(236, 72, 153, 0.3)',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 30px rgba(236, 72, 153, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(236, 72, 153, 0.3)';
        }}
      >
        <span style={{ fontSize: 28 }}>⚡</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>
            Emergency Exam Help
          </div>
          <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 400 }}>
            AI Tutor ? Instant Help ? 24/7 Available
          </div>
        </div>
        <Sparkles size={24} style={{ marginLeft: 'auto' }} />
      </button>

      <div style={{
        marginTop: 12,
        padding: 12,
        background: 'rgba(236, 72, 153, 0.1)',
        border: '1px solid rgba(236, 72, 153, 0.3)',
        borderRadius: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
          <MessageCircle size={16} style={{ marginTop: 2, color: '#ec4899', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>Stuck on a question?</strong> Ask our AI tutor for step-by-step explanations in any subject and language.
          </p>
        </div>
      </div>
    </div>
  );
}
