'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExamPrepWidget } from '@/components/dashboard/exam-prep/ExamPrepWidget';
import { AskAIWidget } from '@/components/dashboard/AskAIWidget';
import { X, GraduationCap, Target, Award, CheckCircle, ArrowRight, Sparkles } from 'lucide-react';

export default function ExamPrepPage() {
  const [showAskAI, setShowAskAI] = useState(false);
  const [guestMode, setGuestMode] = useState(true);
  const [aiPrompt, setAIPrompt] = useState('');
  const [aiDisplay, setAIDisplay] = useState('');
  const [aiLanguage, setAiLanguage] = useState<string>('en-ZA');
  const [aiInteractive, setAiInteractive] = useState(false);

  const handleAskFromExamPrep = (prompt: string, display: string, language?: string, enableInteractive?: boolean) => {
    console.log('[ExamPrepPage] handleAskFromExamPrep called with enableInteractive:', enableInteractive);
    setAIPrompt(prompt);
    setAIDisplay(display);
    setAiLanguage(language || 'en-ZA');
    setAiInteractive(enableInteractive || false);
    setShowAskAI(true);
    console.log('[ExamPrepPage] State set. aiInteractive will be:', enableInteractive || false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: 'var(--text)' }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: 'rgba(10, 10, 15, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Link href="/" style={{ fontSize: '18px', fontWeight: 700, textDecoration: 'none', color: 'inherit' }}>
            🦅 Young Eagles
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/sign-in" style={{ color: '#00f5ff', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
              Sign In
            </Link>
            <Link href="/sign-in" className="btn btnCyan" style={{ fontSize: '14px', padding: '8px 18px', borderRadius: '8px' }}>
              Upgrade Now
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        padding: '60px 20px 40px',
        background: 'radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.15), transparent 60%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ marginBottom: '16px' }}>
            <span className="pillCyan" style={{ fontSize: '12px', fontWeight: 600 }}>
              🇿🇦 CAPS Curriculum Aligned
            </span>
          </div>
          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 800,
            marginBottom: '20px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Exams Next Week?
            <br />
            We've Got You Covered!
          </h1>
          <p style={{
            fontSize: 'clamp(16px, 2.5vw, 20px)',
            color: 'rgba(255, 255, 255, 0.8)',
            marginBottom: '32px',
            maxWidth: '700px',
            margin: '0 auto 32px'
          }}>
            Generate unlimited CAPS-aligned practice tests, revision notes, study guides, and flashcards for Grades R-12 with Dash AI.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '40px' }}>
            <button
              onClick={() => {
                const widget = document.getElementById('exam-widget');
                widget?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="btn btnCyan"
              style={{ height: '48px', padding: '0 28px', fontSize: '16px', borderRadius: '12px' }}
            >
              <Sparkles className="w-5 h-5" />
              Generate Free Practice Test
            </button>
            <Link
              href="/sign-in"
              className="btn btnOutlineCyan"
              style={{ height: '48px', padding: '0 28px', fontSize: '16px', borderRadius: '12px' }}
            >
              Unlock Unlimited Access
            </Link>
          </div>
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', flexWrap: 'wrap', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle className="w-4 h-4" style={{ color: '#22c55e' }} />
              1 free resource daily
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle className="w-4 h-4" style={{ color: '#22c55e' }} />
              No credit card required
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle className="w-4 h-4" style={{ color: '#22c55e' }} />
              Broad CAPS coverage
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: '60px 20px', background: '#0a0a0f' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, marginBottom: '12px' }}>
              Everything You Need to Ace Your Exams
            </h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '16px' }}>
              CAPS-aligned exam resources powered by Dash AI
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '24px'
          }}>
            {[
              {
                icon: '📝',
                title: 'Practice Tests',
                description: 'Full exam papers with detailed marking memorandums',
                highlight: 'Exam-style questions'
              },
              {
                icon: '📚',
                title: 'Revision Notes',
                description: 'Topic summaries with key concepts and formulas',
                highlight: 'Quick reference'
              },
              {
                icon: '🎯',
                title: 'Study Guides',
                description: '7-day preparation schedules with daily tasks',
                highlight: 'Time management'
              },
              {
                icon: '🧠',
                title: 'Flashcards',
                description: '30+ cards for quick recall and active learning',
                highlight: 'Spaced repetition'
              }
            ].map((feature, i) => (
              <div
                key={i}
                className="card"
                style={{
                  padding: '24px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px'
                }}
              >
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>{feature.icon}</div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{feature.title}</h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', marginBottom: '12px' }}>
                  {feature.description}
                </p>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                  fontSize: '12px',
                  borderRadius: '6px',
                  fontWeight: 600
                }}>
                  {feature.highlight}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Exam Prep Widget Section */}
      <section id="exam-widget" style={{ padding: '60px 20px', background: 'rgba(10, 10, 15, 0.5)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div className="card" style={{ padding: '32px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <ExamPrepWidget onAskDashAI={handleAskFromExamPrep} guestMode={true} />
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section style={{
        padding: '60px 20px',
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
          <Award className="w-12 h-12" style={{ color: '#fbbf24', margin: '0 auto 20px' }} />
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, marginBottom: '16px' }}>
            Unlock Unlimited Practice Tests
          </h2>
          <p style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '24px' }}>
            Upgrade to Parent Starter for just <strong style={{ color: '#00f5ff' }}>R49.50/month</strong>
          </p>
          <ul style={{
            textAlign: 'left',
            maxWidth: '400px',
            margin: '0 auto 32px',
            display: 'grid',
            gap: '12px'
          }}>
            {[
              'Expanded practice tests & exams',
              'Study guides & revision notes',
              'Flashcards generation',
              'Progress tracking & analytics',
              'Plan-based AI limits • Cancel anytime'
            ].map((benefit, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}>
                <CheckCircle className="w-5 h-5" style={{ color: '#22c55e', flexShrink: 0 }} />
                {benefit}
              </li>
            ))}
          </ul>
          <Link
            href="/sign-up/parent?redirect=/exam-prep"
            className="btn btnCyan"
            style={{ height: '48px', padding: '0 32px', fontSize: '16px', borderRadius: '12px' }}
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
            7-day free trial • No credit card required • Cancel anytime
          </p>
        </div>
      </section>

      {/* Subjects Coverage */}
      <section style={{ padding: '60px 20px', background: '#0a0a0f' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, marginBottom: '12px' }}>
              CAPS Subjects Coverage
            </h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '16px' }}>
              Grades R–10 with selected Grade 11–12 subjects available on request
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            {[
              'Mathematics',
              'Home Language',
              'First Additional Language',
              'Natural Sciences',
              'Life Sciences',
              'Physical Sciences',
              'Social Sciences',
              'Geography',
              'History',
              'Accounting',
              'Business Studies',
              'Economics',
              'Life Orientation',
              'Technology'
            ].map((subject, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                {subject}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        background: '#0a0a0f',
        padding: '40px 24px',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              EduDash Pro
            </h3>
            <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '13px' }}>
              Built for African schools and beyond.
            </p>
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '24px',
            marginBottom: '24px'
          }}>
            <Link href="/" style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', textDecoration: 'none' }}>
              Home
            </Link>
            <Link href="/privacy" style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', textDecoration: 'none' }}>
              Privacy Policy
            </Link>
            <Link href="/terms" style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', textDecoration: 'none' }}>
              Terms of Service
            </Link>
            <Link href="/popia" style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', textDecoration: 'none' }}>
              POPIA Compliance
            </Link>
          </div>
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '24px' }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>
              © {new Date().getFullYear()} EduDash Pro. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* AI Modal */}
      {showAskAI && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.95)',
          backdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#0a0814',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Dash AI Exam Generator</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  {aiDisplay}
                </p>
              </div>
              <button
                onClick={() => setShowAskAI(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  color: 'white'
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: 0
            }}>
              <AskAIWidget
                scope="student"
                inline={true}
                initialPrompt={aiPrompt}
                displayMessage={aiDisplay}
                fullscreen={true}
                language={aiLanguage}
                enableInteractive={aiInteractive}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
