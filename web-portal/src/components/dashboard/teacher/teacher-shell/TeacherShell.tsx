'use client';

/**
 * Teacher Shell - Refactored
 * Main layout component for teacher dashboard
 * Original: 487 lines → Refactored: ~120 lines
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PushNotificationPrompt } from '@/components/PushNotificationPrompt';
import { useBackButton } from '@/hooks/useBackButton';
import { TeacherTopBar } from './TeacherTopBar';
import { TeacherSideNav } from './TeacherSideNav';
import { TeacherMobileNav } from './TeacherMobileNav';
import { TeacherMobileWidgets } from './TeacherMobileWidgets';
import { getTeacherNavItems } from './navigationConfig';
import type { TeacherShellProps } from './types';

const COMPACT_BREAKPOINT = 1200;

export function TeacherShell({ 
  userEmail, 
  userName,
  preschoolName,
  userId,
  schoolType,
  unreadCount = 0, 
  children,
  rightSidebar,
  contentClassName,
  contentStyle,
  hideHeader = false,
}: TeacherShellProps) {
  const supabase = createClient();
  const avatarLetter = useMemo(() => (userName?.[0] || userEmail?.[0] || 'T').toUpperCase(), [userName, userEmail]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileWidgetsOpen, setMobileWidgetsOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  // Start false to match SSR; sync in useEffect to avoid hydration mismatch
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useBackButton({ fallbackRoute: '/dashboard/teacher', protectedRoutes: ['/dashboard/teacher'] });

  // Close mobile nav when viewport is desktop so the menu doesn't block the dashboard
  useEffect(() => {
    const syncViewportState = () => {
      if (typeof window === 'undefined') return;
      const compact = window.innerWidth < COMPACT_BREAKPOINT;
      setIsCompactViewport(compact);
      if (!compact) {
        setMobileNavOpen(false);
      }
    };
    syncViewportState();
    window.addEventListener('resize', syncViewportState);
    return () => window.removeEventListener('resize', syncViewportState);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const fetchNotificationCount = async () => {
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('is_read', false);
      setNotificationCount(count || 0);
    };
    fetchNotificationCount();
    const channel = supabase.channel(`teacher-notification-changes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => fetchNotificationCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase]);

  const activityCount = useMemo(() => unreadCount > 0 ? unreadCount : 0, [unreadCount]);
  const nav = getTeacherNavItems(unreadCount, schoolType || null);

  return (
    <div className={`app${mobileNavOpen ? ' mobile-nav-open' : ''}`}>
      {!hideHeader && (
        <TeacherTopBar
          preschoolName={preschoolName}
          avatarLetter={avatarLetter}
          notificationCount={notificationCount}
          activityCount={activityCount}
          hasRightSidebar={!!rightSidebar}
          onMenuClick={() => setMobileNavOpen((prev) => !prev)}
          onWidgetsClick={() => setMobileWidgetsOpen(true)}
        />
      )}

      <div className={`frame${isCompactViewport ? ' frame-no-sidebar' : ''}`}>
        <TeacherSideNav
          nav={nav}
          hidden={isCompactViewport}
          collapsed={sidebarCollapsed}
          hovered={sidebarHovered}
          onHoverStart={() => setSidebarHovered(true)}
          onHoverEnd={() => setSidebarHovered(false)}
        />
        <main className={`content ${contentClassName ?? ''}`} style={contentStyle}>{children}</main>
        {rightSidebar && <aside className="right sticky" aria-label="Activity">{rightSidebar}</aside>}
      </div>

      <TeacherMobileNav isOpen={mobileNavOpen} onClose={closeMobileNav} nav={nav} />
      {rightSidebar && (
        <TeacherMobileWidgets isOpen={mobileWidgetsOpen} onClose={() => setMobileWidgetsOpen(false)}>
          {rightSidebar}
        </TeacherMobileWidgets>
      )}

      <PushNotificationPrompt />

      <style jsx global>{`
        /* Desktop: ensure teacher sidebar fills height so nav can scroll */
        @media (min-width: 1024px) {
          .teacher-sidenav { align-self: stretch !important; }
        }
        .frame-no-sidebar { grid-template-columns: 1fr !important; }
        /* Hamburger: hidden by default (desktop), shown via media query - avoids hydration mismatch */
        .teacher-topbar .mobile-nav-btn { display: none; }
        @media (max-width: 1199px) {
          .teacher-sidenav { display: none !important; }
          .teacher-topbar .mobile-nav-btn { display: grid !important; }
          .desktop-back-btn { display: none !important; }
          .mobile-nav-overlay, .mobile-widgets-overlay { display: block !important; }
          .mobile-nav-drawer { display: flex !important; flex-direction: column; overflow: hidden; }
          .mobile-widgets-drawer { display: flex !important; }
          /* Single scrollbar: when hamburger menu is open, only the drawer nav scrolls */
          .app.mobile-nav-open .frame { overflow: hidden !important; }
          .mobile-nav-drawer-nav { scrollbar-width: thin; }
          .mobile-nav-drawer-nav::-webkit-scrollbar { width: 6px; }
          .mobile-nav-drawer-nav::-webkit-scrollbar-track { background: transparent; }
          .mobile-nav-drawer-nav::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        }
        @keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}
