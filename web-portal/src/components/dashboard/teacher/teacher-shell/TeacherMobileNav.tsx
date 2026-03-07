'use client';

/**
 * Teacher Mobile Navigation Component
 * Extracted from TeacherShell.tsx
 * Only shows overlay/drawer on compact viewports (< 1200px).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { X, LogOut } from 'lucide-react';
import { signOutEverywhere } from '@/lib/auth/signOut';
import type { NavItem } from './types';

const COMPACT_BREAKPOINT = 1200;

interface TeacherMobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  nav: NavItem[];
}

export function TeacherMobileNav({ isOpen, onClose, nav }: TeacherMobileNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);
  // Start false to match SSR; sync in useEffect to avoid hydration mismatch
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const check = () => setIsMobileViewport(window.innerWidth < COMPACT_BREAKPOINT);
    check(); // Run on mount (client-only)
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // If route changes while drawer is open, force-close to avoid stuck overlay state.
  useEffect(() => {
    const hasPathChanged = lastPathnameRef.current !== pathname;
    if (isOpen && hasPathChanged) {
      onClose();
    }
    lastPathnameRef.current = pathname;
  }, [pathname, isOpen, onClose]);

  // Lock body scroll when drawer is open to prevent double scrollbar (drawer + background)
  useEffect(() => {
    if (!isOpen || !isMobileViewport) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [isOpen, isMobileViewport]);

  // Don't render overlay/drawer on desktop/tablet so the dashboard is never blocked
  if (!isOpen || !isMobileViewport) return null;

  const handleNavClick = (href: string) => {
    onClose(); // Close drawer first
    setTimeout(() => {
      router.push(href);
    }, 100); // Small delay to allow drawer to close
  };

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
        }}
        className="mobile-nav-overlay"
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '80%',
          maxWidth: 320,
          background: 'var(--surface-1)',
          zIndex: 9999,
          animation: 'slideInLeft 0.3s ease-out',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}
        className="mobile-nav-drawer mobile-nav-drawer-flex"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Menu</h3>
          <button onClick={onClose} className="iconBtn" aria-label="Close">
            <X className="icon20" />
          </button>
        </div>
        <nav className="nav mobile-nav-drawer-nav" style={{ display: 'grid', gap: 6, padding: '0 var(--space-4)' }}>
          {nav.map((it) => {
            const Icon = it.icon as any;
            const active = pathname === it.href || pathname?.startsWith(it.href + '/');
            return (
              <button
                key={it.href}
                className={`navItem ${active ? 'navItemActive' : ''}`}
                onClick={() => handleNavClick(it.href)}
                style={{ width: '100%' }}
              >
                <Icon className="navIcon" />
                <span>{it.label}</span>
                {typeof it.badge === 'number' && it.badge > 0 && (
                  <span className="navItemBadge badgeNumber">{it.badge}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div style={{ flexShrink: 0, padding: 'var(--space-4)', paddingTop: 'var(--space-2)' }}>
          <button
            className="navItem"
            style={{ width: '100%' }}
            onClick={async () => {
              await signOutEverywhere({ timeoutMs: 2500 });
              router.push('/sign-in');
            }}
          >
            <LogOut className="navIcon" />
            <span>Sign out</span>
          </button>
          <div className="brandPill" style={{ marginTop: 'var(--space-2)', width: '100%', textAlign: 'center' }}>
            Powered by EduDash Pro
          </div>
        </div>
      </div>
    </>
  );
}
