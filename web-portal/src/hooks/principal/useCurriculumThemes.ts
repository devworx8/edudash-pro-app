import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CurriculumTheme } from '@/types/ecd-planning';

export function useCurriculumThemes(preschoolId: string | undefined) {
  const [themes, setThemes] = useState<CurriculumTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!preschoolId) {
      setLoading(false);
      return;
    }

    loadThemes();
  }, [preschoolId]);

  const loadThemes = async () => {
    if (!preschoolId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('curriculum_themes')
        .select('*')
        .eq('preschool_id', preschoolId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setThemes(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error loading curriculum themes:', err);
    } finally {
      setLoading(false);
    }
  };

  const createTheme = async (theme: Partial<CurriculumTheme>) => {
    if (!preschoolId) throw new Error('Preschool ID required');

    try {
      const { data, error: insertError } = await supabase
        .from('curriculum_themes')
        .insert({
          preschool_id: preschoolId,
          ...theme,
          learning_objectives: theme.learning_objectives || [],
          key_concepts: theme.key_concepts || [],
          vocabulary_words: theme.vocabulary_words || [],
          suggested_activities: theme.suggested_activities || [],
          materials_needed: theme.materials_needed || [],
          developmental_domains: theme.developmental_domains || [],
          age_groups: theme.age_groups || ['3-6'],
        })
        .select()
        .single();

      if (insertError) throw insertError;
      await loadThemes();
      return data;
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  const updateTheme = async (id: string, updates: Partial<CurriculumTheme>) => {
    try {
      const { error: updateError } = await supabase
        .from('curriculum_themes')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;
      await loadThemes();
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  const deleteTheme = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('curriculum_themes')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      await loadThemes();
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  return {
    themes,
    loading,
    error,
    createTheme,
    updateTheme,
    deleteTheme,
    refetch: loadThemes,
  };
}
