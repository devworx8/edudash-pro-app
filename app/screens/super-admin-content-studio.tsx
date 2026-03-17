import React from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isSuperAdmin } from '@/lib/roleUtils';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useSuperAdminContentStudio } from '@/hooks/useSuperAdminContentStudio';
import {
  CONTENT_TABS, SOCIAL_PLATFORMS, POST_STATUS_CONFIG,
} from '@/hooks/super-admin-content-studio/types';
import type { SocialPost, ContentTab } from '@/hooks/super-admin-content-studio/types';
import type { PlatformAnnouncement } from '@/components/super-admin/announcements/types';
import { createStyles } from '@/lib/screen-styles/super-admin-content-studio.styles';

const ANNOUNCEMENT_TYPE_COLORS: Record<string, string> = {
  info: '#3b82f6', warning: '#f59e0b', alert: '#ef4444',
  maintenance: '#6366f1', feature: '#10b981',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SuperAdminContentStudioScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    profile, activeTab, setActiveTab,
    loading, refreshing, announcements, socialPosts, stats,
    onRefresh, handleDeletePost, handleToggleAnnouncement,
  } = useSuperAdminContentStudio(showAlert);

  if (!profile || !isSuperAdmin(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Content Studio', headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Content Studio', headerShown: false }} />
      <ThemedStatusBar />

      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="create" size={28} color="#ec4899" />
            <Text style={styles.title}>Content Studio</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {CONTENT_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.id ? '#3b82f6' : '#64748b'}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading content...</Text>
          </View>
        ) : (
          <>
            {/* Stats Bar */}
            {stats && (
              <View style={styles.statsBar}>
                <View style={[styles.statCard, { backgroundColor: '#3b82f620' }]}>
                  <Text style={styles.statValue}>{stats.active_announcements}</Text>
                  <Text style={styles.statLabel}>Active Announcements</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#10b98120' }]}>
                  <Text style={styles.statValue}>{stats.published_posts}</Text>
                  <Text style={styles.statLabel}>Published Posts</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#f59e0b20' }]}>
                  <Text style={styles.statValue}>{stats.draft_posts}</Text>
                  <Text style={styles.statLabel}>Drafts</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#6366f120' }]}>
                  <Text style={styles.statValue}>{stats.scheduled_posts}</Text>
                  <Text style={styles.statLabel}>Scheduled</Text>
                </View>
              </View>
            )}

            {/* Tab Content */}
            {activeTab === 'announcements' && (
              <AnnouncementsTab
                announcements={announcements}
                styles={styles}
                onToggle={handleToggleAnnouncement}
              />
            )}

            {activeTab === 'social' && (
              <SocialTab
                posts={socialPosts}
                styles={styles}
                onDelete={handleDeletePost}
              />
            )}

            {activeTab === 'templates' && (
              <TemplatesTab styles={styles} />
            )}
          </>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}

// ── Sub-components ──

function AnnouncementsTab({
  announcements, styles, onToggle,
}: {
  announcements: PlatformAnnouncement[];
  styles: ReturnType<typeof createStyles>;
  onToggle: (a: PlatformAnnouncement) => void;
}) {
  if (!announcements.length) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="megaphone-outline" size={48} color="#64748b" />
        <Text style={styles.emptyText}>No announcements yet</Text>
        <Text style={styles.emptySubText}>
          Create your first announcement from the Announcements screen.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Platform Announcements ({announcements.length})
      </Text>
      {announcements.map((a) => {
        const typeColor = ANNOUNCEMENT_TYPE_COLORS[a.type] || '#64748b';
        return (
          <TouchableOpacity
            key={a.id}
            style={styles.announcementCard}
            onPress={() => onToggle(a)}
            activeOpacity={0.7}
          >
            <View style={styles.announcementHeader}>
              <Text style={styles.announcementTitle} numberOfLines={1}>{a.title}</Text>
              <Text
                style={[
                  styles.announcementType,
                  { backgroundColor: typeColor + '20', color: typeColor },
                ]}
              >
                {a.type}
              </Text>
            </View>
            <Text style={styles.announcementContent} numberOfLines={2}>
              {a.content}
            </Text>
            <View style={styles.announcementMeta}>
              <Text style={styles.announcementMetaText}>
                {a.is_active ? '● Active' : '○ Inactive'}
              </Text>
              <Text style={styles.announcementMetaText}>
                {a.views_count} views · {a.click_count} clicks
              </Text>
              <Text style={styles.announcementMetaText}>
                {formatDate(a.created_at)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SocialTab({
  posts, styles, onDelete,
}: {
  posts: SocialPost[];
  styles: ReturnType<typeof createStyles>;
  onDelete: (p: SocialPost) => void;
}) {
  if (!posts.length) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="share-social-outline" size={48} color="#64748b" />
        <Text style={styles.emptyText}>No social posts yet</Text>
        <Text style={styles.emptySubText}>
          Use the AI content generator to create engaging social media posts.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Social Posts ({posts.length})</Text>
      {posts.map((post) => {
        const platformConfig = SOCIAL_PLATFORMS.find((p) => p.id === post.platform);
        const statusConfig = POST_STATUS_CONFIG[post.status] || POST_STATUS_CONFIG.draft;
        return (
          <View key={post.id} style={styles.socialCard}>
            <View style={styles.socialHeader}>
              <View style={styles.socialPlatform}>
                <Ionicons
                  name={(platformConfig?.icon || 'share-social') as any}
                  size={18}
                  color={platformConfig?.color || '#64748b'}
                />
                <Text style={styles.socialPlatformText}>
                  {platformConfig?.label || post.platform}
                </Text>
              </View>
              <View style={[styles.socialStatus, { backgroundColor: statusConfig.color + '20' }]}>
                <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
                <Text style={[styles.socialStatusText, { color: statusConfig.color }]}>
                  {statusConfig.label}
                </Text>
              </View>
            </View>
            <Text style={styles.socialContent} numberOfLines={4}>
              {post.content}
            </Text>
            <View style={styles.socialActions}>
              {post.status === 'draft' && (
                <TouchableOpacity
                  style={[styles.socialAction, { backgroundColor: '#ef444420' }]}
                  onPress={() => onDelete(post)}
                >
                  <Ionicons name="trash" size={14} color="#ef4444" />
                  <Text style={[styles.socialActionText, { color: '#ef4444' }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function TemplatesTab({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const templates = [
    { name: 'Welcome Message', desc: 'New school onboarding announcement', icon: 'school' },
    { name: 'Maintenance Notice', desc: 'Planned downtime notification', icon: 'construct' },
    { name: 'Feature Launch', desc: 'Announce a new platform feature', icon: 'rocket' },
    { name: 'Monthly Report', desc: 'Platform usage stats summary', icon: 'bar-chart' },
    { name: 'Holiday Greeting', desc: 'Seasonal greeting to all schools', icon: 'gift' },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Content Templates</Text>
      {templates.map((t) => (
        <View key={t.name} style={styles.templateCard}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#6366f120', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name={t.icon as any} size={20} color="#6366f1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.templateName}>{t.name}</Text>
            <Text style={styles.templateDesc}>{t.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#64748b" />
        </View>
      ))}
    </View>
  );
}
