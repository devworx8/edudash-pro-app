'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { StartLiveLessonWithToggle } from '@/components/calls';
import { Loader2, Radio, RefreshCw, Video } from 'lucide-react';

type ActiveLiveCall = {
  id: string;
  title: string | null;
  class_id: string | null;
  room_url: string | null;
  room_name: string | null;
  status: string | null;
  scheduled_for: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export default function LiveLessonPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [activeCall, setActiveCall] = useState<ActiveLiveCall | null>(null);
  const [activeCallLoading, setActiveCallLoading] = useState(false);

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);

  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId;
  const userName = profile?.firstName || 'Teacher';
  const subscriptionTier = profile?.subscription_tier || 'starter';

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  const loadActiveCall = useCallback(async () => {
    if (!preschoolId || !userId) {
      setActiveCall(null);
      return;
    }

    setActiveCallLoading(true);
    try {
      const nowIso = new Date().toISOString();

      // Cleanup stale active rows older than 12 hours for this teacher
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('live_calls')
        .update({
          status: 'ended',
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq('teacher_id', userId)
        .eq('status', 'active')
        .lt('started_at', twelveHoursAgo);

      const { data } = await supabase
        .from('live_calls')
        .select('id, title, class_id, room_url, room_name, status, scheduled_for, started_at, ended_at')
        .eq('teacher_id', userId)
        .eq('preschool_id', preschoolId)
        .in('status', ['active', 'scheduled'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveCall((data as ActiveLiveCall | null) || null);
    } catch (error) {
      console.warn('[teacher/live-lesson] failed to load active call', error);
      setActiveCall(null);
    } finally {
      setActiveCallLoading(false);
    }
  }, [preschoolId, userId, supabase]);

  useEffect(() => {
    loadActiveCall();
  }, [loadActiveCall]);

  useEffect(() => {
    if (!preschoolId || !userId) return;
    const timer = setInterval(() => {
      loadActiveCall();
    }, 20000);
    return () => clearInterval(timer);
  }, [preschoolId, userId, loadActiveCall]);

  if (loading || profileLoading) {
    return (
      <TeacherShell
        tenantSlug={tenantSlug}
        userName={userName}
        preschoolName={preschoolName}
        preschoolId={preschoolId}
        userId={userId}
      >
        <div className="flex items-center justify-center min-h-[360px] gap-3 text-slate-300">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading live lesson workspace...</span>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell
      tenantSlug={tenantSlug}
      userName={userName}
      preschoolName={preschoolName}
      preschoolId={preschoolId}
      userId={userId}
    >
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Video className="w-6 h-6" />
              Live Lesson Studio
            </h1>
            <p className="muted" style={{ marginTop: 4 }}>
              Start a session, rejoin active lessons, and keep class calls scoped to your school.
            </p>
          </div>
          <button className="btn btnSecondary" onClick={loadActiveCall} disabled={activeCallLoading}>
            {activeCallLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>
      </div>

      {activeCall ? (
        <div className="section">
          <div
            className="card"
            style={{
              border: '1px solid rgba(34, 197, 94, 0.35)',
              background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.92), rgba(15, 23, 42, 0.95))',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Radio className="w-4 h-4 text-green-400" />
              <span style={{ color: '#86efac', fontWeight: 700 }}>
                {activeCall.status === 'active' ? 'Active lesson in progress' : 'Scheduled lesson ready'}
              </span>
            </div>
            <div style={{ color: 'var(--text)' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{activeCall.title || 'Live Lesson'}</div>
              <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>
                Class: {activeCall.class_id || 'Not specified'} • Room: {activeCall.room_name || 'Generated room'}
              </div>
            </div>
            {activeCall.room_url ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btnPrimary" onClick={() => window.open(activeCall.room_url as string, '_blank')}>
                  Rejoin Lesson
                </button>
                <button
                  className="btn btnSecondary"
                  onClick={() =>
                    router.push(
                      `/dashboard/teacher/messages?focus=live_call&room=${encodeURIComponent(
                        activeCall.room_url as string,
                      )}`,
                    )
                  }
                >
                  Open Messaging Hub
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="sectionTitle">Start or Schedule a Lesson</div>
        {preschoolId && userId ? (
          <StartLiveLessonWithToggle
            preschoolId={preschoolId}
            teacherId={userId}
            teacherName={userName}
            subscriptionTier={subscriptionTier}
          />
        ) : (
          <div className="card">
            <p className="muted">Teacher profile is still loading. Please refresh this page.</p>
          </div>
        )}
      </div>

      <div className="section">
        <div className="card" style={{ border: '1px dashed var(--border)' }}>
          <h3 style={{ marginBottom: 8 }}>Post-lesson practice handoff</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Next sprint hook is ready here for automatic “post-live” practice pushes to learners and parents.
          </p>
        </div>
      </div>
    </TeacherShell>
  );
}
