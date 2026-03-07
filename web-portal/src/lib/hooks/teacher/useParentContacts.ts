'use client';

/**
 * Hook for fetching parent contacts for a teacher
 * Extracted from ParentContactsWidget.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Parent } from '@/components/dashboard/teacher/parent-contacts/types';

interface UseParentContactsReturn {
  parents: Parent[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useParentContacts(
  preschoolId: string | undefined,
  teacherId: string | undefined,
  classIds?: string[]
): UseParentContactsReturn {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchParents = useCallback(async () => {
    if (!preschoolId || !teacherId) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Get teacher's classes
      const { data: teacherClasses, error: classesError } = await supabase
        .from('classes').select('id').eq('teacher_id', teacherId).eq('preschool_id', preschoolId);
      if (classesError) throw classesError;

      const teacherClassIds = teacherClasses?.map((c: any) => c.id) || [];
      if (teacherClassIds.length === 0) { setParents([]); setLoading(false); return; }

      // Build students query — find students with ANY parent link (parent_id or guardian_id)
      let studentsQuery = supabase.from('students')
        .select('id, first_name, last_name, date_of_birth, class_id, parent_id, guardian_id')
        .eq('preschool_id', preschoolId)
        .in('class_id', teacherClassIds)
        .or('parent_id.not.is.null,guardian_id.not.is.null');

      if (classIds && classIds.length > 0) {
        const filteredClassIds = teacherClassIds.filter((id: any) => classIds.includes(id));
        studentsQuery = studentsQuery.in('class_id', filteredClassIds);
      }

      const { data: students, error: studentsError } = await studentsQuery;
      if (studentsError) throw studentsError;
      if (!students || students.length === 0) { setParents([]); setLoading(false); return; }

      // Collect both parent_id and guardian_id
      const parentIds = [...new Set(
        students.flatMap((s: any) => [s.parent_id, s.guardian_id].filter(Boolean))
      )] as string[];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles').select('id, email, first_name, last_name, phone').in('id', parentIds);
      if (profilesError) throw profilesError;

      const parentsMap = new Map<string, Parent>();
      profiles?.forEach((profile: any) => {
        parentsMap.set(profile.id, {
          id: profile.id,
          email: profile.email || '',
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          phone: profile.phone,
          students: students.filter((s: any) => s.parent_id === profile.id),
        });
      });

      const finalParents = Array.from(parentsMap.values()).sort((a, b) => 
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      );
      setParents(finalParents);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [preschoolId, teacherId, classIds]);

  useEffect(() => {
    if (preschoolId && teacherId) fetchParents();
  }, [preschoolId, teacherId, classIds, fetchParents]);

  return { parents, loading, error, refetch: fetchParents };
}
