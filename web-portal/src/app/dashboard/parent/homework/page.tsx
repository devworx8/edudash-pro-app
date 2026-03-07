'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { FileText, Sparkles, CheckCircle2, Clock, AlertCircle, BookOpen } from 'lucide-react';

type HomeworkSubmission = {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_at: string;
  feedback?: string | null;
  [key: string]: unknown;
};

type HomeworkAssignmentRecord = {
  id: string;
  class_id: string;
  preschool_id: string;
  title: string;
  description?: string | null;
  due_date: string;
  subject?: string | null;
  estimated_time_minutes?: number | null;
  class?: { name?: string | null } | null;
  [key: string]: unknown;
};

type HomeworkAssignment = HomeworkAssignmentRecord & {
  homework_submissions?: HomeworkSubmission[];
  submissions?: HomeworkSubmission[];
};

type HomeworkStats = {
  pending: number;
  completed: number;
  total: number;
  overdue: number;
};

// Skeleton Component
const HomeworkSkeleton = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        className="card"
        style={{
          padding: '20px',
          background: 'var(--surface)',
          borderRadius: '12px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      >
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
          <div style={{ width: '48px', height: '48px', background: 'var(--surface-2)', borderRadius: '12px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: '20px', width: '60%', background: 'var(--surface-2)', borderRadius: '4px', marginBottom: '8px' }} />
            <div style={{ height: '14px', width: '40%', background: 'var(--surface-2)', borderRadius: '4px' }} />
          </div>
        </div>
        <div style={{ height: '14px', width: '80%', background: 'var(--surface-2)', borderRadius: '4px' }} />
      </div>
    ))}
    <style jsx>{`
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.6;
        }
      }
    `}</style>
  </div>
);

// Disable static generation for this page
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

// Format due date
const formatDueDate = (dueDateStr: string): { text: string; isOverdue: boolean; isDueSoon: boolean } => {
  const dueDate = new Date(dueDateStr);
  const today = new Date();
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const isOverdue = diffDays < 0;
  const isDueSoon = diffDays >= 0 && diffDays <= 2;
  
  if (isOverdue) {
    return { text: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`, isOverdue: true, isDueSoon: false };
  } else if (diffDays === 0) {
    return { text: 'Due today', isOverdue: false, isDueSoon: true };
  } else if (diffDays === 1) {
    return { text: 'Due tomorrow', isOverdue: false, isDueSoon: true };
  } else if (diffDays <= 7) {
    return { text: `Due in ${diffDays} days`, isOverdue: false, isDueSoon };
  } else {
    return { text: dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' }), isOverdue: false, isDueSoon: false };
  }
};

export default function HomeworkPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [homework, setHomework] = useState<HomeworkAssignment[]>([]);
  const [stats, setStats] = useState<HomeworkStats | null>(null);
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get parent dashboard data
  const {
    userName,
    preschoolName,
    hasOrganization,
    tenantSlug,
    profile,
    childrenCards,
    activeChildId,
    setActiveChildId,
  } = useParentDashboardData();
  
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/sign-in'); return; }
      setUserId(session.user.id);
      setLoading(false);
    })();
  }, [router, supabase.auth]);

  // Fetch homework data when activeChildId changes
  useEffect(() => {
    if (!activeChildId || !userId) return;
    
    const fetchHomework = async () => {
      setHomeworkLoading(true);
      try {
        // Get student data first
        const { data: studentData } = await supabase
          .from('students')
          .select('preschool_id, organization_id, class_id')
          .eq('id', activeChildId)
          .single();

        if (!studentData || !studentData.class_id) {
          setHomework([]);
          setStats({ pending: 0, completed: 0, total: 0, overdue: 0 });
          setHomeworkLoading(false);
          return;
        }
        const schoolId = studentData.organization_id || studentData.preschool_id || null;

        // Fetch homework assignments for the class
        let assignmentsQuery = supabase
          .from('homework_assignments')
          .select('*')
          .eq('class_id', studentData.class_id)
          .eq('is_published', true)
          .order('due_date', { ascending: true });

        if (schoolId) {
          assignmentsQuery = assignmentsQuery.eq('preschool_id', schoolId);
        }

        const { data: assignments, error: hwError } = await assignmentsQuery;
        
        if (hwError) throw hwError;

        // Fetch submissions for this student
        const assignmentIds = assignments?.map((assignment: { id: string }) => assignment.id) || [];
        const submissionsResponse = assignmentIds.length > 0 ? await (() => {
          let submissionsQuery = supabase
            .from('homework_submissions')
            .select('*')
            .eq('student_id', activeChildId)
            .in('assignment_id', assignmentIds);
          if (schoolId) {
            submissionsQuery = submissionsQuery.eq('preschool_id', schoolId);
          }
          return submissionsQuery;
        })() : { data: [] as HomeworkSubmission[] };

        const submissions = (submissionsResponse.data || []) as HomeworkSubmission[];

        // Attach submissions to assignments
        const enrichedAssignments: HomeworkAssignment[] = assignments?.map((assignment: HomeworkAssignmentRecord) => ({
          ...assignment,
          homework_submissions: submissions?.filter((submission: HomeworkSubmission) => submission.assignment_id === assignment.id) || [],
          submissions: submissions?.filter((submission: HomeworkSubmission) => submission.assignment_id === assignment.id) || []
        })) || [];
        
        const data: HomeworkAssignment[] = enrichedAssignments;
        
        if (hwError) throw hwError;
        setHomework(data || []);
        
        // Calculate stats
        const pending = data?.filter((hw) => !hw.homework_submissions || hw.homework_submissions.length === 0).length || 0;
        const completed = data?.filter((hw) => hw.homework_submissions && hw.homework_submissions.length > 0).length || 0;
        const overdueCount = data?.filter((hw) => {
          const hasSubmission = !!(hw.homework_submissions && hw.homework_submissions.length);
          if (hasSubmission) return false;
          return new Date(hw.due_date).getTime() < Date.now();
        }).length || 0;
        setStats({ pending, completed, total: data?.length || 0, overdue: overdueCount });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setHomeworkLoading(false);
      }
    };
    
    fetchHomework();
  }, [activeChildId, userId, supabase]);

  if (loading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Separate homework by status
  const today = new Date().toISOString().split('T')[0];
  const activeChild = childrenCards.find((child) => child.id === activeChildId) || null;
  const preschoolGradeLike = (activeChild?.grade || '').toLowerCase().includes('preschool')
    || (activeChild?.grade || '').toLowerCase().includes('grade r');
  const isPreschoolContext = preschoolGradeLike || Boolean(activeChild?.preschoolId);
  const pageTitle = isPreschoolContext ? 'Take-home Activities' : 'Homework';
  const pageSubtitle = hasOrganization
    ? (
      isPreschoolContext
        ? 'Worksheets and routine-friendly activities for your child at home.'
        : "Track your child's school assignments and get AI homework help"
    )
    : 'AI-powered homework assistance and practice';

  const pendingHomework = homework?.filter(hw => 
    !hw.submissions || hw.submissions.length === 0
  ).filter(hw => hw.due_date >= today) || [];
  
  const overdueHomework = homework?.filter(hw => 
    (!hw.submissions || hw.submissions.length === 0) && hw.due_date < today
  ) || [];
  
  const completedHomework = homework?.filter(hw => 
    hw.submissions && hw.submissions.length > 0
  ) || [];

  return (
    <ParentShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={userName}
      preschoolName={preschoolName}
      hasOrganization={hasOrganization}
    >
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader 
          title={pageTitle}
          subtitle={pageSubtitle}
          icon={<FileText size={28} color="white" />}
        />
        
        <div style={{ width: '100%', padding: '20px' }}>
        {/* Child Selector */}
        {childrenCards.length > 1 && (
          <div className="section">
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
              {childrenCards.map((child) => (
                <button
                  key={child.id}
                  onClick={() => setActiveChildId(child.id)}
                  className="chip"
                  style={{
                    padding: '8px 16px',
                    borderRadius: 20,
                    border: activeChildId === child.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: activeChildId === child.id ? 'var(--primary-subtle)' : 'var(--surface-1)',
                    color: activeChildId === child.id ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: activeChildId === child.id ? 600 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {child.firstName} {child.lastName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {homeworkLoading && <HomeworkSkeleton />}

        {/* Stats Cards */}
        {hasOrganization && stats && !homeworkLoading && (
          <div className="section">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                <Clock size={24} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.pending}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Pending</div>
              </div>
              
              <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                <AlertCircle size={24} color="var(--danger)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)' }}>{stats.overdue}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Overdue</div>
              </div>
              
              <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                <CheckCircle2 size={24} color="var(--success)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{stats.completed}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Completed</div>
              </div>
              
              <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                <FileText size={24} color="var(--muted)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.total}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Total</div>
              </div>
            </div>
          </div>
        )}

        {/* AI Homework Help CTA */}
        <div className="section">
          <div
            className="card"
            style={{
              padding: 20,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16
            }}
            onClick={() => router.push('/dashboard/parent/ai-help')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Sparkles size={32} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>AI Homework Helper</div>
                <div style={{ fontSize: 14, opacity: 0.9 }}>Get instant help with any homework question</div>
              </div>
            </div>
            <button className="btn" style={{ background: 'white', color: '#8b5cf6', padding: '8px 16px', fontWeight: 600 }}>
              Try Now
            </button>
          </div>
        </div>

        {/* School Homework Assignments (Only for hasOrganization) */}
        {hasOrganization && (
          <>
            {homeworkLoading && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div className="spinner" style={{ margin: '0 auto' }}></div>
              </div>
            )}

            {error && (
              <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                <p style={{ color: 'var(--danger)', marginBottom: 12 }}>Failed to load homework</p>
              </div>
            )}

            {!homeworkLoading && !error && (
              <>
                {/* Overdue Homework */}
                {overdueHomework.length > 0 && (
                  <div className="section">
                    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertCircle size={20} /> Overdue ({overdueHomework.length})
                    </h2>
                    {overdueHomework.map((hw) => {
                      const dueInfo = formatDueDate(hw.due_date);
                      return (
                        <div
                          key={hw.id}
                          className="card"
                          style={{ padding: 16, marginBottom: 12, borderLeft: '4px solid var(--danger)', cursor: 'pointer' }}
                          onClick={() => router.push(`/dashboard/parent/homework/${hw.id}`)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{hw.title}</h3>
                              {hw.class && (
                                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                                  {hw.class.name} {hw.subject && `• ${hw.subject}`}
                                </p>
                              )}
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 12 }}>
                              {dueInfo.text}
                            </span>
                          </div>
                          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>{hw.description}</p>
                          {hw.estimated_time_minutes && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={14} /> ~{hw.estimated_time_minutes} minutes
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pending Homework */}
                {pendingHomework.length > 0 && (
                  <div className="section">
                    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Clock size={20} /> Pending ({pendingHomework.length})
                    </h2>
                    {pendingHomework.map((hw) => {
                      const dueInfo = formatDueDate(hw.due_date);
                      return (
                        <div
                          key={hw.id}
                          className="card"
                          style={{ padding: 16, marginBottom: 12, borderLeft: dueInfo.isDueSoon ? '4px solid var(--warning)' : '4px solid var(--primary)', cursor: 'pointer' }}
                          onClick={() => router.push(`/dashboard/parent/homework/${hw.id}`)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{hw.title}</h3>
                              {hw.class && (
                                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                                  {hw.class.name} {hw.subject && `• ${hw.subject}`}
                                </p>
                              )}
                            </div>
                            <span style={{ 
                              fontSize: 12, 
                              color: dueInfo.isDueSoon ? 'var(--warning)' : 'var(--muted)', 
                              fontWeight: dueInfo.isDueSoon ? 600 : 500,
                              whiteSpace: 'nowrap', 
                              marginLeft: 12 
                            }}>
                              {dueInfo.text}
                            </span>
                          </div>
                          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>{hw.description}</p>
                          {hw.estimated_time_minutes && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={14} /> ~{hw.estimated_time_minutes} minutes
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Completed Homework */}
                {completedHomework.length > 0 && (
                  <div className="section">
                    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={20} color="var(--success)" /> Completed ({completedHomework.length})
                    </h2>
                    {completedHomework.map((hw) => {
                      const submission = hw.submissions?.[0];
                      const submissionStatus = submission?.status === 'graded'
                        ? { label: 'Graded', color: 'var(--success)' }
                        : { label: 'Submitted', color: 'var(--warning)' };
                      return (
                        <div
                          key={hw.id}
                          className="card"
                          style={{ padding: 16, marginBottom: 12, borderLeft: '4px solid var(--success)', opacity: 0.8, cursor: 'pointer' }}
                          onClick={() => router.push(`/dashboard/parent/homework/${hw.id}`)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{hw.title}</h3>
                              {hw.class && (
                                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                                  {hw.class.name} {hw.subject && `• ${hw.subject}`}
                                </p>
                              )}
                            </div>
                            {submission && (
                              <span style={{ fontSize: 12, color: submissionStatus.color, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 12 }}>
                                {submissionStatus.label} • {new Date(submission.submitted_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {submission?.feedback && (
                            <div style={{ marginTop: 8, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Teacher Feedback:</div>
                              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{submission.feedback}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Empty state */}
                {homework && homework.length === 0 && (
                  <div className="card" style={{ padding: 48, textAlign: 'center' }}>
                    <BookOpen size={64} color="var(--muted)" style={{ margin: '0 auto 16px' }} />
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                      {isPreschoolContext ? 'No take-home activities yet' : 'No homework assigned yet'}
                    </h3>
                    <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                      {isPreschoolContext
                        ? "When your child's teacher assigns a worksheet or activity, it will appear here."
                        : "When your child's teacher assigns homework, it will appear here."}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Standalone Parent View (No School) */}
        {!hasOrganization && (
          <div className="section">
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <Sparkles size={64} color="var(--primary)" style={{ margin: '0 auto 24px' }} />
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>AI-Powered Homework Help</h3>
              <p style={{ color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
                Get instant help with any homework question. Our AI tutor can:
              </p>
              <ul style={{ textAlign: 'left', maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.8 }}>
                <li>📝 Explain concepts step-by-step</li>
                <li>🧮 Solve math problems with detailed solutions</li>
                <li>📚 Help with reading comprehension</li>
                <li>🔬 Explain science concepts</li>
                <li>✍️ Assist with writing assignments</li>
              </ul>
              <button
                onClick={() => router.push('/dashboard/parent/ai-help')}
                className="btn btnPrimary"
                style={{ padding: '12px 32px', fontSize: 16, fontWeight: 600 }}
              >
                Start Learning
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </ParentShell>
  );
}
