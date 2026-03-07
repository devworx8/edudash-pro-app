'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { Megaphone, AlertCircle, Clock, User, Filter } from 'lucide-react';

interface Announcement {
  id: string;
  preschool_id: string;
  title: string;
  content: string;
  author_id: string;
  target_audience: 'all' | 'teachers' | 'parents' | 'students';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_published: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
  author?: {
    email: string;
    profile?: {
      first_name: string;
      last_name: string;
    };
  };
  preschool?: {
    name: string;
  };
}

type PriorityFilter = 'all' | 'urgent' | 'high' | 'medium' | 'low';

export default function AnnouncementsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/sign-in');
        return;
      }
      await loadAnnouncements(user.id);
    };
    init();
  }, []);

  const loadAnnouncements = async (userId: string) => {
    setLoading(true);

    // Get user's children to find their preschools (check parent_id AND guardian_id)
    const { data: children } = await supabase
      .from('students')
      .select('preschool_id')
      .or(`parent_id.eq.${userId},guardian_id.eq.${userId}`);

    if (!children || children.length === 0) {
      setLoading(false);
      return;
    }

    const preschoolIds = [...new Set(children.map((c: any) => c.preschool_id).filter(Boolean))];

    // Get announcements for these preschools
    const { data, error } = await supabase
      .from('announcements')
      .select(`
        *,
        preschool:preschools(name)
      `)
      .in('preschool_id', preschoolIds)
      .in('target_audience', ['all', 'parents'])
      .eq('is_published', true)
      .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
      .order('priority', { ascending: false })
      .order('published_at', { ascending: false });

    if (!error && data) {
      setAnnouncements(data as any);
    }
    setLoading(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'var(--danger)';
      case 'high':
        return 'var(--warning)';
      case 'medium':
        return 'var(--primary)';
      case 'low':
        return 'var(--textLight)';
      default:
        return 'var(--textMuted)';
    }
  };

  const getPriorityLabel = (priority: string) => {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  };

  const filteredAnnouncements = announcements.filter(announcement => {
    if (priorityFilter === 'all') return true;
    return announcement.priority === priorityFilter;
  });

  const urgentCount = announcements.filter(a => a.priority === 'urgent').length;
  const highCount = announcements.filter(a => a.priority === 'high').length;
  const mediumCount = announcements.filter(a => a.priority === 'medium').length;
  const lowCount = announcements.filter(a => a.priority === 'low').length;

  return (
    <ParentShell hideHeader={true}>
      <div className="section">
        <div style={{ marginBottom: 24 }}>
          <h1 className="h1">School Announcements</h1>
          <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
            Important updates and news from your child's school
          </p>
        </div>

        {/* Priority Filter Tabs */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          marginBottom: 24, 
          overflowX: 'auto', 
          paddingBottom: 8,
          borderBottom: '1px solid var(--border)'
        }}>
          <button
            onClick={() => setPriorityFilter('all')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: priorityFilter === 'all' ? 'var(--primary)' : 'transparent',
              color: priorityFilter === 'all' ? 'white' : 'var(--text)',
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
            All ({announcements.length})
          </button>
          {urgentCount > 0 && (
            <button
              onClick={() => setPriorityFilter('urgent')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: priorityFilter === 'urgent' ? 'var(--danger)' : 'transparent',
                color: priorityFilter === 'urgent' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <AlertCircle className="icon16" />
              Urgent ({urgentCount})
            </button>
          )}
          {highCount > 0 && (
            <button
              onClick={() => setPriorityFilter('high')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: priorityFilter === 'high' ? 'var(--warning)' : 'transparent',
                color: priorityFilter === 'high' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              High ({highCount})
            </button>
          )}
          {mediumCount > 0 && (
            <button
              onClick={() => setPriorityFilter('medium')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: priorityFilter === 'medium' ? 'var(--primary)' : 'transparent',
                color: priorityFilter === 'medium' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Medium ({mediumCount})
            </button>
          )}
          {lowCount > 0 && (
            <button
              onClick={() => setPriorityFilter('low')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: priorityFilter === 'low' ? 'var(--textLight)' : 'transparent',
                color: priorityFilter === 'low' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Low ({lowCount})
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ margin: '0 auto' }}></div>
            <p style={{ color: 'var(--textLight)', marginTop: 16 }}>Loading announcements...</p>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <Megaphone className="icon48" style={{ margin: '0 auto', color: 'var(--textLight)' }} />
            <h3 style={{ marginTop: 16 }}>No announcements</h3>
            <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
              {priorityFilter === 'all'
                ? 'There are no announcements from your school at this time.'
                : `No ${priorityFilter} priority announcements found.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredAnnouncements.map((announcement) => (
              <div
                key={announcement.id}
                className="card"
                style={{
                  padding: 20,
                  borderLeft: `4px solid ${getPriorityColor(announcement.priority)}`,
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor: getPriorityColor(announcement.priority),
                          color: 'white',
                        }}
                      >
                        {getPriorityLabel(announcement.priority)}
                      </span>
                      {announcement.preschool && (
                        <span style={{ color: 'var(--textLight)', fontSize: 14 }}>
                          {announcement.preschool.name}
                        </span>
                      )}
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>
                      {announcement.title}
                    </h3>
                  </div>
                  <Megaphone 
                    className="icon24" 
                    style={{ color: getPriorityColor(announcement.priority), flexShrink: 0 }} 
                  />
                </div>

                {/* Content */}
                <div style={{ marginBottom: 16 }}>
                  <p style={{ 
                    color: 'var(--text)', 
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {announcement.content}
                  </p>
                </div>

                {/* Footer */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  paddingTop: 16,
                  borderTop: '1px solid var(--border)',
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--textLight)', fontSize: 13 }}>
                    <Clock className="icon14" />
                    <span>
                      {new Date(announcement.published_at).toLocaleDateString('en-ZA', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  
                  {announcement.expires_at && (
                    <div style={{ color: 'var(--textLight)', fontSize: 13 }}>
                      Expires: {new Date(announcement.expires_at).toLocaleDateString('en-ZA')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ParentShell>
  );
}
