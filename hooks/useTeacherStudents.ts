import { useQuery } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface TeacherStudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  className: string | null;
  classId: string | null;
  parentId: string | null;
  guardianId: string | null;
}

interface UseTeacherStudentsParams {
  teacherId: string | null | undefined;
  organizationId: string | null | undefined;
  limit?: number;
}

const fetchTeacherStudents = async (
  teacherId: string,
  organizationId: string | null | undefined,
  limit: number,
): Promise<TeacherStudentSummary[]> => {
  let query = assertSupabase()
    .from('classes')
    .select('id, name, preschool_id, organization_id, students(id, first_name, last_name, avatar_url, date_of_birth, is_active, parent_id, guardian_id)')
    .eq('teacher_id', teacherId)
    .eq('active', true);

  if (organizationId) {
    query = query.or(`preschool_id.eq.${organizationId},organization_id.eq.${organizationId}`);
  }

  const { data, error: queryError } = await query;
  if (queryError) throw new Error(queryError.message);

  const flattened: TeacherStudentSummary[] = [];
  const seen = new Set<string>();
  (data || []).forEach((cls) => {
    const className = cls.name || null;
    const classId = cls.id || null;
    (cls.students as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
      date_of_birth: string | null;
      is_active?: boolean | null;
      parent_id?: string | null;
      guardian_id?: string | null;
    }> | null || []).forEach((student) => {
      if (student.is_active === false) return;
      if (seen.has(student.id)) return;
      seen.add(student.id);
      flattened.push({
        id: student.id,
        firstName: student.first_name || 'Child',
        lastName: student.last_name || '',
        avatarUrl: student.avatar_url ?? null,
        dateOfBirth: student.date_of_birth ?? null,
        className,
        classId,
        parentId: student.parent_id ?? null,
        guardianId: student.guardian_id ?? null,
      });
    });
  });

  return limit > 0 ? flattened.slice(0, limit) : flattened;
};

export const useTeacherStudents = ({ teacherId, organizationId, limit = 4 }: UseTeacherStudentsParams) => {
  const { data: students = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['teacher-students', teacherId, organizationId, limit],
    queryFn: () => fetchTeacherStudents(teacherId!, organizationId, limit),
    enabled: !!teacherId,
    staleTime: 5 * 60 * 1000,
    meta: { errorHandler: (err: unknown) => logger.error('[useTeacherStudents] Failed:', err) },
  });

  return {
    students,
    loading,
    error: queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load students') : null,
    refresh: () => { refetch(); },
  };
};

export default useTeacherStudents;
