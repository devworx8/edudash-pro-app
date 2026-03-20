// AI-assisted excursion planning hook
// Suggests learning objectives, items to bring, description based on destination + title

import { useState, useCallback } from 'react';
import { DashAIClient } from '@/services/dash-ai/DashAIClient';
import { assertSupabase } from '@/lib/supabase';
import type { AgeGroup } from '@/components/principal/excursions/types';

export interface AIExcursionSuggestions {
  description: string;
  learning_objectives: string[];
  items_to_bring: string[];
  estimated_cost: number;
  safety_tips: string[];
}

export function useExcursionAI() {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AIExcursionSuggestions | null>(null);

  const generateSuggestions = useCallback(async (
    title: string,
    destination: string,
    ageGroups: AgeGroup[],
  ): Promise<AIExcursionSuggestions | null> => {
    if (!title.trim() && !destination.trim()) return null;
    setLoading(true);
    setSuggestions(null);

    try {
      const supabase = assertSupabase();
      const client = new DashAIClient({
        supabaseClient: supabase,
        getUserProfile: () => undefined,
      });

      const ageContext = ageGroups.length > 0
        ? `Age groups: ${ageGroups.join(', ')}.`
        : 'Ages 0-5 (ECD).';

      const prompt = `You are an experienced South African ECD (Early Childhood Development) excursion planner.

A principal is planning an excursion:
- Title: "${title || 'School excursion'}"
- Destination: "${destination || 'local venue'}"
- ${ageContext}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "description": "A 2-3 sentence description suitable for parents, mentioning educational value and what children will experience",
  "learning_objectives": ["objective1", "objective2", "objective3", "objective4"],
  "items_to_bring": ["item1", "item2", "item3", "item4", "item5"],
  "estimated_cost": 50,
  "safety_tips": ["tip1", "tip2", "tip3"]
}

Learning objectives should align with NCF/CAPS developmental domains (physical, cognitive, social-emotional, creative).
Items should be practical for SA weather/context (sunscreen, hat, water bottle, etc).
Cost estimate in ZAR per child (reasonable for SA ECD).
Safety tips specific to the destination type.`;

      const response = await client.callAIService({
        content: prompt,
        serviceType: 'chat_message',
      });

      const text = response?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in AI response');

      const parsed = JSON.parse(jsonMatch[0]) as AIExcursionSuggestions;
      setSuggestions(parsed);
      return parsed;
    } catch (err) {
      console.warn('AI excursion suggestions failed:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions(null);
  }, []);

  return { loading, suggestions, generateSuggestions, clearSuggestions };
}
