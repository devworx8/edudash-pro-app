'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { Clock, CheckCircle, XCircle, FileText, Calendar, Award, TrendingUp, Filter, Download } from 'lucide-react';

interface HomeworkSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
  status: 'submitted' | 'graded' | 'late';
  assignment: {
    title: string;
    due_date: string;
    total_points?: number;
  };
  student: {
    first_name: string;
    last_name: string;
  };
}

type FilterStatus = 'all' | 'graded' | 'pending' | 'late';

export default function HomeworkHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('all');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/sign-in');
        return;
      }
      setUserId(user.id);
      await loadData(user.id);
    };
    init();
  }, []);

  const loadData = async (uid: string) => {
    setLoading(true);

    // Get user's children (check parent_id AND guardian_id)
    const { data: childrenData } = await supabase
      .from('students')
      .select('id, first_name, last_name')
      .or(`parent_id.eq.${uid},guardian_id.eq.${uid}`);

    if (childrenData) {
      setChildren(childrenData);
    }

    // Get all submissions for user's children
    if (childrenData && childrenData.length > 0) {
      const childIds = childrenData.map((c: any) => c.id);

      const { data, error } = await supabase
        .from('homework_submissions')
        .select(`
          id,
          assignment_id,
          student_id,
          submitted_at,
          grade,
          feedback,
          assignment:homework_assignments(title, due_date, total_points, is_published),
          student:students(first_name, last_name)
        `)
        .in('student_id', childIds)
        .order('submitted_at', { ascending: false });

      if (!error && data) {
        const processedData = data
          .filter((sub: any) => sub.assignment?.is_published !== false)
          .map((sub: any) => ({
          ...sub,
          status: sub.grade !== null 
            ? 'graded' 
            : new Date(sub.submitted_at) > new Date(sub.assignment.due_date)
            ? 'late'
            : 'submitted'
        }));
        setSubmissions(processedData as any);
      }
    }

    setLoading(false);
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 75) return 'var(--success)';
    if (grade >= 50) return 'var(--warning)';
    return 'var(--danger)';
  };

  const getStatusBadge = (submission: HomeworkSubmission) => {
    if (submission.grade !== null) {
      return (
        <span style={{
          padding: '4px 12px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: getGradeColor(submission.grade),
          color: 'white',
        }}>
          {submission.grade}%
        </span>
      );
    }

    if (submission.status === 'late') {
      return (
        <span style={{
          padding: '4px 12px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: 'var(--warning)',
          color: 'white',
        }}>
          Late
        </span>
      );
    }

    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: 'var(--info)',
        color: 'white',
      }}>
        Pending
      </span>
    );
  };

  const filteredSubmissions = submissions.filter(sub => {
    if (selectedChild !== 'all' && sub.student_id !== selectedChild) return false;
    
    if (filter === 'all') return true;
    if (filter === 'graded') return sub.grade !== null;
    if (filter === 'pending') return sub.grade === null && sub.status !== 'late';
    if (filter === 'late') return sub.status === 'late';
    return true;
  });

  // Calculate stats
  const totalSubmissions = submissions.length;
  const gradedCount = submissions.filter(s => s.grade !== null).length;
  const pendingCount = submissions.filter(s => s.grade === null && s.status !== 'late').length;
  const lateCount = submissions.filter(s => s.status === 'late').length;
  const averageGrade = gradedCount > 0
    ? Math.round(submissions.filter(s => s.grade !== null).reduce((sum, s) => sum + (s.grade || 0), 0) / gradedCount)
    : 0;

  return (
    <ParentShell hideHeader={true}>
      <div className="section">
        <div style={{ marginBottom: 24 }}>
          <h1 className="h1">Homework History</h1>
          <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
            View all past homework submissions and grades
          </p>
        </div>

        {/* Stats Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'var(--primary-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <FileText className="icon20" style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{totalSubmissions}</div>
                <div style={{ fontSize: 13, color: 'var(--textLight)' }}>Total Submissions</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'var(--success-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Award className="icon20" style={{ color: 'var(--success)' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{averageGrade}%</div>
                <div style={{ fontSize: 13, color: 'var(--textLight)' }}>Average Grade</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'var(--info-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Clock className="icon20" style={{ color: 'var(--info)' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{pendingCount}</div>
                <div style={{ fontSize: 13, color: 'var(--textLight)' }}>Pending Review</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ 
          display: 'flex',
          gap: 16,
          marginBottom: 24,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          {/* Child Filter */}
          {children.length > 1 && (
            <select
              value={selectedChild}
              onChange={(e) => setSelectedChild(e.target.value)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <option value="all">All Children</option>
              {children.map((child: any) => (
                <option key={child.id} value={child.id}>
                  {child.first_name} {child.last_name}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter Tabs */}
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            flex: 1,
            overflowX: 'auto',
            paddingBottom: 8,
            borderBottom: '1px solid var(--border)'
          }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: filter === 'all' ? 'var(--primary)' : 'transparent',
                color: filter === 'all' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <Filter className="icon16" />
              All ({totalSubmissions})
            </button>
            <button
              onClick={() => setFilter('graded')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: filter === 'graded' ? 'var(--success)' : 'transparent',
                color: filter === 'graded' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <CheckCircle className="icon16" />
              Graded ({gradedCount})
            </button>
            <button
              onClick={() => setFilter('pending')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: filter === 'pending' ? 'var(--info)' : 'transparent',
                color: filter === 'pending' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <Clock className="icon16" />
              Pending ({pendingCount})
            </button>
            {lateCount > 0 && (
              <button
                onClick={() => setFilter('late')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: filter === 'late' ? 'var(--warning)' : 'transparent',
                  color: filter === 'late' ? 'white' : 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                <XCircle className="icon16" />
                Late ({lateCount})
              </button>
            )}
          </div>
        </div>

        {/* Submissions List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ margin: '0 auto' }}></div>
            <p style={{ color: 'var(--textLight)', marginTop: 16 }}>Loading submissions...</p>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <FileText className="icon48" style={{ margin: '0 auto', color: 'var(--textLight)' }} />
            <h3 style={{ marginTop: 16 }}>No submissions found</h3>
            <p style={{ color: 'var(--textLight)', marginTop: 8 }}>
              {filter === 'all' 
                ? 'Homework submissions will appear here once submitted.'
                : `No ${filter} submissions found.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredSubmissions.map((submission) => (
              <div
                key={submission.id}
                className="card"
                style={{
                  padding: 20,
                  borderLeft: submission.grade !== null 
                    ? `4px solid ${getGradeColor(submission.grade)}`
                    : submission.status === 'late'
                    ? '4px solid var(--warning)'
                    : '4px solid var(--info)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600 }}>
                        {submission.assignment.title}
                      </h3>
                      {getStatusBadge(submission)}
                    </div>
                    
                    <div style={{ fontSize: 14, color: 'var(--textMuted)', marginBottom: 8 }}>
                      <strong>{submission.student.first_name} {submission.student.last_name}</strong>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--textLight)', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar className="icon14" />
                        Due: {new Date(submission.assignment.due_date).toLocaleDateString('en-ZA')}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock className="icon14" />
                        Submitted: {new Date(submission.submitted_at).toLocaleDateString('en-ZA')}
                      </div>
                    </div>
                    
                    {submission.feedback && (
                      <div style={{ 
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 8,
                        background: 'var(--surface)',
                        fontSize: 14,
                        lineHeight: 1.5
                      }}>
                        <strong style={{ color: 'var(--textLight)', fontSize: 12 }}>Teacher Feedback:</strong>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--text)' }}>
                          {submission.feedback}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {submission.grade !== null && (
                    <div style={{ 
                      textAlign: 'center',
                      padding: 16,
                      borderRadius: 12,
                      background: 'var(--surface)',
                      minWidth: 100,
                    }}>
                      <div style={{ 
                        fontSize: 32, 
                        fontWeight: 700,
                        color: getGradeColor(submission.grade)
                      }}>
                        {submission.grade}%
                      </div>
                      {submission.assignment.total_points && (
                        <div style={{ fontSize: 12, color: 'var(--textLight)', marginTop: 4 }}>
                          out of {submission.assignment.total_points} points
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ParentShell>
  );
}
