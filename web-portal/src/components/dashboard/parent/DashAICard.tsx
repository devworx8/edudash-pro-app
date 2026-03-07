'use client';

import { useRouter } from 'next/navigation';
import { Sparkles, MessageCircle, BookOpen, FileText, Brain, ArrowRight } from 'lucide-react';

interface DashAICardProps {
  variant?: 'default' | 'compact';
}

const quickPrompts = [
  {
    icon: BookOpen,
    label: 'Help with homework',
    prompt: 'Help my child with their homework',
    color: '#3b82f6',
  },
  {
    icon: Brain,
    label: 'Explain a concept',
    prompt: 'Explain this concept in a simple way',
    color: '#8b5cf6',
  },
  {
    icon: FileText,
    label: 'Practice worksheet',
    prompt: 'Generate a practice worksheet',
    color: '#10b981',
  },
  {
    icon: Sparkles,
    label: 'Study tips',
    prompt: 'Give study tips for upcoming exams',
    color: '#f59e0b',
  },
];

export function DashAICard({ variant = 'default' }: DashAICardProps) {
  const router = useRouter();

  const handleQuickPrompt = (prompt: string) => {
    router.push(`/dashboard/parent/dash-chat?prompt=${encodeURIComponent(prompt)}`);
  };

  if (variant === 'compact') {
    return (
      <div
        className="card card-interactive"
        onClick={() => router.push('/dashboard/parent/ai-help')}
        style={{
          padding: 20,
          background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Sparkles size={24} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Ask Dash AI</div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>Get instant homework help</div>
          </div>
        </div>
        <ArrowRight size={24} />
      </div>
    );
  }

  return (
    <div className="section">
      <div className="card" style={{
        padding: 0,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%)',
        border: '1px solid rgba(124, 58, 237, 0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Sparkles size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Dash AI Assistant</h3>
              <p style={{ fontSize: 14, opacity: 0.9, margin: '4px 0 0 0' }}>
                Your 24/7 homework helper & study companion
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Quick Actions</div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: 12,
          }}>
            {quickPrompts.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={index}
                  onClick={() => handleQuickPrompt(item.prompt)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = item.color;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Icon size={18} style={{ color: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* CTA Button */}
          <button
            onClick={() => router.push('/dashboard/parent/dash-chat')}
            className="btn btnPrimary"
            style={{
              width: '100%',
              marginTop: 16,
              padding: '14px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 15,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
              border: 'none',
            }}
          >
            <MessageCircle size={18} />
            Open Dash Chat
          </button>
        </div>
      </div>
    </div>
  );
}
