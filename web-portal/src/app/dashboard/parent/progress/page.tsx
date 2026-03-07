'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { BarChart3, Users, TrendingUp, TrendingDown, Award, Target, Calendar, BookOpen } from 'lucide-react';

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  grade_level?: string | null;
  class_id?: string;
}

interface LessonAssignmentRow {
  id: string;
  lesson_id: string | null;
  interactive_activity_id: string | null;
  status: 'assigned' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
  due_date: string | null;
  assigned_at: string | null;
  lesson?: {
    id: string;
    title: string | null;
    subject: string | null;
    duration_minutes?: number | null;
  } | null;
  interactive_activity?: {
    id: string;
    title: string | null;
    subject?: string | null;
  } | null;
}

interface LessonCompletionRow {
  assignment_id: string;
  score: number | null;
  completed_at: string | null;
  time_spent_minutes?: number | null;
}

interface AttendanceRow {
  status: string | null;
  attendance_date: string;
}

interface ProgressSummary {
  attendanceRate: number | null;
  attendanceDelta: number | null;
  lessonPending: number;
  lessonOverdue: number;
  averageScore: number | null;
  averageScoreDelta: number | null;
  lessonsCompleted: number;
  lessonsTotal: number;
}

interface GradeStats {
  subject: string;
  average: number | null;
  trend: 'up' | 'down' | 'stable';
  completed: number;
  total: number;
}

interface LessonProgressItem {
  id: string;
  title: string;
  subject: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'overdue';
  assignedAt: string | null;
  dueDate: string | null;
  score: number | null;
  completedAt: string | null;
}

export default function ProgressPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>();
  const { slug } = useTenantSlug(userId);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [gradeStats, setGradeStats] = useState<GradeStats[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [recentLessons, setRecentLessons] = useState<LessonProgressItem[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/sign-in'); return; }
      setEmail(session.user.email || '');
      setUserId(session.user.id);
    })();
  }, [router, supabase.auth]);

  const loadChildren = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      const { data: childrenData, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, grade, grade_level, class_id')
        .or(`parent_id.eq.${userId},guardian_id.eq.${userId}`)
        .eq('is_active', true);

      if (error) throw error;

      if (childrenData && childrenData.length > 0) {
        setChildren(childrenData as Child[]);
        setSelectedChildId((prev) => prev ?? childrenData[0].id);
      } else {
        setChildren([]);
        setSelectedChildId(undefined);
      }
    } catch (error) {
      console.error('Error loading children:', error);
      setChildren([]);
      setSelectedChildId(undefined);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  const loadProgressData = useCallback(async (childId: string) => {
    setSummary(null);
    setGradeStats([]);
    setRecentLessons([]);
    try {
      const now = new Date();
      const dayMs = 24 * 60 * 60 * 1000;
      const todayKey = now.toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(now.getTime() - 30 * dayMs);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * dayMs);
      const thirtyDaysKey = thirtyDaysAgo.toISOString().split('T')[0];
      const sixtyDaysKey = sixtyDaysAgo.toISOString().split('T')[0];

      const average = (values: number[]): number | null => {
        if (values.length === 0) return null;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      };

      const attendanceRateFromRows = (rows: AttendanceRow[]): number | null => {
        if (rows.length === 0) return null;
        const presentCount = rows.filter((row) => {
          const status = row.status?.toLowerCase?.() || '';
          return status === 'present' || status === 'late';
        }).length;
        return Math.round((presentCount / rows.length) * 100);
      };

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from('lesson_assignments')
        .select(`
          id,
          lesson_id,
          interactive_activity_id,
          status,
          due_date,
          assigned_at,
          lesson:lessons(id, title, subject, duration_minutes),
          interactive_activity:interactive_activities(id, title, subject)
        `)
        .eq('student_id', childId)
        .order('assigned_at', { ascending: false });

      if (assignmentError) throw assignmentError;

      const { data: completionRows, error: completionError } = await supabase
        .from('lesson_completions')
        .select('assignment_id, score, completed_at, time_spent_minutes')
        .eq('student_id', childId);

      if (completionError) throw completionError;

      const assignments = ((assignmentRows || []) as LessonAssignmentRow[])
        .filter((assignment) => assignment.status !== 'cancelled');
      const completions = (completionRows || []) as LessonCompletionRow[];

      const completionMap = new Map<string, LessonCompletionRow>();
      completions.forEach((completion) => {
        if (completion.assignment_id) {
          completionMap.set(completion.assignment_id, completion);
        }
      });

      const isCompleted = (assignment: LessonAssignmentRow) =>
        assignment.status === 'completed' || completionMap.has(assignment.id);

      const totalLessons = assignments.length;
      const lessonsCompleted = assignments.filter(isCompleted).length;
      const lessonOverdue = assignments.filter((assignment) => {
        if (isCompleted(assignment)) return false;
        return assignment.due_date ? new Date(assignment.due_date) < now : false;
      }).length;
      const lessonPending = Math.max(totalLessons - lessonsCompleted, 0);

      const scoredCompletions = completions.filter((completion) => typeof completion.score === 'number');
      const scoreValues = scoredCompletions.map((completion) => completion.score as number);
      const averageScoreValue = average(scoreValues);
      const averageScoreRounded = averageScoreValue !== null ? Math.round(averageScoreValue) : null;

      const recentScores = completions
        .filter((completion) => {
          if (typeof completion.score !== 'number' || !completion.completed_at) return false;
          return new Date(completion.completed_at) >= thirtyDaysAgo;
        })
        .map((completion) => completion.score as number);

      const previousScores = completions
        .filter((completion) => {
          if (typeof completion.score !== 'number' || !completion.completed_at) return false;
          const completedAt = new Date(completion.completed_at);
          return completedAt < thirtyDaysAgo && completedAt >= sixtyDaysAgo;
        })
        .map((completion) => completion.score as number);

      const recentAverage = average(recentScores);
      const previousAverage = average(previousScores);
      const averageScoreDelta = recentAverage !== null && previousAverage !== null
        ? Math.round(recentAverage - previousAverage)
        : null;

      let attendanceRate: number | null = null;
      let attendanceDelta: number | null = null;

      const { data: attendanceRowsData, error: attendanceError } = await supabase
        .from('attendance')
        .select('status, attendance_date')
        .eq('student_id', childId)
        .gte('attendance_date', sixtyDaysKey)
        .lte('attendance_date', todayKey);

      const attendanceRows = (attendanceRowsData || []) as AttendanceRow[];

      if (!attendanceError && attendanceRows.length > 0) {
        const recentAttendance = attendanceRows.filter((row) => row.attendance_date >= thirtyDaysKey);
        const previousAttendance = attendanceRows.filter((row) => row.attendance_date < thirtyDaysKey);

        const recentRate = attendanceRateFromRows(recentAttendance);
        const previousRate = attendanceRateFromRows(previousAttendance);

        attendanceRate = recentRate;
        attendanceDelta = recentRate !== null && previousRate !== null
          ? recentRate - previousRate
          : null;
      }

      const subjectMap = new Map<string, {
        subject: string;
        total: number;
        completed: number;
        scores: number[];
        timeline: Array<{ score: number; date: string | null }>;
      }>();

      assignments.forEach((assignment) => {
        const subject = assignment.lesson?.subject
          || assignment.interactive_activity?.subject
          || 'General';
        const subjectKey = subject.trim() || 'General';
        const completion = completionMap.get(assignment.id);

        const entry = subjectMap.get(subjectKey) || {
          subject: subjectKey,
          total: 0,
          completed: 0,
          scores: [],
          timeline: [],
        };

        entry.total += 1;
        if (isCompleted(assignment)) entry.completed += 1;
        if (typeof completion?.score === 'number') {
          entry.scores.push(completion.score);
          entry.timeline.push({ score: completion.score, date: completion.completed_at });
        }

        subjectMap.set(subjectKey, entry);
      });

      const computeTrend = (timeline: Array<{ score: number; date: string | null }>): 'up' | 'down' | 'stable' => {
        if (timeline.length < 4) return 'stable';
        const sorted = [...timeline]
          .filter((item) => item.date)
          .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
        if (sorted.length < 4) return 'stable';

        const mid = Math.floor(sorted.length / 2);
        const firstAverage = average(sorted.slice(0, mid).map((item) => item.score));
        const secondAverage = average(sorted.slice(mid).map((item) => item.score));

        if (firstAverage === null || secondAverage === null) return 'stable';
        const delta = secondAverage - firstAverage;
        if (delta >= 3) return 'up';
        if (delta <= -3) return 'down';
        return 'stable';
      };

      const stats: GradeStats[] = Array.from(subjectMap.values())
        .map((entry) => ({
          subject: entry.subject,
          average: entry.scores.length > 0 ? Math.round((average(entry.scores) || 0)) : null,
          trend: computeTrend(entry.timeline),
          completed: entry.completed,
          total: entry.total,
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject));

      const recentLessonItems: LessonProgressItem[] = assignments.slice(0, 5).map((assignment) => {
        const completion = completionMap.get(assignment.id);
        const title = assignment.lesson?.title
          || assignment.interactive_activity?.title
          || 'Untitled Lesson';
        const subject = assignment.lesson?.subject
          || assignment.interactive_activity?.subject
          || 'General';
        const completed = isCompleted(assignment);
        const overdue = !completed && assignment.due_date ? new Date(assignment.due_date) < now : false;
        const status: LessonProgressItem['status'] = overdue
          ? 'overdue'
          : completed
          ? 'completed'
          : assignment.status === 'in_progress'
          ? 'in_progress'
          : 'assigned';

        return {
          id: assignment.id,
          title,
          subject,
          status,
          assignedAt: assignment.assigned_at,
          dueDate: assignment.due_date,
          score: completion?.score ?? null,
          completedAt: completion?.completed_at ?? null,
        };
      });

      setSummary({
        attendanceRate,
        attendanceDelta,
        lessonPending,
        lessonOverdue,
        averageScore: averageScoreRounded,
        averageScoreDelta,
        lessonsCompleted,
        lessonsTotal: totalLessons,
      });
      setGradeStats(stats);
      setRecentLessons(recentLessonItems);
    } catch (error) {
      console.error('Error loading progress data:', error);
      setSummary(null);
      setGradeStats([]);
      setRecentLessons([]);
    }
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    loadChildren();
  }, [loadChildren, userId]);

  useEffect(() => {
    if (!selectedChildId) return;
    loadProgressData(selectedChildId);
  }, [loadProgressData, selectedChildId]);

  const hasData = children.length > 0;
  const attendanceRate = summary?.attendanceRate ?? null;
  const attendanceDelta = summary?.attendanceDelta ?? null;
  const pendingLessons = summary?.lessonPending ?? 0;
  const overdueLessons = summary?.lessonOverdue ?? 0;
  const averageScore = summary?.averageScore ?? null;
  const averageScoreDelta = summary?.averageScoreDelta ?? null;
  const lessonsCompleted = summary?.lessonsCompleted ?? 0;
  const lessonsTotal = summary?.lessonsTotal ?? 0;

  const getLessonStatusBadge = (status: LessonProgressItem['status']) => {
    switch (status) {
      case 'completed':
        return { label: 'Completed', background: '#d1fae5', color: '#059669' };
      case 'overdue':
        return { label: 'Overdue', background: '#fee2e2', color: '#dc2626' };
      case 'in_progress':
        return { label: 'In Progress', background: '#e0f2fe', color: '#0284c7' };
      default:
        return { label: 'Assigned', background: '#fef3c7', color: '#d97706' };
    }
  };

  return (
    <ParentShell tenantSlug={slug} userEmail={email} hideHeader={true}>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader 
          title="Progress Reports"
          subtitle="Monitor academic performance and achievements"
          icon={<BarChart3 size={28} color="white" />}
        />
        
        <div style={{ width: '100%', padding: '20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : !hasData ? (
            <div className="section">
              <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                <Users size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <h3 style={{ marginBottom: 8 }}>No children found</h3>
                <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
                  Add your children to start tracking their progress
                </p>
                <button
                  onClick={() => router.push('/dashboard/parent/children')}
                  className="btn btnPrimary"
                >
                  <Users size={18} />
                  Manage Children
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Child Selector */}
              <div className="section">
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                  {children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => setSelectedChildId(child.id)}
                      className="card"
                      style={{
                        padding: 16,
                        minWidth: 200,
                        flexShrink: 0,
                        cursor: 'pointer',
                        border: selectedChildId === child.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: selectedChildId === child.id ? 'var(--surface-1)' : 'transparent',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {child.first_name} {child.last_name}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {child.grade || child.grade_level || 'No grade'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Overview Metrics */}
              <div className="section">
                <div className="sectionTitle">Overview</div>
                <div className="grid2">
                  <div className="card tile">
                    <div
                      className="metricValue"
                      style={{ color: attendanceRate !== null ? '#10b981' : 'var(--muted)' }}
                    >
                      {attendanceRate !== null ? `${attendanceRate}%` : '--'}
                    </div>
                    <div className="metricLabel">Attendance Rate</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: attendanceDelta !== null ? (attendanceDelta >= 0 ? '#10b981' : '#ef4444') : 'var(--muted)',
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {attendanceDelta !== null ? (
                        <>
                          {attendanceDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {attendanceDelta >= 0 ? '+' : ''}{attendanceDelta}% vs last 30 days
                        </>
                      ) : (
                        <>No recent attendance data</>
                      )}
                    </div>
                  </div>
                  <div className="card tile">
                    <div className="metricValue" style={{ color: pendingLessons > 0 ? '#f59e0b' : '#10b981' }}>
                      {pendingLessons}
                    </div>
                    <div className="metricLabel">Lessons Pending</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: overdueLessons > 0 ? '#ef4444' : 'var(--muted)',
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {overdueLessons > 0 ? (
                        <>
                          <TrendingDown size={14} /> {overdueLessons} overdue
                        </>
                      ) : (
                        <>
                          <TrendingUp size={14} /> All on track
                        </>
                      )}
                    </div>
                  </div>
                  <div className="card tile">
                    <div
                      className="metricValue"
                      style={{
                        color: averageScore !== null
                          ? (averageScore >= 75 ? '#10b981' : averageScore >= 50 ? '#f59e0b' : '#ef4444')
                          : 'var(--muted)',
                      }}
                    >
                      {averageScore !== null ? `${averageScore}%` : '--'}
                    </div>
                    <div className="metricLabel">Average Score</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: averageScoreDelta !== null ? (averageScoreDelta >= 0 ? '#10b981' : '#ef4444') : 'var(--muted)',
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {averageScoreDelta !== null ? (
                        <>
                          {averageScoreDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {averageScoreDelta >= 0 ? '+' : ''}{averageScoreDelta}% vs last 30 days
                        </>
                      ) : (
                        <>No graded lessons yet</>
                      )}
                    </div>
                  </div>
                  <div className="card tile">
                    <div className="metricValue" style={{ color: '#06b6d4' }}>{lessonsCompleted}</div>
                    <div className="metricLabel">Lessons Completed</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Out of {lessonsTotal} total
                    </div>
                  </div>
                </div>
              </div>

              {/* Subject Performance */}
              <div className="section">
                <div className="sectionTitle">Subject Performance</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {gradeStats.length === 0 ? (
                    <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
                      No lesson performance data yet
                    </div>
                  ) : (
                    gradeStats.map((stat) => {
                      const averageValue = stat.average;
                      const averageColor = averageValue === null
                        ? 'var(--muted)'
                        : averageValue >= 75
                        ? '#10b981'
                        : averageValue >= 50
                        ? '#f59e0b'
                        : '#ef4444';
                      const trendColor = averageValue === null
                        ? 'var(--muted)'
                        : stat.trend === 'up'
                        ? '#10b981'
                        : stat.trend === 'down'
                        ? '#ef4444'
                        : 'var(--muted)';
                      const trendLabel = averageValue === null
                        ? 'No graded lessons yet'
                        : stat.trend === 'up'
                        ? 'Improving'
                        : stat.trend === 'down'
                        ? 'Declining'
                        : 'Stable';

                      return (
                        <div key={stat.subject} className="card" style={{ padding: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>{stat.subject}</div>
                              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                                {stat.completed} / {stat.total} lessons completed
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 24, fontWeight: 700, color: averageColor }}>
                                {averageValue !== null ? `${Math.round(averageValue)}%` : '--'}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: trendColor }}>
                                {averageValue !== null && stat.trend === 'up' ? <TrendingUp size={12} /> : null}
                                {averageValue !== null && stat.trend === 'down' ? <TrendingDown size={12} /> : null}
                                {trendLabel}
                              </div>
                            </div>
                          </div>
                          
                          {/* Progress bar */}
                          <div style={{ width: '100%', height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              width: `${averageValue ?? 0}%`,
                              height: '100%',
                              background: averageValue === null
                                ? 'var(--surface-3)'
                                : averageValue >= 75
                                ? 'linear-gradient(90deg, #10b981, #059669)'
                                : averageValue >= 50
                                ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                                : 'linear-gradient(90deg, #ef4444, #dc2626)',
                              transition: 'width 0.5s ease',
                            }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Recent Lessons */}
              <div className="section">
                <div className="sectionTitle">Recent Lessons</div>
                {recentLessons.length === 0 ? (
                  <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
                    <BookOpen size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    No lessons assigned yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {recentLessons.map((lesson) => {
                      const statusBadge = getLessonStatusBadge(lesson.status);
                      return (
                        <div key={lesson.id} className="card" style={{ padding: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>{lesson.title}</div>
                              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{lesson.subject}</div>
                            </div>
                            <span
                              style={{
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 600,
                                background: statusBadge.background,
                                color: statusBadge.color,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {statusBadge.label}
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: 12,
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 12,
                              fontSize: 12,
                              color: 'var(--muted)',
                            }}
                          >
                            {lesson.dueDate && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Calendar size={12} /> Due {new Date(lesson.dueDate).toLocaleDateString()}
                              </span>
                            )}
                            {lesson.score !== null && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Award size={12} /> {lesson.score}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Achievements */}
              <div className="section">
                <div className="sectionTitle">Recent Achievements</div>
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Award size={24} color="white" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>Perfect Attendance</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>No absences this month</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Target size={24} color="white" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>Top Performer</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Highest grade in Mathematics</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <BookOpen size={24} color="white" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>Early Submitter</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Submitted 5 assignments early</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </ParentShell>
  );
}
