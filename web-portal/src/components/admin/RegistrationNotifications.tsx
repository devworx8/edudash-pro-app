'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Bell, X, CheckCircle2, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'new_registration' | 'payment_received' | 'document_uploaded';
  registration_id: string;
  created_at: string;
  read: boolean;
}

export default function RegistrationNotifications() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Notification sound
  const playNotificationSound = useCallback(() => {
    if (soundEnabled && typeof Audio !== 'undefined') {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBze');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    }
  }, [soundEnabled]);

  // Show browser notification
  const showBrowserNotification = useCallback((title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'registration-notification',
      });
    }
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const edusiteproUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL || 'https://bppuzibjlxgfwrujzfsz.supabase.co';
      const edusiteproKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;

      const { createClient } = await import('@supabase/supabase-js');
      const edusiteproClient = createClient(edusiteproUrl, edusiteproKey!);

      // Get pending registrations count
      const { data, error } = await edusiteproClient
        .from('registration_requests')
        .select('id, student_first_name, student_last_name, created_at, status, organization_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const newNotifications: Notification[] = data?.map((reg: any) => ({
        id: reg.id,
        title: 'New Registration',
        message: `${reg.student_first_name} ${reg.student_last_name} has submitted a registration`,
        type: 'new_registration' as const,
        registration_id: reg.id,
        created_at: reg.created_at,
        read: false,
      })) || [];

      const previousCount = unreadCount;
      const newCount = newNotifications.length;

      setNotifications(newNotifications);
      setUnreadCount(newCount);

      // If there are new notifications, play sound and show browser notification
      if (newCount > previousCount) {
        playNotificationSound();
        showBrowserNotification(
          'New Registration!',
          `${newCount - previousCount} new registration(s) pending approval`
        );
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [unreadCount, playNotificationSound, showBrowserNotification]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Poll for new notifications
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return (
    <>
      {/* Bell Icon Button */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notifications Dropdown */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-50 max-h-[600px] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Registrations ({unreadCount})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-1 rounded ${soundEnabled ? 'text-green-600' : 'text-gray-400'}`}
                  title="Toggle sound"
                >
                  <Bell className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">All caught up!</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                    No pending registrations
                  </p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <a
                    key={notif.id}
                    href={`/admin/registrations?id=${notif.registration_id}`}
                    className="block p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <Clock className="w-5 h-5 text-yellow-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {notif.title}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {notif.message}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {new Date(notif.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </a>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <Link
                  href="/admin/registrations"
                  className="block text-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  View All Registrations →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
