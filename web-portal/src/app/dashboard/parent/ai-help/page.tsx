'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { Sparkles, MessageCircle, Brain, BookOpen, FileText, Target, Lightbulb, ArrowRight } from 'lucide-react';

const quickPrompts = [
  {
    icon: BookOpen,
    title: 'Help with homework',
    description: 'Get step-by-step guidance on any homework assignment',
    prompt: "Help my child with their homework. I'll describe the problem.",
    color: '#3b82f6',
  },
  {
    icon: Brain,
    title: 'Explain a concept',
    description: 'Simple explanations for complex topics',
    prompt: "Explain this concept in a way my child can understand:",
    color: '#8b5cf6',
  },
  {
    icon: FileText,
    title: 'Generate practice worksheet',
    description: 'Create CAPS-aligned practice exercises',
    prompt: "Generate a practice worksheet for my child",
    color: '#10b981',
  },
  {
    icon: Target,
    title: 'Study tips for exams',
    description: 'Personalized study strategies and tips',
    prompt: "Give study tips and strategies for my child's upcoming exam",
    color: '#f59e0b',
  },
  {
    icon: Lightbulb,
    title: 'Learning activities',
    description: 'Fun educational activities for home',
    prompt: "Suggest fun learning activities I can do at home with my child",
    color: '#ec4899',
  },
];

export default function AIHelpPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>();
  const { slug } = useTenantSlug(userId);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/sign-in'); return; }
      setEmail(session.user.email || '');
      setUserId(session.user.id);
    })();
  }, [router, supabase.auth]);

  const handleQuickPrompt = (prompt: string) => {
    router.push(`/dashboard/parent/dash-chat?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <ParentShell tenantSlug={slug} userEmail={email}>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader 
          title="AI Help & Tutoring"
          subtitle="Get instant homework help and explanations from our AI tutor"
          icon={<Sparkles size={28} color="white" />}
        />
        
        <div style={{ width: '100%', padding: '20px' }}>
          {/* Main CTA Card */}
          <div className="card" style={{
            padding: 24,
            background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
            marginBottom: 24,
            color: 'white',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Sparkles size={28} />
              </div>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Chat with Dash AI</h2>
                <p style={{ fontSize: 15, opacity: 0.9, margin: '4px 0 0 0' }}>
                  Your 24/7 AI tutor for homework help and learning
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard/parent/dash-chat')}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: 'white',
                color: '#7c3aed',
                border: 'none',
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <MessageCircle size={20} />
              Start Chatting
              <ArrowRight size={18} />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="section">
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Quick Actions</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: 16,
            }}>
              {quickPrompts.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={index}
                    onClick={() => handleQuickPrompt(item.prompt)}
                    className="card"
                    style={{
                      padding: 20,
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 16,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = item.color;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 8px 24px ${item.color}22`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: `${item.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={22} style={{ color: item.color }} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px 0' }}>
                        {item.title}
                      </h4>
                      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Features Section */}
          <div className="card" style={{ marginTop: 24, padding: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>AI Tutor Features 🤖</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Get instant help with homework and studying:
            </p>
            <ul style={{ marginLeft: 20, marginBottom: 20, lineHeight: 1.8 }}>
              <li>💬 Natural conversation interface</li>
              <li>📚 Subject-specific explanations</li>
              <li>🔢 Step-by-step problem solving</li>
              <li>🎙️ Voice interaction support</li>
              <li>🌍 Multi-language support</li>
              <li>✅ Homework checking and feedback</li>
            </ul>

            <div style={{
              padding: 16,
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: 8,
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
                <Brain size={20} style={{ marginTop: 2, flexShrink: 0, color: '#10b981' }} />
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    ✨ Dash Chat is Now Available!
                  </p>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
                    Full conversational AI with image upload, continuous chat, and conversation history!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ParentShell>
  );
}
