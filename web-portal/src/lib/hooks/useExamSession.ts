/**
 * useExamSession Hook
 * 
 * Manages exam session persistence to database.
 * Saves generated exams and tracks user progress.
 */

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ExamSession {
  id: string;
  examData: any;  // Parsed exam structure from examParser
  userAnswers: Record<string, string>;
  submitted: boolean;
  score: { earned: number; total: number } | null;
  startedAt: string;
  completedAt?: string;
}

export interface ExamProgress {
  id: string;
  examTitle: string;
  grade: string;
  subject: string;
  scoreObtained: number;
  scoreTotal: number;
  percentage: number;
  completedAt: string;
}

export function useExamSession(generationId: string | null) {
  const supabase = createClient();
  const [session, setSession] = useState<ExamSession | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Load existing exam generation on mount
  useEffect(() => {
    if (!generationId) {
      setLoading(false);
      return;
    }
    
    const loadSession = async () => {
      try {
        const { data, error } = await supabase
          .from('exam_generations')
          .select('*')
          .eq('id', generationId)
          .single();
        
        if (error) {
          console.error('[useExamSession] Load error:', error);
          setLoading(false);
          return;
        }
        
        if (data) {
          setSession({
            id: data.id,
            examData: JSON.parse(data.generated_content),
            userAnswers: {},
            submitted: false,
            score: null,
            startedAt: data.created_at
          });
        }
      } catch (err) {
        console.error('[useExamSession] Exception:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadSession();
  }, [generationId]);
  
  /**
   * Save a new exam generation to database
   * Returns the generation ID
   */
  const saveExamGeneration = async (
    examData: any,
    prompt: string,
    title: string,
    grade?: string,
    subject?: string
  ): Promise<string | null> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('[useExamSession] Not authenticated');
        return null;
      }
      
      // First check if user profile exists
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', sessionData.session.user.id)
        .single();
      
      if (profileError) {
        console.error('[useExamSession] Profile check error:', profileError);
        console.error('[useExamSession] User ID:', sessionData.session.user.id);
        console.error('[useExamSession] ⚠️ Profile may not exist. Please ensure user has completed onboarding.');
        return null;
      }
      
      console.log('[useExamSession] User profile found:', {
        userId: profileData.id,
        role: profileData.role
      });
      
      // Prepare the data to insert
      const insertData = {
        user_id: sessionData.session.user.id,
        grade: grade || examData?.grade || 'Grade 10',
        subject: subject || examData?.subject || 'General',
        exam_type: 'practice_test' as const,
        prompt: prompt || 'Generated exam',
        generated_content: typeof examData === 'string' ? examData : JSON.stringify(examData),
        display_title: title || 'Practice Exam',
        status: 'completed' as const,
        model_used: 'claude-3-5-sonnet-20240620',
        viewed_at: new Date().toISOString(),
        metadata: {
          source: 'interactive_exam',
          generated_at: new Date().toISOString()
        }
      };
      
      console.log('[useExamSession] Saving exam generation:', {
        userId: insertData.user_id,
        grade: insertData.grade,
        subject: insertData.subject,
        title: insertData.display_title
      });
      
      const { data, error } = await supabase
        .from('exam_generations')
        .insert(insertData)
        .select()
        .single();
      
      if (error) {
        console.error('[useExamSession] Save generation error:', error);
        console.error('[useExamSession] Error code:', error.code);
        console.error('[useExamSession] Error message:', error.message);
        console.error('[useExamSession] Error details:', error.details);
        console.error('[useExamSession] Error hint:', error.hint);
        console.error('[useExamSession] Full error object:', JSON.stringify(error, null, 2));
        
        // Provide helpful debugging info
        if (error.code === 'PGRST116') {
          console.error('[useExamSession] ❌ RLS Policy Violation: User does not have INSERT permission on exam_generations');
          console.error('[useExamSession] 💡 This usually means:');
          console.error('[useExamSession]    1. User profile does not exist in profiles table');
          console.error('[useExamSession]    2. RLS policies are too restrictive');
          console.error('[useExamSession]    3. User is not authenticated properly');
        }
        
        return null;
      }
      
      console.log('[useExamSession] ✅ Exam generation saved successfully:', data.id);
      return data.id;
    } catch (err) {
      console.error('[useExamSession] Exception during save:', err);
      return null;
    }
  };
  
  /**
   * Save user progress after exam submission
   */
  const saveProgress = async (
    answers: Record<string, string>,
    score: { earned: number; total: number },
    examTitle: string,
    grade: string,
    subject: string
  ): Promise<boolean> => {
    if (!session && !generationId) {
      console.warn('[useExamSession] No session or generationId');
      return false;
    }
    
    try {
      // Save to localStorage first as backup
      const backup = { answers, score, examTitle, grade, subject, timestamp: Date.now() };
      localStorage.setItem(`exam_backup_${generationId || 'temp'}`, JSON.stringify(backup));
      
      // Try to get session
      let { data: sessionData } = await supabase.auth.getSession();
      
      // If no session, try to refresh
      if (!sessionData.session) {
        console.warn('[useExamSession] No session found, attempting refresh...');
        const { data: refreshData } = await supabase.auth.refreshSession();
        
        if (!refreshData.session) {
          console.error('[useExamSession] Not authenticated after refresh');
          if (typeof window !== 'undefined') {
            alert('⚠️ Session expired. Your progress is saved locally. Please log in to sync to cloud.');
          }
          return false;
        }
        
        sessionData = refreshData;
      }
      
      const percentage = (score.earned / score.total) * 100;
      
      const { error } = await supabase.from('exam_user_progress').insert({
        user_id: sessionData.session.user.id,
        exam_generation_id: generationId || session?.id || null,
        grade,
        subject,
        exam_title: examTitle,
        score_obtained: score.earned,
        score_total: score.total,
        percentage,
        completed_at: new Date().toISOString(),
        section_scores: answers  // Store all answers as JSON
      });
      
      if (error) {
        console.error('[useExamSession] Save progress error:', error);
        if (typeof window !== 'undefined') {
          alert('❌ Could not sync progress to cloud. Your answers are saved locally.');
        }
        return false;
      }
      
      console.log(`[useExamSession] Progress saved: ${percentage.toFixed(1)}%`);
      
      // Clear localStorage backup on successful save
      localStorage.removeItem(`exam_backup_${generationId || 'temp'}`);
      
      return true;
    } catch (err) {
      console.error('[useExamSession] Exception:', err);
      return false;
    }
  };
  
  /**
   * Get user's exam history
   */
  const getExamHistory = async (): Promise<ExamProgress[]> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return [];
      
      const { data, error } = await supabase
        .from('exam_user_progress')
        .select('*')
        .eq('user_id', sessionData.session.user.id)
        .order('completed_at', { ascending: false })
        .limit(20);
      
      if (error) {
        console.error('[useExamSession] Get history error:', error);
        return [];
      }
      
      return (data || []).map((row: any) => ({
        id: row.id,
        examTitle: row.exam_title,
        grade: row.grade,
        subject: row.subject,
        scoreObtained: row.score_obtained,
        scoreTotal: row.score_total,
        percentage: row.percentage,
        completedAt: row.completed_at
      }));
    } catch (err) {
      console.error('[useExamSession] Exception:', err);
      return [];
    }
  };
  
  return {
    session,
    setSession,
    saveExamGeneration,
    saveProgress,
    getExamHistory,
    loading
  };
}
