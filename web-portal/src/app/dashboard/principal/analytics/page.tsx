'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { TrendingUp, BookOpen, Users, CheckCircle, Brain, Cpu, Laptop, Loader2 } from 'lucide-react';

interface AnalyticsData {
  lessonCompletionRate: number;
  homeworkSubmissionRate: number;
  stemEngagement: {
    ai: { lessonsCompleted: number; activitiesCompleted: number; engagementScore: number };
    robotics: { lessonsCompleted: number; activitiesCompleted: number; engagementScore: number };
    computer_literacy: { lessonsCompleted: number; activitiesCompleted: number; engagementScore: number };
  };
  studentProgress: {
    totalStudents: number;
    activeStudents: number;
    averageScore: number;
  };
}

export default function PrincipalAnalyticsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setAuthLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (!preschoolId) return;

    const loadAnalytics = async () => {
      setLoading(true);
      try {
        // Load lesson completion data
        const { data: completions } = await supabase
          .from('lesson_completions')
          .select('id, lesson_id, student_id')
          .eq('preschool_id', preschoolId);

        // Load assignments
        const { data: assignments } = await supabase
          .from('lesson_assignments')
          .select('id, lesson_id, student_id, status')
          .eq('preschool_id', preschoolId);

        // Load homework submissions
        const { data: homeworkSubmissions } = await supabase
          .from('homework_submissions')
          .select('id, assignment_id, status')
          .eq('preschool_id', preschoolId);

        // Load homework assignments
        const { data: homeworkAssignments } = await supabase
          .from('homework_assignments')
          .select('id')
          .eq('preschool_id', preschoolId);

        // Load STEM progress
        const { data: stemProgress } = await supabase
          .from('stem_progress')
          .select('*')
          .eq('preschool_id', preschoolId);

        // Load students
        const { count: totalStudents } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('preschool_id', preschoolId)
          .eq('is_active', true);

        // Calculate metrics
        const totalAssignments = assignments?.length || 0;
        const completedAssignments = assignments?.filter((a: { status: string }) => a.status === 'completed').length || 0;
        const lessonCompletionRate = totalAssignments > 0 
          ? Math.round((completedAssignments / totalAssignments) * 100) 
          : 0;

        const totalHomework = homeworkAssignments?.length || 0;
        const submittedHomework = homeworkSubmissions?.filter((s: { status: string }) => s.status === 'submitted' || s.status === 'graded').length || 0;
        const homeworkSubmissionRate = totalHomework > 0
          ? Math.round((submittedHomework / totalHomework) * 100)
          : 0;

        // Calculate STEM engagement
        const stemEngagement = {
          ai: { lessonsCompleted: 0, activitiesCompleted: 0, engagementScore: 0 },
          robotics: { lessonsCompleted: 0, activitiesCompleted: 0, engagementScore: 0 },
          computer_literacy: { lessonsCompleted: 0, activitiesCompleted: 0, engagementScore: 0 },
        };

        if (stemProgress) {
          stemProgress.forEach((progress: any) => {
            const category = progress.category as keyof typeof stemEngagement;
            if (stemEngagement[category]) {
              stemEngagement[category].lessonsCompleted += progress.lessons_completed || 0;
              stemEngagement[category].activitiesCompleted += progress.activities_completed || 0;
              stemEngagement[category].engagementScore = Math.round(
                (stemEngagement[category].lessonsCompleted + stemEngagement[category].activitiesCompleted) / 2
              );
            }
          });
        }

        // Calculate average score
        const scores = completions?.map((c: any) => c.score).filter((s: any) => s !== null) || [];
        const averageScore = scores.length > 0
          ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
          : 0;

        setAnalytics({
          lessonCompletionRate,
          homeworkSubmissionRate,
          stemEngagement,
          studentProgress: {
            totalStudents: totalStudents || 0,
            activeStudents: totalStudents || 0,
            averageScore,
          },
        });
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [preschoolId, supabase]);

  if (authLoading || profileLoading || loading) {
    return (
      <PrincipalShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={profile?.firstName}
        preschoolName={profile?.preschoolName}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="animate-spin" size={32} />
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
    >
      <div className="container">
        <h1 className="h1">School Analytics</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Comprehensive overview of school performance and engagement metrics
        </p>

        {/* Key Metrics */}
        <div className="section">
          <div className="sectionTitle">Key Metrics</div>
          <div className="grid2">
            <div className="card tile">
              <div className="metricValue">{analytics?.lessonCompletionRate || 0}%</div>
              <div className="metricLabel">Lesson Completion Rate</div>
            </div>
            <div className="card tile">
              <div className="metricValue">{analytics?.homeworkSubmissionRate || 0}%</div>
              <div className="metricLabel">Homework Submission Rate</div>
            </div>
            <div className="card tile">
              <div className="metricValue">{analytics?.studentProgress.totalStudents || 0}</div>
              <div className="metricLabel">Total Students</div>
            </div>
            <div className="card tile">
              <div className="metricValue">{analytics?.studentProgress.averageScore || 0}%</div>
              <div className="metricLabel">Average Score</div>
            </div>
          </div>
        </div>

        {/* STEM Engagement */}
        <div className="section">
          <div className="sectionTitle">STEM Engagement</div>
          <div className="grid2">
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: '#f3e8ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Brain size={24} color="#8b5cf6" />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>AI Program</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                    {analytics?.stemEngagement.ai.lessonsCompleted || 0} lessons completed
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--muted)' }}>
                <span>Activities: {analytics?.stemEngagement.ai.activitiesCompleted || 0}</span>
                <span>Engagement: {analytics?.stemEngagement.ai.engagementScore || 0}%</span>
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Cpu size={24} color="#f59e0b" />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Robotics Program</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                    {analytics?.stemEngagement.robotics.lessonsCompleted || 0} lessons completed
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--muted)' }}>
                <span>Activities: {analytics?.stemEngagement.robotics.activitiesCompleted || 0}</span>
                <span>Engagement: {analytics?.stemEngagement.robotics.engagementScore || 0}%</span>
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: '#cffafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Laptop size={24} color="#06b6d4" />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Computer Literacy</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                    {analytics?.stemEngagement.computer_literacy.lessonsCompleted || 0} lessons completed
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--muted)' }}>
                <span>Activities: {analytics?.stemEngagement.computer_literacy.activitiesCompleted || 0}</span>
                <span>Engagement: {analytics?.stemEngagement.computer_literacy.engagementScore || 0}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Reports */}
        <div className="section">
          <div className="sectionTitle">Quick Reports</div>
          <div className="grid2">
            <button className="qa" onClick={() => router.push('/dashboard/principal/reports?type=stem')}>
              <TrendingUp className="icon20" />
              <span>STEM Integration Report</span>
            </button>
            <button className="qa" onClick={() => router.push('/dashboard/principal/reports?type=lessons')}>
              <BookOpen className="icon20" />
              <span>Lesson Completion Report</span>
            </button>
            <button className="qa" onClick={() => router.push('/dashboard/principal/reports?type=homework')}>
              <CheckCircle className="icon20" />
              <span>Homework Analytics</span>
            </button>
            <button className="qa" onClick={() => router.push('/dashboard/principal/reports?type=engagement')}>
              <Users className="icon20" />
              <span>Parent Engagement Report</span>
            </button>
          </div>
        </div>
      </div>
    </PrincipalShell>
  );
}
