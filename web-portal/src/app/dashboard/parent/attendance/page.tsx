'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { Calendar, CheckCircle2, AlertCircle, Users } from 'lucide-react';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface AttendanceRecord {
  id: string;
  attendance_date: string;
  status: AttendanceStatus | null;
  notes?: string | null;
}

const COPY = {
  title: 'Attendance',
  subtitle: 'View attendance history',
  stats: {
    attendanceRate: 'Attendance Rate',
    present: 'Present',
    absent: 'Absent',
  },
  filters: {
    all: 'All',
    present: 'Present',
    late: 'Late',
    excused: 'Excused',
    absent: 'Absent',
  },
  emptyState: {
    title: 'No Attendance Records',
    description: 'Attendance entries will appear once the school marks attendance.',
  },
} as const;

const FILTER_LABELS: Record<'all' | AttendanceStatus, string> = {
  all: COPY.filters.all,
  present: COPY.filters.present,
  late: COPY.filters.late,
  excused: COPY.filters.excused,
  absent: COPY.filters.absent,
};

export default function ParentAttendancePage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AttendanceStatus>('all');

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
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setLoading(false);
    })();
  }, [router, supabase]);

  useEffect(() => {
    if (!activeChildId || !userId) return;

    const loadAttendance = async () => {
      setError(null);
      try {
        let attendanceQuery = supabase
          .from('attendance')
          .select('id, attendance_date, status, notes')
          .eq('student_id', activeChildId)
          .order('attendance_date', { ascending: false })
          .limit(120);

        if (profile?.organizationId) {
          attendanceQuery = attendanceQuery.eq('organization_id', profile.organizationId);
        }

        const { data, error: attendanceError } = await attendanceQuery;

        if (attendanceError) {
          const message = attendanceError.message || '';
          if (attendanceError.code === '42P01' || message.includes('does not exist')) {
            setRecords([]);
            return;
          }
          throw attendanceError;
        }

        setRecords((data || []) as AttendanceRecord[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load attendance');
      }
    };

    loadAttendance();
  }, [activeChildId, supabase, userId]);

  const filteredRecords = useMemo(() => {
    if (filter === 'all') return records;
    return records.filter((record) => record.status === filter);
  }, [filter, records]);

  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === 'present').length;
    const absent = total - present;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, rate };
  }, [records]);

  if (loading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

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
          title={COPY.title}
          subtitle={COPY.subtitle}
          icon={<Calendar size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20 }}>
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
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {child.firstName} {child.lastName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          {hasOrganization && (
            <div className="section">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                  <CheckCircle2 size={24} color="var(--success)" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.rate}%</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{COPY.stats.attendanceRate}</div>
                </div>
                <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                  <Users size={24} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.present}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{COPY.stats.present}</div>
                </div>
                <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                  <AlertCircle size={24} color="var(--danger)" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)' }}>{stats.absent}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{COPY.stats.absent}</div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="section">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['all', 'present', 'late', 'excused', 'absent'] as const).map((key) => (
                <button
                  key={key}
                  className="chip"
                  onClick={() => setFilter(key)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: filter === key ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: filter === key ? 'var(--primary-subtle)' : 'var(--surface-1)',
                    color: filter === key ? 'var(--primary)' : 'var(--text)',
                    fontWeight: filter === key ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {FILTER_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          {/* Attendance List */}
          <div className="section">
            {error && (
              <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                <AlertCircle size={36} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--danger)' }}>{error}</p>
              </div>
            )}

            {!error && filteredRecords.length === 0 && (
              <div className="card" style={{ padding: 48, textAlign: 'center' }}>
                <Calendar size={48} color="var(--muted)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{COPY.emptyState.title}</h3>
                <p style={{ color: 'var(--muted)' }}>{COPY.emptyState.description}</p>
              </div>
            )}

            {filteredRecords.map((record) => {
              const status = record.status || 'absent';
              const tone =
                status === 'present'
                  ? { color: '#16a34a', bg: 'rgba(34,197,94,0.1)' }
                  : status === 'late'
                  ? { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
                  : status === 'excused'
                  ? { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' }
                  : { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };

              return (
                <div key={record.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {new Date(record.attendance_date).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      {record.notes && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{record.notes}</div>
                      )}
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: tone.bg,
                        color: tone.color,
                        height: 'fit-content',
                      }}
                    >
                      {FILTER_LABELS[status]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ParentShell>
  );
}
