import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  fetchAnnouncements,
  fetchSocialPosts,
  computeContentStats,
  upsertSocialPost,
  deleteSocialPost,
  generateAIContent,
} from './fetchContent';
import type { ShowAlertConfig, ContentTab, SocialPost, ContentStats } from './types';
import type { PlatformAnnouncement } from '@/components/super-admin/announcements/types';

export function useSuperAdminContentStudio(showAlert: (config: ShowAlertConfig) => void) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ContentTab>('announcements');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [stats, setStats] = useState<ContentStats | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadContent = useCallback(async () => {
    if (!isPlatformStaff(profile?.role)) return;
    const [anncs, posts] = await Promise.all([fetchAnnouncements(), fetchSocialPosts()]);
    setAnnouncements(anncs);
    setSocialPosts(posts);
    setStats(computeContentStats(anncs, posts));
  }, [profile?.role]);

  useEffect(() => {
    setLoading(true);
    loadContent().finally(() => setLoading(false));
  }, [loadContent]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadContent();
    setRefreshing(false);
  }, [loadContent]);

  const handleCreatePost = useCallback(
    async (content: string, platform: SocialPost['platform']) => {
      if (!profile?.id) return;
      const post = await upsertSocialPost({
        content,
        platform,
        created_by: profile.id,
        status: 'draft',
      });
      if (post) {
        showAlert({ title: 'Draft Created', message: 'Social post saved as draft.', type: 'success' });
        await loadContent();
      } else {
        showAlert({ title: 'Error', message: 'Failed to create post.', type: 'error' });
      }
    },
    [profile?.id, showAlert, loadContent],
  );

  const handleDeletePost = useCallback(
    (post: SocialPost) => {
      showAlert({
        title: 'Delete Post',
        message: `Delete this ${post.platform} post?`,
        type: 'warning',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const ok = await deleteSocialPost(post.id);
              if (ok) {
                showAlert({ title: 'Deleted', message: 'Post removed.', type: 'success' });
                await loadContent();
              } else {
                showAlert({ title: 'Error', message: 'Failed to delete.', type: 'error' });
              }
            },
          },
        ],
      });
    },
    [showAlert, loadContent],
  );

  const handleGenerateContent = useCallback(
    async (prompt: string, platform: string) => {
      setGenerating(true);
      try {
        const supabase = assertSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          showAlert({ title: 'Error', message: 'You must be logged in.', type: 'error' });
          return null;
        }
        const content = await generateAIContent(session.access_token, prompt, platform);
        if (!content) {
          showAlert({ title: 'Generation Failed', message: 'AI could not generate content.', type: 'error' });
        }
        return content;
      } catch (err) {
        logger.error('handleGenerateContent', err);
        showAlert({ title: 'Error', message: 'Content generation failed.', type: 'error' });
        return null;
      } finally {
        setGenerating(false);
      }
    },
    [showAlert],
  );

  const handleToggleAnnouncement = useCallback(
    async (announcement: PlatformAnnouncement) => {
      try {
        const { error } = await assertSupabase()
          .from('platform_announcements')
          .update({ is_active: !announcement.is_active })
          .eq('id', announcement.id);
        if (error) throw error;
        await loadContent();
      } catch (err) {
        logger.error('handleToggleAnnouncement', err);
        showAlert({ title: 'Error', message: 'Failed to update announcement.', type: 'error' });
      }
    },
    [showAlert, loadContent],
  );

  return {
    profile,
    activeTab,
    setActiveTab,
    loading,
    refreshing,
    announcements,
    socialPosts,
    stats,
    generating,
    onRefresh,
    handleCreatePost,
    handleDeletePost,
    handleGenerateContent,
    handleToggleAnnouncement,
  };
}
