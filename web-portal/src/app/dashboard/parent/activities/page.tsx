'use client';

/**
 * Parent Activity Feed — Web page
 *
 * Full-page activity feed for parents on the web dashboard.
 * Reads from `student_activity_feed` with reactions and comments.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  GamepadIcon,
  Heart,
  MessageCircle,
  Music,
  Palette,
  Send,
  Star,
  Sun,
  Trophy,
  Utensils,
  Moon,
  Users,
  Sparkles,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  class_name?: string;
}

interface ActivityRow {
  id: string;
  preschool_id: string;
  class_id: string | null;
  student_id: string | null;
  teacher_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  media_urls: string[] | null;
  visibility: string | null;
  activity_at: string;
  duration_minutes: number | null;
  is_published: boolean;
  created_at: string;
  teacher?: { first_name: string; last_name: string } | null;
  student?: { first_name: string; last_name: string } | null;
  class?: { name: string } | null;
  activity_reactions?: { id: string; parent_id: string; emoji: string; created_at: string }[];
  activity_comments?: { id: string; parent_id: string; comment_text: string; is_approved: boolean; created_at: string; profiles?: { first_name: string; last_name: string } | null }[];
}

interface StudentWithClassRow {
  id: string;
  first_name: string;
  last_name: string;
  classes: { name: string } | { name: string }[] | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const ACTIVITY_META: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  learning: { icon: BookOpen, color: '#3B82F6', label: 'Learning' },
  play: { icon: GamepadIcon, color: '#10B981', label: 'Play' },
  meal: { icon: Utensils, color: '#EF4444', label: 'Meal' },
  rest: { icon: Moon, color: '#6366F1', label: 'Rest' },
  art: { icon: Palette, color: '#EC4899', label: 'Art' },
  music: { icon: Music, color: '#8B5CF6', label: 'Music' },
  story: { icon: BookOpen, color: '#0EA5E9', label: 'Story' },
  outdoor: { icon: Sun, color: '#F59E0B', label: 'Outdoor' },
  special: { icon: Star, color: '#F97316', label: 'Special' },
  milestone: { icon: Trophy, color: '#EAB308', label: 'Milestone' },
  social: { icon: Users, color: '#06B6D4', label: 'Social' },
};

const REACTION_EMOJIS = ['💝', '👏', '😍', '🎉', '💪', '🌟'];

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'learning', label: 'Learning' },
  { key: 'play', label: 'Play' },
  { key: 'meal', label: 'Meals' },
  { key: 'art', label: 'Art' },
  { key: 'outdoor', label: 'Outdoor' },
  { key: 'milestone', label: 'Milestones' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDateLabel(d: Date): string {
  const now = new Date();
  const today = toDateKey(now);
  const yesterday = toDateKey(new Date(now.getTime() - 86_400_000));
  const key = toDateKey(d);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function groupReactions(reactions: { emoji: string; parent_id: string }[]): { emoji: string; count: number; parentIds: string[] }[] {
  const map: Record<string, { count: number; parentIds: string[] }> = {};
  reactions.forEach((r) => {
    if (!map[r.emoji]) map[r.emoji] = { count: 0, parentIds: [] };
    map[r.emoji].count += 1;
    map[r.emoji].parentIds.push(r.parent_id);
  });
  return Object.entries(map)
    .map(([emoji, v]) => ({ emoji, ...v }))
    .sort((a, b) => b.count - a.count);
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ParentActivityFeedPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | undefined>();
  const [profileId, setProfileId] = useState<string | undefined>();
  const [email, setEmail] = useState('');
  const { slug } = useTenantSlug(userId);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [typeFilter, setTypeFilter] = useState('all');
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [showPicker, setShowPicker] = useState<string | null>(null);

  const dateKey = toDateKey(selectedDate);
  const isToday = dateKey === toDateKey(new Date());

  // ── Auth ──────────────────────────────────────
  useEffect(() => {
    let isActive = true;

    const loadAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!isActive || !data.user) return;
      setUserId(data.user.id);
      setEmail(data.user.email || '');
    };

    void loadAuthUser();
    return () => {
      isActive = false;
    };
  }, [supabase]);

  // ── Profile ID ────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    let isActive = true;
    const loadProfileId = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (!isActive) return;
      setProfileId(data?.id || userId);
    };

    void loadProfileId();
    return () => {
      isActive = false;
    };
  }, [userId, supabase]);

  // ── Children ──────────────────────────────────
  useEffect(() => {
    if (!profileId) return;

    let isActive = true;
    const loadChildren = async () => {
      const { data } = await supabase
        .from('students')
        .select('id, first_name, last_name, class_id, classes:class_id(name)')
        .eq('parent_id', profileId);

      if (!isActive) return;

      const rows = (data || []) as StudentWithClassRow[];
      const mapped = rows.map((student) => {
        const className = Array.isArray(student.classes)
          ? student.classes[0]?.name
          : student.classes?.name;

        return {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          class_name: className || undefined,
        };
      });

      setChildren(mapped);
      if (mapped.length > 0 && !selectedChild) {
        setSelectedChild(mapped[0].id);
      }
    };

    void loadChildren();
    return () => {
      isActive = false;
    };
  }, [profileId, supabase, selectedChild]);

  // ── Fetch activities ──────────────────────────
  const loadActivities = useCallback(async () => {
    if (!selectedChild) {
      setActivities([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const dayStart = `${dateKey}T00:00:00.000Z`;
    const dayEnd = `${dateKey}T23:59:59.999Z`;

    const { data, error } = await supabase
      .from('student_activity_feed')
      .select(`
        *,
        teacher:profiles!student_activity_feed_teacher_id_fkey(first_name, last_name),
        student:students!student_activity_feed_student_id_fkey(first_name, last_name),
        class:classes!student_activity_feed_class_id_fkey(name),
        activity_reactions(id, parent_id, emoji, created_at),
        activity_comments(id, parent_id, comment_text, is_approved, created_at, profiles:parent_id(first_name, last_name))
      `)
      .eq('student_id', selectedChild)
      .eq('is_published', true)
      .gte('activity_at', dayStart)
      .lte('activity_at', dayEnd)
      .order('activity_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[ActivityFeed] Error:', error);
      setActivities([]);
    } else {
      setActivities((data || []) as ActivityRow[]);
    }
    setLoading(false);
  }, [selectedChild, dateKey, supabase]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  // ── Real-time ─────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    const channel = supabase
      .channel(`web_activity_feed_${selectedChild}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_activity_feed', filter: `student_id=eq.${selectedChild}` }, () => void loadActivities())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_reactions' }, () => void loadActivities())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_comments' }, () => void loadActivities())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedChild, supabase, loadActivities]);

  // ── Filtered ──────────────────────────────────
  const filtered = useMemo(
    () => (typeFilter === 'all' ? activities : activities.filter((a) => a.activity_type === typeFilter)),
    [activities, typeFilter],
  );

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: activities.length };
    activities.forEach((a) => { c[a.activity_type] = (c[a.activity_type] || 0) + 1; });
    return c;
  }, [activities]);

  // ── Handlers ──────────────────────────────────
  const goDay = (offset: number) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + offset);
      if (next > new Date()) return new Date();
      return next;
    });
  };

  const handleReaction = async (activityId: string, emoji: string) => {
    if (!profileId) return;
    const { data: existing } = await supabase
      .from('activity_reactions')
      .select('id')
      .eq('activity_id', activityId)
      .eq('parent_id', profileId)
      .eq('emoji', emoji)
      .maybeSingle();

    if (existing) {
      await supabase.from('activity_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('activity_reactions').insert({ activity_id: activityId, parent_id: profileId, emoji });
    }
    setShowPicker(null);
    void loadActivities();
  };

  const handleComment = async (activityId: string) => {
    const text = commentTexts[activityId]?.trim();
    if (!text || !profileId) return;
    await supabase.from('activity_comments').insert({
      activity_id: activityId,
      parent_id: profileId,
      comment_text: text,
      is_approved: true,
    });
    setCommentTexts((p) => ({ ...p, [activityId]: '' }));
    void loadActivities();
  };

  const handleDeleteComment = async (commentId: string) => {
    await supabase.from('activity_comments').delete().eq('id', commentId);
    void loadActivities();
  };

  // ── Render ────────────────────────────────────

  const renderActivityCard = (activity: ActivityRow) => {
    const meta = ACTIVITY_META[activity.activity_type] || ACTIVITY_META.special || { icon: Activity, color: '#F97316', label: activity.activity_type };
    const Icon = meta.icon;
    const teacherName = activity.teacher ? `${activity.teacher.first_name || ''} ${activity.teacher.last_name || ''}`.trim() : '';
    const studentName = activity.student ? `${activity.student.first_name || ''} ${activity.student.last_name || ''}`.trim() : '';
    const mediaUrls = (activity.media_urls || []) as string[];
    const reactions = activity.activity_reactions || [];
    const comments = (activity.activity_comments || []).filter((c) => c.is_approved !== false);
    const grouped = groupReactions(reactions);
    const commentsOpen = expandedComments[activity.id] || false;

    return (
      <div
        key={activity.id}
        className="card"
        style={{ padding: 20, marginBottom: 16, borderRadius: 16, border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: meta.color + '18',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={18} color={meta.color} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{activity.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {teacherName}
              {activity.class?.name ? ` · ${activity.class.name}` : ''}
              {studentName ? ` · ${studentName}` : ''}
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 8,
              backgroundColor: meta.color + '18',
              color: meta.color,
              border: `1px solid ${meta.color}33`,
            }}
          >
            {meta.label}
          </span>
        </div>

        {/* Description */}
        {activity.description && (
          <p style={{ fontSize: 14, lineHeight: '22px', margin: '0 0 10px', color: 'var(--foreground)' }}>
            {activity.description}
          </p>
        )}

        {/* Duration */}
        {activity.duration_minutes && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            ⏱ {activity.duration_minutes} min
          </div>
        )}

        {/* Media grid */}
        {mediaUrls.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {mediaUrls.slice(0, 4).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt=""
                  style={{
                    width: 100,
                    height: 100,
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                />
              </a>
            ))}
            {mediaUrls.length > 4 && (
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 10,
                  backgroundColor: 'rgba(148,163,184,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  color: 'var(--muted)',
                }}
              >
                +{mediaUrls.length - 4}
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
          {timeAgo(activity.activity_at)}
        </div>

        {/* Reactions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          {grouped.map((r) => (
            <button
              key={r.emoji}
              onClick={() => handleReaction(activity.id, r.emoji)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 14,
                border: r.parentIds.includes(profileId || '') ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                backgroundColor: r.parentIds.includes(profileId || '') ? 'rgba(99,102,241,0.15)' : 'rgba(148,163,184,0.12)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {r.emoji}
              {r.count > 1 && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{r.count}</span>}
            </button>
          ))}

          {/* Add reaction */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPicker(showPicker === activity.id ? null : activity.id)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                border: 'none',
                backgroundColor: 'rgba(148,163,184,0.12)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Heart size={14} color="var(--muted)" />
            </button>
            {showPicker === activity.id && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 38,
                  left: 0,
                  display: 'flex',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 16,
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  zIndex: 10,
                }}
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(activity.id, emoji)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4 }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Comment toggle */}
        <button
          onClick={() => setExpandedComments((p) => ({ ...p, [activity.id]: !p[activity.id] }))}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            fontSize: 13,
            padding: '4px 0',
          }}
        >
          <MessageCircle size={14} />
          {comments.length > 0 ? `${comments.length} comment${comments.length > 1 ? 's' : ''}` : 'Comment'}
        </button>

        {/* Comments section */}
        {commentsOpen && (
          <div style={{ marginTop: 10 }}>
            {comments.map((c) => (
              <div
                key={c.id}
                style={{
                  borderLeft: '2px solid var(--primary)',
                  paddingLeft: 10,
                  marginBottom: 8,
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                    {c.profiles ? `${c.profiles.first_name || ''} ${c.profiles.last_name || ''}`.trim() || 'Parent' : 'Parent'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{timeAgo(c.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: '18px' }}>{c.comment_text}</div>
                {c.parent_id === profileId && (
                  <button
                    onClick={() => handleDeleteComment(c.id)}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: '#ef4444',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}

            {/* Comment input */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <input
                value={commentTexts[activity.id] || ''}
                onChange={(e) => setCommentTexts((p) => ({ ...p, [activity.id]: e.target.value }))}
                placeholder="Write a comment..."
                maxLength={500}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleComment(activity.id); } }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={() => void handleComment(activity.id)}
                disabled={!commentTexts[activity.id]?.trim()}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: 'none',
                  background: 'none',
                  cursor: commentTexts[activity.id]?.trim() ? 'pointer' : 'default',
                  opacity: commentTexts[activity.id]?.trim() ? 1 : 0.4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Send size={16} color="var(--primary)" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <ParentShell tenantSlug={slug} userEmail={email} hideHeader>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title="Activity Feed"
          subtitle="See what your child did today"
          icon={<Sparkles size={28} color="white" />}
        />

        <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: 20 }}>
          {/* Child selector */}
          {children.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {children.map((child) => {
                const active = selectedChild === child.id;
                return (
                  <button
                    key={child.id}
                    onClick={() => setSelectedChild(child.id)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 18,
                      border: active ? 'none' : '1px solid var(--border)',
                      backgroundColor: active ? 'var(--primary)' : 'transparent',
                      color: active ? '#fff' : 'var(--foreground)',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    {child.first_name}
                    {child.class_name && (
                      <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>{child.class_name}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Date navigator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <button
              onClick={() => goDay(-1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex' }}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              📅 {formatDateLabel(selectedDate)}
            </button>
            <button
              onClick={() => goDay(1)}
              disabled={isToday}
              style={{
                background: 'none',
                border: 'none',
                cursor: isToday ? 'default' : 'pointer',
                opacity: isToday ? 0.3 : 1,
                padding: 8,
                display: 'flex',
              }}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Type filter chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {FILTERS.map((f) => {
              const count = typeCounts[f.key] || 0;
              if (f.key !== 'all' && count === 0) return null;
              const active = typeFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setTypeFilter(f.key)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 16,
                    border: active ? 'none' : '1px solid var(--border)',
                    backgroundColor: active ? 'var(--primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--foreground)',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {f.label}{count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div className="spinner" />
              <p style={{ color: 'var(--muted)', marginTop: 12 }}>Loading activities...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Activity size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <h3 style={{ marginBottom: 8, fontWeight: 700 }}>No activities yet</h3>
              <p style={{ color: 'var(--muted)', maxWidth: 320, margin: '0 auto', lineHeight: '22px' }}>
                {isToday
                  ? "Your child's teacher hasn't posted any activities today yet. Check back later!"
                  : `No activities were posted on ${selectedDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}.`}
              </p>
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(new Date())}
                  style={{
                    marginTop: 16,
                    padding: '10px 24px',
                    borderRadius: 20,
                    backgroundColor: 'var(--primary)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Go to Today
                </button>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                {filtered.length} activit{filtered.length === 1 ? 'y' : 'ies'}
              </div>
              {filtered.map(renderActivityCard)}
            </div>
          )}
        </div>
      </div>
    </ParentShell>
  );
}
