'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, VolumeX, User, Users } from 'lucide-react';
import { useTTS, TTSQuota } from '@/hooks/useTTS';
import { createClient } from '@/lib/supabase/client';

interface TTSSettingsProps {
  userId: string;
}

export function TTSSettings({ userId }: TTSSettingsProps) {
  const router = useRouter();
  const { voicePreference, setVoice, userTier, checkQuota } = useTTS(userId);
  const [quota, setQuota] = useState<TTSQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchQuota = async () => {
      setLoading(true);
      const result = await checkQuota();
      setQuota(result);
      setLoading(false);
    };

    fetchQuota();
  }, [checkQuota]);

  const tierColors: Record<string, string> = {
    free: '#94a3b8',
    trial: '#3b82f6',
    parent_starter: '#8b5cf6',
    parent_plus: '#f59e0b',
    basic: '#8b5cf6',
    premium: '#f59e0b',
    school_starter: '#10b981',
    school_premium: '#10b981',
    school_pro: '#059669',
    school_enterprise: '#047857',
    school: '#10b981',
  };

  const tierNames: Record<string, string> = {
    free: 'Free Plan',
    trial: 'Trial Plan',
    parent_starter: 'Starter Plan',
    parent_plus: 'Plus Plan',
    basic: 'Basic Plan',
    premium: 'Premium Plan',
    school_starter: 'School Starter',
    school_premium: 'School Premium',
    school_pro: 'School Pro',
    school_enterprise: 'Enterprise',
    school: 'School Plan',
  };

  return (
    <div style={{
      padding: 'var(--space-5)',
      background: 'var(--card)',
      borderRadius: 'var(--radius-2)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h3 style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 'var(--space-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Volume2 className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          Text-to-Speech Settings
        </h3>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>
          Listen to AI explanations with high-quality voices in multiple languages
        </p>
      </div>

      {/* Quota Display */}
      {!loading && quota && (
        <div style={{
          padding: 'var(--space-4)',
          background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(124, 58, 237, 0.05))',
          borderRadius: 'var(--radius-2)',
          marginBottom: 'var(--space-4)',
          border: '1px solid',
          borderColor: quota.remaining === 0 ? 'var(--danger)' : 'rgba(124, 58, 237, 0.3)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-2)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
              Today's Usage
            </span>
            <span style={{
              fontSize: 11,
              padding: '2px 8px',
              background: tierColors[quota.tier],
              color: '#fff',
              borderRadius: 'var(--radius-1)',
              fontWeight: 600,
            }}>
              {tierNames[quota.tier]}
            </span>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 4,
            marginBottom: 'var(--space-2)',
          }}>
            <span style={{
              fontSize: 32,
              fontWeight: 800,
              color: quota.remaining === 0 ? 'var(--danger)' : 'var(--primary)',
            }}>
              {quota.remaining}
            </span>
            <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>
              / {quota.limit}
            </span>
          </div>

          {/* Progress Bar */}
          <div style={{
            width: '100%',
            height: 8,
            background: 'var(--surface)',
            borderRadius: 'var(--radius-1)',
            overflow: 'hidden',
            marginBottom: 'var(--space-2)',
          }}>
            <div style={{
              width: `${(quota.remaining / quota.limit) * 100}%`,
              height: '100%',
              background: quota.remaining === 0 ? 'var(--danger)' : 'var(--primary)',
              transition: 'width 0.3s ease',
            }} />
          </div>

          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {quota.remaining === 0 ? (
              <>⚠️ Daily limit reached. Resets at midnight or <strong>upgrade for more</strong>.</>
            ) : (
              <>✓ {quota.remaining} text-to-speech requests remaining today</>
            )}
          </p>
        </div>
      )}

      {/* Voice Preference */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label style={{
          display: 'block',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 'var(--space-2)',
        }}>
          Preferred Voice
        </label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-2)',
        }}>
          <button
            onClick={() => setVoice('female')}
            style={{
              padding: 'var(--space-3)',
              background: voicePreference === 'female' ? 'var(--primary)' : 'var(--surface)',
              color: voicePreference === 'female' ? '#fff' : 'var(--text)',
              border: voicePreference === 'female' ? 'none' : '1px solid var(--border)',
              borderRadius: 'var(--radius-2)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
            }}
          >
            <User className="w-5 h-5" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Female Voice</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>Leah (English)</span>
          </button>

          <button
            onClick={() => setVoice('male')}
            style={{
              padding: 'var(--space-3)',
              background: voicePreference === 'male' ? 'var(--primary)' : 'var(--surface)',
              color: voicePreference === 'male' ? '#fff' : 'var(--text)',
              border: voicePreference === 'male' ? 'none' : '1px solid var(--border)',
              borderRadius: 'var(--radius-2)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
            }}
          >
            <Users className="w-5 h-5" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Male Voice</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>Luke (English)</span>
          </button>
        </div>
      </div>

      {/* Features */}
      <div style={{
        padding: 'var(--space-3)',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-2)',
      }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          Features
        </h4>
        <ul style={{
          margin: 0,
          paddingLeft: 'var(--space-4)',
          fontSize: 12,
          lineHeight: 1.8,
        }}>
          <li>🌍 Auto-detect language (English, Afrikaans, Zulu, Xhosa, Sepedi)</li>
          <li>🎙️ High-quality Azure Neural voices</li>
          <li>💾 Cached audio for instant replay</li>
          <li>⚡ Adjustable speed and pitch</li>
          <li>♿ Accessibility-first design</li>
        </ul>
      </div>

      {/* Upgrade CTA for free tier */}
      {quota?.tier === 'free' && (
        <div style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-4)',
          background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(244, 63, 94, 0.1))',
          borderRadius: 'var(--radius-2)',
          border: '1px solid rgba(124, 58, 237, 0.3)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            🚀 Want more TTS requests?
          </p>
          <p className="muted" style={{ fontSize: 12, marginBottom: 'var(--space-3)' }}>
            Trial: 20/day • Basic: 50/day • Premium: 200/day • School: 1000/day
          </p>
          <button
            className="btn btnPrimary"
            onClick={() => {
              // Navigate to upgrade page using Next.js router
              router.push('/dashboard/parent/upgrade');
            }}
            style={{
              fontSize: 13,
              padding: '8px 16px',
            }}
          >
            Upgrade Now
          </button>
        </div>
      )}
    </div>
  );
}
