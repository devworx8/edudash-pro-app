'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { ArrowLeft, Calendar, User, Mail, Phone, MapPin, Users, FileText, Clock, KeyRound, MessageSquare, TrendingUp, School, BookOpen, Activity } from 'lucide-react';

interface StudentDetail {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  medical_info: string | null;
  allergies: string | null;
  status: string;
  enrollment_date: string | null;
  guardian_id: string | null;
  class_id: string | null;
  preschool_id: string;
  classes?: {
    id: string;
    name: string;
    age_group: string;
    teacher_id: string | null;
  };
  profiles?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
}

interface RegistrationData {
  preferred_class?: string;
  preferred_start_date?: string;
  how_did_you_hear?: string;
  special_requests?: string;
  previous_school?: string;
}

interface AttendanceStats {
  present: number;
  absent: number;
  total: number;
  percentage: number;
}

interface RecentActivity {
  id: string;
  type: string;
  title: string;
  date: string;
}

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false);
  const [registrationData, setRegistrationData] = useState<RegistrationData | null>(null);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [lastContactDate, setLastContactDate] = useState<string | null>(null);

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  const studentId = params.id as string;

  // Guard: Prevent treating "enroll" as a student ID
  useEffect(() => {
    if (studentId === 'enroll') {
      // This is handled by the /enroll route, not this dynamic [id] page
      return;
    }
  }, [studentId]);

  // Auth check
  useEffect(() => {
    if (studentId === 'enroll') return; // Skip auth check for enroll route
    
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    initAuth();
  }, [router, supabase, studentId]);

  // Load student details
  useEffect(() => {
    if (studentId === 'enroll') return; // Skip for enroll route
    
    if (!preschoolId || !studentId) {
      console.log('Waiting for preschoolId or studentId...', { preschoolId, studentId });
      return;
    }

    const loadStudent = async () => {
      setLoading(true);
      try {
        // First try to get student with guardian_id relationship
        const { data, error } = await supabase
          .from('students')
          .select(`
            *,
            classes (
              id,
              name,
              age_group,
              teacher_id
            ),
            guardian:profiles!students_guardian_id_fkey (
              first_name,
              last_name,
              email,
              phone
            ),
            parent:profiles!students_parent_id_fkey (
              first_name,
              last_name,
              email,
              phone
            )
          `)
          .eq('id', studentId)
          .eq('preschool_id', preschoolId)
          .single();
        
        // Merge guardian/parent data - prefer guardian, fallback to parent
        if (data) {
          const guardianData = data.guardian as any;
          const parentData = data.parent as any;
          data.profiles = guardianData || parentData;
          // Clean up the separate fields
          delete (data as any).guardian;
          delete (data as any).parent;
        }

        if (error) {
          console.error('Error loading student:', error);
          setStudent(null);
          return;
        }

        console.log('[Student Page] Loaded student data:', data);
        console.log('[Student Page] Has profiles?', !!data?.profiles);
        console.log('[Student Page] Profile data:', data?.profiles);
        
        setStudent(data);

        // Load additional data in parallel
        Promise.all([
          // Registration data
          supabase
            .from('registration_requests')
            .select('preferred_class, preferred_start_date, how_did_you_hear, special_requests, previous_school')
            .eq('student_id', studentId)
            .maybeSingle()
            .then(({ data }: any) => setRegistrationData(data)),

          // Teacher name
          data.classes?.teacher_id ? supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', data.classes.teacher_id)
            .single()
            .then(({ data: teacher }: any) => {
              if (teacher) setTeacherName(`${teacher.first_name} ${teacher.last_name}`);
            }) : Promise.resolve(),

          // Attendance stats (last 30 days)
          supabase
            .from('attendance')
            .select('status')
            .eq('student_id', studentId)
            .gte('attendance_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .then(({ data: attendance }: any) => {
              if (attendance) {
                const present = attendance.filter((a: any) => a.status === 'present').length;
                const absent = attendance.filter((a: any) => a.status === 'absent').length;
                const total = attendance.length;
                setAttendanceStats({
                  present,
                  absent,
                  total,
                  percentage: total > 0 ? Math.round((present / total) * 100) : 0
                });
              }
            }),

          // Recent activities
          supabase
            .from('homework_submissions')
            .select('id, created_at, homework:homework_id(title)')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })
            .limit(5)
            .then(({ data: submissions }: any) => {
              if (submissions) {
                setRecentActivities(submissions.map((s: any) => ({
                  id: s.id,
                  type: 'homework',
                  title: (s.homework as any)?.title || 'Homework Submitted',
                  date: s.created_at
                })));
              }
            }),

          // Last parent contact
          supabase
            .from('messages')
            .select('created_at')
            .or(`sender_id.eq.${data.guardian_id},recipient_id.eq.${data.guardian_id}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .then(({ data: messages }: any) => {
              if (messages && messages[0]) {
                setLastContactDate(messages[0].created_at);
              }
            })
        ]).catch(err => console.error('Error loading additional data:', err));
      } catch (error) {
        console.error('Error loading student:', error);
        setStudent(null);
      } finally {
        setLoading(false);
      }
    };

    loadStudent();
  }, [preschoolId, studentId, supabase]);

  const handleSendPasswordReset = async () => {
    if (!student?.profiles?.email) {
      alert('No parent email found for this student');
      return;
    }

    if (!confirm(`Send password reset email to ${student.profiles.email}?`)) {
      return;
    }

    setSendingPasswordReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(student.profiles.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      alert(`✅ Password reset email sent to ${student.profiles.email}!\n\nThe parent will receive an email with instructions to set their password.`);
    } catch (error: any) {
      console.error('Error sending password reset:', error);
      alert(`Failed to send password reset email: ${error.message}`);
    } finally {
      setSendingPasswordReset(false);
    }
  };

  const calculateAge = (dateOfBirth: string | null) => {
    if (!dateOfBirth) return 'Unknown';
    const birth = new Date(dateOfBirth);
    const today = new Date();
    const years = Math.floor((today.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const months = Math.floor(((today.getTime() - birth.getTime()) / (30.44 * 24 * 60 * 60 * 1000)) % 12);
    return `${years} years, ${months} months`;
  };

  // Guard: Don't render if this is the enroll route
  if (studentId === 'enroll') {
    return null; // Let the /enroll route handle this
  }

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading student details...</p>
        </div>
      </PrincipalShell>
    );
  }

  if (!student) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
        <div className="section">
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <h3 style={{ marginBottom: 8 }}>Student not found</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
              The student you're looking for doesn't exist or you don't have access to view it.
            </p>
            <button 
              className="btn btnPrimary"
              onClick={() => router.push('/dashboard/principal/students')}
            >
              <ArrowLeft size={18} style={{ marginRight: 8 }} />
              Back to Students
            </button>
          </div>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section">
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button 
            className="btn btnSecondary"
            onClick={() => router.push('/dashboard/principal/students')}
            style={{ marginBottom: 16 }}
          >
            <ArrowLeft size={18} style={{ marginRight: 8 }} />
            Back to Students
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div 
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 600,
                fontSize: 32,
              }}
            >
              {student.first_name[0]}{student.last_name[0]}
            </div>
            <div>
              <h1 className="h1" style={{ marginBottom: 8 }}>
                {student.first_name} {student.last_name}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span 
                  style={{
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: student.status === 'active' ? '#10b98120' : '#f59e0b20',
                    color: student.status === 'active' ? '#10b981' : '#f59e0b',
                  }}
                >
                  {student.status}
                </span>
                {student.classes && (
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                    {student.classes.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {/* Personal Information */}
          <div className="card">
            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={20} />
              Personal Information
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Date of Birth</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={16} style={{ color: 'var(--muted)' }} />
                  {student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : 'Not provided'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Age</div>
                <div>{calculateAge(student.date_of_birth)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Gender</div>
                <div>{student.gender || 'Not provided'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Enrollment Date</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={16} style={{ color: 'var(--muted)' }} />
                  {student.enrollment_date ? new Date(student.enrollment_date).toLocaleDateString() : 'Not provided'}
                </div>
              </div>
            </div>
          </div>

          {/* Guardian Information */}
          {student.profiles && (
            <div className="card">
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={20} />
                Guardian Information
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Name</div>
                  <div>{student.profiles.first_name} {student.profiles.last_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Email</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Mail size={16} style={{ color: 'var(--muted)' }} />
                      {student.profiles.email}
                    </div>
                    <button
                      onClick={handleSendPasswordReset}
                      disabled={sendingPasswordReset}
                      className="btn btnSecondary"
                      style={{ 
                        fontSize: 12,
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        whiteSpace: 'nowrap'
                      }}
                      title="Send password reset email to parent"
                    >
                      <KeyRound size={14} />
                      {sendingPasswordReset ? 'Sending...' : 'Send Password Reset'}
                    </button>
                  </div>
                </div>
                {student.profiles.phone && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Phone</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Phone size={16} style={{ color: 'var(--muted)' }} />
                      {student.profiles.phone}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Medical Information */}
          <div className="card">
            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={20} />
              Medical Information
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Allergies</div>
                <div style={{ 
                  padding: 12, 
                  backgroundColor: student.allergies ? '#ef444420' : 'var(--surface)', 
                  borderRadius: 8,
                  color: student.allergies ? '#ef4444' : 'var(--muted)'
                }}>
                  {student.allergies || 'None reported'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Medical Notes</div>
                <div style={{ 
                  padding: 12, 
                  backgroundColor: 'var(--surface)', 
                  borderRadius: 8,
                  minHeight: 60,
                  color: student.medical_info ? 'inherit' : 'var(--muted)'
                }}>
                  {student.medical_info || 'No medical information provided'}
                </div>
              </div>
            </div>
          </div>

          {/* Class Information */}
          {student.classes && (
            <div className="card">
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <School size={20} />
                Class Assignment
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Class Name</div>
                  <div style={{ fontWeight: 600 }}>{student.classes.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Age Group</div>
                  <div>{student.classes.age_group}</div>
                </div>
                {teacherName && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Teacher</div>
                    <div>{teacherName}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Registration Details */}
          {registrationData && (
            <div className="card">
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={20} />
                Registration Details
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {registrationData.preferred_class && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Preferred Class</div>
                    <div>{registrationData.preferred_class}</div>
                  </div>
                )}
                {registrationData.preferred_start_date && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Preferred Start Date</div>
                    <div>{new Date(registrationData.preferred_start_date).toLocaleDateString()}</div>
                  </div>
                )}
                {registrationData.how_did_you_hear && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>How They Found Us</div>
                    <div>{registrationData.how_did_you_hear}</div>
                  </div>
                )}
                {registrationData.previous_school && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Previous School</div>
                    <div>{registrationData.previous_school}</div>
                  </div>
                )}
                {registrationData.special_requests && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Special Requests</div>
                    <div style={{ 
                      padding: 8,
                      backgroundColor: 'var(--surface)',
                      borderRadius: 6,
                      fontSize: 14
                    }}>
                      {registrationData.special_requests}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attendance Stats */}
          {attendanceStats && attendanceStats.total > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={20} />
                Attendance (Last 30 Days)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Attendance Rate</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: attendanceStats.percentage >= 90 ? '#10b981' : attendanceStats.percentage >= 75 ? '#f59e0b' : '#ef4444' }}>
                    {attendanceStats.percentage}%
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ padding: 8, backgroundColor: '#10b98110', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Present</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#10b981' }}>{attendanceStats.present}</div>
                  </div>
                  <div style={{ padding: 8, backgroundColor: '#ef444410', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Absent</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#ef4444' }}>{attendanceStats.absent}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Parent Communication */}
          {student.profiles && (
            <div className="card">
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={20} />
                Parent Communication
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Last Contact</div>
                  <div>{lastContactDate ? new Date(lastContactDate).toLocaleDateString() : 'No recent messages'}</div>
                </div>
                <button
                  className="btn btnSecondary"
                  onClick={() => router.push(`/dashboard/principal/messages?to=${student.guardian_id}`)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <MessageSquare size={16} style={{ marginRight: 8 }} />
                  Send Message
                </button>
              </div>
            </div>
          )}

          {/* Recent Activities */}
          {recentActivities.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={20} />
                Recent Activities
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentActivities.map((activity) => (
                  <div 
                    key={activity.id}
                    style={{
                      padding: 10,
                      backgroundColor: 'var(--surface)',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ fontSize: 14 }}>{activity.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {new Date(activity.date).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions Bar */}
        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button 
              className="btn btnSecondary"
              onClick={() => router.push(`/dashboard/principal/students/${student.id}/edit`)}
            >
              Edit Student
            </button>
            <button 
              className="btn btnSecondary"
              onClick={() => router.push(`/dashboard/principal/reports?student=${student.id}`)}
            >
              View Progress Reports
            </button>
            <button 
              className="btn btnSecondary"
              onClick={() => router.push(`/dashboard/principal/messages?to=${student.guardian_id}`)}
            >
              <MessageSquare size={16} style={{ marginRight: 8 }} />
              Message Parent
            </button>
            <div style={{ flex: 1 }} />
            <button 
              className="btn"
              style={{ 
                backgroundColor: student.status === 'active' ? '#f59e0b' : '#10b981',
                color: 'white'
              }}
              onClick={async () => {
                const newStatus = student.status === 'active' ? 'inactive' : 'active';
                const { error } = await supabase
                  .from('students')
                  .update({ status: newStatus })
                  .eq('id', student.id);
                
                if (!error) {
                  setStudent({ ...student, status: newStatus });
                }
              }}
            >
              {student.status === 'active' ? 'Deactivate' : 'Activate'} Student
            </button>
          </div>
        </div>
      </div>
    </PrincipalShell>
  );
}
