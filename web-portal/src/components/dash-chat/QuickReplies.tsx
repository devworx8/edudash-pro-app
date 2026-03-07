'use client';

import { MessageCircle, ArrowRight, HelpCircle, CheckCircle } from 'lucide-react';

interface QuickRepliesProps {
  onSelect: (reply: string) => void;
}

const QUICK_REPLIES = [
  { icon: ArrowRight, text: 'Continue', color: '#7c3aed' },
  { icon: HelpCircle, text: 'Explain more', color: '#ec4899' },
  { icon: CheckCircle, text: 'Yes', color: '#10b981' },
  { icon: MessageCircle, text: 'Can you see the image?', color: '#f59e0b' },
];

export function QuickReplies({ onSelect }: QuickRepliesProps) {
  return (
    <div
      style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface-0)',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {QUICK_REPLIES.map((reply, index) => {
          const Icon = reply.icon;
          return (
            <button
              key={index}
              onClick={() => onSelect(reply.text)}
              className="btn"
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${reply.color}15`;
                e.currentTarget.style.borderColor = reply.color;
                e.currentTarget.style.color = reply.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--surface-1)';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text)';
              }}
            >
              <Icon size={14} />
              {reply.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
