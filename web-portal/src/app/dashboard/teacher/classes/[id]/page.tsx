'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { Users, UserCheck, ClipboardList, MessageCircle, Mail, Phone, Calendar } from 'lucide-react';

export default function ClassDetailPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.id as string;
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [classData, setClassData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);

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
    const fetchClassData = async () => {
      if (!userId || !classId) return;
      
      try {
        setLoading(true);
        
        // Get user's profile — prefer organization_id, fall back to preschool_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, preschool_id, organization_id')
          .eq('id', userId)
          .maybeSingle();

        if (!profile) throw new Error('Profile not found');

        const schoolId = profile.organization_id || profile.preschool_id;

        // Fetch class details — teacher_id guard ensures ownership
        const { data: cls, error: clsError } = await supabase
          .from('classes')
          .select('id, name, grade, age_group, teacher_id, preschool_id')
          .eq('id', classId)
          .eq('preschool_id', schoolId)
          .eq('teacher_id', userId)
          .single();

        if (clsError) throw clsError;
        setClassData(cls);

        // Fetch students in this class
        const { data: studentsData, error: studentsError } = await supabase
          .from('students')
          .select('id, first_name, last_name, date_of_birth, is_active, class_id, preschool_id')
          .eq('class_id', classId)
          .eq('preschool_id', schoolId)
          .eq('is_active', true)
          .order('last_name', { ascending: true });

        if (studentsError) throw studentsError;
        setStudents(studentsData || []);
      } catch {
        // Non-critical — will show empty state
      } finally {
        setLoading(false);
      }
    };

    if (userId && classId) fetchClassData();
  }, [userId, classId, supabase]);

  if (authLoading || profileLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!classData) {
    return (
      <TeacherShell 
        tenantSlug={tenantSlug} 
        userEmail={profile?.email}
        userName={profile?.firstName}
        preschoolName={profile?.preschoolName}
        hideHeader={true}
      >
        <div className="container">
          <div className="section">
            <div className="card p-md text-center py-16">
              <h3 className="text-xl font-semibold text-white mb-2">Class Not Found</h3>
              <p className="text-gray-400 mb-6">This class doesn't exist or you don't have access to it</p>
              <button 
                onClick={() => router.push('/dashboard/teacher/classes')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
              >
                Back to Classes
              </button>
            </div>
          </div>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell 
      tenantSlug={tenantSlug} 
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
      hideHeader={true}
    >
      <div className="container">
        {/* Class Header */}
        <div className="section">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="h1">{classData.name}</h1>
              <p className="muted">{classData.grade} • {students.length} students</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="section">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => router.push(`/dashboard/teacher/attendance?classId=${classId}`)}
              className="card p-md bg-gradient-to-br from-green-900/30 to-green-900/10 border-green-700/30 hover:border-green-600/50 transition-all duration-200 text-left"
            >
              <UserCheck className="w-8 h-8 text-green-400 mb-3" />
              <div className="text-base font-semibold text-white">Take Attendance</div>
            </button>
            <button
              onClick={() => router.push(`/dashboard/teacher/homework?classId=${classId}`)}
              className="card p-md bg-gradient-to-br from-purple-900/30 to-purple-900/10 border-purple-700/30 hover:border-purple-600/50 transition-all duration-200 text-left"
            >
              <ClipboardList className="w-8 h-8 text-purple-400 mb-3" />
              <div className="text-base font-semibold text-white">Assign Homework</div>
            </button>
            <button
              onClick={() => router.push(`/dashboard/teacher/messages?classId=${classId}`)}
              className="card p-md bg-gradient-to-br from-blue-900/30 to-blue-900/10 border-blue-700/30 hover:border-blue-600/50 transition-all duration-200 text-left"
            >
              <MessageCircle className="w-8 h-8 text-blue-400 mb-3" />
              <div className="text-base font-semibold text-white">Message Parents</div>
            </button>
            <button
              onClick={() => router.push(`/dashboard/teacher/assignments?classId=${classId}`)}
              className="card p-md bg-gradient-to-br from-orange-900/30 to-orange-900/10 border-orange-700/30 hover:border-orange-600/50 transition-all duration-200 text-left"
            >
              <ClipboardList className="w-8 h-8 text-orange-400 mb-3" />
              <div className="text-base font-semibold text-white">Grade Assignments</div>
            </button>
          </div>
        </div>

        {/* Student Roster */}
        <div className="section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Student Roster</h2>
            <span className="text-sm text-gray-400">{students.length} students</span>
          </div>

          {students.length === 0 ? (
            <div className="card p-md text-center py-12">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No students enrolled in this class yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="card p-md hover:shadow-lg transition-all duration-200 cursor-pointer group"
                  onClick={() => router.push(`/dashboard/teacher/students/${student.id}`)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                        {student.first_name} {student.last_name}
                      </h3>
                      {student.date_of_birth && (
                        <p className="text-xs text-gray-400 mt-1">
                          Born {new Date(student.date_of_birth).toLocaleDateString('en-ZA')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TeacherShell>
  );
}
