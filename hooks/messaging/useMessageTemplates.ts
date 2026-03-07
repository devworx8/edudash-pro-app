/**
 * useMessageTemplates — Merges default templates with org-specific custom templates.
 * Returns templates grouped by category, with search/filter support.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type MessageTemplate,
  type TemplateCategory,
} from '@/lib/messaging/defaultTemplates';

interface CustomTemplate {
  id: string;
  category: TemplateCategory;
  title: string;
  body: string;
  variables: string[];
  is_active: boolean;
}

export function useMessageTemplates() {
  const { profile } = useAuth();
  const orgId = (profile as any)?.organization_id || (profile as any)?.preschool_id;
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
  const [search, setSearch] = useState('');

  // Fetch custom templates from DB
  const { data: customTemplates } = useQuery({
    queryKey: ['message-templates', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const client = assertSupabase();
      const { data, error } = await client
        .from('message_templates')
        .select('id, category, title, body, variables, is_active')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('title');
      if (error) throw error;
      return (data || []) as CustomTemplate[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // Merge defaults + custom
  const allTemplates = useMemo(() => {
    const custom: MessageTemplate[] = (customTemplates || []).map((t) => ({
      id: t.id,
      category: t.category,
      title: t.title,
      body: t.body,
      variables: t.variables || [],
    }));
    return [...DEFAULT_TEMPLATES, ...custom];
  }, [customTemplates]);

  // Filter by category + search
  const filteredTemplates = useMemo(() => {
    let result = allTemplates;
    if (selectedCategory) {
      result = result.filter((t) => t.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allTemplates, selectedCategory, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<TemplateCategory, MessageTemplate[]>();
    for (const t of filteredTemplates) {
      const list = map.get(t.category) || [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [filteredTemplates]);

  return {
    templates: filteredTemplates,
    grouped,
    categories: TEMPLATE_CATEGORIES,
    selectedCategory,
    setSelectedCategory,
    search,
    setSearch,
  };
}
