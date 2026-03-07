'use client';

import { useMemo, useState, useEffect, useTransition, useRef } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { signOutEverywhere } from '@/lib/auth/signOut';
import { getGradeNumber, isExamEligibleChild } from '@/lib/utils/gradeUtils';
import { calculateAgeOnDate } from '@/lib/utils/dateUtils';
import {
  MessageCircle,
  Users,
  LayoutDashboard,
  LogOut,
  Search,
  Bell,
  ArrowLeft,
  Settings,
  Menu,
  X,
  Sparkles,
  BookOpen,
  Clipboard,
  CreditCard,
  Megaphone,
  User,
  UserCircle2,
  ChevronDown,
  Phone,
  CheckCircle2,
  BarChart3,
  Camera,
  Rocket,
  GraduationCap,
  School,
  Newspaper,
  ChefHat,
  FileText,
  CalendarDays,
} from 'lucide-react';
import { usePendingHomework } from '@/lib/hooks/parent/usePendingHomework';
import { useChildrenData } from '@/lib/hooks/parent/useChildrenData';
import { PushNotificationPrompt } from '@/components/PushNotificationPrompt';
import { useBackButton } from '@/hooks/useBackButton';
import { badgeManager } from '@/lib/utils/notification-badge';

interface ParentShellProps {
  tenantSlug?: string;
  userEmail?: string;
  userName?: string;
  preschoolName?: string;
  unreadCount?: number;
  hasOrganization?: boolean;
  children: React.ReactNode;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  hideHeader?: boolean;
}

export function ParentShell({ tenantSlug, userEmail, userName, preschoolName, unreadCount = 0, hasOrganization: hasOrganizationProp, children, contentClassName, contentStyle, hideHeader = false }: ParentShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const supabase = createClient();
  const avatarLetter = useMemo(() => (userEmail?.[0] || 'U').toUpperCase(), [userEmail]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [hasOrganization, setHasOrganization] = useState(hasOrganizationProp || false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const { childrenCards, activeChildId } = useChildrenData(userId || undefined);
  const activeChild = useMemo(
    () => childrenCards.find((child) => child.id === activeChildId),
    [childrenCards, activeChildId]
  );
  const hasExamEligibleChild = useMemo(() => {
    if (!activeChild) return false;
    return isExamEligibleChild(activeChild.grade, activeChild.dateOfBirth);
  }, [activeChild]);
  const isPreschoolChild = useMemo(() => {
    if (!activeChild) return false;
    const gradeNumber = getGradeNumber(activeChild.grade);
    if (gradeNumber === 0) return true;
    if (!activeChild.dateOfBirth) return false;
    return calculateAgeOnDate(activeChild.dateOfBirth, new Date()) < 6;
  }, [activeChild]);
  
  // Get pending homework count
  const { count: homeworkCount } = usePendingHomework(userId || undefined);

  // Handle back button to prevent logout
  useBackButton({
    fallbackRoute: '/dashboard/parent',
    protectedRoutes: ['/dashboard/parent'],
  });

  // Show sidebar navigation for parent dashboard
  const showSidebar = true;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setShowProfileMenu(false);
    setMobileNavOpen(false);

    await signOutEverywhere({ timeoutMs: 2500 });

    router.replace('/sign-in');
    if (typeof window !== 'undefined') {
      window.location.href = '/sign-in';
    }
    setSigningOut(false);
  };

  // Close profile menu when clicking outside
  useEffect(() => {
    if (!showProfileMenu) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    
    // Add listener with a small delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);

  // Get user ID
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, [supabase]);

  // Fetch unread notification count
  useEffect(() => {
    if (!userId) return;

    const fetchNotificationCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      
      setNotificationCount(count || 0);
      
      // Update app badge with notification count
      badgeManager.setUnreadNotifications(count || 0);
    };

    fetchNotificationCount();

    // Subscribe to real-time notification changes
    const channel = supabase
      .channel('notification-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchNotificationCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  // Auto-detect if user has organization (if not explicitly provided)
  useEffect(() => {
    if (hasOrganizationProp !== undefined) {
      setHasOrganization(hasOrganizationProp);
      return;
    }

    // Fetch user's preschool_id to determine if they're organization-linked
    const checkOrganization = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('preschool_id, organization_id')
        .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
        .maybeSingle();

      setHasOrganization(!!profileData?.preschool_id || !!profileData?.organization_id);
    };

    checkOrganization();
  }, [supabase, hasOrganizationProp]);

  // Personalized navigation based on user type
  const nav = useMemo(() => {
    if (hasOrganization) {
      // Organization-linked parents see school-focused nav
      return [
        { href: '/dashboard/parent', label: t('dashboard.parent.nav.dashboard', { defaultValue: 'Dashboard' }), icon: LayoutDashboard },
        { href: '/dashboard/parent/announcements', label: t('dashboard.parent.nav.announcements', { defaultValue: 'Announcements' }), icon: Megaphone },
        { href: '/dashboard/parent/daily-program', label: t('dashboard.parent.nav.daily_program', { defaultValue: 'Daily Program' }), icon: CalendarDays },
        { href: '/dashboard/parent/calendar', label: t('dashboard.parent.nav.annual_calendar', { defaultValue: 'Annual Calendar' }), icon: CalendarDays },
        { href: '/dashboard/parent/menu', label: t('dashboard.parent.nav.menu_plan', { defaultValue: 'Menu' }), icon: ChefHat },
        { href: '/dashboard/parent/activities', label: t('dashboard.parent.nav.activities', { defaultValue: 'Activity Feed' }), icon: Newspaper },
        { href: '/dashboard/parent/messages', label: t('dashboard.parent.nav.messages', { defaultValue: 'Messages' }), icon: MessageCircle, badge: unreadCount },
        { href: '/dashboard/parent/calls', label: t('dashboard.parent.nav.calls', { defaultValue: 'Calls' }), icon: Phone },
        {
          href: '/dashboard/parent/homework',
          label: isPreschoolChild
            ? t('dashboard.parent.nav.take_home_activities', { defaultValue: 'Take-home Activities' })
            : t('dashboard.parent.nav.homework', { defaultValue: 'Homework' }),
          icon: Clipboard,
          badge: homeworkCount,
        },
        { href: '/dashboard/parent/stationery', label: t('dashboard.parent.nav.stationery', { defaultValue: 'Stationery' }), icon: FileText },
        { href: '/dashboard/parent/homework-history', label: t('dashboard.parent.nav.homework_history', { defaultValue: 'Homework History' }), icon: GraduationCap },
        { href: '/dashboard/parent/attendance', label: t('dashboard.parent.nav.attendance', { defaultValue: 'Attendance' }), icon: CheckCircle2 },
        { href: '/dashboard/parent/weekly-report', label: t('dashboard.parent.nav.weekly_report', { defaultValue: 'Weekly Report' }), icon: BarChart3 },
        { href: '/dashboard/parent/children', label: t('dashboard.parent.nav.my_children', { defaultValue: 'My Children' }), icon: Users },
        { href: '/dashboard/parent/picture-of-progress', label: t('dashboard.parent.nav.picture_of_progress', { defaultValue: 'Picture of Progress' }), icon: Camera },
        ...(hasExamEligibleChild && !isPreschoolChild
          ? [{ href: '/dashboard/parent/exam-prep', label: t('dashboard.parent.nav.exam_prep', { defaultValue: 'Exam Prep' }), icon: BookOpen }]
          : []),
        ...(isPreschoolChild ? [{ href: '/dashboard/parent/learning-hub', label: t('dashboard.parent.nav.learning_hub', { defaultValue: 'Learning Hub' }), icon: Rocket }] : []),
        { href: '/dashboard/parent/payments', label: t('dashboard.parent.nav.payments', { defaultValue: 'Payments' }), icon: CreditCard },
        { href: '/dashboard/parent/documents', label: t('dashboard.parent.nav.documents', { defaultValue: 'Documents' }), icon: FileText },
        { href: '/dashboard/parent/aftercare', label: t('dashboard.parent.nav.aftercare', { defaultValue: 'Aftercare Registration' }), icon: School },
        ...(!isPreschoolChild ? [{ href: '/dashboard/parent/robotics', label: t('dashboard.parent.nav.robotics', { defaultValue: 'Robotics' }), icon: Sparkles }] : []),
        { href: '/dashboard/parent/settings', label: t('dashboard.parent.nav.settings', { defaultValue: 'Settings' }), icon: Settings },
      ];
    } else {
      // Independent parents see learning-focused nav
      return [
        { href: '/dashboard/parent', label: t('dashboard.parent.nav.dashboard', { defaultValue: 'Dashboard' }), icon: LayoutDashboard },
        { href: '/dashboard/parent/messages?thread=dash-ai-assistant', label: t('dashboard.parent.nav.dash_ai', { defaultValue: 'Dash AI' }), icon: Sparkles },
        {
          href: '/dashboard/parent/homework',
          label: isPreschoolChild
            ? t('dashboard.parent.nav.take_home_activities', { defaultValue: 'Take-home Activities' })
            : t('dashboard.parent.nav.homework', { defaultValue: 'Homework' }),
          icon: Clipboard,
          badge: homeworkCount,
        },
        { href: '/dashboard/parent/homework-history', label: t('dashboard.parent.nav.homework_history', { defaultValue: 'Homework History' }), icon: GraduationCap },
        ...(hasExamEligibleChild && !isPreschoolChild
          ? [{ href: '/dashboard/parent/exam-prep', label: t('dashboard.parent.nav.exam_prep', { defaultValue: 'Exam Prep' }), icon: BookOpen }]
          : []),
        ...(isPreschoolChild ? [{ href: '/dashboard/parent/learning-hub', label: t('dashboard.parent.nav.learning_hub', { defaultValue: 'Learning Hub' }), icon: Rocket }] : []),
        ...(!isPreschoolChild ? [{ href: '/dashboard/parent/robotics', label: t('dashboard.parent.nav.robotics', { defaultValue: 'Robotics' }), icon: Sparkles }] : []),
        { href: '/dashboard/parent/children', label: t('dashboard.parent.nav.my_children', { defaultValue: 'My Children' }), icon: Users },
        { href: '/dashboard/parent/calls', label: t('dashboard.parent.nav.calls', { defaultValue: 'Calls' }), icon: Phone },
        { href: '/dashboard/parent/aftercare', label: t('dashboard.parent.nav.aftercare', { defaultValue: 'Aftercare Registration' }), icon: School },
        { href: '/dashboard/parent/settings', label: t('dashboard.parent.nav.settings', { defaultValue: 'Settings' }), icon: Settings },
      ];
    }
  }, [hasOrganization, hasExamEligibleChild, homeworkCount, isPreschoolChild, t, unreadCount]);

  return (
    <div className="app">
      {!hideHeader && (
        <header className="topbar">
          <div className="topbarRow topbarEdge">
            <div className="leftGroup">
              <button 
                className="iconBtn mobile-nav-btn" 
                aria-label={t('dashboard.parent.nav.menu', { defaultValue: 'Menu' })} 
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="icon20" />
              </button>
              
              {preschoolName ? (
                <div className="chip" style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '200px' }}>
                  <span style={{ fontSize: 16 }}>🦅</span>
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preschoolName}
                  </span>
                </div>
              ) : (
                <div className="chip" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('dashboard.parent.school_fallback', { defaultValue: 'Young Eagles' })}
                </div>
              )}
            </div>
            <div className="rightGroup" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="iconBtn"
                aria-label={t('dashboard.parent.nav.notifications', { defaultValue: 'Notifications' })}
                onClick={() => router.push('/dashboard/parent/notifications')}
                style={{ position: 'relative' }}
              >
                <Bell className="icon20" />
                {notificationCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      backgroundColor: 'var(--danger)',
                      color: 'white',
                      borderRadius: '50%',
                      width: 16,
                      height: 16,
                      fontSize: 10,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </button>
              <div ref={profileMenuRef} style={{ position: 'relative' }}>
                <button 
                  className="avatar" 
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  style={{ cursor: 'pointer', border: 'none', background: 'inherit' }}
                  aria-label={t('dashboard.parent.profile.menu', { defaultValue: 'Profile menu' })}
                >
                  {avatarLetter}
                </button>
                
                {/* Profile Dropdown Menu */}
                {showProfileMenu && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    minWidth: 200,
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                    zIndex: 1000,
                    overflow: 'hidden',
                  }}>
                    {/* User Info */}
                    <div style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {userName || t('roles.parent', { defaultValue: 'Parent' })}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {userEmail}
                      </div>
                    </div>

                    {/* Menu Items */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowProfileMenu(false);
                        router.push('/dashboard/parent/children');
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Users size={16} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {t('dashboard.parent.nav.my_children', { defaultValue: 'My Children' })}
                      </span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowProfileMenu(false);
                        router.push('/dashboard/parent/settings');
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Settings size={16} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {t('dashboard.parent.nav.settings', { defaultValue: 'Settings' })}
                      </span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowProfileMenu(false);
                        router.push('/dashboard/parent/settings/ringtones');
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Phone size={16} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {t('dashboard.parent.profile.ringtones', { defaultValue: 'Ringtones' })}
                      </span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSignOut();
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--danger-light, #fee2e2)';
                        e.currentTarget.style.color = 'var(--danger, #ef4444)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'inherit';
                      }}
                    >
                      <LogOut size={16} style={{ color: 'var(--danger, #ef4444)' }} />
                      <span style={{ fontSize: 14, fontWeight: 500 }}>
                        {t('dashboard.parent.profile.sign_out', { defaultValue: 'Sign Out' })}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      <div className="frame">
        {showSidebar && (
          <aside
            className="sidenav sticky"
            aria-label="Sidebar"
            style={{
              minHeight: 'calc(100dvh - var(--topnav-offset, 56px) - var(--space-6, 24px))',
              maxHeight: 'calc(100dvh - var(--topnav-offset, 56px) - var(--space-6, 24px))',
              overflow: 'hidden',
            }}
          >
            <div className="sidenavCol" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
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
              </div>
              <div className="sidenavFooter" style={{ flexShrink: 0 }}>
                <button
                  className="navItem"
                  onClick={handleSignOut}
                >
                  <LogOut className="navIcon" />
                  <span>{signingOut ? t('common.loading', { defaultValue: 'Loading...' }) : t('dashboard.parent.profile.sign_out', { defaultValue: 'Sign out' })}</span>
                </button>
                <div className="brandPill w-full text-center">{t('dashboard.parent.powered_by', { defaultValue: 'Powered by Young Eagles' })}</div>
              </div>
            </div>
          </aside>
        )}

        <main className={`content ${contentClassName ?? ''}`} style={contentStyle}>
          {children}
        </main>
      </div>

      {/* Mobile Navigation Drawer (Left Sidebar) */}
      {mobileNavOpen && (
        <>
          <div 
            className="mobile-nav-overlay"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="mobile-nav-drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t('dashboard.parent.nav.menu', { defaultValue: 'Menu' })}</h3>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="iconBtn"
                aria-label={t('common.close', { defaultValue: 'Close' })}
              >
                <X className="icon20" />
              </button>
            </div>
            {/* Scrollable nav so all options are visible */}
            <nav className="nav mobile-nav-drawer-nav" style={{ display: 'grid', gap: 6, padding: '0 var(--space-4)' }}>
              {nav.map((it) => {
                const Icon = it.icon as any;
                const active = pathname === it.href || pathname?.startsWith(it.href + '/');
                return (
                  <button
                    key={it.href}
                    className={`navItem ${active ? 'navItemActive' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMobileNavOpen(false);
                      requestAnimationFrame(() => router.push(it.href));
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
                onClick={handleSignOut}
              >
                <LogOut className="navIcon" />
                <span>{signingOut ? t('common.loading', { defaultValue: 'Loading...' }) : t('dashboard.parent.profile.sign_out', { defaultValue: 'Sign out' })}</span>
              </button>
              <div className="brandPill" style={{ marginTop: 'var(--space-2)', width: '100%', textAlign: 'center' }}>
                {t('dashboard.parent.powered_by', { defaultValue: 'Powered by Young Eagles' })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Push Notification Prompt */}
      <PushNotificationPrompt />

      <style jsx global>{`
        /* Mobile nav button - hidden by default on desktop */
        .mobile-nav-btn {
          display: none;
        }
        
        /* Mobile overlay - visible when rendered */
        .mobile-nav-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          z-index: 9998;
        }
        
        /* Mobile drawer - flex so nav scrolls and all options visible */
        .mobile-nav-drawer {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: 80%;
          max-width: 320px;
          background: var(--surface-1);
          z-index: 9999;
          padding: 0;
          animation: slideInLeft 0.3s ease-out;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .mobile-nav-drawer .mobile-nav-drawer-nav {
          flex: 1 1 0;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
        
        @media (max-width: 1023px) {
          /* Show mobile navigation button on mobile */
          .mobile-nav-btn {
            display: grid !important;
          }
          /* Hide desktop back button on mobile, use hamburger instead */
          .desktop-back-btn {
            display: none !important;
          }
        }
        
        /* Full width layout when sidebar is hidden */
        .frame-no-sidebar {
          grid-template-columns: 1fr !important;
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
