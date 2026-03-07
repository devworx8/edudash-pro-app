import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface PendingHomework {
  id: string;
  title: string;
  due_date: string;
  subject: string;
  class_name: string;
  student_name: string;
}

interface ChildRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  class_id: string | null;
  preschool_id?: string | null;
  organization_id?: string | null;
}

interface HomeworkRow {
  id: string;
  title: string | null;
  due_date: string;
  subject: string | null;
  class?: { name?: string | null } | null;
  homework_submissions?: HomeworkSubmissionRow[] | null;
}

interface HomeworkSubmissionRow {
  student_id: string;
  status: string | null;
}

export function usePendingHomework(userId: string | undefined) {
  const [pendingHomework, setPendingHomework] = useState<PendingHomework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchPendingHomework = async () => {
      try {
        setLoading(true);
        
        // Get parent's children
        const { data: children, error: childrenError } = await supabase
          .from('students')
          .select('id, first_name, last_name, class_id, preschool_id, organization_id')
          .or(`parent_id.eq.${userId},guardian_id.eq.${userId}`);

        if (childrenError) throw childrenError;
        if (!children || children.length === 0) {
          setPendingHomework([]);
          setLoading(false);
          return;
        }

        const childRows = children as ChildRow[];
        const studentIds = childRows.map((c) => c.id);
        const schoolIds = Array.from(new Set(
          childRows
            .map((c) => c.organization_id || c.preschool_id)
            .filter((id): id is string => Boolean(id))
        ));
        const classIds = childRows.map((c) => c.class_id).filter((id): id is string => Boolean(id));

        if (classIds.length === 0) {
          setPendingHomework([]);
          setLoading(false);
          return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIsoDate = today.toISOString().split('T')[0];

        // Get pending homework for all children
        let homeworkQuery = supabase
          .from('homework_assignments')
          .select(`
            id,
            title,
            due_date,
            subject,
            class:classes!homework_assignments_class_id_fkey(name),
            homework_submissions!homework_submissions_assignment_id_fkey(id, status, student_id)
          `)
          .in('class_id', classIds)
          .eq('is_published', true)
          .gte('due_date', todayIsoDate)
          .order('due_date', { ascending: true });

        if (schoolIds.length > 0) {
          homeworkQuery = homeworkQuery.in('preschool_id', schoolIds);
        }

        const { data: homework, error: homeworkError } = await homeworkQuery;

        if (homeworkError) throw homeworkError;

        // Filter to only show homework without submissions from these students
        const homeworkRows = (homework || []) as HomeworkRow[];
        const pending = homeworkRows.filter((hw) => {
          const submissions = (hw.homework_submissions || []) as HomeworkSubmissionRow[];
          // Check if any of the parent's children have submitted
          return !submissions.some((sub) =>
            studentIds.includes(sub.student_id) && String(sub.status || '').toLowerCase() !== 'draft'
          );
        }).map((hw) => ({
          id: hw.id,
          title: hw.title || 'Homework',
          due_date: hw.due_date,
          subject: hw.subject || 'General',
          class_name: hw.class?.name || 'Unknown',
          student_name: childRows[0]?.first_name || 'Child',
        }));

        setPendingHomework(pending);
        setError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unable to load pending homework';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchPendingHomework();

    // Subscribe to homework changes
    const channel = supabase
      .channel('pending-homework-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'homework_assignments' }, 
        () => fetchPendingHomework()
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'homework_submissions' }, 
        () => fetchPendingHomework()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  return { pendingHomework, loading, error, count: pendingHomework.length };
}
