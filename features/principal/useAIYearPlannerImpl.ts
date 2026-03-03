// Hook for Principal AI Year Planner — generation + persistence + revision library

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { assertSupabase } from '@/lib/supabase';
import { generateMockYearPlan } from '@/lib/utils/mock-year-plan';
import type {
  YearPlanConfig,
  GeneratedYearPlan,
} from '@/components/principal/ai-planner/types';
import { normalizeGeneratedPlan } from './year-planner/normalizers';
import { injectSAHolidaysIntoMonthlyEntries } from './year-planner/saHolidays';
import {
  generateYearPlanViaAI,
  isAuthRelatedErrorMessage,
} from './year-planner/generation';
import {
  mapPlanToRpcPayload,
  persistTermsAndThemesFallback,
  loadTermIdMap,
  persistExcursionsMeetingsAndEvents,
} from './year-planner/persistence';
import {
  createYearPlanRevision,
  getYearPlanRevisionById,
  listYearPlanRevisions,
  updateYearPlanRevision,
  type YearPlanRevision,
} from '@/lib/services/yearPlanRevisionService';

interface UseAIYearPlannerOptions {
  organizationId?: string;
  userId?: string;
  onShowAlert?: (config: {
    title: string;
    message?: string;
    type?: 'info' | 'warning' | 'success' | 'error';
    buttons?: Array<{
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>;
  }) => void;
}

type PersistPlanStats = {
  termsSaved: number;
  themesSaved: number;
  monthlySaved: number;
  syncedEvents: number;
  syncedMeetings: number;
  syncedExcursions: number;
  usedRpc: boolean;
  usedV2: boolean;
};

interface UseAIYearPlannerReturn {
  generatedPlan: GeneratedYearPlan | null;
  isGenerating: boolean;
  isSaving: boolean;
  expandedTerm: number | null;
  revisions: YearPlanRevision[];
  revisionsLoading: boolean;
  activeRevisionId: string | null;
  setExpandedTerm: (termNumber: number | null) => void;
  generateYearPlan: (config: YearPlanConfig) => Promise<void>;
  savePlanToDatabase: () => Promise<void>;
  refreshRevisions: () => Promise<void>;
  loadRevisionIntoEditor: (revisionId: string) => Promise<void>;
  duplicateRevision: (revisionId: string) => Promise<void>;
  republishRevision: (revisionId: string) => Promise<void>;
  updatePlan: (updater: (plan: GeneratedYearPlan) => GeneratedYearPlan) => void;
}

function buildFallbackConfig(
  plan: GeneratedYearPlan,
  existingConfig?: YearPlanConfig | null,
): YearPlanConfig {
  if (existingConfig) return existingConfig;
  return {
    academicYear: plan.academicYear,
    numberOfTerms: plan.terms.length || 4,
    ageGroups: ['3-4', '4-5', '5-6'],
    focusAreas: ['Language Development', 'Numeracy & Math', 'Physical Development'],
    planningFramework: 'caps_ncf_hybrid',
    strictTemplateMode: false,
    separateAgeGroupTracks: true,
    includeExcursions: true,
    includeMeetings: true,
    includeAssessmentGuidance: true,
    includeInclusionAdaptations: true,
    includeHomeLinkExtensions: true,
    budgetLevel: 'medium',
    principalRules: '',
    specialConsiderations: '',
  };
}

export function useAIYearPlanner({
  organizationId,
  userId,
  onShowAlert,
}: UseAIYearPlannerOptions): UseAIYearPlannerReturn {
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedYearPlan | null>(null);
  const [generationConfig, setGenerationConfig] = useState<YearPlanConfig | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedTerm, setExpandedTerm] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<YearPlanRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);

  const showPlannerAlert = useCallback(
    (config: {
      title: string;
      message?: string;
      type?: 'info' | 'warning' | 'success' | 'error';
      buttons?: Array<{
        text: string;
        onPress?: () => void;
        style?: 'default' | 'cancel' | 'destructive';
      }>;
    }) => {
      if (onShowAlert) {
        onShowAlert(config);
        return;
      }
      Alert.alert(config.title, config.message || '', config.buttons as any);
    },
    [onShowAlert],
  );

  const refreshRevisions = useCallback(async () => {
    if (!organizationId) {
      setRevisions([]);
      return;
    }

    setRevisionsLoading(true);
    try {
      const rows = await listYearPlanRevisions({
        preschoolId: organizationId,
        limit: 120,
      });
      setRevisions(rows);
    } catch (error) {
      console.warn('[AI Year Planner] Failed to load revision library:', error);
    } finally {
      setRevisionsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshRevisions();
  }, [refreshRevisions]);

  const persistPlanToDatabase = useCallback(async (
    plan: GeneratedYearPlan,
    config: YearPlanConfig,
  ): Promise<PersistPlanStats> => {
    if (!organizationId || !userId) {
      throw new Error('Missing profile details to persist year plan.');
    }

    const supabase = assertSupabase();
    let termsSaved = 0;
    let themesSaved = 0;
    let monthlySaved = 0;
    let usedRpc = false;
    let usedV2 = false;
    let syncedEvents = 0;
    let syncedMeetings = 0;
    let syncedExcursions = 0;

    try {
      const { data, error } = await supabase.rpc('save_ai_year_plan_v2', {
        p_preschool_id: organizationId,
        p_created_by: userId,
        p_plan: mapPlanToRpcPayload(plan, config),
        p_sync_calendar: true,
      });
      if (error) throw error;
      usedRpc = true;
      usedV2 = true;
      termsSaved = Number((data as any)?.terms_saved) || plan.terms.length;
      themesSaved = Number((data as any)?.themes_saved) || 0;
      monthlySaved = Number((data as any)?.monthly_entries_saved) || plan.monthlyEntries.length;
      syncedEvents = Number((data as any)?.events_synced) || 0;
      syncedMeetings = Number((data as any)?.meetings_synced) || 0;
      syncedExcursions = Number((data as any)?.excursions_synced) || 0;
    } catch (v2Error) {
      try {
        const { data, error } = await supabase.rpc('save_ai_year_plan', {
          p_preschool_id: organizationId,
          p_created_by: userId,
          p_plan: mapPlanToRpcPayload(plan, config),
        });
        if (error) throw error;
        usedRpc = true;
        termsSaved = Number((data as any)?.terms_saved) || plan.terms.length;
        themesSaved = Number((data as any)?.themes_saved) || 0;
        monthlySaved = plan.monthlyEntries.length;
      } catch (legacyRpcError) {
        console.warn('Year plan RPC unavailable, using fallback persistence:', { v2Error, legacyRpcError });
        const fallbackSaved = await persistTermsAndThemesFallback({
          organizationId,
          userId,
          plan,
          config,
        });
        termsSaved = fallbackSaved.termsSaved;
        themesSaved = fallbackSaved.themesSaved;
        monthlySaved = plan.monthlyEntries.length;
      }
    }

    if (!usedV2) {
      const termIdMap = await loadTermIdMap({
        organizationId,
        academicYear: plan.academicYear,
        termNumbers: plan.terms.map((term) => term.termNumber),
      });
      const extraSaved = await persistExcursionsMeetingsAndEvents({
        organizationId,
        userId,
        plan,
        config,
        termIdMap,
      });
      syncedExcursions = extraSaved.excursionsSaved;
      syncedMeetings = extraSaved.meetingsSaved;
      syncedEvents = extraSaved.specialEventsSaved;
    }

    return {
      termsSaved,
      themesSaved,
      monthlySaved,
      syncedEvents,
      syncedMeetings,
      syncedExcursions,
      usedRpc,
      usedV2,
    };
  }, [organizationId, userId]);

  // ── Generate → Normalize → Inject SA holidays → Display ────────────────

  const generateYearPlan = useCallback(
    async (config: YearPlanConfig) => {
      if (config.ageGroups.length === 0) {
        showPlannerAlert({ title: 'Validation Error', message: 'Please select at least one age group', type: 'warning' });
        return;
      }
      if (config.focusAreas.length === 0) {
        showPlannerAlert({ title: 'Validation Error', message: 'Please select at least one focus area', type: 'warning' });
        return;
      }

      setIsGenerating(true);

      try {
        const { parsed, rawTermCount } = await generateYearPlanViaAI({
          config,
          organizationId,
        });

        let normalized = normalizeGeneratedPlan(parsed, config);
        normalized = {
          ...normalized,
          monthlyEntries: injectSAHolidaysIntoMonthlyEntries(
            normalized.monthlyEntries,
            config.academicYear,
          ),
        };

        setGeneratedPlan(normalized);
        setGenerationConfig(config);
        setExpandedTerm(normalized.terms[0]?.termNumber ?? null);
        setActiveRevisionId(null);

        if (rawTermCount !== config.numberOfTerms) {
          showPlannerAlert({
            title: 'Plan normalized',
            message: `Dash returned ${rawTermCount || 0} term(s). The planner normalized this to ${config.numberOfTerms} term(s) so all quarters are fully wired.`,
            type: 'info',
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
        console.error('AI generation error:', error);

        if (isAuthRelatedErrorMessage(errorMessage)) {
          showPlannerAlert({
            title: 'Session expired',
            message: 'Please sign in again, then generate the year plan again.',
            type: 'error',
            buttons: [{ text: 'OK' }],
          });
          return;
        }

        if (__DEV__) {
          console.warn('[AI Year Planner] Falling back to demo plan due to generation error:', errorMessage);
        }

        let mockPlan = normalizeGeneratedPlan(generateMockYearPlan(config), config);
        mockPlan = {
          ...mockPlan,
          monthlyEntries: injectSAHolidaysIntoMonthlyEntries(
            mockPlan.monthlyEntries,
            config.academicYear,
          ),
        };

        setGeneratedPlan(mockPlan);
        setGenerationConfig(config);
        setExpandedTerm(mockPlan.terms[0]?.termNumber ?? null);
        setActiveRevisionId(null);

        showPlannerAlert({
          title: 'Using Demo Plan',
          message: 'AI service unavailable. Showing a sample plan instead.',
          type: 'warning',
          buttons: [{ text: 'OK' }],
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [organizationId, showPlannerAlert],
  );

  const savePlanToDatabase = useCallback(async () => {
    if (!generatedPlan || !organizationId || !userId) {
      showPlannerAlert({ title: 'Missing details', message: 'Please generate a plan and ensure your profile is loaded.', type: 'warning' });
      return;
    }

    const config = buildFallbackConfig(generatedPlan, generationConfig);
    const normalizedPlan = normalizeGeneratedPlan(generatedPlan, config);
    setGeneratedPlan(normalizedPlan);
    setIsSaving(true);

    try {
      const stats = await persistPlanToDatabase(normalizedPlan, config);

      const createdRevision = await createYearPlanRevision({
        preschoolId: organizationId,
        createdBy: userId,
        academicYear: normalizedPlan.academicYear,
        planPayload: normalizedPlan,
        status: 'draft',
        changelog: activeRevisionId
          ? `Edited from revision ${activeRevisionId}`
          : 'Initial saved draft from AI planner',
        republishedFromRevisionId: activeRevisionId || null,
      });
      setActiveRevisionId(createdRevision.id);
      await refreshRevisions();

      const runPublishPlan = async () => {
        try {
          const supabase = assertSupabase();
          const { data, error } = await supabase.rpc('publish_year_plan', {
            p_preschool_id: organizationId,
            p_academic_year: normalizedPlan.academicYear,
          });
          if (error) throw error;

          await updateYearPlanRevision({
            revisionId: createdRevision.id,
            preschoolId: organizationId,
            status: 'published',
            publishedAt: new Date().toISOString(),
            changelog: createdRevision.changelog || 'Published from AI planner',
          });
          await refreshRevisions();

          const d = data as {
            themes_published?: number;
          };
          showPlannerAlert({
            title: 'Plan published',
            message: `${d?.themes_published ?? 0} theme(s) are now visible to teachers for lesson alignment.`,
            type: 'success',
            buttons: [
              { text: 'View Terms', onPress: () => router.push('/screens/principal-year-planner') },
              { text: 'OK' },
            ],
          });
        } catch (err) {
          showPlannerAlert({
            title: 'Publish failed',
            message: err instanceof Error ? err.message : 'Could not publish plan.',
            type: 'error',
          });
        }
      };

      showPlannerAlert({
        title: 'Success',
        message: [
          `Year plan saved successfully (${stats.usedV2 ? 'v2 monthly model' : stats.usedRpc ? 'legacy transactional' : 'fallback'} mode).`,
          `Terms: ${stats.termsSaved}`,
          `Weekly themes: ${stats.themesSaved}`,
          `Monthly items: ${stats.monthlySaved}`,
          `Calendar sync - events: ${stats.syncedEvents}`,
          `Calendar sync - meetings: ${stats.syncedMeetings}`,
          `Calendar sync - excursions: ${stats.syncedExcursions}`,
          '',
          `Saved as revision v${createdRevision.version_no}.`,
          'Publish the plan so teachers can use these themes for lesson alignment.',
        ].join('\n'),
        type: 'success',
        buttons: [
          { text: 'View Terms', onPress: () => router.push('/screens/principal-year-planner') },
          { text: 'Publish plan', onPress: () => void runPublishPlan() },
          { text: 'OK' },
        ],
      });
    } catch (error: unknown) {
      console.error('Error saving plan:', error);
      showPlannerAlert({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save plan. Please try again.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    activeRevisionId,
    generatedPlan,
    generationConfig,
    organizationId,
    persistPlanToDatabase,
    refreshRevisions,
    showPlannerAlert,
    userId,
  ]);

  const loadRevisionIntoEditor = useCallback(async (revisionId: string) => {
    if (!organizationId) return;

    try {
      const revision = await getYearPlanRevisionById(revisionId, organizationId);
      if (!revision) {
        showPlannerAlert({
          title: 'Revision not found',
          message: 'This revision could not be loaded.',
          type: 'warning',
        });
        return;
      }

      const config = buildFallbackConfig(revision.plan_payload, generationConfig);
      const normalized = normalizeGeneratedPlan(revision.plan_payload, config);
      setGeneratedPlan(normalized);
      setGenerationConfig(config);
      setExpandedTerm(normalized.terms[0]?.termNumber ?? null);
      setActiveRevisionId(revision.id);
    } catch (error) {
      showPlannerAlert({
        title: 'Load failed',
        message: error instanceof Error ? error.message : 'Could not open this revision.',
        type: 'error',
      });
    }
  }, [generationConfig, organizationId, showPlannerAlert]);

  const duplicateRevision = useCallback(async (revisionId: string) => {
    if (!organizationId || !userId) return;

    try {
      const revision = await getYearPlanRevisionById(revisionId, organizationId);
      if (!revision) {
        showPlannerAlert({
          title: 'Revision not found',
          message: 'The selected revision no longer exists.',
          type: 'warning',
        });
        return;
      }

      const duplicate = await createYearPlanRevision({
        preschoolId: organizationId,
        createdBy: userId,
        academicYear: revision.academic_year,
        planPayload: revision.plan_payload,
        status: 'draft',
        changelog: `Duplicated from v${revision.version_no}`,
        republishedFromRevisionId: revision.id,
      });

      setActiveRevisionId(duplicate.id);
      setGeneratedPlan(duplicate.plan_payload);
      setGenerationConfig((prev) => buildFallbackConfig(duplicate.plan_payload, prev));
      setExpandedTerm(duplicate.plan_payload.terms[0]?.termNumber ?? null);
      await refreshRevisions();
      showPlannerAlert({
        title: 'Duplicated',
        message: `Revision v${revision.version_no} copied to new draft v${duplicate.version_no}.`,
        type: 'success',
      });
    } catch (error) {
      showPlannerAlert({
        title: 'Duplicate failed',
        message: error instanceof Error ? error.message : 'Could not duplicate revision.',
        type: 'error',
      });
    }
  }, [organizationId, refreshRevisions, showPlannerAlert, userId]);

  const republishRevision = useCallback(async (revisionId: string) => {
    if (!organizationId || !userId) return;

    setIsSaving(true);
    try {
      const revision = await getYearPlanRevisionById(revisionId, organizationId);
      if (!revision) {
        showPlannerAlert({
          title: 'Revision not found',
          message: 'The selected revision no longer exists.',
          type: 'warning',
        });
        return;
      }

      const config = buildFallbackConfig(revision.plan_payload, generationConfig);
      const normalized = normalizeGeneratedPlan(revision.plan_payload, config);
      await persistPlanToDatabase(normalized, config);

      const publishedRevision = await createYearPlanRevision({
        preschoolId: organizationId,
        createdBy: userId,
        academicYear: normalized.academicYear,
        planPayload: normalized,
        status: 'published',
        changelog: `Republished from v${revision.version_no}`,
        republishedFromRevisionId: revision.id,
      });

      const supabase = assertSupabase();
      const { error } = await supabase.rpc('publish_year_plan', {
        p_preschool_id: organizationId,
        p_academic_year: normalized.academicYear,
      });
      if (error) throw error;

      await updateYearPlanRevision({
        revisionId: publishedRevision.id,
        preschoolId: organizationId,
        status: 'published',
        publishedAt: new Date().toISOString(),
        changelog: publishedRevision.changelog,
      });

      setGeneratedPlan(normalized);
      setGenerationConfig(config);
      setExpandedTerm(normalized.terms[0]?.termNumber ?? null);
      setActiveRevisionId(publishedRevision.id);
      await refreshRevisions();

      showPlannerAlert({
        title: 'Republished',
        message: `Revision v${revision.version_no} was republished as v${publishedRevision.version_no}.`,
        type: 'success',
      });
    } catch (error) {
      showPlannerAlert({
        title: 'Republish failed',
        message: error instanceof Error ? error.message : 'Could not republish this revision.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    generationConfig,
    organizationId,
    persistPlanToDatabase,
    refreshRevisions,
    showPlannerAlert,
    userId,
  ]);

  const updatePlan = useCallback((updater: (plan: GeneratedYearPlan) => GeneratedYearPlan) => {
    setGeneratedPlan((prev) => (prev ? updater(prev) : prev));
  }, []);

  return {
    generatedPlan,
    isGenerating,
    isSaving,
    expandedTerm,
    revisions,
    revisionsLoading,
    activeRevisionId,
    setExpandedTerm,
    generateYearPlan,
    savePlanToDatabase,
    refreshRevisions,
    loadRevisionIntoEditor,
    duplicateRevision,
    republishRevision,
    updatePlan,
  };
}
