'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { signOutEverywhere } from '@/lib/auth/signOut';
import { CAPSActivitiesWidget } from '@/components/dashboard/parent/CAPSActivitiesWidget';
import { ExamPrepWidget } from '@/components/dashboard/exam-prep/ExamPrepWidget';
import { AskAIWidget } from '@/components/dashboard/AskAIWidget';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import {
  BookOpen,
  Brain,
  TrendingUp,
  Award,
  Sparkles,
  Star,
  Zap,
  Clock,
  GraduationCap,
  Target,
  X,
  ArrowUpCircle,
  Crown,
  CheckCircle,
} from 'lucide-react';

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  grade: string;
}

export default function StandaloneParentDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Parent');
  const [userEmail, setUserEmail] = useState('');
  const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'parent-starter' | 'parent-plus'>('free');
  const [children, setChildren] = useState<Child[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('Good Day');
  const [showAskAI, setShowAskAI] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [aiDisplay, setAIDisplay] = useState('');
  const [aiLanguage, setAiLanguage] = useState<string>('en-ZA');
  const [aiInteractive, setAiInteractive] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalData, setUpgradeModalData] = useState<{ currentUsage: number; currentLimit: number } | null>(null);

  // Stats for standalone parents
  const [stats, setStats] = useState({
    homeworkHelpsUsed: 0,
    homeworkHelpsLimit: 10,
    examPrepsGenerated: 0,
    studyStreak: 0,
  });

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      setUserId(session.user.id);
      setUserEmail(session.user.email || '');

      // Set greeting based on time of day
      const hour = new Date().getHours();
      if (hour < 12) setGreeting('Good Morning');
      else if (hour < 18) setGreeting('Good Afternoon');
      else setGreeting('Good Evening');

      // Fetch user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, subscription_tier, preschool_id')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile) {
        setUserName(profile.first_name || session.user.email?.split('@')[0] || 'Parent');
        
        // Normalize subscription tier
        const tier = (profile.subscription_tier || 'free').toLowerCase();
        if (tier.includes('parent-starter') || tier.includes('starter')) {
          setSubscriptionTier('parent-starter');
          setStats(prev => ({ ...prev, homeworkHelpsLimit: 30 }));
        } else if (tier.includes('parent-plus') || tier.includes('plus')) {
          setSubscriptionTier('parent-plus');
          setStats(prev => ({ ...prev, homeworkHelpsLimit: 100 }));
        }

        // If user has preschool_id, redirect to affiliated dashboard
        if (profile.preschool_id) {
          router.push('/dashboard/parent');
          return;
        }
      }

      // Fetch children (check parent_id AND guardian_id)
      const { data: childrenData } = await supabase
        .from('students')
        .select('id, first_name, last_name, date_of_birth, grade')
        .or(`parent_id.eq.${session.user.id},guardian_id.eq.${session.user.id}`)
        .order('first_name');

      if (childrenData && childrenData.length > 0) {
        const mappedChildren = childrenData.map((c: any) => {
          const age = c.date_of_birth 
            ? Math.floor((new Date().getTime() - new Date(c.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365))
            : 10;
          return {
            id: c.id,
            firstName: c.first_name || 'Child',
            lastName: c.last_name || '',
            age,
            grade: c.grade || 'Grade 5',
          };
        });
        setChildren(mappedChildren);
        setActiveChildId(mappedChildren[0].id);
      }

      // TODO: Fetch AI usage stats from ai_usage_logs table
      // For now using mock data

      setLoading(false);
    };

    initAuth();
  }, [router, supabase]);

  const handleAskFromActivity = async (prompt: string, display: string, language?: string, enableInteractive?: boolean) => {    // Check usage limits for free/starter tiers
    if (subscriptionTier === 'free' && stats.homeworkHelpsUsed >= stats.homeworkHelpsLimit) {
      setShowUpgradeModal(true);
      setUpgradeModalData({ currentUsage: stats.homeworkHelpsUsed, currentLimit: stats.homeworkHelpsLimit });
      return;
    }
    if (subscriptionTier === 'parent-starter' && stats.homeworkHelpsUsed >= stats.homeworkHelpsLimit) {
      setShowUpgradeModal(true);
      setUpgradeModalData({ currentUsage: stats.homeworkHelpsUsed, currentLimit: stats.homeworkHelpsLimit });
      return;
    }

    setAIPrompt(prompt);
    setAIDisplay(display);
    setAiLanguage(language || 'en-ZA');
    setAiInteractive(enableInteractive || false);
    setShowAskAI(true);

    // Increment usage (optimistic update)
    setStats(prev => ({ ...prev, homeworkHelpsUsed: prev.homeworkHelpsUsed + 1 }));
  };

  const activeChild = children.find(c => c.id === activeChildId);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#e2e8f0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🦅</div>
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Header */}
      <header style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/" style={{ fontSize: 20, fontWeight: 700, color: '#06b6d4', textDecoration: 'none' }}>
              🦅 Young Eagles
            </Link>
            {subscriptionTier !== 'free' && (
              <div style={{ 
                padding: '4px 12px', 
                background: subscriptionTier === 'parent-plus' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #3b82f6, #2563eb)', 
                borderRadius: 12, 
                fontSize: 12, 
                fontWeight: 600, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 4 
              }}>
                {subscriptionTier === 'parent-plus' ? <Crown size={14} /> : <Star size={14} />}
                {subscriptionTier === 'parent-starter' ? 'Starter' : 'Plus'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 14, color: '#94a3b8' }}>{userEmail}</div>
            <button
              onClick={async () => {
                await signOutEverywhere({ timeoutMs: 2500 });
                router.push('/sign-in');
              }}
              style={{ padding: '8px 16px', background: '#334155', border: 0, borderRadius: 8, color: '#e2e8f0', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, marginBottom: 8 }}>
            {greeting}, {userName}!
          </h1>
          <p style={{ fontSize: 16, color: '#94a3b8', margin: 0 }}>
            Welcome to your personal learning hub
          </p>
        </div>

        {/* Upgrade Banner (for free tier) */}
        {subscriptionTier === 'free' && (
          <div style={{ 
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)', 
            padding: 24, 
            borderRadius: 16, 
            marginBottom: 32, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Sparkles size={24} />
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Unlock More Learning</h3>
              </div>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
                Get 30 AI Homework Helpers per month + priority support for just R49.50/month
              </p>
            </div>
            <Link href="/pricing" style={{ 
              padding: '12px 24px', 
              background: 'white', 
              color: '#1e40af', 
              borderRadius: 10, 
              fontSize: 15, 
              fontWeight: 700, 
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}>
              Upgrade to Starter <ArrowUpCircle size={18} />
            </Link>
          </div>
        )}

        {/* Usage Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 10, background: '#3b82f6' + '20', borderRadius: 10 }}>
                <Brain size={24} style={{ color: '#3b82f6' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.homeworkHelpsUsed}/{stats.homeworkHelpsLimit}</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>AI Homework Help</div>
              </div>
            </div>
            <div style={{ height: 4, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ 
                width: `${(stats.homeworkHelpsUsed / stats.homeworkHelpsLimit) * 100}%`, 
                height: '100%', 
                background: stats.homeworkHelpsUsed >= stats.homeworkHelpsLimit ? '#ef4444' : '#3b82f6',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 10, background: '#f59e0b' + '20', borderRadius: 10 }}>
                <GraduationCap size={24} style={{ color: '#f59e0b' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.examPrepsGenerated}</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Exam Preps</div>
              </div>
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 10, background: '#10b981' + '20', borderRadius: 10 }}>
                <Zap size={24} style={{ color: '#10b981' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.studyStreak}</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Day Streak</div>
              </div>
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 10, background: '#8b5cf6' + '20', borderRadius: 10 }}>
                <Award size={24} style={{ color: '#8b5cf6' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{children.length}</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Children</div>
              </div>
            </div>
          </div>
        </div>

        {/* Children Selector */}
        {children.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={20} />
              Select Child
            </h3>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
              {children.map((child) => (
                <div
                  key={child.id}
                  onClick={() => setActiveChildId(child.id)}
                  style={{
                    minWidth: 200,
                    padding: 16,
                    background: activeChildId === child.id ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : '#1e293b',
                    border: activeChildId === child.id ? '2px solid #06b6d4' : '1px solid #334155',
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                    {child.firstName} {child.lastName}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {child.grade} • Age {child.age}
                  </div>
                  {activeChildId === child.id && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                      <CheckCircle size={14} />
                      Active
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Child Button */}
        {children.length === 0 && (
          <div style={{ marginBottom: 32 }}>
            <Link
              href="/dashboard/parent/register-child"
              style={{
                display: 'block',
                padding: 24,
                background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                border: 0,
                borderRadius: 16,
                color: 'white',
                fontSize: 16,
                fontWeight: 600,
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              + Add Your First Child
            </Link>
          </div>
        )}

        {/* Quick Actions Grid (Mobile) */}
        {isMobile && (
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={20} style={{ color: '#3b82f6' }} />
              Quick Actions
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: 12,
            }}>
              <button
                onClick={() => setShowAskAI(true)}
                style={{
                  padding: 20,
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  border: 0,
                  borderRadius: 12,
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  textAlign: 'center',
                  minHeight: 120,
                }}
              >
                <Brain size={28} />
                <div>
                  <div style={{ marginBottom: 4 }}>AI Homework</div>
                  <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 400 }}>
                    {stats.homeworkHelpsUsed}/{stats.homeworkHelpsLimit}
                  </div>
                </div>
              </button>

              <Link
                href="/exam-prep"
                style={{
                  padding: 20,
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 0,
                  borderRadius: 12,
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  textAlign: 'center',
                  minHeight: 120,
                }}
              >
                <GraduationCap size={28} />
                <div>Exam Prep</div>
              </Link>

              <button
                onClick={() => alert('Coming soon: Track your child\'s progress over time')}
                style={{
                  padding: 20,
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  color: '#e2e8f0',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  textAlign: 'center',
                  minHeight: 120,
                }}
              >
                <TrendingUp size={28} />
                <div>Progress</div>
              </button>

              {subscriptionTier !== 'parent-plus' && (
                <Link
                  href="/pricing"
                  style={{
                    padding: 20,
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    border: 0,
                    borderRadius: 12,
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    textAlign: 'center',
                    minHeight: 120,
                  }}
                >
                  <Crown size={28} />
                  <div>Upgrade</div>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Main Features Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 32 }}>
          {/* Quick Actions (Desktop Only) */}
          {!isMobile && (
            <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, border: '1px solid #334155' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} style={{ color: '#3b82f6' }} />
                Quick Actions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  onClick={() => setShowAskAI(true)}
                  style={{
                    padding: 16,
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    border: 0,
                    borderRadius: 10,
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                  }}
                >
                  <Brain size={20} />
                  <div>
                    <div>AI Homework Helper</div>
                    <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 400 }}>
                      {stats.homeworkHelpsUsed}/{stats.homeworkHelpsLimit} used this month
                    </div>
                  </div>
                </button>

                <Link
                  href="/exam-prep"
                  style={{
                    padding: 16,
                    background: '#334155',
                    border: '1px solid #475569',
                    borderRadius: 10,
                    color: '#e2e8f0',
                    fontSize: 15,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <GraduationCap size={20} />
                  <div>Generate Exam Prep</div>
                </Link>

                <button
                  onClick={() => alert('Coming soon: Track your child\'s progress over time')}
                  style={{
                    padding: 16,
                    background: '#334155',
                    border: '1px solid #475569',
                    borderRadius: 10,
                    color: '#e2e8f0',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                  }}
                >
                  <TrendingUp size={20} />
                  <div>View Progress</div>
                </button>

                {subscriptionTier !== 'parent-plus' && (
                  <Link
                    href="/pricing"
                    style={{
                      padding: 16,
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      border: 0,
                      borderRadius: 10,
                      color: 'white',
                      fontSize: 15,
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <Crown size={20} />
                    <div>Upgrade to Plus</div>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Learning Tips */}
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, border: '1px solid #334155' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={20} style={{ color: '#10b981' }} />
              Learning Tips
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>📚 Daily Study Routine</div>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                  Set aside 30 minutes each day for focused study time. Consistency is key!
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>🎯 Use Practice Tests</div>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                  Generate CAPS-aligned practice tests to prepare for exams effectively.
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>🌟 Celebrate Progress</div>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                  Acknowledge small wins to keep motivation high throughout the learning journey.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CAPS Activities Widget */}
        {activeChild && (
          <div style={{ marginBottom: 32 }}>
            <CAPSActivitiesWidget
              childAge={activeChild.age}
              childName={activeChild.firstName}
              onAskDashAI={(prompt, display) => handleAskFromActivity(prompt, display)}
            />
          </div>
        )}

        {/* Exam Prep Widget */}
        {activeChild && activeChild.age >= 6 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, border: '1px solid #334155' }}>
              <ExamPrepWidget
                userId={userId}
                onAskDashAI={(prompt, display, language, enableInteractive) => {
                  handleAskFromActivity(prompt, display, language, enableInteractive);
                }}
                guestMode={false}
              />
            </div>
          </div>
        )}

        {/* Upgrade CTA (for starter tier) */}
        {subscriptionTier === 'parent-starter' && (
          <div style={{ 
            background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
            padding: 32, 
            borderRadius: 16, 
            textAlign: 'center',
            marginBottom: 32,
          }}>
            <Crown size={48} style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
              Upgrade to Parent Plus
            </h3>
            <p style={{ fontSize: 16, opacity: 0.9, marginBottom: 20, maxWidth: 600, margin: '0 auto 20px' }}>
              Get 100 AI queries/month, support for 3 children, advanced insights, and priority support for R99.50/month
            </p>
            <Link href="/pricing" style={{ 
              padding: '14px 32px', 
              background: 'white', 
              color: '#d97706', 
              borderRadius: 10, 
              fontSize: 16, 
              fontWeight: 700, 
              textDecoration: 'none',
              display: 'inline-block',
            }}>
              View Plans →
            </Link>
          </div>
        )}
      </main>

      {/* Ask AI Modal */}
      {showAskAI && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            background: '#1e293b',
            borderBottom: '1px solid #334155',
            padding: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Ask Dash AI</h2>
            <button
              onClick={() => setShowAskAI(false)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#334155',
                border: 0,
                color: '#e2e8f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          <div style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <AskAIWidget
              scope="parent"
              initialPrompt={aiPrompt}
              displayMessage={aiDisplay}
              language={aiLanguage}
              enableInteractive={aiInteractive}
              userId={userId}
              inline
              fullscreen
            />
          </div>
        </div>
      )}

      {/* UpgradeModal for quota exceeded */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentTier={subscriptionTier === 'parent-starter' ? 'parent_starter' : subscriptionTier === 'parent-plus' ? 'parent_plus' : 'free'}
        userId={userId || ''}
        userEmail={userEmail}
        userName={userName}
        featureBlocked="homework_help"
        currentUsage={upgradeModalData?.currentUsage}
        currentLimit={upgradeModalData?.currentLimit}
      />
    </div>
  );
}
