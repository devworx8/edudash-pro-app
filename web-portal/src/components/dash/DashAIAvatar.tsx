'use client';

import React from 'react';

interface DashAIAvatarProps {
  size?: number;
  showStars?: boolean;
  animated?: boolean;
  className?: string;
}

/**
 * Dash AI Avatar - The official icon for Dash AI assistant
 * Features: Gradient purple/pink circle with arrow icon and animated stars
 */
export const DashAIAvatar: React.FC<DashAIAvatarProps> = ({
  size = 48,
  showStars = true,
  animated = true,
  className = '',
}) => {
  const starSize = size * 0.25;
  
  return (
    <div 
      className={`dash-ai-avatar ${className}`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {/* Outer glow ring */}
      <div
        style={{
          position: 'absolute',
          inset: -3,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(236, 72, 153, 0.4))',
          filter: 'blur(4px)',
        }}
      />
      
      {/* Main circle with gradient */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f472b6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(168, 85, 247, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
          border: '2px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        {/* Arrow icon */}
        <svg
          width={size * 0.45}
          height={size * 0.45}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
          }}
        >
          {/* Upward arrow with bend */}
          <path d="M7 17L17 7" />
          <path d="M7 7h10v10" />
        </svg>
      </div>
      
      {/* Animated stars */}
      {showStars && (
        <>
          {/* Main star (top right) */}
          <svg
            width={starSize}
            height={starSize}
            viewBox="0 0 24 24"
            fill="#fbbf24"
            className={animated ? 'dash-star-animate' : ''}
            style={{
              position: 'absolute',
              top: -starSize * 0.3,
              right: -starSize * 0.3,
              filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.6))',
            }}
          >
            <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
          </svg>
          
          {/* Small star */}
          <svg
            width={starSize * 0.6}
            height={starSize * 0.6}
            viewBox="0 0 24 24"
            fill="#fbbf24"
            className={animated ? 'dash-star-animate-delay' : ''}
            style={{
              position: 'absolute',
              top: starSize * 0.4,
              right: -starSize * 0.5,
              opacity: 0.8,
              filter: 'drop-shadow(0 0 3px rgba(251, 191, 36, 0.5))',
            }}
          >
            <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
          </svg>
        </>
      )}
      
      {/* CSS animations */}
      <style jsx>{`
        @keyframes starPulse {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
          50% {
            transform: scale(1.2) rotate(15deg);
            opacity: 0.8;
          }
        }
        
        @keyframes starPulseDelay {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.15) rotate(-10deg);
            opacity: 0.6;
          }
        }
        
        .dash-star-animate {
          animation: starPulse 2s ease-in-out infinite;
        }
        
        .dash-star-animate-delay {
          animation: starPulseDelay 2s ease-in-out infinite;
          animation-delay: 0.5s;
        }
      `}</style>
    </div>
  );
};

/**
 * Dash AI Loading State - Animated thinking indicator
 */
export const DashAILoading: React.FC<{ size?: number }> = ({ size = 48 }) => {
  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        className="dash-loading-avatar"
        style={{
          position: 'relative',
          width: size,
          height: size,
        }}
      >
        {/* Spinning outer ring */}
        <div
          className="dash-spin-ring"
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#a855f7',
            borderRightColor: '#ec4899',
          }}
        />
        
        <DashAIAvatar size={size} showStars={true} animated={true} />
      </div>
      
      {/* Typing dots */}
      <div style={{ display: 'flex', gap: 4 }}>
        <span className="dash-typing-dot" style={{ animationDelay: '0ms' }} />
        <span className="dash-typing-dot" style={{ animationDelay: '150ms' }} />
        <span className="dash-typing-dot" style={{ animationDelay: '300ms' }} />
      </div>
      
      <style jsx>{`
        @keyframes spinRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes typingDot {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
        
        .dash-spin-ring {
          animation: spinRing 1.5s linear infinite;
        }
        
        .dash-typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a855f7, #ec4899);
          animation: typingDot 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default DashAIAvatar;
