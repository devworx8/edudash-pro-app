import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LessonTemplate } from '@/types/ecd-planning';

export function useLessonTemplates(preschoolId: string | undefined) {
  const [templates, setTemplates] = useState<LessonTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!preschoolId) {
      setLoading(false);
      return;
    }

    loadTemplates();
  }, [preschoolId]);

  const loadTemplates = async () => {
    if (!preschoolId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('lesson_templates')
        .select('*')
        .eq('preschool_id', preschoolId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setTemplates(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error loading lesson templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const createTemplate = async (template: Partial<LessonTemplate>) => {
    if (!preschoolId) throw new Error('Preschool ID required');

    try {
      const { data, error: insertError } = await supabase
        .from('lesson_templates')
        .insert({
          preschool_id: preschoolId,
          ...template,
          template_structure: template.template_structure || {
            sections: [
              { name: 'Learning Objectives', required: true },
              { name: 'Materials Needed', required: true },
              { name: 'Introduction', required: true },
              { name: 'Main Activity', required: true },
              { name: 'Conclusion', required: true },
            ],
          },
        })
        .select()
        .single();

      if (insertError) throw insertError;
      await loadTemplates();
      return data;
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  const updateTemplate = async (id: string, updates: Partial<LessonTemplate>) => {
    try {
      const { error: updateError } = await supabase
        .from('lesson_templates')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;
      await loadTemplates();
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('lesson_templates')
        .update({ is_active: false })
        .eq('id', id);

      if (deleteError) throw deleteError;
      await loadTemplates();
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  return {
    templates,
    loading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    refetch: loadTemplates,
  };
}
