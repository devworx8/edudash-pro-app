'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { Bell, CheckCheck, Trash2, AlertCircle, Info, CheckCircle, XCircle, Filter, BookOpen, School, Settings } from 'lucide-react';
import { getMessageDisplayText } from '@/lib/messaging/messageContent';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  is_read: boolean;
  created_at: string;
  action_url?: string;
  metadata?: any;
}

type FilterType = 'all' | 'unread' | 'homework' | 'school' | 'system';

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

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
      default:
        return <Info className="icon20" style={{ color: 'var(--primary)' }} />;
    }
  };

  const getCategoryFromMetadata = (notification: Notification): FilterType => {
    const meta = notification.metadata;
    if (meta?.category) return meta.category;
    
    // Infer from title/message
    const text = `${notification.title} ${notification.message}`.toLowerCase();
    if (text.includes('homework') || text.includes('assignment')) return 'homework';
    if (text.includes('school') || text.includes('class') || text.includes('teacher')) return 'school';
    if (text.includes('system') || text.includes('account') || text.includes('setting')) return 'system';
    
    return 'all';
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !notification.is_read;
    
    const category = getCategoryFromMetadata(notification);
    return category === filter;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const homeworkCount = notifications.filter(n => getCategoryFromMetadata(n) === 'homework').length;
  const schoolCount = notifications.filter(n => getCategoryFromMetadata(n) === 'school').length;
  const systemCount = notifications.filter(n => getCategoryFromMetadata(n) === 'system').length;

  return (
    <ParentShell hideHeader={true}>
      <div className="section">
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
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

        {/* Filter Tabs */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          marginBottom: 24, 
          overflowX: 'auto', 
          paddingBottom: 8,
          borderBottom: '1px solid var(--border)'
        }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: filter === 'all' ? 'var(--primary)' : 'transparent',
              color: filter === 'all' ? 'white' : 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <Filter className="icon16" />
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: filter === 'unread' ? 'var(--primary)' : 'transparent',
              color: filter === 'unread' ? 'white' : 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <Bell className="icon16" />
            Unread ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('homework')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: filter === 'homework' ? 'var(--primary)' : 'transparent',
              color: filter === 'homework' ? 'white' : 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <BookOpen className="icon16" />
            Homework ({homeworkCount})
          </button>
          <button
            onClick={() => setFilter('school')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: filter === 'school' ? 'var(--primary)' : 'transparent',
              color: filter === 'school' ? 'white' : 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <School className="icon16" />
            School ({schoolCount})
          </button>
          <button
            onClick={() => setFilter('system')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: filter === 'system' ? 'var(--primary)' : 'transparent',
              color: filter === 'system' ? 'white' : 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <Settings className="icon16" />
            System ({systemCount})
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ margin: '0 auto' }}></div>
            <p style={{ color: 'var(--textLight)', marginTop: 16 }}>Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <Bell className="icon48" style={{ margin: '0 auto', color: 'var(--textLight)' }} />
            <h3 style={{ marginTop: 16 }}>No notifications</h3>
            <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
              {filter === 'all' 
                ? "You're all caught up! We'll notify you here when there's something new."
                : `No ${filter} notifications found.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredNotifications.map((notification) => (
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
    </ParentShell>
  );
}
