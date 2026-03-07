'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  event_type: 'class' | 'school' | 'personal' | 'homework' | 'exam';
  class_id?: string;
  preschool_id?: string;
  class?: {
    name: string;
    grade_level?: string;
  };
}

export const useChildCalendarEvents = (studentId: string | undefined, userId: string | undefined) => {
  const [data, setData] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      if (!studentId || !userId) {
        setData([]);
        return;
      }
      
      setIsLoading(true);
      setError(null);

      try {
        const client = createClient();
        
        const { data: student, error: studentError } = await client
          .from('students')
          .select('class_id, preschool_id, organization_id')
          .eq('id', studentId)
          .maybeSingle();
        
        if (studentError) throw studentError;
        if (!student?.class_id && !student?.preschool_id) {
          setData([]);
          setIsLoading(false);
          return;
        }
        const schoolId = student?.organization_id || student?.preschool_id || null;
        
        const today = new Date();
        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
        
        const events: CalendarEvent[] = [];
        
        if (student.class_id) {
          let eventsQuery = client
            .from('class_events')
            .select('id, title, description, start_time, end_time, event_type, class_id, class:classes(name, grade_level)')
            .eq('class_id', student.class_id)
            .gte('start_time', today.toISOString())
            .lte('start_time', thirtyDaysLater.toISOString())
            .order('start_time', { ascending: true });

          if (schoolId) {
            eventsQuery = eventsQuery.eq('preschool_id', schoolId);
          }

          const { data: classEvents, error: eventsError} = await eventsQuery;
          
          if (!eventsError && classEvents) {
            events.push(...classEvents);
          }
        }
        
        if (student.class_id) {
          let homeworkQuery = client
            .from('homework_assignments')
            .select('id, title, due_date, class_id, class:classes(name, grade_level)')
            .eq('class_id', student.class_id)
            .eq('is_published', true)
            .gte('due_date', today.toISOString().split('T')[0])
            .lte('due_date', thirtyDaysLater.toISOString().split('T')[0]);

          if (schoolId) {
            homeworkQuery = homeworkQuery.eq('preschool_id', schoolId);
          }

          const { data: homework } = await homeworkQuery;
          
          if (homework) {
            const homeworkIds = homework.map((hw: any) => hw.id);
            let submissionsQuery = client
              .from('homework_submissions')
              .select('assignment_id')
              .eq('student_id', studentId)
              .in('assignment_id', homeworkIds);

            if (schoolId) {
              submissionsQuery = submissionsQuery.eq('preschool_id', schoolId);
            }

            const { data: submissions } = await submissionsQuery;
            
            const submittedIds = new Set(submissions?.map((s: any) => s.assignment_id) || []);
            
            const homeworkEvents = homework
              .filter((hw: any) => !submittedIds.has(hw.id))
              .map((hw: any) => ({
                id: 'hw-' + hw.id,
                title: '📚 ' + hw.title + ' (Due)',
                description: 'Homework assignment due',
                start_time: hw.due_date + 'T23:59:00',
                event_type: 'homework' as const,
                class_id: hw.class_id,
                class: hw.class
              }));
            
            events.push(...homeworkEvents);
          }
        }
        
        events.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        
        setData(events);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [studentId, userId]);

  return { data, isLoading, error };
};
