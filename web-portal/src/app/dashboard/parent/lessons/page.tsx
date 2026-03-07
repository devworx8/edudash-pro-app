'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { CollapsibleSection } from '@/components/dashboard/parent/CollapsibleSection';
import { BookOpen, Clock, CheckCircle, AlertCircle, Play } from 'lucide-react';

interface AssignedLesson {
  id: string;
  lesson_id: string | null;
  interactive_activity_id: string | null;
  student_id: string;
  due_date: string | null;
  status: 'assigned' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  lesson_type: 'standard' | 'interactive' | 'ai_enhanced' | 'robotics' | 'computer_literacy';
  stem_category: 'ai' | 'robotics' | 'computer_literacy' | 'none';
  lesson?: {
    id: string;
    title: string;
    description: string | null;
    duration_minutes: number;
  };
  interactive_activity?: {
    id: string;
    title: string;
    description: string | null;
    activity_type: string;
  };
  completion?: {
    id: string;
    score: number | null;
    completed_at: string;
  };
}

export default function AssignedLessonsPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    userId,
    profile,
    userName,
    preschoolName,
    tenantSlug,
    childrenCards,
    activeChildId,
    setActiveChildId,
    unreadCount,
    hasOrganization,
    loading,
  } = useParentDashboardData();

  const [assignedLessons, setAssignedLessons] = useState<AssignedLesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>('lessons');

  useEffect(() => {
    if (!userId || !activeChildId || !hasOrganization) {
      setLessonsLoading(false);
      return;
    }

    const loadAssignedLessons = async () => {
      setLessonsLoading(true);
      try {
        const { data, error } = await supabase
          .from('lesson_assignments')
          .select(`
            id,
            lesson_id,
            interactive_activity_id,
            student_id,
            due_date,
            status,
            priority,
            lesson_type,
            stem_category,
            lesson:lessons(id, title, description, duration_minutes),
            interactive_activity:interactive_activities(id, title, description, activity_type),
            completion:lesson_completions(id, score, completed_at)
          `)
          .eq('student_id', activeChildId)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('assigned_at', { ascending: false });

        if (error) throw error;

        setAssignedLessons((data || []) as AssignedLesson[]);
      } catch (error) {
        console.error('Error loading assigned lessons:', error);
      } finally {
        setLessonsLoading(false);
      }
    };

    loadAssignedLessons();
  }, [userId, activeChildId, hasOrganization, supabase]);

  const getStatusBadge = (status: string, dueDate: string | null) => {
    const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== 'completed';
    
    if (status === 'completed') {
      return (
        <span style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: 4, 
          padding: '4px 8px', 
          borderRadius: 12, 
          background: '#d1fae5', 
          color: '#059669',
          fontSize: 12,
          fontWeight: 600
        }}>
          <CheckCircle className="w-3 h-3" />
          Completed
        </span>
      );
    }
    
    if (isOverdue) {
      return (
        <span style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: 4, 
          padding: '4px 8px', 
          borderRadius: 12, 
          background: '#fee2e2', 
          color: '#dc2626',
          fontSize: 12,
          fontWeight: 600
        }}>
          <AlertCircle className="w-3 h-3" />
          Overdue
        </span>
      );
    }
    
    if (status === 'in_progress') {
      return (
        <span style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: 4, 
          padding: '4px 8px', 
          borderRadius: 12, 
          background: '#dbeafe', 
          color: '#2563eb',
          fontSize: 12,
          fontWeight: 600
        }}>
          <Play className="w-3 h-3" />
          In Progress
        </span>
      );
    }
    
    return (
      <span style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: 4, 
        padding: '4px 8px', 
        borderRadius: 12, 
        background: '#f3f4f6', 
        color: '#6b7280',
        fontSize: 12,
        fontWeight: 600
      }}>
        <Clock className="w-3 h-3" />
        Assigned
      </span>
    );
  };

  const getStemBadge = (category: string) => {
    const badges: Record<string, { label: string; color: string; bg: string }> = {
      ai: { label: 'AI', color: '#8b5cf6', bg: '#f3e8ff' },
      robotics: { label: 'Robotics', color: '#f59e0b', bg: '#fef3c7' },
      computer_literacy: { label: 'Computer Literacy', color: '#06b6d4', bg: '#cffafe' },
    };
    
    const badge = badges[category];
    if (!badge) return null;
    
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: 8,
        background: badge.bg,
        color: badge.color,
        fontSize: 11,
        fontWeight: 600
      }}>
        {badge.label}
      </span>
    );
  };

  const handleStartLesson = async (assignment: AssignedLesson) => {
    if (assignment.interactive_activity_id) {
      // Navigate to interactive lesson player
      router.push(`/dashboard/parent/lessons/${assignment.id}/play?activityId=${assignment.interactive_activity_id}&studentId=${activeChildId}`);
    } else if (assignment.lesson_id) {
      // Navigate to lesson view
      router.push(`/dashboard/parent/lessons/${assignment.id}/view?lessonId=${assignment.lesson_id}`);
    }
  };

  if (loading || lessonsLoading) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!hasOrganization) {
    return (
      <ParentShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={userName}
        preschoolName={preschoolName}
        unreadCount={unreadCount}
        hasOrganization={hasOrganization}
      >
        <div className="container">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <h2>Assigned Lessons</h2>
            <p style={{ color: 'var(--muted)', marginTop: 8 }}>
              This feature is only available for parents linked to a school.
            </p>
          </div>
        </div>
      </ParentShell>
    );
  }

  const activeChild = childrenCards.find(c => c.id === activeChildId);
  const pendingLessons = assignedLessons.filter(l => l.status !== 'completed');
  const completedLessons = assignedLessons.filter(l => l.status === 'completed');

  return (
    <ParentShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={userName}
      preschoolName={preschoolName}
      unreadCount={unreadCount}
      hasOrganization={hasOrganization}
    >
      <div className="container">
        <h1 className="h1">Assigned Lessons</h1>
        
        {childrenCards.length > 1 && (
          <div className="section">
            <div className="card">
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Select Child</label>
              <select
                className="input"
                value={activeChildId || ''}
                onChange={(e) => setActiveChildId(e.target.value)}
                style={{ width: '100%' }}
              >
                {childrenCards.map(child => (
                  <option key={child.id} value={child.id}>
                    {child.firstName} {child.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Pending Lessons */}
        <CollapsibleSection
          title={`Pending Lessons (${pendingLessons.length})`}
          icon={Clock}
          isOpen={openSection === 'lessons'}
          onToggle={() => setOpenSection(openSection === 'lessons' ? null : 'lessons')}
        >
          {pendingLessons.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p style={{ color: 'var(--muted)' }}>No pending lessons assigned</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingLessons.map(assignment => {
                const lesson = assignment.lesson || assignment.interactive_activity;
                const dueDate = assignment.due_date 
                  ? new Date(assignment.due_date).toLocaleDateString('en-ZA', { 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : null;

                return (
                  <div key={assignment.id} className="card card-interactive">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                            {lesson?.title || 'Untitled Lesson'}
                          </h3>
                          {getStemBadge(assignment.stem_category)}
                        </div>
                        {lesson?.description && (
                          <p style={{ color: 'var(--muted)', marginBottom: 8, fontSize: 14 }}>
                            {lesson.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)' }}>
                          {assignment.lesson_type === 'interactive' && (
                            <span>🎮 Interactive Activity</span>
                          )}
                          {assignment.lesson && (
                            <span>⏱️ {assignment.lesson.duration_minutes} min</span>
                          )}
                          {dueDate && (
                            <span>📅 Due: {dueDate}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        {getStatusBadge(assignment.status, assignment.due_date)}
                      </div>
                    </div>
                    <button
                      className="btn btnPrimary"
                      onClick={() => handleStartLesson(assignment)}
                      style={{ width: '100%' }}
                    >
                      <Play className="icon16" />
                      {assignment.status === 'in_progress' ? 'Continue Lesson' : 'Start Lesson'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Completed Lessons */}
        {completedLessons.length > 0 && (
          <CollapsibleSection
            title={`Completed Lessons (${completedLessons.length})`}
            icon={CheckCircle}
            isOpen={openSection === 'completed'}
            onToggle={() => setOpenSection(openSection === 'completed' ? null : 'completed')}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {completedLessons.map(assignment => {
                const lesson = assignment.lesson || assignment.interactive_activity;
                const score = assignment.completion?.score;

                return (
                  <div key={assignment.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                            {lesson?.title || 'Untitled Lesson'}
                          </h3>
                          {getStemBadge(assignment.stem_category)}
                        </div>
                        {assignment.completion?.completed_at && (
                          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                            Completed on {new Date(assignment.completion.completed_at).toLocaleDateString('en-ZA')}
                            {score !== null && ` • Score: ${score}%`}
                          </p>
                        )}
                      </div>
                      {getStatusBadge(assignment.status, assignment.due_date)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </ParentShell>
  );
}
