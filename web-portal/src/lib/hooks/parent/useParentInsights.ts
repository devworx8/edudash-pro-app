/**
 * useParentInsights (Web)
 *
 * Fetches AI-powered proactive insights for the active child.
 * Uses Supabase client to query student performance data and
 * generates insights locally (same logic as mobile ProactiveInsightsService).
 *
 * ≤200 lines (WARP-compliant)
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ProactiveInsight {
  id: string;
  type: 'strength' | 'concern' | 'prediction' | 'suggestion' | 'celebration';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action_items?: Array<{ title: string; description: string }>;
  caps_topics?: string[];
  created_at: string;
}

export interface PredictiveAlert {
  id: string;
  alert_type: string;
  severity: 'urgent' | 'warning' | 'info';
  title: string;
  message: string;
  recommended_actions: string[];
  created_at: string;
}

interface UseParentInsightsOptions {
  studentId: string | null;
  organizationId: string | null;
  autoFetch?: boolean;
}

interface UseParentInsightsReturn {
  insights: ProactiveInsight[];
  alerts: PredictiveAlert[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasUrgent: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { insights: ProactiveInsight[]; alerts: PredictiveAlert[]; ts: number }>();

export function useParentInsights({
  studentId,
  organizationId,
  autoFetch = true,
}: UseParentInsightsOptions): UseParentInsightsReturn {
  const supabase = useMemo(() => createClient(), []);
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [alerts, setAlerts] = useState<PredictiveAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const fetchInsights = useCallback(async () => {
    if (!studentId || !organizationId) {
      setInsights([]);
      setAlerts([]);
      return;
    }

    const key = `${organizationId}:${studentId}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setInsights(cached.insights);
      setAlerts(cached.alerts);
      return;
    }

    cancelRef.current = false;
    setLoading(true);
    setError(null);

    try {
      // Fetch student + reports + homework in parallel
      const [studentRes, reportsRes, homeworkRes, assessmentsRes] = await Promise.all([
        supabase.from('students').select('first_name, last_name, grade').eq('id', studentId).single(),
        supabase.from('progress_reports').select('strengths, areas_for_improvement, attendance_summary').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1),
        supabase.from('homework_submissions').select('status').eq('student_id', studentId),
        supabase.from('assessments').select('title, due_date, assessment_type').eq('organization_id', organizationId).gte('due_date', new Date().toISOString()).order('due_date', { ascending: true }).limit(3),
      ]);

      if (cancelRef.current) return;

      const student = studentRes.data;
      const report = reportsRes.data?.[0];
      const homework = homeworkRes.data || [];
      const assessments = assessmentsRes.data || [];

      const newInsights: ProactiveInsight[] = [];
      const newAlerts: PredictiveAlert[] = [];
      const studentName = student ? `${student.first_name} ${student.last_name}` : 'Your child';

      // Strengths insight
      if (report?.strengths) {
        const strengths = Array.isArray(report.strengths) ? report.strengths : [report.strengths];
        newInsights.push({
          id: `strength-${Date.now()}`, type: 'celebration', priority: 'medium',
          title: `${studentName} is excelling!`,
          description: `Strong performance in ${strengths.join(', ')}. Keep encouraging these areas!`,
          action_items: [{ title: 'Challenge them further', description: 'Explore advanced activities in these subjects' }],
          created_at: new Date().toISOString(),
        });
      }

      // Concerns insight
      if (report?.areas_for_improvement) {
        const struggles = Array.isArray(report.areas_for_improvement) ? report.areas_for_improvement : [report.areas_for_improvement];
        newInsights.push({
          id: `concern-${Date.now()}`, type: 'concern', priority: 'high',
          title: 'Areas needing attention',
          description: `${studentName} may need extra support in ${struggles.join(', ')}.`,
          action_items: [
            { title: 'Practice together', description: 'Spend 15 minutes daily on these topics' },
            { title: 'Talk to the teacher', description: 'Schedule a meeting to discuss support strategies' },
          ],
          caps_topics: struggles,
          created_at: new Date().toISOString(),
        });
      }

      // Homework completion
      const completed = homework.filter((hw: any) => hw.status === 'completed').length;
      const total = homework.length || 1;
      const rate = Math.round((completed / total) * 100);
      if (rate < 70) {
        newInsights.push({
          id: `homework-${Date.now()}`, type: 'prediction', priority: 'high',
          title: 'Homework completion needs improvement',
          description: `Current completion rate: ${rate}%. Consistent homework helps reinforce learning.`,
          action_items: [
            { title: 'Set a homework routine', description: 'Establish a fixed time and quiet space for homework' },
            { title: 'Break tasks into smaller steps', description: 'Help your child tackle homework in manageable chunks' },
          ],
          created_at: new Date().toISOString(),
        });
      }

      // Assessment alerts
      assessments.forEach((a: any) => {
        const days = Math.ceil((new Date(a.due_date).getTime() - Date.now()) / 86400000);
        newAlerts.push({
          id: `assessment-${a.title}`, alert_type: 'assessment_coming',
          severity: days <= 3 ? 'urgent' : 'info',
          title: `${a.assessment_type || 'Upcoming'} Assessment in ${days} days`,
          message: `${a.title} is coming up. Help your child prepare!`,
          recommended_actions: ['Review past work together', 'Create a study schedule', 'Practice with similar questions'],
          created_at: new Date().toISOString(),
        });
      });

      if (cancelRef.current) return;

      setInsights(newInsights);
      setAlerts(newAlerts);
      cache.set(key, { insights: newInsights, alerts: newAlerts, ts: Date.now() });
    } catch (err) {
      if (cancelRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [studentId, organizationId, supabase]);

  useEffect(() => {
    if (autoFetch) fetchInsights();
    return () => { cancelRef.current = true; };
  }, [fetchInsights, autoFetch]);

  const hasUrgent = insights.some((i) => i.priority === 'high') || alerts.some((a) => a.severity === 'urgent');

  return { insights, alerts, loading, error, refresh: fetchInsights, hasUrgent };
}
