/**
 * Exam Storage Service
 *
 * Persists AI-generated exams to the `exam_history` Supabase table and
 * provides helpers for listing and deleting past exams.
 */

import { createClient } from '@/lib/supabase/client';

export interface ExamHistoryRecord {
  id: string;
  user_id: string;
  organization_id: string | null;
  grade: string | null;
  subject: string | null;
  exam_type: string | null;
  language: string | null;
  term: number | null;
  topics: string[] | null;
  content: string;
  title: string | null;
  created_at: string;
}

export interface SaveExamParams {
  userId: string;
  organizationId?: string;
  grade?: string;
  subject?: string;
  examType?: string;
  language?: string;
  term?: number;
  topics?: string[];
  content: string;
  title?: string;
}

/**
 * Save a generated exam to the exam_history table.
 *
 * @returns The newly created record, or throws on error.
 */
export async function saveExam(
  params: SaveExamParams,
): Promise<ExamHistoryRecord> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('exam_history')
    .insert({
      user_id: params.userId,
      organization_id: params.organizationId ?? null,
      grade: params.grade ?? null,
      subject: params.subject ?? null,
      exam_type: params.examType ?? null,
      language: params.language ?? null,
      term: params.term ?? null,
      topics: params.topics ?? null,
      content: params.content,
      title: params.title ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[examStorage] saveExam failed:', error);
    throw error;
  }

  return data as ExamHistoryRecord;
}

/**
 * List past exams for the current user, newest first.
 *
 * @param limit  Max records to return (default 50).
 * @param offset Pagination offset (default 0).
 */
export async function listExams(
  limit = 50,
  offset = 0,
): Promise<ExamHistoryRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('exam_history')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[examStorage] listExams failed:', error);
    throw error;
  }

  return (data ?? []) as ExamHistoryRecord[];
}

/**
 * Delete an exam by its ID. RLS ensures only the owner can delete.
 */
export async function deleteExam(examId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('exam_history')
    .delete()
    .eq('id', examId);

  if (error) {
    console.error('[examStorage] deleteExam failed:', error);
    throw error;
  }
}

/**
 * Delete exams older than a given number of days for the current user.
 *
 * @param olderThanDays  Number of days. Records created before this
 *                       threshold are removed.
 * @returns              The count of deleted rows (may be 0).
 */
export async function deleteOldExams(
  olderThanDays: number,
): Promise<number> {
  const supabase = createClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const { data, error } = await supabase
    .from('exam_history')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select('id');

  if (error) {
    console.error('[examStorage] deleteOldExams failed:', error);
    throw error;
  }

  return data?.length ?? 0;
}
