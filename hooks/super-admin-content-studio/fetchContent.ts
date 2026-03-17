import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { SocialPost, ContentStats } from './types';
import type { PlatformAnnouncement } from '@/components/super-admin/announcements/types';

/**
 * Fetch platform announcements.
 */
export async function fetchAnnouncements(): Promise<PlatformAnnouncement[]> {
  try {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('platform_announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('fetchAnnouncements', 'Failed:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('fetchAnnouncements', 'Unexpected:', err);
    return [];
  }
}

/**
 * Fetch social posts (platform-level, org_id is null).
 */
export async function fetchSocialPosts(): Promise<SocialPost[]> {
  try {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('social_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('fetchSocialPosts', 'Failed:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('fetchSocialPosts', 'Unexpected:', err);
    return [];
  }
}

/**
 * Compute content stats from loaded data.
 */
export function computeContentStats(
  announcements: PlatformAnnouncement[],
  socialPosts: SocialPost[],
): ContentStats {
  return {
    total_announcements: announcements.length,
    active_announcements: announcements.filter((a) => a.is_active).length,
    total_social_posts: socialPosts.length,
    published_posts: socialPosts.filter((p) => p.status === 'published').length,
    draft_posts: socialPosts.filter((p) => p.status === 'draft').length,
    scheduled_posts: socialPosts.filter((p) => p.status === 'scheduled').length,
  };
}

/**
 * Create or update a social post draft.
 */
export async function upsertSocialPost(
  post: Partial<SocialPost> & { content: string; platform: string; created_by: string },
): Promise<SocialPost | null> {
  try {
    const supabase = assertSupabase();
    const payload = {
      content: post.content,
      platform: post.platform,
      status: post.status || 'draft',
      media_urls: post.media_urls || [],
      scheduled_at: post.scheduled_at || null,
      created_by: post.created_by,
    };

    if (post.id) {
      const { data, error } = await supabase
        .from('social_posts')
        .update(payload)
        .eq('id', post.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from('social_posts')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    logger.error('upsertSocialPost', 'Failed:', err);
    return null;
  }
}

/**
 * Delete a social post.
 */
export async function deleteSocialPost(postId: string): Promise<boolean> {
  try {
    const supabase = assertSupabase();
    const { error } = await supabase.from('social_posts').delete().eq('id', postId);
    if (error) throw error;
    return true;
  } catch (err) {
    logger.error('deleteSocialPost', 'Failed:', err);
    return false;
  }
}

/**
 * Generate AI content for a social post via the social-agent-generate Edge Function.
 */
export async function generateAIContent(
  accessToken: string,
  prompt: string,
  platform: string,
): Promise<string | null> {
  try {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const response = await fetch(`${url}/functions/v1/social-agent-generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, platform, tone: 'professional' }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Generation failed');
    return result.content || result.generated_text || null;
  } catch (err) {
    logger.error('generateAIContent', 'Failed:', err);
    return null;
  }
}
