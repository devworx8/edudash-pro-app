'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const PROMO_MESSAGES = [
  {
    icon: '🏫',
    title: 'Early Bird Special',
    subtitle: '50% OFF First 3 Months',
    description: 'Be among the <strong>first 500 schools</strong> to join Young Eagles',
    features: '✨ AI-powered lessons, robotics modules & unlimited Dash AI',
    cta: 'Claim 50% Off →',
    ctaLink: '/sign-in',
    target: 'schools',
    gradient: 'from-purple-600 to-pink-600'
  },
  {
    icon: '👨‍👩‍👧‍👦',
    title: 'Parent Special',
    subtitle: '50% OFF First 3 Months',
    description: 'Join the <strong>first 1000 parents</strong> on Young Eagles',
    features: '🎓 AI tutoring, exam prep & real-time progress tracking',
    cta: 'Start Free Trial →',
    ctaLink: '/sign-up/parent',
    target: 'parents',
    gradient: 'from-blue-600 to-cyan-600'
  },
  {
    icon: '👨‍🏫',
    title: 'Teacher Special',
    subtitle: '50% OFF First 3 Months',
    description: 'Be among the <strong>first 1000 teachers</strong> to transform your classroom',
    features: '📚 AI lesson planning, auto-grading & class management',
    cta: 'Join Now →',
    ctaLink: '/sign-up/teacher',
    target: 'teachers',
    gradient: 'from-green-600 to-emerald-600'
  },
  {
    icon: '🤖',
    title: 'Limited Offer',
    subtitle: 'Free Robotics & Coding Access',
    description: 'Get <strong>6 interactive STEM modules</strong> included FREE',
    features: '🚀 Block coding, AI robotics & visual programming',
    cta: 'Explore Robotics →',
    ctaLink: '/dashboard/parent/robotics',
    target: 'all',
    gradient: 'from-orange-600 to-red-600'
  },
];

export function AnimatedPromoBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fading, setFading] = useState(false);

  const message = PROMO_MESSAGES[currentIndex];

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % PROMO_MESSAGES.length);
        setFading(false);
      }, 300); // Fade duration
    }, 6000); // Change every 6 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      marginBottom: '24px',
      padding: '24px',
      background: `linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)`,
      border: '2px solid',
      borderImage: `linear-gradient(135deg, #7c3aed 0%, #ec4899 100%) 1`,
      borderRadius: '20px',
      maxWidth: '700px',
      margin: '0 auto 24px',
      boxShadow: '0 12px 40px rgba(124, 58, 237, 0.4)',
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
    }}>
      {/* Animated background gradient */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%)`,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.3s ease',
        pointerEvents: 'none',
      }} />
      
      <div style={{
        position: 'relative',
        zIndex: 1,
        opacity: fading ? 0 : 1,
        transform: fading ? 'translateY(-10px)' : 'translateY(0)',
        transition: 'all 0.3s ease',
      }}>
        <div style={{
          fontSize: '40px',
          marginBottom: '12px',
          animation: 'bounce 2s infinite',
        }}>
          {message.icon}
        </div>
        
        <div style={{
          fontWeight: 800,
          fontSize: '18px',
          marginBottom: '6px',
          color: '#c4b5fd',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          {message.title}
        </div>
        
        <div style={{
          fontWeight: 800,
          fontSize: '32px',
          marginBottom: '12px',
          background: `linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1.2,
        }}>
          {message.subtitle}
        </div>
        
        <p style={{
          fontSize: '15px',
          color: 'rgba(255, 255, 255, 0.95)',
          marginBottom: '10px',
          lineHeight: 1.6,
        }} dangerouslySetInnerHTML={{ __html: message.description }} />
        
        <p style={{
          fontSize: '14px',
          color: 'rgba(255, 255, 255, 0.85)',
          marginBottom: '20px',
          lineHeight: 1.5,
        }}>
          {message.features}
        </p>
        
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <Link
            href={message.ctaLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 28px',
              background: `linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)`,
              color: 'white',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 6px 20px rgba(124, 58, 237, 0.5)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(124, 58, 237, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.5)';
            }}
          >
            {message.cta}
          </Link>
          
          {message.target !== 'all' && (
            <Link
              href="/exam-prep"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 24px',
                background: 'rgba(251, 191, 36, 0.15)',
                color: '#fbbf24',
                border: '2px solid #fbbf24',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(251, 191, 36, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(251, 191, 36, 0.15)';
              }}
            >
              📝 Free Exam Prep
            </Link>
          )}
        </div>
      </div>
      
      {/* Progress dots */}
      <div style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
        marginTop: '20px',
        position: 'relative',
        zIndex: 1,
      }}>
        {PROMO_MESSAGES.map((_, idx) => (
          <div
            key={idx}
            style={{
              width: idx === currentIndex ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: idx === currentIndex
                ? 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)'
                : 'rgba(255, 255, 255, 0.3)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
            }}
            onClick={() => {
              setFading(true);
              setTimeout(() => {
                setCurrentIndex(idx);
                setFading(false);
              }, 300);
            }}
          />
        ))}
      </div>
      
      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}
