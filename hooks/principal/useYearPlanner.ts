// Custom hook for year planner - WARP.md compliant (≤200 lines)

import { useState, useEffect, useCallback } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { AcademicTerm } from '@/types/ecd-planning';
import type {
  TermFormData,
  YearPlannerState,
  YearPlannerActions,
  YearPlanMonthlyEntryRow,
} from '@/components/principal/year-planner/types';

type ShowAlert = (config: { title: string; message?: string; type?: 'info' | 'warning' | 'success' | 'error'; buttons?: Array<{ text: string; onPress?: () => void | Promise<void>; style?: 'default' | 'cancel' | 'destructive' }> }) => void;

interface UseYearPlannerProps {
  orgId: string | null;
  userId: string | undefined;
  showAlert: ShowAlert;
}

interface UseYearPlannerReturn extends YearPlannerState, YearPlannerActions {}

export function useYearPlanner({ orgId, userId, showAlert }: UseYearPlannerProps): UseYearPlannerReturn {
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [monthlyEntries, setMonthlyEntries] = useState<YearPlanMonthlyEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTerms = useCallback(async () => {
    if (!orgId) return;

    try {
      const supabase = assertSupabase();
      const [termsRes, entriesRes] = await Promise.all([
        supabase
          .from('academic_terms')
          .select('*')
          .eq('preschool_id', orgId)
          .order('academic_year', { ascending: false })
          .order('term_number', { ascending: true }),
        supabase
          .from('year_plan_monthly_entries')
          .select('id, preschool_id, academic_year, month_index, bucket, subtype, title, details, start_date, end_date, is_published')
          .eq('preschool_id', orgId)
          .order('academic_year', { ascending: false })
          .order('month_index', { ascending: true }),
      ]);

      if (termsRes.error) throw termsRes.error;
      setTerms(termsRes.data || []);

      if (entriesRes.error) throw entriesRes.error;
      setMonthlyEntries((entriesRes.data as YearPlanMonthlyEntryRow[]) || []);
    } catch (error: unknown) {
      logger.error('Error fetching year planner:', error);
      showAlert({ title: 'Error', message: 'Failed to load year planner', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTerms();
  };

  const handleSubmit = async (
    formData: TermFormData,
    editingTerm: AcademicTerm | null
  ): Promise<boolean> => {
    if (!formData.name.trim()) {
      showAlert({ title: 'Validation Error', message: 'Please enter a term name', type: 'warning' });
      return false;
    }

    if (!orgId || !userId) {
      showAlert({ title: 'Error', message: 'Organization or user not found', type: 'error' });
      return false;
    }

    try {
      const supabase = assertSupabase();

      const termData = {
        preschool_id: orgId,
        created_by: userId,
        name: formData.name.trim(),
        academic_year: formData.academic_year,
        term_number: formData.term_number,
        start_date: formData.start_date.toISOString().split('T')[0],
        end_date: formData.end_date.toISOString().split('T')[0],
        description: formData.description.trim() || null,
        is_active: formData.is_active,
        is_published: formData.is_published,
      };

      if (editingTerm) {
        const { error } = await supabase
          .from('academic_terms')
          .update(termData)
          .eq('id', editingTerm.id);

        if (error) throw error;
        showAlert({ title: 'Success', message: 'Term updated successfully', type: 'success' });
      } else {
        const { error } = await supabase.from('academic_terms').insert(termData);

        if (error) throw error;
        showAlert({ title: 'Success', message: 'Term created successfully', type: 'success' });
      }

      await fetchTerms();
      return true;
    } catch (error: any) {
      logger.error('Error saving term:', error);
      showAlert({ title: 'Error', message: error.message || 'Failed to save term', type: 'error' });
      return false;
    }
  };

  const handleDelete = (term: AcademicTerm) => {
    showAlert({
      title: 'Delete Term',
      message: `Are you sure you want to delete "${term.name}"?`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const supabase = assertSupabase();
              const { error } = await supabase.from('academic_terms').delete().eq('id', term.id);

              if (error) throw error;
              showAlert({ title: 'Success', message: 'Term deleted successfully', type: 'success' });
              fetchTerms();
            } catch (error: any) {
              logger.error('Error deleting term:', error);
              showAlert({ title: 'Error', message: 'Failed to delete term', type: 'error' });
            }
          },
        },
      ],
    });
  };

  const handleTogglePublish = async (term: AcademicTerm) => {
    try {
      const supabase = assertSupabase();
      const { error } = await supabase
        .from('academic_terms')
        .update({ is_published: !term.is_published })
        .eq('id', term.id);

      if (error) throw error;
      fetchTerms();
    } catch (error: any) {
      logger.error('Error toggling term publish:', error);
      showAlert({ title: 'Error', message: 'Failed to update term', type: 'error' });
    }
  };

  const handlePublishPlan = useCallback(
    async (academicYear?: number) => {
      if (!orgId) {
        showAlert({ title: 'Error', message: 'Organization not found', type: 'error' });
        return;
      }
      const year =
        academicYear ??
        (terms.length > 0
          ? Math.max(...terms.map((t) => t.academic_year))
          : new Date().getFullYear());
      try {
        const supabase = assertSupabase();
        const { data, error } = await supabase.rpc('publish_year_plan', {
          p_preschool_id: orgId,
          p_academic_year: year,
        });
        if (error) throw error;
        const d = data as { terms_published?: number; themes_published?: number };
        const termsCount = d?.terms_published ?? 0;
        const themesCount = d?.themes_published ?? 0;
        if (termsCount === 0 && themesCount === 0) {
          showAlert({
            title: 'No plan to publish',
            message: `No terms or themes found for ${year}. Save a plan from AI Year Planner first.`,
            type: 'warning',
          });
          return;
        }
        showAlert({
          title: 'Plan published',
          message: `${themesCount} theme(s) are now visible to teachers for lesson alignment.`,
          type: 'success',
        });
        fetchTerms();
      } catch (err: unknown) {
        showAlert({ title: 'Publish failed', message: err instanceof Error ? err.message : 'Could not publish plan.', type: 'error' });
      }
    },
    [orgId, terms, fetchTerms],
  );

  return {
    terms,
    monthlyEntries,
    loading,
    refreshing,
    fetchTerms,
    handleRefresh,
    handleSubmit,
    handleDelete,
    handleTogglePublish,
    handlePublishPlan,
  };
}
