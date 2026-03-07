'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const PROMO_MESSAGES = [
  {
    emoji: '🏫',
    headline: 'Early Bird Special',
    subheadline: '50% OFF First 6 Months',
    description: 'Be among the first 500 schools to join EduDash Pro',
    features: 'AI-powered lessons, robotics modules & unlimited Dash AI',
    cta: 'Claim School Discount',
    ctaLink: '/sign-up/principal',
    ctaStyle: 'primary',
  },
  {
    emoji: '👨‍👩‍👧‍👦',
    headline: 'Parents - Join the Movement',
    subheadline: '50% OFF First 6 Months',
    description: 'Be among the first 1000 parents to join EduDash Pro',
    features: 'Unlimited learning tools, AI tutoring & textbook library',
    cta: 'Start Free Trial',
    ctaLink: '/sign-up/parent',
    ctaStyle: 'primary',
  },
  {
    emoji: '👨‍🏫',
    headline: 'Teachers - Empower Your Classroom',
    subheadline: '50% OFF First 6 Months',
    description: 'Be among the first 1000 teachers to join EduDash Pro',
    features: 'Lesson planning, AI grading & progress tracking',
    cta: 'Get Started',
    ctaLink: '/sign-up/teacher',
    ctaStyle: 'primary',
  },
  {
    emoji: '📚',
    headline: 'Limited Time Offer',
    subheadline: 'First 2000 Users Get 50% OFF',
    description: 'Schools, Parents & Teachers - Join Now!',
    features: 'Full access to AI tools, robotics & DBE textbooks',
    cta: 'Claim Your Spot',
    ctaLink: '/sign-in',
    ctaStyle: 'gradient',
  },
];

export function AnimatedPromoBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % PROMO_MESSAGES.length);
        setIsAnimating(false);
      }, 500); // Half second for fade out
    }, 5000); // Change every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const currentMessage = PROMO_MESSAGES[currentIndex];

  return (
    <div
      style={{
        marginBottom: '24px',
        padding: '20px',
        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)',
        border: '2px solid #7c3aed',
        borderRadius: '16px',
        maxWidth: '700px',
        margin: '0 auto 24px',
        boxShadow: '0 8px 32px rgba(124, 58, 237, 0.3)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '200px',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Animated gradient overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.1), transparent)',
          animation: 'shimmer 3s infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          opacity: isAnimating ? 0 : 1,
          transform: isAnimating ? 'translateY(-10px)' : 'translateY(0)',
          transition: 'all 0.5s ease',
        }}
      >
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>{currentMessage.emoji}</div>
        <div
          style={{
            fontWeight: 800,
            fontSize: '18px',
            marginBottom: '4px',
            color: '#c4b5fd',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {currentMessage.headline}
        </div>
        <div
          style={{
            fontWeight: 700,
            fontSize: '28px',
            marginBottom: '8px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {currentMessage.subheadline}
        </div>
        <p
          style={{
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.9)',
            marginBottom: '8px',
            lineHeight: 1.5,
          }}
        >
          🚀 {currentMessage.description}
          <br />✨ {currentMessage.features}
        </p>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: '16px',
          }}
        >
          <Link
            href={currentMessage.ctaLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background:
                currentMessage.ctaStyle === 'gradient'
                  ? 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)'
                  : '#7c3aed',
              color: 'white',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(124, 58, 237, 0.4)';
            }}
          >
            {currentMessage.cta} →
          </Link>
          <Link
            href="/exam-prep"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: 'rgba(251, 191, 36, 0.2)',
              color: '#fbbf24',
              border: '2px solid #fbbf24',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(251, 191, 36, 0.3)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(251, 191, 36, 0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            📚 Learning Resources
          </Link>
        </div>
      </div>

      {/* Progress dots */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          justifyContent: 'center',
          marginTop: '16px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {PROMO_MESSAGES.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setIsAnimating(true);
              setTimeout(() => {
                setCurrentIndex(index);
                setIsAnimating(false);
              }, 500);
            }}
            style={{
              width: index === currentIndex ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              border: 'none',
              background: index === currentIndex ? '#7c3aed' : 'rgba(124, 58, 237, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            aria-label={`Go to promo ${index + 1}`}
          />
        ))}
      </div>

      {/* Keyframes for shimmer effect */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
