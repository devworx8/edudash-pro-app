'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Users, 
  Settings,
  ChevronLeft,
  Gift,
  GraduationCap,
  LogOut,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { signOutEverywhere } from '@/lib/auth/signOut';

interface SideNavProps {
  userRole?: string;
  preschoolName?: string;
}

export function SideNav({ userRole = 'parent', preschoolName = 'Young Eagles' }: SideNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setMobileOpen((v) => !v);
    window.addEventListener('edudash:toggle-sidenav', handler as any);
    return () => window.removeEventListener('edudash:toggle-sidenav', handler as any);
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutEverywhere({ timeoutMs: 2500 });
    router.push('/sign-in');
  };

  const menuItems = [
    {
      icon: LayoutDashboard,
      label: 'Dashboard',
      href: `/dashboard/${userRole}`,
      active: pathname === `/dashboard/${userRole}`,
    },
    {
      icon: MessageSquare,
      label: 'Messages',
      href: `/dashboard/${userRole}/messages`,
      active: pathname?.includes('/messages'),
    },
    {
      icon: Users,
      label: 'My Children',
      href: `/dashboard/${userRole}/children`,
      active: pathname?.includes('/children'),
    },
    ...(userRole === 'parent'
      ? [{
          icon: Gift,
          label: 'Birthdays',
          href: `/dashboard/${userRole}/birthday-chart`,
          active: pathname?.includes('/birthday-chart'),
        }]
      : []),
    // Admin-only: CAPS Mapping quick access
    ...(['teacher', 'principal', 'superadmin'].includes(String(userRole))
      ? [{
          icon: GraduationCap,
          label: 'CAPS Mapping',
          href: '/admin/caps-mapping',
          active: pathname?.startsWith('/admin/caps-mapping')
        }]
      : []),
    {
      icon: Settings,
      label: 'Settings',
      href: `/dashboard/${userRole}/settings`,
      active: pathname?.includes('/settings'),
    },
  ];

  return (
    <>
      {/* Desktop / Tablet sidebar */}
      <div
        className={`hidden md:flex bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-r border-slate-700/60 flex-col transition-all duration-300 flex-shrink-0 shadow-2xl ${
          collapsed ? 'w-20' : 'w-72'
        }`}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-700/60 flex items-center justify-end">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2.5 hover:bg-slate-800/60 rounded-xl transition-all duration-200 hover:scale-105 backdrop-blur-sm border border-slate-700/40"
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <ChevronLeft
              className={`w-5 h-5 text-slate-300 transition-transform duration-200 ${
                collapsed ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* School Name */}
        {!collapsed && (
          <div className="px-6 py-12 border-b border-slate-700/60">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ring-2 ring-purple-500/30 text-2xl">
                🦅
              </div>
              <div className="overflow-hidden">
                <div className="text-base font-bold text-white truncate leading-tight">
                  {preschoolName}
                </div>
                <div className="text-sm text-purple-400 capitalize font-semibold">{userRole}</div>
              </div>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="px-4 py-6 border-b border-slate-700/60 flex justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg text-xl">
              🦅
            </div>
          </div>
        )}

        {/* Menu Items */}
        <nav className={`flex-1 pr-4 py-6 overflow-y-auto ${collapsed ? 'pl-6' : 'pl-14'} space-y-4`}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 py-4 rounded-xl transition-all duration-200 group ${
                  item.active
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white hover:shadow-md border border-transparent hover:border-slate-700/40'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`${collapsed ? 'w-6 h-6' : 'w-5 h-5'} flex-shrink-0 transition-all duration-200 ${
                  item.active ? '' : 'group-hover:scale-110'
                }`} />
                {!collapsed && (
                  <span className="font-semibold text-sm truncate">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-5 border-t border-slate-700/60">
          {!collapsed && (
            <div className="text-xs text-slate-500 text-center mb-4 font-medium">
              Powered by Young Eagles
            </div>
          )}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 text-red-400 hover:bg-red-900/30 rounded-xl transition-all duration-200 disabled:opacity-50 border border-transparent hover:border-red-800/40 group"
            title={collapsed ? 'Sign Out' : undefined}
          >
            <LogOut className={`${collapsed ? 'w-6 h-6' : 'w-5 h-5'} flex-shrink-0 group-hover:scale-110 transition-transform duration-200`} />
            {!collapsed && (
              <span className="text-sm truncate font-semibold">
                {signingOut ? 'Signing out...' : 'Sign Out'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-r border-slate-700/60 shadow-2xl rounded-r-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg text-xl">
                  🦅
                </div>
                <div>
                  <div className="text-sm font-bold text-white truncate max-w-[160px]">
                    {preschoolName}
                  </div>
                  <div className="text-xs text-purple-400 capitalize font-semibold">{userRole}</div>
                </div>
              </div>
              <button
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-800/60 text-slate-300 border border-slate-700/40 transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => { setMobileOpen(false); router.push(item.href); }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-200 ${
                      item.active
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent hover:border-slate-700/40'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-semibold text-sm truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="px-4 pb-5 pt-4 border-t border-slate-700/60">
              <button
                onClick={() => { setMobileOpen(false); handleSignOut(); }}
                disabled={signingOut}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-red-400 hover:bg-red-900/30 rounded-xl transition-all duration-200 disabled:opacity-50 border border-transparent hover:border-red-800/40"
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm truncate font-semibold">{signingOut ? 'Signing out...' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
