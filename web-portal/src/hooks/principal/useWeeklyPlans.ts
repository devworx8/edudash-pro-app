import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { WeeklyPlan } from '@/types/ecd-planning';

export function useWeeklyPlans(preschoolId: string | undefined) {
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!preschoolId) {
      setLoading(false);
      return;
    }

    loadPlans();
  }, [preschoolId]);

  const loadPlans = async () => {
    if (!preschoolId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('weekly_plans')
        .select('*')
        .eq('preschool_id', preschoolId)
        .order('week_start_date', { ascending: false });

      if (fetchError) throw fetchError;
      setPlans(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error loading weekly plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const approvePlan = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error: updateError } = await supabase
        .from('weekly_plans')
        .update({
          status: 'approved',
          approved_by: session.user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
          rejected_at: null,
          rejected_by: null,
        })
        .eq('id', id);

      if (updateError) throw updateError;
      await loadPlans();
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  const rejectPlan = async (id: string, reason?: string) => {
    try {
      const trimmedReason = String(reason || '').trim();
      if (!trimmedReason) {
        throw new Error('Rejection reason is required.');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error: updateError } = await supabase
        .from('weekly_plans')
        .update({
          status: 'draft',
          rejection_reason: trimmedReason,
          rejected_at: new Date().toISOString(),
          rejected_by: session.user.id,
          // Clear approval/submission metadata on revision requests
          submitted_at: null,
          approved_by: null,
          approved_at: null,
        })
        .eq('id', id);

      if (updateError) throw updateError;
      await loadPlans();
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  return {
    plans,
    loading,
    error,
    approvePlan,
    rejectPlan,
    refetch: loadPlans,
  };
}
