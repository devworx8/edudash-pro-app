'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

export function LoadingScreen() {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      {/* Animated circles in background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        opacity: 0.1
      }}>
        <div className="animate-blob" style={{
          position: 'absolute',
          top: '20%',
          left: '20%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
          filter: 'blur(60px)',
          animation: 'blob 7s infinite'
        }} />
        <div className="animate-blob animation-delay-2000" style={{
          position: 'absolute',
          top: '60%',
          right: '20%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #ec4899, #7c3aed)',
          filter: 'blur(60px)',
          animation: 'blob 7s infinite 2s'
        }} />
      </div>

      {/* Main logo circle */}
      <div style={{
        position: 'relative',
        marginBottom: 40
      }}>
        {/* Rotating outer ring */}
        <div style={{
          position: 'absolute',
          inset: -10,
          borderRadius: '50%',
          border: '3px solid transparent',
          borderTopColor: '#7c3aed',
          borderRightColor: '#ec4899',
          animation: 'spin 1.5s linear infinite'
        }} />
        
        {/* Pulsing middle ring */}
        <div style={{
          position: 'absolute',
          inset: -5,
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: '#ec4899',
          borderBottomColor: '#7c3aed',
          animation: 'spin 2s linear infinite reverse, pulse 2s ease-in-out infinite'
        }} />
        
        {/* Logo circle */}
        <div style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 20px 60px rgba(124, 58, 237, 0.4), 0 0 40px rgba(236, 72, 153, 0.3)',
          animation: 'float 3s ease-in-out infinite'
        }}>
          <Sparkles size={50} color="white" strokeWidth={2} />
        </div>
      </div>

      {/* Text */}
      <div style={{
        textAlign: 'center',
        color: 'white'
      }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 700,
          marginBottom: 12,
          background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Young Eagles
        </h1>
        <p style={{
          fontSize: 16,
          color: '#a0a0a0',
          fontWeight: 500
        }}>
          Loading{dots}
        </p>
      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.05);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes blob {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
      `}</style>
    </div>
  );
}
