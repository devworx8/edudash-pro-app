'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOutEverywhere } from '@/lib/auth/signOut';
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Users,
  Building2,
  LogOut,
  Menu,
  X,
  ArrowLeft,
  Settings,
  FileText,
  TrendingUp,
  CheckCircle,
} from 'lucide-react';

interface TertiaryShellProps {
  tenantSlug?: string;
  organizationName?: string;
  userEmail?: string;
  userName?: string;
  userRole?: 'admin' | 'instructor';
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  hideRightSidebar?: boolean;
}

export function TertiaryShell({
  tenantSlug,
  organizationName,
  userEmail,
  userName,
  userRole = 'admin',
  children,
  rightSidebar,
  hideRightSidebar = false,
}: TertiaryShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const avatarLetter = useMemo(() => (userName?.[0] || userEmail?.[0] || 'U').toUpperCase(), [userName, userEmail]);

  const nav = userRole === 'admin' 
    ? [
        { href: '/dashboard/admin-tertiary', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/admin-tertiary/courses', label: 'Courses', icon: BookOpen },
        { href: '/dashboard/admin-tertiary/instructors', label: 'Instructors', icon: GraduationCap },
        { href: '/dashboard/admin-tertiary/students', label: 'Students', icon: Users },
        { href: '/dashboard/admin-tertiary/centers', label: 'Training Centers', icon: Building2 },
        { href: '/dashboard/admin-tertiary/reports', label: 'Reports', icon: TrendingUp },
        { href: '/dashboard/admin-tertiary/settings', label: 'Settings', icon: Settings },
      ]
    : [
        { href: '/dashboard/instructor', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/instructor/courses', label: 'My Courses', icon: BookOpen },
        { href: '/dashboard/instructor/assignments', label: 'Assignments', icon: FileText },
        { href: '/dashboard/instructor/grading', label: 'Grading', icon: CheckCircle },
        { href: '/dashboard/instructor/students', label: 'Students', icon: Users },
        { href: '/dashboard/instructor/settings', label: 'Settings', icon: Settings },
      ];

  const orgName = userRole === 'admin' ? 'Tertiary Admin' : 'Instructor Portal';
  
  // Check if we should show back button (not on dashboard home)
  const dashboardHome = userRole === 'admin' ? '/dashboard/admin-tertiary' : '/dashboard/instructor';
  const showBackButton = pathname !== dashboardHome;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbarRow topbarEdge">
          <div className="leftGroup">
            {/* Mobile menu button for navigation */}
            <button 
              className="iconBtn mobile-nav-btn" 
              aria-label="Menu" 
              onClick={() => setMobileNavOpen(true)}
              style={{ display: 'none' }}
            >
              <Menu className="icon20" />
            </button>
            
            {showBackButton && (
              <button className="iconBtn desktop-back-btn" aria-label="Back" onClick={() => router.back()}>
                <ArrowLeft className="icon20" />
              </button>
            )}
            {organizationName ? (
              <div className="chip" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6,
                maxWidth: '280px',
                overflow: 'hidden'
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>
                  {userRole === 'admin' ? '🎓' : '📚'}
                </span>
                <span style={{ 
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 14
                }}>{organizationName}</span>
              </div>
            ) : (
              <div className="chip">{tenantSlug ? `/${tenantSlug}` : orgName}</div>
            )}
          </div>
          <div className="rightGroup" style={{ marginLeft: 'auto' }}>
            <div className="avatar">{avatarLetter}</div>
          </div>
        </div>
      </header>

      <div className={`frame ${hideRightSidebar ? 'frame-no-right' : ''}`}>
        <aside className="sidenav sticky" aria-label="Sidebar">
          <div className="sidenavCol">
            <nav className="nav">
              {nav.map((it) => {
                const Icon = it.icon as any;
                const active = pathname === it.href || pathname?.startsWith(it.href + '/');
                return (
                  <Link key={it.href} href={it.href} className={`navItem ${active ? 'navItemActive' : ''}`} aria-current={active ? 'page' : undefined}>
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
              <div className="brandPill w-full text-center">Powered by Young Eagles</div>
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
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Menu</h3>
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
              <div className="brandPill" style={{ marginTop: 'var(--space-2)', width: '100%', textAlign: 'center' }}>Powered by Young Eagles</div>
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
