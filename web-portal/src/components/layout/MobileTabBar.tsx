'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Calendar,
  DollarSign,
  Settings,
  Gift,
} from 'lucide-react';

interface MobileTabBarProps {
  userRole?: 'parent' | 'teacher' | 'principal' | 'superadmin' | string;
}

export function MobileTabBar({ userRole = 'parent' }: MobileTabBarProps) {
  const pathname = usePathname();

  const items = [
    { href: `/dashboard/${userRole}`, label: 'Home', icon: LayoutDashboard },
    { href: `/dashboard/${userRole}/messages`, label: 'Messages', icon: MessageSquare },
    { href: `/dashboard/${userRole}/calendar`, label: 'Calendar', icon: Calendar },
    ...(userRole === 'parent'
      ? [{ href: `/dashboard/${userRole}/birthday-chart`, label: 'Birthdays', icon: Gift }]
      : []),
    { href: `/dashboard/${userRole}/payments`, label: 'Fees', icon: DollarSign },
    { href: `/dashboard/${userRole}/settings`, label: 'Settings', icon: Settings },
  ];

  const gridClass = items.length === 6 ? 'grid-cols-6' : 'grid-cols-5';

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-700/60 bg-slate-900/90 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60"
      aria-label="Primary"
    >
      <div className="mx-auto max-w-screen-sm">
        <ul className={`grid ${gridClass} gap-1 px-2 py-2`}>
          {items.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold transition-all ${
                    active
                      ? 'text-blue-400 bg-slate-800/60 border border-slate-700/60'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/40 border border-transparent'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={`w-5 h-5 ${active ? '' : 'opacity-90'}`} />
                  <span className="leading-none">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
