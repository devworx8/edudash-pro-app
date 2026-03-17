import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput } from 'react-native';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { useTheme } from '@/contexts/ThemeContext';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';

interface AiUsageRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  current_tier: string | null;
  chat_messages_this_month: number | null;
  chat_messages_today: number | null;
  last_monthly_reset_at: string | null;
  last_daily_reset_at: string | null;
}

interface ImageUsageRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  uploads_today: number | null;
}

const formatNumber = (value?: number | null) => {
  try {
    return new Intl.NumberFormat().format(value ?? 0);
  } catch {
    return String(value ?? 0);
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function SuperAdminAIUsageScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usageRows, setUsageRows] = useState<AiUsageRow[]>([]);
  const [imageRows, setImageRows] = useState<ImageUsageRow[]>([]);
  const [search, setSearch] = useState('');
  const isAllowed = Boolean(profile && isPlatformStaff(profile.role));

  const loadUsage = useCallback(async (isRefresh = false) => {
    if (!isPlatformStaff(profile?.role)) {
      showAlert({ title: 'Access Denied', message: 'Super admin privileges required' });
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [usageResponse, imageResponse] = await Promise.all([
        assertSupabase().rpc('admin_get_ai_usage_summary'),
        assertSupabase().rpc('admin_get_image_uploads_today'),
      ]);

      if (usageResponse.error) throw usageResponse.error;
      if (imageResponse.error) throw imageResponse.error;

      setUsageRows((usageResponse.data as AiUsageRow[]) || []);
      setImageRows((imageResponse.data as ImageUsageRow[]) || []);
    } catch (error: any) {
      logger.error('[SuperAdminAIUsage] Load failed:', error);
      showAlert({ title: 'Error', message: error?.message || 'Failed to load AI usage data' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    if (isAllowed) {
      loadUsage();
    }
  }, [loadUsage, isAllowed]);

  const filteredUsage = useMemo(() => {
    if (!search.trim()) return usageRows;
    const q = search.trim().toLowerCase();
    return usageRows.filter((row) => {
      const name = row.full_name?.toLowerCase() || '';
      const email = row.email?.toLowerCase() || '';
      return name.includes(q) || email.includes(q);
    });
  }, [usageRows, search]);

  const filteredImages = useMemo(() => {
    if (!search.trim()) return imageRows;
    const q = search.trim().toLowerCase();
    return imageRows.filter((row) => {
      const name = row.full_name?.toLowerCase() || '';
      const email = row.email?.toLowerCase() || '';
      return name.includes(q) || email.includes(q);
    });
  }, [imageRows, search]);

  const totalChatThisMonth = useMemo(
    () => usageRows.reduce((sum, row) => sum + (row.chat_messages_this_month ?? 0), 0),
    [usageRows]
  );
  const totalChatToday = useMemo(
    () => usageRows.reduce((sum, row) => sum + (row.chat_messages_today ?? 0), 0),
    [usageRows]
  );
  const totalUploadsToday = useMemo(
    () => imageRows.reduce((sum, row) => sum + (row.uploads_today ?? 0), 0),
    [imageRows]
  );

  if (!isAllowed) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedStatusBar />
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.deniedContainer}>
          <Text style={[styles.deniedText, { color: theme.textSecondary }]}>
            Access Denied - Super Admin Only
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedStatusBar />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading AI usage...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedStatusBar />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>AI Usage</Text>
        <TouchableOpacity onPress={() => loadUsage(true)} style={styles.headerButton}>
          <Ionicons name="refresh" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadUsage(true)} />}
      >
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Tracked Users</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{formatNumber(usageRows.length)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Chat (Month)</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{formatNumber(totalChatThisMonth)}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Chat (Today)</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{formatNumber(totalChatToday)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Images (Today)</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{formatNumber(totalUploadsToday)}</Text>
          </View>
        </View>

        <View style={[styles.searchCard, { backgroundColor: theme.surface }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email"
            placeholderTextColor={theme.textTertiary}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Chat Usage</Text>
          {filteredUsage.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No usage data available.</Text>
            </View>
          ) : (
            filteredUsage.map((row) => (
              <View key={row.user_id} style={[styles.rowCard, { backgroundColor: theme.surface }]}>
                <View style={styles.rowHeader}>
                  <Text style={[styles.rowName, { color: theme.text }]}>{row.full_name || 'Unknown'}</Text>
                  <Text style={[styles.rowTier, { color: theme.textSecondary }]}>{row.current_tier || '—'}</Text>
                </View>
                <Text style={[styles.rowEmail, { color: theme.textTertiary }]}>{row.email || '—'}</Text>
                <View style={styles.rowStats}>
                  <Text style={[styles.rowStat, { color: theme.textSecondary }]}>
                    Month: <Text style={{ color: theme.text }}>{formatNumber(row.chat_messages_this_month)}</Text>
                  </Text>
                  <Text style={[styles.rowStat, { color: theme.textSecondary }]}>
                    Today: <Text style={{ color: theme.text }}>{formatNumber(row.chat_messages_today)}</Text>
                  </Text>
                </View>
                <Text style={[styles.rowMeta, { color: theme.textTertiary }]}>
                  Last reset: {formatDate(row.last_monthly_reset_at)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Image Uploads (Today)</Text>
          {filteredImages.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No uploads recorded today.</Text>
            </View>
          ) : (
            filteredImages.map((row) => (
              <View key={row.user_id} style={[styles.rowCard, { backgroundColor: theme.surface }]}>
                <View style={styles.rowHeader}>
                  <Text style={[styles.rowName, { color: theme.text }]}>{row.full_name || 'Unknown'}</Text>
                  <Text style={[styles.rowTier, { color: theme.textSecondary }]}>
                    {formatNumber(row.uploads_today)} uploads
                  </Text>
                </View>
                <Text style={[styles.rowEmail, { color: theme.textTertiary }]}>{row.email || '—'}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deniedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deniedText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  rowCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowTier: {
    fontSize: 12,
  },
  rowEmail: {
    fontSize: 12,
    marginBottom: 8,
  },
  rowStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowStat: {
    fontSize: 12,
  },
  rowMeta: {
    marginTop: 8,
    fontSize: 11,
  },
  emptyCard: {
    borderRadius: 12,
    padding: 16,
  },
  emptyText: {
    fontSize: 13,
  },
});
