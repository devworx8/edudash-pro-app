'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOutEverywhere } from '@/lib/auth/signOut';
import {
  LayoutDashboard,
  Users,
  Settings,
  BookMarked,
  Activity,
  DollarSign,
  TrendingUp,
  LogOut,
  Menu,
  X,
  ArrowLeft,
  Shield,
  Zap,
} from 'lucide-react';

interface SuperAdminShellProps {
  userEmail?: string;
  userName?: string;
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  hideRightSidebar?: boolean;
  /** Rendered in the topbar right group before the avatar (e.g. RegistrationNotifications) */
  topBarRight?: React.ReactNode;
}

export function SuperAdminShell({
  userEmail,
  userName,
  children,
  rightSidebar,
  hideRightSidebar = false,
  topBarRight,
}: SuperAdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const avatarLetter = useMemo(() => (userName?.[0] || userEmail?.[0] || 'S').toUpperCase(), [userName, userEmail]);

  const nav = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'User Management', icon: Users },
    { href: '/admin/registrations', label: 'Registrations', icon: Users },
    { href: '/admin/promotions', label: 'Promotions', icon: DollarSign },
    { href: '/admin/ai-config', label: 'AI Config', icon: Zap },
    { href: '/admin/caps-mapping', label: 'CAPS Mapping', icon: BookMarked },
    { href: '/admin/ai-usage', label: 'AI Usage', icon: TrendingUp },
    { href: '/admin/monitoring', label: 'System Monitoring', icon: Activity },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ];
  
  // Check if we should show back button (not on dashboard home)
  const showBackButton = pathname !== '/admin';

  return (
    <div className="app">
      <header className="topbar" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)' }}>
        <div className="topbarRow topbarEdge">
          <div className="leftGroup">
            {/* Mobile menu button for navigation */}
            <button 
              className="iconBtn mobile-nav-btn" 
              aria-label="Menu" 
              onClick={() => setMobileNavOpen(true)}
              style={{ display: 'none', color: 'white' }}
            >
              <Menu className="icon20" />
            </button>
            
            {showBackButton && (
              <button className="iconBtn desktop-back-btn" aria-label="Back" onClick={() => router.back()} style={{ color: 'white' }}>
                <ArrowLeft className="icon20" />
              </button>
            )}
            <div className="chip" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              maxWidth: '280px',
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>🛡️</span>
              <span style={{ 
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 14
              }}>Super Admin</span>
            </div>
          </div>
          <div className="rightGroup" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            {topBarRight}
            <div className="avatar" style={{ 
              background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
              border: '2px solid white'
            }}>{avatarLetter}</div>
          </div>
        </div>
      </header>

      <div className={`frame ${hideRightSidebar ? 'frame-no-right' : ''}`}>
        <aside className="sidenav sticky" aria-label="Sidebar" style={{ borderRight: '1px solid #fecaca' }}>
          <div className="sidenavCol">
            <nav className="nav">
              {nav.map((it) => {
                const Icon = it.icon as any;
                const active = pathname === it.href || pathname?.startsWith(it.href + '/');
                return (
                  <Link 
                    key={it.href} 
                    href={it.href} 
                    className={`navItem ${active ? 'navItemActive' : ''}`} 
                    aria-current={active ? 'page' : undefined}
                    style={active ? {
                      background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(234, 88, 12, 0.1) 100%)',
                      borderLeft: '3px solid #dc2626',
                      color: '#dc2626'
                    } : {}}
                  >
                    <Icon className="navIcon" />
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="sidenavFooter">
              <button
                className="navItem"
                onClick={async () => {
                  await signOutEverywhere({ timeoutMs: 2500 });
                  router.push('/sign-in');
                }}
              >
                <LogOut className="navIcon" />
                <span>Sign out</span>
              </button>
              <div className="brandPill w-full text-center" style={{ 
                background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
                color: 'white'
              }}>Powered by Young Eagles</div>
            </div>
          </div>
        </aside>

        <main className="content">
          {children}
        </main>

        {rightSidebar && !hideRightSidebar && (
          <aside className="right sticky" aria-label="Activity">
            {rightSidebar}
          </aside>
        )}
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
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
            className="mobile-nav-overlay"
            onClick={() => setMobileNavOpen(false)}
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
              display: 'none',
              animation: 'slideInLeft 0.3s ease-out',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            className="mobile-nav-drawer mobile-nav-drawer-flex"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Super Admin Menu</h3>
              <button onClick={() => setMobileNavOpen(false)} className="iconBtn" aria-label="Close">
                <X className="icon20" />
              </button>
            </div>
            <nav className="nav mobile-nav-drawer-nav" style={{ display: 'grid', gap: 6, padding: '0 var(--space-4)' }}>
              {nav.map((it) => {
                const Icon = it.icon as any;
                const active = pathname === it.href || pathname?.startsWith(it.href + '/');
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`navItem ${active ? 'navItemActive' : ''}`}
                    onClick={() => setMobileNavOpen(false)}
                    style={active ? {
                      background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(234, 88, 12, 0.1) 100%)',
                      borderLeft: '3px solid #dc2626',
                      color: '#dc2626'
                    } : {}}
                  >
                    <Icon className="navIcon" />
                    <span>{it.label}</span>
                  </Link>
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
              <div className="brandPill" style={{
                marginTop: 'var(--space-2)',
                width: '100%',
                textAlign: 'center',
                background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
                color: 'white'
              }}>Powered by Young Eagles</div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        /* Adjust grid layout when right sidebar is hidden */
        .frame-no-right {
          grid-template-columns: 1fr !important;
        }
        @media (min-width: 1024px) {
          .frame-no-right {
            grid-template-columns: 260px minmax(0, 1fr) !important;
          }
        }
        @media (min-width: 1440px) {
          .frame-no-right {
            grid-template-columns: 280px minmax(0, 1fr) !important;
          }
        }

        @media (max-width: 1023px) {
          /* Show mobile navigation button */
          .mobile-nav-btn {
            display: grid !important;
          }
          /* Hide desktop back button on mobile, use hamburger instead */
          .desktop-back-btn {
            display: none !important;
          }
          /* Show overlays and drawers */
          .mobile-nav-overlay,
          .mobile-nav-drawer {
            display: block !important;
          }
          .mobile-nav-drawer-flex {
            display: flex !important;
          }
        }
        @keyframes slideInLeft {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
