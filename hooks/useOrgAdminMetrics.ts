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

      // First, get organization courses
      const { data: orgCourses } = await supabase
        .from('courses')
        .select('id')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .is('deleted_at', null);
      
      const courseIds = orgCourses?.map(c => c.id) || [];

      // Fetch all metrics in parallel
      const [
        { data: enrollmentsData },
        { count: totalEnrollmentsCount },
        { count: totalCoursesCount },
        { count: totalInstructorsCount },
        { data: subscriptionsData },
      ] = await Promise.all([
        // Active learners: Get enrollments for org courses
        courseIds.length > 0
          ? supabase
              .from('enrollments')
              .select('student_id')
              .eq('is_active', true)
              .in('course_id', courseIds)
          : { data: [] },
        
        // Total enrollments for org courses
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
        
        // Total instructors
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('role', 'instructor'),
        
        // Subscription data for MRR (Monthly Recurring Revenue)
        supabase
          .from('subscriptions')
          .select('amount, billing_cycle, status')
          .eq('organization_id', orgId)
          .eq('status', 'active'),
      ]);

      // Calculate active learners (unique students with active enrollments)
      const uniqueStudentIds = new Set(
        enrollmentsData?.map(e => e.student_id).filter(Boolean) || []
      );
      const activeLearners = uniqueStudentIds.size;

      // Calculate completion rate
      // For now, we'll use a placeholder - in a real system, this would check completed courses
      const totalActive = enrollmentsData?.length || 0;
      const completed = 0; // TODO: Implement actual completion tracking
      const completionRate = totalActive > 0 ? (completed / totalActive) * 100 : 0;

      // Certification pipeline (placeholder - would track certifications in progress)
      const certPipeline = 0;

      // Calculate MRR from active subscriptions
      let mrr = 0;
      if (subscriptionsData) {
        for (const sub of subscriptionsData) {
          if (sub.billing_cycle === 'monthly') {
            mrr += sub.amount || 0;
          } else if (sub.billing_cycle === 'annual') {
            mrr += (sub.amount || 0) / 12; // Annual to monthly
          }
        }
      }

      return {
        activeLearners,
        completionRate: Math.round(completionRate * 10) / 10, // Round to 1 decimal
        certPipeline,
        mrr: Math.round(mrr), // Round to nearest cent
        totalPrograms: totalCoursesCount || 0,
        totalCohorts: 0, // TODO: Implement cohorts
        totalInstructors: totalInstructorsCount || 0,
        totalEnrollments: totalEnrollmentsCount || 0,
        totalCertifications: 0, // TODO: Implement certifications
        totalPlacements: 0, // TODO: Implement placements
      };
    },
    enabled: !!orgId,
    refetchInterval: 5 * 60_000, // Refetch every 5 minutes
    staleTime: 5 * 60_000, // Consider data stale after 5 minutes
  });
}

