'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// Constants for fee calculations
const FEE_CUTOFF_DAY = 7; // Day of month after which we show next month's fees
const CENTS_TO_CURRENCY = 100; // Conversion factor from cents to currency units (e.g., cents to rands)

export interface UrgentMetrics {
  feesDue: {
    amount: number;
    dueDate: string | null;
    overdue: boolean;
  } | null;
  unreadMessages: number;
  pendingHomework: number;
  todayAttendance: 'present' | 'absent' | 'late' | 'unknown';
  upcomingEvents: number;
}

interface UseChildMetricsReturn {
  metrics: UrgentMetrics;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChildMetrics(childId: string | null): UseChildMetricsReturn {
  const [metrics, setMetrics] = useState<UrgentMetrics>({
    feesDue: null,
    unreadMessages: 0,
    pendingHomework: 0,
    todayAttendance: 'unknown',
    upcomingEvents: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!childId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get student data
      const { data: studentData } = await supabase
        .from('students')
        .select('preschool_id, organization_id, class_id')
        .eq('id', childId)
        .single();

      if (!studentData) {
        throw new Error('Student not found');
      }
      const schoolId = studentData.organization_id || studentData.preschool_id || null;

      // Fetch outstanding fees from student_fees table (or fallback to school_fee_structures)
      let feesDue: { amount: number; dueDate: string | null; overdue: boolean } | null = null;
      try {
        // First, try to get fees from student_fees table (specific fees assigned to student)
        const { data: studentFees, error: studentFeesError } = await supabase
          .from('student_fees')
          .select('*')
          .eq('student_id', childId)
          .in('status', ['pending', 'partially_paid', 'overdue'])
          .order('due_date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!studentFeesError && studentFees && studentFees.amount > 0) {
          const dueDate = new Date(studentFees.due_date);
          const now = new Date();
          const gracePeriod = studentFees.grace_period_days || 7;
          const daysPastDue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          const isOverdue = daysPastDue > gracePeriod;
          
          feesDue = {
            amount: studentFees.amount,
            dueDate: studentFees.due_date,
            overdue: isOverdue || studentFees.status === 'overdue',
          };
        } else if (schoolId) {
          // Fallback: If no student_fees exist, check school_fee_structures for monthly tuition
          const { data: feeStructure, error: feeStructureError } = await supabase
            .from('school_fee_structures')
            .select('*')
            .eq('preschool_id', schoolId)
            .eq('is_active', true)
            .eq('fee_category', 'tuition')
            .limit(1)
            .maybeSingle();

          if (!feeStructureError && feeStructure && feeStructure.amount_cents > 0) {
            // Calculate next due date (1st of current or next month)
            const now = new Date();
            const currentDay = now.getDate();
            let dueMonth = now.getMonth();
            let dueYear = now.getFullYear();
            
            // If past the fee cutoff day, show next month's fee
            if (currentDay > FEE_CUTOFF_DAY) {
              dueMonth++;
              if (dueMonth > 11) {
                dueMonth = 0;
                dueYear++;
              }
            }
            
            const dueDate = `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}-01`;
            
            feesDue = {
              amount: feeStructure.amount_cents / CENTS_TO_CURRENCY,
              dueDate: dueDate,
              overdue: false,
            };
          }
        }
      } catch (err) {
        // Silently handle - student_fees or school_fee_structures table may not exist yet
        console.warn('[useChildMetrics] Could not fetch fees:', err);
      }

      // Pending homework
      let pendingHomework = 0;
      if (studentData.class_id) {
        let assignmentsQuery = supabase
          .from('homework_assignments')
          .select('id')
          .eq('class_id', studentData.class_id)
          .eq('is_published', true)
          .gte('due_date', today)
          .limit(10);

        if (schoolId) {
          assignmentsQuery = assignmentsQuery.eq('preschool_id', schoolId);
        }

        const { data: assignments } = await assignmentsQuery;

        if (assignments && assignments.length > 0) {
          const assignmentIds = assignments.map((a: any) => a.id);
          let submissionsQuery = supabase
            .from('homework_submissions')
            .select('assignment_id')
            .eq('student_id', childId)
            .in('assignment_id', assignmentIds);

          if (schoolId) {
            submissionsQuery = submissionsQuery.eq('preschool_id', schoolId);
          }

          const { data: submissions } = await submissionsQuery;

          const submittedIds = new Set(submissions?.map((s: any) => s.assignment_id) || []);
          pendingHomework = assignmentIds.filter((id: any) => !submittedIds.has(id)).length;
        }
      }

      // Today's attendance
      let todayAttendance: 'present' | 'absent' | 'late' | 'unknown' = 'unknown';
      try {
        const { data: attendanceData, error: attendanceError } = await supabase
          .from('attendance')
          .select('status, attendance_date')
          .eq('student_id', childId)
          .eq('attendance_date', today)
          .maybeSingle();

        if (!attendanceError && attendanceData) {
          const status = String(attendanceData.status).toLowerCase();
          todayAttendance = ['present', 'absent', 'late'].includes(status)
            ? (status as 'present' | 'absent' | 'late')
            : 'unknown';
        }
      } catch (err) {
        // Silently handle - attendance table may not exist yet
      }

      // Upcoming events (next 7 days)
      let upcomingEvents = 0;
      if (studentData.class_id) {
        try {
          let eventsQuery = supabase
            .from('class_events')
            .select('id', { count: 'exact', head: true })
            .eq('class_id', studentData.class_id)
            .gte('start_time', new Date().toISOString())
            .lte('start_time', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

          if (schoolId) {
            eventsQuery = eventsQuery.eq('preschool_id', schoolId);
          }

          const { count } = await eventsQuery;

          upcomingEvents = count || 0;
        } catch (err) {
          console.error('Error fetching events:', err);
        }
      }

      setMetrics({
        feesDue,
        unreadMessages: 0, // Set by parent component or separate hook
        pendingHomework,
        todayAttendance,
        upcomingEvents,
      });
    } catch (err) {
      console.error('Failed to load child metrics:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return {
    metrics,
    loading,
    error,
    refetch: loadMetrics,
  };
}
