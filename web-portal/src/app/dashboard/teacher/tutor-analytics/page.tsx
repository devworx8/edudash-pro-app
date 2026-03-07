'use client';

/**
 * Teacher Tutor Analytics Page (Web)
 *
 * Heatmap grid showing per-student, per-subject accuracy for a class.
 * Teachers pick a class and time range; click a cell for drilldown.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import {
  BarChart3,
  RefreshCw,
  ChevronDown,
  X,
  TrendingUp,
  Users,
  BookOpen,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassOption {
  id: string;
  name: string;
  grade_level?: string;
}

interface AnalyticsRow {
  student_id: string;
  student_name: string;
  subject: string;
  total_attempts: number;
  correct_count: number;
  accuracy_pct: number;
  avg_score: number;
  last_attempt_at: string;
  session_count: number;
  modes_used: string[];
}

interface SessionRow {
  session_id: string;
  mode: string;
  subject: string;
  grade: string;
  topic: string;
  total_questions: number;
  correct_answers: number;
  accuracy_pct: number;
  started_at: string;
  ended_at: string;
}

interface HeatmapCell {
  accuracy: number;
  attempts: number;
  sessions: number;
}

interface StudentRow {
  id: string;
  name: string;
  subjects: Record<string, HeatmapCell>;
  overall: number;
  totalAttempts: number;
}

const TIME_RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

// ─── Color helpers ───────────────────────────────────────────────────────────

function accuracyBg(pct: number): string {
  if (pct >= 80) return 'bg-green-100 text-green-700';
  if (pct >= 60) return 'bg-lime-100 text-lime-700';
  if (pct >= 40) return 'bg-yellow-100 text-yellow-700';
  if (pct >= 20) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function TutorAnalyticsPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string | undefined>();
  const { profile } = useUserProfile(userId);

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [sinceDays, setSinceDays] = useState(30);
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drilldown
  const [drillStudent, setDrillStudent] = useState<{ id: string; name: string } | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Resolve user id from auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      if (data?.user?.id) setUserId(data.user.id);
    });
  }, [supabase]);

  // Load classes
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: teacherRows } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', userId);
      const tIds = (teacherRows ?? []).map((t: any) => t.id);
      if (tIds.length === 0) tIds.push(userId);

      const { data: cls } = await supabase
        .from('classes')
        .select('id, name, grade_level')
        .in('teacher_id', tIds)
        .order('name');

      const items = (cls ?? []) as ClassOption[];
      setClasses(items);
      if (items.length > 0) setSelectedClass(items[0].id);
    })();
  }, [userId, supabase]);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      const { data, error: rpcErr } = await supabase.rpc('get_class_tutor_analytics', {
        p_class_id: selectedClass,
        p_since: since,
      });
      if (rpcErr) throw rpcErr;
      setRows((data as AnalyticsRow[]) ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load analytics');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, sinceDays, supabase]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // Build heatmap data
  const { students, subjects, classAccuracy } = useMemo(() => {
    const subjectSet = new Set<string>();
    const map = new Map<string, StudentRow>();

    for (const r of rows) {
      subjectSet.add(r.subject);
      let s = map.get(r.student_id);
      if (!s) {
        s = { id: r.student_id, name: r.student_name, subjects: {}, overall: 0, totalAttempts: 0 };
        map.set(r.student_id, s);
      }
      s.subjects[r.subject] = { accuracy: r.accuracy_pct, attempts: r.total_attempts, sessions: r.session_count };
      s.totalAttempts += r.total_attempts;
    }

    for (const s of map.values()) {
      const entries = Object.values(s.subjects);
      const totalCorrect = entries.reduce((sum, e) => sum + Math.round(e.accuracy * e.attempts / 100), 0);
      s.overall = s.totalAttempts > 0 ? Math.round(1000 * totalCorrect / s.totalAttempts) / 10 : 0;
    }

    const studentList = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    const totalAtt = rows.reduce((s, r) => s + r.total_attempts, 0);
    const totalCorrect = rows.reduce((s, r) => s + r.correct_count, 0);
    const avg = totalAtt > 0 ? Math.round(1000 * totalCorrect / totalAtt) / 10 : 0;

    return { students: studentList, subjects: Array.from(subjectSet).sort(), classAccuracy: avg };
  }, [rows]);

  // Drilldown
  const openDrilldown = useCallback(async (studentId: string, studentName: string) => {
    setDrillStudent({ id: studentId, name: studentName });
    setSessionsLoading(true);
    const { data } = await supabase.rpc('get_student_tutor_sessions', { p_student_id: studentId });
    setSessions((data as SessionRow[]) ?? []);
    setSessionsLoading(false);
  }, [supabase]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <TeacherShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tutor Analytics</h1>
            <p className="text-sm text-muted-foreground">
              See how students perform with Dash AI Tutor
            </p>
          </div>
          <button
            onClick={fetchAnalytics}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Class picker */}
          <div className="relative">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="appearance-none rounded-lg border bg-card px-4 py-2 pr-8 text-sm font-medium"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.grade_level ? `(${c.grade_level})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Time range */}
          <div className="flex gap-1 rounded-lg border p-1">
            {TIME_RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setSinceDays(r.days)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  r.days === sinceDays ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        {!loading && students.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard icon={Users} label="Students" value={String(students.length)} />
            <SummaryCard icon={BookOpen} label="Subjects" value={String(subjects.length)} />
            <SummaryCard icon={TrendingUp} label="Class Avg" value={`${classAccuracy}%`} accent />
          </div>
        )}

        {/* Heatmap */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 p-6 text-center text-sm text-red-600">{error}</div>
        ) : students.length === 0 ? (
          <div className="rounded-lg bg-muted/50 p-12 text-center">
            <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No tutor activity yet</p>
            <p className="text-sm text-muted-foreground">
              Students need to use Dash Tutor to generate analytics.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-left font-semibold">Student</th>
                  {subjects.map((s) => (
                    <th key={s} className="px-3 py-2 text-center font-semibold">
                      {s.length > 12 ? s.slice(0, 11) + '…' : s}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold">Avg</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => (
                  <tr key={st.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <button
                        className="text-left font-medium hover:underline"
                        onClick={() => openDrilldown(st.id, st.name)}
                      >
                        {st.name}
                      </button>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {st.totalAttempts} attempts
                      </span>
                    </td>
                    {subjects.map((subj) => {
                      const cell = st.subjects[subj];
                      if (!cell) {
                        return (
                          <td key={subj} className="px-3 py-2 text-center text-muted-foreground">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={subj} className="px-3 py-2 text-center">
                          <button
                            className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${accuracyBg(cell.accuracy)}`}
                            onClick={() => openDrilldown(st.id, st.name)}
                          >
                            {Math.round(cell.accuracy)}%
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${accuracyBg(st.overall)}`}>
                        {st.overall}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        {students.length > 0 && (
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            {[
              { label: '80%+', cls: 'bg-green-200' },
              { label: '60-79', cls: 'bg-lime-200' },
              { label: '40-59', cls: 'bg-yellow-200' },
              { label: '20-39', cls: 'bg-orange-200' },
              { label: '<20%', cls: 'bg-red-200' },
            ].map((b) => (
              <span key={b.label} className="flex items-center gap-1">
                <span className={`inline-block h-3 w-3 rounded ${b.cls}`} />
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Drilldown modal */}
      {drillStudent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-lg rounded-t-xl bg-card p-6 shadow-xl sm:rounded-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{drillStudent.name} — Sessions</h2>
              <button onClick={() => setDrillStudent(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {sessionsLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sessions found.</p>
            ) : (
              <div className="max-h-80 space-y-3 overflow-y-auto">
                {sessions.map((s) => (
                  <div
                    key={s.session_id}
                    className={`rounded-lg border-l-4 pl-3 py-2 ${
                      s.accuracy_pct >= 80 ? 'border-green-500' :
                      s.accuracy_pct >= 50 ? 'border-yellow-500' : 'border-red-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.subject || 'General'} — {s.topic || s.mode}</span>
                      <span className={`text-sm font-bold ${
                        s.accuracy_pct >= 80 ? 'text-green-600' :
                        s.accuracy_pct >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {s.accuracy_pct}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.correct_answers}/{s.total_questions} correct · {s.mode} ·{' '}
                      {new Date(s.started_at).toLocaleDateString('en-ZA', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </TeacherShell>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}
