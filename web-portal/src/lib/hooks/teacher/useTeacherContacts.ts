'use client';

/**
 * Hook for fetching teacher contacts (parents and other teachers)
 * Extracted from TeacherContactsWidget.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Parent, Teacher } from '@/components/dashboard/teacher/teacher-contacts/types';

interface UseTeacherContactsReturn {
  parents: Parent[];
  teachers: Teacher[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTeacherContacts(
  preschoolId: string | undefined,
  teacherId: string | undefined
): UseTeacherContactsReturn {
  const [parents, setParents] = useState<Parent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchParents = useCallback(async () => {
    if (!preschoolId || !teacherId) return;
    const supabase = createClient();

    const { data: teacherClasses, error: classesError } = await supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', teacherId)
      .eq('preschool_id', preschoolId);
    
    if (classesError) throw classesError;
    
    const teacherClassIds = teacherClasses?.map((c: any) => c.id) || [];
    if (teacherClassIds.length === 0) { setParents([]); setLoading(false); return; }
    
    // Find students with ANY parent link (parent_id or guardian_id)
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, first_name, last_name, date_of_birth, class_id, parent_id, guardian_id')
      .eq('preschool_id', preschoolId)
      .in('class_id', teacherClassIds)
      .or('parent_id.not.is.null,guardian_id.not.is.null');
    
    if (studentsError) throw studentsError;
    if (!students || students.length === 0) { setParents([]); setLoading(false); return; }
    
    // Collect both parent_id and guardian_id
    const parentIds = [...new Set(
      students.flatMap((s: any) => [s.parent_id, s.guardian_id].filter(Boolean))
    )] as string[];
    
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, phone')
      .in('id', parentIds);
    
    if (profilesError) throw profilesError;
    
    const parentsData: Parent[] = (profiles || []).map((profile: any) => ({
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone,
      students: students.filter((s: any) => s.parent_id === profile.id),
    }));
    
    setParents(parentsData);
  }, [preschoolId, teacherId]);

  const fetchTeachers = useCallback(async () => {
    if (!preschoolId || !teacherId) return;
    const supabase = createClient();

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, phone, role, preschool_id')
      .eq('preschool_id', preschoolId)
      .in('role', ['teacher', 'principal'])
      .neq('id', teacherId);
    
    if (profilesError) throw profilesError;
    
    const teachersData: Teacher[] = [];
    for (const profile of profiles || []) {
      const { data: teacherClasses } = await supabase
        .from('classes')
        .select('name')
        .eq('teacher_id', profile.id)
        .eq('preschool_id', preschoolId);
      
      teachersData.push({
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone,
        role: profile.role,
        classes: teacherClasses?.map((c: any) => c.name) || [],
      });
    }
    
    setTeachers(teachersData);
  }, [preschoolId, teacherId]);

  const fetchContacts = useCallback(async () => {
    if (!preschoolId || !teacherId) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchParents(), fetchTeachers()]);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  }, [preschoolId, teacherId, fetchParents, fetchTeachers]);

  useEffect(() => {
    if (preschoolId && teacherId) fetchContacts();
  }, [preschoolId, teacherId, fetchContacts]);

  return { parents, teachers, loading, error, refetch: fetchContacts };
}
