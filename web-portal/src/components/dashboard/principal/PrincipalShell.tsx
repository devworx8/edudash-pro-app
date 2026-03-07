'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOutEverywhere } from '@/lib/auth/signOut';
import { useBackButton } from '@/hooks/useBackButton';
import {
  MessageCircle,
  Users,
  LayoutDashboard,
  LogOut,
  Search,
  Bell,
  ArrowLeft,
  Settings,
  DollarSign,
  FileText,
  UserPlus,
  School,
  Menu,
  X,
  Activity,
  BookMarked,
  Megaphone,
  Calendar as CalendarIcon,
  Clock, // For aftercare
  Shirt,
  ShieldCheck,
  Wallet,
  ChefHat,
  ClipboardList,
} from 'lucide-react';
import { TierBadge } from '@/components/ui/TierBadge';

interface PrincipalShellProps {
  tenantSlug?: string;
  userEmail?: string;
  userName?: string;
  preschoolName?: string;
  preschoolId?: string;
  unreadCount?: number;
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  hideRightSidebar?: boolean; // Hide right sidebar on specific pages
  onOpenDashAI?: () => void; // Callback for opening Dash AI fullscreen on mobile
  contentStyle?: React.CSSProperties;
}

export function PrincipalShell({ 
  tenantSlug, 
  userEmail, 
  userName,
  preschoolName,
  preschoolId,
  unreadCount = 0, 
  children,
  rightSidebar,
  hideRightSidebar = false,
  onOpenDashAI,
  contentStyle
}: PrincipalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileWidgetsOpen, setMobileWidgetsOpen] = useState(false);
  const avatarLetter = useMemo(() => (userName?.[0] || userEmail?.[0] || 'P').toUpperCase(), [userName, userEmail]);
  
  // Prevent back button from logging out
  useBackButton({
    fallbackRoute: '/dashboard/principal',
    protectedRoutes: ['/dashboard/principal'],
  });
  
  // Count pending notifications/activity
  const activityCount = useMemo(() => {
    // TODO: Calculate from actual widgets (child registrations, parent approvals, etc.)
    // For now, show badge if rightSidebar exists
    return unreadCount > 0 ? unreadCount : 0;
  }, [unreadCount]);

  // EduDash Pro Community School ID (aftercare program)
  const COMMUNITY_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
  const isAftercareDashboard = preschoolId === COMMUNITY_SCHOOL_ID;

  // Base navigation items
  const baseNav = [
    { href: '/dashboard/principal', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/principal/students', label: 'Students', icon: Users },
    { href: '/dashboard/principal/learner-activity-control', label: 'Learner Activity', icon: Activity },
    { href: '/dashboard/principal/teachers', label: 'Teachers', icon: School },
    { href: '/dashboard/principal/registrations', label: 'Registrations', icon: UserPlus },
    { href: '/dashboard/principal/join-requests', label: 'Join Requests', icon: ShieldCheck },
    { href: '/dashboard/principal/uniforms', label: 'Uniforms', icon: Shirt },
    { href: '/dashboard/principal/stationery', label: 'Stationery', icon: ClipboardList },
    { href: '/dashboard/principal/campaigns', label: 'Campaigns', icon: Activity },
    { href: '/dashboard/principal/calendar', label: 'Calendar', icon: CalendarIcon },
    { href: '/dashboard/principal/announcements', label: 'Announcements', icon: Megaphone },
    { href: '/dashboard/principal/menu', label: 'Weekly Menu', icon: ChefHat },
    { href: '/dashboard/principal/financials', label: 'Financials', icon: DollarSign },
    { href: '/dashboard/principal/teacher-payroll', label: 'Teacher Payroll', icon: Wallet },
    { href: '/dashboard/principal/budget-overview', label: 'Budget', icon: DollarSign },
    { href: '/dashboard/principal/timetable', label: 'Timetable', icon: Clock },
    { href: '/dashboard/principal/staff-leave', label: 'Staff Leave', icon: CalendarIcon },
    { href: '/dashboard/principal/waitlist', label: 'Waitlist', icon: ClipboardList },
    { href: '/dashboard/principal/compliance', label: 'Compliance', icon: ShieldCheck },
    { href: '/dashboard/principal/reports', label: 'Reports', icon: FileText },
    { href: '/dashboard/principal/messages', label: 'Messages', icon: MessageCircle, badge: unreadCount },
    { href: '/admin/caps-mapping', label: 'CAPS Mapping', icon: BookMarked },
    { href: '/dashboard/principal/settings', label: 'Settings', icon: Settings },
  ];

  // Add Aftercare link for EduDash Pro Community School
  const nav = isAftercareDashboard 
    ? [
        { href: '/dashboard/principal', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/admin/aftercare', label: 'Aftercare', icon: Clock }, // Primary for this school
        { href: '/dashboard/principal/students', label: 'Students', icon: Users },
        { href: '/dashboard/principal/calendar', label: 'Calendar', icon: CalendarIcon },
        { href: '/dashboard/principal/stationery', label: 'Stationery', icon: ClipboardList },
        { href: '/dashboard/principal/announcements', label: 'Announcements', icon: Megaphone },
        { href: '/dashboard/principal/menu', label: 'Weekly Menu', icon: ChefHat },
        { href: '/dashboard/principal/financials', label: 'Financials', icon: DollarSign },
        { href: '/dashboard/principal/messages', label: 'Messages', icon: MessageCircle, badge: unreadCount },
        { href: '/dashboard/principal/settings', label: 'Settings', icon: Settings },
      ]
    : baseNav;

  // Check if we should show back button (not on dashboard home)
  const showBackButton = pathname !== '/dashboard/principal';

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
            {preschoolName ? (
              <div className="chip" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6,
                maxWidth: '280px',
                overflow: 'hidden'
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🏫</span>
                <span style={{ 
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 14
                }}>{preschoolName.replace('Young Eagles ', '').replace('EduDash Pro ', '')}</span>
              </div>
            ) : (
              <div className="chip">{tenantSlug ? `/${tenantSlug}` : 'Young Eagles'}</div>
            )}
          </div>
          <div className="rightGroup" style={{ marginLeft: 'auto' }}>
            {rightSidebar && !hideRightSidebar && (
              <button 
                className="iconBtn" 
                aria-label="Activity" 
                onClick={() => setMobileWidgetsOpen(true)}
                style={{ position: 'relative' }}
              >
                <Activity className="icon20" />
                {activityCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    background: '#dc2626',
                    borderRadius: '50%',
                    border: '2px solid var(--surface-1)',
                  }} />
                )}
              </button>
            )}
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
                    {typeof it.badge === 'number' && it.badge > 0 && (
                      <span className="navItemBadge badgeNumber">{it.badge}</span>
                    )}
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
              <div className="brandPill w-full text-center">Powered by EduDash Pro</div>
            </div>
          </div>
        </aside>

        <main className="content" style={contentStyle}>
          {children}
        </main>

        {rightSidebar && !hideRightSidebar && (
          <aside className="right sticky" aria-label="Activity">
            {rightSidebar}
          </aside>
        )}
      </div>

      {/* Mobile Navigation Drawer (Left Sidebar) */}
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
              <button
                onClick={() => setMobileNavOpen(false)}
                className="iconBtn"
                aria-label="Close"
              >
                <X className="icon20" />
              </button>
            </div>
            {/* Scrollable nav so all options are visible */}
            <nav className="nav mobile-nav-drawer-nav" style={{ display: 'grid', gap: 6, overflowY: 'auto', overflowX: 'hidden', flex: '1 1 0', minHeight: 0, padding: '0 var(--space-4)' }}>
              {nav.map((it) => {
                const Icon = it.icon as any;
                const active = pathname === it.href || pathname?.startsWith(it.href + '/');
                return (
                  <button
                    key={it.href}
                    className={`navItem ${active ? 'navItemActive' : ''}`}
                    onClick={() => {
                      setMobileNavOpen(false);
                      setTimeout(() => {
                        router.push(it.href);
                      }, 100);
                    }}
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
              <div className="brandPill" style={{ marginTop: 'var(--space-2)', width: '100%', textAlign: 'center' }}>Powered by EduDash Pro</div>
            </div>
          </div>
        </>
      )}

      {/* Mobile Widgets Drawer (Right Sidebar) */}
      {rightSidebar && !hideRightSidebar && mobileWidgetsOpen && (
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
            onClick={() => setMobileWidgetsOpen(false)}
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
            {/* Sticky Header */}
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
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Notifications, requests, and recent activity</p>
              </div>
              <button 
                onClick={() => setMobileWidgetsOpen(false)}
                className="iconBtn"
                aria-label="Close"
              >
                <X className="icon20" />
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: 'var(--space-4)',
              WebkitOverflowScrolling: 'touch',
            }}>
              {rightSidebar}
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
          .mobile-nav-drawer,
          .mobile-widgets-overlay {
            display: block !important;
          }
          .mobile-nav-drawer-flex {
            display: flex !important;
            flex-direction: column;
            overflow: hidden;
          }
          .mobile-nav-drawer-nav {
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
          }
          /* Mobile widgets drawer needs flex for sticky header */
          .mobile-widgets-drawer {
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
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
