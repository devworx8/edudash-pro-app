/**
 * useVisionAnalysis (Web)
 *
 * Hook to perform AI vision analysis on uploaded images via ai-gateway.
 * Converts File to base64 and calls the vision_analysis endpoint.
 *
 * ≤200 lines (WARP-compliant)
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface VisionAnalysisResult {
  caption: string;
  suggestedTags: string[];
  suggestedSubject: string | null;
  milestoneDetected: boolean;
  milestoneType?: string;
  developmentalInsight: string;
  celebrationSuggestion?: string;
}

interface UseVisionAnalysisReturn {
  analyze: (file: File, context?: string, subject?: string) => Promise<VisionAnalysisResult | null>;
  result: VisionAnalysisResult | null;
  loading: boolean;
  error: string | null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip "data:image/jpeg;base64," prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildVisionPrompt(context?: string, subject?: string): string {
  const parts = [
    'You are an early childhood education expert analyzing a photo of a child\'s work or activity.',
    'Analyze this image and respond in JSON format with these fields:',
    '- caption: A brief description of what you see',
    '- suggestedTags: Array of relevant educational tags',
    '- suggestedSubject: The most relevant school subject (mathematics, english, science, art, etc.) or null',
    '- milestoneDetected: Boolean whether this shows a developmental milestone',
    '- milestoneType: If milestone detected, what type (motor_skills, cognitive, social, creative, language, independence)',
    '- developmentalInsight: A brief insight about the child\'s development shown in this image',
    '- celebrationSuggestion: If notable achievement, a celebration message for the parent',
  ];
  if (context) parts.push(`Context from parent: "${context}"`);
  if (subject) parts.push(`Subject area: ${subject}`);
  parts.push('Respond ONLY with valid JSON, no markdown.');
  return parts.join('\n');
}

const FALLBACK_RESULT: VisionAnalysisResult = {
  caption: 'Image uploaded',
  suggestedTags: [],
  suggestedSubject: null,
  milestoneDetected: false,
  developmentalInsight: 'Keep encouraging creative expression!',
};

export function useVisionAnalysis(): UseVisionAnalysisReturn {
  const supabase = useMemo(() => createClient(), []);
  const [result, setResult] = useState<VisionAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(
    async (file: File, context?: string, subject?: string): Promise<VisionAnalysisResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const { data: session } = await supabase.auth.getSession();
        const accessToken = session?.session?.access_token;
        if (!accessToken) {
          setResult(FALLBACK_RESULT);
          return FALLBACK_RESULT;
        }

        const base64 = await fileToBase64(file);
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        const response = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            action: 'vision_analysis',
            image_base64: base64,
            media_type: file.type || 'image/jpeg',
            context: context || '',
            subject: subject || '',
            prompt: buildVisionPrompt(context, subject),
            max_tokens: 500,
          }),
        });

        if (!response.ok) {
          console.warn('Vision analysis failed, using fallback');
          setResult(FALLBACK_RESULT);
          return FALLBACK_RESULT;
        }

        const data = await response.json();
        const content = data.content || data.text || '';

        // Try to parse JSON from AI response
        let parsed: VisionAnalysisResult;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : FALLBACK_RESULT;
        } catch {
          parsed = { ...FALLBACK_RESULT, caption: content.slice(0, 200) };
        }

        setResult(parsed);
        return parsed;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Vision analysis failed';
        console.error('[useVisionAnalysis]', err);
        setError(msg);
        setResult(FALLBACK_RESULT);
        return FALLBACK_RESULT;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  return { analyze, result, loading, error };
}
