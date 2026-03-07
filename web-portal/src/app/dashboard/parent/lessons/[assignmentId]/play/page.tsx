'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { Play, CheckCircle, Loader2 } from 'lucide-react';

function PlayInteractiveLessonContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get('assignmentId');
  const activityId = searchParams.get('activityId');
  const studentId = searchParams.get('studentId');
  const supabase = createClient();
  
  const {
    userId,
    profile,
    userName,
    preschoolName,
    tenantSlug,
    unreadCount,
    hasOrganization,
  } = useParentDashboardData();

  const [activity, setActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (!activityId) {
      setError('Activity ID is required');
      setLoading(false);
      return;
    }

    const loadActivity = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('interactive_activities')
          .select('*')
          .eq('id', activityId)
          .single();

        if (fetchError) throw fetchError;
        setActivity(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load activity');
      } finally {
        setLoading(false);
      }
    };

    loadActivity();
  }, [activityId, supabase]);

  const handleComplete = async (finalScore: number) => {
    if (!assignmentId || !studentId) {
      setError('Missing assignment or student ID');
      return;
    }

    try {
      // Update assignment status
      await supabase
        .from('lesson_assignments')
        .update({ status: 'completed' })
        .eq('id', assignmentId);

      // Create completion record
      await supabase
        .from('lesson_completions')
        .insert({
          assignment_id: assignmentId,
          lesson_id: null,
          student_id: studentId,
          preschool_id: profile?.preschoolId,
          completed_at: new Date().toISOString(),
          score: finalScore,
          status: 'completed',
        });

      setScore(finalScore);
      setCompleted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save completion');
    }
  };

  if (loading) {
    return (
      <ParentShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={userName}
        preschoolName={preschoolName}
        unreadCount={unreadCount}
        hasOrganization={hasOrganization}
      >
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <Loader2 className="animate-spin" size={32} />
        </div>
      </ParentShell>
    );
  }

  if (error) {
    return (
      <ParentShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={userName}
        preschoolName={preschoolName}
        unreadCount={unreadCount}
        hasOrganization={hasOrganization}
      >
        <div className="container">
          <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
            <h3>Error</h3>
            <p>{error}</p>
            <button className="btn btnPrimary" onClick={() => router.back()}>
              Go Back
            </button>
          </div>
        </div>
      </ParentShell>
    );
  }

  if (completed) {
    return (
      <ParentShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={userName}
        preschoolName={preschoolName}
        unreadCount={unreadCount}
        hasOrganization={hasOrganization}
      >
        <div className="container">
          <div className="card" style={{ textAlign: 'center', padding: 40, borderLeft: '4px solid #10b981' }}>
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 style={{ marginBottom: 8 }}>Lesson Completed!</h2>
            {score !== null && (
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginBottom: 16 }}>
                Score: {score}%
              </p>
            )}
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              Great job completing the lesson!
            </p>
            <button className="btn btnPrimary" onClick={() => router.push('/dashboard/parent/lessons')}>
              Back to Lessons
            </button>
          </div>
        </div>
      </ParentShell>
    );
  }

  // For now, show a placeholder - the actual interactive player would be implemented here
  // This would integrate with the existing interactive-lesson-player.tsx component
  return (
    <ParentShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={userName}
      preschoolName={preschoolName}
      unreadCount={unreadCount}
      hasOrganization={hasOrganization}
    >
      <div className="container">
        <div className="card">
          <h2>{activity?.title || 'Interactive Activity'}</h2>
          {activity?.description && (
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{activity.description}</p>
          )}
          <div style={{ padding: 40, textAlign: 'center', background: '#f3f4f6', borderRadius: 8, marginBottom: 24 }}>
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
              Interactive activity player will be displayed here
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Activity Type: {activity?.activity_type}
            </p>
          </div>
          <button 
            className="btn btnPrimary" 
            onClick={() => handleComplete(85)}
            style={{ width: '100%' }}
          >
            <Play className="icon16" />
            Complete Activity (Demo)
          </button>
        </div>
      </div>
    </ParentShell>
  );
}

export default function PlayInteractiveLessonPage() {
  return (
    <Suspense
      fallback={
        <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <PlayInteractiveLessonContent />
    </Suspense>
  );
}
