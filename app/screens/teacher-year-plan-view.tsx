// Teacher read-only Year Plan view – terms and monthly entries (no edit/publish)
// With contribute banner when planning input windows are open

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useYearPlanner } from '@/hooks/principal/useYearPlanner';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import {
  TermCard,
  groupTermsByYear,
  type YearPlanMonthlyEntryRow,
} from '@/components/principal/year-planner';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { listInputWindows } from '@/lib/services/yearPlanInputService';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BUCKET_ORDER = ['holidays_closures', 'meetings_admin', 'excursions_extras', 'donations_fundraisers'] as const;
const BUCKET_LABELS: Record<string, string> = {
  holidays_closures: 'Holidays & Closures',
  meetings_admin: 'Meetings & Admin',
  excursions_extras: 'Excursions & Extras',
  donations_fundraisers: 'Donations & Fundraisers',
};
const noop = () => {};
const MONTH_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#E11D48', '#0EA5E9',
];

export default function TeacherYearPlanViewScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const styles = createStyles(theme);

  const orgId = extractOrganizationId(profile);
  const { showAlert, alertProps } = useAlertModal();

  const {
    terms,
    monthlyEntries,
    loading,
    refreshing,
    handleRefresh,
  } = useYearPlanner({ orgId, userId: user?.id, showAlert });

  const [viewTab, setViewTab] = useState<'terms' | 'monthly'>('terms');
  const [expandedMonth, setExpandedMonth] = useState<{ year: number; month: number } | null>(null);
  const [openWindowCount, setOpenWindowCount] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    listInputWindows(orgId, true).then((windows) => {
      const now = Date.now();
      const open = windows.filter((w) => {
        const opens = new Date(w.opens_at).getTime();
        const closes = new Date(w.closes_at).getTime();
        return w.is_active && now >= opens && now <= closes;
      });
      setOpenWindowCount(open.length);
    }).catch((err) => { console.warn('Failed to fetch input windows:', err); });
  }, [orgId]);

  const monthlyByYearAndMonth = useMemo(() => {
    const byYearMonth: Record<number, Record<number, Record<string, YearPlanMonthlyEntryRow[]>>> = {};
    monthlyEntries.forEach((entry) => {
      const y = entry.academic_year;
      const m = Math.min(12, Math.max(1, entry.month_index));
      const b = entry.bucket in BUCKET_LABELS ? entry.bucket : 'holidays_closures';
      if (!byYearMonth[y]) byYearMonth[y] = {};
      if (!byYearMonth[y][m]) {
        byYearMonth[y][m] = {
          holidays_closures: [],
          meetings_admin: [],
          excursions_extras: [],
          donations_fundraisers: [],
        };
      }
      byYearMonth[y][m][b].push(entry);
    });
    return byYearMonth;
  }, [monthlyEntries]);

  const groupedTerms = groupTermsByYear(terms);

  return (
    <DesktopLayout
      role="teacher"
      title="Year Plan"
      showBackButton
      mobileHeaderTopInsetOffset={4}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {openWindowCount > 0 && (
          <TouchableOpacity
            style={styles.contributeBanner}
            onPress={() => router.push('/screens/teacher-year-plan-input' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.contributeBannerIcon}>
              <Ionicons name="bulb-outline" size={20} color="#F59E0B" />
            </View>
            <View style={styles.contributeBannerContent}>
              <Text style={styles.contributeBannerTitle}>Planning window open!</Text>
              <Text style={styles.contributeBannerText}>
                Your principal wants your input. Tap to contribute ideas.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#F59E0B" />
          </TouchableOpacity>
        )}
        <View style={styles.header}>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, viewTab === 'terms' && styles.tabBtnActive]}
              onPress={() => setViewTab('terms')}
            >
              <Text style={[styles.tabBtnText, viewTab === 'terms' && styles.tabBtnTextActive]}>Terms</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, viewTab === 'monthly' && styles.tabBtnActive]}
              onPress={() => setViewTab('monthly')}
            >
              <Text style={[styles.tabBtnText, viewTab === 'monthly' && styles.tabBtnTextActive]}>Monthly</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        ) : viewTab === 'monthly' ? (
          (() => {
            const years = Object.keys(monthlyByYearAndMonth)
              .map(Number)
              .sort((a, b) => b - a);
            if (years.length === 0) {
              return (
                <View style={styles.empty}>
                  <Ionicons name="calendar-outline" size={64} color={theme.textSecondary} />
                  <Text style={styles.emptyText}>No Monthly Entries</Text>
                  <Text style={styles.emptySubtext}>Your principal can add monthly entries from the AI Year Planner</Text>
                </View>
              );
            }
            return (
              <View style={styles.monthlySection}>
                {years.map((year) => (
                  <View key={year} style={styles.yearSection}>
                    <Text style={styles.yearTitle}>Academic Year {year}</Text>
                    <View style={styles.monthGrid}>
                      {Array.from({ length: 12 }, (_, idx) => {
                        const month = idx + 1;
                        const byBucket = monthlyByYearAndMonth[year]?.[month] ?? {
                          holidays_closures: [],
                          meetings_admin: [],
                          excursions_extras: [],
                          donations_fundraisers: [],
                        };
                        const itemCount = BUCKET_ORDER.reduce((s, b) => s + (byBucket[b]?.length ?? 0), 0);
                        const isExpanded = expandedMonth?.year === year && expandedMonth?.month === month;
                        return (
                          <View key={month} style={styles.monthTileWrapper}>
                            <TouchableOpacity
                              style={[styles.monthTile, isExpanded && styles.monthTileExpanded]}
                              onPress={() =>
                                setExpandedMonth(isExpanded ? null : { year, month })
                              }
                              activeOpacity={0.8}
                            >
                              <View style={[styles.monthTileHeader, { backgroundColor: MONTH_COLORS[idx] }]}>
                                <Text style={styles.monthTileTitle}>{MONTH_NAMES[idx]}</Text>
                                {itemCount > 0 && (
                                  <View style={styles.monthTileBadge}>
                                    <Text style={styles.monthTileBadgeText}>{itemCount}</Text>
                                  </View>
                                )}
                              </View>
                              {isExpanded && (
                                <View style={styles.monthTileBody}>
                                  {BUCKET_ORDER.map((bucket) => {
                                    const items = byBucket[bucket] ?? [];
                                    if (items.length === 0) return null;
                                    return (
                                      <View key={bucket} style={styles.monthBucket}>
                                        <Text style={styles.monthBucketLabel}>{BUCKET_LABELS[bucket]}</Text>
                                        {items.map((entry) => (
                                          <Text key={entry.id} style={styles.monthItem} numberOfLines={2}>
                                            • {entry.details ? `${entry.title}: ${entry.details}` : entry.title}
                                          </Text>
                                        ))}
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                              {!isExpanded && (
                                <View style={styles.monthTileChevron}>
                                  <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
                                </View>
                              )}
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            );
          })()
        ) : Object.keys(groupedTerms).length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={64} color={theme.textSecondary} />
            <Text style={styles.emptyText}>No Terms Planned</Text>
            <Text style={styles.emptySubtext}>Your principal can add terms from the Year Planner</Text>
          </View>
        ) : (
          Object.entries(groupedTerms)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([year, yearTerms]) => (
              <View key={year} style={styles.yearSection}>
                <Text style={styles.yearTitle}>Academic Year {year}</Text>
                {yearTerms.map((term) => (
                  <TermCard
                    key={term.id}
                    term={term}
                    onEdit={noop}
                    onDelete={noop}
                    onTogglePublish={noop}
                    theme={theme}
                    readOnly
                  />
                ))}
              </View>
            ))
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      flexWrap: 'wrap',
      gap: 8,
    },
    tabRow: {
      flexDirection: 'row',
      gap: 8,
    },
    tabBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    tabBtnActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    tabBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    tabBtnTextActive: {
      color: '#fff',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    emptyText: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: 24,
      textAlign: 'center',
    },
    yearSection: {
      marginBottom: 24,
      paddingHorizontal: 16,
    },
    yearTitle: {
      fontSize: 24,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 16,
    },
    monthlySection: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    monthGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    monthTileWrapper: {
      width: '31%',
      minWidth: 100,
    },
    monthTile: {
      backgroundColor: theme.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    monthTileExpanded: {
      borderColor: theme.primary,
    },
    monthTileHeader: {
      paddingVertical: 10,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    monthTileTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: '#fff',
    },
    monthTileBadge: {
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    monthTileBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#333',
    },
    monthTileBody: {
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    monthBucket: {
      marginBottom: 10,
    },
    monthBucketLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
      marginBottom: 4,
    },
    monthItem: {
      fontSize: 12,
      color: theme.text,
      lineHeight: 18,
      marginBottom: 2,
    },
    monthTileChevron: {
      alignItems: 'center',
      paddingVertical: 4,
    },
    contributeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FEF3C7',
      marginHorizontal: 16,
      marginTop: 12,
      padding: 14,
      borderRadius: 12,
      gap: 10,
      borderWidth: 1,
      borderColor: '#FCD34D',
    },
    contributeBannerIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: '#FDE68A',
      alignItems: 'center',
      justifyContent: 'center',
    },
    contributeBannerContent: {
      flex: 1,
    },
    contributeBannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#92400E',
    },
    contributeBannerText: {
      fontSize: 12,
      color: '#B45309',
      marginTop: 2,
    },
  });
