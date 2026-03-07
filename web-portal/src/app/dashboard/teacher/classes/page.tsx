'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTeacherDashboard } from '@/lib/hooks/teacher/useTeacherDashboard';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { Users, UserCheck, ClipboardList, MessageCircle, Plus } from 'lucide-react';

export default function TeacherClassesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  
  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { classes, loading: dashLoading } = useTeacherDashboard(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  
  const userEmail = profile?.email;
  const userName = profile?.firstName;
  const preschoolName = profile?.preschoolName;

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

  const loading = authLoading || profileLoading || dashLoading;

  if (loading) {
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="h1">My Classes</h1>
              <p className="muted">Manage your classes and students</p>
            </div>
            <button 
              onClick={() => router.push('/dashboard/teacher/classes/create')}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Class</span>
            </button>
          </div>
        </div>

        {classes.length === 0 ? (
          <div className="section">
            <div className="card p-md text-center py-16">
              <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Classes Yet</h3>
              <p className="text-gray-400 mb-6">You don't have any classes assigned yet</p>
              <button 
                onClick={() => router.push('/dashboard/teacher/classes/create')}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg font-semibold transition-all duration-200 inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create Your First Class
              </button>
            </div>
          </div>
        ) : (
          <div className="section">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className="card p-md hover:shadow-xl transition-all duration-200 cursor-pointer group hover:border-blue-500/50"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
                        {cls.name}
                      </h3>
                      <p className="text-sm text-gray-400">{cls.grade}</p>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl shadow-lg">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-700/50">
                    <span className="text-2xl font-bold text-white">{cls.studentCount}</span>
                    <span className="text-sm text-gray-400">students</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/teacher/attendance?classId=${cls.id}`);
                      }}
                      className="px-3 py-2 bg-green-900/30 hover:bg-green-900/50 border border-green-700/30 rounded-lg text-xs font-medium text-green-400 transition-all duration-200 flex items-center justify-center gap-1"
                    >
                      <UserCheck className="w-4 h-4" />
                      Attendance
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/teacher/homework?classId=${cls.id}`);
                      }}
                      className="px-3 py-2 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/30 rounded-lg text-xs font-medium text-purple-400 transition-all duration-200 flex items-center justify-center gap-1"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Homework
                    </button>
                  </div>

                  <button
                    onClick={() => router.push(`/dashboard/teacher/classes/${cls.id}`)}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold transition-colors text-white"
                  >
                    View Details →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
