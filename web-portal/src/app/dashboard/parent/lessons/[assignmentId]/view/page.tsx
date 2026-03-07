'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { 
  BookOpen, Clock, Target, Lightbulb, CheckCircle, 
  ArrowLeft, Play, FileText, Star, Users, Layers
} from 'lucide-react';

interface LessonContent {
  overview?: string;
  lesson_flow?: Array<{
    phase: string;
    duration: string;
    title: string;
    instructions?: string;
    teacher_script?: string;
    activities?: any[];
  }>;
  interactive_activities?: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  differentiation?: {
    support?: string;
    extension?: string;
  } | string;
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  age_group: string;
  duration_minutes: number;
  objectives: string[] | null;
  materials_needed: string | string[] | null;
  content: string | LessonContent | null;
  is_ai_generated: boolean;
}

function ParentLessonViewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonId = searchParams.get('lessonId');
  const studentId = searchParams.get('studentId');
  const supabase = createClient();
  
  const {
    userId,
    profile,
    userName,
    preschoolName,
    tenantSlug,
    unreadCount,
    hasOrganization,
  } = useParentDashboardData();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lessonId) {
      setError('Lesson ID is required');
      setLoading(false);
      return;
    }

    const loadLesson = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('lessons')
          .select('*')
          .eq('id', lessonId)
          .single();

        if (fetchError) throw fetchError;
        setLesson(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load lesson');
      } finally {
        setLoading(false);
      }
    };

    loadLesson();
  }, [lessonId, supabase]);

  // Parse content if it's a JSON string
  const parseContent = (content: any): LessonContent | null => {
    if (!content) return null;
    if (typeof content === 'object') return content;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  };

  // Parse materials_needed
  const parseMaterials = (materials: any): string[] => {
    if (!materials) return [];
    if (Array.isArray(materials)) return materials;
    try {
      const parsed = JSON.parse(materials);
      return Array.isArray(parsed) ? parsed : [materials];
    } catch {
      return [materials];
    }
  };

  if (loading) {
    return (
      <ParentShell
        tenantSlug={tenantSlug}
        userEmail={profile?.email}
        userName={userName}
        preschoolName={preschoolName}
        unreadCount={unreadCount}
        hasOrganization={hasOrganization}
      >
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="spinner" />
        </div>
      </ParentShell>
    );
  }

  if (error || !lesson) {
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
          <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
            <h3>Error</h3>
            <p>{error || 'Lesson not found'}</p>
            <button className="btn btnPrimary" onClick={() => router.back()}>
              Go Back
            </button>
          </div>
        </div>
      </ParentShell>
    );
  }

  const parsedContent = parseContent(lesson.content);
  const materials = parseMaterials(lesson.materials_needed);
  const objectives = lesson.objectives || [];

  return (
    <ParentShell
      tenantSlug={tenantSlug}
      userEmail={profile?.email}
      userName={userName}
      preschoolName={preschoolName}
      unreadCount={unreadCount}
      hasOrganization={hasOrganization}
    >
      <div className="container" style={{ maxWidth: 900, padding: '24px 16px' }}>
        {/* Back Button */}
        <button 
          onClick={() => router.back()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--primary)',
            cursor: 'pointer',
            marginBottom: 16,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={18} />
          Back to Lessons
        </button>

        {/* Lesson Header */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <BookOpen size={32} color="white" />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                {lesson.title}
              </h1>
              <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
                {lesson.description || parsedContent?.overview || 'Engaging learning activity for your child'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: '#dbeafe',
                  color: '#2563eb',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {lesson.subject}
                </span>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: '#fef3c7',
                  color: '#d97706',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <Clock size={12} />
                  {lesson.duration_minutes || 30} min
                </span>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: '#f3e8ff',
                  color: '#7c3aed',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {lesson.age_group || 'Preschool'}
                </span>
                {lesson.is_ai_generated && (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    background: 'linear-gradient(135deg, #00f5ff20, #8b5cf620)',
                    color: '#00d4ff',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    ✨ AI Enhanced
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Learning Objectives */}
        {objectives.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Target size={20} color="#10b981" />
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Learning Objectives</h2>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {objectives.map((objective, index) => (
                <li key={index} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: index < objectives.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <CheckCircle size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ color: 'var(--foreground)' }}>{objective}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Activities / Lesson Flow */}
        {parsedContent?.lesson_flow && parsedContent.lesson_flow.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Play size={20} color="#3b82f6" />
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Lesson Activities</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {parsedContent.lesson_flow.map((phase, index) => (
                <div key={index} style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#3b82f6',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 600,
                    }}>
                      {index + 1}
                    </div>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>
                        {phase.title}
                      </h3>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {phase.phase} • {phase.duration}
                      </span>
                    </div>
                  </div>
                  {(phase.instructions || phase.teacher_script) && (
                    <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
                      {phase.instructions || phase.teacher_script}
                    </p>
                  )}
                  {phase.activities && phase.activities.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {phase.activities.map((activity: any, actIdx: number) => (
                        <div key={actIdx} style={{
                          padding: '8px 12px',
                          marginTop: 8,
                          background: '#f0fdf4',
                          borderRadius: 8,
                          fontSize: 13,
                        }}>
                          <strong>{activity.name || activity.vowel || activity.color || `Activity ${actIdx + 1}`}</strong>
                          {activity.action || activity.description ? `: ${activity.action || activity.description}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Activities */}
        {parsedContent?.interactive_activities && parsedContent.interactive_activities.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Star size={20} color="#f59e0b" />
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Interactive Activities</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
              {parsedContent.interactive_activities.map((activity, index) => (
                <div key={index} style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #fef3c720, #fbbf2410)',
                  border: '1px solid #fbbf24',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Lightbulb size={16} color="#f59e0b" />
                    <span style={{ fontWeight: 600 }}>{activity.name}</span>
                  </div>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#fef3c7',
                    color: '#d97706',
                    fontSize: 11,
                    fontWeight: 500,
                    marginBottom: 8,
                  }}>
                    {activity.type}
                  </span>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {activity.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Materials Needed */}
        {materials.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Layers size={20} color="#8b5cf6" />
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Materials Needed</h2>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {materials.map((material, index) => (
                <span key={index} style={{
                  padding: '8px 16px',
                  borderRadius: 20,
                  background: '#f3e8ff',
                  color: '#7c3aed',
                  fontSize: 13,
                }}>
                  {material}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Differentiation */}
        {parsedContent?.differentiation && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Users size={20} color="#ec4899" />
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Support & Extensions</h2>
            </div>
            {typeof parsedContent.differentiation === 'string' ? (
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                {parsedContent.differentiation}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {parsedContent.differentiation.support && (
                  <div style={{
                    padding: 12,
                    borderRadius: 8,
                    background: '#dcfce7',
                    borderLeft: '4px solid #22c55e',
                  }}>
                    <strong style={{ color: '#166534' }}>Support:</strong>
                    <span style={{ color: '#166534', marginLeft: 8 }}>{parsedContent.differentiation.support}</span>
                  </div>
                )}
                {parsedContent.differentiation.extension && (
                  <div style={{
                    padding: 12,
                    borderRadius: 8,
                    background: '#dbeafe',
                    borderLeft: '4px solid #3b82f6',
                  }}>
                    <strong style={{ color: '#1e40af' }}>Extension:</strong>
                    <span style={{ color: '#1e40af', marginLeft: 8 }}>{parsedContent.differentiation.extension}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ParentShell>
  );
}

export default function ParentLessonViewPage() {
  return (
    <Suspense
      fallback={
        <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <ParentLessonViewContent />
    </Suspense>
  );
}
