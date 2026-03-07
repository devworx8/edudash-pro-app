'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { Bell, CheckCheck, Trash2, AlertCircle, Info, CheckCircle, XCircle, MessageCircle } from 'lucide-react';
import { getMessageDisplayText } from '@/lib/messaging/messageContent';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'message';
  is_read: boolean;
  created_at: string;
  action_url?: string;
  metadata?: any;
}

export default function TeacherNotificationsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  
  const { profile } = useUserProfile(userId || undefined);
  const { slug: tenantSlug } = useTenantSlug(userId || undefined);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/sign-in');
        return;
      }
      setUserId(user.id);
      await loadNotifications(user.id);
    };
    init();
  }, [supabase, router]);

  const loadNotifications = async (uid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data);
    }
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    if (!userId) return;
    
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllAsRead = async () => {
    if (!userId) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const deleteNotification = async (id: string) => {
    if (!userId) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to delete notification:', error);
      return;
    }

    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="icon20" style={{ color: 'var(--success)' }} />;
      case 'warning':
        return <AlertCircle className="icon20" style={{ color: 'var(--warning)' }} />;
      case 'error':
        return <XCircle className="icon20" style={{ color: 'var(--danger)' }} />;
      case 'message':
        return <MessageCircle className="icon20" style={{ color: 'var(--primary)' }} />;
      default:
        return <Info className="icon20" style={{ color: 'var(--primary)' }} />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <TeacherShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
      preschoolId={profile?.preschoolId}
      userId={userId || undefined}
    >
      <div className="section">
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="h1">Notifications</h1>
            <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'No unread notifications'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button className="btn btnSecondary" onClick={markAllAsRead}>
              <CheckCheck className="icon16" />
              Mark all as read
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ margin: '0 auto' }}></div>
            <p style={{ color: 'var(--textLight)', marginTop: 16 }}>Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <Bell className="icon48" style={{ margin: '0 auto', color: 'var(--textLight)' }} />
            <h3 style={{ marginTop: 16 }}>No notifications</h3>
            <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
              You're all caught up! We'll notify you here when there's something new.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="card"
                style={{
                  padding: 16,
                  cursor: notification.action_url ? 'pointer' : 'default',
                  backgroundColor: notification.is_read ? 'var(--cardBg)' : 'rgba(var(--primaryRgb), 0.05)',
                  borderLeft: `4px solid ${
                    notification.type === 'success'
                      ? 'var(--success)'
                      : notification.type === 'warning'
                      ? 'var(--warning)'
                      : notification.type === 'error'
                      ? 'var(--danger)'
                      : notification.type === 'message'
                      ? '#8b5cf6'
                      : 'var(--primary)'
                  }`,
                }}
                onClick={() => {
                  if (!notification.is_read) markAsRead(notification.id);
                  if (notification.action_url) router.push(notification.action_url);
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div>{getIcon(notification.type)}</div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                      {notification.title}
                    </h4>
                    <p style={{ color: 'var(--textMuted)', fontSize: 14, lineHeight: 1.5 }}>
                      {getMessageDisplayText(notification.message)}
                    </p>
                    <p style={{ color: 'var(--textLight)', fontSize: 12, marginTop: 8 }}>
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    className="iconBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notification.id);
                    }}
                    aria-label="Delete notification"
                  >
                    <Trash2 className="icon16" style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
