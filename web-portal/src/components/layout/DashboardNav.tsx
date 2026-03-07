'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOutEverywhere } from '@/lib/auth/signOut';
import { LogOut, User, Settings, Home, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardNavProps {
  userEmail?: string;
  userRole?: string;
  preschoolName?: string;
}

export function DashboardNav({ userEmail, userRole, preschoolName = 'Young Eagles' }: DashboardNavProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutEverywhere({ timeoutMs: 2500 });
    router.push('/sign-in');
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'parent':
        return 'bg-blue-600';
      case 'teacher':
        return 'bg-green-600';
      case 'principal':
        return 'bg-purple-600';
      case 'superadmin':
        return 'bg-red-600';
      default:
        return 'bg-gray-600';
    }
  };

  return (
    <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
      <div className="container mx-auto px-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Mobile menu toggle */}
          <div className="md:hidden mr-2">
            <button
              aria-label="Open menu"
              onClick={() => window.dispatchEvent(new CustomEvent('edudash:toggle-sidenav'))}
              className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center text-2xl">
              🦅
            </div>
            <span className="font-bold text-xl text-white">Young Eagles</span>
          </Link>

          {/* Center: Preschool Name */}
          <div className="hidden md:block text-center">
            <div className="text-sm font-semibold text-white">{preschoolName}</div>
            <div className="text-xs text-gray-400">Preschool</div>
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="text-left hidden md:block">
                <div className="text-sm font-medium text-white">
                  {userEmail?.split('@')[0] || 'User'}
                </div>
                {userRole && (
                  <div className="text-xs text-gray-400 capitalize">{userRole}</div>
                )}
              </div>
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {showMenu && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMenu(false)}
                  />
                  
                  {/* Menu */}
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50"
                  >
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-gray-700">
                      <div className="text-sm font-medium text-white truncate">
                        {userEmail}
                      </div>
                      {userRole && (
                        <div className="mt-1">
                          <span
                            className={`inline-block px-2 py-1 text-xs font-semibold text-white rounded ${getRoleBadgeColor(
                              userRole
                            )}`}
                          >
                            {userRole.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                      <Link
                        href="/"
                        className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                        onClick={() => setShowMenu(false)}
                      >
                        <Home className="w-4 h-4" />
                        <span className="text-sm">Home</span>
                      </Link>
                      
                      <button
                        className="w-full flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                        onClick={() => {
                          setShowMenu(false);
                          // TODO: Open settings modal
                        }}
                      >
                        <Settings className="w-4 h-4" />
                        <span className="text-sm">Settings</span>
                      </button>

                      <hr className="my-2 border-gray-700" />

                      <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm">
                          {signingOut ? 'Signing out...' : 'Sign Out'}
                        </span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </nav>
  );
}
