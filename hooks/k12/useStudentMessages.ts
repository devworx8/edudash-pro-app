/**
 * useStudentMessages
 *
 * Fetches school announcements and notifications for K-12 students.
 */

import { useEffect, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { FeatureItem } from '@/domains/k12/components/K12StudentFeatureScreen';

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
}

function getPriorityIcon(priority: string | null): string {
  switch (priority) {
    case 'urgent': return 'alert-circle-outline';
    case 'high': return 'flag-outline';
    default: return 'megaphone-outline';
  }
}

function getPriorityTone(priority: string | null): string {
  switch (priority) {
    case 'urgent': return '#EF4444';
    case 'high': return '#F59E0B';
    default: return '#6366F1';
  }
}

export function useStudentMessages() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchMessages = async () => {
      try {
        const supabase = assertSupabase();
        const orgId = profile?.organization_id || profile?.preschool_id;

        // Fetch published announcements for the student's school
        let query = supabase
          .from('announcements')
          .select('id, title, content, priority, published_at, target_audience')
          .eq('is_published', true)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(20);

        if (orgId) {
          query = query.eq('preschool_id', orgId);
        }

        const { data, error } = await query;

        if (error || !data || cancelled) return;

        // Filter to announcements targeting students or all audiences
        const relevant = (data as any[]).filter(a => {
          const audience = a.target_audience;
          if (!audience) return true; // No target = all audiences
          return audience === 'all' || audience === 'students' || audience === 'everyone';
        });

        const mapped: FeatureItem[] = relevant.map(a => ({
          id: a.id,
          title: a.title,
          subtitle: `${formatTimeAgo(a.published_at || a.created_at)}${a.priority === 'urgent' ? ' · Urgent' : ''}`,
          icon: getPriorityIcon(a.priority) as any,
          tone: getPriorityTone(a.priority),
        }));

        setItems(mapped);
      } catch {
        // Silently fail — empty list is shown
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMessages();
    return () => { cancelled = true; };
  }, [user?.id, profile?.organization_id, profile?.preschool_id]);

  return { items, loading };
}
