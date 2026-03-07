'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import {
  BarChart3, ChevronLeft, ChevronRight, Calendar,
  TrendingUp, BookOpen, Star, Eye, Users,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';

interface WeeklyReport {
  id: string;
  student_id: string;
  week_start: string;
  highlights: string[];
  focus_areas: string[];
  attendance_summary: { present: number; absent: number; late: number };
  homework_completion: number;
  teacher_notes: string;
  home_activities: string[];
  mood_summary: string;
  progress_metrics: {
    social_skills: number;
    academic_progress: number;
    participation: number;
    behavior: number;
  };
  activity_breakdown: { name: string; duration_minutes: number }[];
  viewed_at: string | null;
  created_at: string;
}

interface Child {
  id: string;
  first_name: string;
  last_name: string;
}

export default function WeeklyReportPage() {
  const router = useRouter();
  const supabase = createClient();

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const currentWeekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return weekOffset === 0 ? base : weekOffset > 0 ? addWeeks(base, weekOffset) : subWeeks(base, Math.abs(weekOffset));
  }, [weekOffset]);

  const weekLabel = useMemo(() => {
    const start = currentWeekStart;
    const end = endOfWeek(start, { weekStartsOn: 1 });
    return `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`;
  }, [currentWeekStart]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/sign-in'); return; }

      // Check both parent_id and guardian_id
      const { data: childrenData } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .or(`parent_id.eq.${user.id},guardian_id.eq.${user.id}`);

      if (childrenData && childrenData.length > 0) {
        setChildren(childrenData);
        setSelectedChildId(childrenData[0].id);
      }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedChildId) return;
    fetchReport();
  }, [selectedChildId, currentWeekStart]);

  const fetchReport = async () => {
    setLoading(true);
    const weekStr = format(currentWeekStart, 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('weekly_learning_reports')
      .select('*')
      .eq('student_id', selectedChildId)
      .eq('week_start', weekStr)
      .maybeSingle();

    if (!error && data) {
      setReport(data as WeeklyReport);
      // Mark as viewed
      if (!data.viewed_at) {
        await supabase
          .from('weekly_learning_reports')
          .update({ viewed_at: new Date().toISOString() })
          .eq('id', data.id);
      }
    } else {
      setReport(null);
    }
    setLoading(false);
  };

  const MetricBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--muted)' }}>{value}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: color, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
    </div>
  );

  return (
    <ParentShell hideHeader={true}>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title="Weekly Learning Report"
          subtitle="AI-generated insights into your child's learning week"
          icon={<BarChart3 size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20, maxWidth: 800, margin: '0 auto' }}>
          {/* Child selector */}
          {children.length > 1 && (
            <div style={{ marginBottom: 20 }}>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                style={{
                  padding: '10px 16px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 14, fontWeight: 600, width: '100%', cursor: 'pointer',
                }}
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Week navigator */}
          <div className="card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', marginBottom: 20,
          }}>
            <button onClick={() => setWeekOffset((w) => w - 1)} className="iconBtn" aria-label="Previous week">
              <ChevronLeft className="icon20" />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15 }}>
              <Calendar className="icon16" style={{ color: 'var(--primary)' }} />
              {weekLabel}
            </div>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              disabled={weekOffset >= 0}
              className="iconBtn"
              aria-label="Next week"
              style={{ opacity: weekOffset >= 0 ? 0.3 : 1 }}
            >
              <ChevronRight className="icon20" />
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
              <p style={{ color: 'var(--muted)', marginTop: 16 }}>Loading report...</p>
            </div>
          ) : !report ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <BarChart3 size={48} style={{ margin: '0 auto', color: 'var(--muted)', opacity: 0.4 }} />
              <h3 style={{ marginTop: 16 }}>No Report Available</h3>
              <p style={{ color: 'var(--muted)', margin: '8px 0 0 0' }}>
                No weekly report has been generated for this week yet.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Highlights */}
              {report.highlights?.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
                    <Star size={18} style={{ color: '#f59e0b' }} /> Weekly Highlights
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                    {report.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                </div>
              )}

              {/* Attendance & Homework Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {report.attendance_summary && (
                  <div className="card" style={{ padding: 20 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>📅 Attendance</h4>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.1)' }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{report.attendance_summary.present}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Present</div>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)' }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{report.attendance_summary.absent}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Absent</div>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.1)' }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{report.attendance_summary.late}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Late</div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="card" style={{ padding: 20 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>📝 Homework Completion</h4>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 40, fontWeight: 700, color: report.homework_completion >= 75 ? '#10b981' : report.homework_completion >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {report.homework_completion}%
                    </div>
                    <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, marginTop: 12, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${report.homework_completion}%`, background: report.homework_completion >= 75 ? '#10b981' : '#f59e0b', borderRadius: 4 }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Metrics */}
              {report.progress_metrics && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
                    <TrendingUp size={18} style={{ color: '#7c3aed' }} /> Progress Metrics
                  </h3>
                  <MetricBar label="Social Skills" value={report.progress_metrics.social_skills} color="#3b82f6" />
                  <MetricBar label="Academic Progress" value={report.progress_metrics.academic_progress} color="#10b981" />
                  <MetricBar label="Participation" value={report.progress_metrics.participation} color="#f59e0b" />
                  <MetricBar label="Behavior" value={report.progress_metrics.behavior} color="#8b5cf6" />
                </div>
              )}

              {/* Mood & Teacher Notes */}
              {(report.mood_summary || report.teacher_notes) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
                  {report.mood_summary && (
                    <div className="card" style={{ padding: 20 }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>😊 Mood Summary</h4>
                      <p style={{ color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>{report.mood_summary}</p>
                    </div>
                  )}
                  {report.teacher_notes && (
                    <div className="card" style={{ padding: 20 }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>👩‍🏫 Teacher Notes</h4>
                      <p style={{ color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>{report.teacher_notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Focus Areas */}
              {report.focus_areas?.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>🎯 Focus Areas</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {report.focus_areas.map((area, i) => (
                      <span key={i} style={{
                        padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                        background: 'rgba(124,58,237,0.1)', color: '#7c3aed',
                      }}>
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Home Activities */}
              {report.home_activities?.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>🏠 Suggested Home Activities</h3>
                  <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                    {report.home_activities.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              {/* Activity Breakdown */}
              {report.activity_breakdown?.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>📊 Activity Breakdown</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {report.activity_breakdown.map((act, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{act.name}</span>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{act.duration_minutes} min</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ParentShell>
  );
}
