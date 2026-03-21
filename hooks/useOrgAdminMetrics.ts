import { useQuery } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface OrgAdminMetrics {
  activeLearners: number;
  completionRate: number; // percentage
  certPipeline: number;
  mrr: number; // Monthly Recurring Revenue in cents
  totalPrograms: number;
  totalCohorts: number;
  totalInstructors: number;
  totalEnrollments: number;
  totalCertifications: number;
  totalPlacements: number;
}

export function useOrgAdminMetrics() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id || (profile as any)?.preschool_id;

  return useQuery({
    queryKey: ['org-admin-metrics', orgId],
    queryFn: async (): Promise<OrgAdminMetrics> => {
      if (!orgId) {
        throw new Error('No organization ID');
      }

      const supabase = assertSupabase();

      // Get organization courses (reused for multiple metrics)
      const { data: orgCourses } = await supabase
        .from('courses')
        .select('id, instructor_id')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .is('deleted_at', null);

      const courseIds = orgCourses?.map(c => c.id) || [];

      // Unique instructors from courses (profiles.role has no 'instructor' value)
      const uniqueInstructorIds = new Set(
        orgCourses?.map(c => c.instructor_id).filter(Boolean) || []
      );

      // Fetch all metrics in parallel
      const [
        { data: enrollmentsData },
        { count: totalEnrollmentsCount },
        { count: totalCoursesCount },
        { data: progressData },
        { data: subsWithPlans },
      ] = await Promise.all([
        // Active learners: enrollments for org courses
        courseIds.length > 0
          ? supabase
              .from('enrollments')
              .select('student_id')
              .eq('is_active', true)
              .in('course_id', courseIds)
          : { data: [] },

        // Total enrollments count
        courseIds.length > 0
          ? supabase
              .from('enrollments')
              .select('*', { count: 'exact', head: true })
              .eq('is_active', true)
              .in('course_id', courseIds)
          : { count: 0 },

        // Total programs (courses)
        supabase
          .from('courses')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null),

        // Completion data from student_progress
        courseIds.length > 0
          ? supabase
              .from('student_progress')
              .select('assignments_completed, assignments_total')
              .in('course_id', courseIds)
          : { data: [] },

        // Subscriptions joined with plan pricing for MRR
        // subscriptions uses school_id (not organization_id), billing_frequency (not billing_cycle),
        // and pricing lives on subscription_plans (not on subscriptions directly)
        supabase
          .from('subscriptions')
          .select('billing_frequency, subscription_plans(price_monthly, price_annual)')
          .eq('school_id', orgId)
          .eq('status', 'active'),
      ]);

      // Active learners (unique students with active enrollments)
      const uniqueStudentIds = new Set(
        enrollmentsData?.map(e => e.student_id).filter(Boolean) || []
      );
      const activeLearners = uniqueStudentIds.size;

      // Completion rate from student_progress (average of per-student completion %)
      let completionRate = 0;
      if (progressData && progressData.length > 0) {
        const rates = progressData
          .filter(p => p.assignments_total && p.assignments_total > 0)
          .map(p => ((p.assignments_completed || 0) / p.assignments_total!) * 100);
        if (rates.length > 0) {
          completionRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
        }
      }

      // MRR from active subscriptions joined with plan pricing
      let mrr = 0;
      if (subsWithPlans) {
        for (const sub of subsWithPlans) {
          const plan = sub.subscription_plans as any;
          if (!plan) continue;
          if (sub.billing_frequency === 'monthly') {
            mrr += plan.price_monthly || 0;
          } else if (sub.billing_frequency === 'annual') {
            mrr += (plan.price_annual || 0) / 12;
          }
        }
      }

      return {
        activeLearners,
        completionRate: Math.round(completionRate * 10) / 10,
        certPipeline: 0, // No certifications table exists yet — needs migration
        mrr: Math.round(mrr),
        totalPrograms: totalCoursesCount || 0,
        totalCohorts: 0, // No cohorts table exists yet — needs migration
        totalInstructors: uniqueInstructorIds.size,
        totalEnrollments: totalEnrollmentsCount || 0,
        totalCertifications: 0, // No certifications table exists yet — needs migration
        totalPlacements: 0, // No placements table exists yet — needs migration
      };
    },
    enabled: !!orgId,
    refetchInterval: 5 * 60_000,
    staleTime: 5 * 60_000,
  });
}

