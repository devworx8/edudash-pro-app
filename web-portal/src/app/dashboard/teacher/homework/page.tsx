'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { ClipboardList, Plus, Calendar, Users, Check, X, Clock, Megaphone } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

interface HomeworkListRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  is_published: boolean | null;
  created_at: string | null;
  class_id: string | null;
  class?: { name?: string | null } | null;
  homework_submissions?: Array<{ status: string | null }>;
}

export default function TeacherHomeworkPage() {
  const router = useRouter();
  const [createdFlag, setCreatedFlag] = useState(false);
  const supabase = createClient();

  const [userId, setUserId] = useState<string>();
  const [legacyTeacherId, setLegacyTeacherId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assignments, setAssignments] = useState<HomeworkListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);

  const userEmail = profile?.email;
  const userName = profile?.firstName;
  const preschoolName = profile?.preschoolName;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setCreatedFlag(params.get('created') === '1');
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }

      setUserId(session.user.id);

      const profileRes = await supabase
        .from('profiles')
        .select('id, preschool_id, organization_id')
        .or(`id.eq.${session.user.id},auth_user_id.eq.${session.user.id}`)
        .maybeSingle();

      const profileData = profileRes.data;
      setSchoolId(profileData?.preschool_id || profileData?.organization_id || null);

      const legacyRes = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      const fallbackLegacyRes = legacyRes.data
        ? legacyRes
        : await supabase
            .from('users')
            .select('id')
            .eq('id', profileData?.id)
            .maybeSingle();

      setLegacyTeacherId(fallbackLegacyRes.data?.id || null);
      setAuthLoading(false);
    };

    void initAuth();
  }, [router, supabase]);

  useEffect(() => {
    const fetchAssignments = async () => {
      if (!legacyTeacherId || !schoolId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const query = supabase
          .from('homework_assignments')
          .select(`
            id,
            title,
            description,
            due_date,
            status,
            is_published,
            created_at,
            class_id,
            class:classes!homework_assignments_class_id_fkey(name),
            homework_submissions!homework_submissions_assignment_id_fkey(status)
          `)
          .eq('teacher_id', legacyTeacherId)
          .eq('preschool_id', schoolId)
          .order('created_at', { ascending: false });

        const { data, error: fetchError } = await query;
        if (fetchError) {
          throw fetchError;
        }

        setAssignments((data || []) as HomeworkListRow[]);
      } catch (fetchErr) {
        const message = fetchErr instanceof Error ? fetchErr.message : 'Error loading assignments.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void fetchAssignments();
  }, [legacyTeacherId, schoolId, supabase]);

  const totals = useMemo(() => {
    const all = assignments.length;
    const published = assignments.filter((item) => item.is_published).length;
    const drafts = assignments.filter((item) => !item.is_published).length;
    return { all, published, drafts };
  }, [assignments]);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <TeacherShell
      tenantSlug={tenantSlug}
      userEmail={userEmail}
      userName={userName}
      preschoolName={preschoolName}
      hideHeader={true}
    >
      <div className="container">
        <div className="section">
          <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 className="h1">Take-home Activities</h1>
              <p className="muted">Manage preschool worksheet assignments, publishing state, and submissions.</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/teacher/homework/create')}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Create Take-home Activity</span>
            </button>
          </div>
        </div>

        {createdFlag && (
          <div className="section">
            <div className="card" style={{ borderLeft: '4px solid var(--success)' }}>
              Draft saved successfully. Submit it through principal approval/publish flow when ready.
            </div>
          </div>
        )}

        <div className="section">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="muted" style={{ fontSize: 12 }}>Total</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{totals.all}</div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="muted" style={{ fontSize: 12 }}>Published</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--success)' }}>{totals.published}</div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="muted" style={{ fontSize: 12 }}>Draft</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--warning)' }}>{totals.drafts}</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="section">
            <div className="card p-md text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
              <p className="text-gray-400 mt-4">Loading assignments...</p>
            </div>
          </div>
        ) : error ? (
          <div className="section">
            <div className="card" style={{ borderLeft: '4px solid var(--danger)', color: 'var(--danger)' }}>
              {error}
            </div>
          </div>
        ) : assignments.length === 0 ? (
          <div className="section">
            <div className="card p-md text-center py-16">
              <ClipboardList className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Assignments Yet</h3>
              <p className="text-gray-400 mb-6">Create your first take-home worksheet activity for parents.</p>
              <button
                onClick={() => router.push('/dashboard/teacher/homework/create')}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-lg font-semibold transition-all duration-200 inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create First Assignment
              </button>
            </div>
          </div>
        ) : (
          <div className="section">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {assignments.map((assignment) => {
                const submissions = assignment.homework_submissions || [];
                const completedCount = submissions.filter((item) => {
                  const status = String(item.status || '').toLowerCase();
                  return status !== 'draft' && status !== '';
                }).length;
                const pendingCount = Math.max(0, submissions.length - completedCount);

                return (
                  <div
                    key={assignment.id}
                    className="card p-md hover:shadow-xl transition-all duration-200 cursor-pointer group hover:border-purple-500/50"
                    onClick={() => router.push(`/dashboard/teacher/homework/${assignment.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-1 group-hover:text-purple-400 transition-colors">
                          {assignment.title}
                        </h3>
                        <p className="text-sm text-gray-400">{assignment.class?.name || 'Class not set'}</p>
                      </div>
                      <div className="p-2 bg-purple-900/30 rounded-lg">
                        <ClipboardList className="w-5 h-5 text-purple-400" />
                      </div>
                    </div>

                    <p className="text-sm text-gray-300 mb-4 line-clamp-2">{assignment.description || 'No summary provided.'}</p>

                    <div className="flex items-center gap-4 text-xs text-gray-400 mb-4" style={{ flexWrap: 'wrap' }}>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {assignment.due_date ? `Due: ${new Date(assignment.due_date).toLocaleDateString()}` : 'No due date'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {submissions.length} targets
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {assignment.status || 'draft'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-gray-700/50" style={{ flexWrap: 'wrap' }}>
                      <div className="flex items-center gap-1 text-green-400 text-sm">
                        <Check className="w-4 h-4" />
                        {completedCount} completed
                      </div>
                      <div className="flex items-center gap-1 text-orange-400 text-sm">
                        <X className="w-4 h-4" />
                        {pendingCount} pending
                      </div>
                      <div className="badge" style={{ marginLeft: 'auto' }}>
                        {assignment.is_published ? 'Published' : 'Draft'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="section">
          <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
            <Megaphone className="icon16" style={{ color: 'var(--primary)' }} />
            Publishing remains principal-controlled unless your school policy enables direct publish.
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
