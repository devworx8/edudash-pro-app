// filepath: /media/king/5e026cdc-594e-4493-bf92-c35c231beea3/home/king/Desktop/dashpro/app/screens/principal-year-planner.tsx
// Principal Year Planner Screen - Refactored for WARP.md compliance (≤500 lines)

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useYearPlanner } from '@/hooks/principal/useYearPlanner';
import { useTermSuggestionAI } from '@/hooks/useTermSuggestionAI';
import {
  TermCard,
  TermFormModal,
  getDefaultTermFormData,
  termFormDataFromTerm,
  groupTermsByYear,
  type AcademicTerm,
  type TermFormData,
  type YearPlanMonthlyEntryRow,
} from '@/components/principal/year-planner';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BUCKET_ORDER = ['holidays_closures', 'meetings_admin', 'excursions_extras', 'donations_fundraisers'] as const;
const BUCKET_LABELS: Record<string, string> = {
  holidays_closures: 'Holidays & Closures',
  meetings_admin: 'Meetings & Admin',
  excursions_extras: 'Excursions & Extras',
  donations_fundraisers: 'Donations & Fundraisers',
};
const MONTH_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#E11D48', '#0EA5E9',
];

export default function PrincipalYearPlannerScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { width } = useWindowDimensions();
  const styles = createStyles(theme);

  const orgId = extractOrganizationId(profile);

  const {
    terms,
    monthlyEntries,
    loading,
    refreshing,
    handleRefresh,
    handleSubmit,
    handleDelete,
    handleTogglePublish,
    handlePublishPlan,
  } = useYearPlanner({ orgId, userId: user?.id });

  const [viewTab, setViewTab] = useState<'terms' | 'monthly'>('terms');
  const [expandedMonth, setExpandedMonth] = useState<{ year: number; month: number } | null>(null);

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

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null);
  const [formData, setFormData] = useState<TermFormData>(getDefaultTermFormData());
  const isCompact = width < 860;
  const isUltraCompact = width < 560;
  const monthTileBasis = useMemo(() => {
    if (width >= 1280) return '24%';
    if (width >= 980) return '31%';
    if (width >= 680) return '48%';
    return '100%';
  }, [width]);

  const {
    suggest: aiSuggest,
    isBusy: aiBusy,
    error: aiError,
    lastResult: aiLastResult,
    applyToNativeForm: aiApplyToNativeForm,
  } = useTermSuggestionAI({ context: 'ecd' });

  const handleAISuggest = useCallback(async () => {
    const result = await aiSuggest(formData);
    if (result) aiApplyToNativeForm(formData, setFormData);
  }, [formData, aiSuggest, aiApplyToNativeForm]);

  const groupedTerms = groupTermsByYear(terms);

  const openCreateModal = () => {
    setFormData(getDefaultTermFormData());
    setEditingTerm(null);
    setShowCreateModal(true);
  };

  const openEditModal = (term: AcademicTerm) => {
    setFormData(termFormDataFromTerm(term));
    setEditingTerm(term);
    setShowCreateModal(true);
  };

  const onSubmit = async () => {
    const success = await handleSubmit(formData, editingTerm);
    if (success) {
      setShowCreateModal(false);
    }
  };

  return (
    <DesktopLayout
      role="principal"
      title="Year Planner"
      showBackButton
      mobileHeaderTopInsetOffset={4}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.pageShell}>
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
          <View style={[styles.headerActions, isCompact && styles.headerActionsCompact]}>
            <TouchableOpacity
              style={[styles.publishButton, isCompact && styles.headerActionBtnCompact, isUltraCompact && styles.headerActionBtnFull]}
              onPress={() => router.push('/screens/principal-ai-year-planner')}
            >
              <Ionicons name="library-outline" size={20} color={theme.primary} />
              <Text style={[styles.publishButtonText, { color: theme.primary }]} numberOfLines={1}>AI Planner Library</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.publishButton, isCompact && styles.headerActionBtnCompact, isUltraCompact && styles.headerActionBtnFull]}
              onPress={() => handlePublishPlan()}
            >
              <Ionicons name="megaphone-outline" size={20} color={theme.primary} />
              <Text style={[styles.publishButtonText, { color: theme.primary }]} numberOfLines={1}>Publish plan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addButton, isCompact && styles.headerActionBtnCompact, isUltraCompact && styles.headerActionBtnFull]}
              onPress={openCreateModal}
            >
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.addButtonText}>New Term</Text>
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
                  <Text style={styles.emptySubtext}>Save a plan from AI Year Planner to see monthly entries here</Text>
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
                          <View key={month} style={[styles.monthTileWrapper, { flexBasis: monthTileBasis, maxWidth: monthTileBasis }]}>
                            <TouchableOpacity
                              style={[styles.monthTile, isExpanded && styles.monthTileExpanded]}
                              onPress={() =>
                                setExpandedMonth(
                                  isExpanded ? null : { year, month }
                                )
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
            <Text style={styles.emptySubtext}>Start by creating your first academic term</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={openCreateModal}>
              <Text style={styles.emptyButtonText}>Create First Term</Text>
            </TouchableOpacity>
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
                    onEdit={() => openEditModal(term)}
                    onDelete={() => handleDelete(term)}
                    onTogglePublish={() => handleTogglePublish(term)}
                    theme={theme}
                  />
                ))}
              </View>
            ))
        )}

        <TermFormModal
          visible={showCreateModal}
          isEditing={!!editingTerm}
          formData={formData}
          setFormData={setFormData}
          onSubmit={onSubmit}
          onClose={() => setShowCreateModal(false)}
          theme={theme}
          onAISuggest={handleAISuggest}
          aiBusy={aiBusy}
          aiError={aiError}
          aiTips={aiLastResult?.tips}
        />
        </View>
      </ScrollView>
    </DesktopLayout>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      width: '100%',
      paddingBottom: 24,
    },
    pageShell: {
      width: '100%',
      maxWidth: 1220,
      alignSelf: 'center',
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
    },
    headerActionsCompact: {
      width: '100%',
      justifyContent: 'flex-start',
    },
    headerActionBtnCompact: {
      flexGrow: 1,
    },
    headerActionBtnFull: {
      width: '100%',
    },
    publishButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.primary,
      gap: 6,
    },
    publishButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      gap: 8,
    },
    addButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 16,
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
    emptyButton: {
      backgroundColor: theme.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    emptyButtonText: {
      color: '#fff',
      fontWeight: '600',
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
      width: '100%',
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
  });
