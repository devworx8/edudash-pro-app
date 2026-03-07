'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { useLessonAssignment } from '@/hooks/useLessonAssignment';
import { Calendar, Users, AlertCircle, CheckCircle, Link2 } from 'lucide-react';

type RoutineBlockOption = {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
};

type LessonRecord = {
  id: string;
  title: string;
  description?: string | null;
  subject?: string | null;
  duration_minutes?: number | null;
  age_group?: string | null;
};

type ClassRecord = {
  id: string;
  name: string;
  grade_level?: string | null;
};

type StudentRecord = {
  id: string;
  first_name: string;
  last_name: string;
  class_id?: string | null;
  classes?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function toDateOnly(value: Date): string {
  return value.toISOString().split('T')[0];
}

function getDayOfWeekMondayFirst(value: Date): number {
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

function normalizeTime(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getProgramStatusScore(status: unknown): number {
  const s = String(status ?? '').toLowerCase();
  if (s === 'published') return 50;
  if (s === 'approved') return 40;
  if (s === 'submitted') return 30;
  if (s === 'draft') return 20;
  return 10;
}

export default function AssignLessonPage() {
  const router = useRouter();
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId;
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [lesson, setLesson] = useState<LessonRecord | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<'class' | 'student'>('class');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState<string>(() => toDateOnly(new Date()));
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [notes, setNotes] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [routineBlocks, setRoutineBlocks] = useState<RoutineBlockOption[]>([]);
  const [routineBlocksLoading, setRoutineBlocksLoading] = useState(false);
  const [routineBlocksError, setRoutineBlocksError] = useState<string | null>(null);
  const [selectedRoutineBlockId, setSelectedRoutineBlockId] = useState<string>('');
  const [routineLinkStatus, setRoutineLinkStatus] = useState<string | null>(null);

  const { profile, loading: profileLoading } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const { assignLesson, assignLessonToClass, isAssigning } = useLessonAssignment({
    organizationId: profile?.preschoolId,
    userId,
  });

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
    if (!lessonId || !userId) return;
    
    const loadLesson = async () => {
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .single();
      
      if (error) {
        console.error('Error loading lesson:', error);
        setError('Failed to load lesson');
        return;
      }
      
      setLesson(data);
    };
    
    loadLesson();
  }, [lessonId, userId, supabase]);

  useEffect(() => {
    if (!userId || !profile?.preschoolId) return;
    
    const loadClasses = async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade_level')
        .eq('preschool_id', profile.preschoolId)
        .order('name');
      
      if (!error && data) {
        setClasses(data);
      }
    };
    
    const loadStudents = async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, class_id, classes!students_class_id_fkey(name)')
        .eq('preschool_id', profile.preschoolId)
        .eq('is_active', true)
        .order('first_name');
      
      if (!error && data) {
        setStudents(data);
      }
    };
    
    loadClasses();
    loadStudents();
  }, [userId, profile?.preschoolId, supabase]);

  useEffect(() => {
    if (selectedTarget !== 'class') return;
    if (selectedClassId || classes.length !== 1) return;
    setSelectedClassId(classes[0].id);
  }, [selectedTarget, selectedClassId, classes]);

  useEffect(() => {
    if (!userId || !profile?.preschoolId || selectedTarget !== 'class') {
      setRoutineBlocks([]);
      setRoutineBlocksError(null);
      return;
    }

    const resolvedClassId = selectedClassId || (classes.length === 1 ? classes[0]?.id : '');
    if (!resolvedClassId) {
      setRoutineBlocks([]);
      setRoutineBlocksError(null);
      return;
    }

    let cancelled = false;

    const loadRoutineBlocks = async () => {
      setRoutineBlocksLoading(true);
      setRoutineBlocksError(null);

      try {
        const now = new Date();
        const today = toDateOnly(now);
        const dayOfWeek = getDayOfWeekMondayFirst(now);

        const { data: programRows, error: programError } = await supabase
          .from('weekly_programs')
          .select('id, class_id, title, status, published_at, updated_at, created_at, week_start_date, week_end_date')
          .eq('preschool_id', profile.preschoolId)
          .lte('week_start_date', today)
          .gte('week_end_date', today)
          .or(`class_id.eq.${resolvedClassId},class_id.is.null`)
          .order('published_at', { ascending: false })
          .order('updated_at', { ascending: false });

        if (programError) {
          throw new Error(programError.message || 'Failed to load today routine');
        }

        const candidates = (programRows || []).filter((row: Record<string, unknown>) => {
          const inWeek =
            !!row.week_start_date &&
            !!row.week_end_date &&
            String(row.week_start_date) <= today &&
            String(row.week_end_date) >= today;
          return inWeek;
        });

        candidates.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const aClass = a.class_id ? 5 : 0;
          const bClass = b.class_id ? 5 : 0;
          const aScore = getProgramStatusScore(a.status) + aClass;
          const bScore = getProgramStatusScore(b.status) + bClass;
          if (aScore !== bScore) return bScore - aScore;
          const aT = new Date(String(a.updated_at || a.created_at || 0)).getTime();
          const bT = new Date(String(b.updated_at || b.created_at || 0)).getTime();
          return bT - aT;
        });

        const selectedProgram = candidates[0] as Record<string, unknown> | undefined;
        if (!selectedProgram?.id) {
          if (!cancelled) {
            setRoutineBlocks([]);
            setSelectedRoutineBlockId('');
          }
          return;
        }

        const { data: blockRows, error: blockError } = await supabase
          .from('daily_program_blocks')
          .select('id, title, start_time, end_time, block_order')
          .eq('weekly_program_id', String(selectedProgram.id))
          .eq('day_of_week', dayOfWeek)
          .order('block_order', { ascending: true });

        if (blockError) {
          throw new Error(blockError.message || 'Failed to load routine blocks');
        }

        const options: RoutineBlockOption[] = (blockRows || []).map((row: Record<string, unknown>) => ({
          id: String(row.id || ''),
          title: String(row.title || 'Routine block'),
          startTime: normalizeTime(row.start_time),
          endTime: normalizeTime(row.end_time),
        }));

        if (!cancelled) {
          setRoutineBlocks(options);
          setSelectedRoutineBlockId((currentId) =>
            currentId && options.some((option) => option.id === currentId) ? currentId : ''
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setRoutineBlocks([]);
          setSelectedRoutineBlockId('');
          setRoutineBlocksError(
            loadError instanceof Error ? loadError.message : 'Failed to load routine blocks'
          );
        }
      } finally {
        if (!cancelled) {
          setRoutineBlocksLoading(false);
        }
      }
    };

    void loadRoutineBlocks();

    return () => {
      cancelled = true;
    };
  }, [userId, profile?.preschoolId, selectedTarget, selectedClassId, classes, supabase]);

  const handleAssign = async () => {
    if (!lessonId) {
      setError('Lesson ID is required');
      return;
    }

    setAssigning(true);
    setError(null);
    setSuccess(false);
    setRoutineLinkStatus(null);

    try {
      if (selectedTarget === 'class') {
        if (!selectedClassId) {
          setError('Please select a class');
          setAssigning(false);
          return;
        }
        
        const success = await assignLessonToClass(lessonId, selectedClassId, {
          due_date: dueDate || undefined,
          priority,
          notes: notes || undefined,
        });
        
        if (success) {
          if (selectedRoutineBlockId) {
            const linkResponse = await fetch('/api/display/routine-link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                routineBlockId: selectedRoutineBlockId,
                lessonId,
                classId: selectedClassId || null,
              }),
            });

            if (!linkResponse.ok) {
              const payload = await linkResponse.json().catch(() => ({}));
              setRoutineLinkStatus(
                payload?.error
                  ? `Lesson assigned, but routine link failed: ${payload.error}`
                  : 'Lesson assigned, but routine link failed.'
              );
            } else {
              setRoutineLinkStatus("Lesson assigned and linked to today's routine block for Room Display.");
            }
          }

          setSuccess(true);
          setTimeout(() => {
            router.push('/dashboard/teacher/lessons');
          }, 2200);
        } else {
          setError('Failed to assign lesson');
        }
      } else {
        if (selectedStudentIds.size === 0) {
          setError('Please select at least one student');
          setAssigning(false);
          return;
        }
        
        const assignments = Array.from(selectedStudentIds).map(studentId => 
          assignLesson({
            lesson_id: lessonId,
            student_id: studentId,
            due_date: dueDate || undefined,
            priority,
            notes: notes || undefined,
          })
        );
        
        const results = await Promise.all(assignments);
        const allSuccess = results.every((r: boolean) => r === true);
        
        if (allSuccess) {
          setSuccess(true);
          setRoutineLinkStatus(null);
          setTimeout(() => {
            router.push('/dashboard/teacher/lessons');
          }, 2000);
        } else {
          setError('Failed to assign lesson to some students');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign lesson';
      setError(message);
    } finally {
      setAssigning(false);
    }
  };

  const toggleStudent = (studentId: string) => {
    const newSet = new Set(selectedStudentIds);
    if (newSet.has(studentId)) {
      newSet.delete(studentId);
    } else {
      newSet.add(studentId);
    }
    setSelectedStudentIds(newSet);
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  // Calculate default due date (7 days from now)
  const defaultDueDate = dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <TeacherShell 
      tenantSlug={tenantSlug} 
      userEmail={profile?.email}
      userName={profile?.firstName}
      preschoolName={profile?.preschoolName}
    >
      <div className="container">
        <div className="section">
          <h1 className="h1">Assign Lesson</h1>
          {lesson && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>{lesson.title}</h3>
              {lesson.description && (
                <p style={{ color: 'var(--muted)', marginBottom: 8 }}>{lesson.description}</p>
              )}
              <div style={{ display: 'flex', gap: 16, fontSize: 14, color: 'var(--muted)' }}>
                <span>Subject: {lesson.subject}</span>
                <span>Duration: {lesson.duration_minutes} min</span>
                <span>Ages: {lesson.age_group}</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="section">
            <div className="card" style={{ borderLeft: '4px solid #ef4444', background: '#fee2e2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="section">
            <div className="card" style={{ borderLeft: '4px solid #10b981', background: '#d1fae5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p style={{ color: '#059669', margin: 0 }}>Lesson assigned successfully! Redirecting...</p>
              </div>
            </div>
          </div>
        )}

        {routineLinkStatus && (
          <div className="section">
            <div
              className="card"
              style={{
                borderLeft: routineLinkStatus.includes('failed') ? '4px solid #f59e0b' : '4px solid #7c3aed',
                background: routineLinkStatus.includes('failed') ? '#fef3c7' : '#ede9fe',
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: routineLinkStatus.includes('failed') ? '#92400e' : '#5b21b6',
                  fontWeight: 600,
                }}
              >
                {routineLinkStatus}
              </p>
            </div>
          </div>
        )}

        <div className="section">
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Assignment Details</h3>

            {/* Target Selection */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Assign To</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className={`btn ${selectedTarget === 'class' ? 'btnPrimary' : ''}`}
                  onClick={() => setSelectedTarget('class')}
                  style={{ flex: 1 }}
                >
                  <Users className="icon16" />
                  Entire Class
                </button>
                <button
                  className={`btn ${selectedTarget === 'student' ? 'btnPrimary' : ''}`}
                  onClick={() => setSelectedTarget('student')}
                  style={{ flex: 1 }}
                >
                  <Users className="icon16" />
                  Individual Students
                </button>
              </div>
            </div>

            {/* Class Selection */}
            {selectedTarget === 'class' && (
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Select Class</label>
                <select
                  className="input"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">Choose a class...</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} (Grade {cls.grade_level})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedTarget === 'class' && (
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
                  <Link2 className="icon16" />
                  Link to today&apos;s routine block (optional)
                </label>
                <select
                  className="input"
                  value={selectedRoutineBlockId}
                  onChange={(e) => setSelectedRoutineBlockId(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={routineBlocksLoading || !selectedClassId}
                >
                  <option value="">Do not link now</option>
                  {routineBlocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {(block.startTime && block.endTime ? `${block.startTime}-${block.endTime} ` : '') + block.title}
                    </option>
                  ))}
                </select>
                <p style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
                  When selected, this lesson appears inside that routine block on the Room Display.
                </p>
                {routineBlocksLoading && (
                  <p style={{ marginTop: 6, color: 'var(--muted)', fontSize: 13 }}>Loading today&apos;s routine blocks...</p>
                )}
                {!routineBlocksLoading && selectedClassId && routineBlocks.length === 0 && !routineBlocksError && (
                  <p style={{ marginTop: 6, color: 'var(--muted)', fontSize: 13 }}>
                    No routine blocks found for today in this class yet.
                  </p>
                )}
                {routineBlocksError && (
                  <p style={{ marginTop: 6, color: '#f59e0b', fontSize: 13 }}>{routineBlocksError}</p>
                )}
              </div>
            )}

            {/* Student Selection */}
            {selectedTarget === 'student' && (
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                  Select Students ({selectedStudentIds.size} selected)
                </label>
                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                  {students.map((student) => {
                    const className = Array.isArray(student.classes)
                      ? student.classes[0]?.name
                      : student.classes?.name;
                    return (
                      <label
                        key={student.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: 8,
                          cursor: 'pointer',
                          borderRadius: 4,
                          background: selectedStudentIds.has(student.id) ? 'var(--primary)' + '20' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(student.id)}
                          onChange={() => toggleStudent(student.id)}
                        />
                        <span>
                          {student.first_name} {student.last_name}
                          {className ? ` - ${className}` : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Due Date */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
                <Calendar className="icon16" />
                Due Date
              </label>
              <input
                type="date"
                className="input"
                value={defaultDueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                style={{ width: '100%' }}
              />
            </div>

            {/* Priority */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Priority</label>
              <select
                className="input"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')
                }
                style={{ width: '100%' }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Notes (Optional)</label>
              <textarea
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional instructions or notes..."
                rows={4}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btnPrimary"
                onClick={handleAssign}
                disabled={assigning || isAssigning}
                style={{ flex: 1 }}
              >
                {assigning || isAssigning ? 'Assigning...' : 'Assign Lesson'}
              </button>
              <button
                className="btn"
                onClick={() => router.back()}
                disabled={assigning || isAssigning}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
