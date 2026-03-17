import type { AlertButton } from '@/components/ui/AlertModal';
import type { PlatformAnnouncement, AnnouncementForm } from '@/components/super-admin/announcements/types';

export interface ShowAlertConfig {
  title: string;
  message?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  buttons?: AlertButton[];
}

export interface SocialPost {
  id: string;
  organization_id: string | null;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  content: string;
  media_urls: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduled_at: string | null;
  published_at: string | null;
  engagement_data: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ContentTab = 'announcements' | 'social' | 'templates';

export interface ContentStats {
  total_announcements: number;
  active_announcements: number;
  total_social_posts: number;
  published_posts: number;
  draft_posts: number;
  scheduled_posts: number;
}

export const CONTENT_TABS: { id: ContentTab; label: string; icon: string }[] = [
  { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
  { id: 'social', label: 'Social Media', icon: 'share-social' },
  { id: 'templates', label: 'Templates', icon: 'document-text' },
];

export const SOCIAL_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877f2' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#e4405f' },
  { id: 'twitter', label: 'Twitter / X', icon: 'logo-twitter', color: '#1da1f2' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'logo-linkedin', color: '#0a66c2' },
];

export const POST_STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  draft: { color: '#94a3b8', label: 'Draft', icon: 'create' },
  scheduled: { color: '#f59e0b', label: 'Scheduled', icon: 'time' },
  published: { color: '#10b981', label: 'Published', icon: 'checkmark-circle' },
  failed: { color: '#ef4444', label: 'Failed', icon: 'alert-circle' },
};
