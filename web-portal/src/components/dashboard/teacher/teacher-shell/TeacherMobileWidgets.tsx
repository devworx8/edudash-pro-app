'use client';

/**
 * Teacher Mobile Widgets Drawer Component
 * Extracted from TeacherShell.tsx
 */

import { X } from 'lucide-react';

interface TeacherMobileWidgetsProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function TeacherMobileWidgets({ isOpen, onClose, children }: TeacherMobileWidgetsProps) {
  if (!isOpen) return null;

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          zIndex: 9998,
          display: 'none',
        }}
        className="mobile-widgets-overlay"
        onClick={onClose}
      />
      <div 
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '85%',
          maxWidth: 400,
          background: 'var(--surface-1)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s ease-out',
        }}
        className="mobile-widgets-drawer"
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: 'var(--space-4)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Activity & Updates</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Notifications and recent activity
            </p>
          </div>
          <button onClick={onClose} className="iconBtn" aria-label="Close">
            <X className="icon20" />
          </button>
        </div>
        
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: 'var(--space-4)',
          WebkitOverflowScrolling: 'touch',
        }}>
          {children}
        </div>
      </div>
    </>
  );
}
