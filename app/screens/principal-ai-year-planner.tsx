/**
 * Principal AI Year Planner Screen (Native)
 * Includes AI generation + versioned saved-plan library.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';

import {
  YearPlanConfigModal,
  GeneratedPlanView,
} from '@/components/principal/ai-planner';
import { useAIYearPlanner } from '@/hooks/principal/useAIYearPlanner';

import EduDashSpinner from '@/components/ui/EduDashSpinner';

export default function PrincipalAIYearPlannerScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { width } = useWindowDimensions();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const orgId = extractOrganizationId(profile);

  const {
    generatedPlan,
    isGenerating,
    isSaving,
    expandedTerm,
    setExpandedTerm,
    generateYearPlan,
    savePlanToDatabase,
    updatePlan,
    revisions,
    revisionsLoading,
    activeRevisionId,
    refreshRevisions,
    loadRevisionIntoEditor,
    duplicateRevision,
    republishRevision,
  } = useAIYearPlanner({ organizationId: orgId, userId: user?.id, onShowAlert: showAlert });

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [viewMode, setViewMode] = useState<'builder' | 'library'>('builder');
  const isCompact = width < 820;

  const sortedRevisions = useMemo(
    () => [...revisions].sort((a, b) => {
      if (a.academic_year !== b.academic_year) return b.academic_year - a.academic_year;
      return b.version_no - a.version_no;
    }),
    [revisions],
  );

  const content = (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.pageShell, isCompact && styles.pageShellCompact]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.aiIconSmall}>
            <Ionicons name="sparkles" size={18} color="#8B5CF6" />
          </View>
          <Text style={styles.headerTitle}>AI Year Planner</Text>
          {viewMode === 'builder' && !generatedPlan && !isGenerating && (
            <TouchableOpacity
              style={[styles.generateButtonCompact, isCompact && styles.generateButtonCompactWide]}
              onPress={() => setShowConfigModal(true)}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.generateButtonText}>Generate</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.linkRow}>
          <TouchableOpacity
            style={[styles.linkChip, viewMode === 'builder' && styles.linkChipActive]}
            onPress={() => setViewMode('builder')}
          >
            <Ionicons name="create-outline" size={14} color={viewMode === 'builder' ? '#fff' : theme.primary} />
            <Text style={[styles.linkChipText, viewMode === 'builder' && styles.linkChipTextActive]}>Builder</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkChip, viewMode === 'library' && styles.linkChipActive]}
            onPress={() => setViewMode('library')}
          >
            <Ionicons name="library-outline" size={14} color={viewMode === 'library' ? '#fff' : theme.primary} />
            <Text style={[styles.linkChipText, viewMode === 'library' && styles.linkChipTextActive]}>Saved Plans</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkChip}
            onPress={() => router.push('/screens/principal-year-planner')}
          >
            <Ionicons name="calendar-outline" size={14} color={theme.primary} />
            <Text style={styles.linkChipText}>Year Planner</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkChip}
            onPress={() => void refreshRevisions()}
          >
            <Ionicons name="refresh-outline" size={14} color={theme.primary} />
            <Text style={styles.linkChipText}>Republish History</Text>
          </TouchableOpacity>
        </View>
      </View>

      {viewMode === 'builder' && isGenerating && (
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Generating your year plan...</Text>
          <Text style={styles.loadingSubtext}>This may take a moment</Text>
        </View>
      )}

      {viewMode === 'builder' && generatedPlan && !isGenerating && (
        <GeneratedPlanView
          plan={generatedPlan}
          expandedTerm={expandedTerm}
          isSaving={isSaving}
          onToggleExpandTerm={setExpandedTerm}
          onSave={savePlanToDatabase}
          onRegenerate={() => setShowConfigModal(true)}
          onUpdatePlan={updatePlan}
        />
      )}

      {viewMode === 'builder' && !generatedPlan && !isGenerating && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No draft loaded</Text>
          <Text style={styles.emptyHint}>Generate a plan or open one from Saved Plans.</Text>
          <TouchableOpacity
            style={styles.generateButtonCompact}
            onPress={() => setShowConfigModal(true)}
          >
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={styles.generateButtonText}>Generate AI Plan</Text>
          </TouchableOpacity>
        </View>
      )}

      {viewMode === 'library' && (
        <ScrollView style={styles.libraryContainer} contentContainerStyle={styles.libraryContent}>
          {revisionsLoading ? (
            <View style={styles.loadingContainer}>
              <EduDashSpinner size="small" color={theme.primary} />
              <Text style={styles.loadingSubtext}>Loading saved plans...</Text>
            </View>
          ) : sortedRevisions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No saved plans yet</Text>
              <Text style={styles.emptyHint}>Save a generated AI year plan to create version history.</Text>
            </View>
          ) : (
            sortedRevisions.map((revision) => {
              const isActive = activeRevisionId === revision.id;
              return (
                <View key={revision.id} style={[styles.revisionCard, isActive && styles.revisionCardActive]}>
                  <View style={[styles.revisionHeader, isCompact && styles.revisionHeaderCompact]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.revisionTitle}>
                        {revision.academic_year} • v{revision.version_no}
                      </Text>
                      <Text style={styles.revisionMeta}>
                        {revision.status} • {new Date(revision.created_at).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>{revision.status}</Text>
                    </View>
                  </View>

                  {revision.changelog ? (
                    <Text style={styles.changelogPreview} numberOfLines={2}>
                      {revision.changelog}
                    </Text>
                  ) : null}

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        void loadRevisionIntoEditor(revision.id);
                        setViewMode('builder');
                      }}
                    >
                      <Text style={styles.actionBtnText}>Open</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        void loadRevisionIntoEditor(revision.id);
                        setViewMode('builder');
                      }}
                    >
                      <Text style={styles.actionBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => void duplicateRevision(revision.id)}
                    >
                      <Text style={styles.actionBtnText}>Duplicate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => void republishRevision(revision.id)}
                    >
                      <Text style={styles.actionBtnText}>Republish</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        showAlert({
                          title: `Revision v${revision.version_no}`,
                          message: revision.changelog || 'No changelog for this revision.',
                          type: 'info',
                        });
                      }}
                    >
                      <Text style={styles.actionBtnText}>View changelog</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <YearPlanConfigModal
        visible={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onGenerate={generateYearPlan}
      />
      <AlertModal {...alertProps} />
      </View>
    </View>
  );

  return (
    <DesktopLayout
      role="principal"
      title="AI Year Planner"
      showBackButton
      mobileHeaderTopInsetOffset={4}
    >
      {content}
    </DesktopLayout>
  );
}

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    pageShell: {
      width: '100%',
      maxWidth: 1220,
      alignSelf: 'center',
      flex: 1,
    },
    pageShellCompact: {
      paddingBottom: 16,
    },
    header: {
      backgroundColor: theme.card,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 10,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
    },
    aiIconSmall: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#8B5CF620',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
    },
    generateButtonCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#8B5CF6',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    generateButtonCompactWide: {
      marginLeft: 'auto',
    },
    generateButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    linkRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    linkChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.primary + '66',
      backgroundColor: theme.primary + '10',
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    linkChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    linkChipText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    linkChipTextActive: {
      color: '#fff',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      gap: 8,
    },
    loadingText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginTop: 16,
    },
    loadingSubtext: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 4,
    },
    emptyWrap: {
      margin: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 16,
      gap: 10,
      alignItems: 'flex-start',
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    emptyHint: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    libraryContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    libraryContent: {
      padding: 16,
      gap: 10,
      paddingBottom: 36,
    },
    revisionCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 12,
      gap: 8,
    },
    revisionCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '12',
    },
    revisionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    revisionHeaderCompact: {
      flexWrap: 'wrap',
    },
    revisionTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '800',
    },
    revisionMeta: {
      color: theme.textSecondary,
      fontSize: 11,
      marginTop: 2,
      textTransform: 'capitalize',
    },
    statusBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    statusBadgeText: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    changelogPreview: {
      color: theme.textSecondary,
      fontSize: 12,
      lineHeight: 16,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    actionBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.primary + '66',
      backgroundColor: theme.primary + '10',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    actionBtnText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
    },
  });
