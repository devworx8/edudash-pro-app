/**
 * Shared helper to fetch all class IDs for a teacher.
 *
 * Checks both the `class_teachers` join table (lead + assistant) and the
 * legacy `classes.teacher_id` column, merges and deduplicates.
 *
 * Use this everywhere a teacher's classes must be resolved — it ensures
 * assistant teachers are never silently excluded.
 *
 * @module lib/dashboard/fetchTeacherClassIds
 */

import { assertSupabase } from '@/lib/supabase';

/**
 * Returns a deduplicated array of class IDs the teacher is assigned to.
 *
 * @param teacherId  The teacher's `profiles.id` (= `auth.uid()`)
 * @param schoolId   Optional school/org ID to scope legacy query
 */
export async function fetchTeacherClassIds(
  teacherId: string,
  schoolId?: string | null,
): Promise<string[]> {
  const supabase = assertSupabase();

  // 1. class_teachers join table (covers lead + assistant)
  const { data: joinRows } = await supabase
    .from('class_teachers')
    .select('class_id')
    .eq('teacher_id', teacherId);

  let joinIds = (joinRows || []).map((r: { class_id: string }) => r.class_id);

  // When schoolId is provided, scope join results to that school's classes
  if (schoolId && joinIds.length > 0) {
    const { data: scopedRows } = await supabase
      .from('classes')
      .select('id')
      .in('id', joinIds)
      .eq('preschool_id', schoolId);
    joinIds = (scopedRows || []).map((r: { id: string }) => r.id);
  }

  // 2. Legacy classes.teacher_id column
  let legacyQuery = supabase
    .from('classes')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('active', true);

  if (schoolId) {
    legacyQuery = legacyQuery.eq('preschool_id', schoolId);
  }

  const { data: legacyRows } = await legacyQuery;
  const legacyIds = (legacyRows || []).map((r: { id: string }) => r.id);

  // 3. Merge & deduplicate
  return [...new Set([...joinIds, ...legacyIds])];
}
