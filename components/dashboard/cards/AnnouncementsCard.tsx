import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { DashboardCard } from './DashboardCard';
import { useTerm } from '@/contexts/TerminologyContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { getActiveOrganizationId } from '@/lib/tenant/compat';

interface AnnouncementRow {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AnnouncementsCard() {
  const router = useRouter();
  const { theme } = useTheme();
  const { profile } = useAuth();
  const organizationTerm = useTerm('organization');
  const orgId = getActiveOrganizationId(profile);

  const { data: announcements = [], isLoading } = useQuery<AnnouncementRow[]>({
    queryKey: ['announcements-card', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await assertSupabase()
        .from('announcements')
        .select('id, title, content, created_at')
        .or(`preschool_id.eq.${orgId},organization_id.eq.${orgId}`)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data as AnnouncementRow[]) ?? [];
    },
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });

  const styles = createStyles(theme);

  return (
    <DashboardCard title="Announcements" icon="megaphone-outline">
      {isLoading ? (
        <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 16 }} />
      ) : announcements.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          No announcements from {organizationTerm} yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {announcements.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, { borderBottomColor: theme.border }]}
              onPress={() => router.push({ pathname: '/screens/parent-announcements', params: { announcementId: item.id } } as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.itemDate, { color: theme.textSecondary }]}>
                {timeAgo(item.created_at)}
              </Text>
              {item.content ? (
                <Text style={[styles.itemPreview, { color: theme.text }]} numberOfLines={2}>
                  {item.content}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </DashboardCard>
  );
}

export default AnnouncementsCard;

const createStyles = (theme: any) =>
  StyleSheet.create({
    list: {
      gap: 12,
    },
    empty: {
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: 12,
    },
    item: {
      paddingBottom: 12,
      borderBottomWidth: 1,
    },
    itemTitle: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    itemDate: {
      fontSize: 12,
      marginBottom: 4,
    },
    itemPreview: {
      fontSize: 13,
      opacity: 0.8,
    },
  });
