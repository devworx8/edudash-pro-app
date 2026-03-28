import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { SubPageHeader } from '@/components/SubPageHeader';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useParentThreads, type MessageThread, type MessageParticipant } from '@/hooks/useParentMessaging';
import { assertSupabase } from '@/lib/supabase';

interface PrincipalGroup {
  id: string;
  name: string;
  description: string | null;
  group_type: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean | null;
}

const GROUP_TYPE_LABELS: Record<string, string> = {
  class_group: 'Class Group',
  parent_group: 'Parent Group',
  teacher_group: 'Teacher Group',
  announcement: 'Announcement Channel',
  teacher_team: 'Teacher Team',
  grade_group: 'Grade Group',
  subject_group: 'Subject Group',
  study_group: 'Study Group',
  custom: 'Custom Group',
};

function getParticipantName(
  participant?: MessageParticipant,
  fallback = 'Group',
): string {
  const first = String(participant?.user_profile?.first_name || '').trim();
  const last = String(participant?.user_profile?.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || fallback;
}

export default function PrincipalGroupsScreen() {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const orgId = (profile as any)?.organization_id || (profile as any)?.preschool_id;
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    data: threads = [],
    isLoading: threadsLoading,
    refetch: refetchThreads,
    isRefetching: threadsRefreshing,
  } = useParentThreads();

  const {
    data: directoryGroups = [],
    isLoading: directoryLoading,
    refetch: refetchDirectory,
    isRefetching: directoryRefreshing,
  } = useQuery({
    queryKey: ['principal-groups', orgId],
    queryFn: async (): Promise<PrincipalGroup[]> => {
      if (!orgId) return [];
      const { data, error } = await assertSupabase()
        .from('principal_groups')
        .select('id, name, description, group_type, icon, color, is_active')
        .eq('preschool_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as PrincipalGroup[];
    },
    enabled: !!orgId,
  });

  const groupThreads = useMemo(() => {
    return threads.filter((thread) => {
      const effectiveType = String((thread as any).group_type || thread.type || '');
      return Boolean(
        thread.is_group ||
        ['class_group', 'parent_group', 'teacher_group', 'announcement'].includes(effectiveType)
      );
    });
  }, [threads]);

  const isRefreshing = threadsRefreshing || directoryRefreshing;

  const handleRefresh = async () => {
    await Promise.all([refetchThreads(), refetchDirectory()]);
  };

  const openThread = (thread: MessageThread) => {
    const effectiveThreadType = String((thread as any).group_type || thread.type || '');
    const groupName = (thread as any).group_name || thread.subject || 'Group';
    const otherParticipant = thread.participants?.find((p) => p.user_id !== user?.id);
    const title = groupName || getParticipantName(otherParticipant, 'Group');

    router.push({
      pathname: '/screens/principal-message-thread',
      params: {
        threadId: thread.id,
        title,
        isGroup: '1',
        threadType: effectiveThreadType,
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <SubPageHeader
          title="Groups"
          subtitle="Chat groups, announcement channels, and school group records"
          onBack={() => router.back()}
          rightAction={{
            icon: 'add-outline',
            onPress: () => router.push('/screens/create-group'),
            label: 'Create group',
          }}
        />

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
            />
          }
        >
          <View style={styles.heroRow}>
            <TouchableOpacity
              style={[styles.heroCard, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/screens/create-group')}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubbles-outline" size={20} color={theme.onPrimary} />
              <Text style={[styles.heroTitle, { color: theme.onPrimary }]}>New Chat Group</Text>
              <Text style={[styles.heroText, { color: theme.onPrimary, opacity: 0.88 }]}>Create a class group, parent group, or announcement channel.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}
              onPress={() => router.push('/screens/group-management')}
              activeOpacity={0.85}
            >
              <Ionicons name="people-circle-outline" size={20} color={theme.primary} />
              <Text style={[styles.heroTitle, { color: theme.text }]}>Manage Directory</Text>
              <Text style={[styles.heroText, { color: theme.textSecondary }]}>Open the school group directory and admin group records.</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Chat Groups</Text>
              <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>{groupThreads.length}</Text>
            </View>

            {threadsLoading ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>Loading group threads...</Text>
            ) : groupThreads.length > 0 ? (
              groupThreads.map((thread) => {
                const effectiveThreadType = String((thread as any).group_type || thread.type || '');
                const groupName = (thread as any).group_name || thread.subject || 'Group';
                const unreadCount = Number(thread.unread_count || 0);
                const lastMessage = thread.last_message?.content || 'No messages yet';

                return (
                  <TouchableOpacity
                    key={thread.id}
                    style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => openThread(thread)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
                      <Ionicons name={effectiveThreadType === 'announcement' ? 'megaphone-outline' : 'people-outline'} size={20} color={theme.primary} />
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.cardTopRow}>
                        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>{groupName}</Text>
                        {unreadCount > 0 && (
                          <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                            <Text style={[styles.badgeText, { color: theme.onPrimary }]}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                        {GROUP_TYPE_LABELS[effectiveThreadType] || 'Group Thread'}
                      </Text>
                      <Text style={[styles.cardPreview, { color: theme.textSecondary }]} numberOfLines={2}>{lastMessage}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.primary} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No chat groups yet</Text>
                <Text style={[styles.helperText, { color: theme.textSecondary }]}>Create one from here and it will appear in your principal group inbox.</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>School Group Directory</Text>
              <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>{directoryGroups.length}</Text>
            </View>

            {directoryLoading ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>Loading school groups...</Text>
            ) : directoryGroups.length > 0 ? (
              directoryGroups.map((group) => (
                <TouchableOpacity
                  key={group.id}
                  style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => router.push('/screens/group-management')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconWrap, { backgroundColor: (group.color || theme.primary) + '18' }]}>
                    <Ionicons name={(group.icon || 'people-outline') as any} size={20} color={group.color || theme.primary} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>{group.name}</Text>
                    <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                      {GROUP_TYPE_LABELS[String(group.group_type || '')] || 'Managed Group'}
                    </Text>
                    {group.description ? (
                      <Text style={[styles.cardPreview, { color: theme.textSecondary }]} numberOfLines={2}>{group.description}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="people-circle-outline" size={22} color={theme.primary} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No managed groups yet</Text>
                <Text style={[styles.helperText, { color: theme.textSecondary }]}>Use Manage Directory if you want non-chat administrative groups as well.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 16,
      gap: 20,
    },
    heroRow: {
      gap: 12,
    },
    heroCard: {
      borderRadius: 16,
      padding: 16,
      gap: 8,
    },
    heroTitle: {
      fontSize: 16,
      fontWeight: '700',
    },
    heroText: {
      fontSize: 13,
      lineHeight: 18,
    },
    section: {
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    sectionCount: {
      fontSize: 13,
      fontWeight: '600',
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      flexDirection: 'row',
      gap: 12,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: {
      flex: 1,
      gap: 4,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
    },
    cardMeta: {
      fontSize: 12,
      fontWeight: '600',
    },
    cardPreview: {
      fontSize: 13,
      lineHeight: 18,
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    emptyCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      gap: 8,
      alignItems: 'flex-start',
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
    },
    helperText: {
      fontSize: 13,
      lineHeight: 18,
    },
  });