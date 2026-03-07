'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import {
  Megaphone,
  Plus,
  Filter,
  Search,
  Edit2,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  Pin,
  Users,
  Calendar,
  Send,
  ChefHat,
} from 'lucide-react';
import { AnnouncementCard } from '@/components/announcements/AnnouncementCard';
import { CreateAnnouncementModal } from '@/components/announcements/CreateAnnouncementModal';
import { CreateWeeklyMenuModal } from '@/components/announcements/CreateWeeklyMenuModal';
import { ViewAnnouncementModal } from '@/components/announcements/ViewAnnouncementModal';
import { isWeeklyMenuBridgeEnabled } from '@/lib/services/schoolMenuFeatureFlags';

interface Announcement {
  id: string;
  preschool_id: string;
  title: string;
  content: string;
  author_id: string;
  target_audience: 'all' | 'teachers' | 'parents' | 'students';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_published: boolean;
  pinned: boolean;
  published_at: string | null;
  scheduled_for: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  view_count?: number;
}

type StatusFilter = 'all' | 'published' | 'scheduled' | 'drafts';
type PriorityFilter = 'all' | 'urgent' | 'high' | 'medium' | 'low';

export default function PrincipalAnnouncementsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWeeklyMenuModal, setShowWeeklyMenuModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const weeklyMenuBridgeEnabled = isWeeklyMenuBridgeEnabled();

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);

  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  // Initialize auth
  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      setUserId(session.user.id);
      setAuthLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  // Load announcements
  useEffect(() => {
    if (preschoolId && userId) {
      loadAnnouncements();
    }
  }, [preschoolId, userId]);

  const loadAnnouncements = async () => {
    if (!preschoolId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('preschool_id', preschoolId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Get view counts
      const announcementIds = data.map((a: any) => a.id);
      const { data: viewsData } = await supabase
        .from('announcement_views')
        .select('announcement_id')
        .in('announcement_id', announcementIds);

      const viewCounts = viewsData?.reduce((acc: Record<string, number>, view: any) => {
        acc[view.announcement_id] = (acc[view.announcement_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      setAnnouncements(data.map((a: any) => ({ ...a, view_count: viewCounts[a.id] || 0 })));
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (!error) {
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleTogglePin = async (announcement: Announcement) => {
    const { error } = await supabase
      .from('announcements')
      .update({ pinned: !announcement.pinned })
      .eq('id', announcement.id);

    if (!error) {
      await loadAnnouncements();
    }
  };

  const handlePublishNow = async (announcement: Announcement) => {
    const { error } = await supabase
      .from('announcements')
      .update({
        is_published: true,
        published_at: new Date().toISOString(),
        scheduled_for: null,
      })
      .eq('id', announcement.id);

    if (!error) {
      await loadAnnouncements();
    }
  };

  const filteredAnnouncements = announcements.filter(announcement => {
    // Status filter
    if (statusFilter === 'published' && !announcement.is_published) return false;
    if (statusFilter === 'drafts' && announcement.is_published) return false;
    if (statusFilter === 'scheduled' && (!announcement.scheduled_for || announcement.is_published)) return false;

    // Priority filter
    if (priorityFilter !== 'all' && announcement.priority !== priorityFilter) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        announcement.title.toLowerCase().includes(query) ||
        announcement.content.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const publishedCount = announcements.filter(a => a.is_published).length;
  const scheduledCount = announcements.filter(a => a.scheduled_for && !a.is_published).length;
  const draftsCount = announcements.filter(a => !a.is_published && !a.scheduled_for).length;

  if (authLoading || profileLoading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId}>
        <div className="section">
          <div className="spinner" />
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId}>
      <div className="section">
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Megaphone className="icon24" style={{ color: 'var(--primary)' }} />
                Announcements
              </h1>
              <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
                Communicate important updates to your school community
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {weeklyMenuBridgeEnabled && (
                <button
                  className="btn btnSecondary"
                  onClick={() => setShowWeeklyMenuModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <ChefHat className="icon18" />
                  Upload Weekly Menu
                </button>
              )}
              <button
                className="btn btnPrimary"
                onClick={() => {
                  setEditingAnnouncement(null);
                  setShowCreateModal(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Plus className="icon20" />
                New Announcement
              </button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
            <FilterTab
              active={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
              icon={<Filter className="icon16" />}
              label={`All (${announcements.length})`}
            />
            <FilterTab
              active={statusFilter === 'published'}
              onClick={() => setStatusFilter('published')}
              icon={<CheckCircle className="icon16" />}
              label={`Published (${publishedCount})`}
            />
            <FilterTab
              active={statusFilter === 'scheduled'}
              onClick={() => setStatusFilter('scheduled')}
              icon={<Clock className="icon16" />}
              label={`Scheduled (${scheduledCount})`}
            />
            <FilterTab
              active={statusFilter === 'drafts'}
              onClick={() => setStatusFilter('drafts')}
              icon={<Edit2 className="icon16" />}
              label={`Drafts (${draftsCount})`}
            />
          </div>

          {/* Search and Priority Filter */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search className="icon20" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--textMuted)' }} />
              <input
                type="text"
                placeholder="Search announcements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: 40,
                  paddingRight: 12,
                  paddingTop: 10,
                  paddingBottom: 10,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-1)',
                  fontSize: 14,
                }}
              />
            </div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-1)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              <option value="all">All Priorities</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">⚪ Low</option>
            </select>
          </div>
        </div>

        {/* Announcements List */}
        {loading ? (
          <div className="spinner" />
        ) : filteredAnnouncements.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Megaphone className="icon32" style={{ color: 'var(--textMuted)', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--textMuted)' }}>
              {searchQuery ? 'No announcements match your search' : 'No announcements yet'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredAnnouncements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                onEdit={() => {
                  setEditingAnnouncement(announcement);
                  setShowCreateModal(true);
                }}
                onDelete={() => handleDelete(announcement.id)}
                onTogglePin={() => handleTogglePin(announcement)}
                onPublishNow={() => handlePublishNow(announcement)}
                onView={() => setSelectedAnnouncement(announcement)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <CreateAnnouncementModal
          announcement={editingAnnouncement}
          preschoolId={preschoolId!}
          authorId={userId!}
          onClose={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
            loadAnnouncements();
          }}
        />
      )}

      {weeklyMenuBridgeEnabled && showWeeklyMenuModal && preschoolId && userId && (
        <CreateWeeklyMenuModal
          preschoolId={preschoolId}
          authorId={userId}
          onClose={() => setShowWeeklyMenuModal(false)}
          onPublished={() => {
            setShowWeeklyMenuModal(false);
            loadAnnouncements();
          }}
        />
      )}

      {/* View Details Modal */}
      {selectedAnnouncement && (
        <ViewAnnouncementModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}
    </PrincipalShell>
  );
}

// Filter Tab Component
function FilterTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: 'none',
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? 'white' : 'var(--text)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
        fontSize: 14,
        fontWeight: 500,
        transition: 'all 0.2s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
